import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCreature, poseCreature, disposeCreature } from './creature-model.js';
import { speciesOf } from './creatures.js';
import { WanderController, MAX_DELTA } from './motion.js';
import { audio } from './audio.js';
export { createCreature as createPet } from './creature-model.js';
const appearanceOf = (pet) => JSON.stringify([speciesOf(pet), pet.color, pet.accessory]);

export class PetScene {
  constructor(
    container,
    pet,
    {
      garden = true,
      roam = garden,
      onActivity = () => {},
      // Cues reach the rate-limited sound engine unless the host wires its own.
      onCue = (cue) => void audio.play(cue),
      reducedMotion = null,
      closeUp = false,
    } = {},
  ) {
    this.container = container;
    this.garden = garden;
    this.roam = roam;
    this.closeUp = closeUp;
    this.inView = true;
    this.onActivity = onActivity;
    this.onCue = onCue;
    this.destroyed = false;
    this.time = 0;
    this.lastFrame = null;
    this.turn = 0;
    this.paused = false;
    this.reducedMotion =
      reducedMotion ??
      (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 50);
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0, 0);
    this.renderer.xr.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentMap = pmrem.fromScene(environment, 0.04);
    this.scene.environment = this.environmentMap.texture;
    this.scene.environmentIntensity = 0.3;
    environment.dispose();
    pmrem.dispose();
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#fff4ed', '#9f91ae', 1.2));
    const key = new THREE.DirectionalLight('#fff1e5', 2.5);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.normalBias = 0.012;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#e0d5ff', 1.6);
    rim.position.set(4, 3, -3);
    this.scene.add(rim);
    this.anchor = new THREE.Group();
    this.scene.add(this.anchor);
    this.pet = createCreature(pet);
    this.appearance = appearanceOf(pet);
    this.anchor.add(this.pet);
    this.motion = new WanderController(speciesOf(pet), { roam, reducedMotion: this.reducedMotion });
    this.base = new THREE.Group();
    this.scene.add(this.base);
    if (garden) this.buildGarden();
    else if (closeUp) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 8),
        new THREE.ShadowMaterial({ color: '#8e7894', opacity: 0.12 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.025;
      floor.receiveShadow = true;
      this.base.add(floor);
    }
    this.destination = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 36).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: '#fff0ae',
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    this.destination.position.y = 0.012;
    this.destination.visible = false;
    this.anchor.add(this.destination);
    this.particles = [];
    const particleGeometry = new THREE.OctahedronGeometry(0.023, 0);
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(
        particleGeometry,
        new THREE.MeshBasicMaterial({
          color: speciesOf(pet) === 'imp' ? '#efb7d2' : '#ffe3a2',
          transparent: true,
          opacity: 0,
        }),
      );
      this.anchor.add(p);
      this.particles.push(p);
    }
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(
      ([entry]) => {
        this.inView = entry.isIntersecting;
        this.lastFrame = null;
      },
      { rootMargin: '80px' },
    );
    this.io.observe(container);
    this.resize();
    this.visibility = () => {
      this.lastFrame = null;
    };
    document.addEventListener('visibilitychange', this.visibility);
    this.renderer.setAnimationLoop((t, frame) => this.animate(t, frame));
    this.greet();
  }
  // The head leads the body: it dips forward into a scamper and looks into the
  // turn. Layered on top of the shared pose, using only the public rig.
  lead() {
    const head = this.pet.rig?.head;
    if (!head || !this.pose) return;
    const bearing = Math.atan2(
      Math.sin(this.motion.heading - this.pose.yaw),
      Math.cos(this.motion.heading - this.pose.yaw),
    );
    const quiet = this.pose.energy || 0.35;
    // Mostly a travelling lead: at rest the head stays with the chosen gaze, so
    // a creature looking at its person really is looking at its person.
    head.rotation.y +=
      Math.max(-0.5, Math.min(0.5, bearing)) * 0.45 * quiet * (0.25 + 0.75 * this.pose.moving);
    head.rotation.x -= this.pose.moving * 0.14 * quiet;
    head.position.z += this.pose.moving * 0.03 * quiet;
  }
  // A hello in the creature's own voice whenever it first appears or changes.
  greet() {
    this.onCue(`${this.pet.rig.species}-hello`);
  }
  buildGarden() {
    const mat = new THREE.MeshStandardMaterial({ color: '#cad9b7', roughness: 1 });
    const turf = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.83, 0.14, 72), mat);
    turf.position.y = -0.08;
    turf.scale.z = 0.69;
    turf.receiveShadow = true;
    this.base.add(turf);
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(1.83, 1.62, 0.23, 72),
      new THREE.MeshStandardMaterial({ color: '#c5abc1', roughness: 1 }),
    );
    soil.position.y = -0.26;
    soil.scale.z = 0.69;
    this.base.add(soil);
    for (let i = 0; i < 24; i++) {
      const a = i * 2.399;
      const stem = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.12, 5),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#accf96' : '#b7d8a5', roughness: 1 }),
      );
      stem.position.set(Math.cos(a) * 1.68, 0.06, Math.sin(a) * 1.08);
      stem.rotation.z = Math.sin(i) * 0.3;
      this.base.add(stem);
      if (i % 3 === 0) {
        const flower = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.055, 1),
          new THREE.MeshStandardMaterial({ color: i % 2 ? '#f2c1d2' : '#fff0bf' }),
        );
        flower.position.copy(stem.position).y += 0.08;
        this.base.add(flower);
      }
    }
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height || this.renderer.xr.isPresenting) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    const minWidth = this.garden ? 4.35 : this.closeUp ? 2.55 : 2.85;
    const distance = Math.max(
      this.garden ? 6.2 : this.closeUp ? 4.05 : 4.7,
      minWidth / (2 * Math.tan(THREE.MathUtils.degToRad(17)) * this.camera.aspect),
    );
    this.camera.position.set(0, this.closeUp ? 1.9 : 2.4, distance);
    this.camera.lookAt(0, this.closeUp ? 1.02 : 0.94, 0);
    this.camera.updateProjectionMatrix();
  }
  attach(container) {
    // Keep the compiled shaders, environment, and current roaming pose when
    // the surrounding UI changes or the player returns from another screen.
    this.ro.disconnect();
    this.io.disconnect();
    this.container = container;
    container.append(this.renderer.domElement);
    this.inView = true;
    this.lastFrame = null;
    this.ro.observe(container);
    this.io.observe(container);
    this.resize();
    if (this.activity) container.dataset.activity = this.activity;
    container.dataset.species = this.pet.rig.species;
  }
  animate(t, frame) {
    if (this.destroyed) return;
    if (this.closeUp && !frame && t - (this.lastRender || 0) < 1000 / 30) return;
    this.lastRender = t;
    // Every step is seconds of elapsed time, clamped so a backgrounded app does
    // not resume with one enormous jump. Nothing below is a per-frame constant.
    const dt =
      this.lastFrame === null ? 0 : Math.min(MAX_DELTA, Math.max(0, (t - this.lastFrame) / 1000));
    this.lastFrame = t;
    if (document.hidden || this.paused || (!this.inView && !this.renderer.xr.isPresenting)) return;
    if (!this.paused) {
      this.time += dt;
      this.pose = this.motion.update(dt);
      poseCreature(this.pet, this.time, this.pose);
      this.pet.position.set(this.pose.x, this.pose.lift, this.pose.z);
      this.pet.rotation.y = this.pose.yaw + this.turn;
      this.lead();
      if (this.pose.activity !== this.activity) {
        this.activity = this.pose.activity;
        this.container.dataset.activity = this.activity;
        this.onActivity(this.activity);
        if (this.pose.action === 'trick') this.onCue(`${speciesOf(this.pet.userData)}-happy`);
        else if (this.pose.action === 'walk' || this.pose.action === 'turn') this.onCue('hop');
      }
      this.container.dataset.species = this.pet.rig.species;
      this.destination.visible = this.motion.state === 'walk' || this.motion.state === 'turn';
      this.destination.position.set(this.motion.target.x, 0.012, this.motion.target.z);
      this.destination.material.opacity = 0.4 + 0.2 * Math.sin(this.time * 4);
      const burst =
        (this.pose.action === 'cuddle' || this.pose.action === 'trick'
          ? Math.sin(Math.PI * this.pose.phase)
          : 0) * (this.pose.energy || 0.35);
      this.particles.forEach((p, i) => {
        const a = i * 2.4 + this.time * 0.5;
        p.position.set(
          this.pose.x + Math.cos(a) * (0.3 + burst * 0.45),
          0.3 + ((i / 14 + this.pose.phase) % 1) * 1.65,
          this.pose.z + Math.sin(a) * 0.45,
        );
        p.material.opacity = burst * 0.65;
        p.rotation.y = this.time;
      });
    }
    if (frame && this.hitSource) {
      const hits = frame.getHitTestResults(this.hitSource);
      this.reticle.visible = hits.length > 0;
      if (hits.length) {
        const pose = hits[0].getPose(this.renderer.xr.getReferenceSpace());
        if (pose) this.reticle.matrix.fromArray(pose.transform.matrix);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  update(pet) {
    const appearance = appearanceOf(pet);
    if (appearance === this.appearance) return;
    this.appearance = appearance;
    disposeCreature(this.pet);
    this.anchor.remove(this.pet);
    this.pet = createCreature(pet);
    this.anchor.add(this.pet);
    this.motion = new WanderController(speciesOf(pet), {
      roam: this.roam,
      reducedMotion: this.reducedMotion,
    });
    this.time = 0;
    this.activity = null;
    this.greet();
  }
  setReducedMotion(value) {
    this.reducedMotion = !!value;
    this.motion.reducedMotion = this.reducedMotion;
  }
  react() {
    this.motion.react();
    this.onCue(`${this.pet.rig.species}-happy`);
  }
  trick() {
    this.motion.trick();
    this.onCue(`${this.pet.rig.species}-happy`);
  }
  comeHere() {
    this.motion.comeHere();
  }
  interact(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.pet, true).length) return 'pet';
    // Tapping the ground is a "come here": the creature paths to the spot and
    // reacts when it arrives.
    const hit = this.raycaster.intersectObject(this.base, true)[0];
    if (hit) {
      const local = this.anchor.worldToLocal(hit.point.clone());
      this.motion.goTo(local.x, local.z, true);
      this.onCue('tap');
      return 'ground';
    }
    return null;
  }
  disposeGroup(group) {
    disposeCreature(group);
  }
  async startXR(onEnd) {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('ar-overlay') },
    });
    this.xrSession = session;
    try {
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);
      this.base.visible = false;
      this.anchor.visible = false;
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitSource = await session.requestHitTestSource({ space: viewer });
      this.reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#acedd0' }),
      );
      this.reticle.matrixAutoUpdate = false;
      this.reticle.visible = false;
      this.scene.add(this.reticle);
      session.addEventListener('select', () => {
        if (this.reticle.visible) {
          this.anchor.position.setFromMatrixPosition(this.reticle.matrix);
          this.anchor.scale.setScalar(0.22);
          this.anchor.visible = true;
          this.motion.comeHere?.();
        }
      });
      session.addEventListener(
        'end',
        () => {
          this.xrSession = null;
          this.hitSource?.cancel();
          this.hitSource = null;
          this.scene.remove(this.reticle);
          disposeCreature(this.reticle);
          if (!this.destroyed) {
            this.anchor.visible = true;
            this.anchor.position.set(0, 0, 0);
            this.anchor.scale.setScalar(1);
            this.base.visible = this.garden;
            this.resize();
            onEnd();
          }
        },
        { once: true },
      );
    } catch (e) {
      await session.end();
      this.anchor.visible = true;
      this.base.visible = this.garden;
      throw e;
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.xrSession?.end().catch(() => {});
    document.removeEventListener('visibilitychange', this.visibility);
    this.ro.disconnect();
    this.io.disconnect();
    this.renderer.setAnimationLoop(null);
    disposeCreature(this.scene);
    this.environmentMap?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
