// Móveis em 3D: cada tipo de móvel do catálogo (art/api.ts) vira um conjunto de caixas, cilindros e esferas coloridas.
// O modelo é desenhado no espaço local do footprint: origem no centro do footprint, no chão (y = 0), X para leste, Z para
// o sul; os modelos "olham" para o sul (+Z) e são girados em torno de Y para as outras direções.
import * as THREE from 'three';
import type { FurnitureKind } from '../art/api';

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Giro em torno de Y para o modelo (que olha para o sul) olhar na direção dada. */
export const YAW: Readonly<Record<Facing, number>> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

/** Onde os móveis pedem materiais: o cômodo fornece (e ajusta a luz do cômodo nos materiais dele). */
export interface Painter {
  mat(color: string, opts?: { emissive?: boolean; opacity?: number; rough?: number }): THREE.Material;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const SPHERE = new THREE.SphereGeometry(1, 12, 9);

/** Construtor de peças no espaço local de um móvel. */
export class Piece {
  readonly group = new THREE.Group();
  constructor(
    private readonly paint: Painter,
    readonly w: number,
    readonly d: number,
  ) {}

  private put<T extends THREE.Mesh>(m: T, x: number, y: number, z: number, shadow = true): T {
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /** Caixa de tamanho (w, h, d) com a base em y e centrada em (x, z). */
  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, opts?: { emissive?: boolean; opacity?: number }): THREE.Mesh {
    const m = new THREE.Mesh(BOX, this.paint.mat(color, opts));
    m.scale.set(w, h, d);
    return this.put(m, x, y + h / 2, z, !opts?.opacity);
  }

  /** Cilindro de raio r e altura h com a base em y. */
  cyl(r: number, h: number, color: string, x: number, y: number, z: number, opts?: { emissive?: boolean; rtop?: number }): THREE.Mesh {
    const m = new THREE.Mesh(CYL, this.paint.mat(color, opts));
    m.scale.set(r, h, r);
    if (opts?.rtop !== undefined) {
      // tronco de cone: troca a geometria (raros)
      m.geometry = new THREE.CylinderGeometry(opts.rtop / Math.max(r, 1e-3), 1, 1, 14);
    }
    return this.put(m, x, y + h / 2, z);
  }

  cone(r: number, h: number, color: string, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(CONE, this.paint.mat(color));
    m.scale.set(r, h, r);
    return this.put(m, x, y + h / 2, z);
  }

  ball(r: number, color: string, x: number, y: number, z: number, sy = 1): THREE.Mesh {
    const m = new THREE.Mesh(SPHERE, this.paint.mat(color));
    m.scale.set(r, r * sy, r);
    return this.put(m, x, y, z);
  }
}

type Builder = (p: Piece, variant: string | undefined, seed: number) => void;

const WOOD: Record<string, string> = { wood: '#c9a273', white: '#ecebe6', dark: '#5a4636' };
const CHAIR: Record<string, string> = { black: '#2f333d', blue: '#3f6fb8', red: '#c04a4a', green: '#3f9a5d', gray: '#7d8594' };
const BEAN: Record<string, string> = { red: '#d9534f', blue: '#4a78c9', yellow: '#e8b93c', green: '#4aa56a' };
const LEAF = ['#3f8f4f', '#4fa35f', '#2f7a44'];

function darkerHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.round(v * 0.75);
  return `#${((k(n >> 16 & 255) << 16) | (k(n >> 8 & 255) << 8) | k(n & 255)).toString(16).padStart(6, '0')}`;
}

function chairModel(p: Piece, color: string, high = true): void {
  p.cyl(0.05, 0.28, '#6a707c', 0, 0.06, 0);
  p.cyl(0.26, 0.05, '#4a4f5a', 0, 0.0, 0);
  p.box(0.5, 0.09, 0.5, color, 0, 0.34, 0);
  if (high) p.box(0.48, 0.55, 0.07, color, 0, 0.43, -0.22);
}

