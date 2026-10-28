// A parte estática da vista isométrica: lê as áreas da simulação (núcleo, corredor, salas, shopping e os pátios dos slots
// vazios) e o terreno em volta e devolve listas de pisos, tapetes, paredes, quadros, móveis e peças do terreno, já nas
// coordenadas do mundo da vista 3D (world3d/mapping.ts), prontas para o renderer ordenar e desenhar.
import { FURNITURE, type FloorKind, type FurnitureKind, type WallStyle } from '../../art/api';
import { hash32 } from '../../../../shared/hash';
import { CORE_COLS } from '../constants';
import { slotShell } from '../layout/exterior';
import { layoutExterior, type ExteriorLayout } from '../layout/exterior';
import { slotAt } from '../layout/geometry';
import type { AreaLayout, ExteriorProp, FloorPatch, WallSegment } from '../layout/types';
import type { Sim } from '../sim/sim';
import { furnitureFacing, type Facing } from '../../world3d/furniture3d';
import { WALL_H } from '../../world3d/mapping';
import { layoutHouseExterior } from '../layout/house';
import { gx as mapX, gz as mapZ } from './mapping';

const TILE = 16;

export interface FloorDraw {
  kind: FloorKind;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Cor multiplicada sobre a textura (branco = sem tom). */
  tint: string;
  /** Área dona do piso (null no terreno). */
  areaId: string | null;
  exterior: boolean;
}

export interface RugDraw {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  color: string;
}

export interface WallDraw {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Altura cheia e base (a verga de uma porta começa acima de 2,45). */
  h: number;
  y0: number;
  lintel: boolean;
  style: WallStyle;
  areaId: string;
  /** Lado da sala dona da parede (normal em X/Z): a parede é "de fundo" quando esse lado está virado para a câmera. */
  ownerNx: number;
  ownerNz: number;
  /** Tem piso interno atrás da parede (do lado oposto ao da sala dona)? */
  behind: boolean;
}

export interface WallItemDraw {
  id: string;
  kind: string;
  x: number;
  /** Plano onde o item fica (Z) e para onde ele olha (+1 sul, -1 norte). */
  z: number;
  face: 1 | -1;
  seed: number;
  areaId: string;
  /** Índice entre os elevadores da área (as portas seguem a simulação). */
  elevator: number;
}

export interface FurnDraw {
  id: string;
  kind: FurnitureKind;
  variant: string | undefined;
  seed: number;
  w: number;
  d: number;
  facing: Facing;
  cx: number;
  cz: number;
  /** Retângulo ocupado, em tiles do mundo. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  areaId: string;
}

export interface PropDraw {
  prop: ExteriorProp;
  x: number;
  z: number;
  /** Meia largura/profundidade e altura aproximadas (para a ordem de desenho). */
  hw: number;
  hd: number;
  h: number;
  whenRoom: number | undefined;
}

