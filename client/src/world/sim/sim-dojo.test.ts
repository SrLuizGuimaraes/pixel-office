// Dojo: o treino e a luta (rodas do mundo social) acontecem lá, e a aula paga no saco de pancada deixa o agente melhor.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { DOJO_ARENA_ID, DOJO_MAIN_ID } from '../layout/dojo';
import { personaFor } from '../social/persona';
import { KINDS, TARGET } from '../social/gathering';
import { trainingBonus } from '../social/wallet';
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
const agent = (id: string, roomId: string, status: AgentInfo['status'], seed: number): AgentInfo => ({
  id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status, recent: [], tasks: [],
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
  sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', 11), agent('beto', '/a', 'idle', 222)], 1), clock.now);
  run(sim, clock, 3);
  return { sim, clock };
};

describe('rodas do dojo', () => {
  it('treino e luta existem como rodas; a luta tem placar e aposta, o treino não', () => {
    expect(KINDS.treino.match).toBeFalsy();
    expect(KINDS.luta.match).toBe(true);
    expect(KINDS.treino.max).toBe(2);
    expect(KINDS.luta.max).toBeGreaterThan(2);
    expect(TARGET.luta).toBeGreaterThan(1);
  });

  it('treino: os dois vão ao tatame do dojo, treinam e cada um ganha um treino', () => {
    const { sim, clock } = setup();
    const names = sim.social.force('treino', clock.now, ['ana', 'beto']);
    expect(names).toHaveLength(2);
    const g = [...sim.social.gatherings][0];
    expect(g.kind).toBe('treino');
    const areas = new Set(g.members.map((m) => sim.spots.get(m.spot ?? '')?.areaId));
    expect(areas).toEqual(new Set([DOJO_MAIN_ID]));
    let reachedDojo = false;
    run(sim, clock, 220, () => {
      for (const id of ['ana', 'beto']) if ((sim.chars.get(id)?.ty ?? 0) >= 41) reachedDojo = true;
      return g.phase === 'ended';
    });
    expect(reachedDojo).toBe(true);
    expect(g.phase).toBe('ended');
    expect(sim.social.wallets.get('ana')!.trained).toBe(1);
    expect(sim.social.wallets.get('beto')!.trained).toBe(1);
    expect(sim.social.events.some((e) => e.icon === '🥋' && e.text.length > 0)).toBe(true);
    // e voltam para a mesa
    run(sim, clock, 120, () => ['ana', 'beto'].every((id) => sim.chars.get(id)!.atSpot === sim.chars.get(id)!.homeSpot));
    for (const id of ['ana', 'beto']) expect(sim.chars.get(id)!.atSpot).toBe(sim.chars.get(id)!.homeSpot);
  });

  it('luta: acontece no ringue da arena, tem vencedor, placar no feed e a aposta muda de mãos', () => {
    const { sim, clock } = setup();
    const w = sim.social.wallets;
    const before = w.coins('ana') + w.coins('beto');
    const names = sim.social.force('luta', clock.now, ['ana', 'beto']);
    expect(names).toHaveLength(2);
    const g = [...sim.social.gatherings][0];
    expect(g.kind).toBe('luta');
    expect(new Set(g.members.map((m) => sim.spots.get(m.spot ?? '')?.areaId))).toEqual(new Set([DOJO_ARENA_ID]));
    // força uma aposta para checar o pagamento
    g.bet = 20;
    run(sim, clock, 400, () => g.phase === 'ended');
    expect(g.phase).toBe('ended');
    expect(g.winner).not.toBeNull();
    expect(g.loser).not.toBeNull();
    expect(Math.max(...g.score)).toBe(TARGET.luta);
    expect(w.coins('ana') + w.coins('beto')).toBe(before); // o dinheiro só mudou de mãos
    expect(w.coins(g.winner!)).toBeGreaterThan(w.coins(g.loser!) - 1);
    const ev = sim.social.events.find((e) => e.icon === '🥊');
    expect(ev).toBeDefined();
    expect(ev!.place.length).toBeGreaterThan(0);
  });

  it('quem treina fica melhor: o bônus cresce até um teto', () => {
    expect(trainingBonus(0)).toBe(0);
    expect(trainingBonus(5)).toBeGreaterThan(trainingBonus(1));
    expect(trainingBonus(1000)).toBeLessThanOrEqual(0.12);
    expect(trainingBonus(-3)).toBe(0);
  });
});

type Private = { planMall(ch: unknown, persona: unknown, steps: Step[]): false | string; pushHome(ch: unknown, held: never): void; pushLeave(ch: unknown, steps: Step[]): void };

describe('aula de artes marciais (passeio pago)', () => {
  it('quem tem saldo paga a aula, treina no saco de pancada e volta com um treino a mais', () => {
    const { sim, clock } = setup();
    const ana = sim.chars.get('ana')!;
    const w = sim.social.wallets;
    const p = sim as unknown as Private;
    let paid = false;
    for (let seed = 1; seed <= 60 && !paid; seed++) {
      w.credit('ana', 100, '✅', 'tarefa', clock.now);
      const steps: Step[] = [];
      p.pushLeave(ana, steps);
      const bag = p.planMall(ana, { traits: ['esporte'], sociability: 0.5, skill: 0.5, catchphrase: '' }, steps);
      if (bag === false) continue;
      const hasBag = steps.some((s) => s.t === 'act' && s.pose === 'play');
      if (!hasBag) continue;
      const before = { trained: w.get('ana')!.trained, coins: w.coins('ana') };
      ana.queue.length = 0;
      ana.queue.push(...steps);
      p.pushHome(ana, bag as never);
      run(sim, clock, 220, () => ana.queue.length === 0 && !ana.step && ana.atSpot === ana.homeSpot);
      expect(ana.atSpot).toBe(ana.homeSpot);
      paid = w.get('ana')!.trained === before.trained + 1 && w.coins('ana') < before.coins;
    }
    expect(paid).toBe(true);
    void personaFor;
  });
});
