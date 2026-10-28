// Mundo ISOMÉTRICO do escritório (vista ?escritorio=iso), no estilo do hotel retrô: projeção 2:1 em canvas 2D, pisos em losango,
// paredes de duas faces com recorte, sprites assados dos modelos 3D (bake.ts) e a ordem de desenho pelo algoritmo do pintor
// (depth.ts). A simulação, a planta e o terreno são os mesmos das vistas 2D e 3D; implementa o contrato WorldApi
// (world/api.ts), então a UI (barra, gaveta, dicas...) não muda.
import { tr } from '../../../../shared/i18n';
import * as artModule from '../../art';
import type { ArtModule, Dir, FurnitureKind } from '../../art/api';
import type { OfficeStore } from '../../net/store';
import { Controls3d, type WallMode } from '../../world3d/controls3d';
import { areaName } from '../../world3d/building3d';
import { seatHeight } from '../../world3d/furniture3d';
import { LabelLayer, iconEmoji, type LabelData } from '../../world3d/labels3d';
import { WALL_H, type Vec3 } from '../../world3d/mapping';
import { footW, gx as mapX, gz as mapZ, toW, useHouseMapping, useOfficeMapping } from './mapping';
import { DEFAULT_WORLD_OPTIONS, type Selection, type SocialEvent, type WorldApi, type WorldOptions } from '../api';
import { BUILDING_H } from '../constants';
import type { WorldDebug } from '../debug';
import type { VisitWorld } from '../index';
import { KART_ID } from '../layout/kart';
import { MALL_BOTTOM } from '../layout/mall';
import { ambientAt, daylightModeOf, effectiveHour, mixRgb, parseHourParam } from '../render/daylight';
import { Sim } from '../sim/sim';
import { isStaffId } from '../sim/staff';
import { appearanceKey, characterSprite, clearSprites, frameOf, furnitureSprite, propSprite, startBakeBudget, type Sprite } from './bake';
import { insertionIndex, sortBoxes, type DepthBox } from './depth';
import { blit, drawWallItem, fillTextured, floorPattern, setPlane, shade, wallPattern } from './draw';
import { HALF_H, HALF_W, HEIGHT_PX, facesCamera, rawX, rawY, rotateXZ, toScreen, toWorld, unrotateXZ, type IsoView, type Rot } from './projection';
import { buildIsoScene, type FurnDraw, type IsoScene, type PropDraw, type WallDraw, type WallItemDraw } from './scene';

const art: ArtModule = artModule;

const NO_VISIT: VisitWorld = {
  setVisitor: () => {},
  setIntent: () => {},
  setLight: () => {},
  atExit: () => false,
  exit: () => false,
  visitorScreen: () => null,
  boardScreen: () => null,
};

/** Alturas das paredes: cheia, de divisória (há piso atrás dela) e recortada (o rodapé). */
const LOW_H = 0.3;
const DIV_H = 1.35;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const KART_FACING = { right: 'down', up: 'right', left: 'up', down: 'left' } as const;
const DIR8: Record<Dir, number> = { down: 0, right: 2, up: 4, left: 6 };

type StaticKind = 'wall' | 'furn' | 'prop' | 'witem';
interface StaticItem extends DepthBox {
  kind: StaticKind;
  wall?: WallDraw;
  furn?: FurnDraw;
  prop?: PropDraw;
  witem?: WallItemDraw;
  host?: WallDraw;
}

interface DynItem extends DepthBox {
  id: string;
}

interface CharState {
  lastX: number;
  lastZ: number;
  heading8: number;
  last: Sprite | null;
}

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  s: Sprite;
}

function aabb(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, rot: Rot): { sx0: number; sx1: number; sy0: number; sy1: number } {
  let sx0 = Infinity;
  let sx1 = -Infinity;
  let sy0 = Infinity;
  let sy1 = -Infinity;
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [y0, y1]) {
    const px = rawX(x, z, rot);
    const py = rawY(x, y, z, rot);
    if (px < sx0) sx0 = px;
    if (px > sx1) sx1 = px;
    if (py < sy0) sy0 = py;
    if (py > sy1) sy1 = py;
  }
  return { sx0, sx1, sy0, sy1 };
}

function boxFor(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, rot: Rot): DepthBox {
  const a = rotateXZ(x0, z0, rot);
  const b = rotateXZ(x1, z1, rot);
  return { u0: Math.min(a.u, b.u), u1: Math.max(a.u, b.u), v0: Math.min(a.v, b.v), v1: Math.max(a.v, b.v), y0, y1, ...aabb(x0, x1, z0, z1, y0, y1, rot) };
}

