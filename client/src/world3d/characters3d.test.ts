// O corpo de simulação dos personagens 3D: toda combinação de cabelo, camisa, calça, acessório e barba monta, fica na altura certa
// e não usa mais caixas.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Accessory, Appearance, HairStyle, TopStyle } from '../art/api';
import { Character3D } from './characters3d';

const HAIR: HairStyle[] = ['short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy'];
const TOPS: TopStyle[] = ['tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo'];
const ACCS: Accessory[] = ['none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow'];

const base: Appearance = {
  skin: '#e0b090', hair: '#3a2a20', hairStyle: 'short', eyes: '#2b6a8f', top: '#3f7fd8', topAccent: '#fff', topStyle: 'tshirt',
  bottom: '#333', shoes: '#111', accessory: 'none', accessoryColor: '#c33', lanyard: null, look: 'm',
};

function meshes(c: Character3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  c.root.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

describe('Character3D (estilo simulação de vida)', () => {
  it('monta todas as combinações com altura de pessoa e sem caixas', () => {
    for (const look of ['m', 'f'] as const) {
      for (const hairStyle of HAIR) {
        const topStyle = TOPS[HAIR.indexOf(hairStyle) % TOPS.length];
        const accessory = ACCS[HAIR.indexOf(hairStyle) % ACCS.length];
        const bottomStyle = (['pants', 'shorts', 'skirt'] as const)[HAIR.indexOf(hairStyle) % 3];
        const facialHair = (['none', 'stubble', 'beard', 'mustache', 'goatee'] as const)[HAIR.indexOf(hairStyle) % 5];
        const c = new Character3D('t', { ...base, look, hairStyle, topStyle, accessory, bottomStyle, facialHair, lanyard: look === 'f' ? '#e05a5a' : null }, 7);
        c.root.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(c.root);
        const label = `${look} ${hairStyle} ${topStyle} ${accessory} ${bottomStyle} ${facialHair}`;
        expect(Number.isFinite(bb.min.y) && Number.isFinite(bb.max.y), label).toBe(true);
        expect(bb.min.y, label).toBeGreaterThan(-0.15);
        expect(bb.max.y, label).toBeGreaterThan(1.7);
        expect(bb.max.y, label).toBeLessThan(2.6);
        expect(meshes(c).some((m) => m.geometry instanceof THREE.BoxGeometry), label).toBe(false);
      }
    }
  });

  it('trocar a aparência refaz o corpo sem acumular peças', () => {
    const c = new Character3D('t', base, 3);
    const n = meshes(c).length;
    c.setAppearance({ ...base, hairStyle: 'afro', accessory: 'sunglasses' });
    c.setAppearance(base);
    expect(meshes(c).length).toBe(n);
  });
});