export interface AreaRect {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface IsoScene {
  floors: FloorDraw[];
  rugs: RugDraw[];
  walls: WallDraw[];
  wallItems: WallItemDraw[];
  furn: FurnDraw[];
  props: PropDraw[];
  /** Calçamentos (ExteriorProp 'paving'): achatados no chão. */
  decals: PropDraw[];
  areas: AreaRect[];
  ext: ExteriorLayout;
}

const PROP_SIZE: Record<ExteriorProp['kind'], { hw: number; hd: number; h: number }> = {
  tree: { hw: 0.5, hd: 0.5, h: 5 },
  pine: { hw: 0.5, hd: 0.5, h: 5 },
  bush: { hw: 0.55, hd: 0.45, h: 0.9 },
  flowers: { hw: 0.5, hd: 0.25, h: 0.5 },
  lamp: { hw: 0.2, hd: 0.2, h: 3.4 },
  bench: { hw: 0.95, hd: 0.3, h: 1.1 },
  rock: { hw: 0.5, hd: 0.45, h: 0.6 },
  hedge: { hw: 0.95, hd: 0.3, h: 0.8 },
  parasol: { hw: 0.75, hd: 0.75, h: 2.7 },
  totem: { hw: 0.45, hd: 0.25, h: 2.7 },
  paving: { hw: 1, hd: 1.5, h: 0 },
};

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

function floorOf(f: FloorPatch, area: AreaLayout | null, exterior: boolean): FloorDraw {
  const themed = area?.floorTint ?? f.tint;
  let tint = '#ffffff';
  if (f.kind === 'carpet') tint = themed ?? '#8aa0b8';
  else if (f.kind === 'marble' && themed) tint = mix('#ffffff', themed, 0.22);
  else if (exterior && f.tint) tint = f.tint;
  return { kind: f.kind, x0: mapX(f.x / TILE), x1: mapX((f.x + f.w) / TILE), z0: mapZ(f.y / TILE), z1: mapZ((f.y + f.h) / TILE), tint, areaId: area?.id ?? null, exterior };
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

function wallsOf(area: AreaLayout, seg: WallSegment, out: Omit<WallDraw, 'behind'>[]): void {
  const base = { h: WALL_H, y0: 0, style: seg.style, areaId: area.id };
  const midX = area.rect.x + area.rect.w / 2;
  if (seg.kind === 'cap') {
    const a = Math.floor(seg.x / TILE + 1e-6);
    const b = seg.w < TILE ? a + 1 : (seg.x + seg.w) / TILE;
    // a meia coluna da esquerda é parede de fundo da sala (dona dela olha para leste); a da direita, para oeste
    const left = (seg.x + seg.w / 2) / TILE < midX;
    out.push({ ...base, x0: mapX(a), x1: mapX(b), z0: mapZ(seg.y / TILE), z1: mapZ((seg.y + seg.h) / TILE), lintel: false, ownerNx: left ? 1 : -1, ownerNz: 0 });
    return;
  }
  const rows = seg.kind === 'face' ? 2 : 1;
  const z0 = mapZ(seg.y / TILE);
  const z1 = mapZ(seg.y / TILE + rows);
  const a = seg.x / TILE;
  const b = (seg.x + seg.w) / TILE;
  const gaps = seg.doorways ?? [];
  // a face norte é a parede de fundo da sala (dona ao sul); a mureta sul fecha a sala por baixo (dona ao norte)
  const ownerNz = seg.kind === 'face' ? 1 : -1;
  for (const sd of solids(a, b, gaps)) out.push({ ...base, x0: mapX(sd.s), x1: mapX(sd.e), z0, z1, lintel: false, ownerNx: 0, ownerNz });
  for (const g of gaps) out.push({ ...base, h: WALL_H - 2.45, y0: 2.45, x0: mapX(g.x / TILE), x1: mapX((g.x + g.w) / TILE), z0, z1, lintel: true, ownerNx: 0, ownerNz });
}

export function buildIsoScene(sim: Sim): IsoScene {
  const b = sim.building;
  const ext = b.house ? layoutHouseExterior(b.cols) : layoutExterior(b.cols, !!b.mall);
  const floors: FloorDraw[] = [];
  const rugs: RugDraw[] = [];
  const rawWalls: Omit<WallDraw, 'behind'>[] = [];
  const wallItems: WallItemDraw[] = [];
  const furn: FurnDraw[] = [];
  const props: PropDraw[] = [];
  const decals: PropDraw[] = [];
  const areas: AreaRect[] = [];
  const interior: FloorDraw[] = [];

  const addProp = (p: ExteriorProp): void => {
    const sz = PROP_SIZE[p.kind];
    const d: PropDraw = { prop: p, x: mapX(p.x / TILE), z: mapZ(p.y / TILE), hw: sz.hw, hd: sz.hd, h: sz.h, whenRoom: p.whenRoom };
    (p.kind === 'paving' ? decals : props).push(d);
  };

  for (const f of ext.floors) floors.push(floorOf(f, null, true));
  for (const p of ext.props) addProp(p);

  const addArea = (area: AreaLayout, real: boolean): void => {
    for (const f of area.floors) {
      const fd = floorOf(f, area, !real);
      floors.push(fd);
      if (real) interior.push(fd);
    }
    for (const r of area.rugs) rugs.push({ x0: mapX(r.x / TILE), x1: mapX((r.x + r.w) / TILE), z0: mapZ(r.y / TILE), z1: mapZ((r.y + r.h) / TILE), color: r.color });
    for (const w of area.walls) wallsOf(area, w, rawWalls);
    const elevs: { cx: number; id: string }[] = [];
    for (const it of area.wallItems) if (it.kind === 'elevator') elevs.push({ cx: it.cx, id: it.id });
    elevs.sort((p, q) => p.cx - q.cx);
    for (const it of area.wallItems) {
      const south = it.on === 'south';
      wallItems.push({
        id: it.id,
        kind: it.kind,
        x: mapX(it.cx / TILE),
        z: mapZ(it.baseY / TILE) + (south ? -0.04 : 0.04),
        face: south ? -1 : 1,
        seed: hash32(it.id) % 997,
        areaId: area.id,
        elevator: elevs.findIndex((e) => e.id === it.id),
      });
    }
    for (const p of area.furniture) {
      const def = FURNITURE[p.kind as FurnitureKind];
      if (!def || def.mount !== 'floor') continue;
      const { w, h } = def.footprint;
      const x0 = mapX(p.tx);
      const x1 = mapX(p.tx + w);
      const z0 = mapZ(p.ty);
      const z1 = mapZ(p.ty + h);
      const cx = (x0 + x1) / 2 + (p.dx ?? 0) / TILE;
      const cz = (z0 + z1) / 2 + (p.dy ?? 0) / TILE;
      furn.push({ id: p.id, kind: p.kind, variant: p.variant, seed: hash32(p.id) % 997, w, d: h, facing: furnitureFacing(p.kind, p.variant), cx, cz, x0: cx - (x1 - x0) / 2, x1: cx + (x1 - x0) / 2, z0: cz - (z1 - z0) / 2, z1: cz + (z1 - z0) / 2, areaId: area.id });
    }
    if (real) areas.push({ id: area.id, x0: mapX(area.rect.x), x1: mapX(area.rect.x + area.rect.w), z0: mapZ(area.rect.y), z1: mapZ(area.rect.y + area.rect.h) });
  };

  // pátios dos slots sem sala (desenhados antes, sob as salas)
  const occupied = new Set<number>();
  for (const r of sim.rooms.values()) if (r.present) occupied.add(r.slot);
  const slots = b.house ? 0 : Math.max(0, (b.cols - CORE_COLS) * 2);
  for (let s = 0; s < slots; s++) {
    if (occupied.has(s)) continue;
    const last = slotAt(b.cols - 1, 'north') === s || slotAt(b.cols - 1, 'south') === s;
    const sh = slotShell(s, last);
    addArea({ id: `shell:${s}`, kind: 'corridor', rect: sh.rect, floors: sh.floors, rugs: [], walls: sh.walls, wallItems: sh.windows, furniture: [], spots: [], walkable: [] }, false);
    for (const p of sh.props) addProp(p);
  }
  for (const a of [...b.core, b.corridor, ...b.rooms]) if (a.rect.w > 0) addArea(a, true);

  const hasFloor = (x: number, z: number): boolean => interior.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);
  const walls: WallDraw[] = rawWalls.map((w) => {
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    // sonda do lado oposto ao da sala dona
    const behind = w.ownerNz !== 0 ? hasFloor(cx, w.ownerNz > 0 ? w.z0 - 0.7 : w.z1 + 0.7) : hasFloor(w.ownerNx > 0 ? w.x0 - 0.7 : w.x1 + 0.7, cz);
    return { ...w, behind };
  });

  return { floors, rugs, walls, wallItems, furn, props, decals, areas, ext };
}
