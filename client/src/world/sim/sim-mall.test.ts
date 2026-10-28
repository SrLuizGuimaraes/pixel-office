// O passeio "shopping": o ocioso atravessa a rua, usa um lugar do shopping e volta para a mesa.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { MALL_Y } from '../layout/mall';
import { personaFor } from '../social/persona';
import type { Step } from './steps';
import { IDLE_WEIGHTS, pickIdleActivity } from './behavior';
import { Sim } from './sim';

const theme: RoomTheme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' };
const appearance: Appearance = {
  skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt',
  bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm',
};
// a arte de mentira respeita as peças pedidas (como a de verdade): assim dá para ver a roupa nova
const art = { appearanceFromSeed: (_seed: number, o?: { parts?: Record<string, string> }) => ({ ...appearance, ...(o?.parts ?? {}) }), roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;

const room = (id: string, slot: number): RoomInfo => ({ id, name: id.replace('/', ''), path: id, slot, seed: slot * 99 + 7, createdAt: T0 });
const agent = (id: string, roomId: string, status: AgentInfo['status'], seed = id.length * 1234567): AgentInfo => ({
  id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status, recent: [], tasks: [],
  startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed,
});
const snap = (rooms: RoomInfo[], agents: AgentInfo[], rev = 1): OfficeSnapshot => ({
  rev, serverTime: T0, rooms, agents,
  accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
});

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

type Private = { planMall(ch: unknown, persona: unknown, steps: Step[]): false | string; pushHome(ch: unknown, held: 'none'): void; pushLeave(ch: unknown, steps: Step[]): void };

describe('passeio pelo shopping', () => {
  it('"mall" é um passeio com peso e entra no sorteio quando há lugar no shopping', () => {
    expect(IDLE_WEIGHTS.mall).toBeGreaterThan(0);
    expect(pickIdleActivity(() => 0.999, { mall: true })).not.toBeNull();
    // sem o shopping montado (visita), nunca é sorteado
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickIdleActivity(() => (i + 0.5) / 400, { mall: false }) ?? '');
    expect(seen.has('mall')).toBe(false);
    const seenWith = new Set<string>();
    for (let i = 0; i < 400; i++) seenWith.add(pickIdleActivity(() => (i + 0.5) / 400, {}) ?? '');
    expect(seenWith.has('mall')).toBe(true);
  });

  it('o ocioso vai ao shopping do outro lado da rua, usa um lugar e volta para a mesa', () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('Ana', '/a', 'idle')], 1), clock.now);
    run(sim, clock, 2);
    const ana = sim.chars.get('Ana')!;
    expect(sim.building.mall).toBe(true);
    const home = ana.homeSpot;
    expect(ana.atSpot).toBe(home);
    let reachedMall = false;
    for (const seed of [5, 17, 33, 49, 61, 77, 91, 123]) {
      const steps: Step[] = [];
      const p = sim as unknown as Private;
      p.pushLeave(ana, steps);
      // cada ida ao shopping custa moedinhas: recarrega a carteira para as 8 viagens poderem acontecer
      sim.social.wallets.credit('Ana', 100, '✅', 'tarefa', clock.now);
      const ok = p.planMall(ana, personaFor(seed), steps);
      expect(ok, `seed ${seed}`).not.toBe(false);
      ana.queue.length = 0;
      ana.queue.push(...steps);
      p.pushHome(ana, 'none');
      run(sim, clock, 150, () => {
        if (ana.ty >= MALL_Y) reachedMall = true;
        return ana.queue.length === 0 && !ana.step && ana.atSpot === home;
      });
      expect(ana.atSpot, `seed ${seed}: voltou à mesa`).toBe(home);
      expect(ana.tempSpots.length).toBe(0);
    }
    expect(reachedMall).toBe(true);
  });
});

describe('economia do shopping', () => {
  const setup = () => {
    const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('Ana', '/a', 'idle')], 1), clock.now);
    run(sim, clock, 2);
    return { sim, clock, ana: sim.chars.get('Ana')! };
  };
  const trip = (sim: Sim, clock: { now: number }, ana: ReturnType<typeof setup>['ana'], seed: number) => {
    const p = sim as unknown as Private;
    const steps: Step[] = [];
    p.pushLeave(ana, steps);
    const bag = p.planMall(ana, personaFor(seed), steps);
    if (bag === false) return false;
    ana.queue.length = 0;
    ana.queue.push(...steps);
    p.pushHome(ana, bag as never);
    const home = ana.homeSpot;
    run(sim, clock, 200, () => ana.queue.length === 0 && !ana.step && ana.atSpot === home);
    return ana.atSpot === home;
  };

  it('com dinheiro, gasta no shopping: o saldo cai, o extrato e o feed registram e ele volta à mesa', () => {
    const { sim, clock, ana } = setup();
    const w = sim.social.wallets;
    const start = w.coins('Ana');
    expect(start).toBeGreaterThan(0);
    let went = 0;
    for (const seed of [3, 11, 19, 29, 41, 53, 67, 79]) {
      if (w.coins('Ana') < 6) break;
      const before = w.coins('Ana');
      const ok = trip(sim, clock, ana, seed);
      expect(ok, 'seed ' + seed).toBe(true);
      expect(w.coins('Ana')).toBeLessThanOrEqual(before);
      went++;
    }
    expect(went).toBeGreaterThan(0);
    const e = w.get('Ana')!;
    expect(e.spent).toBe(start - w.coins('Ana'));
    expect(e.spent).toBeGreaterThan(0);
    expect(e.ledger.some((l) => l.delta < 0)).toBe(true);
    // cada compra virou uma linha no feed social
    expect(sim.social.events.filter((x) => x.agentId === 'Ana').length).toBeGreaterThan(0);
    expect(w.coins('Ana')).toBeGreaterThanOrEqual(0);
  });

  it('na loja de roupas ele escolhe uma peça nova, experimenta e passa a usá-la (e continua usando depois)', () => {
    const { sim, clock, ana } = setup();
    const w = sim.social.wallets;
    const before = { ...ana.appearance };
    let changed = false;
    for (let seed = 1; seed <= 40 && !changed; seed++) {
      w.credit('Ana', 100, '✅', 'tarefa', clock.now);
      trip(sim, clock, ana, seed);
      changed = ana.appearance.top !== before.top || ana.appearance.shoes !== before.shoes || ana.appearance.accessory !== before.accessory || ana.appearance.topStyle !== before.topStyle || ana.appearance.bottomStyle !== before.bottomStyle;
    }
    expect(changed).toBe(true);
    const saved = w.get('Ana')!.outfit!;
    expect(saved).toBeDefined();
    // o que comprou ficou guardado e é o que ele veste
    for (const [k, v] of Object.entries(saved)) expect((ana.appearance as unknown as Record<string, string>)[k]).toBe(v);
  });

  it('sem dinheiro, não vai ao shopping (nem é sorteado)', () => {
    const { sim, clock, ana } = setup();
    const w = sim.social.wallets;
    w.spend('Ana', w.coins('Ana'), '🛍️', 'tudo', clock.now);
    expect(w.coins('Ana')).toBe(0);
    const steps: Step[] = [];
    expect((sim as unknown as Private).planMall(ana, personaFor(5), steps)).toBe(false);
    expect(steps.length).toBe(0);
    // quem ganha de novo volta a poder gastar
    w.credit('Ana', 30, '✅', 'tarefa', clock.now);
    expect(trip(sim, clock, ana, 5)).toBe(true);
    expect(w.coins('Ana')).toBeLessThanOrEqual(30);
  });
});