export function createWorldIso(canvas: HTMLCanvasElement, store: OfficeStore): WorldApi & { debug: WorldDebug; visit: VisitWorld } {
  let options: WorldOptions = { ...DEFAULT_WORLD_OPTIONS };
  const sim = new Sim(art, () => options, undefined);
  const abort = new AbortController();
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const view: IsoView = { rot: 0, zoom: 0.6, focusX: 20, focusZ: 14, cx: 400, cy: 300 };
  const labels = new LabelLayer(canvas);
  let wallMode: WallMode = 'cut';
  const ui = new Controls3d((m) => (wallMode = m), (turns) => rotateView(turns), tr('Arraste para mover a vista, Q e E (ou os botões) giram, roda para o zoom.'));

  // ------------------------------------------------------------------ estado
  const prof = { floors: 0, items: 0, shade: 0, sort: 0, gather: 0, labels: 0, sim: 0, walls: 0, rest: 0, loop: 0, frames: 0 };
  const lap = (k: keyof typeof prof, t0: number): number => {
    const t = performance.now();
    prof[k] += t - t0;
    return t;
  };
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
  let follow: string | null = null;
  let fly: { t0: number; ms: number; from: { x: number; z: number; zoom: number }; to: { x: number; z: number; zoom: number } } | null = null;
  const selectCbs = new Set<(s: Selection) => void>();
  const hoverCbs = new Set<(id: string | null) => void>();
  const socialCbs = new Set<(e: SocialEvent) => void>();
  const roomMenuCbs = new Set<(roomId: string, at: { x: number; y: number }) => void>();
  const tmp: Vec3 = { x: 0, y: 0, z: 0 };
  const charState = new Map<string, CharState>();
  const wallH = new WeakMap<WallDraw, number>();
  let hits: Hit[] = [];
  const headScreen = new Map<string, { x: number; y: number }>();
  // só no servidor de desenvolvimento: deixa o console girar a vista, mexer na câmera e medir o quadro
  if (import.meta.env.DEV) (window as unknown as { __wIso?: unknown }).__wIso = { view, sim, rotateView: (n: 1 | -1) => rotateView(n), chars: () => charState, prof };

  // ------------------------------------------------------------------ cena estática
  let scene: IsoScene | null = null;
  let sceneKey = '';
  let sortedRot: Rot | -1 = -1;
  let sorted: StaticItem[] = [];
  let sceneVersion = 0;
  let sortedVersion = -1;

  const keyOfScene = (): string => {
    const b = sim.building;
    const slots = [...sim.rooms.values()].filter((r) => r.present).map((r) => r.slot).sort((p, q) => p - q).join(',');
    return `${sim.layoutVersion}:${b.cols}:${b.mall ? 1 : 0}:${[...b.core, b.corridor, ...b.rooms].filter((a) => a.rect.w > 0).length}:${slots}`;
  };

  const syncScene = (): void => {
    const key = keyOfScene();
    if (key === sceneKey && scene) return;
    sceneKey = key;
    if (sim.building.house) useHouseMapping([...sim.building.core, sim.building.corridor, ...sim.building.rooms].filter((a) => a.rect.w > 0));
    else useOfficeMapping();
    scene = buildIsoScene(sim);
    sceneVersion++;
  };

  const staticItems = (rot: Rot): StaticItem[] => {
    const sc = scene!;
    const out: StaticItem[] = [];
    const wallsByArea = new Map<string, WallDraw[]>();
    for (const w of sc.walls) {
      out.push({ kind: 'wall', wall: w, ...boxFor(w.x0, w.x1, w.z0, w.z1, w.y0, w.y0 + w.h, rot) });
      if (!w.lintel) (wallsByArea.get(w.areaId) ?? wallsByArea.set(w.areaId, []).get(w.areaId)!).push(w);
    }
    for (const f of sc.furn) out.push({ kind: 'furn', furn: f, ...boxFor(f.x0, f.x1, f.z0, f.z1, 0, 2.2, rot) });
    for (const p of sc.props) out.push({ kind: 'prop', prop: p, ...boxFor(p.x - p.hw, p.x + p.hw, p.z - p.hd, p.z + p.hd, 0, p.h, rot) });
    for (const it of sc.wallItems) {
      const host = (wallsByArea.get(it.areaId) ?? []).find((w) => it.x >= w.x0 - 0.01 && it.x <= w.x1 + 0.01 && Math.abs(it.z - (it.face > 0 ? w.z1 : w.z0)) < 0.2);
      out.push({ kind: 'witem', witem: it, host, ...boxFor(it.x - 0.5, it.x + 0.5, it.z - 0.02, it.z + 0.02, 0, 3, rot) });
    }
    return sortBoxes(out);
  };

  // ------------------------------------------------------------------ câmera
  const free = () => ({ w: Math.max(100, canvas.clientWidth - insets.left - insets.right), h: Math.max(100, canvas.clientHeight - insets.top - insets.bottom) });
  const office = () => ({ w: mapX(sim.building.cols * 16), d: mapZ(BUILDING_H) });

  const overviewTarget = (): { x: number; z: number; zoom: number } => {
    const o = office();
    const mallZ = sim.building.mall ? mapZ(MALL_BOTTOM) : o.d;
    const x0 = -2;
    const x1 = o.w + 2;
    const z0 = -2;
    const z1 = Math.max(o.d + 2, Math.min(mallZ, o.d + 14));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, z, y] of [[x0, z0, WALL_H], [x1, z0, WALL_H], [x0, z1, 0], [x1, z1, 0], [x0, z0, 0], [x1, z1, WALL_H]] as const) {
      const px = rawX(x, z, view.rot);
      const py = rawY(x, y, z, view.rot);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    const f = free();
    const zoom = Math.max(MIN_ZOOM, Math.min(1.4, Math.min(f.w / (maxX - minX), f.h / (maxY - minY)) * 0.94));
    // o ponto do chão que cai no meio do retângulo de tela
    const probe: IsoView = { rot: view.rot, zoom: 1, focusX: 0, focusZ: 0, cx: 0, cy: 0 };
    const mid = toWorld(probe, (minX + maxX) / 2 - rawX(0, 0, view.rot), (minY + maxY) / 2 - rawY(0, 0, 0, view.rot));
    return { x: mid.x, z: mid.z, zoom };
  };

  const flyTo = (x: number, z: number, zoom: number, ms = 600): void => {
    fly = { t0: performance.now(), ms, from: { x: view.focusX, z: view.focusZ, zoom: view.zoom }, to: { x, z, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) } };
  };

  const overview = (animate = true): void => {
    follow = null;
    const t = overviewTarget();
    if (animate) flyTo(t.x, t.z, t.zoom, 700);
    else {
      fly = null;
      view.focusX = t.x;
      view.focusZ = t.z;
      view.zoom = t.zoom;
    }
  };

  const rotateView = (turns: 1 | -1): void => {
    userMoved = true;
    view.rot = ((view.rot + turns + 4) % 4) as Rot;
    fadeIn = 1;
    heavy = 40;
  };
  let heavy = 40;
  let fadeIn = 0;

  const updateCenter = (): void => {
    view.cx = insets.left + (canvas.clientWidth - insets.left - insets.right) / 2;
    view.cy = insets.top + (canvas.clientHeight - insets.top - insets.bottom) / 2;
  };

  const zoomAt = (factor: number, sx: number, sy: number): void => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
    if (z === view.zoom) return;
    const before = toWorld(view, sx, sy);
    view.zoom = z;
    const after = toWorld(view, sx, sy);
    view.focusX += before.x - after.x;
    view.focusZ += before.z - after.z;
    fly = null;
  };

  const resize = (): void => {
    const d = dpr();
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    updateCenter();
  };

  // ------------------------------------------------------------------ personagens
  const kindOfFurniture = (id: string | undefined): FurnitureKind | undefined => {
    if (!id) return undefined;
    const i = id.lastIndexOf(':');
    return i < 0 ? undefined : (id.slice(i + 1) as FurnitureKind);
  };

  interface DrawChar {
    id: string;
    x: number;
    y: number;
    z: number;
    sprite: Sprite | null;
    kart: Sprite | null;
    selected: boolean;
    hovered: boolean;
    status: string;
    box: DynItem;
    headY: number;
  }

  const gatherChars = (now: number): DrawChar[] => {
    const out: DrawChar[] = [];
    for (const id of charState.keys()) if (!sim.person(id)) charState.delete(id);
    for (const ch of sim.people()) {
      if (ch.gone) continue;
      const visible = !ch.inside && ch.alpha > 0.3 && now >= ch.hiddenUntil;
      if (!visible) continue;
      let seatY: number | null = null;
      if (ch.seated && ch.atSpot) {
        seatY = seatHeight(kindOfFurniture(sim.spots.get(ch.atSpot)?.furnitureId));
        toW(ch.x / 16, (ch.y + 3) / 16 - 0.5, tmp);
      } else footW(ch.x + ch.offX, ch.y + ch.offY, tmp);
      let st = charState.get(ch.id);
      if (!st) charState.set(ch.id, (st = { lastX: tmp.x, lastZ: tmp.z, heading8: DIR8[ch.dir as Dir] ?? 0, last: null }));
      const dx = tmp.x - st.lastX;
      const dz = tmp.z - st.lastZ;
      const walking = (ch.pose === 'walk' || ch.pose === 'run') && !(ch.seated && seatY !== null);
      if (walking && Math.hypot(dx, dz) > 1e-4) st.heading8 = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
      else if (!walking) st.heading8 = DIR8[ch.dir as Dir] ?? 0;
      st.lastX = tmp.x;
      st.lastZ = tmp.z;
      const frame = frameOf(ch.pose, ch.animT, (ch.info.seed % 997) * 3);
      const seated = seatY !== null && ch.seated;
      let sprite = characterSprite(ch.appearance, appearanceKey(ch.appearance), ch.pose, frame, st.heading8, seated ? seatY : null, ch.held, view.rot);
      if (sprite) st.last = sprite;
      else sprite = st.last;
      let kart: Sprite | null = null;
      if (ch.vehicle) {
        toW(ch.x / 16, (ch.y + 3) / 16 - 0.5, tmp);
        kart = furnitureSprite('kart', ch.vehicle, 0, 1, 1, KART_FACING[ch.dir as keyof typeof KART_FACING] ?? 'down', view.rot);
      }
      const headY = ((seated ? Math.min(20, seatY! * HEIGHT_PX) : 20) + 42) / HEIGHT_PX + 0.1;
      const box = { id: ch.id, ...boxFor(tmp.x - 0.22, tmp.x + 0.22, tmp.z - 0.22, tmp.z + 0.22, 0, 1.9, view.rot) };
      out.push({ id: ch.id, x: tmp.x, y: 0, z: tmp.z, sprite, kart, selected: selection?.type === 'agent' && selection.id === ch.id, hovered: hover === ch.id, status: ch.info.status, box, headY });
    }
    return out;
  };

  // ------------------------------------------------------------------ paredes (recorte)
  const wallTarget = (w: WallDraw, rot: Rot, focusAreas: Set<string>): number => {
    if (wallMode === 'up') return w.h;
    if (wallMode === 'down') return w.lintel ? 0 : LOW_H;
    const r = rotateXZ(w.ownerNx, w.ownerNz, rot);
    const back = r.u + r.v > 0;
    if (!back) return w.lintel ? 0 : LOW_H;
    if (!w.behind || focusAreas.has(w.areaId)) return w.h;
    return w.lintel ? 0 : DIV_H;
  };

  const updateWalls = (dt: number): void => {
    if (!scene) return;
    const focusAreas = new Set<string>();
    if (selection?.type === 'room') focusAreas.add(selection.id);
    else if (selection?.type === 'agent') {
      const ch = sim.chars.get(selection.id);
      if (ch) focusAreas.add(ch.roomId);
    }
    const k = Math.min(1, dt * 9);
    for (const w of scene.walls) {
      const target = wallTarget(w, view.rot, focusAreas);
      const cur = wallH.get(w) ?? target;
      const next = Math.abs(cur - target) < 0.01 ? target : cur + (target - cur) * k;
      wallH.set(w, next);
    }
  };

  // ------------------------------------------------------------------ desenho
  const dprNow = () => canvas.width / (canvas.clientWidth || canvas.width);

  const polyPath = (pts: { x: number; y: number }[]): void => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  };

  const rectPoly = (x0: number, x1: number, z0: number, z1: number, y: number) => [toScreen(view, x0, y, z0), toScreen(view, x1, y, z0), toScreen(view, x1, y, z1), toScreen(view, x0, y, z1)];

  const onScreen = (sx0: number, sx1: number, sy0: number, sy1: number): boolean => {
    const px = view.cx - rawX(view.focusX, view.focusZ, view.rot) * view.zoom;
    const py = view.cy - rawY(view.focusX, 0, view.focusZ, view.rot) * view.zoom;
    const x0 = px + sx0 * view.zoom;
    const x1 = px + sx1 * view.zoom;
    const y0 = py + sy0 * view.zoom;
    const y1 = py + sy1 * view.zoom;
    return x1 > -80 && x0 < canvas.clientWidth + 80 && y1 > -80 && y0 < canvas.clientHeight + 80;
  };

  const drawFloors = (sc: IsoScene): void => {
    const d = dprNow();
    setPlane(ctx, view, [0, 0, 0], [1, 0, 0], [0, 0, 1], d);
    for (const f of sc.floors) {
      if (!onScreen(...Object.values(aabb(f.x0, f.x1, f.z0, f.z1, 0, 0, view.rot)) as [number, number, number, number])) continue;
      fillTextured(ctx, f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0, f.tint, floorPattern(ctx, f.kind), 0.012);
    }
    for (const r of sc.rugs) {
      ctx.fillStyle = r.color;
      ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    for (const dc of sc.decals) {
      ctx.fillStyle = '#cfcac0';
      ctx.fillRect(dc.x - 1, dc.z, 2, 3);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const drawWall = (w: WallDraw, h: number): void => {
    const d = dprNow();
    if (w.lintel && h < w.y0 + 0.1) return;
    const height = w.lintel ? w.h : h;
    const y0 = w.lintel ? w.y0 : 0;
    const base = w.style.base;
    const pat = wallPattern(ctx, w.style.pattern);
    const nU = unrotateXZ(1, 0, view.rot);
    const nV = unrotateXZ(0, 1, view.rot);
    for (const [n, k] of [[nV, 1], [nU, 0.8]] as const) {
      const col = shade(base, k);
      if (n.z !== 0) {
        const z = n.z > 0 ? w.z1 : w.z0;
        setPlane(ctx, view, [0, 0, z], [1, 0, 0], [0, 1, 0], d);
        fillTextured(ctx, w.x0, y0, w.x1 - w.x0, height, col, pat, 0.006);
        if (!w.lintel) {
          ctx.fillStyle = shade(w.style.trim ?? '#8a8478', k);
          ctx.fillRect(w.x0, 0, w.x1 - w.x0, Math.min(0.14, height));
        }
      } else {
        const x = n.x > 0 ? w.x1 : w.x0;
        setPlane(ctx, view, [x, 0, 0], [0, 0, 1], [0, 1, 0], d);
        fillTextured(ctx, w.z0, y0, w.z1 - w.z0, height, col, pat, 0.006);
        if (!w.lintel) {
          ctx.fillStyle = shade(w.style.trim ?? '#8a8478', k);
          ctx.fillRect(w.z0, 0, w.z1 - w.z0, Math.min(0.14, height));
        }
      }
    }
    // topo
    setPlane(ctx, view, [0, y0 + height, 0], [1, 0, 0], [0, 0, 1], d);
    ctx.fillStyle = shade(base, 1.14);
    ctx.fillRect(w.x0 - 0.01, w.z0 - 0.01, w.x1 - w.x0 + 0.02, w.z1 - w.z0 + 0.02);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const drawWallItemAt = (it: WallDraw | undefined, wi: WallItemDraw, night: number): void => {
    if (!facesCamera(0, wi.face, view.rot)) return;
    if (it && (wallH.get(it) ?? 0) < 2.4) return;
    const d = dprNow();
    const room = sim.rooms.get(wi.areaId);
    const area = wi.kind === 'sign' ? [...sim.building.core, sim.building.corridor, ...sim.building.rooms].find((a) => a.id === wi.areaId) : undefined;
    const name = area ? areaName(area, sim) : '';
    const env = { night, door: wi.elevator >= 0 ? (sim.elevators[wi.elevator]?.door ?? 0) / 4 : 0, signText: name, signColor: room ? room.theme.accent : '#3f5a80' };
    setPlane(ctx, view, [wi.x, 0, wi.z], [wi.face, 0, 0], [0, 1, 0], d);
    drawWallItem(ctx, wi, env);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const shadowEllipse = (x: number, z: number, r: number, alpha: number): void => {
    const p = toScreen(view, x, 0, z);
    ctx.fillStyle = `rgba(10,12,24,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * HALF_W * Math.SQRT2 * view.zoom, r * HALF_H * Math.SQRT2 * view.zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawChar = (c: DrawChar): void => {
    const p = toScreen(view, c.x, 0, c.z);
    shadowEllipse(c.x, c.z, 0.34, 0.22);
    if (c.selected || c.hovered) {
      ctx.strokeStyle = c.selected ? '#ffd84a' : '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 0.5 * HALF_W * Math.SQRT2 * view.zoom, 0.5 * HALF_H * Math.SQRT2 * view.zoom, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (c.kart) blit(ctx, c.kart, p.x, p.y, view.zoom);
    if (c.sprite) {
      blit(ctx, c.sprite, p.x, p.y, view.zoom);
      hits.push({ id: c.id, x: p.x - c.sprite.ax * view.zoom, y: p.y - c.sprite.ay * view.zoom, w: c.sprite.w * view.zoom, h: c.sprite.h * view.zoom, s: c.sprite });
    }
    const head = toScreen(view, c.x, c.headY, c.z);
    headScreen.set(c.id, { x: head.x, y: head.y });
  };

  const drawStatic = (it: StaticItem, night: number): void => {
    if (!onScreen(it.sx0, it.sx1, it.sy0, it.sy1)) return;
    switch (it.kind) {
      case 'wall': {
        const w = it.wall!;
        drawWall(w, wallH.get(w) ?? WALL_H);
        break;
      }
      case 'witem':
        drawWallItemAt(it.host, it.witem!, night);
        break;
      case 'furn': {
        const f = it.furn!;
        if (f.kind === 'kart' && sim.kartsOut.has(f.id)) break;
        const p = toScreen(view, f.cx, 0, f.cz);
        const sp = furnitureSprite(f.kind, f.variant, f.seed, f.w, f.d, f.facing, view.rot);
        if (sp) blit(ctx, sp, p.x, p.y, view.zoom);
        break;
      }
      case 'prop': {
        const pr = it.prop!;
        if (pr.whenRoom !== undefined && !roomSlots.has(pr.whenRoom)) break;
        const p = toScreen(view, pr.x, 0, pr.z);
        const sp = propSprite(pr.prop, view.rot);
        if (sp) blit(ctx, sp, p.x, p.y, view.zoom);
        break;
      }
    }
  };

  let roomSlots = new Set<number>();

  const drawSelection = (): void => {
    if (selection?.type !== 'room' || !scene) return;
    const a = scene.areas.find((r) => r.id === selection!.id);
    if (!a) return;
    polyPath(rectPoly(a.x0, a.x1, a.z0, a.z1, 0.02));
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  const drawRoomShade = (now: number, night: number): void => {
    if (!scene) return;
    for (const a of scene.areas) {
      const room = sim.rooms.get(a.id);
      if (!room) continue;
      const light = Math.max(0, Math.min(1, room.light(now)));
      const pts = [...rectPoly(a.x0, a.x1, a.z0, a.z1, 0), ...rectPoly(a.x0, a.x1, a.z0, a.z1, 1.3)];
      // casco convexo simples dos 8 pontos
      const hull = convexHull(pts);
      if (light <= 0.97) {
        polyPath(hull);
        ctx.fillStyle = `rgba(8,10,28,${(1 - light) * 0.42})`;
        ctx.fill();
      } else if (night > 0.15) {
        // sala acesa de noite: um brilho quente por cima do escuro geral
        polyPath(hull);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(120,90,40,${night * 0.45})`;
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  };

  // ------------------------------------------------------------------ rótulos
  const updateLabels = (now: number): void => {
    const rect = canvas.getBoundingClientRect();
    const out: LabelData[] = [];
    for (const ch of sim.chars.values()) {
      const hs = headScreen.get(ch.id);
      if (!hs || ch.gone) continue;
      const x = hs.x + rect.left;
      const y = hs.y + rect.top;
      const onScr = x > rect.left - 40 && x < rect.right + 40 && y > rect.top - 20 && y < rect.bottom + 40;
      const selected = selection?.type === 'agent' && selection.id === ch.id;
      const hovered = hover === ch.id;
      const waiting = ch.info.status === 'waiting';
      const showName = options.showNames ? view.zoom > 0.35 || selected || hovered || waiting : selected || hovered || waiting;
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
      const drawn = hits.some((h) => h.id === ch.id);
      out.push({ id: ch.id, name: ch.info.name, x, y: y - 6, visible: drawn && onScr, status: ch.info.status, showName, bubble, icon, selected, hovered });
    }
    labels.update(out);
  };

  // ------------------------------------------------------------------ seleção e foco
  const emitSelect = () => selectCbs.forEach((cb) => cb(selection));
  const same = (a: Selection, b: Selection) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id);

  const charPos = (id: string): { x: number; z: number } | null => {
    const st = charState.get(id);
    return st ? { x: st.lastX, z: st.lastZ } : null;
  };

  const focusAgent = (id: string, opts: { follow?: boolean } = {}): void => {
    const p = charPos(id);
    if (!p) return;
    userMoved = true;
    flyTo(p.x, p.z, Math.max(view.zoom, 1.1));
    follow = opts.follow ? id : null;
  };

  const focusRoom = (id: string): void => {
    const a = scene?.areas.find((r) => r.id === id);
    if (!a) return;
    userMoved = true;
    follow = null;
    const f = free();
    const w = (a.x1 - a.x0 + a.z1 - a.z0) * HALF_W;
    flyTo((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2, Math.min(1.6, (f.w * 0.8) / Math.max(w, 1)));
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
  const pickChar = (sx: number, sy: number): string | null => {
    const r = canvas.getBoundingClientRect();
    const x = sx - r.left;
    const y = sy - r.top;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (isStaffId(h.id) || x < h.x || y < h.y || x >= h.x + h.w || y >= h.y + h.h) continue;
      try {
        const px = Math.floor(((x - h.x) / h.w) * h.s.w);
        const py = Math.floor(((y - h.y) / h.h) * h.s.h);
        const a = h.s.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(px, py, 1, 1).data[3];
        if (a > 40) return h.id;
      } catch {
        return h.id;
      }
    }
    return null;
  };

  const pickRoom = (sx: number, sy: number): string | null => {
    if (!scene) return null;
    const r = canvas.getBoundingClientRect();
    const w = toWorld(view, sx - r.left, sy - r.top);
    for (const a of scene.areas) {
      if (w.x < a.x0 || w.x > a.x1 || w.z < a.z0 || w.z > a.z1) continue;
      const room = sim.rooms.get(a.id);
      if (room && room.present && !room.ghost) return a.id;
      if (!room) return a.id;
    }
    return null;
  };

  const pick = (sx: number, sy: number): { type: 'agent' | 'room'; id: string } | null => {
    const c = pickChar(sx, sy);
    if (c) return { type: 'agent', id: c };
    const rm = pickRoom(sx, sy);
    if (rm && sim.rooms.has(rm)) return { type: 'room', id: rm };
    return null;
  };

  const setHover = (id: string | null) => {
    if (id === hover) return;
    hover = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    hoverCbs.forEach((cb) => cb(id));
  };

  let down: { x: number; y: number; t: number; button: number; fx: number; fz: number; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, fx: view.focusX, fz: view.focusZ, moved: false };
    userMoved = true;
    follow = null;
    fly = null;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onUp = (e: PointerEvent) => {
    const d = down;
    down = null;
    if (!d || d.moved || performance.now() - d.t > 500) return;
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
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true;
    canvas.style.cursor = 'grabbing';
    // arrasta o chão junto com o cursor
    const r = canvas.getBoundingClientRect();
    const start: IsoView = { ...view, focusX: down.fx, focusZ: down.fz };
    const a = toWorld(start, down.x - r.left, down.y - r.top);
    const b = toWorld(start, e.clientX - r.left, e.clientY - r.top);
    view.focusX = down.fx + (a.x - b.x);
    view.focusZ = down.fz + (a.z - b.z);
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
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    userMoved = true;
    const r = canvas.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', onDown, { signal: abort.signal });
  window.addEventListener('pointerup', onUp, { signal: abort.signal });
  window.addEventListener('pointermove', onMove, { signal: abort.signal });
  canvas.addEventListener('pointerleave', onLeave, { signal: abort.signal });
  canvas.addEventListener('dblclick', onDbl, { signal: abort.signal });
  canvas.addEventListener('contextmenu', onCtx, { signal: abort.signal });
  canvas.addEventListener('wheel', onWheel, { passive: false, signal: abort.signal });
  canvas.style.cursor = 'grab';
  canvas.style.imageRendering = 'auto';

  // ------------------------------------------------------------------ dados
  const onSnapshot = () => {
    const snap = store.snapshot;
    if (!snap) return;
    try {
      sim.applySnapshot(snap, Date.now());
    } catch (err) {
      console.error('[mundo-iso] snapshot inválido ignorado', err);
    }
  };
  const offSnapshot = store.on('snapshot', onSnapshot);
  if (store.snapshot) onSnapshot();

  // ------------------------------------------------------------------ laço
  const frame = (now: number, dt: number): void => {
    const d = dprNow();
    const hour = effectiveHour(daylightModeOf(options), parseHourParam(location.search), new Date(now));
    const amb = ambientAt(hour);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.imageSmoothingEnabled = options.pixelArt === false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#a9cbe8';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    hits = [];
    headScreen.clear();
    if (!scene) return;
    roomSlots = new Set([...sim.rooms.values()].filter((r) => r.present).map((r) => r.slot));
    if (sortedRot !== view.rot || sortedVersion !== sceneVersion) {
      sorted = staticItems(view.rot);
      sortedRot = view.rot;
      sortedVersion = sceneVersion;
    }
    let t = performance.now();
    drawFloors(scene);
    drawSelection();
    t = lap('floors', t);
    const chars = gatherChars(now);
    t = lap('gather', t);
    const buckets = new Map<number, DrawChar[]>();
    for (const c of chars) {
      const at = insertionIndex(sorted, c.box);
      (buckets.get(at) ?? buckets.set(at, []).get(at)!).push(c);
    }
    for (const list of buckets.values()) list.sort((p, q) => p.box.u0 + p.box.v0 - (q.box.u0 + q.box.v0));
    t = lap('sort', t);
    for (let i = 0; i <= sorted.length; i++) {
      const list = buckets.get(i);
      if (list) for (const c of list) drawChar(c);
      if (i < sorted.length) drawStatic(sorted[i], amb.night);
    }
    t = lap('items', t);
    drawRoomShade(now, amb.night);
    t = lap('shade', t);
    prof.frames++;
    // luz do dia: multiplica a cena pela cor do ambiente (interior e exterior misturados)
    const tint = mixRgb(amb.outside, amb.inside, 0.22);
    if (tint[0] < 254 || tint[1] < 254 || tint[2] < 254) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.round(tint[0])},${Math.round(tint[1])},${Math.round(tint[2])})`;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (fadeIn > 0.01) {
      ctx.fillStyle = `rgba(20,24,36,${fadeIn * 0.5})`;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      fadeIn *= Math.exp(-dt * 14);
    }
  };

  const loop = (ts: number) => {
    raf = requestAnimationFrame(loop);
    const now = Date.now();
    const dt = lastTs ? Math.min(0.1, Math.max(0, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    try {
      const tLoop = performance.now();
      startBakeBudget(heavy > 0 ? 40 : 10);
      if (heavy > 0) heavy--;
      if (Math.round(canvas.clientWidth * dpr()) !== canvas.width) resize();
      sim.update(dt, now);
      const events = sim.social.events;
      if (events.length) {
        for (const e of events) for (const cb of socialCbs) cb(e);
        events.length = 0;
      }
      let tl = lap('sim', tLoop);
      syncScene();
      if (sim.building.cols !== lastCols) {
        lastCols = sim.building.cols;
        if (!framed && sim.initialized) {
          overview(false);
          framed = true;
        } else if (!userMoved) overview(true);
      }
      if (follow) {
        const p = charPos(follow);
        if (!p) follow = null;
        else if (!fly) {
          view.focusX += (p.x - view.focusX) * Math.min(1, dt * 5);
          view.focusZ += (p.z - view.focusZ) * Math.min(1, dt * 5);
        }
      }
      if (fly) {
        const t = Math.min(1, (performance.now() - fly.t0) / fly.ms);
        const e = t * t * (3 - 2 * t);
        view.focusX = fly.from.x + (fly.to.x - fly.from.x) * e;
        view.focusZ = fly.from.z + (fly.to.z - fly.from.z) * e;
        view.zoom = fly.from.zoom + (fly.to.zoom - fly.from.zoom) * e;
        if (t >= 1) fly = null;
      }
      updateCenter();
      updateWalls(dt);
      tl = lap('walls', tl);
      frame(now, dt);
      tl = performance.now();
      if (mouse && !down) setHover(pickChar(mouse.x, mouse.y));
      if (selection?.type === 'agent' && !sim.chars.has(selection.id)) setSelection(null);
      if (selection?.type === 'room' && !sim.rooms.has(selection.id)) setSelection(null);
      updateLabels(now);
      lap('labels', tl);
      prof.loop += performance.now() - tLoop;
    } catch (err) {
      console.error('[mundo-iso] erro no frame', err);
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
      userMoved = true;
      flyTo(view.focusX, view.focusZ, view.zoom * factor, 250);
    },
    getOptions: () => ({ ...options }),
    setOptions: (o) => {
      options = { ...options, ...o };
      if (o.followSelected !== undefined) follow = o.followSelected && selection?.type === 'agent' ? selection.id : null;
    },
    setViewInsets: (ins) => {
      const v = (n: number | undefined, cur: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : cur);
      insets = { top: v(ins.top, insets.top), right: v(ins.right, insets.right), bottom: v(ins.bottom, insets.bottom), left: v(ins.left, insets.left) };
      updateCenter();
    },
    screenPositionOf: (id) => {
      const h = headScreen.get(id);
      if (!h) return null;
      const r = canvas.getBoundingClientRect();
      const x = h.x + r.left;
      const y = h.y + r.top;
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
      labels.dispose();
      ui.dispose();
      clearSprites();
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

/** Casco convexo (cadeia monótona) de pontos da tela. */
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: { x: number; y: number }[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

void KART_ID;
void HEIGHT_PX;