function bookshelf(p: Piece, wide: number, seed: number): void {
  p.box(wide, 1.9, 0.42, '#8a6a45', 0, 0, -0.28);
  const cols = ['#3f7fd8', '#ec8a3c', '#4cae6a', '#e05a5a', '#f2c14e', '#8d66cf', '#36b0b0'];
  for (let shelf = 0; shelf < 4; shelf++) {
    p.box(wide - 0.1, 0.03, 0.4, '#6e5236', 0, 0.28 + shelf * 0.45, -0.27);
    for (let i = 0; i < wide * 5; i++) {
      const h = 0.26 + ((seed * 7 + i * 13 + shelf * 5) % 5) * 0.025;
      p.box(0.07, h, 0.3, cols[(i + shelf * 3 + seed) % cols.length], -wide / 2 + 0.16 + i * 0.19, 0.31 + shelf * 0.45, -0.22);
    }
  }
}

const COUNTER = (p: Piece, top = '#eceae5'): void => {
  p.box(0.98, 0.84, 0.9, '#d8b98f', 0, 0, 0.02);
  p.box(1.0, 0.06, 0.94, top, 0, 0.84, 0.02);
  p.box(0.4, 0.05, 0.02, '#8a6a45', 0, 0.55, 0.49);
};

const BUILDERS: Partial<Record<FurnitureKind, Builder>> = {
  desk: (p, v) => {
    const c = WOOD[v ?? 'wood'];
    p.box(1.96, 0.07, 0.92, c, 0, 0.72, 0);
    for (const x of [-0.9, 0.9]) for (const z of [-0.38, 0.38]) p.box(0.06, 0.72, 0.06, '#4a4f5a', x, 0, z);
    // monitor virado para o sul (a tela é o meio emissivo; recebe o texto da atividade)
    p.box(0.1, 0.18, 0.1, '#2b2f38', -0.2, 0.79, -0.22);
    const scr = p.box(0.78, 0.5, 0.05, '#12161f', -0.2, 0.92, -0.26);
    scr.name = 'frame';
    const face = p.box(0.7, 0.42, 0.01, '#22324f', -0.2, 0.96, -0.234, { emissive: true });
    face.name = 'screen';
    p.box(0.55, 0.03, 0.18, '#d6d9de', -0.2, 0.79, 0.12);
    p.cyl(0.07, 0.1, '#e9e5dc', 0.7, 0.79, -0.05);
    p.box(0.3, 0.015, 0.22, '#f4f1e6', 0.45, 0.79, 0.2);
  },
  office_chair: (p, v) => chairModel(p, CHAIR[v ?? 'black']),
  office_chair_front: (p, v) => chairModel(p, CHAIR[v ?? 'black']),
  stool: (p) => {
    p.cyl(0.2, 0.06, '#8a6a45', 0, 0.5, 0);
    for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0, 0.12]] as const) p.cyl(0.025, 0.5, '#4a4f5a', x, 0, z);
  },
  bookshelf: (p, _v, s) => bookshelf(p, 1.96, s),
  binder_shelf: (p, _v, s) => {
    p.box(0.9, 1.7, 0.4, '#d9cfbd', 0, 0, -0.28);
    const cols = ['#3f7fd8', '#ec8a3c', '#4cae6a'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) p.box(0.1, 0.3, 0.3, cols[(i + r + s) % 3], -0.35 + i * 0.14, 0.1 + r * 0.4, -0.2);
  },
  filing_cabinet: (p) => {
    p.box(0.7, 1.1, 0.6, '#8d97a6', 0, 0, 0);
    for (let i = 0; i < 3; i++) p.box(0.3, 0.04, 0.02, '#4a4f5a', 0, 0.2 + i * 0.32, 0.31);
  },
  printer: (p) => {
    p.box(0.8, 0.7, 0.7, '#b9bfc8', 0, 0, 0);
    p.box(0.6, 0.35, 0.5, '#e4e6ea', 0, 0.7, 0);
    p.box(0.3, 0.02, 0.2, '#ffffff', 0, 1.05, 0.15);
  },
  trash_bin: (p) => {
    p.cyl(0.2, 0.5, '#6d7583', 0, 0, 0);
  },
  plant_small: (p, v, s) => {
    p.cyl(0.18, 0.28, '#c9714a', 0, 0, 0);
    p.ball(0.26, LEAF[s % LEAF.length], 0, 0.5, 0, 0.8);
    if (v === 'flower') for (let i = 0; i < 4; i++) p.ball(0.06, ['#e05a8a', '#f2c14e'][i % 2], Math.cos(i * 1.6) * 0.18, 0.7, Math.sin(i * 1.6) * 0.18);
  },
  plant_tall: (p, v, s) => {
    p.cyl(0.24, 0.4, '#b86a45', 0, 0, 0);
    p.cyl(0.04, 0.8, '#6e5236', 0, 0.35, 0);
    const base = LEAF[s % LEAF.length];
    if (v === 'palm') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = p.cone(0.14, 0.9, base, Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3);
        leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      }
    } else {
      p.ball(0.42, base, 0, 1.3, 0, 1.0);
      p.ball(0.3, '#57ab68', 0.18, 1.7, 0.05);
    }
  },
  glass_partition: (p) => {
    p.box(0.98, 0.5, 0.12, '#e9e8e4', 0, 0, 0);
    p.box(0.98, 0.9, 0.04, '#a8d4ee', 0, 0.5, 0, { opacity: 0.35 });
  },
  meeting_table: (p) => {
    p.box(2.9, 0.07, 1.8, '#c9a273', 0, 0.72, 0);
    for (const x of [-1.3, 1.3]) for (const z of [-0.75, 0.75]) p.box(0.07, 0.72, 0.07, '#4a4f5a', x, 0, z);
  },
  floor_lamp: (p) => {
    p.cyl(0.12, 0.04, '#4a4f5a', 0, 0, 0);
    p.cyl(0.025, 1.4, '#4a4f5a', 0, 0, 0);
    p.cyl(0.2, 0.3, '#fff0c2', 0, 1.35, 0, { emissive: true });
  },
  water_cooler: (p) => {
    p.box(0.45, 0.95, 0.4, '#e4e6ea', 0, 0, 0);
    p.cyl(0.17, 0.4, '#8fc3e8', 0, 0.95, 0, { emissive: true });
  },
  counter: (p, v) => {
    COUNTER(p);
    if (v === 'drawers') for (let i = 0; i < 2; i++) p.box(0.8, 0.02, 0.02, '#8a6a45', 0, 0.3 + i * 0.3, 0.48);
  },
  counter_sink: (p) => {
    COUNTER(p);
    p.box(0.5, 0.04, 0.4, '#b9c0ca', 0, 0.88, 0.02);
    p.cyl(0.02, 0.25, '#b9c0ca', 0, 0.9, -0.25);
  },
  coffee_machine: (p) => {
    COUNTER(p);
    p.box(0.5, 0.45, 0.4, '#3a3f4b', 0, 0.9, -0.05);
    p.box(0.1, 0.1, 0.02, '#e05a5a', 0.12, 1.15, 0.16, { emissive: true });
  },
  microwave: (p) => {
    COUNTER(p);
    p.box(0.6, 0.35, 0.45, '#c9ced6', 0, 0.9, 0);
    p.box(0.35, 0.22, 0.02, '#1c2230', -0.05, 0.96, 0.23);
  },
  fridge: (p) => {
    p.box(0.85, 1.85, 0.8, '#e4e6ea', 0, 0, 0);
    p.box(0.8, 0.02, 0.02, '#8d97a6', 0, 1.2, 0.41);
    p.box(0.04, 0.4, 0.04, '#8d97a6', 0.3, 1.25, 0.43);
  },
  vending_machine: (p) => {
    p.box(0.95, 1.95, 0.85, '#3a3f4b', 0, 0, 0);
    p.box(0.7, 1.1, 0.02, '#f4d58a', -0.05, 0.6, 0.44, { emissive: true });
  },
  cafe_table: (p) => {
    p.cyl(0.4, 0.05, '#e9e5dc', 0, 0.72, 0);
    p.cyl(0.05, 0.72, '#4a4f5a', 0, 0, 0);
    p.cyl(0.22, 0.03, '#4a4f5a', 0, 0, 0);
  },
  cafe_chair: (p) => chairModel(p, '#b98a5e'),
  sofa: (p) => {
    p.box(2.9, 0.4, 0.95, '#6e8ca8', 0, 0, 0);
    p.box(2.9, 0.55, 0.25, '#5a7893', 0, 0.4, -0.35);
    for (const x of [-1.38, 1.38]) p.box(0.16, 0.6, 0.9, '#5a7893', x, 0.3, 0);
    for (const x of [-0.7, 0.7]) p.box(0.9, 0.12, 0.62, '#7d9bb7', x, 0.4, 0.1);
  },
  armchair: (p) => {
    p.box(0.9, 0.38, 0.85, '#a9756a', 0, 0, 0);
    p.box(0.9, 0.55, 0.22, '#94625a', 0, 0.38, -0.32);
    for (const x of [-0.4, 0.4]) p.box(0.14, 0.5, 0.8, '#94625a', x, 0.3, 0);
  },
  coffee_table: (p) => {
    p.box(1.8, 0.06, 0.8, '#8a6a45', 0, 0.38, 0);
    for (const x of [-0.8, 0.8]) for (const z of [-0.3, 0.3]) p.box(0.06, 0.38, 0.06, '#4a4f5a', x, 0, z);
  },
  pingpong_table: (p) => {
    p.box(2.9, 0.07, 1.6, '#2f6fa8', 0, 0.74, 0);
    p.box(0.04, 0.18, 1.6, '#f4f4f4', 0, 0.81, 0);
    p.box(2.8, 0.01, 0.03, '#f4f4f4', 0, 0.81, 0);
    for (const x of [-1.3, 1.3]) for (const z of [-0.65, 0.65]) p.box(0.08, 0.74, 0.08, '#3a3f4b', x, 0, z);
  },
  beanbag: (p, v) => {
    p.ball(0.42, BEAN[v ?? 'red'], 0, 0.28, 0, 0.7);
  },
  arcade: (p) => {
    p.box(0.8, 1.7, 0.7, '#2b2f55', 0, 0, 0);
    p.box(0.6, 0.45, 0.02, '#4aa3f0', 0, 1.1, 0.36, { emissive: true });
    p.box(0.7, 0.1, 0.35, '#e05a5a', 0, 0.8, 0.45);
  },
  toilet_stall: (p) => {
    p.box(1.96, 1.6, 0.05, '#d6d9de', 0, 0.2, -0.95);
    p.box(0.05, 1.6, 1.9, '#d6d9de', -0.97, 0.2, 0);
    p.box(0.05, 1.6, 1.9, '#d6d9de', 0.97, 0.2, 0);
    p.box(0.7, 0.4, 0.5, '#f4f4f4', 0, 0, -0.55);
    p.box(0.5, 0.5, 0.2, '#f4f4f4', 0, 0.4, -0.78);
  },
  sink: (p) => {
    p.box(0.95, 0.8, 0.7, '#d9dfe3', 0, 0, 0);
    p.box(0.6, 0.05, 0.45, '#f4f4f4', 0, 0.8, 0.02);
    p.cyl(0.02, 0.25, '#b9c0ca', 0, 0.85, -0.2);
  },
  reception_desk: (p) => {
    p.box(2.9, 1.05, 0.85, '#7a5a45', 0, 0, 0);
    p.box(3.0, 0.07, 0.95, '#e9e5dc', 0, 1.05, 0);
    p.box(0.5, 0.35, 0.05, '#12161f', -0.6, 1.12, -0.1);
  },
  bench: (p) => {
    p.box(1.95, 0.08, 0.6, '#c9a273', 0, 0.42, 0);
    p.box(1.95, 0.5, 0.07, '#c9a273', 0, 0.55, -0.28);
    for (const x of [-0.85, 0.85]) p.box(0.06, 0.42, 0.5, '#3a3f4b', x, 0, 0);
  },
  bed: (p, v) => {
    const blanket = { blue: '#4a78c9', green: '#4aa56a', rose: '#d9779a' }[v ?? 'blue'] ?? '#4a78c9';
    p.box(0.95, 0.32, 1.9, '#8a6a45', 0, 0, 0);
    p.box(0.88, 0.14, 1.8, '#f1efe8', 0, 0.32, 0);
    p.box(0.98, 0.95, 0.1, '#6e5236', 0, 0, -0.97);
    p.box(0.6, 0.13, 0.34, '#ffffff', 0, 0.44, -0.66);
    p.box(0.9, 0.1, 1.05, blanket, 0, 0.44, 0.34);
    p.box(0.9, 0.04, 0.12, darkerHex(blanket), 0, 0.54, -0.18);
  },
  clothes_rack: (p, _v, s) => {
    for (const x of [-0.42, 0.42]) {
      p.box(0.04, 1.55, 0.04, '#8d97a6', x, 0, 0);
      p.box(0.04, 0.04, 0.5, '#8d97a6', x, 0, 0);
    }
    p.box(0.9, 0.04, 0.04, '#8d97a6', 0, 1.5, 0);
    const cols = ['#e05a8a', '#4a8fd8', '#f2c14e', '#4aa56a', '#8d66cf', '#e8803c', '#ffffff'];
    for (let i = 0; i < 7; i++) p.box(0.08, 0.7 + ((s + i) % 3) * 0.08, 0.34, cols[(i + s) % cols.length], -0.36 + i * 0.12, 0.78, 0);
  },
  shop_shelf: (p, v, s) => {
    p.box(1.96, 1.7, 0.42, '#d6cfc2', 0, 0, -0.28);
    const cols = ['#e05a8a', '#4a8fd8', '#f2c14e', '#4aa56a', '#8d66cf', '#e8803c'];
    for (let r = 0; r < 4; r++) {
      p.box(1.9, 0.03, 0.4, '#8a6a45', 0, 0.3 + r * 0.4, -0.27);
      for (let i = 0; i < 6; i++) {
        if (v === 'games') p.box(0.2, 0.3, 0.06, cols[(i + r + s) % cols.length], -0.78 + i * 0.3, 0.33 + r * 0.4, -0.2);
        else p.box(0.24, 0.12 + ((i + r) % 2) * 0.05, 0.3, cols[(i + r * 2 + s) % cols.length], -0.78 + i * 0.3, 0.33 + r * 0.4, -0.25);
      }
    }
  },
  mannequin: (p, v) => {
    const c = v === 'pink' ? '#e87ba7' : '#4a78c9';
    p.cyl(0.25, 0.04, '#3a3f4b', 0, 0, 0);
    p.cyl(0.04, 0.8, '#8d97a6', 0, 0.04, 0);
    p.box(0.4, 0.6, 0.22, c, 0, 0.8, 0);
    p.box(0.42, 0.45, 0.24, '#2f3548', 0, 0.36, 0);
    p.cyl(0.06, 0.1, '#e8d9c8', 0, 1.4, 0);
    p.ball(0.12, '#e8d9c8', 0, 1.58, 0);
  },
  treadmill: (p) => {
    p.box(0.8, 0.14, 1.75, '#2b2f38', 0, 0.05, 0.1);
    p.box(0.6, 0.03, 1.55, '#4a4f5a', 0, 0.19, 0.1);
    for (const x of [-0.4, 0.4]) p.box(0.05, 1.05, 0.05, '#8d97a6', x, 0.05, -0.7);
    p.box(0.85, 0.4, 0.12, '#1b1f29', 0, 1.0, -0.78);
    p.box(0.6, 0.22, 0.02, '#4aa3f0', 0, 1.1, -0.715, { emissive: true });
  },
  punching_bag: (p) => {
    // suporte no teto, corrente e o saco de couro vermelho
    p.box(0.5, 0.08, 0.5, '#6d7583', 0, 2.55, 0);
    p.cyl(0.015, 0.75, '#9aa3b2', 0, 1.8, 0);
    p.cyl(0.24, 1.1, '#c0392b', 0, 0.75, 0);
    p.cyl(0.25, 0.08, '#2a2e38', 0, 1.78, 0);
    p.cyl(0.25, 0.08, '#2a2e38', 0, 0.72, 0);
    p.cyl(0.34, 0.03, '#2f3a66', 0, 0, 0);
  },
  weapon_rack: (p) => {
    p.box(1.9, 1.7, 0.1, '#7a5a45', 0, 0.1, -0.35);
    for (const x of [-0.7, -0.4, -0.1, 0.35, 0.65]) {
      p.box(0.07, 1.4, 0.06, '#d9b88e', x, 0.25, -0.27);
      p.box(0.12, 0.06, 0.07, '#3a3f4b', x, 0.9, -0.27);
    }
    for (const [x, c] of [[0.85, '#f4f4f0'], [0.93, '#f2c14e'], [0.77, '#4cae6a']] as const) p.box(0.05, 0.7, 0.02, c, x, 0.95, -0.28);
  },
  trophy_case: (p) => {
    p.box(1.9, 1.8, 0.5, '#5a4a3c', 0, 0, -0.25);
    p.box(1.7, 1.55, 0.04, '#1c2230', 0, 0.12, -0.02);
    for (const [x, y] of [[-0.55, 0.35], [0, 0.35], [0.55, 0.35], [-0.35, 0.95], [0.35, 0.95]] as const) {
      p.cyl(0.11, 0.3, '#f2c14e', x, y, -0.05);
      p.cyl(0.04, 0.12, '#c99a2e', x, y - 0.1, -0.05);
    }
    p.box(1.7, 1.55, 0.03, '#a8d4ee', 0, 0.12, 0.0, { opacity: 0.25 });
  },
  shooting_booth: (p) => {
    // balcão de madeira com divisórias dos lados, abafadores e o painel da raia
    for (const x of [-0.45, 0.45]) p.box(0.08, 1.2, 0.9, '#4a5a80', x, 0, 0);
    p.box(0.86, 0.85, 0.7, '#8a6a45', 0, 0, -0.05);
    p.box(0.96, 0.06, 0.8, '#c9a273', 0, 0.85, -0.05);
    p.box(0.22, 0.12, 0.2, '#2a2e38', -0.2, 0.91, 0.05);
    p.box(0.14, 0.14, 0.04, '#1c2230', 0.22, 0.91, -0.1, { emissive: false });
  },
  target_stand: (p) => {
    // poste, alvo de papel com anéis vermelhos e brancos (discos finos de frente para o sul) e a base
    p.cyl(0.04, 1.2, '#6e5236', 0, 0, 0);
    p.box(0.5, 0.05, 0.3, '#4a4f5a', 0, 0, 0);
    for (const [r, c] of [[0.42, '#f4f4f0'], [0.36, '#c0392b'], [0.26, '#f4f4f0'], [0.18, '#c0392b'], [0.07, '#2a2e38']] as const) {
      const ring = p.cyl(r, 0.02, c, 0, 1.35, 0.06);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.35;
      ring.position.z += (0.42 - r) * 0.06;
    }
  },
  goal: (p, v) => {
    // moldura (traves e travessão) e a rede ao fundo; 'west' tem a rede a oeste (boca virada para leste)
    const dir = v === 'east' ? 1 : -1;
    for (const z of [-1.45, 1.45]) p.box(0.1, 2.0, 0.1, '#f4f4f0', -dir * 0.4, 0, z);
    p.box(0.1, 0.1, 2.9, '#f4f4f0', -dir * 0.4, 1.95, 0);
    p.box(0.04, 1.95, 2.9, '#dfe7ef', dir * 0.45, 0, 0, { opacity: 0.3 });
    p.box(0.9, 0.04, 2.9, '#dfe7ef', dir * 0.0, 1.95, 0, { opacity: 0.3 });
    for (const z of [-1.45, 1.45]) p.box(0.9, 0.04, 0.04, '#cfd6de', dir * 0.0, 0.02, z);
  },
  kart: (p, v) => {
    // chassi baixo na cor da variante virado para leste, quatro rodas, banco, volante e aerofólio
    const color = ({ red: '#d9473d', blue: '#3f7fd8', green: '#3fae5a', yellow: '#f2c14e' } as Record<string, string>)[v ?? 'red'] ?? '#d9473d';
    p.box(0.8, 0.16, 0.5, color, 0, 0.1, 0);
    p.box(0.3, 0.12, 0.3, color, 0.45, 0.1, 0);
    p.box(0.08, 0.3, 0.6, '#2a2e38', -0.42, 0.1, 0);
    p.box(0.24, 0.3, 0.3, '#2a2e38', -0.12, 0.26, 0);
    p.box(0.04, 0.2, 0.16, '#e8e8ee', 0.18, 0.26, 0);
    for (const [x, z] of [[-0.3, -0.3], [-0.3, 0.3], [0.38, -0.27], [0.38, 0.27]] as const) {
      const w = p.cyl(0.13, 0.1, '#23262e', x, 0.13, z);
      w.rotation.x = Math.PI / 2;
    }
  },
  weight_bench: (p) => {
    p.box(1.3, 0.12, 0.42, '#2b2f38', -0.2, 0.42, 0);
    for (const x of [-0.7, 0.1]) p.box(0.06, 0.42, 0.4, '#8d97a6', x, 0, 0);
    for (const x of [-0.7, 0.7]) p.box(0.06, 1.0, 0.06, '#8d97a6', x, 0, -0.18);
    const bar = p.cyl(0.025, 1.9, '#c3cad4', 0, 1.0, -0.18);
    bar.rotation.z = Math.PI / 2;
    for (const x of [-0.82, 0.82]) {
      const plate = p.cyl(0.2, 0.08, '#3a3f4b', x, 1.0, -0.18);
      plate.rotation.z = Math.PI / 2;
    }
  },
  dumbbell_rack: (p, _v, s) => {
    p.box(1.9, 0.12, 0.42, '#3a3f4b', 0, 0.55, 0);
    p.box(1.9, 0.12, 0.42, '#3a3f4b', 0, 0.2, 0);
    for (const x of [-0.9, 0.9]) p.box(0.06, 0.75, 0.42, '#3a3f4b', x, 0, 0);
    for (let i = 0; i < 6; i++) {
      for (const [y, z] of [[0.67, 0], [0.32, 0]] as const) {
        const d = p.cyl(0.07 + ((i + s) % 3) * 0.015, 0.2, ['#3a3f4b', '#e05a5a', '#4a78c9'][(i + s) % 3], -0.75 + i * 0.3, y, z);
        d.rotation.x = Math.PI / 2;
      }
    }
  },
  food_counter: (p, v) => {
    const c = { pizza: '#d9534f', burger: '#e8b93c', sushi: '#4a8fd8', sorvete: '#e87ba7' }[v ?? 'pizza'] ?? '#d9534f';
    p.box(2.9, 1.0, 0.8, '#d8b98f', 0, 0, 0.02);
    p.box(3.0, 0.06, 0.9, '#eceae5', 0, 1.0, 0.02);
    p.box(2.9, 0.5, 0.06, c, 0, 1.9, -0.36);
    p.box(2.3, 0.3, 0.02, '#fff7e0', 0, 1.9, -0.325, { emissive: true });
    p.box(0.7, 0.28, 0.5, '#3a3f4b', 0.8, 1.06, 0);
    for (let i = 0; i < 4; i++) p.cyl(0.12, 0.1, c, -1.0 + i * 0.35, 1.06, 0.1);
  },
  fountain: (p) => {
    p.cyl(0.95, 0.35, '#aeb4bd', 0, 0, 0);
    p.cyl(0.82, 0.05, '#6fb7e8', 0, 0.32, 0, { emissive: true });
    p.cyl(0.13, 0.95, '#aeb4bd', 0, 0.3, 0);
    p.cyl(0.45, 0.14, '#aeb4bd', 0, 1.1, 0);
    p.cyl(0.38, 0.03, '#6fb7e8', 0, 1.22, 0, { emissive: true });
  },
  stairs: (p) => {
    for (let i = 0; i < 14; i++) p.box(1.9, 0.12, 0.5, i % 2 ? '#d9b88e' : '#c9a273', 0, 0.12 * i, -3.2 + i * 0.5);
  },
};

