// Persistence layer: everything lives in localStorage, namespaced so it never collides
// with anything else on the same origin. This is MTG Deck Builder's real storage.js with
// its MTG-specific data (owned cards, decks, Scryfall response caches) replaced by two
// GENERIC EXAMPLE data shapes - keep whichever one(s) match your app's own data, delete the
// other, rename freely. Everything else here (profiles, migration, Dropbox auth, tombstoned
// deletions, quota-safe writes) is the reusable machinery and should NOT need to change.
//
// Profiles: all per-profile data lives under a per-profile namespace
// (NS + "profile:" + profileId + ":" + key) so separate people sharing one browser/device
// (see the System tab's "Switch Profiles") each get their own independent data. The Dropbox
// connection is deliberately NOT per-profile - it's one shared connection for the whole
// device, backing up every local profile together, so connecting once covers everyone
// instead of each person needing to log into their own Dropbox separately.
//
// See docs/SYNC-ARCHITECTURE-HANDOFF.md (same repo as this template came from) for the
// full reasoning behind every design choice here, and every real bug each one fixes.
var Storage = (function () {
  "use strict";

  // RENAME THIS to your own app's namespace before you do anything else - "yourapp" here
  // is a placeholder, not a real value. Bump the "v1" if the *shape* of a key's data ever
  // changes incompatibly later (not just its content).
  var NS = "yourapp:v1:";
  var KEY_PROFILES = NS + "profiles"; // [{ id, name, createdAt }]
  var KEY_ACTIVE_PROFILE = NS + "activeProfile"; // profile id (plain string, not JSON)
  var KEY_LEGACY_PROFILE_ID = NS + "legacyProfileId";
  var KEY_DROPBOX_AUTH = NS + "dropboxAuth"; // shared across all profiles on this device
  var KEY_LAST_SYNCED_AT = NS + "lastSyncedAt";

  function dispatchDataChanged() {
    document.dispatchEvent(new CustomEvent("app:data-changed"));
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

  // If your app ever adds its OWN disposable cache (e.g. cached responses from an external
  // API, the way MTG Deck Builder caches Scryfall data), namespace those keys under
  // NS + "cache:" and they get this same emergency-eviction protection for free via
  // writeJSON's QuotaExceededError retry below, with zero extra wiring. See
  // docs/SYNC-ARCHITECTURE-HANDOFF.md section 3e for the full budget-eviction pattern (a
  // proactive byte budget, not just this reactive "clear everything" fallback) if your
  // cache is going to grow large - this alone is only an emergency backstop.
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
  // callers that persist sync-critical data need to actually know it didn't happen, or
  // they'll proceed as if a merge succeeded when the merged result was never saved.
  // QuotaExceededError gets one automatic retry after clearing any disposable cache (see
  // clearAllCaches above), since that's very often the entire reason quota filled up.
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
            console.warn("Storage: quota exceeded writing " + key + " - cleared " + cleared + " cached entries and retried successfully.");
            return true;
          } catch (retryErr) {
            console.error("Storage: still over quota writing", key, "even after clearing the cache.", retryErr);
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

  // Every per-profile key this app has ever stored under a flat (pre-profile) location -
  // moving these under a profile namespace is exactly what one-time migration and
  // deleteProfile() both need the list for. Dropbox auth/lastSyncedAt are deliberately NOT
  // in this list - shared across every profile on this device (see the module comment
  // above), not per-profile.
  //
  // "items"/"itemsRemoved" demonstrates a KEYED-MAP data shape (id -> denormalized object,
  // e.g. MTG Deck Builder's "owned cards") with its matching tombstone map.
  // "records"/"recordsRemoved" demonstrates an ARRAY-OF-OBJECTS shape with an `updatedAt` on
  // each one (e.g. MTG Deck Builder's "decks") with its matching tombstone map.
  // "viewPref" demonstrates a simple, low-stakes per-profile setting (no tombstone needed -
  // losing a stray UI preference isn't the kind of thing that silently erases real data).
  // Keep whichever shapes your app actually needs, delete the other, add more the same way.
  var PROFILE_DATA_KEYS = [
    "items", "itemsRemoved", "records", "recordsRemoved", "viewPref",
  ];
  // Tombstones only need to outlive the slowest device that hasn't synced in a while - kept
  // well past that (6 months) rather than tuned tight, since pruning too early just
  // reintroduces the "deleted thing comes back" bug this exists to prevent.
  var TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

  // Runs once: if this browser has real data sitting under the old flat (pre-profile) keys,
  // move it into a new default profile instead of leaving it orphaned/inaccessible. A
  // brand-new install has nothing under those keys, so this is a no-op there.
  //
  // Deliberately paranoid: a single key failing to copy (e.g. quota getting hit mid-
  // migration) must not (a) lose that key's original data or (b) leave KEY_PROFILES
  // unwritten/empty, since every read/write in this module resolves an active profile
  // first. Each key is migrated independently and only removed from its old location after
  // a successful copy, and a valid profiles list is guaranteed to exist by the end.
  function migrateLegacyDataIfNeeded() {
    var existing = readJSON(KEY_PROFILES, null);
    if (existing && existing.length > 0) return; // already migrated (or already multi-profile)

    // A random id here (not a fixed "default") matters once Dropbox is in the picture: two
    // separate devices each running their OWN local migration independently would otherwise
    // both mint a profile with the exact same id - and the sync merge below matches
    // profiles by id, so it would treat those two unrelated profiles as "the same one."
    var profile = { id: makeProfileId(), name: "Default", createdAt: new Date().toISOString() };
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
        console.error("Storage: couldn't migrate '" + base + "' to the new profile format", err);
      }
    });
    writeJSON(KEY_PROFILES, [profile]);
    localStorage.setItem(KEY_ACTIVE_PROFILE, profile.id);
    localStorage.setItem(KEY_LEGACY_PROFILE_ID, profile.id);
    return hadLegacyData;
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
    var fallback = [{ id: makeProfileId(), name: "Default", createdAt: new Date().toISOString() }];
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

  // Counts for a profile WITHOUT switching to it - lets the System tab's profile list show
  // every profile's size at once. Adjust the fields read here to match whatever
  // PROFILE_DATA_KEYS you actually kept.
  function getProfileStats(id) {
    var items = readJSON(profileKey(id, "items"), {});
    var records = readJSON(profileKey(id, "records"), []);
    return { items: Object.keys(items).length, records: records.length };
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
        items: readJSON(profileKey(p.id, "items"), {}),
        records: readJSON(profileKey(p.id, "records"), []),
        // Tombstones ride along in the same payload so a removal made on THIS device also
        // sticks on every other device sharing the account, not just locally.
        itemsRemoved: readJSON(profileKey(p.id, "itemsRemoved"), {}),
        recordsRemoved: readJSON(profileKey(p.id, "recordsRemoved"), {}),
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
  // profile that already exists here, items union (remote wins on a shared id) and records
  // match by id with the more-recently-updated copy winning.
  //
  // Tombstones are checked before letting a remote id back in: without them, "never delete"
  // union logic can't tell "hasn't synced yet" apart from "deliberately removed," so
  // something removed locally would reappear the instant the next pull ran, since the
  // remote snapshot still has it.
  function mergeAllProfilesData(remoteProfiles) {
    if (!Array.isArray(remoteProfiles)) return;
    var profiles = getProfiles();
    var byId = {};
    profiles.forEach(function (p) { byId[p.id] = p; });
    // A write failing here (even after writeJSON's own auto-clear-cache retry) is not safe
    // to just log and continue past - whatever calls this typically reads the same data
    // right back out to build an upload, so a silently dropped write means the "merged"
    // result never actually existed anywhere except briefly in memory. Throwing surfaces
    // this as a real sync error instead.
    var failedKeys = [];

    remoteProfiles.forEach(function (remote) {
      if (!byId[remote.id]) {
        var newProfile = { id: remote.id, name: remote.name, createdAt: remote.createdAt || new Date().toISOString() };
        profiles.push(newProfile);
        byId[remote.id] = newProfile;
      }

      // Tombstones themselves merge first (union, newer removedAt wins if both sides have
      // one for the same id) so a removal recorded on either device is what decides whether
      // the corresponding item/record below gets let back in.
      var localItemsRemoved = readJSON(profileKey(remote.id, "itemsRemoved"), {});
      Object.keys(remote.itemsRemoved || {}).forEach(function (id) {
        if (!localItemsRemoved[id] || remote.itemsRemoved[id] > localItemsRemoved[id]) {
          localItemsRemoved[id] = remote.itemsRemoved[id];
        }
      });

      var localItems = readJSON(profileKey(remote.id, "items"), {});
      Object.keys(remote.items || {}).forEach(function (id) {
        var tombstonedAt = localItemsRemoved[id];
        if (tombstonedAt && tombstonedAt >= (remote.syncedAt || "")) return; // removal is newer than (or as new as) this remote snapshot - don't resurrect it
        localItems[id] = remote.items[id];
        delete localItemsRemoved[id]; // remote is newer than our tombstone - it wins
      });
      localItemsRemoved = pruneOldTombstones(localItemsRemoved);
      if (!writeJSON(profileKey(remote.id, "items"), localItems)) failedKeys.push(profileKey(remote.id, "items"));
      if (!writeJSON(profileKey(remote.id, "itemsRemoved"), localItemsRemoved)) failedKeys.push(profileKey(remote.id, "itemsRemoved"));

      var localRecordsRemoved = readJSON(profileKey(remote.id, "recordsRemoved"), {});
      Object.keys(remote.recordsRemoved || {}).forEach(function (id) {
        if (!localRecordsRemoved[id] || remote.recordsRemoved[id] > localRecordsRemoved[id]) {
          localRecordsRemoved[id] = remote.recordsRemoved[id];
        }
      });

      var localRecordsById = {};
      readJSON(profileKey(remote.id, "records"), []).forEach(function (r) { localRecordsById[r.id] = r; });
      (remote.records || []).forEach(function (incoming) {
        var tombstonedAt = localRecordsRemoved[incoming.id];
        if (tombstonedAt && tombstonedAt >= (incoming.updatedAt || "")) return; // deleted after this copy was last saved - don't resurrect it
        var existing = localRecordsById[incoming.id];
        if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
          localRecordsById[incoming.id] = incoming;
          delete localRecordsRemoved[incoming.id];
        }
      });
      localRecordsRemoved = pruneOldTombstones(localRecordsRemoved);
      if (!writeJSON(profileKey(remote.id, "records"), Object.keys(localRecordsById).map(function (id) { return localRecordsById[id]; }))) {
        failedKeys.push(profileKey(remote.id, "records"));
      }
      if (!writeJSON(profileKey(remote.id, "recordsRemoved"), localRecordsRemoved)) failedKeys.push(profileKey(remote.id, "recordsRemoved"));
    });

    if (!writeJSON(KEY_PROFILES, profiles)) failedKeys.push(KEY_PROFILES);

    if (failedKeys.length > 0) {
      throw new Error("Couldn't save merged data (storage is full: " + failedKeys.join(", ") + ").");
    }
  }

  // Every per-profile getter/setter below reads/writes under the CURRENTLY ACTIVE profile -
  // switching profiles (Storage.setActiveProfileId + a full page reload, see the System
  // tab) is what makes them transparently point at a different person's data.
  function activeKey(base) {
    return profileKey(getActiveProfileId(), base);
  }

  // ---- "items" (keyed-map example - rename/reshape to fit your app) ----

  function getItemsMap() {
    return readJSON(activeKey("items"), {});
  }

  function getItemsRemovedMap() {
    return readJSON(activeKey("itemsRemoved"), {});
  }

  function setItem(id, value, present) {
    var map = getItemsMap();
    var removed = getItemsRemovedMap();
    if (present) {
      map[id] = value;
      delete removed[id]; // re-adding supersedes any earlier removal
    } else {
      delete map[id];
      removed[id] = new Date().toISOString();
    }
    writeJSON(activeKey("items"), map);
    writeJSON(activeKey("itemsRemoved"), removed);
    dispatchDataChanged();
  }

  // ---- "records" (array-of-objects example - rename/reshape to fit your app) ----

  function getRecords() {
    return readJSON(activeKey("records"), []);
  }

  function getRecordsRemovedMap() {
    return readJSON(activeKey("recordsRemoved"), {});
  }

  function saveRecord(record) {
    var records = getRecords();
    var idx = -1;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === record.id) { idx = i; break; }
    }
    record.updatedAt = new Date().toISOString();
    if (idx >= 0) {
      records[idx] = record;
    } else {
      record.createdAt = record.createdAt || record.updatedAt;
      records.push(record);
    }
    writeJSON(activeKey("records"), records);
    var removedOnSave = getRecordsRemovedMap();
    if (removedOnSave[record.id]) {
      delete removedOnSave[record.id];
      writeJSON(activeKey("recordsRemoved"), removedOnSave);
    }
    dispatchDataChanged();
    return record;
  }

  function deleteRecord(recordId) {
    var records = getRecords().filter(function (r) { return r.id !== recordId; });
    writeJSON(activeKey("records"), records);
    var removed = getRecordsRemovedMap();
    removed[recordId] = new Date().toISOString();
    writeJSON(activeKey("recordsRemoved"), removed);
    dispatchDataChanged();
  }

  function makeRecordId() {
    return "rec_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---- "viewPref" (simple, low-stakes per-profile setting example) ----

  function getViewPref(fallback) {
    return readJSON(activeKey("viewPref"), fallback === undefined ? null : fallback);
  }

  function setViewPref(value) {
    writeJSON(activeKey("viewPref"), value);
  }

  // ---- Dropbox sync connection (optional; app works fully local without it) ----

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

  // ---- Export / Import (current profile only, matches DropboxSync's per-profile shape) ----

  function exportData() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: getItemsMap(),
      records: getRecords(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "yourapp-backup-" + stamp + ".json";
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
    if (!parsed || typeof parsed !== "object" || !parsed.items || !parsed.records) {
      throw new Error("That file doesn't look like a backup from this app.");
    }

    if (mode === "replace") {
      writeJSON(activeKey("items"), parsed.items);
      writeJSON(activeKey("records"), parsed.records);
      return { items: Object.keys(parsed.items).length, records: parsed.records.length };
    }

    var items = getItemsMap();
    Object.keys(parsed.items).forEach(function (id) { items[id] = parsed.items[id]; });
    writeJSON(activeKey("items"), items);

    var byId = {};
    getRecords().forEach(function (r) { byId[r.id] = r; });
    parsed.records.forEach(function (incoming) {
      var existing = byId[incoming.id];
      if (!existing || (incoming.updatedAt || "") > (existing.updatedAt || "")) {
        byId[incoming.id] = incoming;
      }
    });
    var records = Object.keys(byId).map(function (id) { return byId[id]; });
    writeJSON(activeKey("records"), records);

    return { items: Object.keys(items).length, records: records.length };
  }

  // ---- Full local reset (this device only - never touches Dropbox itself) ----

  function resetThisDevice() {
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf(NS) === 0) localStorage.removeItem(key);
    });
  }

  migrateLegacyDataIfNeeded();

  return {
    getItemsMap: getItemsMap,
    getItemsRemovedMap: getItemsRemovedMap,
    setItem: setItem,
    getRecords: getRecords,
    getRecordsRemovedMap: getRecordsRemovedMap,
    saveRecord: saveRecord,
    deleteRecord: deleteRecord,
    makeRecordId: makeRecordId,
    getViewPref: getViewPref,
    setViewPref: setViewPref,
    clearCache: clearAllCaches,
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
