import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCreature, poseCreature, disposeCreature } from './creature-model.js';
import { speciesOf } from './creatures.js';
import { WanderController, MAX_DELTA, ELLIPSE_BOUNDS } from './motion.js';
import { RoomBounds } from './room-bounds.js';
import { RoomView } from './room-view.js';
import { UNKNOWN_ROOM } from './room-model.js';
import { XRRoomProvider, OPTIONAL_FEATURES, DEPTH_SENSING_INIT } from './room-providers/xr-room.js';
import { CameraRoomProvider } from './room-providers/camera-room.js';
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
    this.gaze = { x: 0, y: 0 };
    this.gazeTarget = { x: 0, y: 0 };
    this.voiceUntil = 0;
    this.pendingVoice = null;
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
    this.key = key;
    const rim = new THREE.DirectionalLight('#e0d5ff', 1.6);
    rim.position.set(4, 3, -3);
    this.scene.add(rim);
    this.anchor = new THREE.Group();
    this.scene.add(this.anchor);
    this.pet = createCreature(pet);
    this.appearance = appearanceOf(pet);
    this.anchor.add(this.pet);
    // Room sensing is off until an AR session asks for it; the garden and the
    // gallery keep the fixed ellipse they have always had.
    this.roomBounds = null;
    this.roomProvider = null;
    // In a real room the anchor stays at unit scale and everything in it is
    // shrunk instead, so the roaming controller can work in real metres.
    this.creatureScale = 1;
    this.roomVideo = null;
    this.occlusionActive = false;
    this.onOcclusion = () => {};
    this.onMapped = () => {};
    this.roomView = null;
    this.room = UNKNOWN_ROOM;
    this.onRoom = () => {};
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
    this.trackPointer = (event) => {
      if (event.pointerType === 'touch') return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.gazeTarget.x = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -1,
        1,
      );
      this.gazeTarget.y = THREE.MathUtils.clamp(
        1 - ((event.clientY - rect.top) / rect.height) * 2,
        -1,
        1,
      );
    };
    this.releaseGaze = () => {
      this.gazeTarget.x = 0;
      this.gazeTarget.y = 0;
    };
    this.renderer.domElement.addEventListener('pointermove', this.trackPointer);
    this.renderer.domElement.addEventListener('pointerleave', this.releaseGaze);
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
    this.say('hello');
  }
  say(kind) {
    this.onCue(`${this.pet.rig.species}-${kind}`);
    this.voiceUntil = this.time + (kind === 'hello' ? 1.1 : 1.4);
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
    if (this.roomProvider) {
      // Depth occlusion only truly begins once depth frames arrive, several
      // frames after the feature is granted, so it is reported from the render
      // loop rather than from session setup.
      const occluding = !!this.renderer.xr.hasDepthSensing?.();
      if (occluding !== this.occlusionActive) {
        this.occlusionActive = occluding;
        this.onOcclusion?.(occluding);
      }
      if (frame) {
        this.applyRoom(this.roomProvider.update(frame, this.renderer.xr.getReferenceSpace()));
      } else if (this.roomVideo) {
        this.applyRoom(this.roomProvider.update(dt, this.roomVideo));
      }
    }
    if (!this.paused) {
      this.time += dt;
      this.pose = this.motion.update(dt);
      if (this.pendingVoice && this.time >= this.pendingVoice.at) {
        this.say(this.pendingVoice.kind);
        this.pendingVoice = null;
      }
      const follow = 1 - Math.exp(-dt * 5);
      this.gaze.x += (this.gazeTarget.x - this.gaze.x) * follow;
      this.gaze.y += (this.gazeTarget.y - this.gaze.y) * follow;
      const talking =
        this.time < this.voiceUntil
          ? Math.max(0, Math.sin((this.voiceUntil - this.time) * 18)) * 0.7
          : 0;
      poseCreature(this.pet, this.time, {
        ...this.pose,
        lookX: this.gaze.x,
        lookY: this.gaze.y,
        talking,
      });
      // `y` is the height of the real surface underfoot — zero everywhere but
      // in a sensed room, where it steps up onto tables and drops back down.
      this.pet.position.set(this.pose.x, (this.pose.y || 0) + this.pose.lift, this.pose.z);
      this.pet.rotation.y = this.pose.yaw + this.turn;
      this.lead();
      if (this.pose.activity !== this.activity) {
        this.activity = this.pose.activity;
        this.container.dataset.activity = this.activity;
        this.onActivity(this.activity);
        if (this.pose.action === 'trick') this.say('happy');
        else if (this.pose.action === 'cuddle')
          this.pendingVoice = { at: this.time + 0.35, kind: 'happy' };
        else if (this.pose.action === 'walk' || this.pose.action === 'turn') this.onCue('hop');
      }
      this.container.dataset.species = this.pet.rig.species;
      this.destination.visible = this.motion.state === 'walk' || this.motion.state === 'turn';
      // The destination marker sits on whichever real surface is being walked to.
      this.destination.position.set(
        this.motion.target.x,
        (this.motion.targetY || 0) + 0.012,
        this.motion.target.z,
      );
      this.destination.material.opacity = 0.4 + 0.2 * Math.sin(this.time * 4);
      const burst =
        (['cuddle', 'trick', 'peekaboo'].includes(this.pose.action)
          ? Math.sin(Math.PI * this.pose.phase)
          : 0) * (this.pose.energy || 0.35);
      this.particles.forEach((p, i) => {
        const a = i * 2.4 + this.time * 0.5;
        p.position.set(
          this.pose.x + Math.cos(a) * (0.3 + burst * 0.45),
          (this.pose.y || 0) + 0.3 + ((i / 14 + this.pose.phase) % 1) * 1.65,
          this.pose.z + Math.sin(a) * 0.45,
        );
        p.material.opacity = burst * 0.65;
        p.rotation.y = this.time;
      });
    }
    if (frame && this.hitSource) {
      const hits = frame.getHitTestResults(this.hitSource);
      this.reticle.visible = hits.length > 0 && !this.anchor.visible;
      if (hits.length) {
        const pose = hits[0].getPose(this.renderer.xr.getReferenceSpace());
        if (pose) {
          this.reticle.matrix.fromArray(pose.transform.matrix);
          // Once placed, every frame's hit test is a free sample of a real
          // surface. Sweeping the phone around maps the room, which is the
          // only way to find a table when the browser shares no planes.
          if (this.anchor.visible && this.roomProvider?.addHit?.(this.reticle.matrix)) {
            this.onMapped?.(this.roomProvider.mapped);
          }
        }
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
    this.pet.scale.setScalar(this.creatureScale);
    this.anchor.add(this.pet);
    this.motion = new WanderController(speciesOf(pet), {
      roam: this.roam,
      reducedMotion: this.reducedMotion,
    });
    this.time = 0;
    this.activity = null;
    this.pendingVoice = null;
    this.greet();
  }
  setReducedMotion(value) {
    this.reducedMotion = !!value;
    this.motion.reducedMotion = this.reducedMotion;
  }
  react() {
    this.motion.react();
    this.pendingVoice = { at: this.time + 0.35, kind: 'happy' };
  }
  trick() {
    this.pendingVoice = null;
    this.motion.trick();
  }
  peekaboo() {
    this.motion.peekaboo();
    this.pendingVoice = { at: this.time + 1.7, kind: 'hello' };
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
  /**
   * Turn on room sensing. The creature stops roaming a fixed ellipse and starts
   * roaming whatever surfaces the given provider reports. Safe to call twice.
   */
  enableRoom(provider, { onRoom = () => {} } = {}) {
    this.roomProvider = provider;
    this.onRoom = onRoom;
    this.roomBounds = new RoomBounds(UNKNOWN_ROOM).scaleTo(this.motion.profile);
    this.motion.bounds = this.roomBounds;
    // AR scenes are built with `garden: false`, which also turns roaming off —
    // that was right when the creature had nowhere to go, but a sensed room is
    // somewhere to go. Without this the controller re-inspects forever and
    // never asks the room for a destination.
    this.roamBeforeRoom = this.motion.roam;
    this.motion.roam = true;
    this.roomView = this.roomView || new RoomView(this.scene, { key: this.key });
    return this;
  }
  /**
   * Scale the creature and its effects without scaling the anchor, so that a
   * metre in the roaming controller stays a metre in the player's room.
   */
  setCreatureScale(scale) {
    this.creatureScale = scale;
    this.pet.scale.setScalar(scale);
    this.destination.scale.setScalar(scale);
    for (const p of this.particles) p.scale.setScalar(scale);
  }
  /** Feed a freshly sensed room to behaviour and rendering. */
  applyRoom(room) {
    if (!room || !this.roomBounds) return;
    const known = room.known;
    const wasKnown = this.room.known;
    this.room = room;
    this.roomBounds.setRoom(room);
    this.roomView?.update(room);
    if (known !== wasKnown) this.onRoom(room);
  }
  /** Stop room sensing and hand the creature back its fixed roaming area. */
  disableRoom() {
    this.roomProvider?.dispose?.();
    this.roomProvider = null;
    this.roomView?.dispose();
    this.roomView = null;
    this.roomBounds = null;
    this.roomVideo = null;
    this.occlusionActive = false;
    this.onOcclusion = () => {};
    this.onMapped = () => {};
    this.room = UNKNOWN_ROOM;
    if (this.roamBeforeRoom !== undefined) this.motion.roam = this.roamBeforeRoom;
    this.roamBeforeRoom = undefined;
    this.motion.bounds = ELLIPSE_BOUNDS;
    this.motion.y = 0;
    this.motion.fromY = 0;
    this.motion.targetY = 0;
  }
  /** Camera-only room sensing, for browsers without WebXR. */
  startCameraRoom(video, options = {}) {
    const provider = new CameraRoomProvider();
    this.enableRoom(provider, options);
    this.roomVideo = video;
    return provider;
  }
  async startXR(
    onEnd,
    { onRoom = () => {}, onFeatures = () => {}, onOcclusion = () => {}, onMapped = () => {} } = {},
  ) {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      // Everything that makes the room real is optional: a browser that
      // refuses any of it still gets a working session, just a simpler room.
      optionalFeatures: ['dom-overlay', ...OPTIONAL_FEATURES],
      domOverlay: { root: document.getElementById('ar-overlay') },
      depthSensing: DEPTH_SENSING_INIT,
    });
    this.xrSession = session;
    try {
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);
      this.base.visible = false;
      this.anchor.visible = false;
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitSource = await session.requestHitTestSource({ space: viewer });
      const provider = new XRRoomProvider();
      this.enableRoom(provider, { onRoom });
      this.onOcclusion = onOcclusion;
      this.onMapped = onMapped;
      await provider.requestLightProbe(session);
      const enabled = session.enabledFeatures;
      // `depthUsage` and `depthDataFormat` are not plain properties: the spec
      // has them throw InvalidStateError when depth sensing was not enabled.
      // Reading them unguarded threw inside this try, ended the session, and
      // dropped the whole experience to camera mode.
      const depthDetail = (key) => {
        try {
          return session[key] ?? null;
        } catch {
          return null;
        }
      };
      onFeatures({
        // `enabledFeatures` is itself optional; without it we find out whether
        // planes are really coming when the first frame reports some.
        planes: enabled ? enabled.includes('plane-detection') : null,
        light: !!provider.lightProbe,
        depth: enabled ? enabled.includes('depth-sensing') : null,
        // Which depth mode was actually granted. This is the difference
        // between "no depth hardware" and "depth we have not consumed yet".
        depthUsage: depthDetail('depthUsage'),
        depthFormat: depthDetail('depthDataFormat'),
        // The raw grant list, so a refusal can be read rather than inferred.
        granted: enabled ? [...enabled] : null,
      });
      this.reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.15, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#acedd0' }),
      );
      this.reticle.matrixAutoUpdate = false;
      this.reticle.visible = false;
      this.scene.add(this.reticle);
      session.addEventListener('select', () => {
        if (!this.reticle.visible) return;
        this.anchor.position.setFromMatrixPosition(this.reticle.matrix);
        // The anchor is left at unit scale and the creature scaled inside it,
        // so the roaming controller works in real metres and a table really is
        // 0.7m away rather than 0.7 of some arbitrary unit.
        this.anchor.scale.setScalar(1);
        this.setCreatureScale(0.22);
        this.anchor.visible = true;
        // Every surface is expressed relative to where the player placed it.
        // The world matrix must be recomputed first: it still holds last
        // frame's transform, from before the anchor moved to the reticle, and
        // using it would offset every detected plane by the placement distance.
        this.anchor.updateMatrixWorld(true);
        this.roomProvider?.setOrigin?.(this.anchor.matrixWorld);
        this.roomProvider?.setFallbackFloor?.();
        this.roomView?.group.position.copy(this.anchor.position);
        this.motion.comeHere?.();
      });
      session.addEventListener(
        'end',
        () => {
          this.xrSession = null;
          this.hitSource?.cancel();
          this.hitSource = null;
          this.scene.remove(this.reticle);
          disposeCreature(this.reticle);
          this.disableRoom();
          if (!this.destroyed) {
            this.anchor.visible = true;
            this.anchor.position.set(0, 0, 0);
            this.anchor.scale.setScalar(1);
            this.setCreatureScale(1);
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
    this.disableRoom();
    this.xrSession?.end().catch(() => {});
    document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.domElement.removeEventListener('pointermove', this.trackPointer);
    this.renderer.domElement.removeEventListener('pointerleave', this.releaseGaze);
    this.ro.disconnect();
    this.io.disconnect();
    this.renderer.setAnimationLoop(null);
    disposeCreature(this.scene);
    this.environmentMap?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
