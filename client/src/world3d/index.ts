// Mundo 3D do escritório (vista 3D, ?escritorio=3d): a mesma simulação e a mesma planta do escritório 2D (núcleo, corredor, salas
// de projeto e o shopping do outro lado da rua), desenhadas em 3D com Three.js: a câmera gira, as paredes da frente baixam
// (recorte, como no simulação de vida) e os personagens andam, sentam e trabalham de verdade. Implementa o mesmo contrato WorldApi
// do mundo 2D (world/index.ts), então a UI (barra, gaveta, dicas...) não muda.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as artModule from '../art';
import type { ArtModule, FurnitureKind } from '../art/api';
import type { OfficeStore } from '../net/store';
import { DEFAULT_WORLD_OPTIONS, type Selection, type SocialEvent, type WorldApi, type WorldOptions } from '../world/api';
import { BUILDING_H } from '../world/constants';
import type { WorldDebug } from '../world/debug';
import type { VisitWorld } from '../world';
import { KART_ID } from '../world/layout/kart';
import { MALL_BOTTOM } from '../world/layout/mall';
import { effectiveHour, daylightModeOf, parseHourParam } from '../world/render/daylight';
import { Sim } from '../world/sim/sim';
import { isStaffId } from '../world/sim/staff';
import { BuildingScene, CUT_H } from './building3d';
import { Character3D } from './characters3d';
import { Controls3d, type WallMode } from './controls3d';
import { Environment } from './environment3d';
import { ExteriorScene } from './exterior3d';
import { buildFurniture, seatHeight } from './furniture3d';
import { LabelLayer, iconEmoji, type LabelData } from './labels3d';
import { WALL_H, footToWorld3, mapX, mapZ, toWorld3, type Vec3 } from './mapping';
import { DeskScreens } from './screens3d';
import { setPixelArtTextures } from './textures';

const art: ArtModule = artModule;

/** Direção padrão da câmera (do noroeste, de cima): as paredes do norte baixam e dá para ver a entrada a oeste. */
const DEFAULT_DIR = new THREE.Vector3(-0.38, 0.72, -0.58).normalize();
const FOV = 38;

const NO_VISIT: VisitWorld = {
  setVisitor: () => {},
  setIntent: () => {},
  setLight: () => {},
  atExit: () => false,
  exit: () => false,
  visitorScreen: () => null,
  boardScreen: () => null,
};

