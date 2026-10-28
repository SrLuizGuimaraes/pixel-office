// O clube de tiro e a quadra de futebol, a leste do dojo (na mesma fileira do shopping): o clube é uma sala com dez raias de
// tiro ao alvo e a quadra, atrás dele, é uma área aberta com as duas traves e a torcida nos bancos. Dá para ir da arena do
// dojo à quadra por uma porta, e do clube à quadra por outra. A porta da rua é a do clube.
//
//   x:  96                           128
//   y41 ┌──── Clube de tiro (10 raias) ─┐   porta da rua em x 111-112 (norte) · porta com o dojo (oeste) · porta para a quadra (sul)
//   y53 ├──── Quadra de futebol ────────┤   área aberta: traves, campo, bancos · acesso pela arena do dojo (oeste)
//   y77 └───────────────────────────────┘
//
// Os lugares novos (SpotKind shootlane, shootwatch, penalty, fieldwatch, kickabout) são usados pelas rodas "tiro" e "futebol"
// (social/social.ts) e pelos passeios pagos de quem está à toa (sim/sim.ts).
import { tr } from '../../../../shared/i18n';
import type { FloorKind, WallStyle } from '../../art/api';
import { BUILDING_H, COL_W, ROOM_H } from '../constants';
import { AreaBuilder } from './builder';
import { shell, type Plan } from './house';
import type { AreaLayout, TileRect } from './types';

/** A leste do dojo (que termina na coluna 96). */
export const CLUB_X = COL_W * 6;
export const CLUB_W = COL_W * 2;
export const CLUB_RIGHT = CLUB_X + CLUB_W;
export const CLUB_Y = BUILDING_H + 12;
export const CLUB_BOTTOM = CLUB_Y + ROOM_H + ROOM_H * 2;
/** Coluna (e largura 2) da porta da rua do clube. */
export const CLUB_DOOR_X = CLUB_X + 15;

export const CLUB_TIRO_ID = 'club:tiro';
export const CLUB_QUADRA_ID = 'club:quadra';

export const CLUB_NAMES: Readonly<Record<string, string>> = {
  [CLUB_TIRO_ID]: tr('Clube de Tiro Alvo Certo'),
  [CLUB_QUADRA_ID]: tr('Quadra de Futebol'),
};

interface Look {
  floor: FloorKind;
  wall: WallStyle;
}

const TIRO_LOOK: Look = { floor: 'concrete', wall: { base: '#d9dde4', trim: '#4a5a80', pattern: 'plain' } };
const LANE = 8;
const TIRO_RECT: TileRect = { x: CLUB_X, y: CLUB_Y, w: CLUB_W, h: ROOM_H };
const QUADRA_RECT: TileRect = { x: CLUB_X, y: CLUB_Y + ROOM_H, w: CLUB_W, h: ROOM_H * 2 };

const TIRO_PLAN: Plan = { rect: TIRO_RECT, doors: [{ side: 'n', at: 15 }, { side: 'w', at: LANE }, { side: 's', at: 16 }] };

/** Raias de tiro: colunas das cabines (a coluna 15-16 é a porta da rua) e as duplas de raias vizinhas das competições. */
export const LANES = [3, 5, 7, 9, 11, 19, 21, 23, 25, 27] as const;
const PAIRS: readonly (readonly [string, number, number])[] = [
  ['shoot:a', 3, 5],
  ['shoot:b', 7, 9],
  ['shoot:c', 19, 21],
  ['shoot:d', 23, 25],
];

