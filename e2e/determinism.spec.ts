import { expect, test } from '@playwright/test';
import { simRun } from './simrun';

// Online-Lockstep setzt voraus, dass jeder Browser exakt gleich rechnet.
// Referenz: dieselbe Partie in Node; jede Browser-Engine (Projekt) muss dieselben Prüfsummen liefern.
test('gleiche Partie ergibt in jeder Browser-Engine dieselben Prüfsummen', async ({ page }) => {
  test.setTimeout(120_000);
  const expected = simRun();
  await page.goto('/e2e/determinism.html');
  const hashes = await page.waitForFunction(() => (window as unknown as { __hashes?: string[] }).__hashes, null, { timeout: 100_000 });
  expect(await hashes.jsonValue()).toEqual(expected);
});
