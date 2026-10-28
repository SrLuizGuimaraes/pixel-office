// Planta da casa (modo casa do mundo: SimMode.house) e as peças do prédio em andares (layout/tower.ts).
//
// No lugar do prédio (núcleo com elevadores, corredor de leste a oeste e salas de 16x12 dos dois lados), uma casa
// comum: cômodos de tamanhos diferentes encostados uns nos outros, portas entre eles, porta da frente no hall de
// entrada e quintal com caminho até a rua. Cabe na mesma caixa do prédio de HOUSE_COLS colunas (64x29 tiles), então
// a grade de caminhada, a câmera e a luz do dia continuam funcionando.
//
//   y  0 ┌─ Quarto ─┬Banh.┬ Escritório ┬ Home Office ┐   (fundos)
//   y 11 ├─ Sala de Estar ─┬─ Cozinha ─┬Bibl┬─ PC ──┤
//   y 22 ├ Varanda ┬ Hall ┬─ Oficina ─┘  jardim lateral
//   y 29 └─ quintal da frente, portão, calçada, rua ─┘
//
// Cada cômodo segue o padrão das salas: 2 linhas de face da parede norte, piso e 1 linha de parede sul; as paredes
// laterais são meia coluna. Portas: na parede sul de um e na face norte do de baixo (mesmas colunas), ou nas paredes
// laterais de dois vizinhos (mesmas linhas). A chegada é um "elevador" sem elevador: o ponto de aparecer fica na porta
// da frente do hall (sim/elevator.ts só controla a vez de cada um; o desenho do elevador fica só na recepção do prédio).
import { mulberry32 } from '../../../../shared/hash';
import type { Dir, FurnitureKind, RoomTheme, WallStyle } from '../../art/api';
import { BUILDING_H, COL_W, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, TILE } from '../constants';
import { AreaBuilder } from './builder';
import type { ExteriorLayout } from './exterior';
import type { HomeStyle } from './home';
import type { AreaKind, AreaLayout, ExteriorProp, FloorPatch, SpotKind, TileRect } from './types';

/** Largura da casa em colunas do prédio (64 tiles). */
export const HOUSE_COLS = 4;
export const HOUSE_HALL_ID = 'casa:hall';
export const HOUSE_BATH_ID = 'casa:banheiro';
export const HOUSE_CORRIDOR_ID = 'casa:sem-corredor';

export type Door = { side: 'n' | 's'; at: number; outside?: boolean } | { side: 'w' | 'e'; at: number };

export interface Plan {
  rect: TileRect;
  doors: Door[];
  /** Parede sul dá para o quintal. */
  outside?: boolean;
}

/** Cômodos da casa (as salas dela no snapshot, pelo estilo de RoomInfo.home). */
const ROOMS: Record<HomeStyle, Plan> = {
  bedroom: { rect: { x: 0, y: 0, w: 18, h: 11 }, doors: [{ side: 's', at: 6 }] },
  office: { rect: { x: 28, y: 0, w: 18, h: 11 }, doors: [{ side: 's', at: 6 }, { side: 'e', at: 4 }] },
  homeoffice: { rect: { x: 46, y: 0, w: 18, h: 11 }, doors: [{ side: 'w', at: 4 }] },
  living: { rect: { x: 0, y: 11, w: 24, h: 11 }, doors: [{ side: 'n', at: 6 }, { side: 'n', at: 20 }, { side: 'e', at: 5 }, { side: 's', at: 20 }] },
  kitchen: { rect: { x: 24, y: 11, w: 18, h: 11 }, doors: [{ side: 'w', at: 5 }, { side: 'n', at: 10 }, { side: 'e', at: 5 }, { side: 's', at: 12 }] },
  library: { rect: { x: 42, y: 11, w: 12, h: 11 }, doors: [{ side: 'w', at: 5 }, { side: 'e', at: 5 }], outside: true },
  pc: { rect: { x: 54, y: 11, w: 10, h: 11 }, doors: [{ side: 'w', at: 5 }], outside: true },
  porch: { rect: { x: 0, y: 22, w: 18, h: 7 }, doors: [{ side: 'e', at: 3 }], outside: true },
  workshop: { rect: { x: 30, y: 22, w: 16, h: 7 }, doors: [{ side: 'w', at: 3 }, { side: 'n', at: 6 }], outside: true },
};
/** Partes da casa que não são salas do snapshot: banheiro e hall de entrada (com a porta da frente). */
const BATH: Plan = { rect: { x: 18, y: 0, w: 10, h: 11 }, doors: [{ side: 's', at: 2 }] };
const HALL: Plan = { rect: { x: 18, y: 22, w: 12, h: 7 }, doors: [{ side: 'n', at: 2 }, { side: 'w', at: 3 }, { side: 'e', at: 3 }, { side: 's', at: 6, outside: true }], outside: true };
/** Porta da frente (tiles absolutos): coluna e linha da parede sul do hall. */
export const FRONT_DOOR = { x: HALL.rect.x + 6, y: HALL.rect.y + HALL.rect.h - 1 };

