import { describe, expect, it } from 'vitest';
import type { RoomTheme } from '../../art/api';
import { COL_W } from '../constants';
import { assembleTower } from './building';
import { FLOOR_H, floorOf, floorTop, layoutTowerExterior, layoutTowerRoom, TOWER_FLOORS, TOWER_FRONT_DOOR, TOWER_H, TOWER_HALL_ID, TOWER_SLOTS, TOWER_W, towerSlot } from './tower';
import type { AreaLayout } from './types';

const THEME = { carpet: '#4f8a5b', carpet2: '#d7c8a8', chairVariant: 'black', deskVariant: 'wood', accent: '#000', wall: { base: '#fff', trim: '#000', pattern: 'plain' } } as RoomTheme;
const rooms = (n = TOWER_SLOTS): AreaLayout[] => Array.from({ length: n }, (_, s) => layoutTowerRoom(`/p/${s}`, s, THEME, 100 + s));

/** Tiles alcançáveis a pé a partir de (x, y) (assentos contam como chão: é onde se senta). */
function reachable(tower: ReturnType<typeof assembleTower>, x: number, y: number): Set<string> {
  const g = tower.grid;
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

describe('prédio em andares', () => {
  it('as vagas formam andares de 3 salas, de larguras diferentes, que fecham a largura do prédio', () => {
    for (let f = 1; f < TOWER_FLOORS; f++) {
      const row = Array.from({ length: 3 }, (_, p) => towerSlot((f - 1) * 3 + p).plan.rect);
      expect(row.every((r) => r.y === floorTop(f) && r.h === FLOOR_H)).toBe(true);
      expect(row[0].x).toBe(12);
      expect(row[2].x + row[2].w).toBe(TOWER_W);
      expect(row[0].x + row[0].w).toBe(row[1].x);
      expect(row[1].x + row[1].w).toBe(row[2].x);
    }
    const widths = new Set(Array.from({ length: TOWER_SLOTS }, (_, s) => towerSlot(s).plan.rect.w));
    expect(widths.size).toBeGreaterThan(1);
    // além da capacidade, repete a última vaga em vez de sair do prédio
    expect(towerSlot(TOWER_SLOTS + 5).plan.rect).toEqual(towerSlot(TOWER_SLOTS - 1).plan.rect);
  });

  it('as salas e o térreo ficam dentro da caixa e não se sobrepõem', () => {
    const t = assembleTower(rooms());
    const all = [...t.core, ...t.rooms].filter((a) => a.rect.w > 0);
    for (const a of all) {
      expect(a.rect.x, a.id).toBeGreaterThanOrEqual(0);
      expect(a.rect.x + a.rect.w, a.id).toBeLessThanOrEqual(TOWER_W);
      expect(a.rect.y + a.rect.h, a.id).toBeLessThanOrEqual(TOWER_H);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].rect;
        const b = all[j].rect;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${all[i].id} x ${all[j].id}`).toBe(false);
      }
    }
    expect(t.cols * COL_W).toBe(TOWER_W);
    expect(t.grid.h).toBe(TOWER_H);
    expect(t.tower && t.house).toBe(true);
  });

  it('da porta da frente se chega a pé em todos os lugares, de todos os andares', () => {
    const t = assembleTower(rooms());
    const arrival = t.spots.find((s) => s.kind === 'elevator')!;
    expect(arrival).toBeDefined();
    expect(t.core.find((a) => a.id === TOWER_HALL_ID)?.kind).toBe('reception');
    const ok = reachable(t, arrival.tx, arrival.ty);
    const missing = t.spots.filter((s) => !ok.has(`${s.tx},${s.ty}`)).map((s) => `${s.id} (${s.kind} ${s.tx},${s.ty})`);
    expect(missing).toEqual([]);
  });

  it('com poucas salas, as vagas viram salas nuas e o prédio continua inteiro e conectado', () => {
    const t = assembleTower(rooms(2));
    const vagas = t.core.filter((a) => a.id.startsWith('torre:vaga:'));
    expect(vagas.length).toBe(TOWER_SLOTS - 2);
    const arrival = t.spots.find((s) => s.kind === 'elevator')!;
    const ok = reachable(t, arrival.tx, arrival.ty);
    // o topo do prédio é alcançável pela escada mesmo com os andares de cima vazios
    expect(ok.has(`${6},${floorTop(TOWER_FLOORS - 1) + FLOOR_H - 2}`)).toBe(true);
    // os lugares das salas vagas não existem (só as salas presentes têm mesa)
    expect(t.spots.filter((s) => s.kind === 'desk').length).toBeGreaterThan(0);
  });

  it('cada sala de projeto tem mesas, lugares extras, interruptor e a linha das portas livre', () => {
    for (const r of rooms()) {
      const kinds = r.spots.map((s) => s.kind);
      expect(kinds.filter((k) => k === 'desk').length, r.id).toBeGreaterThanOrEqual(6);
      expect(kinds.includes('stool') && kinds.includes('nook') && kinds.includes('stand') && kinds.includes('switch'), r.id).toBe(true);
    }
  });

  it('a escada liga cada hall ao de cima, na mesma coluna', () => {
    const t = assembleTower(rooms());
    const halls = t.core.filter((a) => a.id === TOWER_HALL_ID || a.id.startsWith('torre:escada:'));
    expect(halls.length).toBe(TOWER_FLOORS);
    expect(halls.filter((h) => h.furniture.some((f) => f.kind === 'stairs')).length).toBe(TOWER_FLOORS - 1);
    for (const h of halls) expect(h.rect.x).toBe(0);
  });

  it('floorOf converte a linha em andar (0 = térreo)', () => {
    expect(floorOf(TOWER_H - 1)).toBe(0);
    expect(floorOf(0)).toBe(TOWER_FLOORS - 1);
    expect(floorOf(floorTop(2) + 3)).toBe(2);
  });

  it('o terreno tem o caminho da porta da frente até a rua', () => {
    const ext = layoutTowerExterior();
    expect(ext.floors.some((f) => f.kind === 'sidewalk' && f.x === TOWER_FRONT_DOOR.x * 16)).toBe(true);
    expect(ext.lanes.length).toBe(2);
  });
});
