// O shopping do outro lado da rua: átrio com a entrada, lojas de roupas e de games, praça de alimentação, academia e
// fliperama (área de jogos). Fica ao sul do prédio, depois da rua; do lounge sai um caminho até a porta do átrio.
//
//   y 41 ┌ Moda Urbana ┬──────── átrio (entrada) ────────┬ Game Zone ┐   (a porta da rua é a do átrio, em x 23-24)
//   y 53 ├ Boutique    ┼───── praça de alimentação ──────┼ Pixel Store┤
//   y 65 ├──── academia ────┬──── área de jogos ────┬─ cinema ─┘
//   y 77 └──────────────────────────┴──────────────────────────────────
//
// Cada cômodo segue o padrão das salas (2 linhas de face da parede norte, piso, 1 de parede sul; paredes laterais de
// meia coluna) e as portas usam o mesmo esquema da casa (layout/house.ts): leste-oeste na linha 8 e
// norte-sul nas mesmas colunas. Os lugares novos (SpotKind shop, tryon, gamestore, demo, gym, mat, foodcounter,
// foodseat, play) só são usados pelo passeio "shopping" do ocioso (sim/sim.ts); os outros passeios não vêm até aqui.
import { tr } from '../../../../shared/i18n';
import type { FloorKind, WallStyle } from '../../art/api';
import { BUILDING_H, COL_W, ROOM_H } from '../constants';
import { AreaBuilder } from './builder';
import { CLUB_DOOR_X, CLUB_NAMES, CLUB_RIGHT, clubAreas } from './club';
import { DOJO_DOOR_X, DOJO_NAMES, dojoAreas } from './dojo';
import { KART_NAMES } from './kart';
import { shell, type Plan } from './house';
import type { AreaKind, AreaLayout, TileRect } from './types';

/** Largura do shopping (4 colunas) e a posição: logo depois da rua em frente ao prédio. */
export const MALL_W = COL_W * 4;
export const MALL_Y = BUILDING_H + 12;
export const MALL_H = ROOM_H * 3;
export const MALL_BOTTOM = MALL_Y + MALL_H;
/** Até onde vai o terreno a leste: o dojo fica ao lado do shopping (layout/dojo.ts). */
export const MALL_EXT_W = CLUB_RIGHT;
export const MALL_RECT: TileRect = { x: 0, y: MALL_Y, w: MALL_W, h: MALL_H };
/** Coluna (e largura 2) da porta de rua do átrio e do caminho que sai do lounge. */
export const MALL_DOOR_X = 23;
/** Linha da porta sul do lounge (parede sul do prédio) e a última linha do caminho antes do shopping. */
export const MALL_PATH_Y0 = BUILDING_H - 1;
export const MALL_PATH_Y1 = MALL_Y - 1;

export const MALL_ENTRY_ID = 'mall:entrada';
export const MALL_ROUPAS1_ID = 'mall:roupas1';
export const MALL_ROUPAS2_ID = 'mall:roupas2';
export const MALL_GAMES1_ID = 'mall:games1';
export const MALL_GAMES2_ID = 'mall:games2';
export const MALL_FOOD_ID = 'mall:praca';
export const MALL_GYM_ID = 'mall:academia';
export const MALL_ARCADE_ID = 'mall:fliperama';
export const MALL_CINEMA_ID = 'mall:cinema';
export const MALL_PATH_ID = 'mall:caminho';

/** Nome (para as pílulas e as placas) de cada área do shopping. */
export const MALL_NAMES: Readonly<Record<string, string>> = {
  ...DOJO_NAMES,
  ...CLUB_NAMES,
  ...KART_NAMES,
  [MALL_ENTRY_ID]: tr('Shopping'),
  [MALL_ROUPAS1_ID]: tr('Moda Urbana'),
  [MALL_ROUPAS2_ID]: tr('Boutique Aurora'),
  [MALL_GAMES1_ID]: tr('Game Zone'),
  [MALL_GAMES2_ID]: tr('Pixel Store'),
  [MALL_FOOD_ID]: tr('Praça de alimentação'),
  [MALL_GYM_ID]: tr('Academia'),
  [MALL_ARCADE_ID]: tr('Área de jogos'),
  [MALL_CINEMA_ID]: tr('Cinema'),
};

interface Look {
  floor: FloorKind;
  wall: WallStyle;
  tint?: string;
}