/** Piso e paredes de cada cômodo (tons de casa). */
export const LOOK: Record<HomeStyle | 'bath' | 'hall', { floor: FloorPatch['kind']; wall: WallStyle }> = {
  living: { floor: 'wood', wall: { base: '#efe3d0', trim: '#a5825e', pattern: 'wood_panel' } },
  office: { floor: 'wood', wall: { base: '#e4e8e1', trim: '#7e8f78', pattern: 'plain' } },
  homeoffice: { floor: 'carpet', wall: { base: '#e6e6ee', trim: '#7d7fa0', pattern: 'stripes' } },
  porch: { floor: 'wood', wall: { base: '#f1ead8', trim: '#9b8a62', pattern: 'brick' } },
  pc: { floor: 'carpet', wall: { base: '#2f3448', trim: '#5c6382', pattern: 'plain' } },
  kitchen: { floor: 'tile_check', wall: { base: '#f3f1ea', trim: '#a39b88', pattern: 'tiles' } },
  bedroom: { floor: 'wood', wall: { base: '#f2dfe4', trim: '#b4808f', pattern: 'stripes' } },
  workshop: { floor: 'concrete', wall: { base: '#d9d6cf', trim: '#7f7a70', pattern: 'brick' } },
  library: { floor: 'wood', wall: { base: '#e9dcc6', trim: '#8a6a45', pattern: 'wood_panel' } },
  bath: { floor: 'tile_white', wall: { base: '#dce8ee', trim: '#8fb0c0', pattern: 'tiles' } },
  hall: { floor: 'marble', wall: { base: '#e9e5dc', trim: '#a88e6c', pattern: 'wood_panel' } },
};

