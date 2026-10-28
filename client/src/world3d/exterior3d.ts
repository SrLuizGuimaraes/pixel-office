// O terreno em volta do escritório e do shopping (o mesmo da vista 2D: layout/exterior.ts): gramado, calçadas, rua, caminhos,
// árvores, cercas vivas, postes, bancos e o totem da entrada, em 3D. Reconstruído quando o prédio cresce.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/hash';
import type { Sim } from '../world/sim/sim';
import { layoutExterior, type ExteriorLayout } from '../world/layout/exterior';
import type { ExteriorProp, FloorPatch } from '../world/layout/types';
import { mapX, mapZ } from './mapping';
import { floorTexture } from './textures';

const TILE = 16;
const GROUND_Y: Partial<Record<FloorPatch['kind'], number>> = { grass: -0.14, sidewalk: -0.07, street: -0.09, wood: -0.05, concrete: -0.07 };

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, rough = 0.9): THREE.MeshStandardMaterial {
  let m = matCache.get(color + rough);
  if (!m) matCache.set(color + rough, (m = new THREE.MeshStandardMaterial({ color, roughness: rough })));
  return m;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 10, 8);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE = new THREE.ConeGeometry(1, 1, 9);

function put(g: THREE.Group, geo: THREE.BufferGeometry, color: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Peça do terreno (árvore, poste...) com a base em y = 0, no espaço local. */
export function propObject(p: ExteriorProp): THREE.Group {
  const g = new THREE.Group();
  const rng = mulberry32(p.seed >>> 0);
  switch (p.kind) {
    case 'tree': {
      const h = 2.2 + rng() * 2.2;
      put(g, CYL, '#7a5a3c', 0.16, h * 0.55, 0.16, 0, h * 0.275, 0);
      const c = ['#4a9a4f', '#5aa95c', '#3f8f4f', '#68b25e'][Math.floor(rng() * 4)];
      put(g, SPHERE, c, 1.2 + rng() * 0.4, 1.1 + rng() * 0.3, 1.2 + rng() * 0.4, 0, h * 0.78, 0);
      break;
    }
    case 'pine': {
      const h = 2.6 + rng() * 1.6;
      put(g, CYL, '#6e4f34', 0.15, h * 0.4, 0.15, 0, h * 0.2, 0);
      for (let i = 0; i < 3; i++) put(g, CONE, '#2f7a52', 1.05 - i * 0.26, 1.3, 1.05 - i * 0.26, 0, h * 0.4 + i * 0.75 + 0.65, 0);
      break;
    }
    case 'bush':
      put(g, SPHERE, ['#4f9a55', '#5aa860', '#43904b'][Math.floor(rng() * 3)], 0.55, 0.42, 0.55, 0, 0.3, 0);
      break;
    case 'flowers': {
      put(g, BOX, '#4f8f4a', 0.95, 0.25, 0.4, 0, 0.12, 0, false);
      const cols = ['#e05a8a', '#f2c14e', '#ffffff', '#8d66cf'];
      for (let i = 0; i < 6; i++) put(g, SPHERE, cols[(i + (p.seed % 4)) % 4], 0.07, 0.07, 0.07, -0.4 + i * 0.16, 0.3, (i % 2) * 0.1 - 0.05, false);
      break;
    }
    case 'hedge':
      put(g, BOX, '#3f8a47', 1.9, 0.7, 0.55, 0, 0.35, 0);
      break;
    case 'lamp':
      put(g, CYL, '#3a3f4b', 0.06, 3.2, 0.06, 0, 1.6, 0);
      put(g, BOX, '#3a3f4b', 0.5, 0.06, 0.1, 0.2, 3.2, 0, false);
      put(g, SPHERE, '#fff0c2', 0.17, 0.12, 0.17, 0.4, 3.1, 0, false).material = new THREE.MeshStandardMaterial({ color: '#fff0c2', emissive: '#ffd98a', emissiveIntensity: 0.9 });
      break;
    case 'bench':
      put(g, BOX, '#c9a273', 1.9, 0.1, 0.55, 0, 0.5, 0);
      put(g, BOX, '#c9a273', 1.9, 0.5, 0.08, 0, 0.8, -0.25);
      for (const x of [-0.8, 0.8]) put(g, BOX, '#3a3f4b', 0.08, 0.5, 0.5, x, 0.25, 0);
      break;
    case 'rock':
      put(g, SPHERE, '#8e949e', 0.5, 0.32, 0.45, 0, 0.2, 0);
      break;
    case 'parasol': {
      put(g, CYL, '#e9e5dc', 0.05, 2.2, 0.05, 0, 1.1, 0);
      const c = ['#e05a5a', '#4a8fd8', '#e8b93c', '#4aa56a'][Math.floor(rng() * 4)];
      put(g, CONE, c, 1.5, 0.55, 1.5, 0, 2.35, 0);
      put(g, CYL, '#e9e5dc', 0.4, 0.05, 0.4, 0, 0.74, 0.0, false);
      break;
    }
    case 'totem':
      put(g, BOX, '#2f3548', 0.9, 2.6, 0.5, 0, 1.3, 0);
      put(g, BOX, '#4aa3f0', 0.6, 0.5, 0.02, 0, 2.0, 0.26, false).material = new THREE.MeshStandardMaterial({ color: '#4aa3f0', emissive: '#4aa3f0', emissiveIntensity: 0.6 });
      break;
    case 'paving':
      put(g, BOX, '#cfcac0', 2, 0.03, 3, 0, 0.0, 1.5, false);
      break;
  }
  return g;
}

/** Posição 3D de uma peça do terreno (a base: x e y em px do mundo). */
export function propPosition(p: ExteriorProp, out: THREE.Vector3): THREE.Vector3 {
  return out.set(mapX(p.x / TILE), 0, mapZ(p.y / TILE));
}

export function floorPlane(patch: FloorPatch, index: number): THREE.Mesh {
  const x0 = mapX(patch.x / TILE);
  const x1 = mapX((patch.x + patch.w) / TILE);
  const z0 = mapZ(patch.y / TILE);
  const z1 = mapZ((patch.y + patch.h) / TILE);
  const w = x1 - x0;
  const d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2, (uv.getY(i) * d) / 2);
  const m = new THREE.MeshStandardMaterial({
    color: patch.kind === 'wood' ? '#ffffff' : (patch.tint ?? '#ffffff'),
    map: floorTexture(patch.kind),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -Math.min(index, 40) * 0.5,
    polygonOffsetUnits: -Math.min(index, 40),
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, GROUND_Y[patch.kind] ?? -0.07, (z0 + z1) / 2);
  mesh.receiveShadow = true;
  return mesh;
}

export class ExteriorScene {
  readonly root = new THREE.Group();
  private key = '';
  private layout: ExteriorLayout | null = null;
  /** Cercas vivas que só existem quando há sala no slot. */
  private conditional: { obj: THREE.Object3D; slot: number }[] = [];

  constructor(private readonly sim: Sim) {}

  get current(): ExteriorLayout | null {
    return this.layout;
  }

  sync(): void {
    const b = this.sim.building;
    const key = `${b.cols}:${b.mall ? 1 : 0}`;
    if (key === this.key) return;
    this.key = key;
    this.root.clear();
    this.conditional = [];
    const ext = layoutExterior(b.cols, !!b.mall);
    this.layout = ext;
    ext.floors.forEach((f, i) => this.root.add(floorPlane(f, i)));
    const v = new THREE.Vector3();
    for (const p of ext.props) {
      const o = propObject(p);
      o.position.copy(propPosition(p, v));
      this.root.add(o);
      if (p.whenRoom !== undefined) this.conditional.push({ obj: o, slot: p.whenRoom });
    }
  }

  update(): void {
    if (!this.conditional.length) return;
    const occupied = new Set<number>();
    for (const r of this.sim.rooms.values()) if (r.present) occupied.add(r.slot);
    for (const c of this.conditional) c.obj.visible = occupied.has(c.slot);
  }
}
