# Tessera — Word Rearranger

*Every word a tile. Every poem a mosaic.*

Paste any text, break it into word tiles, and drag them around to compose something new.

- **Word bank** — source text is split into draggable word tiles (sortable by order, alphabet, length, or syllables), plus an unlimited punctuation palette.
- **Composition canvas** — drag words in, drop between words to insert, double-click a tile to edit it, drop low to start a new stanza.
- **Live analysis** — syllable counts, stress patterns, rhyme scheme detection, and recognition of 100+ poetic forms (haiku, sonnets, villanelles, limericks, Welsh and Irish forms, and more) — for both your source text and the poem you're composing.
- **Meter scaffold** — match the meter of your source text while composing.
- **Auto-save & undo** — work persists in your browser between visits; Ctrl+Z steps backward.

The whole app is a single self-contained HTML file with no dependencies and no backend — open `index.html` in a browser and it works.

## Development

Serve the folder with any static server, e.g.:

```sh
python3 -m http.server 8642
```

then open <http://localhost:8642>.
