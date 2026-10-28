// Cômodos da casa (RoomInfo.home): no lugar da sala de projeto padrão, cada sala dela
// vira um cômodo (sala de estar, cozinha, quarto…), com a mobília que o Pixel Office já desenha. Mesmo tamanho e mesmas
// paredes/porta da sala de projeto (16x12; ver room.ts).
//
// Regra para nada ficar inalcançável: a faixa do meio (colunas 6–9, onde fica a porta nas salas dos dois lados) fica
// livre de móveis; a mobília vai à esquerda (colunas 1–5) e à direita (colunas 10–14).
//
// Para trabalhar, a personagem precisa de um lugar 'desk', 'stool', 'nook' ou 'stand' na sala (sim/behavior.ts); os
// lugares de lazer ('sofa', 'coffee', 'window', 'shelf'…) entram nos passeios dela quando está ociosa.
import { TILE, DOOR_W, DOOR_X } from '../constants';
import type { Dir, FurnitureKind, RoomTheme, WallStyle } from '../../art/api';
import { AreaBuilder } from './builder';
import { slotRect, slotSide } from './geometry';
import type { RoomInput } from './room';
import type { AreaLayout, FloorPatch } from './types';

export const HOME_STYLES = ['living', 'office', 'homeoffice', 'porch', 'pc', 'kitchen', 'bedroom', 'workshop', 'library'] as const;
export type HomeStyle = (typeof HOME_STYLES)[number];

export function isHomeStyle(v: unknown): v is HomeStyle {
  return typeof v === 'string' && (HOME_STYLES as readonly string[]).includes(v);
}

/** Piso e paredes de cada cômodo (tons quentes de casa; o tema da sala só dá o tom dos tapetes). */
const LOOK: Record<HomeStyle, { floor: FloorPatch['kind']; wall: WallStyle }> = {
  living: { floor: 'wood', wall: { base: '#efe3d0', trim: '#a5825e', pattern: 'wood_panel' } },
  office: { floor: 'wood', wall: { base: '#e4e8e1', trim: '#7e8f78', pattern: 'plain' } },
  homeoffice: { floor: 'carpet', wall: { base: '#e6e6ee', trim: '#7d7fa0', pattern: 'stripes' } },
  porch: { floor: 'wood', wall: { base: '#f1ead8', trim: '#9b8a62', pattern: 'brick' } },
  pc: { floor: 'carpet', wall: { base: '#2f3448', trim: '#5c6382', pattern: 'plain' } },
  kitchen: { floor: 'tile_check', wall: { base: '#f3f1ea', trim: '#a39b88', pattern: 'tiles' } },
  bedroom: { floor: 'wood', wall: { base: '#f2dfe4', trim: '#b4808f', pattern: 'stripes' } },
  workshop: { floor: 'concrete', wall: { base: '#d9d6cf', trim: '#7f7a70', pattern: 'brick' } },
  library: { floor: 'wood', wall: { base: '#e9dcc6', trim: '#8a6a45', pattern: 'wood_panel' } },
};

