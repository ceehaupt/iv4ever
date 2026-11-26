import { expect, test } from '@playwright/test';
import { generateWorld } from '../src/sim/mapgen';
import { encodeScenario } from '../src/sim/scenario';

test('Karteneditor: malen, prüfen, direkt spielen', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  // Erster Aufruf: Zufallskarte mit Startfeldern → spielbar.
  await expect(page.locator('#ed-status')).toContainText('Spielbar', { timeout: 30_000 });
  // Leere Karte: nicht spielbar, Spielen gesperrt.
  await page.click('#ed-blank');
  await expect(page.locator('#ed-status')).toContainText('Land 0 %');
  await expect(page.locator('#ed-status')).toContainText('Mindestens 2 Startfelder');
  await expect(page.locator('#ed-play')).toBeDisabled();
  // Grasland in die Mitte malen (Pinsel Radius 2).
  await page.click('#ed-tools [data-brush="2"]');
  await page.click('#ed-tools button:has-text("Grasland")');
  const box = (await page.locator('#game').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#ed-status')).not.toContainText('Land 0 %');
  // Rückgängig.
  await page.keyboard.press('Control+z');
  await expect(page.locator('#ed-status')).toContainText('Land 0 %');
  // Zurück zur Zufallskarte und spielen.
  await page.click('#ed-random');
  await expect(page.locator('#ed-status')).toContainText('Spielbar');
  await page.fill('#ed-name', 'Testszenario');
  await page.click('#ed-play');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#toast')).toContainText('Testszenario', { timeout: 30_000 });
  await expect(page.locator('#turn')).toHaveText('Runde 1');
  await expect(page.locator('#ready')).toContainText('Einheit', { timeout: 30_000 });
});

test('Szenario-Datei über „Laden“ starten', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page.locator('#ready')).toContainText('Einheit', { timeout: 30_000 });
  const w = generateWorld({ width: 48, height: 30, seed: 42, players: 2 });
  const text = encodeScenario({ name: 'Duell am Fluss', description: '', map: w.map, starts: w.starts });
  await page.click('#load');
  await page.locator('[data-file="import"]').setInputFiles({ name: 'duell.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#toast')).toContainText('Duell am Fluss', { timeout: 30_000 });
  await expect(page.locator('#turn')).toHaveText('Runde 1');
});