// a mesa vista do outro lado é a mesma mesa girada (furnitureFacing)
BUILDERS.desk_back = BUILDERS.desk;

/** Os tipos de móvel que têm modelo 3D (um teste garante que todo móvel de chão do catálogo tem). */
export const MODELED_KINDS: readonly FurnitureKind[] = Object.keys(BUILDERS) as FurnitureKind[];

/** Cor que identifica o tipo quando não há modelo: caixa cinza do tamanho do footprint (móveis novos do catálogo). */
function fallback(p: Piece): void {
  p.box(Math.max(0.3, p.w - 0.1), 0.8, Math.max(0.3, p.d - 0.1), '#9aa3b2', 0, 0, 0);
}

/** Constrói o modelo do móvel (no espaço local do footprint, olhando para o sul). */
export function buildFurniture(kind: FurnitureKind, variant: string | undefined, seed: number, paint: Painter, w: number, d: number): THREE.Group {
  const p = new Piece(paint, w, d);
  (BUILDERS[kind] ?? fallback)(p, variant, seed);
  return p.group;
}

/** Móveis cujo modelo olha na direção de `variant` (cadeira, poltrona...), em vez de sempre para o sul. */
export function furnitureFacing(kind: FurnitureKind, variant: string | undefined): Facing {
  switch (kind) {
    case 'office_chair':
      return 'up';
    case 'office_chair_front':
      return 'down';
    case 'desk_back':
      return 'up';
    case 'cafe_chair':
    case 'armchair':
    case 'sofa':
      return variant === 'up' || variant === 'left' || variant === 'right' || variant === 'down' ? variant : 'down';
    default:
      return 'down';
  }
}

/** Altura (y) do assento de um móvel: onde o personagem senta. */
export function seatHeight(kind: FurnitureKind | undefined): number {
  switch (kind) {
    case 'sofa':
      return 0.42;
    case 'armchair':
      return 0.4;
    case 'beanbag':
      return 0.34;
    case 'bench':
      return 0.5;
    case 'bed':
      return 0.5;
    case 'stool':
      return 0.55;
    case 'kart':
      return 0.22;
    case 'cafe_chair':
    case 'office_chair':
    case 'office_chair_front':
      return 0.4;
    default:
      return 0.45;
  }
}
