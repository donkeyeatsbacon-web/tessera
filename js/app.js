(function () {
  'use strict';

  const MAX_TOKENS = 5000;
  const NEW_LINE_THRESHOLD_LINES = 3;
  const PUNCTUATION = [
    { char: '.', kind: 'endpunct' },
    { char: ',', kind: 'punct' },
    { char: '!', kind: 'endpunct' },
    { char: '?', kind: 'endpunct' },
    { char: ';', kind: 'punct' },
    { char: ':', kind: 'punct' },
    { char: '\u2014', kind: 'punct' },
    { char: '\u2026', kind: 'endpunct' }
  ];


  const {
    PATTERN_DESCRIPTIONS, KNOWN_PROPER_NOUNS, ARTICLES,
    countSyllables, nameRhymeScheme, analyzeSourceMeter
  } = window.TesseraAnalysis;

  let sortMode = 'original';
  let bankOrderCounter = 0;

  let dragEl = null;
  let offsetX = 0, offsetY = 0;
  let dropIndicator = null;
  let tempBreak = null;

  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia && window.matchMedia('(max-width: 720px)').matches;

  function initPalette() {
    const palette = $('palette');
    PUNCTUATION.forEach(({ char, kind }) => {
      palette.appendChild(createSourceTile(char, kind));
    });
  }

  function createTile(word, kind, midCap) {
    const tile = document.createElement('div');
    tile.className = 'word-tile tile-' + kind;
    tile.dataset.word = word;
    tile.dataset.kind = kind;
    if (midCap) tile.dataset.midCap = 'true';
    if (kind === 'word' || kind === 'line') {
      tile.dataset.bankOrder = String(bankOrderCounter++);
    }
    tile.textContent = word;
    tile.addEventListener('mousedown', startDrag);
    tile.addEventListener('touchstart', startDrag, { passive: false });
    if (kind === 'word' || kind === 'line') {
      tile.addEventListener('dblclick', onDblClick);
    }
    return tile;
  }

  function createSourceTile(word, kind) {
    const tile = createTile(word, kind, false);
    tile.dataset.sourceTile = 'true';
    delete tile.dataset.bankOrder; // source tiles never sort
    return tile;
  }

  // Returns true if the word's first character is an uppercase letter
  function startsWithUpper(word) {
    if (!word) return false;
    const first = word[0];
    return first === first.toUpperCase() && first !== first.toLowerCase();
  }

  // Decide whether a word should keep its capital first letter even when
  // it is not at the start of a sentence.
  function shouldPreserveCap(word) {
    if (KNOWN_PROPER_NOUNS.has((word || '').toLowerCase())) return true;
    return false;
  }

  function createLineBreak() {
    const br = document.createElement('div');
    br.className = 'line-break';
    return br;
  }

  // ---------- DOUBLE-CLICK EDITING ----------
  function onDblClick(e) {
    e.preventDefault();
    e.stopPropagation();
    startEdit(e.currentTarget);
  }

  function startEdit(tile) {
    if (tile.dataset.kind !== 'word' && tile.dataset.kind !== 'line') return;
    if (tile.dataset.editing === 'true') return;

    // Show the underlying stored word for editing (not any auto-capitalized display form)
    const original = tile.dataset.word || tile.textContent;
    tile.textContent = original;

    tile.dataset.editing = 'true';
    tile.contentEditable = 'true';
    tile.spellcheck = false;

    // Select all text inside the tile
    requestAnimationFrame(() => {
      tile.focus();
      const range = document.createRange();
      range.selectNodeContents(tile);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    function finish(save) {
      tile.removeEventListener('keydown', onKey);
      tile.removeEventListener('blur', onBlur);
      tile.removeEventListener('paste', onPaste);

      tile.contentEditable = 'false';
      delete tile.dataset.editing;

      if (save) {
        let newWord = (tile.textContent || '').replace(/\s+/g, ' ').trim();
        if (newWord.length === 0) newWord = tile.dataset.word; // revert to old if empty
        tile.dataset.word = newWord;
        tile.textContent = newWord;
        // Recompute midCap from the new word: if the user typed a capital first letter
        // (or it's a known proper noun), preserve caps mid-sentence.
        if (startsWithUpper(newWord) || shouldPreserveCap(newWord)) {
          tile.dataset.midCap = 'true';
        } else {
          delete tile.dataset.midCap;
        }
      } else {
        tile.textContent = tile.dataset.word;
      }

      // Re-apply sentence formatting if this tile is on the canvas
      if (tile.parentElement && tile.parentElement.id === 'canvas') {
        updateSentence();
        updateMeterCounts();
      }
      // Re-sort if this tile is in the bank (alphabetical may have shifted)
      if (tile.parentElement && tile.parentElement.id === 'wordBank') {
        sortBank();
      }
    }

    function onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    }

    function onBlur() {
      finish(true);
    }

    // Strip formatting from any pasted content
    function onPaste(e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const cleaned = text.replace(/\s+/g, ' ');
      document.execCommand('insertText', false, cleaned);
    }

    tile.addEventListener('keydown', onKey);
    tile.addEventListener('blur', onBlur);
    tile.addEventListener('paste', onPaste);
  }

  function loadWords() {
    const text = $('input').value;
    const bank = $('wordBank');
    bank.textContent = '';
    bankOrderCounter = 0;

    const parsed = parseSourceWords(text);

    if (parsed.words.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-bank';
      empty.textContent = 'No words found.';
      bank.appendChild(empty);
      updateCounter();
      return;
    }

    if (parsed.words.length > MAX_TOKENS) {
      if (!confirm('That\'s ' + parsed.words.length + ' words \u2014 a lot of tiles. Continue anyway?')) {
        const empty = document.createElement('div');
        empty.className = 'empty-bank';
        empty.textContent = 'Cancelled.';
        bank.appendChild(empty);
        updateCounter();
        return;
      }
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < parsed.words.length; i++) {
      const w = parsed.words[i];
      const lower = w.toLowerCase();
      // midCap is set if either:
      //   - any occurrence of the same word appeared mid-sentence with caps, OR
      //   - the word is in our known-proper-noun list.
      const midCap = parsed.midCapWords.has(lower) || KNOWN_PROPER_NOUNS.has(lower);
      frag.appendChild(createTile(w, 'word', midCap));
    }
    bank.appendChild(frag);
    sortBank();
    updateCounter();
    if (isMobile()) $('pasteColumn').classList.add('collapsed');
  }

  // Break the pasted text into whole lines instead of individual words.
  // Each non-empty line becomes one tile that can be dragged, sorted, jumbled,
  // and edited as a single unit. Capitalization rules don't modify line tiles
  // (they're treated as opaque text blocks), but the line's trailing punctuation
  // is honored: if a line ends in . ! ? or ..., the next tile starts a new sentence.
  function loadLines() {
    const text = $('input').value;
    const bank = $('wordBank');
    bank.textContent = '';
    bankOrderCounter = 0;

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-bank';
      empty.textContent = 'No lines found.';
      bank.appendChild(empty);
      updateCounter();
      return;
    }

    if (lines.length > MAX_TOKENS) {
      if (!confirm('That\'s ' + lines.length + ' lines \u2014 a lot of tiles. Continue anyway?')) {
        const empty = document.createElement('div');
        empty.className = 'empty-bank';
        empty.textContent = 'Cancelled.';
        bank.appendChild(empty);
        updateCounter();
        return;
      }
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      frag.appendChild(createTile(lines[i], 'line', false));
    }
    bank.appendChild(frag);
    sortBank();
    updateCounter();
    if (isMobile()) $('pasteColumn').classList.add('collapsed');
  }

  // Tokenize the source text into words and sentence-boundary markers, then
  // identify which words appear mid-sentence with a capital letter — those
  // are likely proper nouns and should keep their capitals wherever placed.
  function parseSourceWords(text) {
    const words = [];
    const midCapSet = new Set();

    let tokenRe;
    try {
      tokenRe = /([\p{L}\p{N}][\p{L}\p{N}'\u2019\-]*)|([.!?\u2026]+)/gu;
    } catch (e) {
      tokenRe = /([A-Za-z0-9][A-Za-z0-9'\u2019\-]*)|([.!?\u2026]+)/g;
    }

    let m;
    let isStart = true;
    while ((m = tokenRe.exec(text)) !== null) {
      if (m[1]) {
        const w = m[1];
        words.push(w);
        if (!isStart && startsWithUpper(w)) {
          midCapSet.add(w.toLowerCase());
        }
        isStart = false;
      } else if (m[2]) {
        // Sentence-ending punctuation
        isStart = true;
      }
    }

    return { words, midCapWords: midCapSet };
  }

  // Pending-drag state: drag is "armed" but not yet started until the pointer moves past threshold.
  let pendingDrag = null;
  const DRAG_THRESHOLD = 5; // px

  const LONG_PRESS_MS = 450;

  function startDrag(e) {
    const sourceTile = e.currentTarget;
    if (sourceTile.dataset.editing === 'true') return;
    const evt = e.touches ? e.touches[0] : e;

    // Shift / Ctrl / Cmd + click toggles the tile in the selection instead of dragging.
    if (!e.touches && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (isSelectable(sourceTile)) toggleSelected(sourceTile);
      return;
    }

    pendingDrag = {
      sourceTile,
      startX: evt.clientX,
      startY: evt.clientY,
      longPressed: false,
      longPressTimer: null
    };

    // Touch: press and hold (without moving) toggles selection.
    if (e.touches && isSelectable(sourceTile)) {
      const pd = pendingDrag;
      pd.longPressTimer = setTimeout(() => {
        if (pendingDrag !== pd) return;
        pd.longPressed = true;
        toggleSelected(sourceTile);
        if (navigator.vibrate) navigator.vibrate(15);
      }, LONG_PRESS_MS);
    }

    // Prevent default for touch only, to stop page scrolling. For mouse, leave defaults
    // alone so dblclick events can still fire.
    if (e.touches) e.preventDefault();

    document.addEventListener('mousemove', maybeBeginDrag);
    document.addEventListener('mouseup', cancelPending);
    document.addEventListener('touchmove', maybeBeginDrag, { passive: false });
    document.addEventListener('touchend', cancelPending);
  }

  function maybeBeginDrag(e) {
    if (!pendingDrag) return;
    const evt = e.touches ? e.touches[0] : e;
    const dx = evt.clientX - pendingDrag.startX;
    const dy = evt.clientY - pendingDrag.startY;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      // Still below threshold — treat as potential click, don't disturb DOM.
      if (e.touches) e.preventDefault();
      return;
    }
    e.preventDefault();
    beginActualDrag(evt);
  }

  // Pointer released without dragging — a plain click/tap clears the selection.
  function cancelPending() {
    if (pendingDrag) {
      clearTimeout(pendingDrag.longPressTimer);
      if (!pendingDrag.longPressed) clearSelection();
    }
    pendingDrag = null;
    document.removeEventListener('mousemove', maybeBeginDrag);
    document.removeEventListener('mouseup', cancelPending);
    document.removeEventListener('touchmove', maybeBeginDrag);
    document.removeEventListener('touchend', cancelPending);
  }

  function beginActualDrag(evt) {
    const sourceTile = pendingDrag.sourceTile;
    clearTimeout(pendingDrag.longPressTimer);
    const rect = sourceTile.getBoundingClientRect();
    offsetX = pendingDrag.startX - rect.left;
    offsetY = pendingDrag.startY - rect.top;
    pendingDrag = null;

    // Grabbing a selected tile drags the whole selection; grabbing any
    // other tile drops the selection and drags just that one.
    const group = sourceTile.classList.contains('selected') ? selectedTiles() : [];
    if (!sourceTile.classList.contains('selected')) clearSelection();

    let target, wasOnCanvas;
    if (group.length > 1) {
      wasOnCanvas = group.some((t) => t.parentElement && t.parentElement.id === 'canvas');
      target = document.createElement('div');
      target.className = 'drag-group';
      group.forEach((t) => target.appendChild(t));
    } else {
      if (sourceTile.dataset.sourceTile === 'true') {
        target = createTile(sourceTile.dataset.word, sourceTile.dataset.kind);
      } else {
        target = sourceTile;
      }
      wasOnCanvas = target.parentElement && target.parentElement.id === 'canvas';
    }

    dragEl = target;
    document.body.appendChild(dragEl);
    if (dragEl !== sourceTile && dragEl.contains(sourceTile)) {
      // Keep the grabbed tile under the pointer, wherever it sits in the group.
      offsetX += sourceTile.offsetLeft;
      offsetY += sourceTile.offsetTop;
    }
    dragEl.style.left = (evt.clientX - offsetX) + 'px';
    dragEl.style.top = (evt.clientY - offsetY) + 'px';
    dragEl.classList.add('dragging');

    if (wasOnCanvas) {
      cleanupBreaks();
      updateSentence();
    }

    // Swap from pending listeners to active drag listeners
    document.removeEventListener('mousemove', maybeBeginDrag);
    document.removeEventListener('mouseup', cancelPending);
    document.removeEventListener('touchmove', maybeBeginDrag);
    document.removeEventListener('touchend', cancelPending);

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
  }

  function onDrag(e) {
    if (!dragEl) return;
    e.preventDefault();
    const evt = e.touches ? e.touches[0] : e;
    dragEl.style.left = (evt.clientX - offsetX) + 'px';
    dragEl.style.top = (evt.clientY - offsetY) + 'px';

    const canvas = $('canvas');
    const cRect = canvas.getBoundingClientRect();
    const inCanvas = evt.clientX >= cRect.left && evt.clientX <= cRect.right &&
                     evt.clientY >= cRect.top && evt.clientY <= cRect.bottom;
    if (inCanvas) {
      showDropIndicator(evt.clientX, evt.clientY);
    } else {
      hideDropIndicator();
    }
  }

  function endDrag(e) {
    if (!dragEl) return;
    const evt = e.changedTouches ? e.changedTouches[0] : e;
    const canvas = $('canvas');
    const cRect = canvas.getBoundingClientRect();
    const inCanvas = evt.clientX >= cRect.left && evt.clientX <= cRect.right &&
                     evt.clientY >= cRect.top && evt.clientY <= cRect.bottom;

    hideDropIndicator();

    const isGroup = dragEl.classList.contains('drag-group');
    const tiles = isGroup ? Array.from(dragEl.children) : [dragEl];

    if (inCanvas) {
      // First tile goes where the indicator was; the rest follow it in order.
      insertOnCanvas(tiles[0], evt.clientX, evt.clientY);
      for (let i = 1; i < tiles.length; i++) tiles[i - 1].after(tiles[i]);
    } else {
      for (const tile of tiles) {
        tile.classList.remove('selected');
        if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') {
          sendToBank(tile);
        } else {
          tile.remove();
        }
      }
    }

    if (isGroup) dragEl.remove();
    dragEl.classList.remove('dragging');
    dragEl.style.left = '';
    dragEl.style.top = '';
    dragEl = null;

    refreshCanvas();

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', endDrag);
  }

  // Re-run everything that depends on what's on the canvas after tiles move.
  function refreshCanvas() {
    const canvas = $('canvas');
    cleanupBreaks();
    updateSentence();
    updateMeterCounts();
    updateCounter();
    updateCanvasStatus();
    const hasContent = canvas.querySelectorAll('.word-tile').length > 0 ||
                       canvas.querySelectorAll('.meter-bracket').length > 0;
    $('hint').style.display = hasContent ? 'none' : '';
  }

  // ---------- MULTI-SELECT ----------
  // Selection lives on the DOM as the .selected class, so undo/redo and
  // restores (which rebuild tiles) clear it naturally.
  function isSelectable(tile) {
    return tile.dataset.sourceTile !== 'true' && tile.dataset.editing !== 'true';
  }

  function toggleSelected(tile) {
    tile.classList.toggle('selected');
  }

  function clearSelection() {
    document.querySelectorAll('.word-tile.selected').forEach((t) => t.classList.remove('selected'));
  }

  // Canvas tiles first (in reading order), then any selected bank tiles.
  function selectedTiles() {
    return Array.from($('canvas').querySelectorAll('.word-tile.selected'))
      .concat(Array.from($('wordBank').querySelectorAll('.word-tile.selected')));
  }

  // Rubber-band selection: drag across empty canvas to select every tile the box touches.
  let marquee = null;
  const MARQUEE_THRESHOLD = 4; // px

  function startMarquee(e) {
    if (e.button !== 0 || e.target.closest('.word-tile, .meter-bracket')) return;
    const canvas = $('canvas');
    if (e.target === canvas && e.offsetX > canvas.clientWidth) return; // scrollbar
    e.preventDefault();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!additive) clearSelection();
    marquee = {
      x0: e.clientX, y0: e.clientY,
      base: new Set(additive ? selectedTiles() : []),
      el: null
    };
    document.addEventListener('mousemove', moveMarquee);
    document.addEventListener('mouseup', endMarquee);
  }

  function moveMarquee(e) {
    if (!marquee) return;
    const left = Math.min(marquee.x0, e.clientX), right = Math.max(marquee.x0, e.clientX);
    const top = Math.min(marquee.y0, e.clientY), bottom = Math.max(marquee.y0, e.clientY);
    if (!marquee.el) {
      if (Math.hypot(right - left, bottom - top) < MARQUEE_THRESHOLD) return;
      marquee.el = document.createElement('div');
      marquee.el.className = 'marquee';
      document.body.appendChild(marquee.el);
    }
    Object.assign(marquee.el.style, {
      left: left + 'px', top: top + 'px',
      width: (right - left) + 'px', height: (bottom - top) + 'px'
    });
    for (const tile of $('canvas').querySelectorAll('.word-tile')) {
      const r = tile.getBoundingClientRect();
      const hit = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
      tile.classList.toggle('selected', hit || marquee.base.has(tile));
    }
  }

  function endMarquee() {
    if (marquee && marquee.el) marquee.el.remove();
    marquee = null;
    document.removeEventListener('mousemove', moveMarquee);
    document.removeEventListener('mouseup', endMarquee);
  }

  function returnSelectedToBank() {
    const tiles = Array.from($('canvas').querySelectorAll('.word-tile.selected'));
    if (!tiles.length) return false;
    for (const tile of tiles) {
      tile.classList.remove('selected');
      if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') {
        sendToBank(tile);
      } else {
        tile.remove();
      }
    }
    refreshCanvas();
    return true;
  }

  function initSelection() {
    $('canvas').addEventListener('mousedown', startMarquee);
    // Clicking anywhere outside a tile or the canvas drops the selection.
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (e.target.closest('.word-tile, #canvas')) return;
      clearSelection();
    });
    document.addEventListener('keydown', (e) => {
      if (isEditingContext(e.target)) return;
      if (e.key === 'Escape') {
        clearSelection();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (returnSelectedToBank()) e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' &&
                 $('canvas').querySelector('.word-tile')) {
        e.preventDefault();
        $('canvas').querySelectorAll('.word-tile').forEach((t) => t.classList.add('selected'));
      }
    });
  }

  // ---------- INSERTION ----------
  function findInsertionRef(canvas, dropX, dropY) {
    const tiles = Array.from(canvas.querySelectorAll('.word-tile'));
    const brackets = Array.from(canvas.querySelectorAll('.meter-bracket'));
    const hasBrackets = brackets.length > 0;

    // No tiles AND no brackets → empty canvas, just append.
    if (tiles.length === 0 && !hasBrackets) {
      return { ref: null, before: false, newLine: false };
    }

    // The "drop 3 lines below to start a new paragraph" trick only makes sense
    // in free-flow mode (no scaffold). With meter brackets, suppress it.
    if (!hasBrackets && tiles.length > 0) {
      let maxBottom = -Infinity;
      let lineHeight = 0;
      for (const t of tiles) {
        const r = t.getBoundingClientRect();
        if (r.bottom > maxBottom) maxBottom = r.bottom;
        if (r.height > lineHeight) lineHeight = r.height;
      }
      const rowGap = 6; // matches CSS gap
      const lineSpan = lineHeight + rowGap;
      if (dropY > maxBottom + NEW_LINE_THRESHOLD_LINES * lineSpan) {
        return { ref: null, before: false, newLine: true };
      }
    }

    // Consider both tiles and brackets as candidate drop neighbors. Pick the
    // closest by Euclidean distance to the drop point. For tiles the
    // before/after decision uses X (since tiles share rows with neighbors),
    // for brackets it uses Y (since they span the full row).
    const candidates = tiles.concat(brackets);
    let bestRef = candidates[0];
    let bestBefore = true;
    let bestDist = Infinity;

    for (const item of candidates) {
      const r = item.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(dropX - cx, dropY - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestRef = item;
        if (item.classList.contains('meter-bracket')) {
          bestBefore = dropY < cy;
        } else {
          bestBefore = dropX < cx;
        }
      }
    }

    return { ref: bestRef, before: bestBefore, newLine: false };
  }

  function insertOnCanvas(tile, dropX, dropY) {
    const canvas = $('canvas');
    const result = findInsertionRef(canvas, dropX, dropY);

    if (result.newLine) {
      canvas.appendChild(createLineBreak());
      canvas.appendChild(tile);
    } else if (!result.ref) {
      canvas.appendChild(tile);
    } else if (result.before) {
      canvas.insertBefore(tile, result.ref);
    } else {
      canvas.insertBefore(tile, result.ref.nextSibling);
    }
  }

  // ---------- DROP INDICATOR ----------
  function showDropIndicator(dropX, dropY) {
    const canvas = $('canvas');
    const result = findInsertionRef(canvas, dropX, dropY);

    if (!dropIndicator) {
      dropIndicator = document.createElement('div');
    }

    if (tempBreak && tempBreak.parentElement) tempBreak.remove();

    if (result.newLine) {
      if (!tempBreak) {
        tempBreak = document.createElement('div');
        tempBreak.className = 'line-break';
      }
      canvas.appendChild(tempBreak);
      dropIndicator.className = 'drop-indicator horizontal';
      canvas.appendChild(dropIndicator);
    } else {
      dropIndicator.className = 'drop-indicator';
      if (!result.ref) {
        canvas.appendChild(dropIndicator);
      } else if (result.before) {
        canvas.insertBefore(dropIndicator, result.ref);
      } else {
        canvas.insertBefore(dropIndicator, result.ref.nextSibling);
      }
    }
  }

  function hideDropIndicator() {
    if (dropIndicator && dropIndicator.parentElement) dropIndicator.remove();
    if (tempBreak && tempBreak.parentElement) tempBreak.remove();
  }

  // ---------- BREAK CLEANUP ----------
  function cleanupBreaks() {
    const canvas = $('canvas');
    let children = Array.from(canvas.children).filter(
      (c) => c.classList && !c.classList.contains('drop-indicator')
    );

    // Trim leading line-breaks
    while (children.length && children[0].classList.contains('line-break')) {
      children[0].remove();
      children.shift();
    }
    // Trim trailing line-breaks
    while (children.length && children[children.length - 1].classList.contains('line-break')) {
      children[children.length - 1].remove();
      children.pop();
    }
    // Dedupe consecutive line-breaks (keep the first of each run)
    for (let i = children.length - 1; i > 0; i--) {
      if (children[i].classList.contains('line-break') &&
          children[i - 1].classList.contains('line-break')) {
        children[i].remove();
      }
    }
  }

  // ---------- AUTO-CAPITALIZATION ----------
  function updateSentence() {
    const canvas = $('canvas');
    const children = Array.from(canvas.children);
    let isStart = true;
    for (const child of children) {
      if (!child.classList) continue;
      if (child.classList.contains('line-break')) {
        isStart = true;
        continue;
      }
      if (!child.classList.contains('word-tile')) continue;

      const tile = child;
      const word = tile.dataset.word || tile.textContent;
      const kind = tile.dataset.kind || 'word';
      if (kind === 'word') {
        const midCap = tile.dataset.midCap === 'true' || shouldPreserveCap(word);
        if (isStart) {
          tile.textContent = capitalizeFirst(word);
        } else if (midCap) {
          tile.textContent = capitalizeFirst(word);
        } else {
          tile.textContent = lowerFirst(word);
        }
        isStart = false;
      } else if (kind === 'line') {
        // Lines are opaque blocks of text — don't modify their casing.
        tile.textContent = word;
        // If the line ends with sentence-terminal punctuation (optionally
        // followed by a closing quote), the next tile starts a new sentence.
        isStart = /[.!?\u2026]['"\u2019\u201D]?\s*$/.test(word);
      } else {
        tile.textContent = word;
        if (kind === 'endpunct') {
          isStart = true;
        }
      }
    }
  }

  function capitalizeFirst(word) {
    if (!word) return word;
    const first = word[0];
    const upper = first.toUpperCase();
    if (first === upper) return word;
    return upper + word.slice(1);
  }

  function lowerFirst(word) {
    if (!word) return word;
    const first = word[0];
    const lower = first.toLowerCase();
    if (first === lower) return word;
    return lower + word.slice(1);
  }

  // ---------- HELPERS ----------
  function sendToBank(tile) {
    tile.style.left = '';
    tile.style.top = '';
    const bank = $('wordBank');
    const empty = bank.querySelector('.empty-bank');
    if (empty) empty.remove();
    bank.appendChild(tile);
    sortBank();
  }

  function setSortMode(mode) {
    sortMode = mode;
    sortBank();
    scheduleSave();
  }

  // Reorders the tiles within the word bank according to the current sortMode.
  function sortBank() {
    const bank = $('wordBank');
    if (!bank) return;

    // Remove old dividers; we'll re-insert if needed
    bank.querySelectorAll('.bank-divider').forEach((d) => d.remove());

    const tiles = Array.from(bank.querySelectorAll('.word-tile'));
    if (tiles.length === 0) return;

    const wordOf = (t) => (t.dataset.word || '').toLowerCase();

    const byOriginal = (a, b) =>
      Number(a.dataset.bankOrder || 0) - Number(b.dataset.bankOrder || 0);
    const byAlpha = (a, b) => wordOf(a).localeCompare(wordOf(b));
    const byLength = (a, b) => {
      const d = wordOf(a).length - wordOf(b).length;
      return d !== 0 ? d : byAlpha(a, b);
    };
    const bySyllables = (a, b) => {
      const d = countSyllables(wordOf(a)) - countSyllables(wordOf(b));
      return d !== 0 ? d : byAlpha(a, b);
    };

    if (sortMode === 'alphabetical') {
      const sorted = tiles.slice().sort(byAlpha);
      for (const t of sorted) bank.appendChild(t);
    } else if (sortMode === 'length') {
      const sorted = tiles.slice().sort(byLength);
      for (const t of sorted) bank.appendChild(t);
    } else if (sortMode === 'syllables') {
      const sorted = tiles.slice().sort(bySyllables);
      for (const t of sorted) bank.appendChild(t);
    } else if (sortMode === 'shuffle') {
      const shuffled = tiles.slice();
      shuffleArray(shuffled);
      for (const t of shuffled) bank.appendChild(t);
    } else if (sortMode === 'articles') {
      const articles = tiles
        .filter((t) => ARTICLES.has(wordOf(t)))
        .sort(byOriginal);
      const others = tiles
        .filter((t) => !ARTICLES.has(wordOf(t)))
        .sort(byOriginal);

      for (const t of articles) bank.appendChild(t);
      if (articles.length > 0 && others.length > 0) {
        const div = document.createElement('div');
        div.className = 'bank-divider';
        bank.appendChild(div);
      }
      for (const t of others) bank.appendChild(t);
    } else {
      // 'original'
      const sorted = tiles.slice().sort(byOriginal);
      for (const t of sorted) bank.appendChild(t);
    }
  }

  // In-place Fisher-Yates shuffle.
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // Build the scaffold on the canvas: one bracket marker per source line,
  // each tracking a target syllable count and the running count of what's
  // been dropped beneath it.
  function applyMeterScaffold() {
    const text = $('input').value;
    const meter = analyzeSourceMeter(text);
    const status = $('meterStatus');

    if (!meter) {
      if (status) {
        status.innerHTML = '';
        status.textContent = 'Paste source text first.';
      }
      return;
    }

    const canvas = $('canvas');
    // Send any existing canvas word/line tiles back to the bank (don't lose them),
    // and clear all break/bracket scaffolding.
    const existing = Array.from(canvas.querySelectorAll('.word-tile'));
    for (const tile of existing) sendToBank(tile);
    canvas.querySelectorAll('.line-break').forEach((b) => b.remove());
    canvas.querySelectorAll('.meter-bracket').forEach((b) => b.remove());

    const frag = document.createDocumentFragment();
    const rhymeLetters = (meter.rhyme && meter.rhyme.letters) || [];
    for (let i = 0; i < meter.lineMeters.length; i++) {
      const letter = rhymeLetters[i] || '';
      frag.appendChild(createMeterBracket(i + 1, meter.lineMeters[i].syllables, letter));
    }
    canvas.appendChild(frag);

    $('hint').style.display = 'none';

    if (status) renderMeterStatus(status, meter);

    updateMeterCounts();
    updateCounter();
  }

  function renderMeterStatus(status, meter) {
    status.textContent = '';
    const p = meter.pattern;
    const desc = PATTERN_DESCRIPTIONS[p.name] || '';

    const nameEl = document.createElement('div');
    nameEl.className = 'meter-name';
    nameEl.textContent = 'Detected: ' + p.label;
    status.appendChild(nameEl);

    if (desc) {
      const descEl = document.createElement('div');
      descEl.className = 'meter-desc';
      descEl.textContent = desc;
      status.appendChild(descEl);
    }

    // Rhyme scheme line — only shown when we found at least one rhyme.
    if (meter.rhyme && meter.rhyme.scheme) {
      const rhymeEl = document.createElement('div');
      rhymeEl.className = 'rhyme-line';

      const labelEl = document.createElement('span');
      labelEl.className = 'rhyme-label';
      labelEl.textContent = 'Rhyme';
      rhymeEl.appendChild(labelEl);

      const schemeEl = document.createElement('span');
      schemeEl.className = 'rhyme-scheme';
      schemeEl.textContent = meter.rhyme.scheme;
      rhymeEl.appendChild(schemeEl);

      const named = nameRhymeScheme(meter.rhyme.scheme);
      if (named) {
        const namedEl = document.createElement('span');
        namedEl.className = 'rhyme-name';
        namedEl.textContent = named;
        rhymeEl.appendChild(namedEl);
      }
      status.appendChild(rhymeEl);
    }

    const confEl = document.createElement('div');
    confEl.className = 'meter-confidence';
    const lineLabel = meter.lineCount + (meter.lineCount === 1 ? ' line' : ' lines');
    confEl.textContent = lineLabel + ' \u2022 confidence: ' + p.confidence;
    status.appendChild(confEl);
  }

  function createMeterBracket(lineNumber, targetSyllables, rhymeLetter) {
    const br = document.createElement('div');
    br.className = 'meter-bracket';
    br.dataset.targetSyllables = String(targetSyllables);
    br.dataset.lineNumber = String(lineNumber);
    if (rhymeLetter) br.dataset.rhymeLetter = rhymeLetter;

    const left = document.createElement('span');
    left.className = 'bracket-left';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'bracket-label';
    labelSpan.textContent = 'Line ' + lineNumber;
    left.appendChild(labelSpan);

    // Show the rhyme letter as a small badge next to the line label. Skip if the
    // source didn't yield a rhyme key for this line (en dash placeholder).
    if (rhymeLetter && rhymeLetter !== '\u2013') {
      const rhymeSpan = document.createElement('span');
      rhymeSpan.className = 'bracket-rhyme';
      rhymeSpan.textContent = rhymeLetter;
      rhymeSpan.title = 'Expected rhyme: group ' + rhymeLetter;
      left.appendChild(rhymeSpan);
    }

    const countSpan = document.createElement('span');
    countSpan.className = 'bracket-count';
    countSpan.textContent = '0 / ' + targetSyllables + ' syllables';

    br.appendChild(left);
    br.appendChild(countSpan);
    return br;
  }

  // Walk the canvas in DOM order. Each .meter-bracket starts a new line slot;
  // word/line tiles between two brackets count toward the earlier bracket.
  function updateMeterCounts() {
    const canvas = $('canvas');
    const brackets = Array.from(canvas.querySelectorAll('.meter-bracket'));
    if (brackets.length === 0) return;

    const wordRe = (function () {
      try { return /[\p{L}\p{N}][\p{L}\p{N}'\u2019\-]*/gu; }
      catch (e) { return /[A-Za-z0-9][A-Za-z0-9'\u2019\-]*/g; }
    })();

    const children = Array.from(canvas.children);
    let currentBracket = null;
    let runningSyllables = 0;

    function flush() {
      if (!currentBracket) return;
      const target = parseInt(currentBracket.dataset.targetSyllables, 10);
      const countEl = currentBracket.querySelector('.bracket-count');
      if (countEl) {
        countEl.textContent = runningSyllables + ' / ' + target + ' syllables';
      }
      currentBracket.classList.remove('full', 'over');
      if (runningSyllables === target && target > 0) {
        currentBracket.classList.add('full');
      } else if (runningSyllables > target) {
        currentBracket.classList.add('over');
      }
    }

    for (const child of children) {
      if (!child.classList) continue;
      if (child.classList.contains('meter-bracket')) {
        flush();
        currentBracket = child;
        runningSyllables = 0;
      } else if (child.classList.contains('word-tile')) {
        const kind = child.dataset.kind;
        const text = child.dataset.word || child.textContent || '';
        if (kind === 'word') {
          runningSyllables += countSyllables(text);
        } else if (kind === 'line') {
          const ws = text.match(wordRe) || [];
          for (const w of ws) runningSyllables += countSyllables(w);
        }
        // Punctuation tiles contribute 0 syllables.
      }
    }
    flush();
  }

  // Move every word tile from the bank to the canvas in a random order.
  // If the canvas already has content, the jumble starts on a new line below it
  // (treated as a fresh sentence so the cap rules apply cleanly).
  function jumbleToCanvas() {
    const bank = $('wordBank');
    const canvas = $('canvas');
    const tiles = Array.from(bank.querySelectorAll('.word-tile'));
    if (tiles.length === 0) {
      return;
    }

    shuffleArray(tiles);

    const hasExistingContent = canvas.querySelectorAll('.word-tile').length > 0;

    const frag = document.createDocumentFragment();
    if (hasExistingContent) {
      frag.appendChild(createLineBreak());
    }
    for (const tile of tiles) {
      tile.style.left = '';
      tile.style.top = '';
      frag.appendChild(tile);
    }
    canvas.appendChild(frag);

    $('hint').style.display = 'none';
    cleanupBreaks();
    updateSentence();
    updateMeterCounts();
    sortBank();
    updateCounter();
  }

  function returnAllToBank() {
    const canvas = $('canvas');
    const tiles = Array.from(canvas.querySelectorAll('.word-tile'));
    for (const tile of tiles) {
      if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') {
        sendToBank(tile);
      } else {
        tile.remove();
      }
    }
    canvas.querySelectorAll('.line-break').forEach((b) => b.remove());
    canvas.querySelectorAll('.meter-bracket').forEach((b) => b.remove());
    const status = $('meterStatus');
    if (status) status.textContent = '';
    $('hint').style.display = '';
    updateSentence();
    updateMeterCounts();
    sortBank();
    updateCounter();
  }

  function clearAll() {
    const hasAnything = $('wordBank').querySelectorAll('.word-tile').length > 0 ||
                        $('canvas').querySelectorAll('.word-tile, .meter-bracket').length > 0;
    if (hasAnything && !confirm('Clear the word bank and canvas? (Ctrl+Z can bring it back.)')) return;
    const bank = $('wordBank');
    bank.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'empty-bank';
    empty.textContent = 'Words will appear here.';
    bank.appendChild(empty);

    const canvas = $('canvas');
    canvas.querySelectorAll('.word-tile').forEach((t) => t.remove());
    canvas.querySelectorAll('.line-break').forEach((b) => b.remove());
    canvas.querySelectorAll('.meter-bracket').forEach((b) => b.remove());
    const status = $('meterStatus');
    if (status) status.textContent = '';
    $('hint').style.display = '';
    updateCounter();
  }

  function updateCounter() {
    const bankCount = $('wordBank').querySelectorAll('.word-tile').length;
    const canvasCount = $('canvas').querySelectorAll('.word-tile').length;
    const total = bankCount + canvasCount;
    const text = total + (total === 1 ? ' word' : ' words');
    const el = $('counter');
    if (el && el.textContent !== text) el.textContent = text;
  }

  // ---------- COPY ----------
  // Serialize the canvas arrangement to plain text. Returns '' when there are
  // no word tiles. Shared by the Copy button and live composition detection.
  function arrangementToText() {
    const canvas = $('canvas');
    const children = Array.from(canvas.children).filter(
      (c) => c.classList && (c.classList.contains('word-tile') || c.classList.contains('line-break'))
    );
    if (children.filter((c) => c.classList.contains('word-tile')).length === 0) {
      return '';
    }

    let out = '';
    let lastWasBreak = true; // treat start as break (no leading space)
    for (const child of children) {
      if (child.classList.contains('line-break')) {
        out += '\n\n';
        lastWasBreak = true;
        continue;
      }
      const text = child.textContent;
      const kind = child.dataset.kind;
      if (kind === 'line') {
        // Each line tile gets its own line in the output.
        if (out.length > 0 && !out.endsWith('\n')) out += '\n';
        out += text;
        if (!out.endsWith('\n')) out += '\n';
        lastWasBreak = true; // next tile starts fresh
        continue;
      }
      if (!lastWasBreak && kind === 'word') out += ' ';
      out += text;
      lastWasBreak = false;
    }
    out = out.replace(/\n+$/, ''); // trim trailing newlines
    return out;
  }

  function copyArrangement() {
    const out = arrangementToText();
    if (!out) {
      flashBtn('Empty');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out).then(
        () => flashBtn('Copied!'),
        () => fallbackCopy(out)
      );
    } else {
      fallbackCopy(out);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      flashBtn('Copied!');
    } catch (e) {
      flashBtn('Copy failed');
    }
    ta.remove();
  }

  function flashBtn(msg) {
    const btn = $('copyBtn');
    if (!btn) return;
    const orig = btn.dataset.origLabel || btn.textContent;
    btn.dataset.origLabel = orig;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  // ---------- COLLAPSE TOGGLE ----------
  function togglePasteColumn() {
    const col = $('pasteColumn');
    col.classList.toggle('collapsed');
    scheduleSave();
  }

  // ---------- PERSISTENCE ----------
  // The whole app state lives in the DOM (bank tiles, canvas tiles/breaks/
  // brackets), so we snapshot it to localStorage on every mutation and
  // rebuild it on load. Schema: bump STORAGE_KEY if the shape changes.
  const STORAGE_KEY = 'tessera:state:v1';
  const INTRO_KEY = 'tessera:introSeen';
  let saveTimer = null;

  // One-time migration from the app's brief life as "Worder".
  try {
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem('worder:state:v1')) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem('worder:state:v1'));
      localStorage.removeItem('worder:state:v1');
    }
    if (!localStorage.getItem(INTRO_KEY) && localStorage.getItem('worder:introSeen')) {
      localStorage.setItem(INTRO_KEY, '1');
      localStorage.removeItem('worder:introSeen');
    }
  } catch (e) {}

  function serializeTile(tile) {
    const o = { w: tile.dataset.word, k: tile.dataset.kind };
    if (tile.dataset.midCap === 'true') o.mc = 1;
    if (tile.dataset.bankOrder !== undefined) o.bo = Number(tile.dataset.bankOrder);
    return o;
  }

  function snapshotState() {
    const canvasItems = [];
    for (const child of $('canvas').children) {
      if (!child.classList) continue;
      if (child.classList.contains('word-tile')) {
        canvasItems.push(Object.assign({ t: 'w' }, serializeTile(child)));
      } else if (child.classList.contains('line-break')) {
        canvasItems.push({ t: 'b' });
      } else if (child.classList.contains('meter-bracket')) {
        canvasItems.push({
          t: 'm',
          n: Number(child.dataset.lineNumber),
          s: Number(child.dataset.targetSyllables),
          r: child.dataset.rhymeLetter || ''
        });
      }
    }
    return {
      input: $('input').value,
      sortMode: sortMode,
      collapsed: $('pasteColumn').classList.contains('collapsed'),
      bankCounter: bankOrderCounter,
      bank: Array.from($('wordBank').querySelectorAll('.word-tile')).map(serializeTile),
      canvas: canvasItems,
      status: $('meterStatus') ? $('meterStatus').innerHTML : ''
    };
  }

  function saveStateNow() {
    // A snapshot taken mid-drag would miss the dragged tile (it lives on
    // document.body until drop) — defer until the drag settles.
    if (dragEl || pendingDrag) { scheduleSave(); return; }
    const json = JSON.stringify(snapshotState());
    if (json === lastSaved) return;
    if (lastSaved !== null) {
      undoStack.push(lastSaved);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
    }
    lastSaved = json;
    updateCanvasStatus();
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) { /* storage blocked or full — keep working without saving */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 400);
  }

  function restoreTile(spec) {
    const tile = createTile(spec.w, spec.k, spec.mc === 1);
    if (spec.bo !== undefined) tile.dataset.bankOrder = String(spec.bo);
    return tile;
  }

  // Apply a snapshot to the live DOM, replacing whatever is there. Used both
  // for restoring on page load and for stepping through undo/redo history.
  function applySnapshot(saved) {
    $('input').value = saved.input || '';
    $('pasteColumn').classList.toggle('collapsed', !!saved.collapsed);
    if (saved.sortMode) {
      sortMode = saved.sortMode;
      if ($('sortMode')) $('sortMode').value = saved.sortMode;
    }

    const bank = $('wordBank');
    bank.textContent = '';
    if (saved.bank && saved.bank.length > 0) {
      for (const spec of saved.bank) bank.appendChild(restoreTile(spec));
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-bank';
      empty.textContent = 'Words will appear here.';
      bank.appendChild(empty);
    }

    const canvas = $('canvas');
    canvas.querySelectorAll('.word-tile, .line-break, .meter-bracket').forEach((el) => el.remove());
    let canvasHasContent = false;
    if (saved.canvas && saved.canvas.length > 0) {
      const frag = document.createDocumentFragment();
      for (const item of saved.canvas) {
        if (item.t === 'w') {
          frag.appendChild(restoreTile(item));
          canvasHasContent = true;
        } else if (item.t === 'b') {
          frag.appendChild(createLineBreak());
        } else if (item.t === 'm') {
          frag.appendChild(createMeterBracket(item.n, item.s, item.r));
          canvasHasContent = true;
        }
      }
      canvas.appendChild(frag);
    }

    // Restore the counter exactly (not max with current) — rebuilding tiles
    // bumps it, and any drift makes otherwise-identical snapshots compare
    // unequal, polluting the undo history with duplicate entries.
    bankOrderCounter = Number(saved.bankCounter) || 0;
    // Safe to restore as HTML: this panel is only ever built with textContent,
    // so the saved markup contains no unescaped user input.
    if ($('meterStatus')) $('meterStatus').innerHTML = saved.status || '';
    $('hint').style.display = canvasHasContent ? 'none' : '';

    sortBank();
    updateSentence();
    updateMeterCounts();
    updateCounter();
    updateCanvasStatus();
  }

  function restoreState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return false; }
    if (!saved) return false;
    const hasBank = saved.bank && saved.bank.length > 0;
    const hasCanvas = saved.canvas && saved.canvas.length > 0;
    if (!saved.input && !hasBank && !hasCanvas) return false;
    applySnapshot(saved);
    return true;
  }

  // ---------- UNDO / REDO ----------
  // Every debounced save is also a history entry, so undo depth matches
  // save granularity (one entry per settled change, not per keystroke).
  const undoStack = [];
  const redoStack = [];
  const HISTORY_LIMIT = 100;
  let lastSaved = null;

  function undo() {
    if (dragEl || pendingDrag) return;
    clearTimeout(saveTimer);
    saveStateNow(); // settle any pending change so it becomes the undo target
    if (undoStack.length === 0) return;
    redoStack.push(lastSaved);
    lastSaved = undoStack.pop();
    applySnapshot(JSON.parse(lastSaved));
    try { localStorage.setItem(STORAGE_KEY, lastSaved); } catch (e) {}
  }

  function redo() {
    if (dragEl || pendingDrag || redoStack.length === 0) return;
    clearTimeout(saveTimer);
    undoStack.push(lastSaved);
    lastSaved = redoStack.pop();
    applySnapshot(JSON.parse(lastSaved));
    try { localStorage.setItem(STORAGE_KEY, lastSaved); } catch (e) {}
  }

  function isEditingContext(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || target.isContentEditable;
  }

  function initPersistence() {
    const observer = new MutationObserver(scheduleSave);
    const opts = { childList: true, subtree: true, attributes: true, characterData: true };
    observer.observe($('wordBank'), opts);
    observer.observe($('canvas'), opts);
    $('input').addEventListener('input', scheduleSave);
    $('input').addEventListener('input', scheduleSourceAnalysis);
    window.addEventListener('beforeunload', () => {
      clearTimeout(saveTimer);
      if (!dragEl && !pendingDrag) saveStateNow();
    });

    lastSaved = JSON.stringify(snapshotState());

    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !isEditingContext(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (key === 'y' && !isEditingContext(e.target)) {
        e.preventDefault();
        redo();
      }
    });
  }

  // ---------- LIVE SOURCE ANALYSIS ----------
  // Keep the "Detected:" panel in sync with the paste box instead of only
  // updating it when the meter scaffold button is clicked.
  let sourceAnalysisTimer = null;

  function refreshSourceAnalysis() {
    const status = $('meterStatus');
    if (!status) return;
    const text = $('input').value;
    if (!text.trim()) {
      status.textContent = '';
      scheduleSave();
      return;
    }
    if (text.length > 20000) return; // skip re-analyzing very large pastes per keystroke
    const meter = analyzeSourceMeter(text);
    if (meter) renderMeterStatus(status, meter);
    scheduleSave();
  }

  function scheduleSourceAnalysis() {
    clearTimeout(sourceAnalysisTimer);
    sourceAnalysisTimer = setTimeout(refreshSourceAnalysis, 600);
  }

  // ---------- LIVE COMPOSITION DETECTION ----------
  // Run the same form-detection engine on the poem being composed and show
  // the result in a quiet status line under the canvas.
  function updateCanvasStatus() {
    const el = $('canvasStatus');
    if (!el) return;
    const text = arrangementToText();
    if (!text) { el.textContent = ''; return; }
    const meter = analyzeSourceMeter(text);
    if (!meter || !meter.pattern) { el.textContent = ''; return; }

    el.textContent = '';
    const form = document.createElement('span');
    form.className = 'canvas-status-form';
    form.textContent = meter.pattern.label;
    el.appendChild(form);

    const counts = meter.lineMeters.map((lm) => lm.syllables);
    const countsShown = counts.slice(0, 14).join('–') + (counts.length > 14 ? '–…' : '');
    let detail = meter.lineCount + (meter.lineCount === 1 ? ' line' : ' lines') +
                 ' · ' + countsShown + (counts.length === 1 ? ' syllables' : ' syllables');
    if (meter.rhyme && meter.rhyme.scheme && /[A-Z]/.test(meter.rhyme.scheme)) {
      const scheme = meter.rhyme.scheme.length > 20
        ? meter.rhyme.scheme.slice(0, 20) + '…'
        : meter.rhyme.scheme;
      detail += ' · rhyme ' + scheme;
    }
    const detailEl = document.createElement('span');
    detailEl.textContent = detail;
    el.appendChild(detailEl);
  }

  // ---------- HELP OVERLAY ----------
  function showHelp() {
    $('helpOverlay').classList.add('visible');
  }

  function dismissHelp() {
    $('helpOverlay').classList.remove('visible');
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
  }

  function maybeShowIntro() {
    let seen = null;
    try { seen = localStorage.getItem(INTRO_KEY); } catch (e) {}
    if (!seen) showHelp();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('helpOverlay').classList.contains('visible')) {
      dismissHelp();
    }
  });

  // ---------- EXPOSE ----------
  window.loadWords = loadWords;
  window.loadLines = loadLines;
  window.applyMeterScaffold = applyMeterScaffold;
  window.returnAllToBank = returnAllToBank;
  window.clearAll = clearAll;
  window.copyArrangement = copyArrangement;
  window.togglePasteColumn = togglePasteColumn;
  window.setSortMode = setSortMode;
  window.jumbleToCanvas = jumbleToCanvas;
  window.showHelp = showHelp;
  window.dismissHelp = dismissHelp;

  initPalette();
  const restored = restoreState();
  if (!restored && isMobile()) $('pasteColumn').classList.add('collapsed');
  if ($('input').value.trim()) refreshSourceAnalysis(); // replace any stale restored panel
  initPersistence();
  initSelection();
  maybeShowIntro();
})();
