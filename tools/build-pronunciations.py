#!/usr/bin/env python3
"""Build data/pronunciations.json from the CMU Pronouncing Dictionary.

Usage: python3 tools/build-pronunciations.py path/to/cmudict.dict

Output groups words by stress pattern ("s") and by rhyme tail ("r") --
the phonemes from the last stressed vowel onward -- as space-separated
word lists, which is far smaller than one key per word.
"""
import json, re, sys
from collections import defaultdict

VOWEL = re.compile(r'^[A-Z]+([012])$')

def main(src, dst):
    stress, rhyme, seen = defaultdict(list), defaultdict(list), set()
    for line in open(src, encoding='utf-8'):
        line = line.split('#')[0].strip()
        if not line:
            continue
        word, *phones = line.split()
        if '(' in word or not re.fullmatch(r"[a-z][a-z']*", word) or word in seen:
            continue  # alternate pronunciations, acronyms, symbols
        seen.add(word)
        digits = [m.group(1) for p in phones if (m := VOWEL.match(p))]
        if not digits:
            continue
        # Secondary stress counts as stressed for meter purposes.
        stress[''.join('0' if d == '0' else '1' for d in digits)].append(word)
        vowel_idx = [i for i, p in enumerate(phones) if VOWEL.match(p)]
        primary = [i for i in vowel_idx if phones[i].endswith('1')]
        secondary = [i for i in vowel_idx if phones[i].endswith('2')]
        start = (primary or secondary or vowel_idx)[-1]
        tail = ' '.join(re.sub(r'\d', '', p) for p in phones[start:])
        rhyme[tail].append(word)
    out = {
        'source': 'CMU Pronouncing Dictionary (c) 1993-2015 Carnegie Mellon University, BSD license -- see data/CMUDICT-LICENSE.txt',
        's': {k: ' '.join(v) for k, v in sorted(stress.items())},
        'r': {k: ' '.join(v) for k, v in sorted(rhyme.items())},
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))
    print(len(seen), 'words ->', dst)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'data/pronunciations.json')
