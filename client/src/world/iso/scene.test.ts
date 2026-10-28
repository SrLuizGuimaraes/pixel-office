import { describe, expect, it } from 'vitest';
import type { AgentInfo, OfficeSnapshot, RoomInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import type { WorldApi } from '../api';
import { Sim } from '../sim/sim';
import { sortBoxes } from './depth';
import { buildIsoScene } from './scene';

const theme: RoomTheme = { carpet: '#4f6d8f', carpet2: '#486685', wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'wood', chairVariant: 'black' };
const appearance: Appearance = {
  skin: '#f0c8a0', hair: '#3a2a20', hairStyle: 'short', eyes: '#222', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt',
  bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#000', lanyard: null, look: 'm',
};
const art = { appearanceFromSeed: () => appearance, roomTheme: () => theme } as unknown as ArtModule;
const T0 = 1_700_000_000_000;
const room: RoomInfo = { id: '/a', name: 'a', path: '/a', slot: 0, seed: 7, createdAt: T0 };
const agent: AgentInfo = {
  id: 'ana', kind: 'main', roomId: '/a', name: 'ana', look: 'f', role: 'Agente principal', sessionId: 's', account: '.claude', status: 'idle', recent: [], tasks: [],
  startedAt: T0, lastEventAt: T0, statusSince: T0 - 30_000, stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: 11,
};
const snap: OfficeSnapshot = {
  rev: 1, serverTime: T0, rooms: [room], agents: [agent],
  accounts: [{ id: '.claude', short: 'C', name: 'Conta C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
  meta: { demo: true, sources: [], startedAt: T0, version: 't' },
};

describe('cena isométrica', () => {
  const sim = new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS }), null);
  sim.applySnapshot(snap, T0);
  for (let i = 0; i < 90; i++) sim.update(1 / 30, T0 + i * 33);
  const scene = buildIsoScene(sim);

  it('lê pisos, paredes, móveis, quadros e terreno da simulação', () => {
    expect(scene.floors.length).toBeGreaterThan(10);
    expect(scene.walls.length).toBeGreaterThan(10);
    expect(scene.furn.length).toBeGreaterThan(10);
    expect(scene.wallItems.length).toBeGreaterThan(0);
    expect(scene.props.length).toBeGreaterThan(5);
    expect(scene.areas.some((a) => a.id === sim.rooms.get('/a')?.layout.id)).toBe(true);
  });

  it('toda parede é de uma sala e tem lado dono (normal em X ou em Z)', () => {
    for (const w of scene.walls) {
      expect(Math.abs(w.ownerNx) + Math.abs(w.ownerNz)).toBe(1);
      expect(w.x1).toBeGreaterThanOrEqual(w.x0);
      expect(w.z1).toBeGreaterThanOrEqual(w.z0);
    }
  });

  it('a ordem de desenho cobre todas as caixas, sem repetir, nas 4 rotações', () => {
    for (const rot of [0, 1, 2, 3] as const) {
      const boxes = scene.furn.map((f) => {
        const u = f.cx;
        const v = f.cz;
        return { u0: u - 0.5, u1: u + 0.5, v0: v - 0.5, v1: v + 0.5, y0: 0, y1: 1, sx0: u * 32, sx1: u * 32 + 64, sy0: v * 16, sy1: v * 16 + 64, rot };
      });
      const out = sortBoxes(boxes);
      expect(out).toHaveLength(boxes.length);
      expect(new Set(out).size).toBe(boxes.length);
    }
  });

  it('o contrato WorldApi tem todos os métodos obrigatórios (conferido pelo tipo)', () => {
    const required: (keyof WorldApi)[] = ['select', 'getSelection', 'onSelect', 'onHover', 'focusAgent', 'focusRoom', 'overview', 'zoomBy', 'getOptions', 'setOptions', 'screenPositionOf', 'destroy'];
    expect(required).toHaveLength(12);
  });
});
