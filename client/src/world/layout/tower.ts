// Planta do prédio em andares (vista Prédio: SimMode.tower, ?escritorio=predio), no estilo da casa de bonecas de simulação de vida.
//
// Um corte do prédio: andares empilhados, cada um com cômodos de tamanhos diferentes lado a lado, portas entre eles num
// "corredor" imaginário (a linha das portas laterais) e a escada ligando o hall de um andar ao de cima. Sem corredor de
// leste a oeste nem elevador: quem chega entra pela porta da frente do térreo e sobe a escada.
//
//   andar 4 ┌ escada ┬──── sala ────┬──── sala ────┬─── sala ───┐
//   andar 3 ├ escada ┼──── sala ────┼──── sala ────┼─── sala ───┤   salas de projeto (3 por andar, 12 no total)
//   andar 2 ├ escada ┼──── sala ────┼──── sala ────┼─── sala ───┤
//   andar 1 ├ escada ┼──── sala ────┼──── sala ────┼─── sala ───┤
//   térreo  └ hall   ┴──── copa ─────┴──── lounge ───┴ banheiros ┘   porta da frente, calçada e rua
//
// Usa as mesmas peças da casa (layout/house.ts: shell, kit, plantas por cômodo): cada cômodo tem 11 linhas
// (2 de face da parede norte, 8 de piso e 1 de parede sul) e as paredes laterais são meia coluna. Os andares se encostam:
// a escada de um andar sobe pela face norte do hall e sai na parede sul do hall do andar de cima (mesmas colunas).
import { mulberry32 } from '../../../../shared/hash';
import type { RoomTheme } from '../../art/api';
import { COL_W, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, TILE } from '../constants';
import { AreaBuilder } from './builder';
import type { ExteriorLayout } from './exterior';
import { kit, layoutHouseRoom, LOOK, shell, type Plan } from './house';
import type { AreaKind, AreaLayout, ExteriorProp, FloorPatch, TileRect } from './types';

export const TOWER_COLS = 4;
export const TOWER_W = TOWER_COLS * COL_W;
/** Altura de um andar: 2 linhas de face da parede norte, 8 de piso e 1 de parede sul. */
export const FLOOR_H = 11;
/** Térreo + andares de projeto. */
export const TOWER_FLOORS = 5;
export const TOWER_H = FLOOR_H * TOWER_FLOORS;
export const ROOMS_PER_FLOOR = 3;
/** Quantas salas de projeto cabem (as vagas além disso repetem a última). */
export const TOWER_SLOTS = ROOMS_PER_FLOOR * (TOWER_FLOORS - 1);

export const TOWER_HALL_ID = 'core:recepcao';
const HALL_W = 12;
/** Linha (local) das portas laterais, junto ao piso: nenhuma mesa nem móvel fica nas duas linhas de baixo. */
const LANE = 8;
/** Coluna (local) da escada no hall: ocupa as colunas 5 e 6. */
const STAIR_X = 5;
/** Larguras das três salas de projeto por andar (somam 52): variam de um andar para o outro. */
const WIDTHS: readonly (readonly [number, number, number])[] = [
  [18, 18, 16],
  [16, 20, 16],
  [20, 16, 16],
  [16, 16, 20],
];

/** Topo (em tiles) de um andar; 0 = térreo, embaixo. */
export const floorTop = (floor: number) => (TOWER_FLOORS - 1 - floor) * FLOOR_H;

export interface TowerSlot {
  floor: number;
  /** 0 = junto à escada, 2 = na ponta. */
  pos: number;
  plan: Plan;
}

/** Cômodo de projeto de uma vaga (as vagas além da capacidade repetem a última). */
export function towerSlot(slot: number): TowerSlot {
  const s = Math.max(0, Math.min(TOWER_SLOTS - 1, Math.floor(slot)));
  const floor = 1 + Math.floor(s / ROOMS_PER_FLOOR);
  const pos = s % ROOMS_PER_FLOOR;
  const widths = WIDTHS[(floor - 1) % WIDTHS.length];
  let x = HALL_W;
  for (let i = 0; i < pos; i++) x += widths[i];
  const w = widths[pos];
  const rect: TileRect = { x, y: floorTop(floor), w, h: FLOOR_H };
  const doors: Plan['doors'] = [{ side: 'w', at: LANE }];
  if (pos < ROOMS_PER_FLOOR - 1) doors.push({ side: 'e', at: LANE });
  return { floor, pos, plan: { rect, doors } };
}

