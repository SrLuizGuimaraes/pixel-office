// Projeção isométrica 2:1 (a do hotel retrô) da vista isométrica (?escritorio=iso). Puro (sem DOM nem three), para testar.
//
// O mundo é o mesmo da vista 3D (world3d/mapping.ts): X para leste, Y para cima, Z para o sul, em tiles. Cada tile vira um
// losango de 64x32 px na tela (zoom 1); um tile de altura vale ALTURA_PX px. A câmera olha do sudeste para o noroeste:
// quem tem X+Z maior fica mais perto (mais embaixo na tela). Os 4 giros de 90° giram o mundo em torno da origem
// (u, v) = (z, -x) a cada passo, a mesma conta de `Object3D.rotation.y = rot * π/2` no three, então o sprite assado de um
// modelo girado bate com a planta girada.

/** Meia largura e meia altura do losango de um tile (px, zoom 1). */
export const HALF_W = 32;
export const HALF_H = 16;
/** Pixels de tela por tile de altura (a escala dos dois eixos do chão, 32·√2, vezes o cosseno de 30°). */
export const HEIGHT_PX = 32 * Math.SQRT2 * Math.cos(Math.PI / 6);
/** Pixels de tela por unidade do mundo na escala dos sprites assados (a câmera ortográfica do bake). */
export const SPRITE_SCALE = 32 * Math.SQRT2;

export type Rot = 0 | 1 | 2 | 3;

/** Gira (x, z) `rot` passos de 90° (u = z, v = -x a cada passo). */
export function rotateXZ(x: number, z: number, rot: Rot, out: { u: number; v: number } = { u: 0, v: 0 }): { u: number; v: number } {
  let u = x;
  let v = z;
  for (let i = 0; i < rot; i++) {
    const nu = v;
    v = -u;
    u = nu;
  }
  out.u = u;
  out.v = v;
  return out;
}

/** O inverso de rotateXZ: do espaço girado (u, v) de volta para o mundo (x, z). */
export function unrotateXZ(u: number, v: number, rot: Rot, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  let x = u;
  let z = v;
  for (let i = 0; i < rot; i++) {
    const nx = -z;
    z = x;
    x = nx;
  }
  out.x = x;
  out.z = z;
  return out;
}

/** Onde a câmera está: giro, zoom (px por px do zoom 1), o ponto do mundo no meio da área livre e a área livre. */
export interface IsoView {
  rot: Rot;
  zoom: number;
  /** Ponto (X, Z) do mundo que fica em (cx, cy) na tela. */
  focusX: number;
  focusZ: number;
  cx: number;
  cy: number;
}

export interface Px {
  x: number;
  y: number;
}

/** Posição "crua" na tela (zoom 1, antes de centrar) de um ponto do mundo, já com o giro. */
export function rawX(x: number, z: number, rot: Rot): number {
  const { u, v } = rotateXZ(x, z, rot);
  return (u - v) * HALF_W;
}

export function rawY(x: number, y: number, z: number, rot: Rot): number {
  const { u, v } = rotateXZ(x, z, rot);
  return (u + v) * HALF_H - y * HEIGHT_PX;
}

/** Ponto do mundo -> pixel da tela. */
export function toScreen(view: IsoView, x: number, y: number, z: number, out: Px = { x: 0, y: 0 }): Px {
  const { rot, zoom } = view;
  out.x = view.cx + (rawX(x, z, rot) - rawX(view.focusX, view.focusZ, rot)) * zoom;
  out.y = view.cy + (rawY(x, y, z, rot) - rawY(view.focusX, 0, view.focusZ, rot)) * zoom;
  return out;
}

/** Pixel da tela -> ponto do mundo na altura `y` (o chão, por padrão). */
export function toWorld(view: IsoView, sx: number, sy: number, y = 0, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const { rot, zoom } = view;
  const rx = (sx - view.cx) / zoom + rawX(view.focusX, view.focusZ, rot);
  const ry = (sy - view.cy) / zoom + rawY(view.focusX, 0, view.focusZ, rot) + y * HEIGHT_PX;
  // rx = (u - v)·32, ry = (u + v)·16
  const a = rx / HALF_W;
  const b = ry / HALF_H;
  return unrotateXZ((a + b) / 2, (b - a) / 2, rot, out);
}

/** Retângulo (xmin, xmax, zmin, zmax) do mundo visto no espaço girado: os limites (u0..u1, v0..v1). */
export function rotateRect(x0: number, x1: number, z0: number, z1: number, rot: Rot): { u0: number; u1: number; v0: number; v1: number } {
  const a = rotateXZ(x0, z0, rot);
  const b = rotateXZ(x1, z1, rot);
  return { u0: Math.min(a.u, b.u), u1: Math.max(a.u, b.u), v0: Math.min(a.v, b.v), v1: Math.max(a.v, b.v) };
}

/** Direção de uma face do mundo (normal em X/Z) está virada para a câmera? */
export function facesCamera(nx: number, nz: number, rot: Rot): boolean {
  const { u, v } = rotateXZ(nx, nz, rot);
  return u + v > 1e-6;
}
