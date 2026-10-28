// O dojo, ao lado do shopping (a leste dele, na mesma fileira): o salão com o tatame para treinar em dupla, a sala de
// treino com sacos de pancada e a arena onde se luta de verdade, com a torcida em volta do ringue. A porta da rua é a do
// salão (na calçada em frente) e há uma porta interna entre a loja de games do shopping e o salão.
//
//   x:  64             80             96
//   y41 ┌── Dojo (tatame) ──────────────┐   porta da rua em x 79-80 (norte) · porta interna com o shopping (oeste)
//   y53 ├ Sala de treino ┬──── Arena ────┤
//   y65 └────────────────┴───────────────┘
//
// Os lugares novos (SpotKind tatame, ring, ringwatch, bagpunch) ficam só aqui: o treino e a luta são rodas do mundo
// social (social/social.ts, GatherKind 'treino' e 'luta') e o saco de pancada é um passeio pago do ocioso (sim/sim.ts).
import { tr } from '../../../../shared/i18n';
import type { FloorKind, WallStyle } from '../../art/api';
import { BUILDING_H, COL_W, ROOM_H } from '../constants';
import { AreaBuilder } from './builder';
import { shell, type Plan } from './house';
import type { AreaLayout, TileRect } from './types';

/** Ao lado do shopping (que ocupa as 4 primeiras colunas) e na mesma fileira. */
export const DOJO_X = COL_W * 4;
export const DOJO_W = COL_W * 2;
export const DOJO_RIGHT = DOJO_X + DOJO_W;
export const DOJO_Y = BUILDING_H + 12;
export const DOJO_H = ROOM_H * 2;
export const DOJO_BOTTOM = DOJO_Y + DOJO_H;
export const DOJO_RECT: TileRect = { x: DOJO_X, y: DOJO_Y, w: DOJO_W, h: DOJO_H };
/** Coluna (e largura 2) da porta da rua do salão. */
export const DOJO_DOOR_X = DOJO_X + 15;

export const DOJO_MAIN_ID = 'dojo:salao';
export const DOJO_TRAIN_ID = 'dojo:treino';
export const DOJO_ARENA_ID = 'dojo:arena';

export const DOJO_NAMES: Readonly<Record<string, string>> = {
  [DOJO_MAIN_ID]: tr('Dojo Kiai'),
  [DOJO_TRAIN_ID]: tr('Sala de treino'),
  [DOJO_ARENA_ID]: tr('Arena'),
};

interface Look {
  floor: FloorKind;
  wall: WallStyle;
  tint?: string;
}

const LOOKS: Record<string, Look> = {
  salao: { floor: 'wood', wall: { base: '#e9dfcb', trim: '#8a6a45', pattern: 'wood_panel' } },
  treino: { floor: 'concrete', wall: { base: '#d8dde6', trim: '#4a5a80', pattern: 'plain' } },
  arena: { floor: 'carpet', wall: { base: '#3a2230', trim: '#a83232', pattern: 'plain' }, tint: '#6b2a2a' },
};

const LANE = 8;
const rect = (x: number, band: number, w: number): TileRect => ({ x, y: DOJO_Y + band * ROOM_H, w, h: ROOM_H });

const PLANS: Record<string, Plan> = {
  [DOJO_MAIN_ID]: { rect: rect(DOJO_X, 0, DOJO_W), doors: [{ side: 'n', at: 15 }, { side: 'w', at: LANE }, { side: 'e', at: LANE }, { side: 's', at: 6 }, { side: 's', at: 22 }] },
  [DOJO_TRAIN_ID]: { rect: rect(DOJO_X, 1, 16), doors: [{ side: 'n', at: 6 }, { side: 'e', at: LANE }], outside: true },
  [DOJO_ARENA_ID]: { rect: rect(DOJO_X + 16, 1, 16), doors: [{ side: 'n', at: 6 }, { side: 'w', at: LANE }, { side: 'e', at: LANE }], outside: true },
};

function base(id: string, look: Look, seed: number): AreaBuilder {
  const b = shell(id, 'lounge', PLANS[id], look, seed, look.tint);
  b.area.shade = undefined;
  return b;
}

function sign(b: AreaBuilder, cx: number): void {
  b.area.signId = b.wall('sign', cx, undefined, { order: 0.95 });
}

