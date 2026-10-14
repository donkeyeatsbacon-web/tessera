#!/usr/bin/env node
// Download the form-detection test corpus from PoetryDB (public-domain poems)
// into tests/fixtures/corpus.json.   node tools/fetch-corpus.js
// `expect` is a regex the detected form name should match.
'use strict';
const fs = require('fs');
const path = require('path');

const POEMS = [
  ['Sonnet 18: Shall I compare thee to a summer\'s day?', 'Shakespeare', '^sonnet-shakespearean$'],
  ['Sonnet 29: When in disgrace with fortune and men\'s eyes', 'Shakespeare', '^sonnet'],
  ['Sonnet 73: That time of year thou mayst in me behold', 'Shakespeare', '^sonnet'],
  ['Sonnet 116: Let me not to the marriage of true minds', 'Shakespeare', '^sonnet'],
  ['Sonnet 130: My mistress\' eyes are nothing like the sun', 'Shakespeare', '^sonnet'],
  ['On First Looking into Chapman\'s Homer', 'Keats', '^sonnet'],
  ['Bright Star, Would I Were Steadfast As Thou Art', 'Keats', '^sonnet'],
  ['Ozymandias', 'Shelley', '^sonnet'],
  ['Holy Sonnet X: Death Be Not Proud', 'Donne', '^sonnet'],
  ['Because I could not stop for Death', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['Hope is the thing with feathers', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['A Red, Red Rose', 'Burns', 'common-meter|ballad|iambic|meter'],
  ['The Tyger', 'Blake', 'couplet|trochaic'],
  ['London', 'Blake', 'iambic|alternating|quatrain|tetrameter'],
  ['There Was an Old Man in a Tree', 'Lear', '^limerick$'],
  ['Whispers of Heavenly Death', 'Whitman', '^free verse$'],
  ['I Dream', 'Whitman', '^free verse$'],
  ['Full of Life, Now', 'Whitman', '^free verse$'],
  ['Native Moments', 'Whitman', '^free verse$'],
  ['That Music Always Round Me', 'Whitman', '^free verse$'],
  ['I\'m nobody!', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['The heart asks pleasure first', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['I had no time to hate, because', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['He ate and drank the precious words', 'Dickinson', 'common-meter|ballad|iambic|meter'],
  ['From Sunset to Star Rise', 'Rossetti', '^sonnet'],
  ['Holy Sonnet IV', 'Donne', '^sonnet']
];

(async () => {
  const out = [];
  for (const [title, author, expect] of POEMS) {
    const url = 'https://poetrydb.org/title/' + encodeURIComponent(title) + '/title,author,lines';
    try {
      const data = await (await fetch(url)).json();
      // Prefer an exact title, else the first title that starts with it.
      const mine = Array.isArray(data) ? data.filter((p) => p.author.includes(author)) : [];
      const poem = mine.find((p) => p.title === title) || mine.find((p) => p.title.startsWith(title));
      if (!poem) { console.log('missing:', title); continue; }
      out.push({ title: poem.title, author: poem.author, expect, lines: poem.lines });
    } catch (e) {
      console.log('error:', title, e.message);
    }
  }
  const file = path.join(__dirname, '..', 'tests', 'fixtures', 'corpus.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(out.length + ' poems -> ' + path.relative(process.cwd(), file));
})();
