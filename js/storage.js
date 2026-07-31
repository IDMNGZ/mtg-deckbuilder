// Persistence layer: everything lives in localStorage, namespaced so it never
// collides with anything else on the same origin (e.g. GitHub Pages user site).
//
// Profiles: owned cards, decks, and view preferences all live under a per-profile namespace
// (NS + "profile:" + profileId + ":" + key) so separate people sharing one browser/device
// (see the Data tab's "Switch Profiles") each get their own independent collection. The
// Dropbox connection is deliberately NOT per-profile - it's one shared connection for the
// whole device, backing up every local profile together, so connecting once covers
// everyone instead of each person needing to log into their own Dropbox separately. The
// Scryfall response caches (sets/cards/prints) aren't per-profile either, for the same
// "not actually user data" reason - they're just cached copies of public card data,
// identical no matter who's using the app.
var Storage = (function () {
  "use strict";

  var NS = "mtg-deckbuilder:v1:";
  var KEY_PROFILES = NS + "profiles"; // [{ id, name, createdAt }]
  var KEY_ACTIVE_PROFILE = NS + "activeProfile"; // profile id (plain string, not JSON)
  // Which profile absorbed this device's pre-profile flat data, if any - set once by
  // migrateLegacyDataIfNeeded() and used by repairStuckLegacyDataIfNeeded() so repair still
  // targets the right profile even if the user has since switched to a different one
  // (repair used to just assume "whichever profile is active right now," which stops being
  // true the moment someone switches away from the profile that was active at the time).
  var KEY_LEGACY_PROFILE_ID = NS + "legacyProfileId";
  var KEY_DROPBOX_AUTH = NS + "dropboxAuth"; // shared across all profiles on this device
  var KEY_LAST_SYNCED_AT = NS + "lastSyncedAt";
  var KEY_SETS_CACHE = NS + "cache:sets";
  // Bumped to "cards2" when the fetch mode changed from unique=prints to unique=cards
  // (dedupes reprints within a set), then to "cards3" when normalizeCard started keeping
  // each card's format legalities (needed for the Deck Builder's format rules) - both prefix
  // bumps force a fresh fetch instead of serving stale data missing the new shape.
  var KEY_CARDS_CACHE_PREFIX = NS + "cache:cards3:";
  // Bumped to "prints2" when the lookup switched from the card's own (sometimes-missing)
  // prints_search_uri field to a name-based query, then to "prints3" alongside the cards3
  // bump above for the same legalities reason.
  var KEY_PRINTS_CACHE_PREFIX = NS + "cache:prints3:";

  // Fired whenever owned cards or decks are mutated (not on cache/setting writes), so a
  // sync module can listen without every UI module needing to know sync exists.
  function dispatchDataChanged() {
    document.dispatchEvent(new CustomEvent("mtg:data-changed"));
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.error("Storage: failed to read", key, err);
      return fallback;
    }
  }

  // Removes every cached Scryfall response (sets list + per-set card lists + per-name
  // prints lookups) - all disposable/regenerable from the API on demand, unlike owned
  // cards/decks/profiles. Exists specifically as an escape hatch for quota exhaustion (see
  // writeJSON below): with no eviction policy, every set a user has ever browsed stays
  // cached forever, and a large collection browsing many sets can eventually consume the
  // entire ~5-10MB per-origin localStorage quota, at which point EVERY subsequent write -
  // including sync merges - silently fails.
  // Matches "cache:sets", "cache:cards" alone, or any versioned generation of it
  // ("cache:cards2:", "cache:cards3:", ...) - NOT just the CURRENT KEY_CARDS_CACHE_PREFIX/
  // KEY_PRINTS_CACHE_PREFIX constant. Found the hard way: this cache's format has been
  // version-bumped before ("cards2" -> "cards3", "prints2" -> "prints3", see those
  // constants' own comments) specifically to force a fresh fetch instead of serving data in
  // the old shape - but bumping the prefix means the OLD prefix's entries become
  // permanently invisible to every function that only ever looks for the current one.
  // They're never read (nothing asks for "cards2" anymore), never overwritten (all new
  // writes go to "cards3"), and - until this matched the general pattern instead of the
  // exact current string - never cleaned up either: dead weight sitting in quota forever.
  // That's exactly what happened here - hundreds of orphaned "cards2"/"prints2" entries
  // were the actual majority of a user's quota exhaustion, completely invisible to a
  // same-day fix that (correctly, as far as it went) only checked for "cards3"/"prints3".
  function clearAllCaches() {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.indexOf(NS + "cache:") === 0) toRemove.push(key);
    }
    toRemove.forEach(function (key) { localStorage.removeItem(key); });
    return toRemove.length;
  }

  // A failed write here isn't safe to just log and move on from the way a failed read is -
  // callers that persist sync-critical data (owned cards, decks, profiles) need to actually
  // know it didn't happen, or they'll proceed as if a merge succeeded when the merged
  // result was never saved (exactly what caused a stale local copy to silently overwrite a
  // newer remote one during sync). QuotaExceededError specifically gets one automatic retry
  // after clearing the disposable card-data cache, since that's very often the entire
  // reason the quota filled up in the first place and clearing it can free megabytes
  // instantly; any other failure (or a retry that still doesn't fit) is left for the caller
  // to handle via the return value.
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (err && err.name === "QuotaExceededError") {
        var cleared = clearAllCaches();
        if (cleared > 0) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            console.warn("Storage: quota exceeded writing " + key + " - cleared " + cleared + " cached card-data entries and retried successfully.");
            return true;
          } catch (retryErr) {
            console.error("Storage: still over quota writing", key, "even after clearing the card-data cache.", retryErr);
            return false;
          }
        }
      }
      console.error("Storage: failed to write", key, err);
      return false;
    }
  }

  // ---- Profiles ----

  function makeProfileId() {
    return "profile_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // Every per-profile piece of user data this app has ever stored under a flat (pre-profile)
  // key - moving these under a profile namespace is exactly what one-time migration and
  // deleteProfile() both need the list for. Dropbox auth/lastSyncedAt are deliberately NOT
  // in this list - they're shared across every profile on this device (see the module
  // comment above), not per-profile.
  var PROFILE_DATA_KEYS = [
    "owned", "decks", "lastBrowseSet", "mergeByName", "cardGridSize", "ownedRemoved", "decksRemoved",
  ];
  // Tombstones only need to outlive the slowest device that hasn't synced in a while - kept
  // well past that (6 months) rather than tuned tight, since the failure mode of pruning too
  // early (a removal silently un-does itself again) is exactly the bug this exists to fix.
  var TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

  // Runs once: if this browser has real data sitting under the old flat (pre-profile) keys,
  // move it into a new default profile instead of leaving it orphaned/inaccessible. A
  // brand-new install has nothing under those keys, so this is a no-op there.
  //
  // Deliberately paranoid: a single key failing to copy (e.g. localStorage's ~5-10MB quota
  // getting hit mid-migration on a large collection) must not (a) lose that key's original
  // data or (b) leave KEY_PROFILES unwritten/empty, since every single read/write in this
  // module resolves an active profile first - an empty profiles list previously crashed
  // that resolution, which took down whichever tab happened to be showing with it (the
  // page's own markup rendered fine since that's static HTML, but the tab content itself
  // never did). Each key is migrated independently and only ever removed from its old
  // location after a successful copy, and a valid profiles list is guaranteed to exist by
  // the end no matter what.
  function migrateLegacyDataIfNeeded() {
    var existing = readJSON(KEY_PROFILES, null);
    if (existing && existing.length > 0) return; // already migrated (or already multi-profile)

    // A random id here (not a fixed "default") matters once Dropbox is in the picture: two
    // separate devices each running their OWN local migration independently (e.g. a phone
    // used for early testing, before sync existed, alongside a desktop with the real
    // collection) would otherwise both mint a profile with the exact same id - and
    // DropboxSync's profile merge matches by id, so it would treat those two unrelated
    // profiles as "the same one" and blend their contents together.
    var profile = { id: makeProfileId(), name: "Player 1", createdAt: new Date().toISOString() };
    var hadLegacyData = false;
    PROFILE_DATA_KEYS.forEach(function (base) {
      var legacyKey = NS + base;
      try {
        var raw = localStorage.getItem(legacyKey);
        if (raw !== null) {
          hadLegacyData = true;
          localStorage.setItem(profileKey(profile.id, base), raw);
          localStorage.removeItem(legacyKey);
        }
      } catch (err) {
        // Leave this one key under its legacy location rather than lose it - the
        // activeKey() read-through fallback below still finds it there.
        console.error("Storage: couldn't migrate '" + base + "' to the new profile format", err);
      }
    });
    writeJSON(KEY_PROFILES, [profile]);
    localStorage.setItem(KEY_ACTIVE_PROFILE, profile.id);
    localStorage.setItem(KEY_LEGACY_PROFILE_ID, profile.id);
    return hadLegacyData;
  }

  // Corrective step for anyone who loaded a short-lived earlier version of this feature
  // that put dropboxAuth/lastSyncedAt under each profile - consolidates whichever profile
  // still has a connection back to the shared global key (preferring the active profile's,
  // since that's the one most likely to be the one actually in use), then cleans up every
  // profile-scoped copy so there's exactly one connection going forward. A no-op for
  // everyone else (nothing to find at those old locations).
  function consolidateDropboxAuthToGlobal() {
    if (localStorage.getItem(KEY_DROPBOX_AUTH) !== null) return;
    var profiles = getProfiles();
    var activeId = getActiveProfileId();
    var orderedIds = [activeId].concat(profiles.map(function (p) { return p.id; }).filter(function (id) { return id !== activeId; }));
    for (var i = 0; i < orderedIds.length; i++) {
      var authRaw = localStorage.getItem(profileKey(orderedIds[i], "dropboxAuth"));
      if (authRaw !== null) {
        localStorage.setItem(KEY_DROPBOX_AUTH, authRaw);
        var syncedRaw = localStorage.getItem(profileKey(orderedIds[i], "lastSyncedAt"));
        if (syncedRaw !== null) localStorage.setItem(KEY_LAST_SYNCED_AT, syncedRaw);
        break;
      }
    }
    profiles.forEach(function (p) {
      localStorage.removeItem(profileKey(p.id, "dropboxAuth"));
      localStorage.removeItem(profileKey(p.id, "lastSyncedAt"));
    });
  }

  // Finishes any per-key migration that didn't complete the first time (see
  // migrateLegacyDataIfNeeded's per-key try/catch) by actually moving the data into the
  // active profile's namespaced location, instead of leaving it for readActiveJSON's
  // read-through fallback to paper over. That fallback only covers getOwnedMap/getDecks/
  // etc. (the "read whatever the active profile has" getters) - it does NOT cover
  // getProfileStats() or getAllProfilesData(), which read a profile's namespaced key
  // directly (they have to, since they're used for profiles that AREN'T necessarily
  // active). Left unrepaired, a profile's real data could show correctly in the app itself
  // while reading back as empty in the Data tab's profile list AND in what actually gets
  // uploaded to Dropbox - exactly what happened here: a push built from the incomplete
  // getAllProfilesData() read silently overwrote Dropbox with an empty snapshot for an
  // otherwise-correct 447-card collection.
  //
  // owned/decks get a real MERGE, not a "only if the proper key is completely unset" move
  // - a previous sync cycle (mergeAllProfilesData, running before this repair existed)
  // could easily have already written an EMPTY-but-present {}/[] to the profile-scoped key,
  // which a plain presence check treats as "already migrated, nothing to do" and leaves
  // the real data stranded at the legacy key forever. This was the actual bug the first
  // version of this function had: it never even looked at what the legacy data was for
  // the reported 447-card collection, because the profile-scoped "owned" key already
  // existed (as {}), so the presence check short-circuited before comparing content.
  function repairStuckLegacyDataIfNeeded() {
    // Falls back to whichever profile is active if the marker isn't set - true for any
    // device that already migrated before this marker existed (this device's original
    // profile IS the one that needs repairing, and it's also the currently active one).
    var activeId = localStorage.getItem(KEY_LEGACY_PROFILE_ID) || getActiveProfileId();

    var legacyOwnedRaw = localStorage.getItem(NS + "owned");
    if (legacyOwnedRaw !== null) {
      try {
        var properOwned = readJSON(profileKey(activeId, "owned"), {});
        var legacyOwned = JSON.parse(legacyOwnedRaw);
        Object.keys(legacyOwned).forEach(function (id) {
          if (!(id in properOwned)) properOwned[id] = legacyOwned[id];
        });
        writeJSON(profileKey(activeId, "owned"), properOwned);
        localStorage.removeItem(NS + "owned");
      } catch (err) {
        console.error("Storage: couldn't repair 'owned' into the profile format", err);
      }
    }

    var legacyDecksRaw = localStorage.getItem(NS + "decks");
    if (legacyDecksRaw !== null) {
      try {
        var properDecks = readJSON(profileKey(activeId, "decks"), []);
        var legacyDecks = JSON.parse(legacyDecksRaw);
        var byId = {};
        properDecks.forEach(function (d) { byId[d.id] = d; });
        legacyDecks.forEach(function (incoming) {
          var existing = byId[incoming.id];
          if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
            byId[incoming.id] = incoming;
          }
        });
        writeJSON(profileKey(activeId, "decks"), Object.keys(byId).map(function (id) { return byId[id]; }));
        localStorage.removeItem(NS + "decks");
      } catch (err) {
        console.error("Storage: couldn't repair 'decks' into the profile format", err);
      }
    }

    // Lower-stakes view preferences: a plain presence check is fine here - losing a stray
    // "merge dupes" toggle or card-grid-size preference isn't the kind of thing that
    // silently erases a collection.
    ["lastBrowseSet", "mergeByName", "cardGridSize"].forEach(function (base) {
      var properKey = profileKey(activeId, base);
      var legacyKey = NS + base;
      if (localStorage.getItem(properKey) !== null) return;
      var raw = localStorage.getItem(legacyKey);
      if (raw === null) return;
      try {
        localStorage.setItem(properKey, raw);
        localStorage.removeItem(legacyKey);
      } catch (err) {
        console.error("Storage: couldn't repair '" + base + "' into the profile format", err);
      }
    });
  }

  function profileKey(profileId, base) {
    return NS + "profile:" + profileId + ":" + base;
  }

  function getProfiles() {
    var profiles = readJSON(KEY_PROFILES, []);
    if (profiles.length > 0) return profiles;
    // Should be unreachable (migration above always leaves at least one profile behind,
    // even on partial failure) - self-heals instead of leaving every profile-scoped read/
    // write with nothing to resolve to.
    var fallback = [{ id: makeProfileId(), name: "Player 1", createdAt: new Date().toISOString() }];
    writeJSON(KEY_PROFILES, fallback);
    if (!localStorage.getItem(KEY_ACTIVE_PROFILE)) {
      try { localStorage.setItem(KEY_ACTIVE_PROFILE, fallback[0].id); } catch (err) { console.error("Storage: failed to write", KEY_ACTIVE_PROFILE, err); }
    }
    return fallback;
  }

  function getActiveProfileId() {
    var id = localStorage.getItem(KEY_ACTIVE_PROFILE);
    var profiles = getProfiles(); // never empty - see getProfiles()'s self-heal
    if (id && profiles.some(function (p) { return p.id === id; })) return id;
    return profiles[0].id;
  }

  function getActiveProfile() {
    var id = getActiveProfileId();
    return getProfiles().filter(function (p) { return p.id === id; })[0];
  }

  function setActiveProfileId(id) {
    localStorage.setItem(KEY_ACTIVE_PROFILE, id);
  }

  // Card/deck counts for a profile WITHOUT switching to it - lets the Data tab's profile
  // list show every profile's size at once.
  function getProfileStats(id) {
    var owned = readJSON(profileKey(id, "owned"), {});
    var decks = readJSON(profileKey(id, "decks"), []);
    return { owned: Object.keys(owned).length, decks: decks.length };
  }

  function createProfile(name) {
    var profile = { id: makeProfileId(), name: name, createdAt: new Date().toISOString() };
    var profiles = getProfiles();
    profiles.push(profile);
    writeJSON(KEY_PROFILES, profiles);
    return profile;
  }

  function renameProfile(id, name) {
    var profiles = getProfiles();
    profiles.forEach(function (p) { if (p.id === id) p.name = name; });
    writeJSON(KEY_PROFILES, profiles);
  }

  // Removes the profile from the list and deletes all of its namespaced data. Refuses to
  // delete the last remaining profile - there must always be at least one to be "active."
  // If the deleted profile was the active one, switches active to whichever profile is
  // first afterward (caller is still responsible for reloading/re-rendering the app so
  // every module picks up the new active profile's data).
  function deleteProfile(id) {
    var profiles = getProfiles();
    if (profiles.length <= 1) throw new Error("Can't delete the only profile.");
    PROFILE_DATA_KEYS.forEach(function (base) { localStorage.removeItem(profileKey(id, base)); });
    profiles = profiles.filter(function (p) { return p.id !== id; });
    writeJSON(KEY_PROFILES, profiles);
    if (getActiveProfileId() === id || localStorage.getItem(KEY_ACTIVE_PROFILE) === id) {
      setActiveProfileId(profiles[0].id);
    }
  }

  // ---- Every profile's data together (for DropboxSync - one connection backs up every
  // local profile, not just whichever one happens to be active) ----

  function getAllProfilesData() {
    return getProfiles().map(function (p) {
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        ownedCards: readJSON(profileKey(p.id, "owned"), {}),
        decks: readJSON(profileKey(p.id, "decks"), []),
        // Tombstones ride along in the same payload so a removal made on THIS device also
        // sticks on every other device sharing the account, not just locally.
        ownedRemoved: readJSON(profileKey(p.id, "ownedRemoved"), {}),
        decksRemoved: readJSON(profileKey(p.id, "decksRemoved"), {}),
      };
    });
  }

  function pruneOldTombstones(map) {
    var cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
    var pruned = {};
    Object.keys(map).forEach(function (id) {
      if (new Date(map[id]).getTime() >= cutoff) pruned[id] = map[id];
    });
    return pruned;
  }

  // Merges a remote snapshot of every profile back in: a profile that doesn't exist locally
  // yet (created on another device sharing this same Dropbox account) is added; for a
  // profile that already exists here, owned cards union (remote wins on a shared id) and
  // decks match by id with the more-recently-updated copy winning - same semantics as
  // importData's merge mode, just applied per-profile instead of to whichever one is active.
  //
  // Tombstones (see getOwnedRemovedMap/getDecksRemovedMap) are checked before letting a
  // remote id back in: without them, "never delete" union logic can't tell "hasn't synced
  // yet" apart from "deliberately removed," so a card unchecked in Browse (or a deck
  // deleted in My Decks) would reappear the instant the next pull ran, since the remote
  // snapshot still has it - exactly the "uncheck it and it immediately comes back" bug this
  // closes. Owned cards don't carry their own per-card timestamp, so that comparison uses
  // the whole payload's syncedAt as an approximation; decks already have their own
  // updatedAt, which is used directly for a more precise comparison. Either comparison is
  // still vulnerable to clock skew between devices in principle (same class of issue fixed
  // elsewhere in pull() by not gating on cross-device timestamps at all) - but unlike that
  // gate, this only affects the one id actually in conflict, and doing an imperfect
  // comparison here is still a large improvement over never respecting removals at all.
  function mergeAllProfilesData(remoteProfiles) {
    if (!Array.isArray(remoteProfiles)) return;
    var profiles = getProfiles();
    var byId = {};
    profiles.forEach(function (p) { byId[p.id] = p; });
    // A write failing here (even after writeJSON's own auto-clear-cache retry) is not safe
    // to just log and continue past - DropboxSync.uploadSnapshot reads this same data right
    // back out of storage immediately afterward to build what it uploads, so a silently
    // dropped write here means the "merged" result never actually existed anywhere except
    // briefly in memory, and the upload instead re-sends whatever was already here before -
    // stale local data silently overwriting a newer remote file. Throwing surfaces this as
    // a real sync error instead.
    var failedKeys = [];

    remoteProfiles.forEach(function (remote) {
      if (!byId[remote.id]) {
        var newProfile = { id: remote.id, name: remote.name, createdAt: remote.createdAt || new Date().toISOString() };
        profiles.push(newProfile);
        byId[remote.id] = newProfile;
      }

      // Tombstones themselves merge first (union, newer removedAt wins if both sides have
      // one for the same id) so a removal recorded on either device is what decides whether
      // the corresponding owned/deck entry below gets let back in.
      var localOwnedRemoved = readJSON(profileKey(remote.id, "ownedRemoved"), {});
      Object.keys(remote.ownedRemoved || {}).forEach(function (id) {
        if (!localOwnedRemoved[id] || remote.ownedRemoved[id] > localOwnedRemoved[id]) {
          localOwnedRemoved[id] = remote.ownedRemoved[id];
        }
      });

      var localOwned = readJSON(profileKey(remote.id, "owned"), {});
      Object.keys(remote.ownedCards || {}).forEach(function (id) {
        var tombstonedAt = localOwnedRemoved[id];
        if (tombstonedAt && tombstonedAt >= (remote.syncedAt || "")) return; // removal is newer than (or as new as) this remote snapshot - don't resurrect it
        localOwned[id] = remote.ownedCards[id];
        delete localOwnedRemoved[id]; // remote is newer than our tombstone - it wins (re-added elsewhere after we removed it here)
      });
      localOwnedRemoved = pruneOldTombstones(localOwnedRemoved);
      if (!writeJSON(profileKey(remote.id, "owned"), localOwned)) failedKeys.push(profileKey(remote.id, "owned"));
      if (!writeJSON(profileKey(remote.id, "ownedRemoved"), localOwnedRemoved)) failedKeys.push(profileKey(remote.id, "ownedRemoved"));

      var localDecksRemoved = readJSON(profileKey(remote.id, "decksRemoved"), {});
      Object.keys(remote.decksRemoved || {}).forEach(function (id) {
        if (!localDecksRemoved[id] || remote.decksRemoved[id] > localDecksRemoved[id]) {
          localDecksRemoved[id] = remote.decksRemoved[id];
        }
      });

      var localDecksById = {};
      readJSON(profileKey(remote.id, "decks"), []).forEach(function (d) { localDecksById[d.id] = d; });
      (remote.decks || []).forEach(function (incoming) {
        var tombstonedAt = localDecksRemoved[incoming.id];
        if (tombstonedAt && tombstonedAt >= (incoming.updatedAt || "")) return; // deleted after this copy was last saved - don't resurrect it
        var existing = localDecksById[incoming.id];
        if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
          localDecksById[incoming.id] = incoming;
          delete localDecksRemoved[incoming.id];
        }
      });
      localDecksRemoved = pruneOldTombstones(localDecksRemoved);
      if (!writeJSON(profileKey(remote.id, "decks"), Object.keys(localDecksById).map(function (id) { return localDecksById[id]; }))) {
        failedKeys.push(profileKey(remote.id, "decks"));
      }
      if (!writeJSON(profileKey(remote.id, "decksRemoved"), localDecksRemoved)) failedKeys.push(profileKey(remote.id, "decksRemoved"));
    });

    if (!writeJSON(KEY_PROFILES, profiles)) failedKeys.push(KEY_PROFILES);

    if (failedKeys.length > 0) {
      throw new Error("Couldn't save merged data (storage is full: " + failedKeys.join(", ") + "). Try \"Clear Card Data Cache\" in the Data tab to free up space, then sync again.");
    }
  }

  // Every per-profile getter/setter below reads/writes under the CURRENTLY ACTIVE profile -
  // switching profiles (Storage.setActiveProfileId + a full page reload, see the Data tab)
  // is what makes them transparently point at a different person's data.
  function activeKey(base) {
    return profileKey(getActiveProfileId(), base);
  }

  // Reads a per-profile value, falling back to the pre-profile flat key if the migrated
  // key is missing - only the one profile this device's own migration originally created
  // could ever have leftover legacy data (a newly created profile never had any), and only
  // for a key repairStuckLegacyDataIfNeeded() hasn't caught up to yet. Without this, a key
  // stuck at its legacy location would silently read back as empty, looking exactly like
  // data loss even though nothing was actually deleted.
  function readActiveJSON(base, fallback) {
    var key = activeKey(base);
    if (localStorage.getItem(key) !== null) return readJSON(key, fallback);
    // No hardcoded id check here on purpose - only the one profile a device's own
    // migration created could ever have data stuck at the old flat location, and checking
    // unconditionally is harmless for any other profile (there'd just be nothing there).
    if (localStorage.getItem(NS + base) !== null) return readJSON(NS + base, fallback);
    return fallback;
  }

  // ---- Owned cards (keyed by Scryfall print id) ----

  // Values are denormalized card snapshots (not just `true`) so the Collection
  // and Deck Builder views work even if a set's card cache has expired or been
  // cleared, and so an exported backup is self-contained.
  function getOwnedMap() {
    return readActiveJSON("owned", {});
  }

  // Tombstones (id -> when it was removed) exist so an intentional removal survives the
  // next sync merge instead of being silently undone by it. mergeAllProfilesData's "never
  // delete" union (deliberately additive, so a stale/racing sync can't destroy real data -
  // see its own comment) has no way to tell "never synced yet" apart from "deliberately
  // removed" without one: every id present on the remote just gets re-added on the next
  // pull, including ones removed moments ago locally - a card unchecked in Browse would
  // reappear the instant the debounced auto-push's own pull-before-upload ran.
  function getOwnedRemovedMap() {
    return readActiveJSON("ownedRemoved", {});
  }

  function isOwned(scryfallId) {
    var owned = getOwnedMap();
    return !!owned[scryfallId];
  }

  function setOwned(card, owned) {
    var map = getOwnedMap();
    var removed = getOwnedRemovedMap();
    if (owned) {
      map[card.id] = card;
      delete removed[card.id]; // re-adding supersedes any earlier removal
    } else {
      delete map[card.id];
      removed[card.id] = new Date().toISOString();
    }
    writeJSON(activeKey("owned"), map);
    writeJSON(activeKey("ownedRemoved"), removed);
    dispatchDataChanged();
  }

  function getOwnedIds() {
    return Object.keys(getOwnedMap());
  }

  function getOwnedCards() {
    var map = getOwnedMap();
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  // Overwrites stored card snapshots (owned cards + every deck's cards) with fresher data
  // for whichever ids are present in freshMap - keeps images/text/rarity current and heals
  // snapshots captured before an app data-shape change, without touching what's NOT owned
  // or which decks a card is in.
  function refreshCardData(freshMap) {
    var updated = 0;

    var owned = getOwnedMap();
    Object.keys(owned).forEach(function (id) {
      if (freshMap[id]) { owned[id] = freshMap[id]; updated++; }
    });
    writeJSON(activeKey("owned"), owned);

    var decks = getDecks();
    decks.forEach(function (deck) {
      deck.cards.forEach(function (entry) {
        if (freshMap[entry.card.id]) { entry.card = freshMap[entry.card.id]; updated++; }
      });
    });
    writeJSON(activeKey("decks"), decks);

    return updated;
  }

  // ---- Decks ----

  function getDecks() {
    return readActiveJSON("decks", []);
  }

  // Same tombstone reasoning as getOwnedRemovedMap above, applied to decks - keyed by deck
  // id, compared against a deleted deck's own last updatedAt (decks already carry one)
  // rather than the whole sync payload's timestamp, since that's the more precise signal.
  function getDecksRemovedMap() {
    return readActiveJSON("decksRemoved", {});
  }

  function getDeck(deckId) {
    var decks = getDecks();
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === deckId) return decks[i];
    }
    return null;
  }

  function saveDeck(deck) {
    var decks = getDecks();
    var idx = -1;
    for (var i = 0; i < decks.length; i++) {
      if (decks[i].id === deck.id) { idx = i; break; }
    }
    deck.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      decks[idx] = deck;
    } else {
      deck.createdAt = deck.createdAt || deck.updatedAt;
      decks.push(deck);
    }
    writeJSON(activeKey("decks"), decks);
    // Clears any tombstone for this id (mirrors setOwned re-adding) - covers the edge case
    // of a deck being recreated/restored under an id that was previously deleted here.
    var removedOnSave = getDecksRemovedMap();
    if (removedOnSave[deck.id]) {
      delete removedOnSave[deck.id];
      writeJSON(activeKey("decksRemoved"), removedOnSave);
    }
    dispatchDataChanged();
    return deck;
  }

  function deleteDeck(deckId) {
    var decks = getDecks().filter(function (d) { return d.id !== deckId; });
    writeJSON(activeKey("decks"), decks);
    var removed = getDecksRemovedMap();
    removed[deckId] = new Date().toISOString();
    writeJSON(activeKey("decksRemoved"), removed);
    dispatchDataChanged();
  }

  function makeDeckId() {
    return "deck_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---- Selected edition(s) in Browse (so it reopens with the same selection) ----
  // Stored as an array of set codes so multiple editions can be viewed at once;
  // transparently migrates the older single-string format from before that existed.

  function getSelectedBrowseSets() {
    var val = readActiveJSON("lastBrowseSet", []);
    if (typeof val === "string") return val ? [val] : [];
    return Array.isArray(val) ? val : [];
  }

  function setSelectedBrowseSets(setCodes) {
    writeJSON(activeKey("lastBrowseSet"), setCodes || []);
  }

  // ---- "Merge duplicate printings by name" toggle (Collection + Deck Builder pool) ----

  // Defaults to true - most collections have the same card across several printings,
  // and the merged view is what people expect to see first (per-printing tracking is
  // still one click away via the modal's version cycler). A profile that's explicitly
  // turned this off keeps that choice (readActiveJSON only falls back to this default
  // when nothing's been stored yet).
  function getMergeByName() {
    return readActiveJSON("mergeByName", true);
  }

  function setMergeByName(value) {
    writeJSON(activeKey("mergeByName"), !!value);
  }

  // ---- Card grid zoom (Browse/Collection/Deck Builder pool tile size) ----
  // null means "no preference yet" - the CSS media-query defaults apply untouched until
  // the user actually moves the slider, at which point their choice sticks everywhere.

  function getCardGridSize() {
    return readActiveJSON("cardGridSize", null);
  }

  function setCardGridSize(px) {
    if (px == null) {
      localStorage.removeItem(activeKey("cardGridSize"));
    } else {
      writeJSON(activeKey("cardGridSize"), px);
    }
  }

  // ---- Dropbox sync connection (optional; app works fully local without it) ----
  // One shared connection for the whole device, not per-profile - every local profile syncs
  // through it together (see mergeAllProfilesData/getAllProfilesData below), so connecting
  // once covers everyone sharing this device instead of each person needing their own login.

  function getDropboxAuth() {
    return readJSON(KEY_DROPBOX_AUTH, null); // { accessToken, refreshToken, expiresAt, accountEmail }
  }

  function setDropboxAuth(auth) {
    writeJSON(KEY_DROPBOX_AUTH, auth);
  }

  function clearDropboxAuth() {
    localStorage.removeItem(KEY_DROPBOX_AUTH);
  }

  function getLastSyncedAt() {
    return readJSON(KEY_LAST_SYNCED_AT, null);
  }

  function setLastSyncedAt(isoString) {
    writeJSON(KEY_LAST_SYNCED_AT, isoString);
  }

  // ---- Scryfall response caches (shared across profiles, safe to clear) ----

  // Reactively clearing everything once a write already fails (see writeJSON/
  // clearAllCaches above) turned out not to be enough on its own: Browse loads several
  // sets in parallel (Promise.all), so multiple writes can each hit quota within
  // milliseconds of each other, and normal browsing over time had already grown this
  // cache to 9+MB - most of localStorage's real ~5-10MB per-origin cap, which has nothing
  // to do with the much larger quota the browser reports for IndexedDB/Cache Storage.
  // This keeps it under a fixed byte budget proactively, evicting the least-recently-
  // written entries (each already carries its own timestamp) before every write, so normal
  // browsing never gets anywhere near the quota instead of only reacting once it's hit.
  var CARDS_CACHE_BUDGET_BYTES = 3 * 1024 * 1024;
  var PRINTS_CACHE_BUDGET_BYTES = 1 * 1024 * 1024;

  function evictCacheUnderBudget(prefix, maxBytes) {
    var entries = [];
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.indexOf(prefix) === 0) {
        var value = localStorage.getItem(key) || "";
        total += key.length + value.length;
        var timestamp = 0;
        try { timestamp = JSON.parse(value).timestamp || 0; } catch (e) { /* treat as oldest */ }
        entries.push({ key: key, size: key.length + value.length, timestamp: timestamp });
      }
    }
    if (total <= maxBytes) return;
    entries.sort(function (a, b) { return a.timestamp - b.timestamp; }); // oldest first
    for (var j = 0; j < entries.length && total > maxBytes; j++) {
      localStorage.removeItem(entries[j].key);
      total -= entries[j].size;
    }
  }

  function getSetsCache() {
    return readJSON(KEY_SETS_CACHE, null); // { timestamp, data }
  }

  function setSetsCache(data) {
    writeJSON(KEY_SETS_CACHE, { timestamp: Date.now(), data: data });
  }

  function getCardsCache(setCode) {
    return readJSON(KEY_CARDS_CACHE_PREFIX + setCode, null); // { timestamp, data }
  }

  function setCardsCache(setCode, data) {
    evictCacheUnderBudget(KEY_CARDS_CACHE_PREFIX, CARDS_CACHE_BUDGET_BYTES);
    writeJSON(KEY_CARDS_CACHE_PREFIX + setCode, { timestamp: Date.now(), data: data });
  }

  function getPrintsCache(cardName) {
    return readJSON(KEY_PRINTS_CACHE_PREFIX + cardName, null); // { timestamp, data }
  }

  function setPrintsCache(cardName, data) {
    evictCacheUnderBudget(KEY_PRINTS_CACHE_PREFIX, PRINTS_CACHE_BUDGET_BYTES);
    writeJSON(KEY_PRINTS_CACHE_PREFIX + cardName, { timestamp: Date.now(), data: data });
  }

  // ---- Export / Import (owned cards + decks only, not the bulky card cache) ----
  // Both operate on whichever profile is currently active.

  function exportData() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ownedCards: getOwnedMap(),
      decks: getDecks(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "mtg-deckbuilder-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(jsonText, mode) {
    // mode: "merge" (default) or "replace"
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error("That file isn't valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || !parsed.ownedCards || !parsed.decks) {
      throw new Error("That file doesn't look like a mtg-deckbuilder backup.");
    }

    if (mode === "replace") {
      writeJSON(activeKey("owned"), parsed.ownedCards);
      writeJSON(activeKey("decks"), parsed.decks);
      return { owned: Object.keys(parsed.ownedCards).length, decks: parsed.decks.length };
    }

    // merge: union owned cards (incoming wins on a shared id - just an ownership flag, low
    // stakes either way), decks matched by id with the more-recently-updated copy winning
    // (never silently dropped) - this is what makes it safe for DropboxSync.pull() to call
    // unconditionally instead of needing its own now-or-never timestamp gate.
    var owned = getOwnedMap();
    Object.keys(parsed.ownedCards).forEach(function (id) { owned[id] = parsed.ownedCards[id]; });
    writeJSON(activeKey("owned"), owned);

    var byId = {};
    getDecks().forEach(function (d) { byId[d.id] = d; });
    parsed.decks.forEach(function (incoming) {
      var existing = byId[incoming.id];
      if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
        byId[incoming.id] = incoming;
      }
    });
    var decks = Object.keys(byId).map(function (id) { return byId[id]; });
    writeJSON(activeKey("decks"), decks);

    return { owned: Object.keys(owned).length, decks: decks.length };
  }

  // ---- Full local reset (this device only - never touches Dropbox itself) ----
  // Wipes every key this app has ever written, including the Dropbox connection and the
  // Scryfall response caches, and starts the next load completely fresh (a brand-new
  // "Player 1" default profile gets created by migrateLegacyDataIfNeeded() finding nothing
  // to migrate). Exists for exactly the situation that motivated it: a device's local data
  // got corrupted or cross-contaminated (e.g. the profile-id collision bug) and the
  // straightforward fix is a clean slate + reconnect Dropbox to pull the good copy back
  // down, rather than fighting the browser's own site-data settings UI to achieve the same
  // thing (which, on iOS Safari in particular, doesn't reliably even list every site).
  function resetThisDevice() {
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf(NS) === 0) localStorage.removeItem(key);
    });
  }

  migrateLegacyDataIfNeeded();
  consolidateDropboxAuthToGlobal();
  repairStuckLegacyDataIfNeeded();
  // Old cache generations (anything under "cache:" that isn't this version's sets/cards3/
  // prints3 keys - see clearAllCaches' comment) are pure dead weight with no code path that
  // will ever read or overwrite them again - remove them outright, every load, regardless
  // of current usage. Unlike the budget eviction below (which trims the CURRENT, still-
  // useful generation only when it's actually over budget), there's no reason to ever keep
  // a byte of a previous generation around.
  (function pruneDeadCacheGenerations() {
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.indexOf(NS + "cache:") !== 0) continue;
      if (key === KEY_SETS_CACHE || key.indexOf(KEY_CARDS_CACHE_PREFIX) === 0 || key.indexOf(KEY_PRINTS_CACHE_PREFIX) === 0) continue;
      toRemove.push(key);
    }
    toRemove.forEach(function (key) { localStorage.removeItem(key); });
  })();
  // Prunes the current generation's cache back under budget if it already grew past it
  // before this cap existed (setCardsCache/setPrintsCache only enforce it going forward, on
  // their own next write) - runs once per load so a device that's already over quota gets
  // relief immediately, not only the next time it happens to browse a new set/card.
  evictCacheUnderBudget(KEY_CARDS_CACHE_PREFIX, CARDS_CACHE_BUDGET_BYTES);
  evictCacheUnderBudget(KEY_PRINTS_CACHE_PREFIX, PRINTS_CACHE_BUDGET_BYTES);

  return {
    isOwned: isOwned,
    setOwned: setOwned,
    getOwnedIds: getOwnedIds,
    getOwnedMap: getOwnedMap,
    getOwnedCards: getOwnedCards,
    refreshCardData: refreshCardData,
    getDecks: getDecks,
    getDeck: getDeck,
    saveDeck: saveDeck,
    deleteDeck: deleteDeck,
    makeDeckId: makeDeckId,
    getSetsCache: getSetsCache,
    setSetsCache: setSetsCache,
    getCardsCache: getCardsCache,
    setCardsCache: setCardsCache,
    getPrintsCache: getPrintsCache,
    setPrintsCache: setPrintsCache,
    clearCardDataCache: clearAllCaches,
    getSelectedBrowseSets: getSelectedBrowseSets,
    setSelectedBrowseSets: setSelectedBrowseSets,
    getMergeByName: getMergeByName,
    setMergeByName: setMergeByName,
    getCardGridSize: getCardGridSize,
    setCardGridSize: setCardGridSize,
    getDropboxAuth: getDropboxAuth,
    setDropboxAuth: setDropboxAuth,
    clearDropboxAuth: clearDropboxAuth,
    getLastSyncedAt: getLastSyncedAt,
    setLastSyncedAt: setLastSyncedAt,
    exportData: exportData,
    importData: importData,
    getProfiles: getProfiles,
    getActiveProfileId: getActiveProfileId,
    getActiveProfile: getActiveProfile,
    setActiveProfileId: setActiveProfileId,
    getProfileStats: getProfileStats,
    createProfile: createProfile,
    renameProfile: renameProfile,
    deleteProfile: deleteProfile,
    getAllProfilesData: getAllProfilesData,
    mergeAllProfilesData: mergeAllProfilesData,
    resetThisDevice: resetThisDevice,
  };
})();
