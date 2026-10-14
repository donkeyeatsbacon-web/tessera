// Regression tests for the analysis engine. Run with: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../js/analysis.js');

// The heuristics alone must still work (the dictionary loads lazily in the
// browser and may fail), so check a few basics before loading it.
const baseline = {
  loaded: A.hasPronunciations(),
  beautiful: A.countSyllables('beautiful'),
  catHat: A.getRhymeKey('cat') === A.getRhymeKey('hat')
};
test('works before the pronunciation dictionary loads', () => {
  assert.deepEqual(baseline, { loaded: false, beautiful: 3, catHat: true });
});

A.loadPronunciations(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'pronunciations.txt'), 'utf8'));

const POEMS = {
  haiku: [
    'An old silent pond',
    'A frog jumps into the pond',
    'Splash! Silence again'
  ].join('\n'),
  limerick: [
    'There was an Old Man with a beard,',
    "Who said, 'It is just as I feared!",
    'Two Owls and a Hen,',
    'Four Larks and a Wren,',
    "Have all built their nests in my beard!'"
  ].join('\n'),
  sonnet18: [
    "Shall I compare thee to a summer's day?",
    'Thou art more lovely and more temperate:',
    'Rough winds do shake the darling buds of May,',
    "And summer's lease hath all too short a date;",
    'Sometime too hot the eye of heaven shines,',
    "And often is his gold complexion dimm'd;",
    'And every fair from fair sometime declines,',
    "By chance or nature's changing course untrimm'd;",
    'But thy eternal summer shall not fade,',
    "Nor lose possession of that fair thou ow'st;",
    "Nor shall Death brag thou wander'st in his shade,",
    "When in eternal lines to time thou grow'st:",
    'So long as men can breathe or eyes can see,',
    'So long lives this, and this gives life to thee.'
  ].join('\n'),
  commonMeter: [
    'Because I could not stop for Death,',
    'He kindly stopped for me;',
    'The Carriage held but just Ourselves',
    'And Immortality.'
  ].join('\n'),
  free: ['So much depends', 'upon', 'a red wheel', 'barrow'].join('\n')
};

function analyze(name) {
  return A.analyzeSourceMeter(POEMS[name]);
}

test('syllable counts for common words', () => {
  const expected = {
    the: 1, fire: 1, every: 2, beautiful: 3, strawberry: 3,
    wanted: 2, jumped: 1, created: 3, poem: 2, idea: 3,
    heaven: 2, immortality: 5
  };
  for (const [word, n] of Object.entries(expected)) {
    assert.equal(A.countSyllables(word), n, word);
  }
});

test('rhyme keys match true rhymes and reject non-rhymes', () => {
  const same = (a, b) => A.getRhymeKey(a) === A.getRhymeKey(b);
  assert.ok(same('day', 'May'));
  assert.ok(same('cat', 'hat'));
  assert.ok(same('night', 'light'));
  assert.ok(same('shines', 'declines'));
  assert.ok(same("dimm'd", "untrimm'd"));
  assert.ok(!same('cat', 'dog'));
  assert.ok(!same('day', 'night'));
});

test('haiku is detected', () => {
  const m = analyze('haiku');
  assert.deepEqual(m.lineMeters.map((l) => l.syllables), [5, 7, 5]);
  assert.equal(m.pattern.name, 'haiku');
});

test('limerick is detected with AABBA', () => {
  const m = analyze('limerick');
  assert.equal(m.rhyme.scheme, 'AABBA');
  assert.equal(m.pattern.name, 'limerick');
});

test('Sonnet 18 is a Shakespearean sonnet despite one dated rhyme', () => {
  const m = analyze('sonnet18');
  assert.equal(m.lineCount, 14);
  assert.ok(m.lineMeters.every((l) => Math.abs(l.syllables - 10) <= 1));
  assert.equal(m.pattern.name, 'sonnet-shakespearean');
});

// Relabel a scheme so its first letter is A, next new letter B, and so on.
function relabel(scheme) {
  const map = {};
  return scheme.replace(/[A-Z]/g, (c) => (map[c] = map[c] || String.fromCharCode(65 + Object.keys(map).length)));
}

test('Sonnet 18 rhyme scheme is Shakespearean', () => {
  // temperate/date rhymed for Shakespeare but not in modern pronunciation,
  // so only lines 5-14 are checked.
  const scheme = analyze('sonnet18').rhyme.scheme;
  assert.equal(relabel(scheme.slice(4)), 'ABABCDCDEE');
});

test('Dickinson quatrain is common meter', () => {
  const m = analyze('commonMeter');
  assert.deepEqual(m.lineMeters.map((l) => l.syllables), [8, 6, 8, 6]);
  assert.equal(m.pattern.name, 'common-meter');
});

test('unpatterned text falls back to free verse', () => {
  assert.equal(analyze('free').pattern.name, 'free verse');
});

test('empty input returns null', () => {
  assert.equal(A.analyzeSourceMeter('   \n  '), null);
});

test('every form has a description', () => {
  const missing = A.FORM_DEFINITIONS
    .map((f) => f.name)
    .filter((n) => !n.startsWith('__') && !A.PATTERN_DESCRIPTIONS[n]);
  assert.deepEqual(missing, []);
});

test('rhyme quality distinguishes perfect, slant and none', () => {
  assert.equal(A.rhymeQuality('day', 'May'), 'perfect');
  assert.equal(A.rhymeQuality('spears', 'tears'), 'perfect'); // alternate pronunciation
  assert.equal(A.rhymeQuality('aspire', 'fire'), 'perfect');
  assert.equal(A.rhymeQuality('love', 'move'), 'slant');
  assert.equal(A.rhymeQuality('cat', 'dog'), 'none');
});

test('inflections and elisions derive from their stems', () => {
  assert.equal(A.countSyllables('walked'), 1);
  assert.equal(A.countSyllables('boxes'), 2);
  assert.equal(A.countSyllables("grow'st"), 1);
  assert.ok(A.rhymesWith("ow'st", "grow'st"));
  assert.ok(A.rhymesWith("dimm'd", "untrimm'd"));
});

test('a two-line rhyme is named a couplet', () => {
  assert.equal(A.nameRhymeScheme('AA'), 'rhymed couplet');
});

test('scheme matching tolerates renamed letters and counts misses', () => {
  assert.equal(A.schemeMisses('CDCD', 'ABAB'), 0);
  assert.equal(A.schemeMisses('ABAC', 'ABAB'), 1);
});
