// Thin wrapper around the free Scryfall REST API (https://scryfall.com/docs/api).
// No API key needed; responses are cached in localStorage via Storage so we
// don't re-fetch on every visit and stay comfortably under Scryfall's rate limits.
var Scryfall = (function () {
  "use strict";

  var API_ROOT = "https://api.scryfall.com";
  var SETS_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  var CARDS_TTL_MS = 24 * 60 * 60 * 1000;
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
      image: image,
      scryfallUri: card.scryfall_uri,
    };
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

    var all = [];
    // unique=cards (not "prints") collapses same-card reprints within this one set - e.g.
    // Commander precon products that reprint the same staple across multiple decks, or
    // showcase/borderless/serialized treatments - down to a single row per card.
    var firstUrl = API_ROOT + "/cards/search?order=set&unique=cards&q=" + encodeURIComponent("set:" + setCode);

    function page(url) {
      return request(url).then(function (res) {
        (res.data || []).forEach(function (c) { all.push(normalizeCard(c)); });
        if (res.has_more && res.next_page) {
          return sleep(REQUEST_GAP_MS).then(function () { return page(res.next_page); });
        }
        return all;
      });
    }

    return page(firstUrl).then(function (cards) {
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

  return {
    fetchSets: fetchSets,
    fetchCardsForSet: fetchCardsForSet,
  };
})();
