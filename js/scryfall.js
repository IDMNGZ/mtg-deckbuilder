// Thin wrapper around the free Scryfall REST API (https://scryfall.com/docs/api).
// No API key needed; responses are cached in localStorage via Storage so we
// don't re-fetch on every visit and stay comfortably under Scryfall's rate limits.
var Scryfall = (function () {
  "use strict";

  var API_ROOT = "https://api.scryfall.com";
  var SETS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  var CARDS_TTL_MS = 24 * 60 * 60 * 1000;
  var PRINTS_TTL_MS = 24 * 60 * 60 * 1000;
  var REQUEST_GAP_MS = 100; // be polite between paginated requests

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function request(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (body) {
          var msg = (body && body.details) || (res.status + " " + res.statusText);
          throw new Error("Scryfall request failed: " + msg);
        });
      }
      return res.json();
    });
  }

  // Normalize the two card shapes Scryfall returns:
  // - normal cards: image_uris, mana_cost, oracle_text at the top level
  // - double-faced / transform / MDFC cards: those fields live under card_faces[]
  function normalizeCard(card) {
    var image = null;
    if (card.image_uris) {
      image = { small: card.image_uris.small, normal: card.image_uris.normal, large: card.image_uris.large };
    } else if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
      var face = card.card_faces[0].image_uris;
      image = { small: face.small, normal: face.normal, large: face.large };
    }

    var manaCost = card.mana_cost;
    var oracleText = card.oracle_text;
    if ((!manaCost || !oracleText) && card.card_faces) {
      manaCost = manaCost || card.card_faces.map(function (f) { return f.mana_cost || ""; }).filter(Boolean).join(" // ");
      oracleText = oracleText || card.card_faces.map(function (f) {
        return (f.name ? f.name + " — " : "") + (f.oracle_text || "");
      }).join("\n\n");
    }

    return {
      id: card.id,
      name: card.name,
      set: card.set,
      setName: card.set_name,
      collectorNumber: card.collector_number,
      rarity: card.rarity,
      manaCost: manaCost || "",
      cmc: typeof card.cmc === "number" ? card.cmc : 0,
      typeLine: card.type_line || "",
      oracleText: oracleText || "",
      colors: card.colors || [],
      colorIdentity: card.color_identity || [],
      legalities: card.legalities || null,
      image: image,
      scryfallUri: card.scryfall_uri,
      // Convenience purchase links Scryfall already provides (TCGplayer/Cardmarket/
      // Cardhoarder/etc, whichever it has for this printing) - carries Scryfall's own
      // affiliate tag, not ours. Used by the Wish List tab.
      purchaseUris: card.purchase_uris || null,
    };
  }

  // Shared pagination loop: walks has_more/next_page, normalizing every card along the way.
  function fetchAllPages(firstUrl) {
    var all = [];
    function page(url) {
      return request(url).then(function (res) {
        (res.data || []).forEach(function (c) { all.push(normalizeCard(c)); });
        if (res.has_more && res.next_page) {
          return sleep(REQUEST_GAP_MS).then(function () { return page(res.next_page); });
        }
        return all;
      });
    }
    return page(firstUrl);
  }

  function fetchSets(forceRefresh) {
    var cached = Storage.getSetsCache();
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < SETS_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    return request(API_ROOT + "/sets").then(function (res) {
      var sets = (res.data || [])
        .filter(function (s) { return s.card_count > 0; })
        .map(function (s) {
          return {
            code: s.code,
            name: s.name,
            setType: s.set_type,
            releasedAt: s.released_at || "",
            cardCount: s.card_count,
            digital: !!s.digital,
            iconSvgUri: s.icon_svg_uri,
          };
        })
        .sort(function (a, b) { return (b.releasedAt || "").localeCompare(a.releasedAt || ""); });
      Storage.setSetsCache(sets);
      return sets;
    });
  }

  function fetchCardsForSet(setCode, forceRefresh) {
    var cached = Storage.getCardsCache(setCode);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < CARDS_TTL_MS) {
      return Promise.resolve(cached.data);
    }

    // unique=cards (not "prints") collapses same-card reprints within this one set - e.g.
    // Commander precon products that reprint the same staple across multiple decks, or
    // showcase/borderless/serialized treatments - down to a single row per card.
    var firstUrl = API_ROOT + "/cards/search?order=set&unique=cards&q=" + encodeURIComponent("set:" + setCode);

    return fetchAllPages(firstUrl).then(function (cards) {
      Storage.setCardsCache(setCode, cards);
      return cards;
    }).catch(function (err) {
      // A set with zero non-digital cards (e.g. some promo sets) returns 404 "no cards found" - treat as empty.
      if (/no cards found/i.test(err.message)) {
        Storage.setCardsCache(setCode, []);
        return [];
      }
      throw err;
    });
  }

  // Every printing of one specific card across all editions (for the modal's version
  // cycler), keyed by name in the cache. Queries by exact name rather than relying on
  // the card's own prints_search_uri field, since cards cached/owned before that field
  // existed wouldn't have it - name-based lookup works for any card, old data or new.
  function fetchPrintsByName(card, forceRefresh) {
    var cached = Storage.getPrintsCache(card.name);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp) < PRINTS_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    var url = API_ROOT + "/cards/search?order=released&unique=prints&q=" + encodeURIComponent('!"' + card.name + '"');
    return fetchAllPages(url).then(function (prints) {
      Storage.setPrintsCache(card.name, prints);
      return prints;
    }).catch(function (err) {
      if (/no cards found/i.test(err.message)) {
        Storage.setPrintsCache(card.name, [card]);
        return [card];
      }
      throw err;
    });
  }

  // Live "search any card by name, regardless of edition" for Browse - not cached, since
  // it's a fast-moving search-as-you-type query rather than a stable, reusable list. Only
  // fetches the first page (Scryfall's default 175/page is plenty for a name search) so
  // a broad query doesn't trigger a long pagination chain.
  function searchCardsByName(query) {
    var url = API_ROOT + "/cards/search?unique=prints&order=name&q=" + encodeURIComponent(query);
    return request(url).then(function (res) {
      return {
        cards: (res.data || []).map(normalizeCard),
        hasMore: !!res.has_more,
        totalMatches: typeof res.total_cards === "number" ? res.total_cards : (res.data || []).length,
      };
    }).catch(function (err) {
      if (/no cards found/i.test(err.message)) {
        return { cards: [], hasMore: false, totalMatches: 0 };
      }
      throw err;
    });
  }

  // Re-fetches specific cards by id (for refreshing saved snapshots in Collection/decks
  // with the latest data). Uses Scryfall's batch /cards/collection endpoint, 75 ids per
  // request (its documented max), rather than one request per card.
  var COLLECTION_BATCH_SIZE = 75;
  function fetchCardsByIds(ids) {
    var chunks = [];
    for (var i = 0; i < ids.length; i += COLLECTION_BATCH_SIZE) {
      chunks.push(ids.slice(i, i + COLLECTION_BATCH_SIZE));
    }

    function doChunk(index, acc) {
      if (index >= chunks.length) return Promise.resolve(acc);
      var body = JSON.stringify({ identifiers: chunks[index].map(function (id) { return { id: id }; }) });
      return fetch(API_ROOT + "/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body,
      }).then(function (res) { return res.json(); }).then(function (res) {
        (res.data || []).forEach(function (c) { acc[c.id] = normalizeCard(c); });
        return sleep(REQUEST_GAP_MS).then(function () { return doChunk(index + 1, acc); });
      });
    }

    return doChunk(0, {});
  }

  return {
    fetchSets: fetchSets,
    fetchCardsForSet: fetchCardsForSet,
    fetchPrintsByName: fetchPrintsByName,
    searchCardsByName: searchCardsByName,
    fetchCardsByIds: fetchCardsByIds,
  };
})();