export function createWorld3D(canvas: HTMLCanvasElement, store: OfficeStore): WorldApi & { debug: WorldDebug; visit: VisitWorld } {
  let options: WorldOptions = { ...DEFAULT_WORLD_OPTIONS };
  const sim = new Sim(art, () => options, undefined, {});
  const abort = new AbortController();
  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  // ------------------------------------------------------------------ cena
  canvas.style.imageRendering = 'auto';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // luz de cinema suave, como nas capturas do simulação de vida
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 900);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 5;
  controls.maxDistance = 220;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  const env = new Environment(scene);
  scene.add(env.root);
  const exterior = new ExteriorScene(sim);
  scene.add(exterior.root);
  const building = new BuildingScene(sim);
  scene.add(building.root);
  const screens = new DeskScreens(sim);
  const labels = new LabelLayer(canvas);
  const chars = new Map<string, Character3D>();
  const ui = new Controls3d(() => {}, (turns) => rotateView(turns));
  // só no servidor de desenvolvimento: deixa o console enquadrar um personagem de perto para conferir o visual
  if (import.meta.env.DEV) (window as unknown as { __w3d?: unknown }).__w3d = { camera, controls, chars, sim, scene, rotateView: (n: 1 | -1) => rotateView(n) };

  // ------------------------------------------------------------------ estado
  let selection: Selection = null;
  let hover: string | null = null;
  let mouse: { x: number; y: number } | null = null;
  let raf = 0;
  let lastTs = 0;
  let hiddenAt = 0;
  let suspended = false;
  let suspendedAt = 0;
  let userMoved = false;
  let framed = false;
  let lastCols = -1;
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const selectCbs = new Set<(s: Selection) => void>();
  const hoverCbs = new Set<(id: string | null) => void>();
  const socialCbs = new Set<(e: SocialEvent) => void>();
  const roomMenuCbs = new Set<(roomId: string, at: { x: number; y: number }) => void>();
  const tmp: Vec3 = { x: 0, y: 0, z: 0 };
  const v3 = new THREE.Vector3();
  let fly: { t0: number; ms: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
  let follow: string | null = null;
  const wallScale = new WeakMap<object, number>();
  let plates: THREE.Mesh[] = [];
  let platesKey = '';

  // ------------------------------------------------------------------ medidas do prédio
  /** O escritório (colunas de salas, corredor e salas do sul) em 3D, para enquadrar a câmera. */
  const office = () => {
    const w = mapX(sim.building.cols * 16);
    const d = mapZ(BUILDING_H);
    return { w, d, cx: w / 2, cz: d / 2 };
  };
  const overviewTarget = (): { target: THREE.Vector3; dist: number } => {
    const o = office();
    const r = Math.hypot(o.w, o.d) / 2;
    const aspect = camera.aspect || 1.6;
    const fitV = r / Math.sin((FOV * Math.PI) / 360);
    return { target: new THREE.Vector3(o.cx, 1, o.cz), dist: Math.min(controls.maxDistance, fitV * (aspect < 1.2 ? 1.0 : 0.72)) };
  };
  const fitScene = () => {
    const o = office();
    const mallZ = sim.building.mall ? mapZ(MALL_BOTTOM) : mapZ(BUILDING_H);
    env.fit(o.cx, mallZ / 2, Math.max(o.w, 64) + 40, mallZ + 30);
  };

  // ------------------------------------------------------------------ tamanho
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // a UI cobre parte da tela: a imagem se centra na área livre
    const dx = (insets.left - insets.right) / 2;
    const dy = (insets.top - insets.bottom) / 2;
    if (dx || dy) camera.setViewOffset(w, h, -dx, -dy, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };

  // ------------------------------------------------------------------ câmera
  const flyTo = (target: THREE.Vector3, dist: number, ms = 600): void => {
    const dir = camera.position.clone().sub(controls.target).normalize();
    fly = { t0: performance.now(), ms, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().addScaledVector(dir, dist) };
  };

  /** Giro da vista em passos de 90° em torno do foco (Q/E e os botões), como a câmera do simulação de vida. */
  let spin: { t0: number; ms: number; done: number; total: number } | null = null;
  const rotateView = (turns: 1 | -1): void => {
    userMoved = true;
    const total = (spin ? spin.total - spin.done : 0) + turns * (Math.PI / 2);
    spin = { t0: performance.now(), ms: 520, done: 0, total };
  };

  const overview = (animate = true): void => {
    follow = null;
    const { target, dist } = overviewTarget();
    const toP = target.clone().addScaledVector(DEFAULT_DIR, dist);
    if (animate) fly = { t0: performance.now(), ms: 700, fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP };
    else {
      fly = null;
      controls.target.copy(target);
      camera.position.copy(toP);
    }
  };

  // ------------------------------------------------------------------ personagens
  const kindOfFurniture = (id: string | undefined): FurnitureKind | undefined => {
    if (!id) return undefined;
    const i = id.lastIndexOf(':');
    return i < 0 ? undefined : (id.slice(i + 1) as FurnitureKind);
  };

  /** Karts de quem está dirigindo (um modelo por piloto, na cena) e as vagas do grid, que ficam vazias enquanto o kart roda. */
  const kartModels = new Map<string, THREE.Object3D>();
  const KART_YAW = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 } as const;
  let kartsHidden = false;
  const syncKarts = (): void => {
    const vis = building.vis(KART_ID);
    if (vis && (sim.kartsOut.size || kartsHidden)) {
      for (const m of vis.group.children) {
        const id = m.userData.furnitureId;
        if (typeof id === 'string' && id.includes(':kart')) m.visible = !sim.kartsOut.has(id);
      }
      kartsHidden = sim.kartsOut.size > 0;
    }
    for (const [id, m] of kartModels) {
      const ch = sim.chars.get(id);
      if (ch && ch.vehicle) continue;
      m.removeFromParent();
      kartModels.delete(id);
    }
    if (!vis) return;
    for (const ch of sim.chars.values()) {
      if (!ch.vehicle || ch.gone) continue;
      let m = kartModels.get(ch.id);
      if (!m || m.userData.variant !== ch.vehicle) {
        m?.removeFromParent();
        m = buildFurniture('kart', ch.vehicle, 0, vis.painter, 1, 1);
        m.userData.variant = ch.vehicle;
        kartModels.set(ch.id, m);
        scene.add(m);
      }
      toWorld3(ch.x / 16, (ch.y + 3) / 16 - 0.5, tmp);
      m.position.set(tmp.x, 0, tmp.z);
      m.rotation.y = KART_YAW[ch.dir as keyof typeof KART_YAW] ?? 0;
    }
  };

  const syncCharacters = (now: number, dt: number): void => {
    for (const [id, c] of chars) {
      if (sim.person(id)) continue;
      c.dispose();
      chars.delete(id);
    }
    for (const ch of sim.people()) {
      if (ch.gone) continue;
      let c = chars.get(ch.id);
      if (!c) {
        c = new Character3D(ch.id, ch.appearance, ch.info.seed);
        chars.set(ch.id, c);
        scene.add(c.root);
      }
      const visible = !ch.inside && ch.alpha > 0.3 && now >= ch.hiddenUntil;
      c.root.visible = visible;
      if (!visible) continue;
      let seatY: number | null = null;
      if (ch.seated && ch.atSpot) {
        const spot = sim.spots.get(ch.atSpot);
        seatY = seatHeight(kindOfFurniture(spot?.furnitureId));
        toWorld3(ch.x / 16, (ch.y + 3) / 16 - 0.5, tmp);
      } else footToWorld3(ch.x + ch.offX, ch.y + ch.offY, 16, 11, tmp);
      v3.set(tmp.x, tmp.y, tmp.z);
      c.update(v3, ch, seatY, dt, now);
      c.setHighlight(selection?.type === 'agent' && selection.id === ch.id, hover === ch.id);
    }
  };

  const updateLabels = (now: number): void => {
    const rect = canvas.getBoundingClientRect();
    const dist = camera.position.distanceTo(controls.target);
    const out: LabelData[] = [];
    for (const ch of sim.chars.values()) {
      const c = chars.get(ch.id);
      if (!c || ch.gone) continue;
      v3.copy(c.headWorld).project(camera);
      const x = (v3.x * 0.5 + 0.5) * rect.width + rect.left;
      const y = (-v3.y * 0.5 + 0.5) * rect.height + rect.top;
      const onScreen = v3.z < 1 && x > rect.left - 40 && x < rect.right + 40 && y > rect.top - 20 && y < rect.bottom + 40;
      const selected = selection?.type === 'agent' && selection.id === ch.id;
      const hovered = hover === ch.id;
      const waiting = ch.info.status === 'waiting';
      const showName = options.showNames ? dist < 130 || selected || hovered || waiting : selected || hovered || waiting;
      let bubble = '';
      if (options.bubbles !== 'none') {
        const say = now < ch.sayUntil ? ch.sayText : '';
        const act = now < ch.bubbleUntil && ch.bubbleText ? ch.bubbleText : '';
        const important = waiting || selected || hovered;
        if (say) bubble = say;
        else if (act && (options.bubbles === 'all' || important)) bubble = act.length > 46 ? `${act.slice(0, 45)}…` : act;
        else if (waiting && ch.info.waitingFor) bubble = ch.info.waitingFor.slice(0, 46);
      }
      const icon = now < ch.iconUntil || (ch.icon && ch.iconUntil > 1e11) ? iconEmoji(ch.icon) : '';
      out.push({ id: ch.id, name: ch.info.name, x, y: y - 4, visible: c.root.visible && onScreen, status: ch.info.status, showName, bubble, icon, selected, hovered });
    }
    labels.update(out);
  };

  // ------------------------------------------------------------------ recorte das paredes
  const updateWalls = (dt: number): void => {
    const mode: WallMode = ui.value;
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const n = Math.hypot(dx, dz) || 1;
    const dirx = dx / n;
    const dirz = dz / n;
    const tg = controls.target;
    const k = Math.min(1, dt * 9);
    // baixa o que está entre a câmera e o foco (e uns tiles atrás dele)
    const lowered = (cx: number, cz: number): boolean => mode === 'down' || (mode === 'cut' && (cx - tg.x) * dirx + (cz - tg.z) * dirz > -3);
    for (const vis of building.all()) {
      for (const w of vis.walls) {
        const target = lowered(w.cx, w.cz) ? CUT_H / WALL_H : 1;
        const cur = wallScale.get(w.group) ?? 1;
        const next = cur + (target - cur) * k;
        wallScale.set(w.group, next);
        w.group.scale.y = Math.abs(next - target) < 0.01 ? target : next;
      }
      for (const it of vis.items) it.obj.visible = !lowered(it.cx, it.cz);
    }
  };

  // ------------------------------------------------------------------ seleção e foco
  const emitSelect = () => selectCbs.forEach((cb) => cb(selection));
  const same = (a: Selection, b: Selection) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id);

  const focusAgent = (id: string, opts: { follow?: boolean } = {}): void => {
    const c = chars.get(id);
    if (!c) return;
    userMoved = true;
    flyTo(c.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)), Math.min(camera.position.distanceTo(controls.target), 20));
    follow = opts.follow ? id : null;
  };

  const focusRoom = (id: string): void => {
    const vis = building.vis(id);
    if (!vis) return;
    userMoved = true;
    follow = null;
    flyTo(vis.center.clone(), 24);
  };

  const setSelection = (sel: Selection, focus = false): void => {
    const was = selection;
    selection = sel;
    if (options.followSelected) follow = sel?.type === 'agent' ? sel.id : null;
    if (focus && sel) {
      if (sel.type === 'agent') focusAgent(sel.id, { follow: options.followSelected });
      else focusRoom(sel.id);
    }
    if (!same(sel, was)) emitSelect();
  };

  // ------------------------------------------------------------------ escolha com o mouse
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const platesNow = (): THREE.Mesh[] => {
    const key = `${sim.layoutVersion}:${building.rooms.size}`;
    if (key !== platesKey) {
      platesKey = key;
      plates = [];
      for (const vis of building.rooms.values()) vis.group.traverse((o) => {
        if (o.userData.kind === 'floor') plates.push(o as THREE.Mesh);
      });
    }
    return plates;
  };

  const pick = (sx: number, sy: number): { type: 'agent' | 'room'; id: string } | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const roots = [...chars.values()].filter((c) => c.root.visible && !isStaffId(c.id)).map((c) => c.root);
    const hit = ray.intersectObjects(roots, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.agentId) o = o.parent;
      if (o) return { type: 'agent', id: o.userData.agentId as string };
    }
    const fl = ray.intersectObjects(platesNow(), false)[0];
    const areaId = fl?.object.userData.areaId as string | undefined;
    if (areaId) {
      const room = sim.rooms.get(areaId);
      if (room && room.present && !room.ghost) return { type: 'room', id: areaId };
    }
    return null;
  };

  const setHover = (id: string | null) => {
    if (id === hover) return;
    hover = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    hoverCbs.forEach((cb) => cb(id));
  };

  let down: { x: number; y: number; t: number; button: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
    userMoved = true;
    follow = null;
    fly = null;
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 500) return;
    const hit = pick(e.clientX, e.clientY);
    if (d.button === 2) {
      const roomId = hit?.type === 'room' ? hit.id : hit?.type === 'agent' ? (sim.chars.get(hit.id)?.roomId ?? null) : null;
      if (roomId && sim.rooms.has(roomId)) roomMenuCbs.forEach((cb) => cb(roomId, { x: e.clientX, y: e.clientY }));
      return;
    }
    if (d.button === 0) setSelection(hit);
  };
  const onMove = (e: PointerEvent) => {
    mouse = { x: e.clientX, y: e.clientY };
  };
  const onLeave = () => {
    mouse = null;
    setHover(null);
  };
  const onDbl = (e: MouseEvent) => {
    const hit = pick(e.clientX, e.clientY);
    if (hit?.type === 'agent') {
      setSelection(hit);
      focusAgent(hit.id, { follow: true });
    } else if (hit?.type === 'room') focusRoom(hit.id);
  };
  const onCtx = (e: MouseEvent) => {
    if (roomMenuCbs.size) e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onDown, { signal: abort.signal });
  window.addEventListener('pointerup', onUp, { signal: abort.signal });
  canvas.addEventListener('pointermove', onMove, { signal: abort.signal });
  canvas.addEventListener('pointerleave', onLeave, { signal: abort.signal });
  canvas.addEventListener('dblclick', onDbl, { signal: abort.signal });
  canvas.addEventListener('contextmenu', onCtx, { signal: abort.signal });
  canvas.style.cursor = 'grab';

  // ------------------------------------------------------------------ dados
  const onSnapshot = () => {
    const snap = store.snapshot;
    if (!snap) return;
    try {
      sim.applySnapshot(snap, Date.now());
    } catch (err) {
      console.error('[mundo3d] snapshot inválido ignorado', err);
    }
  };
  const offSnapshot = store.on('snapshot', onSnapshot);
  if (store.snapshot) onSnapshot();

  // ------------------------------------------------------------------ laço
  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    const now = Date.now();
    const dt = lastTs ? Math.min(0.1, Math.max(0, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    try {
      if (Math.round(canvas.clientWidth * dpr()) !== canvas.width) resize();
      sim.update(dt, now);
      const events = sim.social.events;
      if (events.length) {
        for (const e of events) for (const cb of socialCbs) cb(e);
        events.length = 0;
      }
      exterior.sync();
      if (exterior.current) env.setLanes(exterior.current);
      exterior.update();
      building.sync();
      building.update(now);
      screens.update(
        [...building.rooms.values()].flatMap((v) => v.desks),
        now,
      );
      syncCharacters(now, dt);
      syncKarts();
      const hour = effectiveHour(daylightModeOf(options), parseHourParam(location.search), new Date(now));
      env.update(hour, dt);
      if (sim.building.cols !== lastCols) {
        lastCols = sim.building.cols;
        fitScene();
        if (!framed && sim.initialized) {
          overview(false);
          framed = true;
        } else if (!userMoved) overview(true);
      }
      // a câmera acompanha o personagem seguido
      const fc = follow ? chars.get(follow) : undefined;
      if (follow && !fc) follow = null;
      if (fc && !fly) {
        const d = fc.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(controls.target);
        controls.target.add(d.multiplyScalar(Math.min(1, dt * 5)));
        camera.position.add(d);
      }
      if (spin) {
        const t = Math.min(1, (performance.now() - spin.t0) / spin.ms);
        const goal = spin.total * (t * t * (3 - 2 * t));
        const step = goal - spin.done;
        spin.done = goal;
        const off = camera.position.clone().sub(controls.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
        camera.position.copy(controls.target).add(off);
        if (t >= 1) spin = null;
      }
      if (fly) {
        const t = Math.min(1, (performance.now() - fly.t0) / fly.ms);
        const e = t * t * (3 - 2 * t);
        controls.target.lerpVectors(fly.fromT, fly.toT, e);
        camera.position.lerpVectors(fly.fromP, fly.toP, e);
        if (t >= 1) fly = null;
      }
      controls.update();
      updateWalls(dt);
      if (mouse && !down) {
        const hit = pick(mouse.x, mouse.y);
        setHover(hit?.type === 'agent' ? hit.id : null);
      }
      if (selection?.type === 'agent' && !sim.chars.has(selection.id)) setSelection(null);
      if (selection?.type === 'room' && !sim.rooms.has(selection.id)) setSelection(null);
      renderer.render(scene, camera);
      updateLabels(now);
    } catch (err) {
      console.error('[mundo3d] erro no frame', err);
    }
  };

  const onVisibility = () => {
    if (suspended) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    lastTs = 0;
    if (hiddenAt && Date.now() - hiddenAt > 5000) sim.fastForward(Date.now());
    hiddenAt = 0;
  };
  window.addEventListener('resize', resize, { signal: abort.signal });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'q' || e.key === 'Q') rotateView(-1);
      else if (e.key === 'e' || e.key === 'E') rotateView(1);
    },
    { signal: abort.signal },
  );
  document.addEventListener('visibilitychange', onVisibility, { signal: abort.signal });
  resize();
  // posição inicial razoável antes do primeiro snapshot
  {
    const { target, dist } = overviewTarget();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(DEFAULT_DIR, dist);
    controls.update();
  }
  raf = requestAnimationFrame(loop);

  const noopDebug = new Proxy({}, { get: () => () => null }) as unknown as WorldDebug;

  return {
    select: (sel, opts) => setSelection(sel, !!opts?.focus),
    getSelection: () => selection,
    onSelect: (cb) => {
      selectCbs.add(cb);
      return () => void selectCbs.delete(cb);
    },
    onHover: (cb) => {
      hoverCbs.add(cb);
      return () => void hoverCbs.delete(cb);
    },
    focusAgent,
    focusRoom,
    overview: () => {
      userMoved = false;
      overview(true);
    },
    zoomBy: (factor) => {
      if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
      const d = camera.position.clone().sub(controls.target);
      const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, d.length() / factor));
      flyTo(controls.target.clone(), len, 250);
    },
    getOptions: () => ({ ...options }),
    setOptions: (o) => {
      options = { ...options, ...o };
      if (o.pixelArt !== undefined) setPixelArtTextures(o.pixelArt);
      if (o.followSelected !== undefined) follow = o.followSelected && selection?.type === 'agent' ? selection.id : null;
    },
    setViewInsets: (ins) => {
      const v = (n: number | undefined, cur: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : cur);
      insets = { top: v(ins.top, insets.top), right: v(ins.right, insets.right), bottom: v(ins.bottom, insets.bottom), left: v(ins.left, insets.left) };
      resize();
    },
    screenPositionOf: (id) => {
      const c = chars.get(id);
      if (!c || !c.root.visible) return null;
      const rect = canvas.getBoundingClientRect();
      v3.copy(c.headWorld).project(camera);
      if (v3.z >= 1) return null;
      const x = (v3.x * 0.5 + 0.5) * rect.width + rect.left;
      const y = (-v3.y * 0.5 + 0.5) * rect.height + rect.top;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
      return { x, y };
    },
    social: (id) => sim.social.info(id),
    onRoomContextMenu: (cb) => {
      roomMenuCbs.add(cb);
      return () => void roomMenuCbs.delete(cb);
    },
    onSocialEvent: (cb) => {
      socialCbs.add(cb);
      return () => void socialCbs.delete(cb);
    },
    setPlayback: () => {},
    onSound: () => () => {},
    setSuspended: (on) => {
      if (on === suspended) return;
      suspended = on;
      if (on) {
        cancelAnimationFrame(raf);
        suspendedAt = Date.now();
        setHover(null);
        mouse = null;
        labels.el.style.display = 'none';
        ui.el.style.display = 'none';
        return;
      }
      labels.el.style.display = '';
      ui.el.style.display = '';
      lastTs = 0;
      if (suspendedAt && Date.now() - suspendedAt > 5000) sim.fastForward(Date.now());
      suspendedAt = 0;
      hiddenAt = 0;
      raf = requestAnimationFrame(loop);
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      abort.abort();
      offSnapshot();
      screens.dispose();
      labels.dispose();
      ui.dispose();
      controls.dispose();
      renderer.dispose();
      selectCbs.clear();
      hoverCbs.clear();
      socialCbs.clear();
      roomMenuCbs.clear();
    },
    get debug() {
      return noopDebug;
    },
    visit: NO_VISIT,
  };
}