/** Clube de tiro: alvos ao fundo (norte), uma cabine por raia, um corredor atrás delas e a torcida das competições. */
function layoutTiro(): AreaLayout {
  const b = shell(CLUB_TIRO_ID, 'lounge', TIRO_PLAN, TIRO_LOOK, 940);
  b.area.shade = undefined;
  b.area.signId = b.wall('sign', 22, undefined, { order: 0.95 });
  b.wall('clock', 12.5, undefined, { order: 0.7 });
  b.wall('poster', 28.5, 'rocket', { order: 0.5 });
  b.wall('poster', 1.5, 'ship_it', { order: 0.5 });
  b.furn('trophy_case', 12, 2, undefined, { order: 0.25 });
  for (const lx of LANES) {
    b.furn('target_stand', lx, 2, undefined, { order: 0.3 + lx * 0.001 });
    b.furn('shooting_booth', lx, 6, undefined, { order: 0.45 + lx * 0.001 });
  }
  const inPair = new Map<number, string>();
  for (const [g, a, c] of PAIRS) {
    inPair.set(a, g);
    inPair.set(c, g);
  }
  for (const lx of LANES) b.spot('shootlane', lx, 7, 'up', { dy: -2, group: inPair.get(lx) });
  for (const lx of [5, 9, 21, 25]) b.spot('shootwatch', lx, 9, 'up');
  b.rug(13.4, 2.4, 5.2, 7.6, '#3a3f4b', 941);
  b.spot('staffpost', 12, 10, 'up', { group: 'tiro' });
  b.furn('plant_tall', 30, 2, 'ficus', { order: 0.2 });
  b.furn('plant_small', 1, 10, 'fern', { order: 0.22 });
  b.furn('trash_bin', 30, 10, undefined, { order: 0.6 });
  return b.build();
}

/** Quadra de futebol: campo de grama com linhas, duas traves, dois pontos de pênalti, bancos para a torcida e lugares para bater uma bolinha. */
function layoutQuadra(): AreaLayout {
  const b = new AreaBuilder(CLUB_QUADRA_ID, 'reception', QUADRA_RECT);
  b.floor('sidewalk', 0, 0, 32, 24, 950);
  b.floor('grass', 1, 1, 30, 22, 951);
  b.walk(0, 0, 32, 24);
  // linhas do campo (tiras finas brancas)
  const line = (lx: number, ly: number, w: number, h: number, seed: number) => b.rug(lx, ly, w, h, '#f4f4f0', seed);
  line(2, 3, 28, 0.25, 952);
  line(2, 20, 28, 0.25, 953);
  line(2, 3, 0.25, 17.25, 954);
  line(29.75, 3, 0.25, 17.25, 955);
  line(15.9, 3, 0.25, 17.25, 956);
  for (const [x, n] of [[2, 957], [24.75, 961]] as const) {
    line(x, 8, 3.25, 0.2, n);
    line(x, 15, 3.25, 0.2, n + 1);
    line(x + (x < 10 ? 3 : 0), 8, 0.2, 7.2, n + 2);
  }
  // traves
  b.furn('goal', 1, 10, 'west', { order: 0.3 });
  b.furn('goal', 30, 10, 'east', { order: 0.31 });
  // pênaltis: batedor no ponto, goleiro na frente da trave, de frente um para o outro
  b.spot('penalty', 8, 11, 'left', { group: 'pen:w' });
  b.spot('penalty', 2, 11, 'right', { group: 'pen:w' });
  b.spot('penalty', 23, 11, 'right', { group: 'pen:e' });
  b.spot('penalty', 29, 11, 'left', { group: 'pen:e' });
  // torcida: três bancos ao norte (olhando para baixo) e três ao sul (olhando para cima)
  for (const [i, lx] of [6, 14, 22].entries()) {
    for (const [ly, dir] of [[1, 'down'], [21, 'up']] as const) {
      const id = b.furn('bench', lx, ly, undefined, { order: 0.5 + i * 0.01 });
      for (let k = 0; k < 2; k++) b.seat('fieldwatch', 'bench', lx + k, ly, dir, undefined, { noFurniture: true, furnitureId: id });
    }
  }
  // bater uma bolinha
  for (const [lx, ly] of [[10, 6], [20, 6], [10, 16], [20, 16]] as const) b.spot('kickabout', lx, ly, 'down');
  b.spot('staffpost', 17, 2, 'down', { group: 'quadra' });
  b.furn('plant_small', 0, 0, 'fern', { order: 0.2 });
  b.furn('plant_small', 31, 0, 'fern', { order: 0.21 });
  b.furn('plant_small', 0, 23, 'flower', { order: 0.22 });
  b.furn('floor_lamp', 31, 23, undefined, { order: 0.3 });
  return b.build();
}

let cache: AreaLayout[] | null = null;

/** As áreas do clube (calculadas uma vez). */
export function clubAreas(): AreaLayout[] {
  return (cache ??= [layoutTiro(), layoutQuadra()]);
}
