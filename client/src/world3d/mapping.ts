// Da grade 2D do escritório (a mesma planta da vista 2D, com o shopping do outro lado da rua) para o espaço 3D da vista 3D.
// Puro (sem three), para testar.
//
// Eixos 3D (em tiles): X para leste, Y para cima, Z para o sul (a mesma direção do eixo y da grade). A planta é a mesma
// da vista 2D; só que lá as paredes ocupam faixas inteiras de tiles (a "face" da parede norte tem 2 linhas, a mureta sul
// 1 linha, as paredes laterais meia coluna de cada cômodo). Aqui essas faixas viram paredes finas (as linhas e colunas de
// parede pesam pouco em vez de 1) e o piso dos cômodos fica em escala 1:1. O mapeamento é contínuo e crescente, então
// quem anda na grade anda em 3D sem saltos.
import { BUILDING_H, COL_W, ROOM_H } from '../world/constants';
import { MALL_BOTTOM, MALL_Y } from '../world/layout/mall';

/** Altura das paredes (em tiles; um personagem tem uns 1,9). */
export const WALL_H = 3.0;
/** Espessura de uma linha de parede e a de uma coluna de meia parede (fração do tile). */
const ROW_WALL = 0.15;
const COL_WALL = 0.2;

/** Linhas de parede do prédio: a face norte das salas do norte (0-1), a mureta sul delas (11), a face das salas do sul (17-18) e a mureta sul delas (28). */
const BUILDING_WALL_ROWS = new Set([0, 1, ROOM_H - 1, ROOM_H + 5, ROOM_H + 6, BUILDING_H - 1]);

/** Peso (espessura 3D) de uma linha da grade. */
export function rowWeight(r: number): number {
  if (r < 0) return 1;
  if (r < BUILDING_H) return BUILDING_WALL_ROWS.has(r) ? ROW_WALL : 1;
  if (r < MALL_Y || r >= MALL_BOTTOM) return 1;
  // o shopping: faixas de 12 linhas (face nas duas primeiras, mureta na última), como as salas do prédio
  const k = (r - MALL_Y) % ROOM_H;
  return k === 0 || k === 1 || k === ROOM_H - 1 ? ROW_WALL : 1;
}

/** Peso (espessura 3D) de uma coluna: as meias paredes (colunas 0 e 15 de cada coluna de salas) pesam pouco. */
export function colWeight(c: number): number {
  if (c < 0) return 1;
  const k = c % COL_W;
  return k === 0 || k === COL_W - 1 ? COL_WALL : 1;
}

const MAX_ROWS = MALL_BOTTOM + 80;
const rowPrefix = new Float64Array(MAX_ROWS + 1);
for (let r = 0; r < MAX_ROWS; r++) rowPrefix[r + 1] = rowPrefix[r] + rowWeight(r);

/** Soma dos pesos das colunas [0, i) (períodos de COL_W colunas). */
function colPrefix(i: number): number {
  const periods = Math.floor(i / COL_W);
  const rem = i - periods * COL_W;
  let sum = periods * (COL_W - 2 + 2 * COL_WALL);
  if (rem >= 1) sum += COL_WALL + Math.min(rem, COL_W - 1) - 1;
  if (rem > COL_W - 1) sum += COL_WALL;
  return sum;
}

/** X 3D de uma coluna (contínua) da grade. */
export function mapX(gx: number): number {
  if (gx <= 0) return gx;
  const i = Math.floor(gx);
  return colPrefix(i) + (gx - i) * colWeight(i);
}

/** Z 3D de uma linha (contínua) da grade. */
export function mapZ(ty: number): number {
  if (ty <= 0) return ty;
  const i = Math.floor(ty);
  if (i >= MAX_ROWS) return rowPrefix[MAX_ROWS] + (ty - MAX_ROWS);
  return rowPrefix[i] + (ty - i) * rowWeight(i);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Posição 3D (pés) de um ponto da grade: `gx` e `ty` contínuos, em tiles (o centro do tile é +0,5). */
export function toWorld3(gx: number, ty: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = mapX(gx);
  out.y = 0;
  out.z = mapZ(ty);
  return out;
}

/** Posição 3D (pés) de um personagem a partir da posição de pés em px do mundo (ch.x, ch.y). */
export function footToWorld3(px: number, py: number, tile = 16, footDy = 11, out?: Vec3): Vec3 {
  return toWorld3(px / tile, (py - footDy) / tile + 0.5, out);
}