const LOOKS: Record<string, Look> = {
  moda: { floor: 'wood', wall: { base: '#f3e4ea', trim: '#b4808f', pattern: 'stripes' } },
  boutique: { floor: 'wood', wall: { base: '#ece6f3', trim: '#8f7fb4', pattern: 'plain' } },
  games: { floor: 'carpet', wall: { base: '#2c3358', trim: '#6a72a8', pattern: 'plain' }, tint: '#33406f' },
  entrada: { floor: 'marble', wall: { base: '#efe9dd', trim: '#a88e6c', pattern: 'wood_panel' } },
  praca: { floor: 'tile_check', wall: { base: '#f4f1ea', trim: '#a39b88', pattern: 'tiles' } },
  academia: { floor: 'concrete', wall: { base: '#dfe3e8', trim: '#7f8b99', pattern: 'plain' } },
  fliperama: { floor: 'carpet', wall: { base: '#2a2250', trim: '#7a66c8', pattern: 'plain' }, tint: '#3a2a6a' },
  cinema: { floor: 'carpet', wall: { base: '#2b2236', trim: '#8a3a52', pattern: 'plain' }, tint: '#5a2a3a' },
};

const RECT = (x: number, band: number, w: number): TileRect => ({ x, y: MALL_Y + band * ROOM_H, w, h: ROOM_H });
const LANE = 8;

/** Plantas (retângulos e portas) de cada cômodo do shopping. */
const PLANS: Record<string, Plan> = {
  [MALL_ROUPAS1_ID]: { rect: RECT(0, 0, 16), doors: [{ side: 'e', at: LANE }] },
  [MALL_ENTRY_ID]: { rect: RECT(16, 0, 32), doors: [{ side: 'n', at: 7 }, { side: 'w', at: LANE }, { side: 'e', at: LANE }, { side: 's', at: 15 }] },
  [MALL_GAMES1_ID]: { rect: RECT(48, 0, 16), doors: [{ side: 'w', at: LANE }, { side: 'e', at: LANE }] },
  [MALL_ROUPAS2_ID]: { rect: RECT(0, 1, 16), doors: [{ side: 'e', at: LANE }] },
  [MALL_FOOD_ID]: { rect: RECT(16, 1, 32), doors: [{ side: 'n', at: 15 }, { side: 'w', at: LANE }, { side: 'e', at: LANE }, { side: 's', at: 2 }, { side: 's', at: 24 }] },
  [MALL_GAMES2_ID]: { rect: RECT(48, 1, 16), doors: [{ side: 'w', at: LANE }] },
  [MALL_GYM_ID]: { rect: RECT(0, 2, 24), doors: [{ side: 'n', at: 18 }, { side: 'e', at: LANE }], outside: true },
  [MALL_ARCADE_ID]: { rect: RECT(24, 2, 24), doors: [{ side: 'n', at: 16 }, { side: 'w', at: LANE }, { side: 'e', at: LANE }], outside: true },
  [MALL_CINEMA_ID]: { rect: RECT(48, 2, 16), doors: [{ side: 'w', at: LANE }], outside: true },
};

function base(id: string, kind: AreaKind, look: Look, seed: number): AreaBuilder {
  const b = shell(id, kind, PLANS[id], look, seed, look.tint);
  b.area.shade = undefined;
  return b;
}

/** Placa com o nome do cômodo (o texto vem de MALL_NAMES, desenhado pelo overlay). */
function sign(b: AreaBuilder, cx: number): void {
  b.area.signId = b.wall('sign', cx, undefined, { order: 0.95 });
}

const RACKS = [3, 5, 7, 10, 12] as const;

/** Loja de roupas: estantes de dobrados na parede, araras, manequins, espelhos de provador e o caixa. */
function layoutClothes(id: string, look: Look, variant: 0 | 1): AreaLayout {
  const b = base(id, 'lounge', look, 810 + variant);
  sign(b, 8);
  for (const lx of [2, 4, 6]) b.furn('shop_shelf', lx, 2, 'clothes', { order: 0.25 });
  b.wall('mirror', 12.5, undefined, { order: 0.5 });
  b.wall('mirror', 14.5, undefined, { order: 0.5 });
  b.wall('poster', 10, variant ? 'cat' : 'rocket', { order: 0.5 });
  for (const lx of RACKS) {
    b.furn('clothes_rack', lx, 4, undefined, { order: 0.4 + lx * 0.001 });
    b.spot('shop', lx, 5, 'up', { dy: -2 });
  }
  // provadores: duas poses diante dos espelhos da parede
  b.spot('tryon', 12, 3, 'up', { dy: -3 });
  b.spot('tryon', 14, 3, 'up', { dy: -3 });
  b.furn('mannequin', 1, 6, variant ? 'blue' : 'pink', { order: 0.45 });
  b.furn('mannequin', 14, 6, variant ? 'pink' : 'blue', { order: 0.46 });
  b.furn('reception_desk', 8, 6, undefined, { order: 0.5 });
  b.spot('staffpost', 9, 5, 'down', { group: 'caixa-roupas' });
  b.furn('plant_tall', 14, 10, 'ficus', { order: 0.21 });
  b.furn('plant_small', 1, 10, 'flower', { order: 0.22 });
  b.rug(2.2, 7.6, 11.6, 2.6, variant ? '#cbb8dc' : '#e7c3d0', 820 + variant);
  return b.build();
}

