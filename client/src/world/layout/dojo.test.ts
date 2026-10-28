import { describe, expect, it } from 'vitest';
import { assembleBuilding } from './building';
import { DOJO_ARENA_ID, DOJO_BOTTOM, DOJO_DOOR_X, DOJO_MAIN_ID, DOJO_RECT, DOJO_RIGHT, DOJO_TRAIN_ID, dojoAreas } from './dojo';
import { MALL_BOTTOM, MALL_EXT_W, MALL_NAMES, MALL_RECT } from './mall';
import type { SpotKind } from './types';

function reachable(g: ReturnType<typeof assembleBuilding>['grid'], x: number, y: number): Set<string> {
  const seen = new Set<string>([`${x},${y}`]);
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || nx < 0 || ny < 0 || nx >= g.w || ny >= g.h || g.get(nx, ny) === 0) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('dojo ao lado do shopping', () => {
  it('fica a leste do shopping, na mesma fileira, dentro do terreno, sem sobrepor o shopping', () => {
    expect(DOJO_RECT.x).toBe(MALL_RECT.x + MALL_RECT.w);
    expect(DOJO_RECT.y).toBe(MALL_RECT.y);
    expect(DOJO_BOTTOM).toBeLessThanOrEqual(MALL_BOTTOM);
    expect(MALL_EXT_W).toBeGreaterThanOrEqual(DOJO_RIGHT);
    const areas = dojoAreas();
    expect(areas.map((a) => a.id).sort()).toEqual([DOJO_ARENA_ID, DOJO_MAIN_ID, DOJO_TRAIN_ID].sort());
    for (const a of areas) {
      expect(a.rect.x, a.id).toBeGreaterThanOrEqual(DOJO_RECT.x);
      expect(a.rect.x + a.rect.w, a.id).toBeLessThanOrEqual(DOJO_RIGHT);
      expect(a.signId, a.id).toBeDefined();
      expect(MALL_NAMES[a.id], a.id).toBeDefined();
    }
    expect(areas.reduce((s, a) => s + a.rect.w * a.rect.h, 0)).toBe(DOJO_RECT.w * DOJO_RECT.h);
  });

  it('a grade vai até o dojo e da recepção do prédio se chega a pé a todos os lugares dele (rua, calçada e a porta do salão)', () => {
    const b = assembleBuilding(4, []);
    expect(b.grid.w).toBeGreaterThanOrEqual(DOJO_RIGHT);
    const arrival = b.spots.find((s) => s.kind === 'elevator')!;
    const ok = reachable(b.grid, arrival.tx, arrival.ty);
    const missing = b.spots.filter((s) => !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
    expect(missing).toEqual([]);
    // a porta da rua do salão e o caminho até ela pela calçada
    expect(ok.has(`${DOJO_DOOR_X},${DOJO_RECT.y}`)).toBe(true);
    expect(ok.has(`${DOJO_DOOR_X},${DOJO_RECT.y - 1}`)).toBe(true);
  });

  it('tem tatame para treinar em dupla, ringue com torcida e sacos de pancada, cada dupla com os dois lugares frente a frente', () => {
    const b = assembleBuilding(4, []);
    const spots = (k: SpotKind) => b.spots.filter((s) => s.kind === k);
    for (const kind of ['tatame', 'ring'] as const) {
      const groups = new Map<string, typeof b.spots>();
      for (const s of spots(kind)) groups.set(s.group ?? '', [...(groups.get(s.group ?? '') ?? []), s]);
      expect(groups.size, kind).toBeGreaterThan(0);
      for (const [id, g] of groups) {
        expect(id, kind).not.toBe('');
        expect(g.length, `${kind}:${id}`).toBe(2);
        expect(g[0].ty, `${kind}:${id}`).toBe(g[1].ty);
        expect(new Set(g.map((s) => s.dir)), `${kind}:${id}`).toEqual(new Set(['left', 'right']));
      }
    }
    expect(spots('ringwatch').length).toBeGreaterThanOrEqual(4);
    expect(spots('bagpunch').length).toBeGreaterThanOrEqual(6);
  });

  it('sem o shopping (visita a outros prédios) o dojo também não existe', () => {
    const b = assembleBuilding(4, [], 0, false);
    expect(b.spots.some((s) => s.areaId.startsWith('dojo:'))).toBe(false);
    expect(b.grid.w).toBe(64);
  });
});
