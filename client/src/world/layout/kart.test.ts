import { describe, expect, it } from 'vitest';
import { assembleBuilding } from './building';
import { GRID_COLS, GRID_ROWS, KART_H, KART_ID, KART_W, KART_WALK_X, kartAreas, kartRight, kartRoad, kartTrack, kartX } from './kart';
import { MALL_DOOR_X, MALL_NAMES } from './mall';
import type { SpotKind } from './types';
import { COL_W } from '../constants';

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

describe('kartódromo', () => {
  it('fica a leste do prédio, acompanha a largura dele e tem nome', () => {
    for (const cols of [4, 6]) {
      expect(kartX(cols)).toBe(cols * COL_W + 6);
      expect(kartAreas(cols).some((a) => a.id === KART_ID)).toBe(true);
      expect(assembleBuilding(cols, []).grid.w).toBeGreaterThanOrEqual(kartRight(cols));
    }
    expect(MALL_NAMES[KART_ID]).toBeDefined();
    expect(KART_WALK_X).toBe(MALL_DOOR_X);
  });

  it('de todo lugar do prédio se chega a pé a cada lugar do kartódromo', () => {
    for (const cols of [4, 7]) {
      const b = assembleBuilding(cols, []);
      const arrival = b.spots.find((s) => s.kind === 'elevator')!;
      const ok = reachable(b.grid, arrival.tx, arrival.ty);
      const missing = b.spots.filter((s) => s.areaId.startsWith('kart:') && !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
      expect(missing).toEqual([]);
    }
  });

  it('tem três duplas de karts lado a lado, karts soltos e arquibancada para a torcida', () => {
    const b = assembleBuilding(4, []);
    const spots = (k: SpotKind) => b.spots.filter((s) => s.kind === k);
    const grid = spots('kartgrid');
    expect(grid.length).toBe(GRID_COLS.length * GRID_ROWS.length + GRID_ROWS.length);
    const pairs = new Map<string, typeof grid>();
    for (const s of grid) if (s.group) pairs.set(s.group, [...(pairs.get(s.group) ?? []), s]);
    expect(pairs.size).toBe(GRID_COLS.length);
    for (const [g, p] of pairs) {
      expect(p.length, g).toBe(2);
      expect(p[0].tx, g).toBe(p[1].tx);
    }
    expect(grid.filter((s) => !s.group).length).toBe(GRID_ROWS.length);
    expect(spots('kartwatch').length).toBeGreaterThanOrEqual(6);
  });

  it('o circuito tem curvas (não é um retângulo), é fechado e passa por cima do grid', () => {
    const road = kartRoad();
    let tiles = 0;
    let minX = KART_W;
    let maxX = 0;
    let minY = KART_H;
    let maxY = 0;
    for (let y = 0; y < KART_H; y++) for (let x = 0; x < KART_W; x++) if (road[y][x]) { tiles++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    // o asfalto ocupa bem menos que a caixa em volta (um anel em curvas), e a caixa não é quadrada de ponta a ponta
    expect(tiles).toBeLessThan((maxX - minX + 1) * (maxY - minY + 1) * 0.6);
    const t = kartTrack(4);
    expect(t.length).toBeGreaterThan(90);
    // fecha a volta: o fim está onde começou
    const a = t.at(0);
    const z = t.at(t.length);
    expect(Math.hypot(a.x - z.x, a.y - z.y)).toBeLessThan(0.01);
    // o rumo muda de verdade ao longo da volta (as quatro direções aparecem)
    const dirs = new Set<string>();
    for (let s = 0; s < t.length; s += 0.5) dirs.add(t.at(s).dir);
    expect(dirs.size).toBe(4);
    // o grid está sobre o asfalto
    for (const lx of GRID_COLS) for (const ly of GRID_ROWS) expect(road[ly][lx], `${lx},${ly}`).toBe(true);
    // freia nas curvas e acelera nos retões
    const speeds = Array.from({ length: 200 }, (_, i) => t.speedAt((i * t.length) / 200));
    expect(Math.min(...speeds)).toBeLessThan(0.8);
    expect(Math.max(...speeds)).toBeGreaterThan(0.95);
  });

  it('sem o shopping (visita a outros prédios) o kartódromo também não existe', () => {
    const b = assembleBuilding(4, [], 0, false);
    expect(b.spots.some((s) => s.areaId.startsWith('kart:'))).toBe(false);
  });
});
