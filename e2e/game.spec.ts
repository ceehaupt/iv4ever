import { expect, type Page, test } from '@playwright/test';
import { TECHS } from '../src/sim/rules/techs';

const TECH_COUNT = TECHS.length;

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

test('Erneuter Klick auf die Stadt wählt die Einheiten darin aus', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab'); // erste Einheit = Siedler
  await page.keyboard.press('h'); // Siedler (und damit die Stadt) in die Bildmitte
  await page.keyboard.press('b');
  await expect(page.locator('#citypanel')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  const box = (await page.locator('#game').boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(center.x, center.y);
  await expect(page.locator('#citypanel')).toBeVisible();
  await page.mouse.click(center.x, center.y);
  await expect(page.locator('#citypanel')).toBeHidden();
  await expect(page.locator('#unitpanel')).toBeVisible();
  await expect(page.locator('#unitpanel')).toContainText(/Krieger|Späher/);
});

test('Späher erkundet automatisch', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('Escape');
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
    if ((await page.locator('#unitpanel').textContent())?.includes('Späher')) break;
  }
  await expect(page.locator('#unitpanel')).toContainText('Späher');
  await page.locator('#unitpanel button[data-action="explore"]').click();
  await expect(page.locator('#unitpanel')).toContainText('erkundet');
  await page.screenshot({ path: 'test-results/explore.png' });
});

test('Klick auf ein erreichbares Feld bewegt die ausgewählte Einheit', async ({ page }) => {
  await newGame(page);
  await page.keyboard.press('Escape');
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
    if ((await page.locator('#unitpanel').textContent())?.includes('Späher')) break;
  }
  await expect(page.locator('#unitpanel')).toContainText('2/2');
  await page.keyboard.press('h'); // Einheit in die Bildmitte
  // Nach dem Zug ist der Späher fertig: eine Einheit weniger wartet (Auswahl springt zur nächsten).
  const waiting = await page.locator('#ready').textContent();
  const box = (await page.locator('#game').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Ein paar Felder rund um den Späher probieren (eines davon ist Land und erreichbar).
  const offsets = [[110, 0], [-110, 0], [55, 60], [-55, 60], [55, -60], [-55, -60], [165, 60], [-165, -60]];
  let moved = false;
  for (const [dx, dy] of offsets) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(300);
    if ((await page.locator('#ready').textContent()) !== waiting) {
      moved = true;
      break;
    }
    // Daneben geklickt (Wasser, Einheit, Stadt): Späher wieder auswählen.
    await page.keyboard.press('Escape');
    for (let k = 0; k < 3 && !((await page.locator('#unitpanel').textContent()) ?? '').includes('Späher'); k++) await page.keyboard.press('Tab');
    await page.keyboard.press('h');
  }
  expect(moved).toBe(true);
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
  await expect(page.locator('#handbook tbody tr')).toHaveCount(TECH_COUNT);
});

test('Spielstand als Datei exportieren und wieder importieren', async ({ page }) => {
  // Diagnose für die CI: Meldungen des Spiels und Fehler aus Seite/Worker mitschreiben.
  const log: string[] = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && log.push(`console.${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  page.on('worker', (w) => w.on('console', (m) => log.push(`worker: ${m.text()}`)));
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
  try {
    await expect(page.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
  } catch (e) {
    const toast = await page.locator('#toast').textContent();
    const size = (await import('node:fs')).statSync(file).size;
    throw new Error(`${(e as Error).message}\nToast: ${toast}\nDateigröße: ${size}\n${log.join('\n')}`);
  }
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
