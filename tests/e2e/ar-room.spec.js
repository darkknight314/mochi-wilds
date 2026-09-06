import { test, expect } from '@playwright/test';

// Headless Chrome has no WebXR and no real camera, so these exercise the tier
// that every browser falls back to, plus the room logic driving it. The XR
// provider's own geometry is covered by the unit tests.
async function adopt(page, name = 'Roam') {
  await page.goto('/');
  await page.getByLabel('WHAT SHOULD WE CALL THEM?').fill(name);
  await page.getByRole('button', { name: 'mint', exact: true }).click();
  await page.getByRole('button', { name: 'Start our little adventure' }).click();
  await expect(page.getByRole('heading', { name: `Hey, ${name}.` })).toBeVisible();
}

test('the camera-free AR preview still opens, renders and closes cleanly', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await adopt(page);
  await page.getByRole('button', { name: 'Meet in your world' }).click();
  await page.getByRole('button', { name: 'Try without a camera' }).click();
  await expect(page.locator('#ar-stage canvas')).toBeVisible();
  await expect(page.locator('#ar-status')).toHaveText('Interactive preview');
  await page.getByRole('button', { name: 'Send some love' }).click();
  await page.getByRole('button', { name: 'Close AR' }).click();
  await expect(page.locator('.ar-shell')).toHaveCount(0);
  // Leaving AR must hand the garden creature back its own roaming area.
  await expect(page.locator('#pet-stage canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('room behaviour keeps a creature on real surfaces in the browser runtime', async ({
  page,
}) => {
  await page.goto('/');
  // Drive the real modules in the browser, the way the AR session does.
  const result = await page.evaluate(async () => {
    const [{ RoomModel, rectangleSurface }, { RoomBounds }, { WanderController, profileOf }] =
      await Promise.all([
        import('/src/room-model.js'),
        import('/src/room-bounds.js'),
        import('/src/motion.js'),
      ]);
    const room = new RoomModel({
      surfaces: [
        rectangleSurface({
          id: 'floor',
          width: 2.4,
          depth: 2.4,
          semantic: 'floor',
          confidence: 0.9,
        }),
        rectangleSurface({
          id: 'table',
          cx: 0.7,
          width: 0.9,
          depth: 0.7,
          y: 0.6,
          semantic: 'table',
          confidence: 0.9,
        }),
      ],
      light: { intensity: 1 },
      tracking: 'ok',
    });
    const bounds = new RoomBounds(room).scaleTo(profileOf('dragon'));
    const controller = new WanderController('dragon', { bounds });
    let offSurface = 0;
    const heights = new Set();
    for (let i = 0; i < 3000; i++) {
      const state = controller.update(1 / 60);
      if (!room.surfaceAt(state.x, state.z)) offSurface++;
      heights.add(Math.round(state.y * 10) / 10);
    }
    return { offSurface, climbed: Math.max(...heights) > 0.3, grounded: heights.has(0) };
  });
  expect(result.offSurface).toBe(0);
  expect(result.climbed).toBe(true);
  expect(result.grounded).toBe(true);
});

// The camera tier is what a laptop and an iPhone actually get, so it is worth
// driving with a real getUserMedia stream rather than trusting it by inspection.
test.describe('camera room sensing', () => {
  test.use({ permissions: ['camera'] });
  test('a tap places real ground and the creature explores it', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await adopt(page, 'Scout');
    await page.getByRole('button', { name: 'Meet in your world' }).click();
    await page.getByRole('button', { name: 'Open camera experience' }).click();
    await expect(page.locator('#ar-status')).toHaveText('Camera mode · manual placement');
    await expect(page.locator('#ar-hint')).toContainText('Tap where the floor is');
    // Before the tap there is no room, so the creature stays near the anchor.
    expect(await page.evaluate(() => window.__arScene?.room?.known)).toBe(false);
    await page.locator('#ar-stage').click({ position: { x: 200, y: 400 } });
    await expect
      .poll(() => page.evaluate(() => window.__arScene?.room?.known), { timeout: 10000 })
      .toBe(true);
    // The room it built is a real floor, and the light came from real frames.
    const sensed = await page.evaluate(() => ({
      surfaces: window.__arScene.room.walkable.length,
      semantic: window.__arScene.room.ground.semantic,
      intensity: window.__arScene.room.light.intensity,
      bounds: !!window.__arScene.roomBounds,
    }));
    expect(sensed.surfaces).toBe(1);
    expect(sensed.semantic).toBe('floor');
    expect(sensed.bounds).toBe(true);
    expect(sensed.intensity).toBeGreaterThan(0);
    // The creature must actually go somewhere. AR scenes are built with
    // roaming off, which once silently swallowed the whole feature: the room
    // was sensed correctly and nothing ever moved.
    const travelled = await page.evaluate(async () => {
      const scene = window.__arScene;
      const seen = new Set();
      let moved = 0;
      let last = { x: scene.motion.x, z: scene.motion.z };
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 250));
        moved += Math.hypot(scene.motion.x - last.x, scene.motion.z - last.z);
        last = { x: scene.motion.x, z: scene.motion.z };
        seen.add(scene.motion.activity);
      }
      return { moved, activities: [...seen] };
    });
    expect(travelled.moved).toBeGreaterThan(0.2);
    // And it must describe the room it is in, not a generic idle caption.
    expect(travelled.activities.some((a) => /your floor/.test(a))).toBe(true);
    await page.getByRole('button', { name: 'Close AR' }).click();
    await expect(page.locator('.ar-shell')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
