import { test, expect } from '@playwright/test';
test('all five creature auditions and game sounds load and play', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creature-lab.html');
  await expect(page.locator('.roster article')).toHaveCount(5);
  await expect(page.locator('[data-sound]')).toHaveCount(19);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Decode every generated file through the browser audio decoder.
  const durations = await page.evaluate(async () => {
    const context = new AudioContext();
    const result = [];
    try {
      for (const button of document.querySelectorAll('[data-sound]')) {
        const response = await fetch(`/assets/sounds/${button.dataset.sound}.wav`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        result.push(buffer.duration);
      }
    } finally {
      await context.close();
    }
    return result;
  });
  expect(durations).toHaveLength(19);
  expect(durations.every((d) => d > 0 && d < 2)).toBe(true);
  for (const name of ['dragon', 'mothkit', 'otter', 'imp', 'ferret']) {
    await page.locator(`[data-sound="${name}-hello"]`).click();
    await expect(page.locator('#audio-status')).toContainText('Playing:');
    await page.getByRole('button', { name: 'Stop sound', exact: true }).click();
    await expect(page.locator('#audio-status')).toHaveText('Sound stopped.');
  }
  expect(errors).toEqual([]);
});
test('mobile audio controls persist mute and volume and stop active effects', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem(
      'mochi-wilds-v1',
      JSON.stringify({
        version: 1,
        name: 'Mochi',
        created: true,
        color: 'mint',
        shape: 'cloud',
        xp: 120,
        lastUpdated: Date.now(),
        owned: [],
      }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Sound volume' }).fill('25');
  await page.getByRole('button', { name: 'Hear a happy cuddle' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { audio } = await import('/src/audio.js');
        return audio.voices.size;
      }),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sounds on · tap to mute', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hear a happy cuddle' })).toBeDisabled();
  const stopped = await page.evaluate(async () => {
    const { audio } = await import('/src/audio.js');
    return { voices: audio.voices.size, played: await audio.play('reward') };
  });
  expect(stopped).toEqual({ voices: 0, played: false });
  await page.reload();
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sounds muted · tap to enable', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('slider', { name: 'Sound volume' })).toHaveValue('25');
  await page.getByRole('button', { name: 'Sounds muted · tap to enable', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hear a happy cuddle' })).toBeEnabled();
});
