import { describe, expect, it } from 'vitest';
import { boxOf, insertionIndex, isBehind, sortBoxes, type DepthBox } from './depth';
import { HALF_H, HALF_W, HEIGHT_PX, facesCamera, rotateRect, rotateXZ, toScreen, toWorld, unrotateXZ, type IsoView, type Rot } from './projection';

const ROTS: Rot[] = [0, 1, 2, 3];
const view = (rot: Rot): IsoView => ({ rot, zoom: 0.8, focusX: 30, focusZ: 14, cx: 640, cy: 360 });

describe('projeção isométrica 2:1', () => {
  it('um tile vira um losango de 64x32 px', () => {
    const v: IsoView = { rot: 0, zoom: 1, focusX: 0, focusZ: 0, cx: 0, cy: 0 };
    const a = toScreen(v, 0, 0, 0);
    const b = toScreen(v, 1, 0, 0);
    const c = toScreen(v, 0, 0, 1);
    expect([b.x - a.x, b.y - a.y]).toEqual([HALF_W, HALF_H]);
    expect([c.x - a.x, c.y - a.y]).toEqual([-HALF_W, HALF_H]);
  });

  it('altura sobe na tela; o foco fica no centro', () => {
    const v = view(0);
    const f = toScreen(v, v.focusX, 0, v.focusZ);
    expect([f.x, f.y]).toEqual([640, 360]);
    const up = toScreen(v, v.focusX, 1, v.focusZ);
    expect(f.y - up.y).toBeCloseTo(HEIGHT_PX * 0.8, 6);
  });

  it('ida e volta grade <-> tela nos 4 giros', () => {
    for (const rot of ROTS) {
      const v = view(rot);
      for (const [x, z] of [[0, 0], [12.5, 3.25], [60, 40], [-5, 22]]) {
        const p = toScreen(v, x, 0, z);
        const w = toWorld(v, p.x, p.y);
        expect(w.x).toBeCloseTo(x, 6);
        expect(w.z).toBeCloseTo(z, 6);
      }
    }
  });

  it('ida e volta numa altura diferente do chão', () => {
    const v = view(2);
    const p = toScreen(v, 8, 1.9, 5);
    const w = toWorld(v, p.x, p.y, 1.9);
    expect([w.x, w.z].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([8, 5]);
  });

  it('rotateXZ e unrotateXZ são inversos e 4 giros voltam ao início', () => {
    for (const rot of ROTS) {
      const r = rotateXZ(3, 7, rot);
      const b = unrotateXZ(r.u, r.v, rot);
      expect([b.x, b.z]).toEqual([3, 7]);
    }
    const r4 = rotateXZ(3, 7, 3);
    const r5 = rotateXZ(r4.u, r4.v, 1);
    expect([r5.u, r5.v]).toEqual([3, 7]);
  });

  it('girar a vista move a câmera em torno do foco (ele continua no centro)', () => {
    for (const rot of ROTS) {
      const v = view(rot);
      const f = toScreen(v, v.focusX, 0, v.focusZ);
      expect([f.x, f.y]).toEqual([640, 360]);
    }
  });

  it('o retângulo girado cobre o mesmo espaço', () => {
    const r = rotateRect(2, 5, 1, 2, 1);
    expect([r.u1 - r.u0, r.v1 - r.v0]).toEqual([1, 3]);
  });

  it('as faces voltadas para a câmera mudam com o giro', () => {
    expect(facesCamera(0, 1, 0)).toBe(true); // face sul
    expect(facesCamera(0, -1, 0)).toBe(false);
    expect(facesCamera(1, 0, 0)).toBe(true); // face leste
    expect(facesCamera(0, 1, 2)).toBe(false);
    expect(facesCamera(0, -1, 2)).toBe(true);
  });
});

const box = (x0: number, x1: number, z0: number, z1: number, h: number, rot: Rot): DepthBox => {
  const v = view(rot);
  const ps = [toScreen(v, x0, 0, z0), toScreen(v, x1, 0, z0), toScreen(v, x0, 0, z1), toScreen(v, x1, 0, z1), toScreen(v, x0, h, z0), toScreen(v, x1, h, z1)];
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return boxOf(x0, x1, z0, z1, 0, h, rot, { sx0: Math.min(...xs), sx1: Math.max(...xs), sy0: Math.min(...ys), sy1: Math.max(...ys) });
};

describe('ordem de profundidade', () => {
  it('quem está ao norte/oeste vem antes, e o giro inverte a ordem', () => {
    const north = (rot: Rot) => box(10, 11, 4, 5, 1, rot);
    const south = (rot: Rot) => box(10, 11, 6, 7, 1, rot);
    expect(isBehind(north(0), south(0))).toBe(true);
    expect(isBehind(south(0), north(0))).toBe(false);
    expect(isBehind(north(2), south(2))).toBe(false);
    expect(isBehind(south(2), north(2))).toBe(true);
  });

  it('uma parede longa e fina fica atrás do que está na frente dela e na frente do que está atrás, em qualquer giro', () => {
    for (const rot of ROTS) {
      const wall = box(0, 20, 10, 10.15, 3, rot);
      const before = box(8, 9, 8, 9, 1.5, rot); // ao norte da parede
      const after = box(8, 9, 11, 12, 1.5, rot); // ao sul
      const sorted = sortBoxes([after, wall, before]);
      const iw = sorted.indexOf(wall);
      const ia = sorted.indexOf(after);
      const ib = sorted.indexOf(before);
      if (rot === 0) {
        expect(ib).toBeLessThan(iw);
        expect(iw).toBeLessThan(ia);
      } else if (rot === 2) {
        expect(ia).toBeLessThan(iw);
        expect(iw).toBeLessThan(ib);
      }
      expect(sorted).toHaveLength(3);
    }
  });

  it('ordenar uma grade de caixas respeita todas as relações "atrás de"', () => {
    for (const rot of ROTS) {
      const items: DepthBox[] = [];
      for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) items.push(box(x * 2, x * 2 + 1.2, z * 2, z * 2 + 1.2, 2, rot));
      const shuffled = [...items].sort((a, b) => ((a.u0 * 7919 + a.v0 * 104729) % 13) - ((b.u0 * 7919 + b.v0 * 104729) % 13));
      const sorted = sortBoxes(shuffled);
      const idx = new Map(sorted.map((b, i) => [b, i]));
      for (const a of items) for (const b of items) {
        if (a !== b && a.sx0 < b.sx1 && b.sx0 < a.sx1 && a.sy0 < b.sy1 && b.sy0 < a.sy1 && isBehind(a, b)) expect(idx.get(a)!).toBeLessThan(idx.get(b)!);
      }
    }
  });

  it('um personagem entra depois do que está atrás dele e antes do que está na frente', () => {
    const rot: Rot = 0;
    const back = box(5, 6, 5, 6, 1, rot);
    const front = box(5, 6, 6.8, 8, 1, rot);
    const sorted = sortBoxes([front, back]);
    const char = box(5.3, 5.7, 6.1, 6.5, 1.9, rot);
    const at = insertionIndex(sorted, char);
    expect(at).toBe(sorted.indexOf(back) + 1);
    expect(at).toBeLessThanOrEqual(sorted.indexOf(front));
  });
});
