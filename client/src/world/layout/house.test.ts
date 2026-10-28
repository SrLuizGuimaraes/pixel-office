import { describe, expect, it } from 'vitest';
import type { RoomTheme } from '../../art/api';
import { assembleHouse } from './building';
import { HOME_STYLES } from './home';
import { FRONT_DOOR, HOUSE_COLS, HOUSE_HALL_ID, layoutHouseExterior, layoutHouseRoom } from './house';
import { BUILDING_H, COL_W } from '../constants';
import type { AreaLayout } from './types';

const THEME = { carpet: '#4f8a5b', carpet2: '#d7c8a8', chairVariant: 'black', deskVariant: 'wood', accent: '#000', wall: { base: '#fff', trim: '#000', pattern: 'plain' } } as RoomTheme;
const rooms = (): AreaLayout[] => HOME_STYLES.map((s, i) => layoutHouseRoom(`/Casa/${s}`, s, THEME, 100 + i)!);

/** Tiles alcançáveis a pé a partir de (x, y) (assentos contam como chão: é onde se senta). */
function reachable(house: ReturnType<typeof assembleHouse>, x: number, y: number): Set<string> {
  const g = house.grid;
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

describe('planta da casa', () => {
  it('todo estilo de cômodo tem lugar na planta, dentro da caixa da casa', () => {
    for (const r of rooms()) {
      expect(r, r.id).toBeDefined();
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(HOUSE_COLS * COL_W);
      expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(BUILDING_H);
    }
    expect(layoutHouseRoom('x', 'nao-existe', THEME, 1)).toBeUndefined();
  });

  it('os cômodos não se sobrepõem', () => {
    const house = assembleHouse(rooms());
    const all = [...house.core, ...house.rooms];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].rect;
        const b = all[j].rect;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${all[i].id} x ${all[j].id}`).toBe(false);
      }
    }
  });

  it('da porta da frente se chega a pé em todos os lugares da casa', () => {
    const house = assembleHouse(rooms());
    const arrival = house.spots.find((s) => s.kind === 'elevator')!;
    expect(arrival).toBeDefined();
    expect(house.core.find((a) => a.id === HOUSE_HALL_ID)?.kind).toBe('reception');
    const ok = reachable(house, arrival.tx, arrival.ty);
    const missing = house.spots.filter((s) => !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
    expect(missing).toEqual([]);
  });

  it('cada cômodo tem lugar de trabalho e interruptor', () => {
    for (const r of rooms()) {
      const kinds = new Set(r.spots.map((s) => s.kind));
      expect(['desk', 'stool', 'nook', 'stand'].some((k) => kinds.has(k as never)), r.id).toBe(true);
      expect(kinds.has('switch'), r.id).toBe(true);
    }
  });

  it('o quintal tem o caminho da porta da frente até a rua', () => {
    const ext = layoutHouseExterior(HOUSE_COLS);
    expect(ext.floors.some((f) => f.kind === 'sidewalk' && f.x === FRONT_DOOR.x * 16)).toBe(true);
    expect(ext.lanes.length).toBe(2);
  });
});
