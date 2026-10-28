// O escritório em 3D: lê as áreas da simulação (sim.building: núcleo, corredor, salas de projeto e o shopping) e monta pisos,
// paredes, tapetes, quadros e móveis. Cada área (cômodo) vira um RoomVis com materiais próprios (a luz do cômodo
// escurece/clareia só ele); as paredes são individuais para o recorte (as que ficam entre a câmera e o foco baixam).
import * as THREE from 'three';
import { FURNITURE, type FurnitureKind } from '../art/api';
import { hash32 } from '../../../shared/hash';
import { tr } from '../../../shared/i18n';
import { CORE_COLS } from '../world/constants';
import { slotAt } from '../world/layout/geometry';
import { MALL_NAMES } from '../world/layout/mall';
import { slotShell } from '../world/layout/exterior';
import type { AreaLayout, ExteriorProp, FloorPatch, FurniturePlacement, WallItemPlacement, WallSegment } from '../world/layout/types';
import type { Sim } from '../world/sim/sim';
import { propObject, propPosition } from './exterior3d';
import { buildFurniture, furnitureFacing, YAW, type Painter } from './furniture3d';
import { WALL_H, mapX, mapZ } from './mapping';
import { floorTexture, signTexture, wallTexture } from './textures';

const TILE = 16;
/** Altura das paredes recortadas (o rodapé que sobra quando uma parede "baixa"). */
export const CUT_H = 0.18;

/** Materiais de um cômodo: a luz do cômodo ajusta a cor deles juntos. */
export class RoomPainter implements Painter {
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private all: { m: THREE.MeshStandardMaterial; base: THREE.Color; emissive: boolean }[] = [];
  light = 1;

