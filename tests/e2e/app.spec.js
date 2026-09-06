import { test, expect } from '@playwright/test';
async function adopt(page, name = 'Nova') {
  await page.goto('/');
  await page.getByLabel('WHAT SHOULD WE CALL THEM?').fill(name);
  await page.getByRole('button', { name: 'mint', exact: true }).click();
  await page.getByRole('button', { name: 'Start our little adventure' }).click();
  await expect(page.getByRole('heading', { name: `Hey, ${name}.` })).toBeVisible();
}
test('adopt, care, walk, duel, daily reward, purchase, restore and reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await adopt(page);
  const originalCanvas = await page.locator('#pet-stage canvas').elementHandle();
  await page.getByRole('button', { name: 'Give a little love', exact: true }).click();
  await expect(page.locator('.task-count').first()).toHaveText('1/3');
  await page.waitForTimeout(3050);
  await page.getByRole('button', { name: 'Give a little love', exact: true }).click();
  await page.waitForTimeout(3050);
  await page.getByRole('button', { name: 'Give a little love', exact: true }).click();
  await page.locator('.sidebar [data-page="walk"]').click();
  await page.getByRole('button', { name: 'Try a demo walk' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Wander 100 m' }).click();
  await expect(page.locator('#walk-distance')).toHaveText('300');
  await page.getByRole('button', { name: 'Finish adventure' }).click();
  await page.locator('.sidebar [data-page="friends"]').click();
  await page.getByRole('button', { name: 'Play with a practice spirit' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Spark', exact: true }).click();
    if (i < 2) await page.getByRole('button', { name: 'Next round' }).click();
  }
  await expect(page.locator('.match-result')).toBeVisible();
  await page.locator('.sidebar button[data-page="home"]').click();
  expect(
    await originalCanvas.evaluate(
      (canvas) => canvas === document.querySelector('#pet-stage canvas'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Collect reward' }).click();
  await expect(page.getByRole('button', { name: 'Collected', exact: true })).toBeDisabled();
  await page.locator('.sidebar [data-page="shop"]').click();
  await page.locator('[data-buy="halo"]').click();
  await page.getByRole('button', { name: 'Confirm sandbox purchase' }).click();
  await expect(page.locator('[data-buy="halo"]')).toContainText('Owned');
  await page.getByRole('button', { name: 'Restore purchases' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Nova.' })).toBeVisible();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('mochi-wilds-v1')));
  expect(state.owned).toContain('halo');
  expect(state.daily.claimed).toBe(true);
  expect(state.totalMeters).toBe(300);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/garden-desktop.png', fullPage: true });
});
test('mobile customization, boutique, camera preview and no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adopt(page, 'Lumi');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Meet in your world' }).click();
  await page.getByRole('button', { name: 'Try without a camera' }).click();
  await expect(page.locator('#ar-status')).toHaveText('Interactive preview');
  await page.getByRole('button', { name: 'Send some love' }).click();
  await page.getByRole('button', { name: 'Close AR' }).click();
  await page.screenshot({ path: 'test-results/garden-mobile.png', fullPage: true });
  await page.locator('.mobile-nav [data-page="shop"]').click();
  await expect(page.getByRole('heading', { name: 'A little extra you.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('two browser contexts can play a live room', async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const p = await a.newPage(),
    q = await b.newPage();
  try {
    await adopt(p, 'Nova');
    await p.locator('.sidebar [data-page="friends"]').click();
    await adopt(q, 'Lumi');
    await q.locator('.sidebar [data-page="friends"]').click();
    await p.getByRole('button', { name: 'Create a friend room' }).click();
    await expect(p.locator('.room-code')).toBeVisible();
    const code = (await p.locator('.room-code').innerText()).trim();
    await q.getByLabel('Room code', { exact: true }).fill(code);
    await q.getByRole('button', { name: 'Join room', exact: true }).click();
    for (let i = 0; i < 3; i++) {
      await p.getByRole('button', { name: 'Spark', exact: true }).click();
      await q.getByRole('button', { name: 'Bloom', exact: true }).click();
      if (i < 2) {
        await expect(q.getByRole('button', { name: 'Next round' })).toBeVisible();
        await p.getByRole('button', { name: 'Next round' }).click();
      }
    }
    await expect(p.locator('.match-result h2')).toHaveText('Your spirit sparkled brightest!');
    await expect(q.locator('.match-result h2')).toHaveText('A lovely game, a new friend.');
  } finally {
    await a.close();
    await b.close();
  }
});