/** Rótulo do andar (tr no overlay). */
export function floorOf(ty: number): number {
  return Math.max(0, Math.min(TOWER_FLOORS - 1, TOWER_FLOORS - 1 - Math.floor(ty / FLOOR_H)));
}

// ------------------------------------------------------------------ cômodos de projeto

export const WORK_LOOK = (theme: RoomTheme) => ({ floor: 'marble' as FloorPatch['kind'], wall: theme.wall });
const PLANTS_TALL = ['palm', 'ficus', 'monstera', 'bonsai'] as const;
const PLANTS_SMALL = ['fern', 'succulent', 'flower'] as const;
const POSTERS = ['code', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'] as const;
const BEANBAGS = ['red', 'blue', 'yellow', 'green'] as const;

/** Sala de projeto da vaga `slot`: ilha de mesas face a face, canto de reunião e a linha livre das portas. */
export function layoutTowerRoom(id: string, slot: number, theme: RoomTheme, seed: number): AreaLayout {
  return layoutWorkRoom(id, towerSlot(slot).plan, theme, seed, false);
}

/**
 * Sala de projeto num cômodo qualquer da planta. : variante com portas verticais (o antigo prédio 3D), cujas salas têm portas
 * verticais junto à parede oeste (colunas 1 e 2 livres da linha 2 à 9): a ilha de mesas começa na coluna 4.
 */
export function layoutWorkRoom(id: string, plan: Plan, theme: RoomTheme, seed: number, block: boolean): AreaLayout {
  const { w } = plan.rect;
  const ix = block ? 4 : 2;
  const rng = mulberry32((seed ^ 0x70e7) >>> 0);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
  const b = shell(id, 'room', plan, WORK_LOOK(theme), seed, theme.carpet);
  const k = kit(b, theme);
  const { furn, wallItem, chair, sign, windowAt, lightSwitch, shelf } = k;

  // parede: sinal com o nome, quadro kanban, relógio, janelas e o interruptor junto à porta da esquerda
  sign(w / 2 + 1);
  wallItem('whiteboard', block ? 7.5 : 4.5, undefined, 0.6);
  b.spot('whiteboard', block ? 7 : 4, 2, 'up', { dx: 8, dy: 2 });
  wallItem('clock', w - 4.5, undefined, 0.7);
  if (w >= 18) wallItem('poster', w - 6, pick(POSTERS), 0.5);
  windowAt(w - 2.5, w - 3);
  lightSwitch(block ? 3.5 : 1.5, block ? 3 : 1);

  // tapete na cor do tema sob a ilha
  const pairs = w >= 18 ? 4 : 3;
  b.rug(ix - 0.4, 2.7, pairs * 2 + 1.4, 4.9, theme.carpet, seed);

  // ilha de mesas face a face (linhas 3 a 6): de costas ao sul, de frente ao norte
  const ranks = [2, 0, 4, 6];
  for (let i = 0; i < pairs; i++) {
    const lx = ix + i * 2;
    const back = furn('desk_back', lx, 4, theme.deskVariant, { order: 0.35 + i * 0.05, seat: `N${i}` });
    const front = furn('desk', lx, 5, theme.deskVariant, { order: 0.4 + i * 0.05, seat: `S${i}` });
    b.seat('desk', 'office_chair_front', lx, 3, 'down', theme.chairVariant, { dx: TILE / 2, deskId: back, rank: ranks[i % ranks.length] + 1, side: 'N', order: 0.55 + i * 0.03 });
    b.seat('desk', 'office_chair', lx, 6, 'up', theme.chairVariant, { dx: TILE / 2, deskId: front, rank: ranks[i % ranks.length], side: 'S', order: 0.6 + i * 0.03 });
  }
  furn('trash_bin', ix + pairs * 2, 5, undefined, { order: 0.7 });

  // canto de reunião à direita (lugares extras para subagentes): mesinha com banquetas e recanto de poltronas
  const cx = w - 7;
  furn('cafe_table', cx, 4, undefined, { order: 0.45 });
  chair('stool', 'stool', cx - 1, 4, 'right');
  chair('stool', 'stool', cx + 1, 4, 'left');
  b.rug(cx - 1.4, 5.7, 4.8, 3.6, theme.carpet2, seed + 2);
  furn('coffee_table', cx - 1, 7, undefined, { order: 0.45 });
  chair('nook', 'armchair', cx - 2, 7, 'right');
  chair('nook', 'armchair', cx + 1, 7, 'left');
  chair('nook', 'beanbag', cx + 3, 6, 'down', pick(BEANBAGS));

  // apoio: estante e plantas junto à parede norte, sem cobrir quadro, janela ou relógio
  shelf(ix + pairs * 2 + 1);
  furn('plant_tall', w - 2, 2, pick(PLANTS_TALL), { order: 0.2 });
  furn('plant_small', block ? 3 : 1, 7, pick(PLANTS_SMALL), { order: 0.22 });
  furn('floor_lamp', w - 2, 4, undefined, { order: 0.3 });
  furn('filing_cabinet', w - 2, 6, undefined, { order: 0.32 });
  b.spot('stand', block ? 3 : 2, 8, 'up', { dy: -2 });
  b.spot('stand', cx + 3, 3, 'down');
  b.spot('talk', ix + 1, 7, 'right', { group: `talk:${id}`, dx: -1 });
  b.spot('talk', ix + 2, 7, 'left', { group: `talk:${id}`, dx: 1 });
  return b.build();
}

// ------------------------------------------------------------------ térreo e escadas

const BATH_THEME = { carpet: '#6fa3b8', carpet2: '#9cc3cf', chairVariant: 'black', deskVariant: 'wood' } as RoomTheme;

function groundPlan(x: number, w: number, doors: Plan['doors']): Plan {
  return { rect: { x, y: floorTop(0), w, h: FLOOR_H }, doors, outside: true };
}

const HALL0: Plan = groundPlan(0, HALL_W, [{ side: 'n', at: STAIR_X }, { side: 'e', at: LANE }, { side: 's', at: STAIR_X, outside: true }]);
const COPA: Plan = groundPlan(HALL_W, 18, [{ side: 'w', at: LANE }, { side: 'e', at: LANE }]);
const LOUNGE: Plan = groundPlan(HALL_W + 18, 24, [{ side: 'w', at: LANE }, { side: 'e', at: LANE }]);
const BATH: Plan = groundPlan(HALL_W + 18 + 24, 10, [{ side: 'w', at: LANE }]);

/** Porta da frente (coluna do vão, em tiles) e linha da parede sul do térreo. */
export const TOWER_FRONT_DOOR = { x: STAIR_X, y: TOWER_H - 1 };

/** Hall (térreo: recepção com a porta da frente, a escada e o ponto de chegada; andares: só a escada). */
function layoutHall(floor: number): AreaLayout {
  const ground = floor === 0;
  const top = floor === TOWER_FLOORS - 1;
  const plan: Plan = ground ? HALL0 : { rect: { x: 0, y: floorTop(floor), w: HALL_W, h: FLOOR_H }, doors: [...(top ? [] : [{ side: 'n' as const, at: STAIR_X }]), { side: 's', at: STAIR_X }, { side: 'e', at: LANE }] };
  const id = ground ? TOWER_HALL_ID : `torre:escada:${floor}`;
  const kind: AreaKind = 'reception';
  const b = shell(id, kind, plan, LOOK.hall, 600 + floor);
  const k = kit(b, BATH_THEME);
  if (ground) {
    k.lightSwitch(1.5, 1);
    k.sign(9);
    k.wallItem('mirror', 3.5, undefined, 0.5);
    b.furn('plant_tall', 3, 2, 'ficus', { order: 0.21 });
    b.furn('plant_small', 8, 2, 'flower', { order: 0.2 });
    b.furn('plant_tall', 10, 2, 'palm', { order: 0.22 });
    b.rug(STAIR_X - 0.4, 9.05, 2.8, 0.9, '#8a5a3c', 602);
    // porta da frente na parede sul (o vão é da parede; o batente por cima) e o ponto de chegada logo dentro dela
    b.wall('door_frame', STAIR_X + 1, undefined, { ly: FLOOR_H, on: 'south', order: 0.05 });
    b.spot('elevator', STAIR_X, FLOOR_H - 2, 'up', { x: b.px(STAIR_X + 1), y: b.py(FLOOR_H - 2) + 2, group: 'elevator:0' });
    const bench = b.furn('bench', 8, 4, undefined, { order: 0.5 });
    for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 8 + i, 4, 'down', undefined, { noFurniture: true, furnitureId: bench });
    b.spot('talk', 9, 6, 'right', { group: 'talk:hall', dx: -1 });
    b.spot('talk', 10, 6, 'left', { group: 'talk:hall', dx: 1 });
  } else {
    k.windowAt(9, 8);
    k.wallItem('painting', 3, undefined, 0.5);
    b.furn('plant_tall', 1, 2, floor % 2 ? 'monstera' : 'ficus', { order: 0.2 });
    b.furn('floor_lamp', 10, 3, undefined, { order: 0.3 });
    b.rug(STAIR_X - 0.4, 9.05, 2.8, 0.9, '#7c6a58', 603 + floor);
    b.spot('talk', 9, 6, 'right', { group: `talk:escada:${floor}`, dx: -1 });
    b.spot('talk', 10, 6, 'left', { group: `talk:escada:${floor}`, dx: 1 });
  }
  if (!top) b.furn('stairs', STAIR_X, 2, undefined, { order: 0.1 });
  const a = b.build();
  a.shade = undefined;
  return a;
}

