'use strict';
const { expect } = require('@playwright/test');

// Open Tessera with a clean slate: skip the intro and collect page errors.
async function openApp(page, path) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('tessera:introSeen', '1');
      localStorage.setItem('tessera:prefs:v1', JSON.stringify({ animations: false }));
      sessionStorage.setItem('e2e-init', '1');
    }
  });
  await page.goto(path || '/');
  return errors;
}

async function loadText(page, text) {
  await page.locator('#input').fill(text);
  await page.getByRole('button', { name: 'Break into words' }).click();
}

const bankTile = (page, word) => page.locator('#wordBank .word-tile', { hasText: new RegExp('^' + word + '$', 'i') }).first();
const canvasTiles = (page) => page.locator('#canvas .word-tile');

async function canvasText(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    return document.querySelector('#printView pre').textContent;
  });
}

module.exports = { openApp, loadText, bankTile, canvasTiles, canvasText, expect };