/** Paredes, portas e caminhabilidade de um cômodo (coordenadas locais). */
export function shell(id: string, kind: AreaKind, plan: Plan, look: { floor: FloorPatch['kind']; wall: WallStyle }, seed: number, tint?: string): AreaBuilder {
  const { w, h } = plan.rect;
  const b = new AreaBuilder(id, kind, plan.rect);
  const wall = look.wall;
  b.floor(look.floor, 0, 0, w, h, seed);
  if (tint) b.area.floorTint = tint;
  const at = (side: Door['side']) => plan.doors.filter((d) => d.side === side).map((d) => d.at);
  const north = at('n').map((lx) => ({ lx, w: 2 }));
  const south = at('s').map((lx) => ({ lx, w: 2 }));
  b.face(0.5, w - 1, wall, north);
  b.south(0.5, w - 1, h - 1, plan.outside ? { ...wall, exterior: true } : wall, south);
  for (const lx of at('n')) b.wall('door_frame', lx + 1, undefined, { order: 0.05 });
  // paredes laterais (meia coluna), com o vão das portas
  for (const [side, cx] of [['w', 0], ['e', w - 0.5]] as const) {
    let y = 0;
    for (const dy of at(side).sort((p, q) => p - q)) {
      if (dy > y) b.cap(cx, y, 0.5, dy - y, wall);
      y = dy + 2;
    }
    if (y < h) b.cap(cx, y, 0.5, h - y, wall);
  }
  // piso e os vãos das portas
  b.walk(1, 2, w - 2, h - 3);
  for (const d of plan.doors) {
    if (d.side === 'n') b.walk(d.at, 0, 2, 2);
    else if (d.side === 's' && !d.outside) b.walk(d.at, h - 1, 2, 1);
    else if (d.side === 'w') b.walk(0, d.at, 1, 2);
    else if (d.side === 'e') b.walk(w - 1, d.at, 1, 2);
  }
  const d0 = plan.doors[0];
  const r = plan.rect;
  b.area.door =
    d0.side === 'n' ? { x: r.x + d0.at, y: r.y, w: 2, h: 2 }
    : d0.side === 's' ? { x: r.x + d0.at, y: r.y + h - 1, w: 2, h: 1 }
    : d0.side === 'w' ? { x: r.x, y: r.y + d0.at, w: 1, h: 2 }
    : { x: r.x + w - 1, y: r.y + d0.at, w: 1, h: 2 };
  b.area.shade = { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
  return b;
}

/** Ajudantes de mobília sobre um AreaBuilder (as mesmas peças das salas e do núcleo do prédio). */
export function kit(b: AreaBuilder, theme: RoomTheme) {
  const furn = (kind: FurnitureKind, lx: number, ly: number, variant?: string, o: { dx?: number; order?: number; seat?: string } = {}) => b.furn(kind, lx, ly, variant, o);
  const wallItem = (kind: FurnitureKind, cx: number, variant?: string, order = 0.5) => b.wall(kind, cx, variant, { order });
  /** Assento; poltrona e cadeira de café usam a direção como variante (as outras peças, a cor ou nada). */
  const chair = (kind: SpotKind, fk: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string) =>
    b.seat(kind, fk, lx, ly, dir, variant ?? (fk === 'armchair' || fk === 'cafe_chair' ? dir : undefined), { order: 0.6 });
  const desk = (lx: number, ly: number, rank: number, variant = 'wood') => {
    const d = furn('desk', lx, ly, variant, { order: 0.4 + rank * 0.02, seat: `S${rank}` });
    b.seat('desk', 'office_chair', lx, ly + 1, 'up', theme.chairVariant, { dx: TILE / 2, deskId: d, rank, side: 'S', order: 0.6 + rank * 0.02 });
  };
  const sofa = (lx: number, ly: number, dir: 'up' | 'down') => {
    const s = furn('sofa', lx, ly, dir, { order: 0.5 });
    for (let i = 0; i < 3; i++) b.seat('sofa', 'sofa', lx + i, ly, dir, dir, { noFurniture: true, furnitureId: s });
  };
  const shelf = (lx: number) => {
    furn('bookshelf', lx, 2, undefined, { order: 0.25 });
    b.spot('shelf', lx, 3, 'up', { dx: 8, dy: -2 });
  };
  const windowAt = (cx: number, lx: number) => {
    wallItem('window', cx, undefined, 0.4);
    b.spot('window', lx, 2, 'up', { dx: 12, dy: 1 });
  };
  const sign = (cx: number) => (b.area.signId = wallItem('sign', cx, undefined, 0.95));
  const lightSwitch = (cx: number, lx: number) => {
    wallItem('light_switch', cx, 'on', 0.8);
    b.spot('switch', lx, 2, 'up', { dy: -3 });
  };
  return { furn, wallItem, chair, desk, sofa, shelf, windowAt, sign, lightSwitch };
}

/** Um cômodo da casa na planta, com a mobília (undefined = estilo sem lugar na casa). */
export function layoutHouseRoom(id: string, style: string | undefined, theme: RoomTheme, seed: number, planOverride?: Plan): AreaLayout | undefined {
  const plan = planOverride ?? (style ? ROOMS[style as HomeStyle] : undefined);
  if (!plan || !style || !(style in LOOK)) return undefined;
  const look = LOOK[style as HomeStyle];
  const b = shell(id, 'room', plan, look, seed, look.floor === 'carpet' ? theme.carpet : undefined);
  const k = kit(b, theme);
  const { furn, wallItem, chair, desk, sofa, shelf, windowAt, sign, lightSwitch } = k;
  switch (style as HomeStyle) {
    case 'living': {
      // sala grande: TV com sofá e poltronas no meio, estante, puffs; portas para quarto, banheiro, cozinha e hall
      wallItem('painting', 3.5, undefined, 0.5);
      sign(10);
      wallItem('tv', 13, undefined, 0.4);
      windowAt(17, 16);
      lightSwitch(5.5, 5);
      shelf(1);
      furn('plant_tall', 4, 2, 'monstera', { order: 0.2 });
      furn('floor_lamp', 18, 2, undefined, { order: 0.21 });
      b.rug(9.5, 3.3, 7, 4.2, theme.carpet, seed + 2);
      furn('coffee_table', 12, 4, undefined, { dx: TILE / 2, order: 0.45 });
      b.block(14, 4, 1, 1);
      chair('nook', 'armchair', 11, 4, 'right');
      chair('nook', 'armchair', 15, 4, 'left');
      sofa(12, 6, 'up');
      b.rug(1.6, 7.4, 4.2, 2.2, '#d9c3a0', seed + 3);
      chair('beanbag', 'beanbag', 3, 8, 'up', 'yellow');
      chair('beanbag', 'beanbag', 4, 8, 'up', 'red');
      furn('plant_tall', 1, 9, 'palm', { order: 0.22 });
      furn('plant_small', 17, 9, 'flower', { order: 0.23 });
      b.spot('stand', 9, 7, 'down');
      b.spot('talk', 7, 5, 'right', { group: 'talk:sala', dx: -1 });
      b.spot('talk', 8, 5, 'left', { group: 'talk:sala', dx: 1 });
      break;
    }
    case 'kitchen': {
      // bancada na parede norte, mesa de jantar e mesinha
      furn('fridge', 1, 2, undefined, { order: 0.2 });
      b.spot('fridge', 1, 3, 'up', { dy: -3 });
      furn('counter', 2, 2, 'drawers', { order: 0.22 });
      furn('counter_sink', 3, 2, undefined, { order: 0.24 });
      b.spot('sink', 3, 3, 'up', { dy: -3 });
      const m = furn('coffee_machine', 4, 2, undefined, { order: 0.26 });
      b.spot('coffee', 4, 3, 'up', { dy: -3, furnitureId: m });
      furn('microwave', 5, 2, undefined, { order: 0.28 });
      furn('counter', 6, 2, 'plain', { order: 0.3 });
      furn('counter', 7, 2, 'drawers', { order: 0.32 });
      wallItem('shelf_wall', 3, undefined, 0.4);
      wallItem('poster', 6, 'coffee', 0.45);
      lightSwitch(8.5, 8);
      sign(14);
      b.rug(5.4, 4.2, 4.2, 3.6, '#c98f62', seed + 2);
      furn('meeting_table', 6, 5, undefined, { order: 0.45 });
      for (let i = 0; i < 3; i++) {
        chair('cafe_seat', 'cafe_chair', 6 + i, 4, 'down');
        chair(i === 1 ? 'stool' : 'cafe_seat', 'cafe_chair', 6 + i, 7, 'up');
      }
      furn('cafe_table', 13, 4, undefined, { order: 0.46 });
      chair('cafe_seat', 'cafe_chair', 12, 4, 'right');
      chair('cafe_seat', 'cafe_chair', 14, 4, 'left');
      furn('plant_tall', 16, 2, 'monstera', { order: 0.2 });
      furn('plant_small', 15, 9, 'flower', { order: 0.21 });
      furn('trash_bin', 1, 9, undefined, { order: 0.3 });
      b.spot('stand', 10, 7, 'up');
      break;
    }
    case 'bedroom': {
      // cama (sofá-cama de frente para a câmera), quadro em cima, espelho, cantinho de leitura e estante
      wallItem('painting', 3.5, undefined, 0.5);
      lightSwitch(7, 7);
      sign(9.5);
      wallItem('mirror', 12, undefined, 0.5);
      windowAt(15, 14);
      b.rug(1, 2.6, 5, 3.4, '#e8b4c2', seed + 2);
      sofa(2, 3, 'down');
      furn('floor_lamp', 1, 3, undefined, { order: 0.3 });
      furn('plant_small', 5, 3, 'flower', { order: 0.31 });
      chair('beanbag', 'beanbag', 2, 8, 'up', 'red');
      furn('filing_cabinet', 1, 9, undefined, { order: 0.3 });
      chair('nook', 'armchair', 11, 6, 'right');
      furn('coffee_table', 12, 6, undefined, { order: 0.45 });
      furn('plant_tall', 16, 6, 'ficus', { order: 0.2 });
      furn('bookshelf', 14, 9, undefined, { order: 0.25 });
      b.spot('stand', 9, 5, 'up');
      break;
    }
    case 'office': {
      // escritório: duas escrivaninhas, quadro, estante e poltrona de leitura; porta para o home office
      wallItem('whiteboard', 3, undefined, 0.6);
      b.spot('whiteboard', 2, 2, 'up', { dx: 8, dy: 2 });
      lightSwitch(7.5, 7);
      wallItem('clock', 9.5, undefined, 0.7);
      sign(12.5);
      desk(1, 4, 0);
      desk(3, 4, 1, 'white');
      furn('plant_small', 5, 4, 'succulent', { order: 0.46 });
      shelf(10);
      furn('floor_lamp', 11, 7, undefined, { order: 0.32 });
      chair('nook', 'armchair', 12, 7, 'right');
      furn('coffee_table', 13, 7, undefined, { order: 0.45 });
      furn('filing_cabinet', 1, 9, undefined, { order: 0.3 });
      furn('plant_tall', 16, 9, 'ficus', { order: 0.2 });
      b.spot('stand', 9, 5, 'up');
      break;
    }
    case 'homeoffice': {
      // home office da Weethub: ilha de quatro mesas, arquivos, impressora e mesinha de reunião
      lightSwitch(2, 2);
      wallItem('whiteboard', 4.5, undefined, 0.6);
      sign(9);
      wallItem('clock', 15, undefined, 0.7);
      b.rug(2.6, 3.6, 5, 4.8, theme.carpet2, seed + 2);
      for (let i = 0; i < 2; i++) {
        const lx = 3 + i * 2;
        const back = furn('desk_back', lx, 5, theme.deskVariant, { order: 0.35 + i * 0.05, seat: `N${i}` });
        const front = furn('desk', lx, 6, theme.deskVariant, { order: 0.4 + i * 0.05, seat: `S${i}` });
        b.seat('desk', 'office_chair_front', lx, 4, 'down', theme.chairVariant, { dx: TILE / 2, deskId: back, rank: i * 2 + 1, side: 'N', order: 0.55 + i * 0.03 });
        b.seat('desk', 'office_chair', lx, 7, 'up', theme.chairVariant, { dx: TILE / 2, deskId: front, rank: i * 2, side: 'S', order: 0.6 + i * 0.03 });
      }
      furn('binder_shelf', 11, 2, undefined, { order: 0.3 });
      furn('binder_shelf', 12, 2, undefined, { order: 0.31 });
      furn('printer', 13, 2, undefined, { order: 0.32 });
      furn('plant_tall', 16, 2, 'bonsai', { order: 0.2 });
      furn('cafe_table', 13, 6, undefined, { order: 0.45 });
      chair('stool', 'stool', 12, 6, 'right');
      chair('stool', 'stool', 14, 6, 'left');
      furn('plant_small', 1, 9, 'fern', { order: 0.21 });
      furn('trash_bin', 9, 9, undefined, { order: 0.3 });
      furn('plant_tall', 16, 9, 'monstera', { order: 0.22 });
      b.spot('stand', 9, 4, 'up');
      break;
    }
    case 'library': {
      // biblioteca: estantes na parede norte e cantinho de leitura
      sign(3);
      lightSwitch(6, 5);
      for (const lx of [1, 3, 7]) shelf(lx);
      furn('bookshelf', 9, 2, undefined, { order: 0.26 });
      b.rug(2.4, 7.3, 5.2, 2.4, theme.carpet, seed + 2);
      chair('nook', 'armchair', 3, 8, 'right');
      furn('coffee_table', 4, 8, undefined, { order: 0.45 });
      chair('nook', 'armchair', 6, 8, 'left');
      furn('floor_lamp', 8, 8, undefined, { order: 0.3 });
      furn('plant_small', 1, 9, 'fern', { order: 0.21 });
      furn('plant_tall', 10, 9, 'palm', { order: 0.22 });
      b.spot('stand', 5, 5, 'up');
      break;
    }
    case 'pc': {
      // cantinho do PC: duas mesas, fliperama e puffs
      lightSwitch(1.5, 1);
      wallItem('poster', 2.5, 'rocket', 0.5);
      sign(5);
      wallItem('poster', 8.5, 'bug', 0.5);
      desk(2, 3, 0, 'dark');
      desk(4, 3, 1, 'dark');
      furn('arcade', 7, 2, undefined, { order: 0.3 });
      b.spot('arcade', 7, 3, 'up', { dy: -3 });
      b.rug(5.4, 7.4, 3.2, 2.2, theme.carpet2, seed + 2);
      chair('beanbag', 'beanbag', 6, 8, 'up', 'blue');
      chair('nook', 'beanbag', 7, 8, 'up', 'red');
      furn('floor_lamp', 8, 6, undefined, { order: 0.3 });
      furn('plant_tall', 1, 9, 'bonsai', { order: 0.2 });
      furn('trash_bin', 4, 9, undefined, { order: 0.3 });
      b.spot('stand', 5, 6, 'up');
      break;
    }
    case 'porch': {
      // varanda: plantas, banco, mesinha de café e a TV com a câmera da casa
      windowAt(3.5, 3);
      lightSwitch(6, 6);
      wallItem('tv', 9, undefined, 0.4);
      b.spot('stand', 8, 3, 'up', { dy: -1 });
      sign(14);
      furn('plant_tall', 1, 2, 'palm', { order: 0.2 });
      furn('plant_small', 5, 2, 'flower', { order: 0.21 });
      furn('plant_small', 11, 2, 'fern', { order: 0.22 });
      furn('plant_tall', 16, 2, 'monstera', { order: 0.23 });
      const bench = furn('bench', 2, 4, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 2 + i, 4, 'down', undefined, { noFurniture: true, furnitureId: bench });
      chair('beanbag', 'beanbag', 6, 5, 'up', 'green');
      b.rug(11.4, 2.8, 4.2, 2.4, '#c9b48a', seed + 2);
      furn('cafe_table', 13, 3, undefined, { order: 0.45 });
      chair('nook', 'cafe_chair', 12, 3, 'right');
      chair('cafe_seat', 'cafe_chair', 14, 3, 'left');
      furn('plant_small', 1, 5, 'succulent', { order: 0.24 });
      furn('plant_small', 15, 5, 'flower', { order: 0.25 });
      break;
    }
    case 'workshop': {
      // oficina: arquivos, prateleiras e bancada
      lightSwitch(5, 5);
      wallItem('shelf_wall', 3, undefined, 0.4);
      wallItem('shelf_wall', 10.5, undefined, 0.41);
      sign(14);
      furn('binder_shelf', 2, 2, undefined, { order: 0.3 });
      furn('binder_shelf', 3, 2, undefined, { order: 0.31 });
      furn('filing_cabinet', 4, 2, undefined, { order: 0.32 });
      furn('printer', 9, 2, undefined, { order: 0.33 });
      furn('binder_shelf', 10, 2, undefined, { order: 0.34 });
      furn('binder_shelf', 11, 2, undefined, { order: 0.35 });
      desk(12, 3, 0, 'dark');
      b.spot('stand', 5, 4, 'up');
      b.spot('stand', 8, 4, 'up');
      furn('plant_small', 1, 5, 'succulent', { order: 0.2 });
      furn('trash_bin', 10, 5, undefined, { order: 0.3 });
      furn('floor_lamp', 14, 5, undefined, { order: 0.3 });
      break;
    }
  }
  return b.build();
}

/** Banheiro e hall de entrada (com a porta da frente e o ponto de chegada). */
export function houseCoreAreas(): AreaLayout[] {
  const theme = { carpet: '#6fa3b8', carpet2: '#9cc3cf', chairVariant: 'black', deskVariant: 'wood' } as RoomTheme;

  const bath = shell(HOUSE_BATH_ID, 'restroom', BATH, LOOK.bath, 501);
  const bk = kit(bath, theme);
  bk.wallItem('mirror', 2.5, undefined, 0.3);
  bath.furn('sink', 2, 2, undefined, { order: 0.35 });
  bath.spot('sink', 2, 3, 'up', { dy: -3 });
  bath.rug(1.5, 3.15, 2, 0.85, '#6fa3b8', 502);
  bk.wallItem('clock', 4.5, undefined, 0.5);
  const stall = bath.furn('toilet_stall', 6, 2, undefined, { order: 0.3 });
  bath.spot('stall', 6, 4, 'up', { furnitureId: stall, x: bath.px(7), y: bath.py(4) - 3, sortY: bath.py(4) - 0.5 });
  bath.furn('plant_small', 1, 6, 'fern', { order: 0.2 });
  bath.furn('trash_bin', 8, 9, undefined, { order: 0.3 });
  bath.furn('plant_tall', 8, 6, 'ficus', { order: 0.21 });

  const hall = shell(HOUSE_HALL_ID, 'reception', HALL, LOOK.hall, 601);
  const hk = kit(hall, theme);
  hk.lightSwitch(1.5, 1);
  hk.sign(6);
  hk.wallItem('mirror', 8.5, undefined, 0.5);
  hall.furn('plant_small', 5, 2, 'flower', { order: 0.2 });
  hall.furn('plant_tall', 10, 2, 'ficus', { order: 0.21 });
  hall.rug(5.6, 4.4, 2.8, 1.3, '#8a5a3c', 602);
  // porta da frente na parede sul (o vão é desenhado pela parede; o batente por cima)
  hall.wall('door_frame', 7, undefined, { ly: HALL.rect.h, on: 'south', order: 0.05 });
  hall.spot('elevator', 6, 5, 'up', { x: hall.px(7), y: hall.py(5) + 2, group: 'elevator:0' });
  hall.spot('talk', 7, 3, 'right', { group: 'talk:hall', dx: -1 });
  hall.spot('talk', 8, 3, 'left', { group: 'talk:hall', dx: 1 });
  const hallArea = hall.build();
  hallArea.shade = undefined;
  return [bath.build(), hallArea];
}

/** A casa não tem corredor: uma área vazia ocupa o lugar dele em BuildingLayout. */
export function houseCorridor(): AreaLayout {
  return { id: HOUSE_CORRIDOR_ID, kind: 'corridor', rect: { x: 0, y: 0, w: 0, h: 0 }, floors: [], rugs: [], walls: [], wallItems: [], furniture: [], spots: [], walkable: [] };
}

/** Quintal da casa: grama, cerca viva com portão, caminho de pedra até a calçada, jardim lateral e a rua. */
export function layoutHouseExterior(cols: number): ExteriorLayout {
  const w = cols * COL_W;
  const bounds: TileRect = { x: -EXT_WEST, y: -EXT_NORTH, w: w + EXT_WEST + EXT_EAST, h: BUILDING_H + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xca5a);
  const south = BUILDING_H;
  const seed = () => Math.floor(rng() * 1e9);

  floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 21 });
  // calçada e rua na frente da casa
  const sidewalkY = south + 8;
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(sidewalkY), w: px(bounds.w), h: px(2), seed: 22 });
  floors.push({ kind: 'street', x: px(bounds.x), y: px(sidewalkY + 2), w: px(bounds.w), h: px(5), seed: 23 });
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(sidewalkY + 7), w: px(bounds.w), h: px(2), seed: 24 });
  // caminho de pedra da porta da frente até o portão
  floors.push({ kind: 'sidewalk', x: px(FRONT_DOOR.x), y: px(south), w: px(2), h: px(sidewalkY - south), seed: 25 });
  // pátio do jardim lateral (no recorte da planta, à direita do hall/oficina)
  floors.push({ kind: 'sidewalk', x: px(50), y: px(24), w: px(8), h: px(4), seed: 26 });

  // cerca viva na frente do terreno, com o portão no caminho
  for (let x = -2; x < w + 2; x += 2) {
    if (x >= FRONT_DOOR.x - 1 && x <= FRONT_DOOR.x + 2) continue;
    props.push({ kind: (x / 2) % 4 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(sidewalkY - 1) + 10, seed: x * 7 + 3 });
  }
  // canteiros junto à fachada e no jardim lateral
  for (let x = 1; x < 46; x += 3) {
    if (x >= FRONT_DOOR.x - 2 && x <= FRONT_DOOR.x + 3) continue;
    props.push({ kind: rng() < 0.5 ? 'flowers' : 'bush', x: px(x) + 8, y: px(south + 1) + 6, seed: seed() });
  }
  props.push({ kind: 'parasol', x: px(54), y: px(26) + 8, seed: 7 });
  props.push({ kind: 'bench', x: px(51), y: px(27) + 6, seed: 8 });
  props.push({ kind: 'tree', x: px(60), y: px(25), seed: 9 });
  props.push({ kind: 'flowers', x: px(48), y: px(23) + 6, seed: 10 });
  props.push({ kind: 'bush', x: px(62), y: px(28), seed: 11 });
  // árvores do quintal da frente e postes da calçada
  for (const [x, y] of [[4, 3], [12, 5], [36, 4], [44, 2], [58, 5]] as const) props.push({ kind: 'tree', x: px(x), y: px(south + y), seed: seed() });
  for (let x = bounds.x + 6; x < bounds.x + bounds.w; x += 12) props.push({ kind: 'lamp', x: px(x), y: px(sidewalkY) + 6, seed: x });
  // árvores ao redor do terreno (fundos e laterais)
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += 4 + Math.floor(rng() * 3)) {
    props.push({ kind: rng() < 0.25 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(-3) - Math.floor(rng() * 20), seed: seed() });
    if (rng() < 0.6) props.push({ kind: 'bush', x: px(x + 2), y: px(-1) - 2, seed: seed() });
  }
  for (const side of [-1, 1]) {
    for (const band of [0, 7, 13]) {
      const baseX = side < 0 ? -6 - band : w + 4 + band;
      for (let y = 1; y < BUILDING_H + 6; y += 3 + Math.floor(rng() * 3)) {
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