/** Banheiros do térreo (a porta é na parede oeste, na linha das portas). */
function layoutBath(): AreaLayout {
  const b = shell('core:banheiros', 'restroom', BATH, LOOK.bath, 501);
  const k = kit(b, BATH_THEME);
  for (let i = 0; i < 2; i++) {
    k.wallItem('mirror', 2.5 + i, undefined, 0.3);
    b.furn('sink', 2 + i, 2, undefined, { order: 0.35 });
    b.spot('sink', 2 + i, 3, 'up', { dy: -3 });
  }
  b.rug(1.5, 3.15, 3, 0.85, '#6fa3b8', 502);
  k.wallItem('clock', 5.5, undefined, 0.5);
  const stall = b.furn('toilet_stall', 6, 2, undefined, { order: 0.3 });
  b.spot('stall', 6, 4, 'up', { furnitureId: stall, x: b.px(7), y: b.py(4) - 3, sortY: b.py(4) - 0.5 });
  b.furn('plant_small', 1, 2, 'fern', { order: 0.2 });
  b.furn('trash_bin', 8, 6, undefined, { order: 0.3 });
  b.furn('plant_tall', 8, 4, 'ficus', { order: 0.21 });
  const a = b.build();
  a.shade = undefined;
  return a;
}

/** Sala vaga (ninguém no endereço): paredes e piso nus, uma janela e uma planta. */
function layoutVacant(slot: number): AreaLayout {
  const { plan } = towerSlot(slot);
  const b = shell(`torre:vaga:${slot}`, 'corridor', plan, { floor: 'concrete', wall: { base: '#dedbd4', trim: '#9a968c', pattern: 'plain' } }, 700 + slot);
  const k = kit(b, BATH_THEME);
  k.windowAt(plan.rect.w / 2 + 1, plan.rect.w / 2);
  b.furn('plant_small', 1, 2, PLANTS_SMALL[slot % PLANTS_SMALL.length], { order: 0.2 });
  b.furn('trash_bin', plan.rect.w - 2, 2, undefined, { order: 0.3 });
  const a = b.build();
  a.shade = undefined;
  return a;
}

