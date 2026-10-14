// Form detection accuracy on real public-domain poems (tests/fixtures/
// corpus.json, refreshed by tools/fetch-corpus.js). Fails if accuracy drops
// below the floor, and lists every miss so changes can be judged.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../js/analysis.js');

const FLOOR = 0.95; // raise as detection improves

A.loadPronunciations(fs.readFileSync(path.join(__dirname, '..', 'data', 'pronunciations.txt'), 'utf8'));
const corpus = require('./fixtures/corpus.json');

test('form detection accuracy on the poem corpus', (t) => {
  const misses = [];
  for (const poem of corpus) {
    const m = A.analyzeSourceMeter(poem.lines.join('\n'));
    if (!new RegExp(poem.expect).test(m.pattern.name)) {
      misses.push(poem.title + ' (' + poem.author + '): got ' + m.pattern.name + ', want /' + poem.expect + '/');
    }
  }
  const accuracy = (corpus.length - misses.length) / corpus.length;
  t.diagnostic('accuracy ' + Math.round(accuracy * 100) + '% (' + (corpus.length - misses.length) + '/' + corpus.length + ')');
  misses.forEach((m) => t.diagnostic('miss: ' + m));
  assert.ok(accuracy >= FLOOR, misses.join('\n'));
});
