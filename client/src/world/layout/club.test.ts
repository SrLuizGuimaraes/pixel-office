import { describe, expect, it } from 'vitest';
import { assembleBuilding } from './building';
import { CLUB_BOTTOM, CLUB_DOOR_X, CLUB_QUADRA_ID, CLUB_RIGHT, CLUB_TIRO_ID, CLUB_X, LANES, clubAreas } from './club';
import { DOJO_RIGHT } from './dojo';
import { MALL_BOTTOM, MALL_EXT_W, MALL_NAMES } from './mall';
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

describe('clube de tiro e quadra de futebol', () => {
  it('ficam a leste do dojo, dentro do terreno, com nome e placa', () => {
    expect(CLUB_X).toBe(DOJO_RIGHT);
    expect(MALL_EXT_W).toBe(CLUB_RIGHT);
    expect(CLUB_BOTTOM).toBeGreaterThan(MALL_BOTTOM - 1);
    const ids = clubAreas().map((a) => a.id).sort();
    expect(ids).toEqual([CLUB_QUADRA_ID, CLUB_TIRO_ID].sort());
    for (const id of ids) expect(MALL_NAMES[id], id).toBeDefined();
    expect(clubAreas().find((a) => a.id === CLUB_TIRO_ID)?.signId).toBeDefined();
    const tiro = clubAreas().find((a) => a.id === CLUB_TIRO_ID)!;
    const quadra = clubAreas().find((a) => a.id === CLUB_QUADRA_ID)!;
    expect(tiro.rect.y + tiro.rect.h).toBe(quadra.rect.y);
  });

  it('a grade vai até o fim do clube e de todo lugar do prédio se chega a pé a cada lugar dele (rua, dojo e quadra)', () => {
    const b = assembleBuilding(4, []);
    expect(b.grid.w).toBeGreaterThanOrEqual(CLUB_RIGHT);
    expect(b.grid.h).toBeGreaterThanOrEqual(CLUB_BOTTOM);
    const arrival = b.spots.find((s) => s.kind === 'elevator')!;
    const ok = reachable(b.grid, arrival.tx, arrival.ty);
    const missing = b.spots.filter((s) => !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
    expect(missing).toEqual([]);
    expect(ok.has(`${CLUB_DOOR_X},${clubAreas()[0].rect.y}`)).toBe(true);
  });

  it('tem raias de tiro com duplas vizinhas e torcida, e a quadra tem dois gols com pênalti, bancos e lugares para bater bola', () => {
    const b = assembleBuilding(4, []);
    const spots = (k: SpotKind) => b.spots.filter((s) => s.kind === k);
    expect(spots('shootlane').length).toBe(LANES.length);
    const pairs = new Map<string, typeof b.spots>();
    for (const s of spots('shootlane')) if (s.group) pairs.set(s.group, [...(pairs.get(s.group) ?? []), s]);
    expect(pairs.size).toBeGreaterThanOrEqual(3);
    for (const [g, p] of pairs) {
      expect(p.length, g).toBe(2);
      expect(p[0].ty, g).toBe(p[1].ty);
      expect(Math.abs(p[0].tx - p[1].tx), g).toBe(2);
    }
    expect(spots('shootwatch').length).toBeGreaterThanOrEqual(4);
    const pen = new Map<string, typeof b.spots>();
    for (const s of spots('penalty')) pen.set(s.group ?? '', [...(pen.get(s.group ?? '') ?? []), s]);
    expect(pen.size).toBe(2);
    for (const [g, p] of pen) {
      expect(p.length, g).toBe(2);
      expect(p[0].ty, g).toBe(p[1].ty);
      expect(new Set(p.map((s) => s.dir)), g).toEqual(new Set(['left', 'right']));
    }
    expect(spots('fieldwatch').length).toBeGreaterThanOrEqual(8);
    expect(spots('kickabout').length).toBeGreaterThanOrEqual(3);
  });

  it('sem o shopping (visita a outros prédios) o clube também não existe', () => {
    const b = assembleBuilding(4, [], 0, false);
    expect(b.spots.some((s) => s.areaId.startsWith('club:'))).toBe(false);
  });
});
