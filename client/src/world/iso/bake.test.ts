import { describe, expect, it } from 'vitest';
import { FURNITURE, type FurnitureKind } from '../../art/api';
import { buildFurniture, furnitureFacing, YAW } from '../../world3d/furniture3d';
import { projectedBounds, bakePainter, frameOf, POSE_FRAMES } from './bake';
import type { Rot } from './projection';

const ROTS: Rot[] = [0, 1, 2, 3];

describe('bake isométrico dos móveis', () => {
  it('todo móvel de chão do catálogo vira um sprite com tamanho finito nas 4 rotações', () => {
    const bad: string[] = [];
    for (const kind of Object.keys(FURNITURE) as FurnitureKind[]) {
      const def = FURNITURE[kind];
      if (def.mount !== 'floor') continue;
      for (const rot of ROTS) {
        const m = buildFurniture(kind, undefined, 3, bakePainter, def.footprint.w, def.footprint.h);
        m.rotation.y = YAW[furnitureFacing(kind, undefined)];
        const b = projectedBounds(m, (rot * Math.PI) / 2);
        if (!b || !Number.isFinite(b.x0) || b.x1 - b.x0 < 4 || b.y1 - b.y0 < 4 || b.x1 - b.x0 > 900 || b.y1 - b.y0 > 600) bad.push(`${kind}@${rot}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('girar a vista não muda a altura do modelo, só a largura que ele ocupa', () => {
    const m = buildFurniture('desk', 'wood', 1, bakePainter, 2, 1);
    const a = projectedBounds(m, 0)!;
    const b = projectedBounds(m, Math.PI / 2)!;
    expect(a.y0).toBeLessThan(0);
    expect(Math.abs(a.x1 - a.x0)).toBeGreaterThan(0);
    expect(Math.abs(b.x1 - b.x0)).toBeGreaterThan(0);
  });
});

describe('quadros de animação dos personagens', () => {
  it('poses sem ciclo têm um quadro só e as com ciclo andam por todos', () => {
    expect(frameOf('sleep', 12345, 0)).toBe(0);
    const f = POSE_FRAMES.walk!;
    const seen = new Set<number>();
    for (let t = 0; t < f.ms; t += 10) seen.add(frameOf('walk', t, 0));
    expect(seen.size).toBe(f.n);
    expect(frameOf('walk', 0, 0)).toBe(frameOf('walk', f.ms, 0));
  });
});
