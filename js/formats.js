// Deck-format definitions + rules for the Deck Builder tab: which cards are legal, how
// many copies of a card are allowed, deck size, and (for Commander/Brawl) the singleton +
// color-identity rules. Scryfall's per-card `legalities` object is the source of truth for
// "is this card legal in format X"; everything else (size, copy limits, Speed Magic's
// composition rule) is enforced here since Scryfall has no concept of Speed Magic, our own
// invented format.
var Formats = (function () {
  "use strict";

  // legalityKey: matches a key in Scryfall's card.legalities object, or null for formats
  // Scryfall doesn't know about (Free, Speed Magic) - those accept any owned card.
  // deckSize: { min } for constructed formats (no upper bound), { exact } for singleton
  // formats where the total (including the Commander, if any) must land on one number.
  var LIST = [
    { id: "free", name: "Free", legalityKey: null, deckSize: null, maxCopies: Infinity, singleton: false, needsCommander: false },
    { id: "speedmagic", name: "Speed Magic", legalityKey: null, deckSize: null, maxCopies: Infinity, singleton: false, needsCommander: false, speedMagic: true },
    { id: "standard", name: "Standard", legalityKey: "standard", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "pioneer", name: "Pioneer", legalityKey: "pioneer", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "modern", name: "Modern", legalityKey: "modern", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "legacy", name: "Legacy", legalityKey: "legacy", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "vintage", name: "Vintage", legalityKey: "vintage", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "pauper", name: "Pauper", legalityKey: "pauper", deckSize: { min: 60 }, maxCopies: 4, singleton: false },
    { id: "commander", name: "Commander", legalityKey: "commander", deckSize: { exact: 100 }, maxCopies: 1, singleton: true, needsCommander: true, startingLife: 40 },
    { id: "brawl", name: "Brawl", legalityKey: "standardbrawl", deckSize: { exact: 60 }, maxCopies: 1, singleton: true, needsCommander: true, startingLife: 25 },
  ];

  function get(id) {
    var found = LIST.filter(function (f) { return f.id === id; })[0];
    return found || LIST[0];
  }

  function isBasicLand(card) {
    return CardView.isLand(card) && /basic/i.test(card.typeLine);
  }

  // A card with no `legalities` at all is an older snapshot cached before this app tracked
  // legality (see storage.js's cards3/prints3 cache-key bump) - treated as "not yet known"
  // rather than illegal, so it doesn't just vanish from a user's pool until they hit
  // Refresh. A card that DOES have legalities but lacks this specific key/isn't "legal" is
  // a real, known answer.
  function isLegal(card, format) {
    if (!format.legalityKey) return true;
    if (!card.legalities) return true;
    return card.legalities[format.legalityKey] === "legal";
  }

  function maxCopies(card, format) {
    if (isBasicLand(card)) return Infinity;
    return format.maxCopies == null ? Infinity : format.maxCopies;
  }

  // Commander eligibility: a legendary creature, or a card whose rules text explicitly
  // grants it (some planeswalkers, e.g. "Can be your commander").
  function eligibleCommander(card) {
    var isLegendary = /\bLegendary\b/i.test(card.typeLine);
    var isCreature = /\bCreature\b/i.test(card.typeLine);
    var explicitlyAllowed = /can be your commander/i.test(card.oracleText || "");
    return explicitlyAllowed || (isLegendary && isCreature);
  }

  function colorIdentityOk(card, commanderCard) {
    if (!commanderCard) return true;
    var allowed = commanderCard.colorIdentity || [];
    var cardIdentity = card.colorIdentity || [];
    return cardIdentity.every(function (c) { return allowed.indexOf(c) !== -1; });
  }

  return {
    LIST: LIST,
    get: get,
    isBasicLand: isBasicLand,
    isLegal: isLegal,
    maxCopies: maxCopies,
    eligibleCommander: eligibleCommander,
    colorIdentityOk: colorIdentityOk,
  };
})();