/** Loja de games: prateleiras de caixas, quiosques de demonstração (jogando em pé), tela e caixa. */
function layoutGames(id: string, variant: 0 | 1): AreaLayout {
  const b = base(id, 'lounge', LOOKS.games, 830 + variant);
  sign(b, 8);
  for (const lx of [2, 4, 6]) {
    b.furn('shop_shelf', lx, 2, 'games', { order: 0.25 });
    b.spot('gamestore', lx, 3, 'up', { dy: -3 });
  }
  b.wall('tv', 12, undefined, { order: 0.4 });
  b.wall('poster', 10, variant ? 'bug' : 'ship_it', { order: 0.5 });
  for (const lx of [10, 13]) {
    b.furn('arcade', lx, 3, undefined, { order: 0.3 });
    b.spot('demo', lx, 4, 'up', { dy: -2 });
  }
  b.furn('reception_desk', 10, 6, undefined, { order: 0.5 });
  b.spot('staffpost', 11, 5, 'down', { group: 'caixa-games' });
  b.furn('shop_shelf', 2, 6, 'games', { order: 0.45 });
  b.furn('plant_tall', 14, 10, 'bonsai', { order: 0.21 });
  b.furn('floor_lamp', 1, 10, undefined, { order: 0.3 });
  b.rug(2.2, 7.6, 11.6, 2.6, variant ? '#4a3a8a' : '#2f5aa0', 840 + variant);
  return b.build();
}

/** Átrio: a porta da rua, a fonte, bancos, plantas e o diretório; liga as lojas e a praça. */
function layoutEntry(): AreaLayout {
  const b = base(MALL_ENTRY_ID, 'reception', LOOKS.entrada, 850);
  sign(b, 24);
  b.wall('painting', 12.5, undefined, { order: 0.5 });
  b.wall('painting', 35.5, undefined, { order: 0.5 });
  b.wall('clock', 18, undefined, { order: 0.7 });
  b.wall('poster', 30, 'coffee', { order: 0.5 });
  b.furn('fountain', 22, 4, undefined, { order: 0.4 });
  b.rug(19.5, 3.4, 8.4, 4.6, '#e3dcc8', 851);
  for (const lx of [3, 12, 27, 29]) b.furn('plant_tall', lx, 2, lx % 2 ? 'palm' : 'ficus', { order: 0.2 + lx * 0.001 });
  for (const lx of [3, 28]) b.furn('bench', lx, 5, undefined, { order: 0.5 });
  b.furn('bench', 18, 6, undefined, { order: 0.51 });
  b.furn('bench', 28, 6, undefined, { order: 0.52 });
  b.furn('plant_small', 5, 5, 'flower', { order: 0.53 });
  b.furn('plant_small', 30, 5, 'fern', { order: 0.54 });
  b.furn('vending_machine', 30, 2, undefined, { order: 0.3 });
  return b.build();
}

const STALLS: readonly (readonly [number, string])[] = [
  [2, 'pizza'],
  [6, 'burger'],
  [21, 'sushi'],
  [25, 'sorvete'],
];
const TABLES = [
  [5, 5],
  [9, 5],
  [21, 5],
  [25, 5],
  [7, 7],
  [23, 7],
] as const;