/** Salão: tatame no meio (duas duplas de treino frente a frente), racks de armas, vitrines de troféus e bancos. */
function layoutMain(): AreaLayout {
  const b = base(DOJO_MAIN_ID, LOOKS.salao, 910);
  sign(b, 16);
  b.wall('painting', 6.5, undefined, { order: 0.5 });
  b.wall('painting', 25.5, undefined, { order: 0.5 });
  b.wall('clock', 22, undefined, { order: 0.7 });
  b.furn('trophy_case', 2, 2, undefined, { order: 0.25 });
  b.furn('weapon_rack', 5, 2, undefined, { order: 0.26 });
  b.furn('weapon_rack', 25, 2, undefined, { order: 0.27 });
  b.furn('trophy_case', 28, 2, undefined, { order: 0.28 });
  // tatame verde com a borda dourada
  b.rug(5.2, 3.2, 21.6, 6.6, '#caa75c', 911);
  b.rug(6, 3.9, 20, 5.2, '#4d8f57', 912);
  // duas duplas de treino, frente a frente, bem perto uma da outra
  b.spot('tatame', 14, 5, 'right', { group: 'tatame:a', dx: 4 });
  b.spot('tatame', 17, 5, 'left', { group: 'tatame:a', dx: -4 });
  b.spot('tatame', 14, 7, 'right', { group: 'tatame:b', dx: 4 });
  b.spot('tatame', 17, 7, 'left', { group: 'tatame:b', dx: -4 });
  b.spot('staffpost', 21, 9, 'left', { group: 'sensei' });
  b.furn('bench', 2, 10, undefined, { order: 0.5 });
  b.furn('bench', 27, 10, undefined, { order: 0.51 });
  b.furn('plant_tall', 1, 6, 'bonsai', { order: 0.2 });
  b.furn('plant_tall', 30, 6, 'bonsai', { order: 0.21 });
  return b.build();
}

/** Sala de treino: duas fileiras de sacos de pancada e um tablado azul no chão. */
function layoutTraining(): AreaLayout {
  const b = base(DOJO_TRAIN_ID, LOOKS.treino, 920);
  sign(b, 12);
  b.wall('mirror', 2.5, undefined, { order: 0.5 });
  b.wall('mirror', 3.5, undefined, { order: 0.5 });
  b.wall('clock', 15, undefined, { order: 0.7 });
  b.rug(1.6, 3.6, 12.8, 5.6, '#2f3a66', 921);
  for (const lx of [2, 4, 9, 11, 13]) {
    b.furn('punching_bag', lx, 2, undefined, { order: 0.3 + lx * 0.001 });
    b.spot('bagpunch', lx, 3, 'up', { dy: -3 });
  }
  for (const lx of [3, 5, 10, 12]) {
    b.furn('punching_bag', lx, 5, undefined, { order: 0.4 + lx * 0.001 });
    b.spot('bagpunch', lx, 6, 'up', { dy: -3 });
  }
  b.furn('plant_tall', 14, 10, 'palm', { order: 0.2 });
  b.furn('trash_bin', 1, 10, undefined, { order: 0.6 });
  return b.build();
}

/** Arena: o ringue (borda vermelha e lona azul) com os dois lutadores e seis lugares de torcida em volta; placar na parede. */
function layoutArena(): AreaLayout {
  const b = base(DOJO_ARENA_ID, LOOKS.arena, 930);
  sign(b, 3.5);
  b.wall('tv', 11.5, undefined, { order: 0.4 });
  b.furn('trophy_case', 13, 2, undefined, { order: 0.25 });
  b.rug(4.2, 3.0, 8.6, 5.6, '#a83232', 931);
  b.rug(5, 3.7, 7, 4.2, '#3f6fb8', 932);
  b.spot('ring', 6, 5, 'right', { group: 'ring', dx: 3 });
  b.spot('ring', 9, 5, 'left', { group: 'ring', dx: -3 });
  // torcida em volta do ringue
  b.spot('ringwatch', 3, 5, 'right');
  b.spot('ringwatch', 12, 5, 'left');
  b.spot('ringwatch', 6, 3, 'down');
  b.spot('ringwatch', 9, 3, 'down');
  b.spot('ringwatch', 6, 7, 'up');
  b.spot('ringwatch', 9, 7, 'up');
  b.furn('plant_tall', 14, 5, 'ficus', { order: 0.21 });
  b.furn('plant_small', 1, 10, 'fern', { order: 0.22 });
  b.furn('floor_lamp', 14, 10, undefined, { order: 0.3 });
  return b.build();
}

let cache: AreaLayout[] | null = null;

/** As áreas do dojo (calculadas uma vez). */
export function dojoAreas(): AreaLayout[] {
  return (cache ??= [layoutMain(), layoutTraining(), layoutArena()]);
}
