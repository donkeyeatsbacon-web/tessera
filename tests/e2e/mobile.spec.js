'use strict';
const { test } = require('@playwright/test');
const { openApp, canvasTiles, expect } = require('./helpers');

test('tap a word, then tap the canvas to place it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Paste/ }).first().tap();
  await page.locator('#input').fill('sea salt wind');
  await page.getByRole('button', { name: 'Break into words' }).tap();
  const tile = page.locator('#wordBank .word-tile', { hasText: 'salt' });
  await tile.tap();
  await expect(tile).toHaveClass(/selected/);
  await page.locator('#canvas').tap({ position: { x: 120, y: 200 } });
  await expect(canvasTiles(page)).toHaveCount(1);
  await expect(canvasTiles(page).first()).toHaveText('Salt');
});
