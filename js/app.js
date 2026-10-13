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
    tile.tabIndex = -1; // roving tab stop — see updateRovingTabStops()
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-pressed', 'false');
    tile.addEventListener('mousedown', startDrag);
    tile.addEventListener('touchstart', startDrag, { passive: false });
    tile.addEventListener('contextmenu', onTileContextMenu);
    if (kind === 'word' || kind === 'line') {
      tile.addEventListener('dblclick', onDblClick);
    }
    return tile;
  }

  function isLocked(tile) {
    return tile.dataset.locked === 'true';
  }

  function onCanvas(tile) {
    return !!tile.parentElement && tile.parentElement.id === 'canvas';
  }

  function inBank(tile) {
    return !!tile.parentElement && tile.parentElement.id === 'wordBank';
  }

  // A fresh, independent copy of a tile (for duplicates and reusable words).
  function cloneTile(tile) {
    return createTile(tile.dataset.word, tile.dataset.kind, tile.dataset.midCap === 'true');
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

  function loadWords(opts) {
    opts = opts || {};
    const text = $('input').value;
    const bank = $('wordBank');
    const parsed = parseSourceWords(text);
    if (parsed.words.length > MAX_TOKENS && !opts.confirmed) {
      confirmDialog('That\'s ' + parsed.words.length + ' words \u2014 a lot of tiles, which can make Tessera slow. Continue anyway?', 'Continue')
        .then((ok) => { if (ok) loadWords({ confirmed: true }); });
      return;
    }
    bank.textContent = '';
    bankOrderCounter = 0;

    if (parsed.words.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-bank';
      empty.textContent = 'No words found.';
      bank.appendChild(empty);
      updateCounter();
      return;
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
  function loadLines(opts) {
    opts = opts || {};
    const text = $('input').value;
    const bank = $('wordBank');
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > MAX_TOKENS && !opts.confirmed) {
      confirmDialog('That\'s ' + lines.length + ' lines \u2014 a lot of tiles, which can make Tessera slow. Continue anyway?', 'Continue')
        .then((ok) => { if (ok) loadLines({ confirmed: true }); });
      return;
    }
    bank.textContent = '';
    bankOrderCounter = 0;

    if (lines.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-bank';
      empty.textContent = 'No lines found.';
      bank.appendChild(empty);
      updateCounter();
      return;
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
    if (!e.touches && e.button !== 0) return; // right-click opens the tile menu instead
    if (!e.touches && Date.now() - lastTouchAt < TOUCH_MOUSE_GRACE_MS) return; // emulated mouse after touch
    hideContextMenu();
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
      longPressTimer: null,
      touch: !!e.touches
    };

    // Touch: press and hold (without moving) opens the tile menu.
    if (e.touches) {
      const pd = pendingDrag;
      pd.longPressTimer = setTimeout(() => {
        if (pendingDrag !== pd) return;
        pd.longPressed = true;
        haptic(15);
        openContextMenu(sourceTile, pd.startX, pd.startY);
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
    const tile = pendingDrag.sourceTile;
    if (isLocked(tile) && onCanvas(tile)) {
      cancelPending(true);
      showToast('That tile is locked. Right-click it to unlock.');
      return;
    }
    beginActualDrag(evt);
  }

  // Pointer released without dragging. A mouse click clears the selection;
  // a tap selects the tile so a second tap on the canvas can place it.
  function cancelPending(silent) {
    if (pendingDrag) {
      clearTimeout(pendingDrag.longPressTimer);
      if (!pendingDrag.longPressed && silent !== true) {
        if (pendingDrag.touch) tapTile(pendingDrag.sourceTile);
        else clearSelection();
      }
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
    const group = sourceTile.classList.contains('selected')
      ? selectedTiles().filter((t) => !(isLocked(t) && onCanvas(t)) && t.dataset.sourceTile !== 'true')
      : [];
    if (!sourceTile.classList.contains('selected')) clearSelection();
    // With reusable words on, bank tiles stay put and a copy is dragged.
    const takeFromBank = (t) => (prefs.reuse && inBank(t) ? cloneTile(t) : t);

    let target, wasOnCanvas;
    if (group.length > 1) {
      wasOnCanvas = group.some(onCanvas);
      target = document.createElement('div');
      target.className = 'drag-group';
      group.forEach((t) => {
        const moved = takeFromBank(t);
        if (moved !== t) { t.classList.remove('selected'); moved.classList.add('selected'); }
        if (moved === t && t === sourceTile) sourceTile.dataset.grabbed = 'true';
        target.appendChild(moved);
      });
    } else {
      if (sourceTile.dataset.sourceTile === 'true') {
        target = cloneTile(sourceTile);
      } else {
        target = takeFromBank(sourceTile);
      }
      wasOnCanvas = onCanvas(target);
    }
    haptic(10);

    dragEl = target;
    document.body.appendChild(dragEl);
    if (dragEl !== sourceTile && dragEl.contains(sourceTile)) {
      // Keep the grabbed tile under the pointer, wherever it sits in the group.
      offsetX += sourceTile.offsetLeft;
      offsetY += sourceTile.offsetTop;
    }
    delete sourceTile.dataset.grabbed;
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
    if (inCanvas) {
      haptic(8);
      tiles.forEach(popTile);
      announce(describeTiles(tiles) + ' placed on line ' + lineNumberOf(tiles[0]) + '.');
    }

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

  function toggleSelected(tile, force) {
    const on = tile.classList.toggle('selected', force);
    tile.setAttribute('aria-pressed', on ? 'true' : 'false');
    selectionChanged();
  }

  function clearSelection() {
    const sel = document.querySelectorAll('.word-tile.selected');
    if (!sel.length) return;
    sel.forEach((t) => { t.classList.remove('selected'); t.setAttribute('aria-pressed', 'false'); });
    selectionChanged();
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
    if (Date.now() - lastTouchAt < TOUCH_MOUSE_GRACE_MS) return; // taps are handled by onCanvasTap
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
    selectionChanged();
  }

  function endMarquee() {
    if (marquee && marquee.el) marquee.el.remove();
    marquee = null;
    document.removeEventListener('mousemove', moveMarquee);
    document.removeEventListener('mouseup', endMarquee);
  }

  function returnSelectedToBank() {
    const tiles = Array.from($('canvas').querySelectorAll('.word-tile.selected'))
      .filter((t) => !isLocked(t));
    if (!tiles.length) return false;
    animateTiles(() => {
      for (const tile of tiles) {
        tile.classList.remove('selected');
        tile.setAttribute('aria-pressed', 'false');
        if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') {
          sendToBank(tile);
        } else {
          tile.remove();
        }
      }
    });
    selectionChanged();
    refreshCanvas();
    announce(tiles.length + (tiles.length === 1 ? ' tile' : ' tiles') + ' returned to the bank.');
    return true;
  }

  function initSelection() {
    $('canvas').addEventListener('mousedown', startMarquee);
    // Clicking anywhere outside a tile or the canvas drops the selection.
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
      if (Date.now() - lastTouchAt < TOUCH_MOUSE_GRACE_MS) return;
      if (e.target.closest('.word-tile, #canvas, .context-menu, .selection-bar, dialog')) return;
      clearSelection();
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
    // Trim trailing line-breaks — except one the user just asked for (Enter
    // on the last tile), which waits for the next word.
    while (children.length && children[children.length - 1].classList.contains('line-break')) {
      const last = children[children.length - 1];
      const prev = children[children.length - 2];
      if (last.classList.contains('pending-line') && prev && prev.classList.contains('word-tile')) break;
      last.remove();
      children.pop();
    }
    for (const c of children) {
      if (c.classList.contains('pending-line') && c !== children[children.length - 1]) c.classList.remove('pending-line');
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
  function updateSentence(container) {
    const canvas = container || $('canvas');
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
    delete tile.dataset.locked;
    const bank = $('wordBank');
    // Reusable words: the bank already holds this word, so the copy just goes away.
    if (prefs.reuse && Array.from(bank.querySelectorAll('.word-tile')).some(
      (t) => t !== tile && t.dataset.word === tile.dataset.word && t.dataset.kind === tile.dataset.kind)) {
      tile.remove();
      return;
    }
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

    const nameEl = document.createElement('button');
    nameEl.type = 'button';
    nameEl.className = 'meter-name';
    nameEl.title = 'What is this form?';
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
      reshuffleCanvas();
      return;
    }

    shuffleArray(tiles);
    animateTiles(() => jumbleInto(canvas, tiles));
    refreshCanvas();
    sortBank();
  }

  function jumbleInto(canvas, tiles) {
    const hasExistingContent = canvas.querySelectorAll('.word-tile').length > 0;

    const frag = document.createDocumentFragment();
    if (hasExistingContent) {
      frag.appendChild(createLineBreak());
    }
    for (const tile of tiles) {
      tile.style.left = '';
      tile.style.top = '';
      frag.appendChild(prefs.reuse ? cloneTile(tile) : tile);
    }
    canvas.appendChild(frag);
  }

  // With the bank empty, Jumble shuffles the canvas instead: every unlocked
  // tile trades places at random; locked tiles keep their spots.
  function reshuffleCanvas() {
    const canvas = $('canvas');
    const movable = Array.from(canvas.querySelectorAll('.word-tile')).filter((t) => !isLocked(t));
    if (movable.length < 2) return;
    const shuffled = shuffleArray(movable.slice());
    animateTiles(() => {
      const markers = movable.map((t) => {
        const m = document.createComment('slot');
        canvas.insertBefore(m, t);
        return m;
      });
      movable.forEach((t) => t.remove());
      markers.forEach((m, i) => { canvas.insertBefore(shuffled[i], m); m.remove(); });
    });
    refreshCanvas();
  }

  function returnAllToBank() {
    const canvas = $('canvas');
    const tiles = Array.from(canvas.querySelectorAll('.word-tile')).filter((t) => !isLocked(t));
    animateTiles(() => {
      for (const tile of tiles) {
        tile.classList.remove('selected');
        if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') {
          sendToBank(tile);
        } else {
          tile.remove();
        }
      }
      // Locked tiles keep the lines (and scaffold) they sit in.
      if (!canvas.querySelector('.word-tile')) {
        canvas.querySelectorAll('.line-break').forEach((b) => b.remove());
        canvas.querySelectorAll('.meter-bracket').forEach((b) => b.remove());
      }
    });
    sortBank();
    selectionChanged();
    refreshCanvas();
  }

  function clearAll() {
    const hasAnything = $('wordBank').querySelectorAll('.word-tile').length > 0 ||
                        $('canvas').querySelectorAll('.word-tile, .meter-bracket').length > 0;
    if (!hasAnything) return;
    commit(clearWorkspace);
    showToast('Cleared the bank and canvas.', 'Undo', undo);
  }

  function clearWorkspace() {
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
    selectionChanged();
    refreshCanvas();
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
  function arrangementToText(container) {
    const canvas = container || $('canvas');
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
    const collapsed = col.classList.toggle('collapsed');
    $('collapseBtn').setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed && isMobile()) $('input').focus();
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
    if (tile.dataset.locked === 'true') o.lk = 1;
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

  // Treat the current state as already saved without adding an undo step.
  function rebaseHistory() {
    lastSaved = JSON.stringify(snapshotState());
    try { localStorage.setItem(STORAGE_KEY, lastSaved); } catch (e) {}
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 400);
  }

  function restoreTile(spec) {
    const tile = createTile(spec.w, spec.k, spec.mc === 1);
    if (spec.bo !== undefined) tile.dataset.bankOrder = String(spec.bo);
    if (spec.lk === 1) tile.dataset.locked = 'true';
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
    selectionChanged();
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
    // Only attributes that are part of the saved state; selection, hints and
    // stress marks are view state and shouldn't trigger saves.
    const opts = {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['data-word', 'data-mid-cap', 'data-locked', 'data-kind']
    };
    observer.observe($('wordBank'), opts);
    observer.observe($('canvas'), opts);
    $('input').addEventListener('input', scheduleSave);
    $('input').addEventListener('input', scheduleSourceAnalysis);
    window.addEventListener('beforeunload', () => {
      clearTimeout(saveTimer);
      if (!dragEl && !pendingDrag) saveStateNow();
    });

    lastSaved = JSON.stringify(snapshotState());
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
    const form = document.createElement('button');
    form.type = 'button';
    form.title = 'What is this form?';
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

  // ---------- PRONUNCIATION DICTIONARY ----------
  // The full CMU-derived dictionary (~1 MB gzipped) loads after the page is
  // usable; until then analysis runs on the built-in word list + heuristics.
  function loadPronunciationData() {
    fetch('data/pronunciations.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        window.TesseraAnalysis.loadPronunciations(data);
        if ($('input').value.trim()) refreshSourceAnalysis();
        updateMeterCounts();
        updateCanvasStatus();
        if (sortMode === 'syllables') sortBank();
        // Better counts aren't an edit — fold them into the current history
        // entry instead of creating an undo step.
        clearTimeout(saveTimer);
        rebaseHistory();
      })
      .catch(() => { /* offline or blocked — heuristics keep working */ });
  }

  // ---------- HELP OVERLAY ----------
  function showHelp() {
    openDialog('helpDialog');
  }

  function dismissHelp() {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
  }

  function maybeShowIntro() {
    let seen = null;
    try { seen = localStorage.getItem(INTRO_KEY); } catch (e) {}
    if (!seen) {
      showHelp();
      dismissHelp(); // shown once is enough; the ? button brings it back
    }
  }


  // =================================================================
  // PREFERENCES (view settings — not part of the poem or undo history)
  // =================================================================
  const PREFS_KEY = 'tessera:prefs:v1';
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEFAULT_PREFS = {
    theme: 'system', font: 'serif', size: 'm',
    reuse: false, scansion: false, highlightSource: true,
    animations: !reducedMotion, haptics: true,
    pasteWidth: 280, bankWidth: 300, bankHeight: 38, bankCollapsed: false,
    target: '', hint: 'off'
  };
  const prefs = Object.assign({}, DEFAULT_PREFS);
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch (e) {}

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  const FONT_STACKS = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
    typewriter: '"Courier Prime", "Courier New", ui-monospace, monospace',
    hand: '"Caveat", "Segoe Print", "Bradley Hand", cursive'
  };
  const WEB_FONTS = { hand: 'Caveat:wght@500;700', typewriter: 'Courier+Prime' };

  // Web fonts load only when someone picks them.
  function ensureWebFont(name) {
    if (!WEB_FONTS[name] || document.getElementById('font-' + name)) return;
    const link = document.createElement('link');
    link.id = 'font-' + name;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + WEB_FONTS[name] + '&display=swap';
    document.head.appendChild(link);
  }

  function applyPrefs() {
    const root = document.documentElement;
    if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme;
    else delete root.dataset.theme;
    const meta = $('themeColorMeta');
    if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#1a1a1a';

    ensureWebFont(prefs.font);
    root.style.setProperty('--canvas-font', FONT_STACKS[prefs.font] || FONT_STACKS.serif);
    root.style.setProperty('--paste-width', prefs.pasteWidth + 'px');
    root.style.setProperty('--bank-width', prefs.bankWidth + 'px');
    root.style.setProperty('--bank-height', prefs.bankHeight + 'vh');
    document.body.dataset.size = prefs.size;
    document.body.classList.toggle('show-scansion', !!prefs.scansion);
    document.body.classList.toggle('no-anim', !prefs.animations);
    document.body.classList.toggle('bank-collapsed', !!prefs.bankCollapsed);
    $('bankToggle').setAttribute('aria-expanded', String(!prefs.bankCollapsed));
    $('bankToggle').setAttribute('aria-label', prefs.bankCollapsed ? 'Expand word bank' : 'Collapse word bank');

    document.querySelectorAll('[data-pref]').forEach((el) => {
      const v = prefs[el.dataset.pref];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    $('hintMode').value = prefs.hint;
    $('targetForm').value = prefs.target;
  }

  function initPrefs() {
    document.querySelectorAll('[data-pref]').forEach((el) => {
      el.addEventListener('change', () => {
        prefs[el.dataset.pref] = el.type === 'checkbox' ? el.checked : el.value;
        savePrefs();
        applyPrefs();
        scheduleDerived();
      });
    });
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      if (mq.addEventListener) mq.addEventListener('change', () => { if (prefs.theme === 'system') applyPrefs(); });
    }
  }

  // =================================================================
  // SMALL UTILITIES — haptics, announcements, toasts, dialogs
  // =================================================================
  // Browsers follow a touch with emulated mouse events; ignore those.
  const TOUCH_MOUSE_GRACE_MS = 800;
  let lastTouchAt = 0;
  document.addEventListener('touchstart', () => { lastTouchAt = Date.now(); }, { capture: true, passive: true });

  function haptic(ms) {
    if (!prefs.haptics || !navigator.vibrate || Date.now() - lastTouchAt > 5000) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate(ms); } catch (e) {}
  }

  // Screen-reader announcement via the polite live region.
  function announce(msg) {
    const el = $('announcer');
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 30);
  }

  function describeTiles(tiles) {
    return tiles.length === 1 ? '“' + tiles[0].textContent + '”' : tiles.length + ' tiles';
  }

  function snippet(text, words) {
    const w = String(text).replace(/\s+/g, ' ').trim().split(' ');
    return w.slice(0, words).join(' ') + (w.length > words ? '…' : '');
  }

  let toastTimer = null;
  function showToast(text, actionLabel, onAction) {
    const toast = $('toast');
    const btn = $('toastAction');
    $('toastText').textContent = text;
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || '';
    btn.onclick = actionLabel ? () => { hideToast(); onAction(); } : null;
    toast.hidden = false;
    toast.classList.remove('show');
    void toast.offsetWidth; // restart the entrance animation
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 7000 : 3500);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').hidden = true;
  }

  // Native <dialog> gives us focus trapping, Esc to close and aria-modal.
  function openDialog(id) {
    const d = $(id);
    if (d.open) return d;
    if (id !== 'confirmDialog') {
      document.querySelectorAll('dialog[open]').forEach((o) => o.close());
    }
    hideContextMenu();
    d.showModal();
    return d;
  }

  function initDialogs() {
    document.querySelectorAll('dialog').forEach((d) => {
      // A click on the backdrop (outside the card) closes the dialog.
      d.addEventListener('click', (e) => {
        if (e.target !== d) return;
        const r = d.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) d.close();
      });
    });
    $('sharedDialog').addEventListener('close', clearShareHash);
  }

  // In-app replacement for window.confirm(). Resolves true on OK.
  function confirmDialog(text, okLabel) {
    return new Promise((resolve) => {
      const d = $('confirmDialog');
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (d.open) d.close();
        resolve(ok);
      };
      $('confirmText').textContent = text;
      $('confirmOk').textContent = okLabel || 'OK';
      $('confirmOk').onclick = () => finish(true);
      $('confirmCancel').onclick = () => finish(false);
      d.addEventListener('close', () => finish(false), { once: true }); // Esc
      openDialog('confirmDialog');
      $('confirmOk').focus();
    });
  }

  // Run a bulk change as exactly one undo step.
  function commit(fn) {
    clearTimeout(saveTimer);
    saveStateNow();
    fn();
    clearTimeout(saveTimer);
    saveStateNow();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // =================================================================
  // CANVAS LINES
  // =================================================================
  // Split the canvas into lines: { sep, tiles }, where sep is the
  // line-break or meter bracket that opens the line (null for line 1).
  function getCanvasLines() {
    const lines = [{ sep: null, tiles: [] }];
    for (const child of $('canvas').children) {
      const isSep = child.classList.contains('line-break') || child.classList.contains('meter-bracket');
      if (isSep) {
        if (lines.length === 1 && !lines[0].sep && !lines[0].tiles.length &&
            child.classList.contains('meter-bracket')) {
          lines[0].sep = child; // a scaffold's first bracket opens line 1
        } else {
          lines.push({ sep: child, tiles: [] });
        }
      } else if (child.classList.contains('word-tile')) {
        lines[lines.length - 1].tiles.push(child);
      }
    }
    return lines;
  }

  function lineNumberOf(tile) {
    const lines = getCanvasLines();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].tiles.indexOf(tile) !== -1) return i + 1;
    }
    return lines.length;
  }

  function lineSyllables(line) {
    let n = 0;
    for (const t of line.tiles) {
      if (t.dataset.kind === 'word') n += countSyllables(t.dataset.word);
      else if (t.dataset.kind === 'line') {
        for (const w of parseSourceWords(t.dataset.word).words) n += countSyllables(w);
      }
    }
    return n;
  }

  function lastWordOfLine(line) {
    for (let i = line.tiles.length - 1; i >= 0; i--) {
      const t = line.tiles[i];
      if (t.dataset.kind === 'word') return t.dataset.word;
      if (t.dataset.kind === 'line') return window.TesseraAnalysis.getLastWord(t.dataset.word);
    }
    return '';
  }

  // Put line contents back in order, reusing each line's separator.
  function rebuildCanvas(lines) {
    const frag = document.createDocumentFragment();
    lines.forEach((l, i) => {
      if (l.sep) frag.appendChild(l.sep);
      else if (i > 0) frag.appendChild(createLineBreak());
      l.tiles.forEach((t) => frag.appendChild(t));
    });
    $('canvas').appendChild(frag);
  }

  function moveLine(tile, dir) {
    const lines = getCanvasLines();
    const i = lines.findIndex((l) => l.tiles.indexOf(tile) !== -1);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lines.length) return false;
    if (lines[i].tiles.concat(lines[j].tiles).some(isLocked)) {
      showToast('A locked tile is holding that line in place.');
      return false;
    }
    animateTiles(() => {
      const a = lines[i].tiles;
      lines[i].tiles = lines[j].tiles;
      lines[j].tiles = a;
      rebuildCanvas(lines);
    });
    refreshCanvas();
    announce('Moved line ' + (i + 1) + ' to line ' + (j + 1) + '.');
    return true;
  }

  function moveTileHorizontally(tile, dir) {
    let sib = dir < 0 ? tile.previousElementSibling : tile.nextElementSibling;
    while (sib && !/\b(word-tile|line-break|meter-bracket)\b/.test(sib.className)) {
      sib = dir < 0 ? sib.previousElementSibling : sib.nextElementSibling;
    }
    if (!sib) return;
    animateTiles(() => {
      if (dir < 0) sib.before(tile); else sib.after(tile);
    });
  }

  function moveTileToLine(tile, dir) {
    const lines = getCanvasLines();
    const i = lines.findIndex((l) => l.tiles.indexOf(tile) !== -1);
    const j = i + dir;
    if (j < 0) return;
    if (j >= lines.length) {
      if (lines[i].tiles.length < 2) return;
      animateTiles(() => {
        $('canvas').appendChild(createLineBreak());
        $('canvas').appendChild(tile);
      });
      return;
    }
    const target = lines[j];
    animateTiles(() => {
      if (target.tiles.length) target.tiles[target.tiles.length - 1].after(tile);
      else if (target.sep) target.sep.after(tile);
      else $('canvas').prepend(tile);
    });
  }

  function breakAfter(tile) {
    const br = createLineBreak();
    if (!tile.nextElementSibling || !/\b(word-tile|line-break|meter-bracket)\b/.test(tile.nextElementSibling.className)) {
      br.classList.add('pending-line'); // nothing follows yet: keep it for the next word
    }
    tile.after(br);
    cleanupBreaks();
  }

  // =================================================================
  // ANIMATION
  // =================================================================
  // FLIP: remember where tiles were, mutate, then animate from old to new.
  function animateTiles(mutate) {
    if (!prefs.animations || !Element.prototype.animate) { mutate(); return; }
    const tiles = Array.from(document.querySelectorAll('#canvas .word-tile, #wordBank .word-tile'));
    if (tiles.length > 600) { mutate(); return; }
    const before = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
    mutate();
    for (const [t, r0] of before) {
      if (!t.isConnected) continue;
      const r1 = t.getBoundingClientRect();
      const dx = r0.left - r1.left;
      const dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      t.animate(
        [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(.2,.75,.25,1)' }
      );
    }
  }

  function popTile(tile) {
    if (!prefs.animations || !tile.animate) return;
    tile.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' });
  }

  // =================================================================
  // SELECTION BAR, LOCKING, TAP-TO-PLACE
  // =================================================================
  function placementTiles() {
    return selectedTiles().concat(Array.from(document.querySelectorAll('#palette .word-tile.selected')));
  }

  function selectionChanged() {
    const sel = placementTiles();
    const touchy = Date.now() - lastTouchAt < 120000;
    const bar = $('selectionBar');
    bar.hidden = sel.length === 0 || (!touchy && sel.length < 2);
    $('selectionCount').textContent = sel.length + ' selected' +
      (touchy ? ' — tap the canvas to place' : '');
    const onCanvasSel = sel.filter(onCanvas);
    const lockBtn = bar.querySelector('[data-action="sel-lock"]');
    lockBtn.hidden = !onCanvasSel.length;
    lockBtn.textContent = onCanvasSel.length && onCanvasSel.every(isLocked) ? 'Unlock' : 'Lock';
    bar.querySelector('[data-action="sel-bank"]').hidden = !onCanvasSel.length;
    if (prefs.hint === 'rhyme') scheduleDerived();
  }

  function setLocked(tile, on) {
    if (on) tile.dataset.locked = 'true'; else delete tile.dataset.locked;
    tile.title = on ? 'Locked — Jumble and Return all leave it in place' : '';
  }

  function toggleLockSelection() {
    const sel = selectedTiles().filter(onCanvas);
    if (!sel.length) return;
    const lock = !sel.every(isLocked);
    sel.forEach((t) => setLocked(t, lock));
    selectionChanged();
    announce(describeTiles(sel) + (lock ? ' locked.' : ' unlocked.'));
  }

  function clearPaletteSelection() {
    document.querySelectorAll('#palette .word-tile.selected').forEach((t) => t.classList.remove('selected'));
  }

  // Touch: a tap selects a tile; the next tap on the canvas places it.
  function tapTile(tile) {
    haptic(8);
    if (tile.dataset.sourceTile === 'true') {
      const was = tile.classList.contains('selected');
      clearPaletteSelection();
      if (!was) { clearSelection(); tile.classList.add('selected'); }
      selectionChanged();
      return;
    }
    clearPaletteSelection();
    toggleSelected(tile);
  }

  function placeSelectionAt(x, y) {
    const chosen = placementTiles().filter((t) => !(isLocked(t) && onCanvas(t)));
    if (!chosen.length) return;
    const tiles = chosen.map((t) => (t.dataset.sourceTile === 'true' || (prefs.reuse && inBank(t)) ? cloneTile(t) : t));
    clearSelection();
    clearPaletteSelection();
    animateTiles(() => {
      tiles.forEach((t) => { t.classList.remove('selected'); t.setAttribute('aria-pressed', 'false'); t.remove(); });
      insertOnCanvas(tiles[0], x, y);
      for (let i = 1; i < tiles.length; i++) tiles[i - 1].after(tiles[i]);
    });
    sortBank();
    selectionChanged();
    refreshCanvas();
    haptic(10);
    tiles.forEach(popTile);
    announce(describeTiles(tiles) + ' placed on line ' + lineNumberOf(tiles[0]) + '.');
  }

  function initTapToPlace() {
    function tapWatcher(el, onTap) {
      let start = null;
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || e.target.closest('.word-tile, button, input, select')) { start = null; return; }
        start = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
      }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (!start) return;
        const t = e.changedTouches[0];
        const tap = Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10 && Date.now() - start.at < 600;
        start = null;
        if (tap && onTap(t.clientX, t.clientY)) e.preventDefault();
      });
    }
    tapWatcher($('canvas'), (x, y) => {
      if (!placementTiles().length) return false;
      placeSelectionAt(x, y);
      return true;
    });
    tapWatcher($('wordBank'), () => {
      if (!selectedTiles().some(onCanvas)) return false;
      returnSelectedToBank();
      return true;
    });
  }

  function sendTilesToBank(tiles) {
    animateTiles(() => {
      for (const tile of tiles) {
        tile.classList.remove('selected');
        if (tile.dataset.kind === 'word' || tile.dataset.kind === 'line') sendToBank(tile);
        else tile.remove();
      }
    });
    selectionChanged();
    refreshCanvas();
  }

  // =================================================================
  // TILE CONTEXT MENU
  // =================================================================
  let menuTile = null;

  function onTileContextMenu(e) {
    e.preventDefault();
    if (Date.now() - lastTouchAt < TOUCH_MOUSE_GRACE_MS) return; // long-press already opened it
    openContextMenu(e.currentTarget, e.clientX, e.clientY);
  }

  function appendToPoem(tile) {
    const t = (tile.dataset.sourceTile === 'true' || (prefs.reuse && inBank(tile))) ? cloneTile(tile) : tile;
    t.classList.remove('selected');
    animateTiles(() => $('canvas').appendChild(t));
    refreshCanvas();
    popTile(t);
    return t;
  }

  function duplicateTile(tile) {
    const copy = cloneTile(tile);
    tile.after(copy);
    if (inBank(tile)) sortBank();
    popTile(copy);
  }

  function deleteTile(tile) {
    const word = tile.textContent;
    commit(() => { tile.remove(); refreshCanvas(); });
    showToast('Deleted “' + word + '”.', 'Undo', undo);
  }

  function selectLine(tile) {
    const line = getCanvasLines().find((l) => l.tiles.indexOf(tile) !== -1);
    if (line) line.tiles.forEach((t) => toggleSelected(t, true));
  }

  function menuItemsFor(tile) {
    const items = [];
    const kind = tile.dataset.kind;
    const textual = kind === 'word' || kind === 'line';
    const here = onCanvas(tile);
    const locked = isLocked(tile);
    if (tile.dataset.sourceTile === 'true') {
      items.push(['Add to end of poem', () => appendToPoem(tile)]);
      return items;
    }
    if (!here && !inBank(tile)) return items;
    if (!here) items.push(['Add to end of poem', () => appendToPoem(tile)]);
    if (here && !locked) items.push(['Send to bank', () => sendTilesToBank([tile])]);
    if (textual) items.push(['Edit…', () => startEdit(tile)]);
    if (textual) items.push(['Duplicate', () => duplicateTile(tile)]);
    if (kind === 'word') {
      const capped = tile.dataset.midCap === 'true';
      items.push([capped ? 'Lowercase mid-sentence' : 'Always capitalize', () => {
        if (capped) delete tile.dataset.midCap; else tile.dataset.midCap = 'true';
        updateSentence();
      }]);
    }
    if (here) items.push([locked ? 'Unlock' : 'Lock in place', () => { setLocked(tile, !locked); selectionChanged(); }]);
    items.push([tile.classList.contains('selected') ? 'Deselect' : 'Select', () => toggleSelected(tile)]);
    if (here) {
      items.push(['Select whole line', () => selectLine(tile)]);
      items.push(['Move line up', () => moveLine(tile, -1)]);
      items.push(['Move line down', () => moveLine(tile, 1)]);
      items.push(['New line after this', () => breakAfter(tile)]);
    }
    if (textual && !locked) items.push(['Delete tile', () => deleteTile(tile), true]);
    return items;
  }

  function openContextMenu(tile, x, y) {
    const items = menuItemsFor(tile);
    if (!items.length) return;
    const menu = $('contextMenu');
    menu.textContent = '';
    const label = document.createElement('div');
    label.className = 'menu-label';
    label.textContent = tile.textContent;
    menu.appendChild(label);
    for (const [text, fn, danger] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.textContent = text;
      if (danger) b.classList.add('danger');
      b.addEventListener('click', () => {
        hideContextMenu(true);
        fn();
        refreshCanvas();
      });
      menu.appendChild(b);
    }
    menuTile = tile;
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    menu.querySelector('button').focus();
  }

  function hideContextMenu(restoreFocus) {
    const menu = $('contextMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus && menuTile && menuTile.isConnected && menuTile.offsetParent) menuTile.focus();
    menuTile = null;
  }

  function initContextMenu() {
    const menu = $('contextMenu');
    menu.addEventListener('keydown', (e) => {
      const buttons = Array.from(menu.querySelectorAll('button'));
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = buttons.length;
        buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        buttons[e.key === 'Home' ? 0 : buttons.length - 1].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        hideContextMenu(true);
      }
      e.stopPropagation();
    });
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.context-menu')) hideContextMenu();
    });
    document.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.context-menu, .word-tile')) hideContextMenu();
    }, { passive: true });
    window.addEventListener('resize', () => hideContextMenu());
    document.addEventListener('scroll', () => hideContextMenu(), true);
  }

  // =================================================================
  // KEYBOARD
  // =================================================================
  function tilesIn(container) {
    return Array.from(container.children).filter((c) => c.classList.contains('word-tile'));
  }

  // One tab stop per tile container; arrow keys move within it.
  function setRovingStop(tile) {
    const c = tile.parentElement;
    if (!c) return;
    for (const t of tilesIn(c)) if (t !== tile && t.tabIndex === 0) t.tabIndex = -1;
    tile.tabIndex = 0;
  }

  function updateRovingTabStops() {
    for (const id of ['canvas', 'wordBank', 'palette']) {
      const tiles = tilesIn($(id));
      if (tiles.length && !tiles.some((t) => t.tabIndex === 0)) tiles[0].tabIndex = 0;
    }
  }

  function focusTile(tile) {
    if (!tile) return;
    setRovingStop(tile);
    tile.focus();
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // The tile visually above/below, preferring the closest horizontally.
  function tileInDirection(tile, dir) {
    const r = tile.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null, bestDy = Infinity, bestDx = Infinity;
    for (const t of tilesIn(tile.parentElement)) {
      if (t === tile) continue;
      const q = t.getBoundingClientRect();
      const dy = (q.top + q.height / 2 - cy) * dir;
      if (dy < r.height / 2) continue;
      const dx = Math.abs(q.left + q.width / 2 - cx);
      if (dy < bestDy - 4 || (Math.abs(dy - bestDy) <= 4 && dx < bestDx)) {
        best = t; bestDy = dy; bestDx = dx;
      }
    }
    return best;
  }

  function positionLabel(tile) {
    const line = getCanvasLines().find((l) => l.tiles.indexOf(tile) !== -1);
    const n = lineNumberOf(tile);
    return '“' + tile.textContent + '” — line ' + n + ', word ' + (line ? line.tiles.indexOf(tile) + 1 : 1);
  }

  function afterKeyboardMove(tile) {
    refreshCanvas();
    tile.focus();
    announce(positionLabel(tile) + '.');
  }

  function onTileKeydown(e) {
    const tile = e.target;
    if (!tile.classList || !tile.classList.contains('word-tile') || tile.dataset.editing === 'true') return false;
    const here = onCanvas(tile);
    const key = e.key;
    const horiz = key === 'ArrowLeft' || key === 'ArrowRight';
    const vert = key === 'ArrowUp' || key === 'ArrowDown';
    if (horiz && !e.altKey) {
      const tiles = tilesIn(tile.parentElement);
      focusTile(tiles[tiles.indexOf(tile) + (key === 'ArrowLeft' ? -1 : 1)]);
    } else if (vert && !e.altKey) {
      focusTile(tileInDirection(tile, key === 'ArrowUp' ? -1 : 1));
    } else if (e.altKey && here && horiz) {
      if (isLocked(tile)) { announce('That tile is locked.'); }
      else { moveTileHorizontally(tile, key === 'ArrowLeft' ? -1 : 1); afterKeyboardMove(tile); }
    } else if (e.altKey && here && vert) {
      const dir = key === 'ArrowUp' ? -1 : 1;
      if (e.shiftKey) { moveLine(tile, dir); tile.focus(); }
      else if (isLocked(tile)) announce('That tile is locked.');
      else { moveTileToLine(tile, dir); afterKeyboardMove(tile); }
    } else if (key === 'Enter') {
      if (here) {
        breakAfter(tile);
        refreshCanvas();
        tile.focus();
        announce('New line started after “' + tile.textContent + '”.');
      } else {
        const siblings = tilesIn(tile.parentElement);
        const next = siblings[siblings.indexOf(tile) + 1] || siblings[siblings.indexOf(tile) - 1];
        const placed = appendToPoem(tile);
        announce('“' + placed.textContent + '” added to the end of the poem, line ' + lineNumberOf(placed) + '.');
        if (placed === tile && next) focusTile(next);
      }
    } else if (key === ' ' || key === 'Spacebar') {
      if (isSelectable(tile)) {
        toggleSelected(tile);
        announce(tile.classList.contains('selected') ? 'Selected.' : 'Deselected.');
      }
    } else if (key === 'F2') {
      startEdit(tile);
    } else if ((key === 'l' || key === 'L') && here && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setLocked(tile, !isLocked(tile));
      selectionChanged();
      announce(isLocked(tile) ? 'Locked.' : 'Unlocked.');
    } else if ((key === 'Delete' || key === 'Backspace') && here && !tile.classList.contains('selected')) {
      if (isLocked(tile)) { announce('That tile is locked.'); }
      else {
        const tiles = tilesIn(tile.parentElement);
        const next = tiles[tiles.indexOf(tile) + 1] || tiles[tiles.indexOf(tile) - 1];
        sendTilesToBank([tile]);
        announce('“' + tile.textContent + '” returned to the bank.');
        if (next) focusTile(next); else $('canvas').focus();
      }
    } else if (key === 'ContextMenu' || (key === 'F10' && e.shiftKey)) {
      const r = tile.getBoundingClientRect();
      openContextMenu(tile, r.left, r.bottom + 4);
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  function onGlobalKeydown(e) {
    if (e.target.closest && e.target.closest('.context-menu')) return;
    if (onTileKeydown(e)) return;
    const editing = isEditingContext(e.target);
    const mod = e.ctrlKey || e.metaKey;
    const key = (e.key || '').toLowerCase();
    if (mod && key === 'z' && !editing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && key === 'y' && !editing) { e.preventDefault(); redo(); return; }
    if (editing || document.querySelector('dialog[open]')) return;
    if (mod && key === 'a' && $('canvas').querySelector('.word-tile')) {
      e.preventDefault();
      $('canvas').querySelectorAll('.word-tile').forEach((t) => toggleSelected(t, true));
      return;
    }
    if (e.key === 'Escape') {
      if (!$('contextMenu').hidden) hideContextMenu(true);
      else if (placementTiles().length) { clearSelection(); clearPaletteSelection(); selectionChanged(); }
      else if (document.body.classList.contains('focus-mode')) toggleFocus(false);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && returnSelectedToBank()) { e.preventDefault(); return; }
    if (mod || e.altKey) return;
    if (e.key === '?') { e.preventDefault(); openDialog('shortcutsDialog'); return; }
    if (key === 'f' && !e.target.closest('button, a')) { e.preventDefault(); toggleFocus(); }
  }

  function initKeyboard() {
    document.addEventListener('keydown', onGlobalKeydown);
    document.addEventListener('focusin', (e) => {
      if (e.target.classList && e.target.classList.contains('word-tile')) setRovingStop(e.target);
    });
  }

  // =================================================================
  // FOCUS MODE & RESIZING
  // =================================================================
  function toggleFocus(force) {
    const on = document.body.classList.toggle('focus-mode', force);
    $('focusBtn').setAttribute('aria-pressed', String(on));
    announce(on ? 'Focus mode on. Press F or Escape to leave.' : 'Focus mode off.');
  }

  function toggleBank() {
    prefs.bankCollapsed = !prefs.bankCollapsed;
    savePrefs();
    applyPrefs();
  }

  function dragResize(handle, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const start = { x: e.clientX, y: e.clientY };
      const begin = onMove(null);
      const move = (ev) => onMove({ dx: ev.clientX - start.x, dy: ev.clientY - start.y, begin: begin });
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        document.body.classList.remove('resizing');
        savePrefs();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function initResizers() {
    document.querySelectorAll('.col-resizer').forEach((handle) => {
      const col = $(handle.dataset.resize);
      const key = col.id === 'pasteColumn' ? 'pasteWidth' : 'bankWidth';
      const min = key === 'pasteWidth' ? 200 : 220;
      const max = key === 'pasteWidth' ? 560 : 600;
      const setWidth = (w) => {
        prefs[key] = Math.round(Math.max(min, Math.min(max, w)));
        applyPrefs();
      };
      dragResize(handle, (d) => {
        if (!d) return col.getBoundingClientRect().width;
        if (!col.classList.contains('collapsed')) setWidth(d.begin + d.dx);
      });
      handle.addEventListener('dblclick', () => { setWidth(DEFAULT_PREFS[key]); savePrefs(); });
      handle.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        setWidth(prefs[key] + (e.key === 'ArrowLeft' ? -16 : 16));
        savePrefs();
      });
    });
    // Phones: drag the top edge of the bank to trade space with the canvas.
    dragResize($('bankResizer'), (d) => {
      if (!d) return $('bankColumn').getBoundingClientRect().height;
      const h = (d.begin - d.dy) / window.innerHeight * 100;
      prefs.bankHeight = Math.round(Math.max(16, Math.min(75, h)));
      prefs.bankCollapsed = false;
      applyPrefs();
    });
  }

  // =================================================================
  // DERIVED VIEW STATE — stress marks, source highlights, hints, target
  // =================================================================
  let derivedQueued = false;

  function scheduleDerived() {
    if (derivedQueued) return;
    derivedQueued = true;
    // A short timer rather than requestAnimationFrame, which never fires in
    // hidden tabs and would leave hints stale until the tab is shown.
    setTimeout(() => {
      derivedQueued = false;
      if (dragEl) return;
      updateScansion();
      updateSourceHighlight();
      updateHints();
      updateTargetPanel();
      updateRovingTabStops();
    }, 30);
  }

  function initDerived() {
    const mo = new MutationObserver(scheduleDerived);
    const opts = {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['data-word', 'data-locked', 'data-mid-cap']
    };
    mo.observe($('canvas'), opts);
    mo.observe($('wordBank'), opts);
    $('input').addEventListener('input', scheduleDerived);
    $('input').addEventListener('scroll', syncBackdrop);
    window.addEventListener('resize', scheduleDerived);
  }

  const STRESS_MARKS = { '1': '´', '0': '˘' };

  function updateScansion() {
    const tiles = $('canvas').querySelectorAll('.word-tile');
    for (const t of tiles) {
      let scan = '';
      if (prefs.scansion && t.dataset.kind === 'word') {
        scan = window.TesseraAnalysis.getWordStress(t.dataset.word)
          .split('').map((d) => STRESS_MARKS[d] || '').join(' ');
      }
      if (scan) { if (t.dataset.scan !== scan) t.dataset.scan = scan; }
      else if (t.hasAttribute('data-scan')) t.removeAttribute('data-scan');
    }
  }

  // Mirror the textarea in a backdrop and mark words already on the canvas.
  function updateSourceHighlight() {
    const backdrop = $('sourceBackdrop');
    const ta = $('input');
    const text = ta.value;
    const canvasTiles = Array.from($('canvas').querySelectorAll('.word-tile'));
    const show = !!(prefs.highlightSource && text && canvasTiles.length && text.length < 60000);
    $('sourceLegend').hidden = !show;
    ta.classList.toggle('with-backdrop', show);
    backdrop.textContent = '';
    if (!show) return;

    const wordsLeft = new Map();
    const linesLeft = new Map();
    for (const t of canvasTiles) {
      const w = (t.dataset.word || '').toLowerCase();
      const map = t.dataset.kind === 'line' ? linesLeft : (t.dataset.kind === 'word' ? wordsLeft : null);
      if (map) map.set(w.trim(), (map.get(w.trim()) || 0) + 1);
    }
    const take = (map, key) => {
      const n = map.get(key);
      if (!n) return false;
      map.set(key, n - 1);
      return true;
    };
    const mark = (s) => {
      const m = document.createElement('mark');
      m.textContent = s;
      return m;
    };
    let wordRe;
    try { wordRe = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu; }
    catch (e) { wordRe = /[A-Za-z0-9][A-Za-z0-9'’\-]*/g; }

    const frag = document.createDocumentFragment();
    for (const part of text.split(/(\n)/)) {
      if (part === '\n' || !part) { frag.appendChild(document.createTextNode(part)); continue; }
      if (linesLeft.size && take(linesLeft, part.trim().toLowerCase())) { frag.appendChild(mark(part)); continue; }
      let last = 0;
      let m;
      wordRe.lastIndex = 0;
      while ((m = wordRe.exec(part)) !== null) {
        if (!take(wordsLeft, m[0].toLowerCase())) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(part.slice(last, m.index)));
        frag.appendChild(mark(m[0]));
        last = m.index + m[0].length;
      }
      if (last < part.length) frag.appendChild(document.createTextNode(part.slice(last)));
    }
    frag.appendChild(document.createTextNode('\n'));
    backdrop.appendChild(frag);
    syncBackdrop();
  }

  function syncBackdrop() {
    const ta = $('input');
    const backdrop = $('sourceBackdrop');
    // Match the textarea's text box exactly (its scrollbar narrows the text).
    backdrop.style.width = (ta.clientWidth + 2) + 'px';
    backdrop.style.height = ta.offsetHeight + 'px';
    backdrop.scrollTop = ta.scrollTop;
  }

  // ---------- TARGET FORMS ----------
  const repeat = (n, times) => Array.from({ length: times }, () => n);
  const TARGET_FORMS = [
    { id: 'haiku', label: 'Haiku', syllables: [5, 7, 5] },
    { id: 'tanka', label: 'Tanka', syllables: [5, 7, 5, 7, 7] },
    { id: 'lune', label: 'Lune', syllables: [5, 3, 5] },
    { id: 'cinquain', label: 'Cinquain', syllables: [2, 4, 6, 8, 2] },
    { id: 'fib', label: 'Fib', syllables: [1, 1, 2, 3, 5, 8] },
    { id: 'nonet', label: 'Nonet', syllables: [9, 8, 7, 6, 5, 4, 3, 2, 1] },
    { id: 'couplet', label: 'Heroic couplet', syllables: [10, 10], tolerance: 1, rhyme: 'AA' },
    { id: 'common-meter', label: 'Common-meter quatrain', syllables: [8, 6, 8, 6], rhyme: 'xAxA' },
    { id: 'limerick', label: 'Limerick', syllables: [8, 8, 5, 5, 8], tolerance: 1, rhyme: 'AABBA' },
    { id: 'triolet', label: 'Triolet', syllables: repeat(8, 8), tolerance: 1, rhyme: 'ABAAABAB' },
    { id: 'sonnet-shakespearean', label: 'Shakespearean sonnet', syllables: repeat(10, 14), tolerance: 1, rhyme: 'ABABCDCDEFEFGG' },
    { id: 'sonnet-petrarchan', label: 'Petrarchan sonnet', syllables: repeat(10, 14), tolerance: 1, rhyme: 'ABBAABBACDECDE' },
    { id: 'villanelle', label: 'Villanelle', syllables: repeat(10, 19), tolerance: 1, rhyme: 'ABAABAABAABAABAABAA' }
  ];

  function currentTargetForm() {
    return TARGET_FORMS.find((f) => f.id === prefs.target) || null;
  }

  function nonEmptyCanvasLines() {
    const lines = getCanvasLines();
    if (lines.length === 1 && !lines[0].tiles.length && !lines[0].sep) return [];
    return lines;
  }

  // The first line still short of its syllable target, from the scaffold
  // brackets if present, otherwise from the chosen target form.
  function openLineSlot() {
    const lines = nonEmptyCanvasLines();
    const isBracket = (l) => l && l.sep && l.sep.classList.contains('meter-bracket');
    let specs;
    if (lines.some(isBracket)) {
      specs = lines.map((l) => (isBracket(l)
        ? { target: Number(l.sep.dataset.targetSyllables), letter: l.sep.dataset.rhymeLetter || '' }
        : null));
    } else {
      const form = currentTargetForm();
      if (!form) return null;
      specs = form.syllables.map((n, i) => ({ target: n, letter: (form.rhyme || '')[i] || '' }));
    }
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (!spec) continue;
      const have = lines[i] ? lineSyllables(lines[i]) : 0;
      if (have >= spec.target) continue;
      let rhymeWith = '';
      if (/^[A-Z]$/.test(spec.letter)) {
        for (let k = 0; k < i && !rhymeWith; k++) {
          if (specs[k] && specs[k].letter === spec.letter && lines[k]) rhymeWith = lastWordOfLine(lines[k]);
        }
      }
      return { line: i + 1, target: spec.target, remaining: spec.target - have, rhymeWith: rhymeWith };
    }
    return null;
  }

  function rhymeTargetWord() {
    const sel = selectedTiles().filter((t) => t.dataset.kind === 'word');
    if (sel.length === 1) return sel[0].dataset.word;
    const slot = openLineSlot();
    if (slot && slot.rhymeWith) return slot.rhymeWith;
    const lines = nonEmptyCanvasLines().filter((l) => lastWordOfLine(l));
    if (!lines.length) return '';
    return lastWordOfLine(lines.length >= 2 ? lines[lines.length - 2] : lines[0]);
  }

  function tileSyllables(t) {
    if (t.dataset.kind === 'word') return countSyllables(t.dataset.word);
    if (t.dataset.kind === 'line') return parseSourceWords(t.dataset.word).words.reduce((n, w) => n + countSyllables(w), 0);
    return 0;
  }

  function updateHints() {
    const bankTiles = Array.from($('wordBank').querySelectorAll('.word-tile'));
    bankTiles.forEach((t) => t.classList.remove('hint-match', 'hint-near'));
    const note = $('hintNote');
    note.textContent = '';
    if (prefs.hint === 'off' || !bankTiles.length) return;
    const A = window.TesseraAnalysis;
    if (prefs.hint === 'rhyme') {
      const target = rhymeTargetWord();
      if (!target) { note.textContent = 'Put a line on the canvas (or select a word) to see its rhymes.'; return; }
      const key = A.getRhymeKey(target);
      let n = 0;
      for (const t of bankTiles) {
        const w = t.dataset.kind === 'line' ? A.getLastWord(t.dataset.word) : t.dataset.word;
        if (w && w.toLowerCase() !== target.toLowerCase() && A.getRhymeKey(w) === key) {
          t.classList.add('hint-match');
          n++;
        }
      }
      note.textContent = n
        ? n + (n === 1 ? ' word rhymes' : ' words rhyme') + ' with “' + target + '”'
        : 'Nothing in the bank rhymes with “' + target + '”';
    } else {
      const slot = openLineSlot();
      if (!slot) {
        const hasTargets = currentTargetForm() || $('canvas').querySelector('.meter-bracket');
        note.textContent = hasTargets
          ? 'Every line has all its syllables.'
          : 'Use Match source meter or Aim for a form to set line lengths.';
        return;
      }
      let exact = 0;
      for (const t of bankTiles) {
        const n = tileSyllables(t);
        if (n === slot.remaining) { t.classList.add('hint-match'); exact++; }
        else if (n > 0 && n < slot.remaining) t.classList.add('hint-near');
      }
      note.textContent = 'Line ' + slot.line + ' needs ' + slot.remaining +
        (slot.remaining === 1 ? ' more syllable' : ' more syllables') +
        (exact ? ' — ' + exact + ' word' + (exact === 1 ? '' : 's') + ' fit exactly' : '');
    }
  }

  function updateTargetPanel() {
    const panel = $('targetPanel');
    const form = currentTargetForm();
    panel.hidden = !form;
    if (!form) return;
    const A = window.TesseraAnalysis;
    const lines = nonEmptyCanvasLines();
    const tol = form.tolerance || 0;
    const n = form.syllables.length;
    const rows = [];
    for (let i = 0; i < Math.max(n, lines.length); i++) {
      const target = form.syllables[i];
      const have = lines[i] ? lineSyllables(lines[i]) : 0;
      let status;
      if (i >= n) status = 'extra';
      else if (!lines[i] || !lines[i].tiles.length) status = 'todo';
      else if (Math.abs(have - target) <= tol) status = 'ok';
      else status = have < target ? 'short' : 'over';
      const letter = form.rhyme ? form.rhyme[i] || '' : '';
      rows.push({ i: i, target: target, have: have, status: status, letter: letter,
        word: lines[i] ? lastWordOfLine(lines[i]) : '' });
    }
    // Rhyme check: every line in a letter group must rhyme with the group's first word.
    const firstKey = {};
    for (const r of rows) {
      if (!/^[A-Z]$/.test(r.letter) || !r.word) continue;
      const key = A.getRhymeKey(r.word);
      if (!(r.letter in firstKey)) { firstKey[r.letter] = key; r.rhyme = 'first'; }
      else r.rhyme = key === firstKey[r.letter] ? 'ok' : 'bad';
    }
    const linesOk = rows.every((r) => r.status === 'ok');
    const rhymesOk = rows.every((r) => r.rhyme !== 'bad');
    const done = linesOk && rhymesOk && lines.length === n;

    panel.textContent = '';
    panel.classList.toggle('complete', done);
    const head = document.createElement('div');
    head.className = 'target-head';
    const title = document.createElement('strong');
    title.textContent = done ? '✓ ' + form.label + ' complete' : form.label;
    head.appendChild(title);
    const count = document.createElement('span');
    count.textContent = Math.min(lines.length, 99) + '/' + n + ' lines';
    head.appendChild(count);
    const scaffoldBtn = document.createElement('button');
    scaffoldBtn.type = 'button';
    scaffoldBtn.className = 'link-btn';
    scaffoldBtn.textContent = 'Scaffold';
    scaffoldBtn.title = 'Add a syllable bracket for every line of the form';
    scaffoldBtn.addEventListener('click', scaffoldTargetForm);
    head.appendChild(scaffoldBtn);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'link-btn';
    closeBtn.setAttribute('aria-label', 'Stop aiming for ' + form.label);
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => { prefs.target = ''; savePrefs(); applyPrefs(); scheduleDerived(); });
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const list = document.createElement('ol');
    list.className = 'target-rows';
    const symbols = { ok: '✓', short: '↓', over: '↑', todo: '·', extra: '+' };
    for (const r of rows.slice(0, 24)) {
      const li = document.createElement('li');
      li.className = 'row-' + r.status;
      const syl = document.createElement('span');
      syl.className = 'row-syl';
      syl.textContent = r.i >= n ? 'extra line' : r.have + '/' + r.target + ' ' + symbols[r.status];
      li.appendChild(syl);
      if (/^[A-Z]$/.test(r.letter)) {
        const rh = document.createElement('span');
        rh.className = 'row-rhyme rhyme-' + (r.rhyme || 'none');
        rh.textContent = r.letter + (r.rhyme === 'ok' ? ' ✓' : r.rhyme === 'bad' ? ' ✗' : '');
        rh.title = r.rhyme === 'bad' ? '“' + r.word + '” doesn’t rhyme with the other ' + r.letter + ' lines' : 'Rhyme group ' + r.letter;
        li.appendChild(rh);
      }
      list.appendChild(li);
    }
    panel.appendChild(list);
  }

  function scaffoldTargetForm() {
    const form = currentTargetForm();
    if (!form) return;
    commit(() => {
      const canvas = $('canvas');
      const lines = getCanvasLines().filter((l) => l.tiles.length);
      canvas.querySelectorAll('.line-break, .meter-bracket').forEach((b) => b.remove());
      const frag = document.createDocumentFragment();
      form.syllables.forEach((n, i) => {
        const letter = form.rhyme && /^[A-Z]$/.test(form.rhyme[i]) ? form.rhyme[i] : '';
        frag.appendChild(createMeterBracket(i + 1, n, letter));
        if (lines[i]) lines[i].tiles.forEach((t) => frag.appendChild(t));
      });
      for (let i = form.syllables.length; i < lines.length; i++) {
        frag.appendChild(createLineBreak());
        lines[i].tiles.forEach((t) => frag.appendChild(t));
      }
      canvas.appendChild(frag);
      refreshCanvas();
    });
    showToast('Scaffold ready — one bracket per line of the ' + form.label.toLowerCase() + '.', 'Undo', undo);
  }

  // ---------- EXPLAIN A DETECTED FORM ----------
  function explainMeter(meter) {
    if (!meter) return;
    const p = meter.pattern;
    $('explainTitle').textContent = p.label;
    $('explainDesc').textContent = PATTERN_DESCRIPTIONS[p.name] ||
      (p.name === 'free verse'
        ? 'No fixed pattern of line lengths, rhyme or meter was found — which is exactly what free verse is.'
        : 'A recognizable, repeating pattern of syllables per line.');
    const facts = $('explainFacts');
    facts.textContent = '';
    const add = (label, value) => {
      const li = document.createElement('li');
      const b = document.createElement('strong');
      b.textContent = label + ': ';
      li.appendChild(b);
      li.appendChild(document.createTextNode(String(value)));
      facts.appendChild(li);
    };
    const counts = meter.lineMeters.map((l) => l.syllables);
    add('Lines', meter.lineCount);
    add('Syllables per line', counts.slice(0, 30).join(' – ') + (counts.length > 30 ? ' …' : ''));
    if (meter.rhyme && /[A-Z]/.test(meter.rhyme.scheme || '')) {
      const named = nameRhymeScheme(meter.rhyme.scheme);
      add('Rhyme scheme', meter.rhyme.scheme + (named ? ' (' + named + ')' : ''));
    }
    const feet = {};
    for (const lm of meter.lineMeters) if (lm.footScore >= 0.65 && lm.foot) feet[lm.foot] = (feet[lm.foot] || 0) + 1;
    const top = Object.keys(feet).sort((a, b) => feet[b] - feet[a])[0];
    if (top) add('Rhythm', top + ' feet in ' + feet[top] + ' of ' + meter.lineCount + ' lines');
    add('Confidence', p.confidence);
    add('How it was found', 'Tessera checks its 100+ form definitions in order — line count, syllables per line, rhyme scheme, repeated lines and stress — and reports the first one that fits.');
    openDialog('explainDialog');
  }

  // =================================================================
  // SOURCE TEXT: SAMPLES, FIND A POEM, ADD A WORD
  // =================================================================
  function setSourceText(text, label) {
    commit(() => {
      $('input').value = text;
      refreshSourceAnalysis();
      loadWords({ confirmed: true });
    });
    showToast('Loaded ' + label + ' and broke it into words.', 'Undo', undo);
  }

  function initSamples() {
    const select = $('sampleSelect');
    for (const s of window.TESSERA_SAMPLES || []) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.label;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      const s = (window.TESSERA_SAMPLES || []).find((x) => x.id === select.value);
      select.value = '';
      if (s) setSourceText(s.text, '“' + s.label + '”');
    });
  }

  function loadRandomSample() {
    const poems = (window.TESSERA_SAMPLES || []).slice(0, 4);
    const s = poems[Math.floor(Math.random() * poems.length)];
    if (!s) return;
    $('helpDialog').close();
    if ($('pasteColumn').classList.contains('collapsed') && !isMobile()) togglePasteColumn();
    setSourceText(s.text, '“' + s.label + '”');
  }

  const POETRYDB = 'https://poetrydb.org';

  async function searchPoems(e) {
    e.preventDefault();
    const q = $('findQuery').value.trim();
    if (!q) return;
    const field = $('findField').value === 'author' ? 'author' : 'title';
    const status = $('findStatus');
    const list = $('findResults');
    list.textContent = '';
    status.textContent = 'Searching…';
    try {
      const res = await fetch(POETRYDB + '/' + field + '/' + encodeURIComponent(q) + '/author,title,linecount');
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) { status.textContent = 'No poems found for “' + q + '”.'; return; }
      status.textContent = data.length > 60 ? 'Showing 60 of ' + data.length + ' poems.' : data.length + (data.length === 1 ? ' poem.' : ' poems.');
      for (const p of data.slice(0, 60)) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'find-result';
        const t = document.createElement('strong');
        t.textContent = p.title;
        const meta = document.createElement('span');
        meta.className = 'lib-meta';
        meta.textContent = p.author + ' · ' + p.linecount + ' lines';
        b.appendChild(t);
        b.appendChild(meta);
        b.addEventListener('click', () => loadFoundPoem(p.title, p.author));
        li.appendChild(b);
        list.appendChild(li);
      }
    } catch (err) {
      status.textContent = 'Couldn’t reach PoetryDB. Check your connection and try again.';
    }
  }

  async function loadFoundPoem(title, author) {
    const status = $('findStatus');
    status.textContent = 'Loading “' + title + '”…';
    try {
      const url = POETRYDB + '/title,author/' + encodeURIComponent(title) + ':abs;' + encodeURIComponent(author) + ':abs';
      const data = await (await fetch(url)).json();
      const poem = Array.isArray(data) && data[0];
      if (!poem || !Array.isArray(poem.lines)) throw new Error('not found');
      $('findDialog').close();
      if ($('pasteColumn').classList.contains('collapsed') && !isMobile()) togglePasteColumn();
      setSourceText(poem.lines.join('\n'), '“' + poem.title + '” by ' + poem.author);
    } catch (err) {
      status.textContent = 'Couldn’t load that poem. Try another, or check your connection.';
    }
  }

  function addOwnWords(e) {
    e.preventDefault();
    const input = $('addWordInput');
    const words = parseSourceWords(input.value).words;
    if (!words.length) return;
    const bank = $('wordBank');
    const empty = bank.querySelector('.empty-bank');
    if (empty) empty.remove();
    const added = words.map((w) => {
      const t = createTile(w, 'word', startsWithUpper(w) || KNOWN_PROPER_NOUNS.has(w.toLowerCase()));
      bank.appendChild(t);
      return t;
    });
    sortBank();
    updateCounter();
    added.forEach(popTile);
    input.value = '';
    announce(describeTiles(added) + ' added to the bank.');
  }

  // =================================================================
  // LIBRARY
  // =================================================================
  const LIBRARY_KEY = 'tessera:library:v1';

  function loadLibrary() {
    try {
      const lib = JSON.parse(localStorage.getItem(LIBRARY_KEY));
      if (lib && Array.isArray(lib.poems)) return lib;
    } catch (e) {}
    return { currentId: null, poems: [] };
  }

  function storeLibrary(lib) {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
      return true;
    } catch (e) {
      showToast('Browser storage is full — couldn’t save to the Library.');
      return false;
    }
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function workspaceHasContent() {
    return !!($('canvas').querySelector('.word-tile, .meter-bracket') ||
              $('wordBank').querySelector('.word-tile') || $('input').value.trim());
  }

  // Render saved canvas items to text without touching the live canvas.
  function textFromItems(items) {
    const box = document.createElement('div');
    const counter = bankOrderCounter;
    for (const item of (items || []).slice(0, 20000)) {
      if (item.t === 'w' && typeof item.w === 'string') box.appendChild(restoreTile(item));
      else if (item.t === 'b' || item.t === 'm') box.appendChild(createLineBreak());
    }
    bankOrderCounter = counter;
    while (box.firstChild && box.firstChild.classList.contains('line-break')) box.firstChild.remove();
    updateSentence(box);
    return arrangementToText(box);
  }

  // Saved or shared state may come from a file or link: rebuild the status
  // panel ourselves instead of trusting stored markup.
  function sanitizeState(state) {
    const s = Object.assign({}, state);
    s.status = '';
    s.bank = Array.isArray(s.bank) ? s.bank.filter((t) => t && typeof t.w === 'string') : [];
    s.canvas = Array.isArray(s.canvas) ? s.canvas.filter((t) => t && (t.t !== 'w' || typeof t.w === 'string')).map((t) => {
      if (t.t !== 'm') return t;
      return { t: 'm', n: Number(t.n) || 1, s: Number(t.s) || 0, r: /^[A-Za-z–]$/.test(t.r || '') ? t.r : '' };
    }) : [];
    s.input = typeof s.input === 'string' ? s.input : '';
    const maxBo = s.bank.concat(s.canvas).reduce((m, t) => Math.max(m, Number(t.bo) || 0), 0);
    s.bankCounter = Math.max(Number(s.bankCounter) || 0, maxBo + 1);
    return s;
  }

  function openState(state) {
    const s = sanitizeState(state);
    commit(() => {
      applySnapshot(s);
      if (s.input.trim()) refreshSourceAnalysis();
    });
  }

  function formatDate(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function renderLibrary() {
    const lib = loadLibrary();
    const list = $('libraryList');
    list.textContent = '';
    const current = lib.poems.find((p) => p.id === lib.currentId);
    $('libraryName').value = current ? current.name : '';
    $('librarySaveBtn').textContent = current ? 'Save' : 'Save current';
    if (!lib.poems.length) {
      const li = document.createElement('li');
      li.className = 'lib-empty';
      li.textContent = 'No saved poems yet. Name your current poem above and save it.';
      list.appendChild(li);
      return;
    }
    const poems = lib.poems.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    for (const p of poems) {
      const li = document.createElement('li');
      li.className = 'lib-item' + (p.id === lib.currentId ? ' current' : '');
      const main = document.createElement('div');
      main.className = 'lib-main';
      const name = document.createElement('strong');
      name.className = 'lib-name';
      name.textContent = p.name;
      main.appendChild(name);
      if (p.id === lib.currentId) {
        const badge = document.createElement('span');
        badge.className = 'lib-badge';
        badge.textContent = 'open';
        main.appendChild(badge);
      }
      const meta = document.createElement('span');
      meta.className = 'lib-meta';
      const first = (textFromItems(p.state && p.state.canvas).split('\n').find((l) => l.trim()) || '').slice(0, 70);
      meta.textContent = formatDate(p.updated) + (first ? ' · ' + first : '');
      main.appendChild(meta);
      li.appendChild(main);
      const actions = document.createElement('div');
      actions.className = 'lib-actions';
      for (const [act, label] of [['open', 'Open'], ['rename', 'Rename'], ['duplicate', 'Duplicate'], ['delete', 'Delete']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = act === 'open' ? 'btn-primary' : 'btn-secondary';
        b.textContent = label;
        b.setAttribute('aria-label', label + ' ' + p.name);
        b.addEventListener('click', () => libraryAction(act, p.id, li));
        actions.appendChild(b);
      }
      li.appendChild(actions);
      list.appendChild(li);
    }
  }

  function saveToLibrary(e) {
    e.preventDefault();
    clearTimeout(saveTimer);
    saveStateNow();
    const lib = loadLibrary();
    const typed = $('libraryName').value.trim();
    const current = lib.poems.find((p) => p.id === lib.currentId);
    const state = snapshotState();
    if (current && (!typed || typed === current.name)) {
      current.state = state;
      current.updated = Date.now();
    } else {
      const poem = { id: newId(), name: typed || 'Untitled poem ' + (lib.poems.length + 1), updated: Date.now(), state: state };
      lib.poems.push(poem);
      lib.currentId = poem.id;
    }
    if (storeLibrary(lib)) {
      renderLibrary();
      showToast('Saved to the Library.');
    }
  }

  function libraryAction(action, id, li) {
    const lib = loadLibrary();
    const idx = lib.poems.findIndex((p) => p.id === id);
    const poem = lib.poems[idx];
    if (!poem) return;
    if (action === 'open') {
      openState(poem.state);
      lib.currentId = id;
      storeLibrary(lib);
      $('libraryDialog').close();
      showToast('Opened “' + poem.name + '”.', 'Undo', undo);
    } else if (action === 'duplicate') {
      lib.poems.push({ id: newId(), name: poem.name + ' (copy)', updated: Date.now(), state: poem.state });
      storeLibrary(lib);
      renderLibrary();
    } else if (action === 'delete') {
      lib.poems.splice(idx, 1);
      if (lib.currentId === id) lib.currentId = null;
      storeLibrary(lib);
      renderLibrary();
      showToast('Deleted “' + poem.name + '” from the Library.', 'Undo', () => {
        const again = loadLibrary();
        again.poems.push(poem);
        storeLibrary(again);
        if ($('libraryDialog').open) renderLibrary();
      });
    } else if (action === 'rename') {
      const nameEl = li.querySelector('.lib-name');
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 80;
      input.value = poem.name;
      input.className = 'lib-rename';
      input.setAttribute('aria-label', 'New name');
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        const name = input.value.trim();
        if (save && name) {
          const again = loadLibrary();
          const p = again.poems.find((x) => x.id === id);
          if (p) { p.name = name; storeLibrary(again); }
        }
        renderLibrary();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    }
  }

  function newBlankPoem() {
    commit(() => {
      clearWorkspace();
      $('input').value = '';
    });
    const lib = loadLibrary();
    lib.currentId = null;
    storeLibrary(lib);
    $('libraryDialog').close();
    showToast('Started a blank poem.', 'Undo', undo);
  }

  // Keep a copy of the workspace before something replaces it wholesale.
  function stashWorkspace(reason) {
    if (!workspaceHasContent()) return false;
    const lib = loadLibrary();
    lib.poems.push({ id: newId(), name: reason + ' — ' + formatDate(Date.now()), updated: Date.now(), state: snapshotState() });
    return storeLibrary(lib);
  }

  // =================================================================
  // SHARE LINKS — the poem travels inside the URL fragment
  // =================================================================
  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function bytesFromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function encodeShare(payload) {
    const json = JSON.stringify(payload);
    if (window.CompressionStream) {
      try {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return 'z.' + b64urlFromBytes(new Uint8Array(await new Response(stream).arrayBuffer()));
      } catch (e) { /* fall through to uncompressed */ }
    }
    return 'j.' + b64urlFromBytes(new TextEncoder().encode(json));
  }

  async function decodeShare(code) {
    const bytes = bytesFromB64url(code.slice(2));
    let json;
    if (code.startsWith('z.')) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      json = await new Response(stream).text();
    } else {
      json = new TextDecoder().decode(bytes);
    }
    return JSON.parse(json);
  }

  async function buildShareUrl() {
    const snap = snapshotState();
    const payload = { v: 1, c: snap.canvas };
    if ($('shareIncludeSource').checked) { payload.i = snap.input; payload.b = snap.bank; }
    return location.origin + location.pathname + '#p=' + (await encodeShare(payload));
  }

  async function refreshShareUrl() {
    const url = await buildShareUrl();
    $('shareUrl').value = url;
    const kb = (url.length / 1024).toFixed(1);
    $('shareSize').textContent = url.length > 8000
      ? 'Long link (' + kb + ' KB). Some chat apps cut long links; try leaving out the source text.'
      : kb + ' KB link';
  }

  function openShare() {
    if (!$('canvas').querySelector('.word-tile')) {
      showToast('Put some words on the canvas first.');
      return;
    }
    openDialog('shareDialog');
    $('shareNativeBtn').hidden = !navigator.share;
    refreshShareUrl();
  }

  let pendingShared = null;

  async function checkSharedLink() {
    const m = location.hash.match(/^#p=([jz]\.[A-Za-z0-9_-]+)$/);
    if (!m) return false;
    try {
      const raw = await decodeShare(m[1]);
      pendingShared = sanitizeState({ canvas: raw.c, bank: raw.b, input: raw.i });
    } catch (e) {
      pendingShared = null;
      clearShareHash();
      showToast('That share link looks damaged and couldn’t be opened.');
      return false;
    }
    $('sharedPoem').textContent = textFromItems(pendingShared.canvas) || '(an empty poem)';
    $('sharedSource').textContent = pendingShared.input
      ? 'Rearranged from: “' + snippet(pendingShared.input, 14) + '”'
      : '';
    openDialog('sharedDialog');
    return true;
  }

  function openSharedCopy() {
    const shared = pendingShared;
    if (!shared) return;
    pendingShared = null;
    const stashed = stashWorkspace('Before opening a shared poem');
    openState({
      input: shared.input, bank: shared.bank, canvas: shared.canvas,
      sortMode: sortMode, collapsed: $('pasteColumn').classList.contains('collapsed')
    });
    const lib = loadLibrary();
    lib.currentId = null;
    storeLibrary(lib);
    $('sharedDialog').close();
    clearShareHash();
    showToast(stashed ? 'Opened a copy. Your previous work is saved in the Library.' : 'Opened a copy to remix.', 'Undo', undo);
  }

  function clearShareHash() {
    if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search);
  }

  // =================================================================
  // EXPORT — image, text formats, backup
  // =================================================================
  function poemLinesForImage() {
    const lines = [];
    let cur = [];
    for (const child of $('canvas').children) {
      if (child.classList.contains('line-break') || child.classList.contains('meter-bracket')) {
        if (cur.length) lines.push(cur);
        cur = [];
      } else if (child.classList.contains('word-tile')) {
        if (child.dataset.kind === 'line') {
          if (cur.length) lines.push(cur);
          lines.push([{ text: child.textContent, kind: 'line' }]);
          cur = [];
        } else {
          cur.push({ text: child.textContent, kind: child.dataset.kind });
        }
      }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  function renderExportPreview() {
    const lines = poemLinesForImage();
    const draw = () => window.TesseraExport.renderPoemImage($('exportPreview'), {
      lines: lines.length ? lines : [[{ text: 'Your', kind: 'word' }, { text: 'poem', kind: 'word' }, { text: 'here', kind: 'word' }]],
      style: $('imgStyle').value,
      theme: $('imgTheme').value,
      title: $('imgTitle').value,
      font: FONT_STACKS[prefs.font],
      footer: 'Made with Tessera · donkeyeatsbacon-web.github.io/tessera'
    });
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  }

  function openExport() {
    openDialog('exportDialog');
    let canShareFiles = false;
    try {
      canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
    } catch (e) {}
    $('shareImageBtn').hidden = !canShareFiles;
    renderExportPreview();
  }

  function exportImageBlob() {
    return new Promise((resolve) => $('exportPreview').toBlob(resolve, 'image/png'));
  }

  function textForFormat(fmt) {
    const plain = arrangementToText();
    if (!plain) return '';
    if (fmt === 'markdown') {
      const title = $('imgTitle').value.trim();
      const body = plain
        .replace(/([\\`*_#>\[\]])/g, '\\$1')
        .replace(/([^\n])\n(?!\n)/g, '$1  \n'); // single newlines become hard breaks
      return (title ? '## ' + title + '\n\n' : '') + body;
    }
    if (fmt === 'attributed') {
      const src = $('input').value.trim();
      return plain + (src ? '\n\n— rearranged from “' + snippet(src, 10) + '”' : '') +
        '\nMade with Tessera · https://donkeyeatsbacon-web.github.io/tessera/';
    }
    return plain;
  }

  function exportBackup() {
    clearTimeout(saveTimer);
    saveStateNow();
    const data = {
      app: 'tessera', version: 1, exported: new Date().toISOString(),
      workspace: snapshotState(), library: loadLibrary(), prefs: prefs
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'tessera-backup-' + date + '.json');
  }

  function importBackup(file) {
    file.text().then((txt) => {
      let data = null;
      try { data = JSON.parse(txt); } catch (e) {}
      if (!data || data.app !== 'tessera' || !data.workspace) {
        showToast('That file isn’t a Tessera backup.');
        return;
      }
      const incoming = data.library && Array.isArray(data.library.poems) ? data.library.poems : [];
      confirmDialog('Restore this backup? It replaces your current workspace (Undo can bring it back) and adds ' +
        incoming.length + (incoming.length === 1 ? ' Library poem.' : ' Library poems.'), 'Restore').then((ok) => {
        if (!ok) return;
        const lib = loadLibrary();
        for (const p of incoming) {
          if (!p || typeof p.id !== 'string' || !p.state) continue;
          const clean = { id: p.id, name: String(p.name || 'Untitled'), updated: Number(p.updated) || Date.now(), state: sanitizeState(p.state) };
          const i = lib.poems.findIndex((q) => q.id === p.id);
          if (i >= 0) lib.poems[i] = clean; else lib.poems.push(clean);
        }
        storeLibrary(lib);
        openState(data.workspace);
        $('exportDialog').close();
        showToast('Backup restored.', 'Undo', undo);
      });
    });
  }

  // =================================================================
  // ACTIONS — every [data-action] button routes through here
  // =================================================================
  const ACTIONS = {
    'toggle-paste': togglePasteColumn,
    'toggle-bank': toggleBank,
    'load-words': () => loadWords(),
    'load-lines': () => loadLines(),
    'match-meter': applyMeterScaffold,
    'jumble': jumbleToCanvas,
    'return-all': returnAllToBank,
    'clear': clearAll,
    'copy': copyArrangement,
    'find-poem': () => { openDialog('findDialog'); $('findQuery').focus(); },
    'library': () => { renderLibrary(); openDialog('libraryDialog'); },
    'new-poem': newBlankPoem,
    'share': openShare,
    'copy-share': () => copyText($('shareUrl').value).then((ok) => showToast(ok ? 'Link copied.' : 'Couldn’t copy — select the link and copy it.')),
    'share-native': () => navigator.share({ title: 'A poem made with Tessera', url: $('shareUrl').value }).catch(() => {}),
    'export': openExport,
    'download-image': () => exportImageBlob().then((b) => b && downloadBlob(b, 'tessera-poem.png')),
    'share-image': () => exportImageBlob().then((b) => {
      if (!b) return;
      navigator.share({ files: [new File([b], 'tessera-poem.png', { type: 'image/png' })], title: 'A poem made with Tessera' }).catch(() => {});
    }),
    'copy-as': (btn) => {
      const text = textForFormat(btn.dataset.format);
      if (!text) { showToast('The canvas is empty.'); return; }
      copyText(text).then((ok) => showToast(ok ? 'Copied.' : 'Copy failed.'));
    },
    'export-json': exportBackup,
    'import-json': () => $('importFile').click(),
    'settings': () => openDialog('settingsDialog'),
    'focus': () => toggleFocus(),
    'help': showHelp,
    'shortcuts': () => openDialog('shortcutsDialog'),
    'sample-from-help': loadRandomSample,
    'close-dialog': (btn) => btn.closest('dialog').close(),
    'close-shared': () => { pendingShared = null; $('sharedDialog').close(); clearShareHash(); },
    'open-shared': openSharedCopy,
    'sel-bank': () => returnSelectedToBank(),
    'sel-lock': toggleLockSelection,
    'sel-clear': () => { clearSelection(); clearPaletteSelection(); selectionChanged(); }
  };

  function initActions() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.canvas-status-form')) {
        explainMeter(analyzeSourceMeter(arrangementToText()));
        return;
      }
      if (e.target.closest('#meterStatus .meter-name')) {
        explainMeter(analyzeSourceMeter($('input').value));
        return;
      }
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const fn = ACTIONS[el.dataset.action];
      if (!fn) return;
      e.preventDefault();
      fn(el, e);
    });
    $('sortMode').addEventListener('change', (e) => setSortMode(e.target.value));
    $('hintMode').addEventListener('change', (e) => { prefs.hint = e.target.value; savePrefs(); scheduleDerived(); });
    for (const f of TARGET_FORMS) {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.label;
      $('targetForm').appendChild(o);
    }
    $('targetForm').addEventListener('change', (e) => {
      prefs.target = e.target.value;
      savePrefs();
      scheduleDerived();
    });
    $('addWordForm').addEventListener('submit', addOwnWords);
    $('librarySaveForm').addEventListener('submit', saveToLibrary);
    $('findForm').addEventListener('submit', searchPoems);
    $('shareIncludeSource').addEventListener('change', refreshShareUrl);
    ['imgStyle', 'imgTheme'].forEach((id) => $(id).addEventListener('change', renderExportPreview));
    $('imgTitle').addEventListener('input', renderExportPreview);
    $('importFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = '';
    });
    window.addEventListener('hashchange', checkSharedLink);
  }

  // =================================================================
  // OFFLINE SUPPORT
  // =================================================================
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && !/[?&]sw=1\b/.test(location.search)) return; // keep dev reloads fresh
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // =================================================================
  // STARTUP
  // =================================================================
  initPalette();
  initSamples();
  initPrefs();
  initActions();
  applyPrefs();
  const restored = restoreState();
  if (!restored && isMobile()) $('pasteColumn').classList.add('collapsed');
  if ($('input').value.trim()) {
    refreshSourceAnalysis(); // replace any stale restored panel
    clearTimeout(saveTimer);
  }
  initPersistence();
  initSelection();
  initDialogs();
  initContextMenu();
  initTapToPlace();
  initResizers();
  initDerived();
  initKeyboard();
  scheduleDerived();
  checkSharedLink().then((shown) => { if (!shown) maybeShowIntro(); });
  setTimeout(loadPronunciationData, 300);
  registerServiceWorker();
})();