let coreCache: AreaLayout[] | null = null;

/** Térreo (hall, copa, lounge, banheiros) e os halls com escada dos andares de cima: sempre os mesmos. */
export function towerFixedAreas(): AreaLayout[] {
  if (coreCache) return coreCache;
  const copa = layoutHouseRoom('core:copa', 'kitchen', BATH_THEME, 301, COPA)!;
  copa.kind = 'cafe';
  const lounge = layoutHouseRoom('core:lounge', 'living', BATH_THEME, 401, LOUNGE)!;
  lounge.kind = 'lounge';
  const halls: AreaLayout[] = [];
  for (let f = 0; f < TOWER_FLOORS; f++) halls.push(layoutHall(f));
  return (coreCache = [...halls, copa, lounge, layoutBath()]);
}

/** Salas vagas das vagas sem sala de projeto (a vaga é identificada pelo retângulo da sala presente). */
export function towerVacantAreas(rooms: readonly AreaLayout[]): AreaLayout[] {
  const used = new Set(rooms.map((r) => `${r.rect.x},${r.rect.y}`));
  const out: AreaLayout[] = [];
  for (let s = 0; s < TOWER_SLOTS; s++) {
    const r = towerSlot(s).plan.rect;
    if (!used.has(`${r.x},${r.y}`)) out.push(layoutVacant(s));
  }
  return out;
}

