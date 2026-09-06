import { test, expect } from '@playwright/test';
test('all five real 3D creatures render and respond with their own voices', async ({ page }) => {
  // Five WebGL contexts are compiled by Chrome's software renderer in CI.
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/creatures.html');
  await expect(page.locator('.model-view canvas')).toHaveCount(5);
  await page.evaluate(() => {
    for (const view of window.creatureStudio.views.values()) {
      view.paused = true;
      view.pet.rotation.y = 0.22;
      view.renderer.render(view.scene, view.camera);
    }
  });
  await page.screenshot({ path: 'test-results/creature-lineup-3d.png', fullPage: true });
  for (const id of ['dragon', 'mothkit', 'otter', 'imp', 'ferret']) {
    await page.locator(`[data-pet="${id}"][data-action="cuddle"]`).click();
    await expect(page.locator(`#view-${id}`)).toHaveAttribute('data-activity', 'That is the spot!');
    await page.locator(`[data-pet="${id}"][data-action="trick"]`).click();
    await expect
      .poll(() => page.evaluate((id) => window.creatureStudio.views.get(id).pose?.action, id))
      .toBe('trick');
    const loaded = await page.evaluate(async (id) => {
      const { audio } = await import('/src/audio.js');
      await audio.unlock();
      return !!(await audio.buffer(`${id}-happy`));
    }, id);
    expect(loaded).toBe(true);
    await page.evaluate((id) => {
      window.creatureStudio.views.get(id).paused = true;
    }, id);
  }
  expect(errors).toEqual([]);
});
test('mobile creature close-ups fit and rotation exposes real geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creatures.html');
  await expect(page.locator('.model-view canvas')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    for (const view of window.creatureStudio.views.values()) {
      view.paused = true;
      view.pet.rotation.y = 0.15;
      view.renderer.render(view.scene, view.camera);
    }
  });
  for (const id of ['dragon', 'mothkit', 'otter', 'imp', 'ferret']) {
    await page
      .locator(`.creature-card.${id}`)
      .screenshot({ path: `test-results/creature-${id}.png` });
  }
  await page.evaluate(async () => {
    const { poseCreature } = await import('/src/creature-model.js');
    const view = window.creatureStudio.views.get('dragon');
    poseCreature(view.pet, 0.75, { action: 'cuddle', phase: 0.5 });
    view.pet.rotation.y = 0.1;
    view.renderer.render(view.scene, view.camera);
  });
  await page
    .locator('.creature-card.dragon')
    .screenshot({ path: 'test-results/creature-cuddle.png' });
  await page.getByRole('slider', { name: 'Rotate Pocket Dragon' }).fill('80');
  const rotation = await page.evaluate(() => window.creatureStudio.views.get('dragon').turn);
  expect(rotation).toBeCloseTo((80 * Math.PI) / 180);
});

test('peekaboo hides then reveals the face and returns to idle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/creatures.html');
  await expect(page.locator('.model-view canvas')).toHaveCount(5);
  await page.locator('[data-pet="dragon"][data-action="peekaboo"]').click();
  await expect
    .poll(() => page.evaluate(() => window.creatureStudio.views.get('dragon').motion.state))
    .toBe('peekaboo');
  // Capture specific beats of the real shared animation for visual review.
  for (const [label, phase] of [
    ['hide', 0.3],
    ['reveal', 0.65],
    ['settled', 1],
  ]) {
    const state = await page.evaluate(
      async ({ phase }) => {
        const { poseCreature } = await import('/src/creature-model.js');
        for (const view of window.creatureStudio.views.values()) view.paused = true;
        const view = window.creatureStudio.views.get('dragon');
        poseCreature(view.pet, phase * 3.4, { action: 'peekaboo', phase });
        view.pet.rotation.y = 0;
        view.renderer.render(view.scene, view.camera);
        return { paw: view.pet.rig.legs[2].position.y, head: view.pet.rig.head.position.y };
      },
      { phase },
    );
    if (label === 'hide') expect(state.paw).toBeGreaterThan(state.head - 0.08);
    if (label === 'settled') expect(state.paw).toBeLessThan(state.head - 0.3);
    await page
      .locator('.creature-card.dragon')
      .screenshot({ path: `test-results/peekaboo-${label}.png` });
  }
  await page.evaluate(() => {
    const view = window.creatureStudio.views.get('dragon');
    for (let i = 0; i < 16; i++) view.motion.update(0.25);
  });
  expect(await page.evaluate(() => window.creatureStudio.views.get('dragon').motion.state)).toBe(
    'inspect',
  );
});
