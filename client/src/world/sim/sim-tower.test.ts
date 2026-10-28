// Prédio em andares na simulação: as salas nas vagas dos andares, a chegada pela porta da frente e a subida pela escada.
import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import { FLOOR_H, floorOf, floorTop, TOWER_H } from '../layout/tower';
import { Sim } from './sim';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};
const appearance: Appearance = {
  skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt',
  bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm',
};
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;

const room = (id: string, slot: number): RoomInfo => ({ id, name: id.replace('/', ''), path: id, slot, seed: slot * 99 + 7, createdAt: T0 });
const agent = (id: string, roomId: string, status: AgentInfo['status']): AgentInfo => ({
  id, kind: 'main', roomId, name: id, look: 'f', role: 'Agente principal', sessionId: `s-${id}`, account: '.claude', status, recent: [], tasks: [],
  startedAt: T0, lastEventAt: T0, statusSince: T0, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: id.length * 1234567,
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

const newTower = (): Sim => new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }), null, { tower: true });

describe('Sim no prédio em andares', () => {
  it('o prédio é o corte com andares: tamanho fixo e planta livre', () => {
    const sim = newTower();
    expect(sim.tower).toBe(true);
    expect(sim.building.tower).toBe(true);
    expect(sim.building.rect.h).toBe(TOWER_H);
    expect(sim.spots.ofKind('elevator').length).toBe(1);
  });

  it('as salas ocupam as vagas de baixo para cima (3 por andar)', () => {
    const sim = newTower();
    const clock = { now: T0 };
    const rooms = ['/a', '/b', '/c', '/d'].map((id, i) => room(id, i));
    sim.applySnapshot(snap(rooms, [], 1), clock.now);
    run(sim, clock, 1);
    const floors = rooms.map((r) => floorOf(sim.rooms.get(r.id)!.layout.rect.y));
    expect(floors).toEqual([1, 1, 1, 2]);
    expect(sim.rooms.get('/d')!.layout.rect.y).toBe(floorTop(2));
  });

  it('quem chega pela porta da frente sobe a escada e senta na própria mesa, no andar da sala', () => {
    const sim = newTower();
    const clock = { now: T0 };
    // 4 salas: a quarta fica no 2º andar, depois de uma subida de duas escadas
    const rooms = ['/a', '/b', '/c', '/d'].map((id, i) => room(id, i));
    sim.applySnapshot(snap(rooms, [], 1), clock.now);
    run(sim, clock, 3);
    sim.applySnapshot(snap(rooms, [agent('Ana', '/d', 'working')], 2), clock.now);
    const ana = () => sim.chars.get('Ana')!;
    expect(ana()).toBeDefined();
    run(sim, clock, 120, () => !!ana().atSpot && ana().atSpot === ana().homeSpot);
    expect(ana().atSpot, 'chegou à mesa').toBe(ana().homeSpot);
    const desk = sim.spots.get(ana().homeSpot)!;
    expect(desk.kind).toBe('desk');
    expect(floorOf(ana().ty)).toBe(2);
    expect(ana().ty).toBeGreaterThanOrEqual(floorTop(2));
    expect(ana().ty).toBeLessThan(floorTop(2) + FLOOR_H);
  });
});
