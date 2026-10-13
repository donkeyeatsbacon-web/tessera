// Render a poem to a <canvas> as a shareable PNG card.
// lines: array of lines; each line is an array of { text, kind } tokens,
// where kind is 'word' | 'line' | 'punct' | 'endpunct'.
(function () {
  'use strict';

  const WIDTH = 1080;
  const MIN_HEIGHT = 1080;
  const MAX_HEIGHT = 1920;
  const PAD = 96;

  const THEMES = {
    dark: {
      bg: '#141414', grid: 'rgba(255,255,255,0.035)', text: '#ede6d6', muted: '#8f8f8f',
      accent: '#d4a574', tile: '#f4ecd8', tilePunct: '#ead9b8', tileLine: '#f0e6cc',
      tileInk: '#1a1a1a', shadow: 'rgba(0,0,0,0.55)'
    },
    light: {
      bg: '#fbf8f1', grid: 'rgba(0,0,0,0.045)', text: '#1f1b16', muted: '#6b6457',
      accent: '#8a5520', tile: '#f4ecd8', tilePunct: '#ead9b8', tileLine: '#f0e6cc',
      tileInk: '#1a1a1a', shadow: 'rgba(60,45,20,0.25)'
    }
  };

  // Words get a leading space; punctuation hugs the word before it.
  function joinLine(tokens) {
    let out = '';
    for (const t of tokens) {
      if (out && (t.kind === 'word' || t.kind === 'line')) out += ' ';
      out += t.text;
    }
    return out;
  }

  function layout(ctx, lines, style, size, fontFamily) {
    const maxX = WIDTH - PAD;
    const items = [];
    let y = 0;
    let wraps = 0;
    if (style === 'tiles') {
      const padX = Math.round(size * 0.32);
      const tileH = Math.round(size * 1.45);
      const gap = Math.round(size * 0.26);
      const rowH = tileH + gap;
      ctx.font = size + 'px ' + fontFamily;
      for (const line of lines) {
        let x = PAD;
        for (const tok of line) {
          const isPunct = tok.kind === 'punct' || tok.kind === 'endpunct';
          const w = Math.ceil(ctx.measureText(tok.text).width) + padX * 2;
          if (x + w > maxX && x > PAD) { x = PAD + size; y += rowH; wraps++; }
          items.push({ type: 'tile', x: x, y: y, w: Math.min(w, maxX - x), h: tileH, tok: tok, punct: isPunct });
          x += w + gap;
        }
        y += rowH;
      }
      return { items: items, height: y, wraps: wraps };
    }
    const lineH = Math.round(size * 1.5);
    ctx.font = size + 'px ' + fontFamily;
    for (const line of lines) {
      const words = joinLine(line).split(' ');
      let cur = '';
      for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (ctx.measureText(next).width > maxX - PAD && cur) {
          items.push({ type: 'text', x: PAD, y: y, text: cur });
          y += lineH;
          wraps++;
          cur = '    ' + w; // hanging indent for wrapped lines
        } else {
          cur = next;
        }
      }
      items.push({ type: 'text', x: PAD, y: y, text: cur });
      y += lineH;
    }
    return { items: items, height: y, wraps: wraps };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderPoemImage(canvas, opts) {
    const lines = (opts.lines || []).filter((l) => l.length);
    const style = opts.style === 'typeset' ? 'typeset' : 'tiles';
    const theme = THEMES[opts.theme] || THEMES.dark;
    const fontFamily = opts.font || 'Georgia, "Times New Roman", serif';
    const title = (opts.title || '').trim();
    const footer = opts.footer || 'Made with Tessera';
    const ctx = canvas.getContext('2d');

    const titleBlock = title ? 110 : 0;
    const footerBlock = 90;
    // Biggest type that keeps every line unbroken on a square card; failing
    // that, a modest size that may wrap and grow the card taller.
    const fits = (lay, maxH) => PAD * 2 + titleBlock + lay.height + footerBlock <= maxH;
    let size = 0;
    let lay = null;
    for (let s = 76; s >= 28; s -= 4) {
      const l = layout(ctx, lines, style, s, fontFamily);
      if (!l.wraps && fits(l, MIN_HEIGHT)) { size = s; lay = l; break; }
    }
    if (!lay) {
      size = style === 'tiles' ? 40 : 46;
      lay = layout(ctx, lines, style, size, fontFamily);
      while (!fits(lay, MAX_HEIGHT) && size > 16) {
        size = Math.floor(size * 0.9);
        lay = layout(ctx, lines, style, size, fontFamily);
      }
    }
    const contentH = titleBlock + lay.height;
    const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, PAD * 2 + contentH + footerBlock));
    canvas.width = WIDTH;
    canvas.height = height; // resets the context

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, WIDTH, height);
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let gx = 0; gx < WIDTH; gx += 36) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, height); ctx.stroke(); }
    for (let gy = 0; gy < height; gy += 36) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(WIDTH, gy + 0.5); ctx.stroke(); }

    // Center the block vertically when there's room.
    let top = Math.max(PAD, Math.round((height - footerBlock - contentH) / 2));
    if (title) {
      ctx.fillStyle = theme.accent;
      ctx.font = 'italic 56px ' + fontFamily;
      ctx.textBaseline = 'top';
      ctx.fillText(title, PAD, top, WIDTH - PAD * 2);
      top += titleBlock;
    }

    ctx.textBaseline = 'middle';
    for (const it of lay.items) {
      if (it.type === 'tile') {
        ctx.save();
        ctx.shadowColor = theme.shadow;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = it.punct ? theme.tilePunct : (it.tok.kind === 'line' ? theme.tileLine : theme.tile);
        roundRect(ctx, it.x, top + it.y, it.w, it.h, 4);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = theme.tileInk;
        ctx.font = (it.punct ? 'bold ' : (it.tok.kind === 'line' ? 'italic ' : '')) + size + 'px ' + fontFamily;
        ctx.textAlign = 'center';
        ctx.fillText(it.tok.text, it.x + it.w / 2, top + it.y + it.h / 2 + 1, it.w - 8);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = theme.text;
        ctx.font = size + 'px ' + fontFamily;
        ctx.fillText(it.text, it.x, top + it.y + size * 0.75);
      }
    }

    ctx.fillStyle = theme.muted;
    ctx.font = '26px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(footer, PAD, height - PAD / 2 - 10);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(PAD, height - PAD / 2 - 54, 48, 4);
    return canvas;
  }

  window.TesseraExport = { renderPoemImage: renderPoemImage, joinLine: joinLine };
})();
