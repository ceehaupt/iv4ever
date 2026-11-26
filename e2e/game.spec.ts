import { expect, type Page, test } from '@playwright/test';

/**
 * Einzelspiel starten: das beim Laden erzeugte Spiel nutzen und warten, bis seine Einheiten da sind.
 * (Früher wurde hier per Seed eine zweite Karte erzeugt – auf langsamen CI-Rechnern lief der nächste
 * Testschritt dann noch gegen das alte Spiel, und die neue Karte überschrieb den Rundenwechsel.)
 */
async function newGame(page: Page): Promise<void> {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page.locator('#turn')).toHaveText('Runde 1', { timeout: 30_000 });
  await expect(page.locator('#ready')).toContainText('Einheit', { timeout: 30_000 });
}

test('Stadt gründen und Runde beenden', async ({ page }) => {
  await newGame(page);
  await page.locator('#game').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab'); // erste Einheit = Siedler
  await expect(page.locator('#unitpanel')).toBeVisible();
  await expect(page.locator('#unitpanel')).toContainText('Siedler');
  await page.keyboard.press('b');
  await expect(page.locator('#citypanel')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
});

test('Schnellspeichern und Laden', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
  await page.keyboard.press('Control+s');
  await expect(page.locator('#toast')).toContainText('Gespeichert', { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });
  await page.click('#load');
  await page.locator('#saves').getByText('Schnellspeicherung').first().click();
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
});

test('Handbuch öffnet mit F1 und zeigt die Technologien', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('F1');
  await expect(page.locator('#handbook')).toBeVisible();
  await page.click('#handbook [data-tab="techs"]');
  await expect(page.locator('#handbook tbody tr')).toHaveCount(55);
});

test('Spielstand als Datei exportieren und wieder importieren', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
  await page.click('#load');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-file="export"]')]);
  const file = await download.path();
  await page.keyboard.press('Enter');
  await expect(page.locator('#turn')).toHaveText('Runde 3', { timeout: 20_000 });
  await page.click('#load');
  await page.setInputFiles('[data-file="import"]', file);
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
});

test('Kartencursor beschreibt Felder für Screenreader', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('c');
  await expect(page.locator('#announcer')).toContainText('Feld', { timeout: 5_000 });
  const first = await page.locator('#announcer').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#announcer')).not.toHaveText(first!, { timeout: 5_000 });
  await expect(page.locator('#announcer')).toContainText('Feld');
  await page.keyboard.press('Escape');
  await expect(page.locator('#announcer')).toHaveText('Kartencursor aus');
});

test('Tasten lassen sich umbelegen', async ({ page }) => {
  await newGame(page);
  await page.click('#settingsbtn');
  await page.click('[data-bind="endTurn"]');
  await page.keyboard.press('e');
  await expect(page.locator('#keynote')).toContainText('Runde beenden: E');
  await page.click('#settingspanel [data-close]');
  await page.keyboard.press('e');
  await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
  await expect(page.locator('#help')).toContainText('E: Runde beenden');
});
