// Kartódromo: as corridas rolam lá e o passeio pago leva o ocioso até lá.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { KART_ID } from '../layout/kart';
import { KINDS, TARGET } from '../social/gathering';
import type { Step } from './steps';
import { Sim } from './sim';

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

function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  for (let i = 0; i < Math.round(seconds * 30); i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

const setup = () => {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null);
  const clock = { now: T0 };
  sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 11), agent('beto', '/a', 222)], 1), clock.now);
  run(sim, clock, 3);
  return { sim, clock };
};

describe('rodas do kartódromo', () => {
  it('a corrida é uma partida (placar, aposta, torcida) até 3 voltas', () => {
    expect(KINDS.kart.match).toBe(true);
    expect(KINDS.kart.max).toBeGreaterThan(2);
    expect(TARGET.kart).toBe(3);
  });

  it('os dois vão ao grid, correm até alguém fazer 3, a aposta muda de mãos e o placar vai ao feed', () => {
    const { sim, clock } = setup();
    const w = sim.social.wallets;
    const before = w.coins('ana') + w.coins('beto');
    const names = sim.social.force('kart', clock.now, ['ana', 'beto']);
    expect(names).toHaveLength(2);
    const g = [...sim.social.gatherings][0];
    expect(g.kind).toBe('kart');
    expect(new Set(g.members.map((m) => sim.spots.get(m.spot ?? '')?.areaId))).toEqual(new Set([KART_ID]));
    g.bet = 20;
    run(sim, clock, 500, () => g.phase === 'ended');
    expect(g.phase).toBe('ended');
    expect(g.winner).not.toBeNull();
    expect(Math.max(...g.score)).toBe(3);
    expect(w.coins('ana') + w.coins('beto')).toBe(before);
    expect(sim.social.events.some((e) => e.icon === '🏎️' && e.place.length > 0)).toBe(true);
  });
});

describe('os karts correm de verdade', () => {
  it('saem do grid, dão as voltas pelo circuito (a pé de ninguém), cruzam a linha e voltam ao lugar', () => {
    const { sim, clock } = setup();
    sim.social.force('kart', clock.now, ['ana', 'beto']);
    const g = [...sim.social.gatherings][0];
    const ana = sim.chars.get('ana')!;
    const beto = sim.chars.get('beto')!;
    let far = 0;
    let driving = 0;
    let seats: Record<string, { x: number; y: number }> = {};
    let out = 0;
    run(sim, clock, 500, () => {
      if (g.phase === 'run' && ana.drive && beto.drive) {
        seats ||= {};
        driving++;
        const s = sim.spots.get(ana.drive.seat)!;
        far = Math.max(far, Math.hypot(ana.x - s.x, ana.y - s.y));
        out = Math.max(out, sim.kartsOut.size);
        expect(ana.vehicle).not.toBeNull();
      }
      return g.phase === 'ended';
    });
    expect(driving).toBeGreaterThan(100);
    expect(far).toBeGreaterThan(8 * 16);
    expect(out).toBe(2);
    expect(Math.max(...g.score)).toBe(3);
    // acabou: ninguém dirige mais, os dois karts estão no grid de novo
    expect(ana.drive).toBeNull();
    expect(beto.drive).toBeNull();
    expect(ana.vehicle).toBeNull();
    expect(sim.kartsOut.size).toBe(0);
    void seats;
  });
});

type Private = { planMall(ch: unknown, persona: unknown, steps: Step[]): false | string; pushHome(ch: unknown, held: never): void; pushLeave(ch: unknown, steps: Step[]): void };

describe('passeio pago: kart', () => {
  it('quem tem saldo paga e vai ao kartódromo, senta no kart, volta e para a mesa', () => {
    const { sim, clock } = setup();
    const ana = sim.chars.get('ana')!;
    const w = sim.social.wallets;
    const p = sim as unknown as Private;
    let seen = false;
    for (let seed = 1; seed <= 200 && !seen; seed++) {
      w.credit('ana', 100, '✅', 'tarefa', clock.now);
      const steps: Step[] = [];
      p.pushLeave(ana, steps);
      const bag = p.planMall(ana, { traits: ['esporte', 'games'], sociability: 0.5, skill: 0.5, catchphrase: '' }, steps);
      if (bag === false) continue;
      const go = steps.find((s): s is Extract<Step, { t: 'go' }> => s.t === 'go');
      const area = go ? [...sim.spots.all()].find((sp) => sp.tx === go.tx && sp.ty === go.ty)?.areaId : undefined;
      if (area !== KART_ID || !steps.some((s) => s.t === 'enter')) continue;
      const before = w.coins('ana');
      ana.queue.length = 0;
      ana.queue.push(...steps);
      p.pushHome(ana, bag as never);
      run(sim, clock, 300, () => ana.queue.length === 0 && !ana.step && ana.atSpot === ana.homeSpot);
      expect(ana.atSpot).toBe(ana.homeSpot);
      expect(w.coins('ana')).toBeLessThan(before);
      seen = true;
    }
    expect(seen).toBe(true);
  });
});