/** Praça de alimentação: quatro balcões na parede norte e mesas com cadeiras de cada lado. */
function layoutFood(): AreaLayout {
  const b = base(MALL_FOOD_ID, 'cafe', LOOKS.praca, 860);
  sign(b, 16);
  b.wall('clock', 12, undefined, { order: 0.7 });
  b.wall('window', 12, undefined, { order: 0.4 });
  for (const [lx, v] of STALLS) {
    b.furn('food_counter', lx, 2, v, { order: 0.3 + lx * 0.001 });
    b.spot('foodcounter', lx + 1, 3, 'up', { dy: -3 });
  }
  let n = 0;
  for (const [lx, ly] of TABLES) {
    b.furn('cafe_table', lx, ly, undefined, { order: 0.45 + n * 0.01 });
    b.seat('foodseat', 'cafe_chair', lx - 1, ly, 'right', 'right', { order: 0.6 + n * 0.01 });
    b.seat('foodseat', 'cafe_chair', lx + 1, ly, 'left', 'left', { order: 0.61 + n * 0.01 });
    n++;
  }
  // um cozinheiro entre a pizza e o hambúrguer e um atendente entre o sushi e o sorvete
  b.spot('staffpost', 5, 2, 'down', { group: 'cozinha' });
  b.spot('staffpost', 24, 2, 'down', { group: 'atendente-praca' });
  b.furn('plant_tall', 13, 2, 'monstera', { order: 0.2 });
  b.furn('plant_tall', 18, 2, 'palm', { order: 0.21 });
  b.furn('vending_machine', 30, 2, undefined, { order: 0.3 });
  b.furn('trash_bin', 29, 5, undefined, { order: 0.6 });
  b.furn('trash_bin', 1, 6, undefined, { order: 0.61 });
  b.rug(3.4, 4.2, 9.2, 4.4, '#d9c3a0', 861);
  b.rug(19.4, 4.2, 9.2, 4.4, '#d9c3a0', 862);
  return b.build();
}

/** Academia: espelhos, halteres, esteiras na parede norte, bancos de supino e um tablado de alongamento. */
function layoutGym(): AreaLayout {
  const b = base(MALL_GYM_ID, 'lounge', LOOKS.academia, 870);
  sign(b, 16);
  for (let i = 0; i < 7; i++) b.wall('mirror', 2.5 + i * 1.0, undefined, { order: 0.5 });
  b.wall('clock', 20, undefined, { order: 0.7 });
  b.wall('poster', 22.5, 'rocket', { order: 0.5 });
  for (const lx of [2, 5]) b.furn('dumbbell_rack', lx, 2, undefined, { order: 0.3 + lx * 0.001 });
  b.furn('water_cooler', 8, 2, undefined, { order: 0.31 });
  // esteiras (1x2): o corredor entra pelo tile de baixo e fica sobre a correia, de costas para a câmera
  for (const lx of [10, 12, 14, 16]) {
    b.furn('treadmill', lx, 2, undefined, { order: 0.32 + lx * 0.001 });
    b.spot('gym', lx, 4, 'up', { x: b.px(lx) + 8, y: b.py(3) + 11, sortY: b.py(4) + 0.5 });
  }
  // a coluna 18-19 da parede norte é a porta para a praça: nada nela
  b.furn('weight_bench', 20, 2, undefined, { order: 0.33 });
  b.spot('gym', 21, 3, 'up', { dy: -3 });
  b.furn('weight_bench', 20, 5, undefined, { order: 0.34 });
  b.spot('gym', 21, 6, 'up', { dy: -3 });
  // tablado de alongamento
  b.rug(2.4, 5.2, 10, 2.6, '#3b6fb8', 871);
  for (const lx of [3, 6, 9]) b.spot('mat', lx, 6, 'down');
  b.spot('staffpost', 12, 7, 'left', { group: 'instrutor' });
  b.furn('plant_tall', 22, 9, 'palm', { order: 0.2 });
  b.furn('plant_small', 22, 7, 'succulent', { order: 0.22 });
  b.furn('trash_bin', 1, 10, undefined, { order: 0.6 });
  return b.build();
}

const MACHINES_1 = [2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 19, 20, 21] as const;
const MACHINES_2 = [3, 4, 5, 6, 10, 11, 12, 13, 20, 21] as const;

