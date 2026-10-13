# Tessera — Word Rearranger

*Every word a tile. Every poem a mosaic.*

Paste any text, break it into word tiles, and drag them around to compose something new.
Live at <https://donkeyeatsbacon-web.github.io/tessera/>.

- **Word bank**: source text becomes draggable word tiles (sortable by order, alphabet, length, or syllables), plus an unlimited punctuation palette and a box for adding your own words. Built-in sample texts and a public-domain poem search ([PoetryDB](https://poetrydb.org)) get you started.
- **Composition canvas**: drag words in, drop between words to insert, drop low to start a new line. Shift-click or box-select to move phrases together, right-click (long-press on touch) a tile to edit, duplicate, lock or recapitalize it, and move whole lines up and down. On phones, tap a tile and then tap where it goes.
- **Live analysis**: syllable counts (from the 125k-word CMU Pronouncing Dictionary), stress marks, rhyme schemes, and recognition of 100+ poetic forms for both your source text and your poem. Click a detected form to see why it matched.
- **Aim for a form**: pick a haiku, limerick, sonnet, villanelle and more to get a live line-by-line checklist, or a syllable scaffold. Bank hints highlight words that rhyme or fit the current line.
- **Keep and share**: autosave, undo/redo, a Library of saved poems, share links (the poem is encoded in the URL, so there's no server), PNG image export, Markdown/plain text copy, and JSON backups.
- **Comfort**: light/dark/system theme, poem fonts and tile sizes, focus mode, resizable columns, full keyboard control (press <kbd>?</kbd>), screen-reader announcements, and offline support as an installable app.

No build step, no backend, and no dependencies at runtime.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Markup and dialogs |
| `tessera.css` | All styles; colours are theme tokens at the top |
| `js/analysis.js` | Syllables, stress, rhyme and form detection. No DOM, so it also runs under Node |
| `js/app.js` | Everything interactive |
| `js/samples.js`, `js/export-image.js` | Sample texts and the PNG renderer |
| `data/pronunciations.json` | CMU dictionary, compacted (built by `tools/build-pronunciations.py`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install metadata |
| `tests/` | Analysis regression tests |

## Development

Serve the folder with any static server, e.g.:

```sh
python3 -m http.server 8642
```

then open <http://localhost:8642>. The service worker is skipped on localhost so edits show up on reload. Add `?sw=1` to test it.

Run the tests (Node 18+):

```sh
npm test
```

Regenerate data and images:

```sh
python3 tools/build-pronunciations.py path/to/cmudict.dict
python3 tools/build-images.py
```

The pronunciation data is derived from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD license; see `data/CMUDICT-LICENSE.txt`).