export function layoutHomeRoom(room: RoomInput, theme: RoomTheme, style: HomeStyle): AreaLayout {
  const rect = slotRect(room.slot);
  const side = slotSide(room.slot);
  const north = side === 'north';
  const b = new AreaBuilder(room.id, 'room', rect);
  const area = b.area;
  area.side = side;
  const look = LOOK[style];
  const wall = look.wall;
  const door = { lx: DOOR_X, w: DOOR_W };

  // ---- piso, paredes e porta (iguais à sala de projeto)
  b.floor(look.floor, 0, 0, 16, 12, room.seed);
  if (look.floor === 'carpet') area.floorTint = theme.carpet;
  b.rug(DOOR_X - 0.25, north ? 9.5 : 2, DOOR_W + 0.5, 1.25, theme.carpet2, room.seed + 1);
  if (north) {
    b.face(0.5, 15, wall);
    b.south(0.5, 15, 11, wall, [door]);
  } else {
    b.face(0.5, 15, wall, [door]);
    b.south(0.5, 15, 11, { ...wall, exterior: true });
    b.wall('door_frame', DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
  }
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);
  b.walk(1, 2, 14, 9);
  area.door = north ? { x: rect.x + DOOR_X, y: rect.y + 11, w: DOOR_W, h: 1 } : { x: rect.x + DOOR_X, y: rect.y, w: DOOR_W, h: 2 };
  b.walk(area.door.x - rect.x, area.door.y - rect.y, area.door.w, area.door.h);

  // placa com o nome do cômodo e interruptor ao lado da porta
  area.signId = b.wall('sign', north ? 8 : 10.5, undefined, { order: 0.95 });
  if (north) {
    b.wall('light_switch', DOOR_X - 0.5, 'on', { ly: 12, on: 'south', order: 0.8 });
    b.spot('switch', DOOR_X - 1, 10, 'down', { dy: -1 });
  } else {
    b.wall('light_switch', DOOR_X - 0.5, 'on', { order: 0.8 });
    b.spot('switch', DOOR_X - 1, 2, 'up', { dy: -3 });
  }

  const furn = (kind: FurnitureKind, lx: number, ly: number, variant?: string, o: { dx?: number; order?: number; seat?: string } = {}) => b.furn(kind, lx, ly, variant, o);
  const wallItem = (kind: FurnitureKind, cx: number, variant?: string, order = 0.5) => b.wall(kind, cx, variant, { order });
  /** Assento; poltrona e cadeira de café usam a direção como variante (as outras peças, a cor ou nada). */
  const chair = (kind: 'nook' | 'stool' | 'armchair' | 'cafe_seat' | 'beanbag', fk: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string, order = 0.6) =>
    b.seat(kind, fk, lx, ly, dir, variant ?? (fk === 'armchair' || fk === 'cafe_chair' ? dir : undefined), { order });
  /** Escrivaninha com o monitor para a câmera e a cadeira de costas (lugar de trabalho). */
  const desk = (lx: number, ly: number, rank: number, variant = 'wood') => {
    const d = furn('desk', lx, ly, variant, { order: 0.4 + rank * 0.02, seat: `S${rank}` });
    b.seat('desk', 'office_chair', lx, ly + 1, 'up', theme.chairVariant, { dx: TILE / 2, deskId: d, rank, side: 'S', order: 0.6 + rank * 0.02 });
  };
  const sofa = (lx: number, ly: number, dir: 'up' | 'down', order = 0.5) => {
    const s = furn('sofa', lx, ly, dir, { order });
    for (let i = 0; i < 3; i++) b.seat('sofa', 'sofa', lx + i, ly, dir, dir, { noFurniture: true, furnitureId: s });
  };
  const shelf = (lx: number) => {
    furn('bookshelf', lx, 2, undefined, { order: 0.25 });
    b.spot('shelf', lx, 3, 'up', { dx: 8, dy: -2 });
  };
  const windowAt = (cx: number) => {
    wallItem('window', cx, undefined, 0.4);
    b.spot('window', Math.floor(cx - 0.75), 2, 'up', { dx: 12, dy: 1 });
  };

  switch (style) {
    case 'living': {
      // sofá de costas para a câmera, de frente para a TV; poltronas em volta da mesa de centro
      b.rug(1.2, 3.3, 5, 4.2, theme.carpet, room.seed + 2);
      wallItem('tv', 3.5, undefined, 0.4);
      wallItem('painting', 12, undefined, 0.5);
      furn('coffee_table', 2, 4, undefined, { dx: TILE / 2, order: 0.45 });
      sofa(2, 6, 'up');
      chair('nook', 'armchair', 1, 4, 'right');
      chair('nook', 'armchair', 5, 4, 'left');
      furn('plant_tall', 1, 2, 'monstera', { order: 0.2 });
      furn('plant_small', 5, 2, 'flower', { order: 0.21 });
      shelf(10);
      furn('floor_lamp', 14, 2, undefined, { order: 0.22 });
      b.rug(10.4, 6.6, 4.2, 3, '#d9c3a0', room.seed + 3);
      chair('beanbag', 'beanbag', 11, 8, 'up', 'yellow');
      chair('beanbag', 'beanbag', 13, 8, 'up', 'red');
      furn('plant_tall', 14, 10, 'palm', { order: 0.23 });
      b.spot('stand', 12, 5, 'down');
      break;
    }
    case 'office': {
      wallItem('whiteboard', 3, undefined, 0.6);
      wallItem('clock', 5.25, undefined, 0.7);
      desk(1, 5, 0);
      desk(3, 5, 1, 'white');
      furn('plant_small', 5, 5, 'succulent', { order: 0.46 });
      furn('filing_cabinet', 1, 9, undefined, { order: 0.3 });
      furn('trash_bin', 5, 9, undefined, { order: 0.31 });
      shelf(10);
      windowAt(13);
      furn('plant_tall', 14, 5, 'ficus', { order: 0.2 });
      b.rug(10.3, 7.2, 3.6, 2.6, theme.carpet2, room.seed + 2);
      furn('floor_lamp', 10, 8, undefined, { order: 0.32 });
      chair('nook', 'armchair', 11, 8, 'right');
      furn('coffee_table', 12, 8, undefined, { order: 0.45 });
      b.spot('stand', 12, 5, 'up');
      break;
    }
    case 'homeoffice': {
      // ilha de duas mesas face a face, arquivo e mesinha de reunião
      b.rug(0.8, 3.6, 5.4, 4.8, theme.carpet, room.seed + 2);
      wallItem('whiteboard', 3, undefined, 0.6);
      for (let i = 0; i < 2; i++) {
        const lx = 1 + i * 2;
        const back = furn('desk_back', lx, 5, theme.deskVariant, { order: 0.35 + i * 0.05, seat: `N${i}` });
        const front = furn('desk', lx, 6, theme.deskVariant, { order: 0.4 + i * 0.05, seat: `S${i}` });
        b.seat('desk', 'office_chair_front', lx, 4, 'down', theme.chairVariant, { dx: TILE / 2, deskId: back, rank: i * 2 + 1, side: 'N', order: 0.55 + i * 0.03 });
        b.seat('desk', 'office_chair', lx, 7, 'up', theme.chairVariant, { dx: TILE / 2, deskId: front, rank: i * 2, side: 'S', order: 0.6 + i * 0.03 });
      }
      furn('plant_small', 5, 6, 'fern', { order: 0.46 });
      furn('binder_shelf', 10, 2, undefined, { order: 0.3 });
      furn('binder_shelf', 11, 2, undefined, { order: 0.31 });
      furn('printer', 12, 2, undefined, { order: 0.32 });
      wallItem('clock', 13.75, undefined, 0.7);
      furn('plant_tall', 14, 2, 'bonsai', { order: 0.2 });
      furn('cafe_table', 12, 7, undefined, { order: 0.45 });
      chair('stool', 'stool', 11, 7, 'right', undefined);
      chair('stool', 'stool', 13, 7, 'left', undefined);
      furn('plant_tall', 14, 10, 'monstera', { order: 0.21 });
      furn('trash_bin', 10, 10, undefined, { order: 0.3 });
      b.spot('stand', 12, 4, 'up');
      break;
    }
    case 'porch': {
      // varanda: muito verde, banco, mesinha de café e a TV com a câmera da casa
      wallItem('window', 2.5, undefined, 0.4);
      wallItem('tv', 12.5, undefined, 0.4);
      b.spot('stand', 12, 3, 'up', { dy: -1 });
      b.spot('window', 2, 2, 'up', { dx: 12, dy: 1 });
      for (const [lx, ly, v] of [[1, 2, 'palm'], [4, 2, 'monstera'], [14, 2, 'ficus'], [1, 10, 'monstera'], [14, 10, 'palm']] as const) furn('plant_tall', lx, ly, v, { order: 0.2 });
      for (const [lx, ly, v] of [[5, 2, 'flower'], [10, 2, 'fern'], [5, 10, 'succulent'], [10, 10, 'flower']] as const) furn('plant_small', lx, ly, v, { order: 0.21 });
      const bench = furn('bench', 2, 6, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 2 + i, 6, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.rug(9.8, 4.6, 4.4, 2.8, '#c9b48a', room.seed + 2);
      furn('cafe_table', 12, 6, undefined, { order: 0.45 });
      chair('nook', 'cafe_chair', 11, 6, 'right');
      chair('cafe_seat', 'cafe_chair', 13, 6, 'left');
      furn('floor_lamp', 14, 6, undefined, { order: 0.3 });
      chair('beanbag', 'beanbag', 3, 9, 'up', 'green');
      break;
    }
    case 'pc': {
      wallItem('poster', 2, 'rocket', 0.5);
      wallItem('shelf_wall', 4.5, undefined, 0.5);
      desk(1, 5, 0, 'dark');
      desk(3, 5, 1, 'dark');
      furn('arcade', 5, 2, undefined, { order: 0.3 });
      b.spot('arcade', 5, 3, 'up', { dy: -3 });
      furn('floor_lamp', 10, 2, undefined, { order: 0.3 });
      wallItem('poster', 12, 'bug', 0.5);
      furn('plant_tall', 14, 2, 'bonsai', { order: 0.2 });
      b.rug(10.4, 6.6, 4.2, 3, theme.carpet2, room.seed + 2);
      chair('beanbag', 'beanbag', 11, 8, 'up', 'blue');
      chair('nook', 'beanbag', 13, 8, 'up', 'red');
      furn('trash_bin', 1, 9, undefined, { order: 0.3 });
      b.spot('stand', 12, 5, 'up');
      break;
    }
    case 'kitchen': {
      // bancada na parede norte (geladeira, pia, cafeteira, micro-ondas) e duas mesinhas
      furn('fridge', 1, 2, undefined, { order: 0.2 });
      b.spot('fridge', 1, 3, 'up', { dy: -3 });
      furn('counter', 2, 2, 'drawers', { order: 0.22 });
      furn('counter_sink', 3, 2, undefined, { order: 0.24 });
      b.spot('sink', 3, 3, 'up', { dy: -3 });
      const m = furn('coffee_machine', 4, 2, undefined, { order: 0.26 });
      b.spot('coffee', 4, 3, 'up', { dy: -3, furnitureId: m });
      furn('microwave', 5, 2, undefined, { order: 0.28 });
      wallItem('shelf_wall', 3, undefined, 0.4);
      wallItem('poster', 5.5, 'coffee', 0.45);
      windowAt(12.5);
      furn('plant_tall', 14, 2, 'monstera', { order: 0.2 });
      b.rug(1.4, 5.6, 4.2, 2.8, '#c98f62', room.seed + 2);
      furn('cafe_table', 3, 7, undefined, { order: 0.45 });
      chair('stool', 'cafe_chair', 2, 7, 'right');
      chair('cafe_seat', 'cafe_chair', 4, 7, 'left');
      furn('cafe_table', 12, 7, undefined, { order: 0.46 });
      chair('cafe_seat', 'cafe_chair', 11, 7, 'right');
      chair('cafe_seat', 'cafe_chair', 13, 7, 'left');
      furn('plant_small', 14, 10, 'flower', { order: 0.21 });
      furn('trash_bin', 1, 10, undefined, { order: 0.3 });
      b.spot('stand', 11, 4, 'up');
      break;
    }
    case 'bedroom': {
      // "cama" (sofá-cama de frente para a câmera) com tapete, quadro em cima, espelho e poltrona
      wallItem('painting', 3, undefined, 0.5);
      b.rug(1, 2.6, 5, 3.4, '#e8b4c2', room.seed + 2);
      sofa(2, 3, 'down');
      furn('floor_lamp', 1, 3, undefined, { order: 0.3 });
      furn('plant_small', 5, 3, 'flower', { order: 0.31 });
      chair('beanbag', 'beanbag', 2, 8, 'up', 'red');
      wallItem('mirror', 11, undefined, 0.5);
      b.spot('window', 10, 2, 'up', { dx: 8, dy: 1 });
      windowAt(13.25);
      furn('plant_tall', 14, 5, 'ficus', { order: 0.2 });
      chair('nook', 'armchair', 11, 7, 'right');
      furn('coffee_table', 12, 7, undefined, { order: 0.45 });
      furn('bookshelf', 13, 10, undefined, { order: 0.25 });
      b.spot('stand', 11, 4, 'up');
      break;
    }
    case 'workshop': {
      // oficina: prateleiras, arquivos e bancada de trabalho
      wallItem('shelf_wall', 2, undefined, 0.4);
      wallItem('shelf_wall', 4.5, undefined, 0.41);
      furn('binder_shelf', 1, 2, undefined, { order: 0.3 });
      furn('filing_cabinet', 2, 2, undefined, { order: 0.31 });
      furn('printer', 3, 2, undefined, { order: 0.32 });
      furn('binder_shelf', 4, 2, undefined, { order: 0.33 });
      desk(2, 6, 0, 'dark');
      furn('trash_bin', 5, 9, undefined, { order: 0.3 });
      furn('binder_shelf', 10, 2, undefined, { order: 0.3 });
      furn('binder_shelf', 11, 2, undefined, { order: 0.31 });
      wallItem('whiteboard', 13, undefined, 0.6);
      b.spot('whiteboard', 12, 3, 'up', { dx: 8, dy: 2 });
      b.spot('stand', 11, 6, 'up');
      b.spot('stand', 13, 6, 'up');
      furn('floor_lamp', 14, 9, undefined, { order: 0.3 });
      furn('plant_small', 10, 10, 'succulent', { order: 0.21 });
      break;
    }
    case 'library': {
      // estantes na parede norte, cantinho de leitura com poltronas e sofá
      shelf(1);
      shelf(3);
      furn('plant_tall', 5, 2, 'palm', { order: 0.2 });
      shelf(10);
      shelf(12);
      furn('plant_small', 14, 2, 'fern', { order: 0.21 });
      b.rug(0.8, 5.4, 5.4, 3.2, theme.carpet, room.seed + 2);
      furn('coffee_table', 2, 6, undefined, { order: 0.45 });
      chair('nook', 'armchair', 1, 6, 'right');
      chair('nook', 'armchair', 4, 6, 'left');
      furn('floor_lamp', 5, 8, undefined, { order: 0.3 });
      b.rug(10, 7.4, 4.8, 2.8, theme.carpet2, room.seed + 3);
      sofa(11, 8, 'down');
      furn('floor_lamp', 10, 8, undefined, { order: 0.31 });
      furn('plant_tall', 14, 8, 'ficus', { order: 0.22 });
      b.spot('stand', 12, 5, 'up');
      break;
    }
  }

  // ---- sombreamento quando a luz está apagada (igual à sala de projeto)
  const p = { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
  area.shade = north ? { x: p.x, y: p.y, w: p.w, h: p.h - TILE } : { x: p.x, y: p.y, w: p.w, h: p.h };
  return b.build();
}
