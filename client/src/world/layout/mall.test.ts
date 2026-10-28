import { describe, expect, it } from 'vitest';
import { BUILDING_H } from '../constants';
import { assembleBuilding } from './building';
import { LOUNGE_ID } from './core';
import { MALL_BOTTOM, MALL_DOOR_X, MALL_ENTRY_ID, MALL_NAMES, MALL_PATH_Y0, MALL_PATH_Y1, MALL_RECT, MALL_Y, mallAreas } from './mall';
import type { SpotKind } from './types';

/** Tiles alcançáveis a pé a partir de (x, y) (assentos contam como chão: é onde se senta). */
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

describe('shopping do outro lado da rua', () => {
  it('fica depois da rua, dentro da largura do prédio mais estreito, e as áreas não se sobrepõem', () => {
    expect(MALL_Y).toBeGreaterThan(BUILDING_H + 10);
    const b = assembleBuilding(4, []);
    expect(b.mall).toBe(true);
    expect(b.grid.h).toBe(MALL_BOTTOM);
    const all = [...b.core].filter((a) => a.rect.w > 0 && a.id.startsWith('mall:') && a.id !== 'mall:caminho');
    expect(all.length).toBe(9);
    for (const a of all) {
      expect(a.rect.x).toBeGreaterThanOrEqual(MALL_RECT.x);
      expect(a.rect.x + a.rect.w).toBeLessThanOrEqual(MALL_RECT.x + MALL_RECT.w);
      expect(a.rect.y).toBeGreaterThanOrEqual(MALL_Y);
      expect(a.rect.y + a.rect.h).toBeLessThanOrEqual(MALL_BOTTOM);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const p = all[i].rect;
        const q = all[j].rect;
        expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h, `${all[i].id} x ${all[j].id}`).toBe(false);
      }
    }
    // cobre o shopping inteiro (sem buracos entre as lojas)
    expect(all.reduce((s, a) => s + a.rect.w * a.rect.h, 0)).toBe(MALL_RECT.w * MALL_RECT.h);
  });

  it('todo lugar do shopping é alcançável a pé a partir da recepção do prédio (pelo lounge, a rua e a porta do átrio)', () => {
    const b = assembleBuilding(4, []);
    const arrival = b.spots.find((s) => s.kind === 'elevator')!;
    const ok = reachable(b.grid, arrival.tx, arrival.ty);
    const missing = b.spots.filter((s) => !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
    expect(missing).toEqual([]);
    // o caminho da porta sul do lounge até a porta do átrio é contínuo
    for (let y = MALL_PATH_Y0; y <= MALL_PATH_Y1 + 2; y++) for (const x of [MALL_DOOR_X, MALL_DOOR_X + 1]) expect(b.grid.walkable(x, y), `(${x},${y})`).toBe(true);
    expect(b.core.find((a) => a.id === LOUNGE_ID)?.walkable.some((r) => r.y + r.h > BUILDING_H - 1)).toBe(true);
  });

  it('tem áreas de jogos, praça de alimentação, lojas de roupas e de games, academia e cinema, com lugares para cada uso', () => {
    const b = assembleBuilding(4, []);
    const count = (k: SpotKind) => b.spots.filter((s) => s.kind === k && s.areaId.startsWith('mall:')).length;
    for (const [kind, min] of [['shop', 8], ['tryon', 2], ['gamestore', 4], ['demo', 4], ['gym', 4], ['mat', 3], ['foodcounter', 4], ['foodseat', 10], ['play', 12], ['cinema', 20]] as const) {
      expect(count(kind), kind).toBeGreaterThanOrEqual(min);
    }
    const ids = new Set(mallAreas().map((a) => a.id));
    // o kartódromo (kart:pista) depende da largura do prédio e vem de layout/kart.ts, não de mallAreas()
    for (const id of Object.keys(MALL_NAMES)) if (id !== 'kart:pista') expect(ids.has(id), id).toBe(true);
    expect(ids.has(MALL_ENTRY_ID)).toBe(true);
  });

  it('as lojas de roupas, de games, a academia e a praça não repetem o nome e todos têm placa com texto', () => {
    expect(new Set(Object.values(MALL_NAMES)).size).toBe(Object.values(MALL_NAMES).length);
    // o caminho de rua e a quadra (área aberta, sem parede) não têm placa
    for (const a of mallAreas()) if (a.id !== 'mall:caminho' && a.id !== 'club:quadra') expect(a.signId, a.id).toBeDefined();
  });

  it('sem o shopping (visita a outros prédios), a grade e o prédio ficam como sempre', () => {
    const b = assembleBuilding(4, [], 0, false);
    expect(b.mall).toBeUndefined();
    expect(b.grid.h).toBe(BUILDING_H);
    expect(b.core.some((a) => a.id.startsWith('mall:'))).toBe(false);
    expect(b.spots.some((s) => s.areaId.startsWith('mall:'))).toBe(false);
  });
});
