import { type Browser, expect, type Page, test } from '@playwright/test';

const RELAY = `ws://localhost:${process.env.RELAY_PORT ?? 8790}`;

async function openLobby(page: Page, name: string): Promise<void> {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });
  await page.click('#newgamebtn');
  await page.selectOption('#mode', 'online');
  await page.click('#newmap');
  await page.fill('#onlineurl', RELAY);
  await page.fill('#onlinename', name);
}

/** Zwei Browser im selben Online-Raum; gestartet. `beforeStart` z. B. für die Wahl eines Spielstands. */
async function twoPlayers(browser: Browser, beforeStart?: (host: Page) => Promise<void>): Promise<{ host: Page; guest: Page }> {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await openLobby(host, 'Ada');
  await host.click('[data-act="create"]');
  const code = (await host.locator('#onlinepanel .hint b').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await openLobby(guest, 'Bo');
  await guest.fill('#onlineroom', code);
  await guest.click('[data-act="join"]');
  await expect(host.locator('#onlinepanel ol li')).toHaveCount(2);
  if (beforeStart) await beforeStart(host);
  await host.click('[data-act="start"]');
  for (const p of [host, guest]) await expect(p.locator('#onlinepanel')).toBeHidden({ timeout: 20_000 });
  return { host, guest };
}

async function endRound(host: Page, guest: Page, expected: number): Promise<void> {
  await host.click('#endturn');
  await guest.click('#endturn');
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText(`Runde ${expected}`, { timeout: 20_000 });
}

test('Online: Runde mit zwei Menschen, Chat, danach Abgang eines Spielers', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, guest } = await twoPlayers(browser);
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });
  await expect(host.locator('#chat')).toBeVisible();

  await guest.fill('#chatinput', 'Hallo!');
  await guest.press('#chatinput', 'Enter');
  await expect(host.locator('#chatlog')).toContainText('Bo: Hallo!');

  await host.click('#endturn');
  await expect(host.locator('#toast')).toContainText('Warte auf', { timeout: 10_000 });
  await guest.click('#endturn');
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });

  // Gast geht; nach der Kulanzzeit übernimmt die KI und der Gastgeber spielt allein weiter.
  await guest.context().close();
  await expect(host.locator('#toast')).toContainText('Verbindung verloren', { timeout: 10_000 });
  await host.click('#endturn');
  await expect(host.locator('#turn')).toHaveText('Runde 3', { timeout: 20_000 });
});

test('Online: Wiedereinstieg nach dem Neuladen der Seite', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, guest } = await twoPlayers(browser);
  await endRound(host, guest, 2);

  await guest.reload();
  await expect(guest.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 }); // frisches Einzelspiel nach dem Laden
  await guest.click('#newgamebtn');
  await guest.selectOption('#mode', 'online');
  await guest.click('#newmap');
  await guest.click('[data-act="rejoin"]');
  await expect(guest.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });
  await expect(host.locator('#toast')).toContainText('wieder da', { timeout: 10_000 });
  await endRound(host, guest, 3);
});

test('Online: Gastgeber speichert, später geht das Spiel im neuen Raum weiter', async ({ browser }) => {
  test.setTimeout(120_000);
  const first = await twoPlayers(browser);
  await endRound(first.host, first.guest, 2);
  await endRound(first.host, first.guest, 3);
  await first.host.keyboard.press('Control+s');
  await expect(first.host.locator('#toast')).toContainText('Gespeichert', { timeout: 10_000 });
  await first.guest.context().close();
  // Gastgeber im selben Browser (gleiche IndexedDB) eröffnet einen neuen Raum und wählt den Spielstand.
  const host = await first.host.context().newPage();
  await first.host.close();
  host.on('dialog', (d) => void d.accept());
  await host.goto('/');
  await expect(host.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });
  await host.click('#newgamebtn');
  await host.selectOption('#mode', 'online');
  await host.click('#newmap');
  await host.fill('#onlineurl', RELAY);
  await host.click('[data-act="create"]');
  const code = (await host.locator('#onlinepanel .hint b').textContent())!.trim();
  const guest = await (await browser.newContext()).newPage();
  await openLobby(guest, 'Bo');
  await guest.fill('#onlineroom', code);
  await guest.click('[data-act="join"]');
  await expect(host.locator('#onlinepanel ol li')).toHaveCount(2);
  const option = host.locator('#onlinesave option', { hasText: 'Runde 3' }).first();
  await host.selectOption('#onlinesave', (await option.getAttribute('value'))!);
  await host.click('[data-act="start"]');
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText('Runde 3', { timeout: 20_000 });
  await endRound(host, guest, 4);
});
