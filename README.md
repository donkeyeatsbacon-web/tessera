# Tessera — Word Rearranger

*Every word a tile. Every poem a mosaic.*

Paste any text, break it into word tiles, and drag them around to compose something new.
Live at <https://donkeyeatsbacon-web.github.io/tessera/>.

- **Word bank**: source text becomes draggable word tiles (sortable by order, alphabet, length, or syllables), plus an unlimited punctuation palette and a box for adding your own words. Built-in sample texts and a public-domain poem search ([PoetryDB](https://poetrydb.org)) get you started.
- **Composition canvas**: drag words in, drop between words to insert, drop low to start a new line. Shift-click or box-select to move phrases together, right-click (long-press on touch) a tile to edit, duplicate, lock or recapitalize it, and move whole lines up and down. On phones, tap a tile and then tap where it goes.
- **Live analysis**: syllable counts (from the 125k-word CMU Pronouncing Dictionary), stress marks, rhyme schemes, and recognition of 100+ poetic forms for both your source text and your poem. Click a detected form to see why it matched.
- **Aim for a form**: pick a haiku, limerick, sonnet, villanelle and more to get a live line-by-line checklist, or a syllable scaffold. Bank hints highlight words that rhyme or fit the current line.
- **Keep and share**: autosave, undo/redo, a Library of saved poems, share links (the poem is encoded in the URL, so there's no server), PNG image export, Markdown/plain text copy, and JSON backups.
- **Ways to write** (the Play button): a daily prompt, blackout poems, free-placement "fridge magnets", cut-up fragments, Oulipo N+7, and constraint challenges (lipograms, six-word stories...). Read aloud, or play the meter as a beat.
- **Comfort**: dark (default), light or system theme, poem fonts and tile sizes, titles, line and stanza breaks, focus mode, resizable columns, full keyboard control (press <kbd>?</kbd>), screen-reader announcements, print layout, and offline support as an installable app.

No build step, no backend, and no dependencies at runtime.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Markup and dialogs |
| `tessera.css` | All styles; colours are theme tokens at the top |
| `js/analysis.js` | Syllables, stress, rhyme and form detection. No DOM, so it also runs under Node |
| `js/app.js` | Everything interactive |
| `js/samples.js`, `js/export-image.js` | Sample texts and the PNG renderer |
| `data/pronunciations.txt` | CMU dictionary minus every word the rules already pronounce, front-coded (built by `tools/build-pronunciations.js`) |
| `about.html`, `robots.txt`, `sitemap.xml` | About page and search-engine files |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install metadata |
| `tests/` | Unit tests for the analysis (`*.test.js`), a 26-poem form corpus, and Playwright browser tests (`e2e/`) |
| `.github/workflows/ci.yml` | Lint + tests on every push; deploys to GitHub Pages only if they pass |

## Development

Serve the folder with any static server, e.g.:

```sh
python3 -m http.server 8642
```

then open <http://localhost:8642>. The service worker is skipped on localhost so edits show up on reload. Add `?sw=1` to test it.

Install the dev tools once (Node 22):

```sh
npm ci
npx playwright install chromium
```

Then:

```sh
npm run lint        # ESLint
npm test            # analysis unit tests + poem corpus
npm run test:e2e    # browser tests (Playwright)
npm run test:all    # all three, as CI runs them
```

Regenerate data and images:

```sh
node tools/build-pronunciations.js path/to/cmudict.dict
node tools/fetch-corpus.js
python3 tools/build-images.py
```

Pushing to `main` runs CI; the site deploys only when lint and every test pass.

The pronunciation data is derived from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD license; see `data/CMUDICT-LICENSE.txt`).