  mat(color: string, opts?: { emissive?: boolean; opacity?: number; rough?: number }): THREE.MeshStandardMaterial {
    const key = `${color}|${opts?.emissive ? 'e' : ''}|${opts?.opacity ?? ''}|${opts?.rough ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: opts?.rough ?? 0.85, metalness: 0.02 });
      if (opts?.emissive) {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = 0.85;
      }
      if (opts?.opacity !== undefined) {
        m.transparent = true;
        m.opacity = opts.opacity;
        m.depthWrite = false;
      }
      this.mats.set(key, m);
      this.track(m, !!opts?.emissive);
    }
    return m;
  }

  /** Material fora do cache (texturas por parede): entra na conta da luz. */
  track(m: THREE.MeshStandardMaterial, emissive = false): THREE.MeshStandardMaterial {
    this.all.push({ m, base: m.color.clone(), emissive });
    this.apply(this.all[this.all.length - 1]);
    return m;
  }

  private apply(e: { m: THREE.MeshStandardMaterial; base: THREE.Color; emissive: boolean }): void {
    const k = 0.34 + 0.66 * this.light;
    e.m.color.copy(e.base).multiplyScalar(k);
    if (e.emissive) e.m.emissiveIntensity = 0.3 + 0.55 * this.light;
  }

  setLight(l: number): void {
    if (Math.abs(l - this.light) < 0.01) return;
    this.light = l;
    for (const e of this.all) this.apply(e);
  }

  dispose(): void {
    for (const e of this.all) {
      e.m.map?.dispose();
      e.m.dispose();
    }
  }
}

export interface WallVis {
  /** Grupo do trecho (o pivô fica na base): a escala em Y baixa a parede no recorte. */
  group: THREE.Group;
  /** Centro (X, Z) e o eixo em que a parede corre. */
  cx: number;
  cz: number;
  axis: 'x' | 'z';
}

export interface DeskVis {
  furnitureId: string;
  mesh: THREE.Mesh;
}

export interface ElevatorVis {
  left: THREE.Mesh;
  right: THREE.Mesh;
  cx: number;
}

/** O nome mostrado na placa de uma área (sala de projeto, núcleo ou shopping). */
export function areaName(area: AreaLayout, sim: Sim): string {
  const room = sim.rooms.get(area.id);
  if (room) return room.info.name;
  switch (area.id) {
    case 'core:recepcao':
      return 'Pixel Office';
    case 'core:banheiros':
      return tr('Banheiros');
    case 'core:copa':
      return tr('Copa');
    case 'core:lounge':
      return tr('Lounge');
    case 'core:descanso':
      return tr('Quarto de descanso');
    case 'core:leitura':
      return tr('Sala de leitura');
    default:
      return MALL_NAMES[area.id] ?? '';
  }
}

export class RoomVis {
  readonly group = new THREE.Group();
  readonly painter = new RoomPainter();
  readonly walls: WallVis[] = [];
  readonly desks: DeskVis[] = [];
  readonly elevators: ElevatorVis[] = [];
  /** Itens de parede (quadro, janela...): somem junto com a parede quando ela baixa. */
  readonly items: { obj: THREE.Object3D; cx: number; cz: number }[] = [];
  signMesh: THREE.Mesh | null = null;
  signText = '\u0000';
  /** Centro do cômodo em 3D (para foco). */
  center = new THREE.Vector3();

  constructor(
    readonly area: AreaLayout,
    readonly sim: Sim,
    props: readonly ExteriorProp[] = [],
  ) {
    build(this);
    const v = new THREE.Vector3();
    for (const p of props) {
      const o = propObject(p);
      o.position.copy(propPosition(p, v));
      this.group.add(o);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && m.geometry.userData?.own) m.geometry.dispose();
    });
    this.painter.dispose();
  }
}

// ------------------------------------------------------------------ geometria

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function mixHex(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Piso de uma mancha da área (px do mundo): plano texturizado + uma laje fina por baixo (a fundação). */
function floorPlate(vis: RoomVis, patch: FloorPatch, area: AreaLayout, ground: boolean): void {
  const x0 = mapX(patch.x / TILE);
  const x1 = mapX((patch.x + patch.w) / TILE);
  const z0 = mapZ(patch.y / TILE);
  const z1 = mapZ((patch.y + patch.h) / TILE);
  const w = x1 - x0;
  const d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.userData.own = true;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2, (uv.getY(i) * d) / 2);
  const tex = floorTexture(patch.kind);
  const themed = area.floorTint ?? patch.tint;
  const tint = patch.kind === 'carpet' ? (themed ?? '#8aa0b8') : patch.kind === 'marble' && themed ? mixHex('#ffffff', themed, 0.22) : '#ffffff';
  const m = new THREE.MeshStandardMaterial({ color: tint, map: tex, roughness: patch.kind === 'marble' || patch.kind === 'tile_white' ? 0.35 : 0.9, metalness: 0 });
  vis.painter.track(m);
  const plate = mesh(geo, m, false, true);
  plate.rotation.x = -Math.PI / 2;
  plate.position.set((x0 + x1) / 2, 0.004, (z0 + z1) / 2);
  plate.userData.areaId = area.id;
  plate.userData.kind = 'floor';
  vis.group.add(plate);
  if (ground) {
    const base = mesh(BOX, vis.painter.mat('#8d9097'), false, true);
    base.scale.set(w, 0.12, d);
    base.position.set((x0 + x1) / 2, -0.06, (z0 + z1) / 2);
    vis.group.add(base);
  }
}

function rug(vis: RoomVis, r: { x: number; y: number; w: number; h: number; color: string }): void {
  const x0 = mapX(r.x / TILE);
  const x1 = mapX((r.x + r.w) / TILE);
  const z0 = mapZ(r.y / TILE);
  const z1 = mapZ((r.y + r.h) / TILE);
  const m = mesh(BOX, vis.painter.mat(r.color, { rough: 1 }), false, true);
  m.scale.set(x1 - x0, 0.018, z1 - z0);
  m.position.set((x0 + x1) / 2, 0.014, (z0 + z1) / 2);
  vis.group.add(m);
}

// ------------------------------------------------------------------ paredes

/** Subtrai os vãos das portas (intervalos em px) de [a, b] (em tiles): os trechos sólidos que sobram. */
function solids(a: number, b: number, gaps: { x: number; w: number }[]): { s: number; e: number }[] {
  const g = gaps.map((d) => ({ s: d.x / TILE, e: (d.x + d.w) / TILE })).sort((p, q) => p.s - q.s);
  const out: { s: number; e: number }[] = [];
  let cur = a;
  for (const d of g) {
    if (d.s > cur) out.push({ s: cur, e: Math.min(d.s, b) });
    cur = Math.max(cur, d.e);
  }
  if (cur < b) out.push({ s: cur, e: b });
  return out.filter((x) => x.e - x.s > 1e-4);
}

function addWall(vis: RoomVis, seg: WallSegment): void {
  const style = seg.style;
  const pieces: { x0: number; x1: number; z0: number; z1: number; lintel?: boolean }[] = [];
  let axis: 'x' | 'z' = 'x';
  if (seg.kind === 'cap') {
    // as meias colunas laterais de cada cômodo viram a coluna inteira: as duas juntas fecham a parede do meio
    const a = Math.floor(seg.x / TILE + 1e-6);
    const b = seg.w < TILE ? a + 1 : (seg.x + seg.w) / TILE;
    pieces.push({ x0: mapX(a), x1: mapX(b), z0: mapZ(seg.y / TILE), z1: mapZ((seg.y + seg.h) / TILE) });
    axis = 'z';
  } else {
    const rows = seg.kind === 'face' ? 2 : 1;
    const z0 = mapZ(seg.y / TILE);
    const z1 = mapZ(seg.y / TILE + rows);
    const a = seg.x / TILE;
    const b = (seg.x + seg.w) / TILE;
    const gaps = seg.doorways ?? [];
    for (const sd of solids(a, b, gaps)) pieces.push({ x0: mapX(sd.s), x1: mapX(sd.e), z0, z1 });
    for (const g of gaps) pieces.push({ x0: mapX(g.x / TILE), x1: mapX((g.x + g.w) / TILE), z0, z1, lintel: true });
  }
  const tex = wallTexture(style.pattern);
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    if (w < 1e-3 || d < 1e-3) continue;
    const group = new THREE.Group();
    group.position.set((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2);
    const h = p.lintel ? WALL_H - 2.45 : WALL_H;
    const y0 = p.lintel ? 2.45 : 0;
    let m: THREE.MeshStandardMaterial;
    if (tex) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(Math.max(w, d) / 2, h / 2);
      m = new THREE.MeshStandardMaterial({ color: style.base, map: t, roughness: 0.9 });
      vis.painter.track(m);
    } else m = vis.painter.mat(style.base);
    const wall = mesh(BOX, m);
    wall.scale.set(w, h, d);
    wall.position.y = y0 + h / 2;
    group.add(wall);
    if (!p.lintel) {
      const trim = mesh(BOX, vis.painter.mat(style.trim ?? '#8a8478'), false);
      trim.scale.set(w + 0.03, 0.14, d + 0.03);
      trim.position.y = 0.07;
      group.add(trim);
    }
    vis.walls.push({ group, cx: (p.x0 + p.x1) / 2, cz: (p.z0 + p.z1) / 2, axis });
    vis.group.add(group);
  }
}

// ------------------------------------------------------------------ itens de parede

const ART = ['#e8a33d', '#4a8fd8', '#d65a5a', '#5aa86b', '#9a6fd0', '#e0c24a'];

function addWallItem(vis: RoomVis, it: WallItemPlacement): void {
  const x = mapX(it.cx / TILE);
  const south = it.on === 'south';
  const z = mapZ(it.baseY / TILE) + (south ? -0.04 : 0.04);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  if (south) g.rotation.y = Math.PI;
  const P = vis.painter;
  const seed = hash32(it.id) % 997;
  const panel = (w: number, h: number, color: string, y: number, emissive = false, zz = 0): THREE.Mesh => {
    const m = mesh(PLANE, P.mat(color, { emissive }), false, false);
    m.scale.set(w, h, 1);
    m.position.set(0, y, zz);
    g.add(m);
    return m;
  };
  const frame = (w: number, h: number, y: number, color = '#5a4a3c'): void => {
    const b = mesh(BOX, P.mat(color), false, false);
    b.scale.set(w + 0.1, h + 0.1, 0.05);
    b.position.set(0, y, -0.005);
    g.add(b);
  };
  switch (it.kind) {
    case 'window':
      frame(1.85, 1.25, 1.7, '#e9e5dc');
      panel(1.8, 1.2, '#a9d8f5', 1.7, true, 0.02);
      for (const dx of [-0.45, 0.45]) {
        const bar = mesh(BOX, P.mat('#e9e5dc'), false, false);
        bar.scale.set(0.04, 1.2, 0.03);
        bar.position.set(dx, 1.7, 0.03);
        g.add(bar);
      }
      break;
    case 'painting':
      frame(1.7, 1.0, 1.8);
      panel(1.7, 1.0, ART[seed % ART.length], 1.8, false, 0.02);
      panel(1.2, 0.5, ART[(seed + 2) % ART.length], 1.7, false, 0.03);
      break;
    case 'poster':
      frame(0.7, 1.0, 1.75, '#2b2f38');
      panel(0.7, 1.0, ART[(seed + 1) % ART.length], 1.75, false, 0.02);
      panel(0.4, 0.3, '#ffffff', 1.9, false, 0.03);
      break;
    case 'tv':
      frame(1.8, 1.0, 1.7, '#14171f');
      panel(1.8, 1.0, '#1d3b66', 1.7, true, 0.02);
      break;
    case 'clock': {
      const c = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 20), P.mat('#f4f1e6'), false, false);
      c.rotation.x = Math.PI / 2;
      c.position.set(0, 2.25, 0);
      g.add(c);
      panel(0.02, 0.18, '#2b2f38', 2.3, false, 0.04);
      break;
    }
    case 'whiteboard':
      frame(2.8, 1.2, 1.7, '#8d97a6');
      panel(2.8, 1.2, '#f7f8fa', 1.7, false, 0.02);
      for (let i = 0; i < 5; i++) panel(0.32, 0.22, ART[(i + seed) % ART.length], 1.5 + (i % 2) * 0.4, false, 0.03).position.x = -1.0 + i * 0.5;
      break;
    case 'sign': {
      const m = mesh(PLANE, new THREE.MeshBasicMaterial({ color: 0xffffff }), false, false);
      m.scale.set(2.9, 0.48, 1);
      m.position.set(0, 2.45, 0.03);
      g.add(m);
      vis.signMesh = m;
      break;
    }
    case 'mirror':
      frame(0.8, 1.1, 1.65, '#8d97a6');
      panel(0.8, 1.1, '#cfe6f0', 1.65, true, 0.02);
      break;
    case 'light_switch': {
      const b = mesh(BOX, P.mat('#f4f1e6'), false, false);
      b.scale.set(0.12, 0.2, 0.04);
      b.position.set(0, 1.25, 0);
      g.add(b);
      break;
    }
    case 'shelf_wall': {
      const s = mesh(BOX, P.mat('#8a6a45'), false, false);
      s.scale.set(1.9, 0.06, 0.3);
      s.position.set(0, 1.75, 0.15);
      g.add(s);
      for (let i = 0; i < 4; i++) {
        const b = mesh(BOX, P.mat(ART[(i + seed) % ART.length]), false, false);
        b.scale.set(0.2, 0.3 + (i % 2) * 0.12, 0.2);
        b.position.set(-0.7 + i * 0.45, 1.78 + (0.3 + (i % 2) * 0.12) / 2, 0.15);
        g.add(b);
      }
      break;
    }
    case 'elevator': {
      // moldura de aço e duas portas que correm (a abertura vem da simulação: ver BuildingScene.update)
      const fr = mesh(BOX, P.mat('#8d97a6'), false, false);
      fr.scale.set(2.1, 2.6, 0.12);
      fr.position.set(0, 1.3, -0.02);
      g.add(fr);
      const dark = mesh(BOX, P.mat('#1b1f29'), false, false);
      dark.scale.set(1.8, 2.4, 0.04);
      dark.position.set(0, 1.25, 0.03);
      g.add(dark);
      const door = (sx: number): THREE.Mesh => {
        const d = mesh(BOX, P.mat('#c3cad4', { rough: 0.35 }), false, false);
        d.scale.set(0.9, 2.4, 0.05);
        d.position.set(sx * 0.45, 1.25, 0.07);
        g.add(d);
        return d;
      };
      const left = door(-1);
      const right = door(1);
      panel(0.3, 0.1, '#7be0a0', 2.75, true, 0.05);
      vis.elevators.push({ left, right, cx: x });
      break;
    }
    default:
      return;
  }
  vis.group.add(g);
  vis.items.push({ obj: g, cx: x, cz: z });
}

// ------------------------------------------------------------------ móveis

function addFurniture(vis: RoomVis, p: FurniturePlacement): void {
  const def = FURNITURE[p.kind as FurnitureKind];
  if (!def || def.mount !== 'floor') return;
  const { w, h } = def.footprint;
  const x0 = mapX(p.tx);
  const x1 = mapX(p.tx + w);
  const z0 = mapZ(p.ty);
  const z1 = mapZ(p.ty + h);
  const model = buildFurniture(p.kind, p.variant, hash32(p.id) % 997, vis.painter, w, h);
  model.rotation.y = YAW[furnitureFacing(p.kind, p.variant)];
  model.position.set((x0 + x1) / 2 + (p.dx ?? 0) / TILE, 0, (z0 + z1) / 2 + (p.dy ?? 0) / TILE);
  model.userData.furnitureId = p.id;
  vis.group.add(model);
  if (p.kind === 'desk') {
    const screen = model.getObjectByName('screen') as THREE.Mesh | undefined;
    if (screen) vis.desks.push({ furnitureId: p.id, mesh: screen });
  }
}

function build(vis: RoomVis): void {
  const a = vis.area;
  const ground = !a.id.startsWith('shell:');
  for (const f of a.floors) floorPlate(vis, f, a, ground && f.kind !== 'wood' && f.kind !== 'sidewalk');
  for (const r of a.rugs) rug(vis, r);
  for (const w of a.walls) addWall(vis, w);
  for (const it of a.wallItems) addWallItem(vis, it);
  for (const fp of a.furniture) addFurniture(vis, fp);
  vis.elevators.sort((p, q) => p.cx - q.cx);
  const x0 = mapX(a.rect.x);
  const x1 = mapX(a.rect.x + a.rect.w);
  const z0 = mapZ(a.rect.y);
  const z1 = mapZ(a.rect.y + a.rect.h);
  vis.center.set((x0 + x1) / 2, 1.2, (z0 + z1) / 2);
}

// ------------------------------------------------------------------ o prédio

/** Pátio e fechamento do corredor de um slot sem sala, como uma "área" para reaproveitar o mesmo desenho. */
function shellArea(slot: number, last: boolean): { area: AreaLayout; props: ExteriorProp[] } {
  const s = slotShell(slot, last);
  const area: AreaLayout = { id: `shell:${slot}`, kind: 'corridor', rect: s.rect, floors: s.floors, rugs: [], walls: s.walls, wallItems: s.windows, furniture: [], spots: [], walkable: [] };
  return { area, props: s.props };
}

export class BuildingScene {
  readonly root = new THREE.Group();
  readonly rooms = new Map<AreaLayout, RoomVis>();
  private readonly byId = new Map<string, RoomVis>();
  private readonly shells = new Map<string, RoomVis>();

  constructor(private readonly sim: Sim) {}

  vis(areaId: string): RoomVis | undefined {
    return this.byId.get(areaId);
  }

  /** Todos os RoomVis (áreas e pátios). */
  *all(): IterableIterator<RoomVis> {
    yield* this.rooms.values();
    yield* this.shells.values();
  }

  /** Acompanha a lista de áreas da simulação: constrói as novas e remove as que sumiram; idem os pátios dos slots vazios. */
  sync(): void {
    const b = this.sim.building;
    const areas = [...b.core, b.corridor, ...b.rooms].filter((a) => a.rect.w > 0);
    const now = new Set(areas);
    for (const [area, v] of this.rooms) {
      if (now.has(area)) continue;
      this.root.remove(v.group);
      v.dispose();
      this.rooms.delete(area);
      if (this.byId.get(area.id) === v) this.byId.delete(area.id);
    }
    for (const area of areas) {
      if (this.rooms.has(area)) continue;
      const v = new RoomVis(area, this.sim);
      this.rooms.set(area, v);
      this.byId.set(area.id, v);
      this.root.add(v.group);
    }
    // pátios: um por slot de projeto sem sala (some quando a sala chega)
    const occupied = new Set<number>();
    for (const r of this.sim.rooms.values()) if (r.present) occupied.add(r.slot);
    const want = new Set<string>();
    const slots = Math.max(0, (b.cols - CORE_COLS) * 2);
    for (let s = 0; s < slots; s++) {
      if (occupied.has(s)) continue;
      const last = slotAt(b.cols - 1, 'north') === s || slotAt(b.cols - 1, 'south') === s;
      const key = `${s}:${last ? 1 : 0}`;
      want.add(key);
      if (this.shells.has(key)) continue;
      const sh = shellArea(s, last);
      const v = new RoomVis(sh.area, this.sim, sh.props);
      this.shells.set(key, v);
      this.root.add(v.group);
    }
    for (const [key, v] of this.shells) {
      if (want.has(key)) continue;
      this.root.remove(v.group);
      v.dispose();
      this.shells.delete(key);
    }
  }

  /** Atualiza o que muda com o tempo: luz de cada cômodo, o nome na placa e as portas dos elevadores. */
  update(now: number): void {
    for (const v of this.rooms.values()) {
      const room = this.sim.rooms.get(v.area.id);
      v.painter.setLight(room ? Math.max(0, Math.min(1, room.light(now))) : 1);
      if (v.signMesh) {
        const name = areaName(v.area, this.sim);
        if (name !== v.signText) {
          v.signText = name;
          const mat = v.signMesh.material as THREE.MeshBasicMaterial;
          mat.map = name ? signTexture(name, room ? room.theme.accent : '#3f5a80', '#ffffff') : null;
          mat.color.set(name ? 0xffffff : 0x9aa3b2);
          mat.needsUpdate = true;
        }
      }
      v.elevators.forEach((e, i) => {
        const open = (this.sim.elevators[i]?.door ?? 0) / 4;
        e.left.position.x = -0.45 - open * 0.42;
        e.right.position.x = 0.45 + open * 0.42;
      });
    }
  }
}
