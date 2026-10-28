// Funcionários fixos das lojas: ficam nos postos, não são agentes e atendem quem chega perto.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { assembleBuilding } from '../layout/building';
import { Sim } from './sim';
import { isStaffId, roleOf } from './staff';

const theme: RoomTheme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' };
const appearance: Appearance = {
  skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt',
  bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm',
};
const art = { appearanceFromSeed: (_s: number, o?: { parts?: Record<string, string> }) => ({ ...appearance, ...(o?.parts ?? {}) }), roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;

const room = (id: string, slot: number): RoomInfo => ({ id, name: id.replace('/', ''), path: id, slot, seed: slot * 99 + 7, createdAt: T0 });
const agent = (id: string, roomId: string, seed: number): AgentInfo => ({
  id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status: 'idle', recent: [], tasks: [],
  startedAt: T0, lastEventAt: T0, statusSince: T0 - 30_000, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed,
});
const snap = (rooms: RoomInfo[], agents: AgentInfo[], rev = 1): OfficeSnapshot => ({
  rev, serverTime: T0, rooms, agents,
  accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
});

function run(sim: Sim, clock: { now: number }, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
  }
}

const setup = () => {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
  const clock = { now: T0 };
  sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 11)], 1), clock.now);
  run(sim, clock, 3);
  return { sim, clock };
};

describe('postos de funcionário no layout', () => {
  it('toda loja tem o seu, cada posto tem um cargo conhecido e dá para chegar a pé até ele', () => {
    const b = assembleBuilding(4, []);
    const posts = b.spots.filter((s) => s.kind === 'staffpost');
    expect(posts.length).toBeGreaterThanOrEqual(12);
    for (const p of posts) expect(roleOf(p), p.id).toBeDefined();
    const areas = new Set(posts.map((p) => p.areaId));
    for (const id of ['mall:roupas1', 'mall:roupas2', 'mall:games1', 'mall:games2', 'mall:praca', 'mall:academia', 'mall:fliperama', 'mall:cinema', 'dojo:salao', 'club:tiro', 'club:quadra', 'kart:pista']) {
      expect(areas.has(id), id).toBe(true);
    }
    const arrival = b.spots.find((s) => s.kind === 'elevator')!;
    const seen = new Set<string>([`${arrival.tx},${arrival.ty}`]);
    const q = [[arrival.tx, arrival.ty]];
    while (q.length) {
      const [cx, cy] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${cx + dx},${cy + dy}`;
        if (seen.has(k) || b.grid.get(cx + dx, cy + dy) === 0) continue;
        seen.add(k);
        q.push([cx + dx, cy + dy]);
      }
    }
    expect(posts.filter((p) => !seen.has(`${p.tx},${p.ty}`)).map((p) => p.id)).toEqual([]);
  });
});

describe('funcionários no Sim', () => {
  it('existem só no cliente: fora de chars (agentes), dentro de people(), cada um no seu posto', () => {
    const { sim } = setup();
    const posts = sim.building.spots.filter((s) => s.kind === 'staffpost');
    expect(sim.staff).toHaveLength(posts.length);
    expect(sim.chars.size).toBe(1);
    for (const st of sim.staff) {
      expect(isStaffId(st.id)).toBe(true);
      expect(sim.chars.has(st.id)).toBe(false);
      expect([...sim.people()]).toContain(st);
      expect(sim.person(st.id)).toBe(st);
    }
    const names = sim.staff.map((s) => s.info.name);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('ficam sempre no posto, trabalhando, mesmo depois de muito tempo', () => {
    const { sim, clock } = setup();
    const before = sim.staff.map((s) => [s.id, s.x, s.y]);
    run(sim, clock, 120);
    for (const [id, x, y] of before) {
      const st = sim.staff.find((s) => s.id === id)!;
      expect([st.x, st.y]).toEqual([x, y]);
      expect(st.seated).toBe(false);
    }
  });

  it('quem chega perto é cumprimentado: o funcionário vira para o cliente e fala', () => {
    const { sim, clock } = setup();
    const st = sim.staff.find((s) => s.staff?.roleKey === 'caixa-roupas')!;
    const ana = sim.chars.get('ana')!;
    ana.queue.length = 0;
    ana.step = null;
    ana.placeAtTile(st.tx, st.ty + 2);
    ana.inside = false;
    ana.alpha = 1;
    clock.now += 100;
    sim.update(1 / 30, clock.now);
    expect(st.dir).toBe('down');
    expect(st.sayText.length).toBeGreaterThan(0);
    expect(st.pose).toBe('talk');
    // sem ninguém por perto, volta à rotina e ao lado do posto
    ana.placeAtTile(st.tx + 20, st.ty + 20);
    run(sim, clock, 10);
    expect(st.pose).not.toBe('talk');
    expect(st.dir).toBe(st.staff!.baseDir);
  });

  it('sem o shopping (visita) não há postos', () => {
    expect(assembleBuilding(4, [], 0, false).spots.some((s) => s.kind === 'staffpost')).toBe(false);
  });
});
