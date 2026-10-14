'use strict';
const { test } = require('@playwright/test');
const { openApp, loadText, bankTile, canvasTiles, canvasText, expect } = require('./helpers');

test('first visit shows the help, which can be dismissed', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  const help = page.locator('#helpDialog');
  await expect(help).toBeVisible();
  await page.getByRole('button', { name: 'Start rearranging' }).click();
  await expect(help).toBeHidden();
});

test('drag a word onto the canvas, then undo and redo', async ({ page }) => {
  const errors = await openApp(page);
  await loadText(page, 'river stone light');
  const tile = bankTile(page, 'stone');
  await tile.dragTo(page.locator('#canvas'), { targetPosition: { x: 300, y: 200 } });
  await expect(canvasTiles(page)).toHaveCount(1);
  await expect(canvasTiles(page).first()).toHaveText('Stone'); // capitalized at the start
  await page.waitForTimeout(500); // let the change settle into history
  await page.keyboard.press('Control+z');
  await expect(canvasTiles(page)).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(canvasTiles(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('keyboard: Enter places words, Alt+Arrow reorders, Shift+Enter starts a stanza', async ({ page }) => {
  await openApp(page);
  await loadText(page, 'quiet morning rain falls');
  for (const w of ['quiet', 'morning', 'rain']) {
    await bankTile(page, w).focus();
    await page.keyboard.press('Enter');
  }
  expect(await canvasText(page)).toBe('Quiet morning rain');
  await canvasTiles(page).nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  expect(await canvasText(page)).toBe('Quiet rain morning');
  // Focus stays on the moved tile ("rain"), so the stanza starts after it.
  await page.keyboard.press('Shift+Enter');
  await bankTile(page, 'falls').focus();
  await page.keyboard.press('Enter');
  expect(await canvasText(page)).toBe('Quiet rain\n\nMorning falls');
});

test('select several tiles and send them back to the bank', async ({ page }) => {
  await openApp(page);
  await loadText(page, 'one two three four');
  await page.getByRole('button', { name: 'Jumble' }).click();
  await expect(canvasTiles(page)).toHaveCount(4);
  await canvasTiles(page).nth(0).click({ modifiers: ['Shift'] });
  await canvasTiles(page).nth(1).click({ modifiers: ['Shift'] });
  await expect(page.locator('#canvas .word-tile.selected')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(canvasTiles(page)).toHaveCount(2);
  await expect(page.locator('#wordBank .word-tile')).toHaveCount(2);
});

test('locked tiles stay put through Return all', async ({ page }) => {
  await openApp(page);
  await loadText(page, 'alpha beta gamma');
  await page.getByRole('button', { name: 'Jumble' }).click();
  await canvasTiles(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Lock in place' }).click();
  await page.getByRole('button', { name: 'Return all' }).click();
  await expect(canvasTiles(page)).toHaveCount(1);
});

test('share link round trip', async ({ page, context }) => {
  await openApp(page);
  await loadText(page, 'the moon is a silver coin');
  await page.getByRole('button', { name: 'Jumble' }).click();
  await page.locator('#poemTitle').fill('Coin');
  const poem = await canvasText(page);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const url = await page.locator('#shareUrl').inputValue();
  expect(url).toContain('#p=');

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.locator('#sharedDialog')).toBeVisible();
  await expect(other.locator('#sharedTitle')).toHaveText('Coin');
  await expect(other.locator('#sharedPoem')).toHaveText(poem);
});

test('library: save, start a new poem, open the saved one', async ({ page }) => {
  await openApp(page);
  await loadText(page, 'ember ash smoke');
  await page.getByRole('button', { name: 'Jumble' }).click();
  const poem = await canvasText(page);
  await page.getByRole('button', { name: 'Library' }).click();
  await page.locator('#libraryName').fill('Fire');
  await page.getByRole('button', { name: 'Save current' }).click();
  await page.getByRole('button', { name: 'New blank poem' }).click();
  await expect(canvasTiles(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Open Fire' }).click();
  expect(await canvasText(page)).toBe(poem);
});

test('work survives a reload', async ({ page }) => {
  await openApp(page);
  await loadText(page, 'still here tomorrow');
  await page.getByRole('button', { name: 'Jumble' }).click();
  const poem = await canvasText(page);
  await page.waitForTimeout(600);
  await page.reload();
  expect(await canvasText(page)).toBe(poem);
});
