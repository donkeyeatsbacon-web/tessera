#!/usr/bin/env node
// Build data/pronunciations.txt from the CMU Pronouncing Dictionary.
//
//   node tools/build-pronunciations.js path/to/cmudict.dict
//
// For each word we keep its stress pattern ("010") and the phonemes from its
// last stressed vowel onward ("rhyme tails", one per pronunciation). Then we
// drop every word the analysis rules already get exactly right without it
// (walked from walk, untrimmed from trimmed...), checked by running the real
// js/analysis.js. What's left is front-coded, one word per line.
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../js/analysis.js');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-pronunciations.js cmudict.dict');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'data', 'pronunciations.txt');
const VOWEL = /^[A-Z]+([012])$/;

// ---- parse ----
const prons = new Map();
for (let line of fs.readFileSync(src, 'utf8').split('\n')) {
  line = line.split('#')[0].trim();
  if (!line) continue;
  const [raw, ...phones] = line.split(/\s+/);
  const word = raw.replace(/\(\d+\)$/, '');
  if (!/^[a-z][a-z']*$/.test(word)) continue; // acronyms, symbols
  if (!prons.has(word)) prons.set(word, []);
  prons.get(word).push(phones);
}

function describe(phones) {
  const digits = phones.map((p) => (p.match(VOWEL) || [])[1]).filter(Boolean);
  if (!digits.length) return null;
  // Secondary stress counts as stressed for meter purposes.
  const stress = digits.map((d) => (d === '0' ? '0' : '1')).join('');
  const vowels = phones.map((p, i) => (VOWEL.test(p) ? i : -1)).filter((i) => i >= 0);
  const primary = vowels.filter((i) => phones[i].endsWith('1'));
  const secondary = vowels.filter((i) => phones[i].endsWith('2'));
  const start = (primary.length ? primary : secondary.length ? secondary : vowels).pop();
  let tail = phones.slice(start).map((p) => p.replace(/\d/, '')).join(' ');
  // fire/aspire, hour/our: CMU writes the same sound as "AY ER" and "AY R".
  tail = tail.replace(/^(AY|AW|OY) ER\b/, '$1 R');
  return { stress, tail };
}

const stress = new Map();
const rhyme = new Map();
for (const [word, list] of prons) {
  const infos = list.map(describe).filter(Boolean);
  if (!infos.length) continue;
  stress.set(word, infos[0].stress);
  rhyme.set(word, [...new Set(infos.map((i) => i.tail))]);
}
const total = stress.size;

// ---- prune what the rules reproduce ----
A.setPronunciationMaps(stress, rhyme);
const sig = (w) => JSON.stringify([A.getWordStress(w), A.countSyllables(w), A.getRhymeKeys(w)]);
// Shorter words first: a word's derivations only ever consult shorter words,
// so each check runs against exactly the entries the browser will have.
const order = [...stress.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
let pruned = 0;
for (const w of order) {
  const before = sig(w);
  const s = stress.get(w), r = rhyme.get(w);
  stress.delete(w);
  rhyme.delete(w);
  if (sig(w) === before) { pruned++; continue; }
  stress.set(w, s);
  rhyme.set(w, r);
}

// ---- encode ----
const stressTable = [...new Set(stress.values())].sort();
const tailCounts = new Map();
for (const ts of rhyme.values()) for (const t of ts) tailCounts.set(t, (tailCounts.get(t) || 0) + 1);
const tailTable = [...tailCounts.keys()].sort((a, b) => tailCounts.get(b) - tailCounts.get(a)); // common = short codes
const si = new Map(stressTable.map((x, i) => [x, i]));
const ti = new Map(tailTable.map((x, i) => [x, i]));
const b36 = (n) => n.toString(36);

const lines = [JSON.stringify({
  source: 'CMU Pronouncing Dictionary (c) 1993-2015 Carnegie Mellon University, BSD license; see data/CMUDICT-LICENSE.txt',
  stress: stressTable,
  tails: tailTable
})];
let prev = '';
for (const w of [...stress.keys()].sort()) {
  let k = 0;
  while (k < 35 && k < prev.length && k < w.length && prev[k] === w[k]) k++;
  lines.push(b36(k) + w.slice(k) + ',' + b36(si.get(stress.get(w))) + ',' + rhyme.get(w).map((t) => b36(ti.get(t))).join('.'));
  prev = w;
}
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`${total} words, ${pruned} reproduced by rules, ${stress.size} kept -> ${path.relative(process.cwd(), OUT)}`);