/** O prédio não tem corredor: uma área vazia ocupa o lugar dele em BuildingLayout. */
export function towerCorridor(): AreaLayout {
  return { id: 'torre:sem-corredor', kind: 'corridor', rect: { x: 0, y: 0, w: 0, h: 0 }, floors: [], rugs: [], walls: [], wallItems: [], furniture: [], spots: [], walkable: [] };
}

// ------------------------------------------------------------------ lote

/** Terreno do prédio: grama, cerca viva com portão, caminho de pedra, calçada e rua na frente. */
export function layoutTowerExterior(): ExteriorLayout {
  const w = TOWER_W;
  const bounds: TileRect = { x: -EXT_WEST, y: -EXT_NORTH, w: w + EXT_WEST + EXT_EAST, h: TOWER_H + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0x70de);
  const south = TOWER_H;
  const seed = () => Math.floor(rng() * 1e9);

  floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 31 });
  const sidewalkY = south + 7;
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(sidewalkY), w: px(bounds.w), h: px(2), seed: 32 });
  floors.push({ kind: 'street', x: px(bounds.x), y: px(sidewalkY + 2), w: px(bounds.w), h: px(5), seed: 33 });
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(sidewalkY + 7), w: px(bounds.w), h: px(2), seed: 34 });
  // caminho de pedra da porta da frente até o portão
  floors.push({ kind: 'sidewalk', x: px(TOWER_FRONT_DOOR.x), y: px(south), w: px(2), h: px(sidewalkY - south), seed: 35 });

  // cerca viva na frente do terreno, com o portão no caminho
  for (let x = -2; x < w + 2; x += 2) {
    if (x >= TOWER_FRONT_DOOR.x - 1 && x <= TOWER_FRONT_DOOR.x + 2) continue;
    props.push({ kind: (x / 2) % 4 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(sidewalkY - 1) + 10, seed: x * 7 + 3 });
  }
  // canteiros junto à fachada e árvores do jardim da frente
  for (let x = 1; x < w; x += 3) {
    if (x >= TOWER_FRONT_DOOR.x - 2 && x <= TOWER_FRONT_DOOR.x + 3) continue;
    props.push({ kind: rng() < 0.5 ? 'flowers' : 'bush', x: px(x) + 8, y: px(south + 1) + 6, seed: seed() });
  }
  for (const [x, y] of [[14, 3], [24, 4], [40, 3], [52, 4], [60, 3]] as const) props.push({ kind: 'tree', x: px(x), y: px(south + y), seed: seed() });
  props.push({ kind: 'bench', x: px(12), y: px(south + 2) + 6, seed: 8 });
  props.push({ kind: 'parasol', x: px(46), y: px(south + 3) + 8, seed: 7 });
  for (let x = bounds.x + 6; x < bounds.x + bounds.w; x += 12) props.push({ kind: 'lamp', x: px(x), y: px(sidewalkY) + 6, seed: x });
  // árvores ao redor do terreno (fundos e laterais)
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += 4 + Math.floor(rng() * 3)) {
    props.push({ kind: rng() < 0.25 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(-3) - Math.floor(rng() * 20), seed: seed() });
    if (rng() < 0.6) props.push({ kind: 'bush', x: px(x + 2), y: px(-1) - 2, seed: seed() });
  }
  for (const side of [-1, 1]) {
    for (const band of [0, 7, 13]) {
      const baseX = side < 0 ? -6 - band : w + 4 + band;
      for (let y = 1; y < TOWER_H + 6; y += 3 + Math.floor(rng() * 3)) {
        props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(baseX + Math.floor(rng() * 5)), y: px(y + 1), seed: seed() });
      }
    }
  }
  for (let x = bounds.x + 3; x < bounds.x + bounds.w - 2; x += 7 + Math.floor(rng() * 5)) {
    props.push({ kind: rng() < 0.2 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 10), y: px(sidewalkY + 12) + Math.floor(rng() * 10), seed: seed() });
  }

  const streetY = px(sidewalkY + 2);
  const streetH = px(5);
  return {
    bounds,
    floors,
    props,
    lanes: [
      { y: streetY + Math.round(streetH * 0.36), dir: 1 },
      { y: streetY + Math.round(streetH * 0.86), dir: -1 },
    ],
    vlanes: [],
    vstreets: [],
    streetY,
    streetH,
  };
}

/** Constrói uma área vazia (usado por testes). */
export function emptyArea(id: string, rect: TileRect): AreaBuilder {
  return new AreaBuilder(id, 'room', rect);
}
