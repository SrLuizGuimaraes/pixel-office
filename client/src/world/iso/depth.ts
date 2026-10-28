// Ordem de desenho (algoritmo do pintor) da vista isométrica. Puro, para testar.
//
// Cada coisa é uma caixa alinhada aos eixos no espaço girado da câmera (u0..u1, v0..v1, y0..y1). A câmera fica no lado de
// u e v maiores, então uma caixa que termina antes de a outra começar em u ou em v está atrás dela e é desenhada antes.
// Caixas que se cruzam nos dois eixos (um monitor sobre a mesa) desempatam pela altura e depois pelo centro.
import type { Rot } from './projection';
import { rotateRect } from './projection';

export interface DepthBox {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  y0: number;
  y1: number;
  /** Retângulo ocupado na tela (qualquer unidade comum): só quem se sobrepõe na tela precisa de ordem. */
  sx0: number;
  sx1: number;
  sy0: number;
  sy1: number;
}

const EPS = 1e-4;

/** A caixa `b` está atrás de `a` (tem de ser desenhada antes)? */
export function isBehind(b: DepthBox, a: DepthBox): boolean {
  const sepUba = b.u1 <= a.u0 + EPS;
  const sepVba = b.v1 <= a.v0 + EPS;
  const sepUab = a.u1 <= b.u0 + EPS;
  const sepVab = a.v1 <= b.v0 + EPS;
  const bBehind = sepUba || sepVba;
  const aBehind = sepUab || sepVab;
  if (bBehind && !aBehind) return true;
  if (aBehind && !bBehind) return false;
  if (bBehind && aBehind) return false; // lado a lado na tela: a ordem não importa
  // as caixas se cruzam: a de baixo vai antes; empatando, a de menor u+v
  if (b.y1 <= a.y0 + EPS) return true;
  if (a.y1 <= b.y0 + EPS) return false;
  return b.u0 + b.u1 + b.v0 + b.v1 < a.u0 + a.u1 + a.v0 + a.v1;
}

export function screenOverlap(a: DepthBox, b: DepthBox): boolean {
  return a.sx0 < b.sx1 && b.sx0 < a.sx1 && a.sy0 < b.sy1 && b.sy0 < a.sy1;
}

/** Ordena do fundo para a frente (ordenação topológica; ciclos, se houver, são quebrados sem travar). */
export function sortBoxes<T extends DepthBox>(items: readonly T[]): T[] {
  const n = items.length;
  const order = items.map((_, i) => i).sort((p, q) => {
    const a = items[p];
    const b = items[q];
    return a.u0 + a.u1 + a.v0 + a.v1 - (b.u0 + b.u1 + b.v0 + b.v1) || a.y0 - b.y0;
  });
  const state = new Uint8Array(n);
  const out: T[] = [];
  // pilha explícita (milhares de itens estourariam a recursão)
  for (const root of order) {
    if (state[root]) continue;
    const stack: { i: number; k: number }[] = [{ i: root, k: 0 }];
    state[root] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      let pushed = false;
      while (top.k < n) {
        const j = order[top.k++];
        if (state[j] || j === top.i) continue;
        if (!screenOverlap(items[j], items[top.i])) continue;
        if (!isBehind(items[j], items[top.i])) continue;
        state[j] = 1;
        stack.push({ i: j, k: 0 });
        pushed = true;
        break;
      }
      if (!pushed) {
        out.push(items[top.i]);
        stack.pop();
      }
    }
  }
  return out;
}

/**
 * Onde um item móvel (personagem) entra numa lista já ordenada: logo depois do último que está atrás dele.
 * Devolve o índice de inserção (0..n).
 */
export function insertionIndex(sorted: readonly DepthBox[], c: DepthBox): number {
  let p = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = sorted[i];
    if (!screenOverlap(s, c)) continue;
    if (isBehind(s, c)) {
      p = i + 1;
      break;
    }
  }
  return p;
}

/** Monta a caixa de profundidade de um retângulo do mundo (x0..x1, z0..z1) de altura y0..y1 vista com o giro `rot`. */
export function boxOf(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, rot: Rot, screen: { sx0: number; sx1: number; sy0: number; sy1: number }): DepthBox {
  const r = rotateRect(x0, x1, z0, z1, rot);
  return { ...r, y0, y1, ...screen };
}
