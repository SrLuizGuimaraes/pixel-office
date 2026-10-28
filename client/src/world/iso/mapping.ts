// Grade -> mundo da vista isométrica. No escritório é o mapeamento da vista 3D (world3d/mapping.ts: as linhas e colunas de parede
// pesam pouco). Na casa, cujos cômodos têm tamanhos diferentes, as linhas e colunas finas saem das próprias paredes
// da planta (face norte: 2 linhas; mureta sul: 1; laterais: a coluna), com os mesmos pesos.
import type { AreaLayout } from '../layout/types';
import { mapX, mapZ, type Vec3 } from '../../world3d/mapping';

const TILE = 16;
const ROW_WALL = 0.15;
const COL_WALL = 0.2;
const MAX = 400;

interface GridMap {
  x(g: number): number;
  z(t: number): number;
}

const OFFICE: GridMap = { x: mapX, z: mapZ };
let current: GridMap = OFFICE;

function prefixMap(weights: Float64Array): (v: number) => number {
  const pre = new Float64Array(MAX + 1);
  for (let i = 0; i < MAX; i++) pre[i + 1] = pre[i] + weights[i];
  return (v) => {
    if (v <= 0) return v;
    const i = Math.floor(v);
    if (i >= MAX) return pre[MAX] + (v - MAX);
    return pre[i] + (v - i) * weights[i];
  };
}

/** Passa a usar o mapeamento da casa: linhas e colunas de parede finas, pelas paredes das áreas dadas. */
export function useHouseMapping(areas: readonly AreaLayout[]): void {
  const rows = new Float64Array(MAX).fill(1);
  const cols = new Float64Array(MAX).fill(1);
  for (const a of areas) {
    for (const w of a.walls) {
      if (w.kind === 'cap') {
        const c = Math.floor(w.x / TILE + 1e-6);
        if (c >= 0 && c < MAX) cols[c] = COL_WALL;
      } else {
        const r = Math.floor(w.y / TILE + 1e-6);
        const n = w.kind === 'face' ? 2 : 1;
        for (let k = 0; k < n; k++) if (r + k >= 0 && r + k < MAX) rows[r + k] = ROW_WALL;
      }
    }
  }
  current = { x: prefixMap(cols), z: prefixMap(rows) };
}

export function useOfficeMapping(): void {
  current = OFFICE;
}

/** X (contínuo) do mundo de uma coluna da grade. */
export const gx = (g: number): number => current.x(g);
/** Z (contínuo) do mundo de uma linha da grade. */
export const gz = (t: number): number => current.z(t);

/** Posição (pés) de um ponto da grade (tiles contínuos; o centro do tile é +0,5). */
export function toW(g: number, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = current.x(g);
  out.y = 0;
  out.z = current.z(t);
  return out;
}

/** Posição de um personagem a partir da posição de pés em px do mundo. */
export function footW(px: number, py: number, out?: Vec3): Vec3 {
  return toW(px / TILE, (py - 11) / TILE + 0.5, out);
}
