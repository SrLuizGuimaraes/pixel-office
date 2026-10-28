import { describe, expect, it } from 'vitest';
import type { Accessory, Appearance, HairStyle, HeldItem, Pose, TopStyle } from '../../art/api';
import { AVATAR_ANCHOR, AVATAR_FRAMES, AVATAR_H, AVATAR_W, drawAvatar, viewOf, type Px, type View } from './hotel-avatar';

const HAIR: HairStyle[] = ['short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy'];
const TOPS: TopStyle[] = ['tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo'];
const ACCS: Accessory[] = ['none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow'];
const POSES: Pose[] = ['stand', 'walk', 'run', 'sit', 'type', 'sleep', 'drink', 'use', 'raise_hand', 'talk', 'stretch', 'read', 'play', 'wait', 'cheer', 'laugh', 'game', 'rps', 'groom', 'sulk'];
const HELD: HeldItem[] = ['none', 'coffee', 'water', 'papers', 'laptop', 'book', 'box', 'paddle', 'popcorn', 'controller', 'rock', 'paper', 'scissors', 'phone', 'lipstick', 'comb'];
const VIEWS: View[] = [0, 1, 2, 3];

const base: Appearance = {
  skin: '#e0b090', hair: '#3a2a20', hairStyle: 'short', eyes: '#2b6a8f', top: '#3f7fd8', topAccent: '#ffffff', topStyle: 'tshirt',
  bottom: '#333333', shoes: '#111111', accessory: 'none', accessoryColor: '#cc3333', lanyard: null, look: 'm',
};

function bbox(p: Px): { x0: number; x1: number; y0: number; y1: number; n: number } {
  let x0 = p.w;
  let x1 = -1;
  let y0 = p.h;
  let y1 = -1;
  let n = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.d[(y * p.w + x) * 4 + 3] === 0) continue;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, x1, y0, y1, n };
}

describe('avatar estilo hotel retrô', () => {
  it('todo cabelo, camisa, acessório e pelo facial desenha em todas as direções, sem sair do quadro', () => {
    for (const look of ['m', 'f'] as const) {
      HAIR.forEach((hairStyle, i) => {
        const app: Appearance = {
          ...base, look, hairStyle, topStyle: TOPS[i % TOPS.length], accessory: ACCS[i % ACCS.length],
          bottomStyle: (['pants', 'shorts', 'skirt'] as const)[i % 3], facialHair: (['none', 'stubble', 'beard', 'mustache', 'goatee'] as const)[i % 5], lanyard: i % 2 ? '#e05a5a' : null,
        };
        for (const view of VIEWS) {
          const p = drawAvatar({ app, view, pose: 'stand', frame: 0, seatPx: null, held: 'none' });
          const b = bbox(p);
          const label = `${look} ${hairStyle} ${app.topStyle} ${app.accessory} v${view}`;
          expect(p.w, label).toBe(AVATAR_W);
          expect(p.h, label).toBe(AVATAR_H);
          expect(b.n, label).toBeGreaterThan(500);
          expect(b.x0, label).toBeGreaterThanOrEqual(0);
          expect(b.x1, label).toBeLessThan(AVATAR_W);
          expect(b.y0, label).toBeGreaterThanOrEqual(0);
          expect(b.y1, label).toBeLessThanOrEqual(AVATAR_ANCHOR.y + 2);
        }
      });
    }
  });

  it('todas as camisas e acessórios aparecem (mudam o desenho)', () => {
    const sig = (app: Appearance) => drawAvatar({ app, view: 0, pose: 'stand', frame: 0, seatPx: null, held: 'none' }).d.join(',');
    expect(new Set(TOPS.map((topStyle) => sig({ ...base, topStyle }))).size).toBe(TOPS.length);
    expect(new Set(ACCS.map((accessory) => sig({ ...base, accessory }))).size).toBe(ACCS.length);
    expect(new Set(HAIR.map((hairStyle) => sig({ ...base, hairStyle }))).size).toBe(HAIR.length);
  });

  it('as 20 poses, os itens e o sentado desenham com tamanho estável e os pés no chão', () => {
    for (const pose of POSES) {
      const frames = AVATAR_FRAMES[pose]?.n ?? 1;
      for (let frame = 0; frame < frames; frame++) {
        for (const seatPx of [null, 17]) {
          const p = drawAvatar({ app: base, view: 0, pose, frame, seatPx, held: 'none' });
          const b = bbox(p);
          expect(p.w * p.h * 4, `${pose} ${frame}`).toBe(p.d.length);
          expect(b.n, `${pose} ${frame}`).toBeGreaterThan(400);
          expect(b.y1, `${pose} ${frame}`).toBeLessThanOrEqual(AVATAR_ANCHOR.y + 2);
          expect(b.x0 >= 0 && b.x1 < AVATAR_W && b.y0 >= 0, `${pose} ${frame}`).toBe(true);
        }
      }
    }
    for (const held of HELD) expect(bbox(drawAvatar({ app: base, view: 1, pose: 'drink', frame: 1, seatPx: null, held })).n).toBeGreaterThan(400);
  });

  it('as direções da direita são o espelho das da esquerda e o desenho é determinístico', () => {
    const l = drawAvatar({ app: { ...base, accessory: 'glasses' }, view: 0, pose: 'stand', frame: 0, seatPx: null, held: 'none' });
    const r = drawAvatar({ app: { ...base, accessory: 'glasses' }, view: 1, pose: 'stand', frame: 0, seatPx: null, held: 'none' });
    const again = drawAvatar({ app: { ...base, accessory: 'glasses' }, view: 0, pose: 'stand', frame: 0, seatPx: null, held: 'none' });
    expect(l.d.join(',') === again.d.join(',')).toBe(true);
    // a silhueta (alfa) é espelhada
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) expect(l.opaque(x, y)).toBe(r.opaque(AVATAR_W - 1 - x, y));
  });

  it('o andar tem 4 quadros diferentes e a direção do mundo vira uma das 4 vistas', () => {
    const sigs = new Set([0, 1, 2, 3].map((frame) => drawAvatar({ app: base, view: 0, pose: 'walk', frame, seatPx: null, held: 'none' }).d.join(',')));
    expect(sigs.size).toBe(4);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, -1].map(viewOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 0, 0, 0]);
  });
});
