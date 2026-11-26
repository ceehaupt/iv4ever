import { expect, type Page, test } from '@playwright/test';

const RELAY = `ws://localhost:${process.env.RELAY_PORT ?? 8790}`;

async function openLobby(page: Page, name: string): Promise<void> {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });
  await page.selectOption('#mode', 'online');
  await page.click('#newmap');
  await page.fill('#onlineurl', RELAY);
  await page.fill('#onlinename', name);
}

// Online-Spiel mit zwei Browsern; einer verlässt das Spiel – der andere muss weiterspielen können.
test('Online: Runde mit zwei Menschen, danach Abgang eines Spielers', async ({ browser }) => {
  test.setTimeout(90_000);
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
  await host.click('[data-act="start"]');
  // Der Start schließt die Lobby; danach kommt die neue (Online-)Karte.
  for (const p of [host, guest]) await expect(p.locator('#onlinepanel')).toBeHidden({ timeout: 20_000 });
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText('Runde 1', { timeout: 20_000 });

  // Beide beenden die Runde → Runde 2. Der Gastgeber muss zuerst auf den Gast warten.
  await host.click('#endturn');
  await expect(host.locator('#toast')).toContainText('Warte auf', { timeout: 10_000 });
  await guest.click('#endturn');
  for (const p of [host, guest]) await expect(p.locator('#turn')).toHaveText('Runde 2', { timeout: 20_000 });

  // Gast geht; der Gastgeber muss allein weiterspielen können (früher hing das Spiel).
  await guest.context().close();
  await expect(host.locator('#toast')).toContainText('verlassen', { timeout: 10_000 });
  await host.click('#endturn');
  await expect(host.locator('#turn')).toHaveText('Runde 3', { timeout: 20_000 });
});