/** Área de jogos: duas fileiras de fliperamas com a vitrine de prêmios (a coluna 16-17 é a porta para a praça). */
function layoutArcade(): AreaLayout {
  const b = base(MALL_ARCADE_ID, 'lounge', LOOKS.fliperama, 880);
  sign(b, 12);
  b.wall('tv', 19, undefined, { order: 0.4 });
  b.wall('poster', 22.5, 'bug', { order: 0.5 });
  b.wall('poster', 2.5, 'ship_it', { order: 0.5 });
  for (const lx of MACHINES_1) {
    b.furn('arcade', lx, 2, undefined, { order: 0.3 + lx * 0.001 });
    b.spot('play', lx, 3, 'up', { dy: -3 });
  }
  for (const lx of MACHINES_2) {
    b.furn('arcade', lx, 6, undefined, { order: 0.45 + lx * 0.001 });
    b.spot('play', lx, 7, 'up', { dy: -3 });
  }
  b.furn('reception_desk', 7, 6, undefined, { order: 0.5 });
  b.spot('staffpost', 8, 5, 'down', { group: 'atendente-jogos' });
  b.furn('plant_tall', 22, 7, 'monstera', { order: 0.2 });
  b.furn('floor_lamp', 1, 10, undefined, { order: 0.3 });
  b.rug(2.4, 3.6, 18, 7, '#4b2f8a', 881);
  return b.build();
}

/** Cinema: tela de várias TVs na parede norte e três fileiras de poltronas com um corredor no meio. */
function layoutCinema(): AreaLayout {
  const b = base(MALL_CINEMA_ID, 'lounge', LOOKS.cinema, 890);
  sign(b, 13.5);
  for (const cx of [4, 6, 8, 10]) b.wall('tv', cx, undefined, { order: 0.4 });
  b.wall('poster', 12.5, 'rocket', { order: 0.5 });
  b.wall('poster', 15, 'cat', { order: 0.5 });
  b.rug(1.4, 2.4, 13.2, 7.4, '#4a2232', 892);
  b.rug(8.4, 2.6, 1.4, 6.4, '#8a3a52', 891);
  let n = 0;
  for (const ly of [3, 5, 7]) {
    for (const lx of [3, 4, 5, 6, 7, 9, 10, 11, 12]) {
      b.seat('cinema', 'armchair', lx, ly, 'up', 'up', { order: 0.5 + ly * 0.01 + n++ * 0.0001 });
    }
  }
  b.furn('vending_machine', 14, 2, undefined, { order: 0.3 });
  b.spot('staffpost', 13, 3, 'left', { group: 'cinema' });
  b.furn('plant_tall', 14, 5, 'ficus', { order: 0.21 });
  b.furn('plant_small', 1, 3, 'fern', { order: 0.22 });
  b.furn('floor_lamp', 14, 10, undefined, { order: 0.3 });
  return b.build();
}

/** O trecho a céu aberto: do lounge, pela calçada, a faixa de pedestres e a calçada do outro lado, até a porta do átrio. */
function layoutPath(): AreaLayout {
  const b = new AreaBuilder(MALL_PATH_ID, 'corridor', { x: MALL_DOOR_X - 1, y: MALL_PATH_Y0, w: 4, h: MALL_PATH_Y1 - MALL_PATH_Y0 + 1 });
  b.walk(1, 1, 2, MALL_PATH_Y1 - MALL_PATH_Y0);
  // calçada em frente ao shopping, até a porta do dojo (a leste), e a entrada dela
  b.walk(0, MALL_PATH_Y1 - MALL_PATH_Y0 - 2, CLUB_DOOR_X + 2 - (MALL_DOOR_X - 1), 2);
  b.walk(DOJO_DOOR_X - (MALL_DOOR_X - 1), MALL_PATH_Y1 - MALL_PATH_Y0, 2, 1);
  b.walk(CLUB_DOOR_X - (MALL_DOOR_X - 1), MALL_PATH_Y1 - MALL_PATH_Y0, 2, 1);
  return b.build();
}

let cache: AreaLayout[] | null = null;

/** As áreas do shopping (o caminho de rua e os cômodos), calculadas uma vez. */
export function mallAreas(): AreaLayout[] {
  return (cache ??= [
    layoutPath(),
    layoutEntry(),
    layoutClothes(MALL_ROUPAS1_ID, LOOKS.moda, 0),
    layoutGames(MALL_GAMES1_ID, 0),
    layoutClothes(MALL_ROUPAS2_ID, LOOKS.boutique, 1),
    layoutFood(),
    layoutGames(MALL_GAMES2_ID, 1),
    layoutGym(),
    layoutArcade(),
    layoutCinema(),
    ...dojoAreas(),
    ...clubAreas(),
  ]);
}

/** Texto das placas (o overlay escreve o nome do cômodo na placa). */
export function mallSignText(id: string): string | null {
  return MALL_NAMES[id] ?? null;
}
