// O céu, o sol/lua e os carros da rua da vista 3D (o terreno em si é de exterior3d.ts). A luz segue a hora local com as
// mesmas chaves do ciclo dia/noite do mundo 2D (world/render/daylight.ts).
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/hash';
import type { ExteriorLayout } from '../world/layout/exterior';
import { ambientAt } from '../world/render/daylight';
import { mapX, mapZ } from './mapping';

const TILE = 16;

export class Environment {
  readonly root = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xffffff, 1.4);
  readonly hemi = new THREE.HemisphereLight(0xdfe9ff, 0x6b7a5a, 0.6);
  private night = 0;
  private readonly sky = new THREE.Color('#bcd6f2');
  private cars: { g: THREE.Group; dir: 1 | -1; speed: number; x: number; min: number; max: number; axis: 'x' | 'z' }[] = [];
  private focus = new THREE.Vector3(20, 0, 14);
  private laneKey = '';

  constructor(private readonly scene: THREE.Scene) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.root.add(this.sun, this.sun.target, this.hemi);
    scene.background = this.sky;
    scene.fog = new THREE.Fog(this.sky, 220, 520);
    this.update(13, 0);
  }

  /** Ajusta a sombra do sol para cobrir a área mostrada (centro e tamanho em tiles 3D). */
  fit(cx: number, cz: number, w: number, d: number): void {
    this.focus.set(cx, 0, cz);
    const r = Math.max(w, d) * 0.62 + 8;
    const s = this.sun.shadow.camera;
    s.left = -r;
    s.right = r;
    s.top = r;
    s.bottom = -r;
    s.near = 1;
    s.far = 320;
    s.updateProjectionMatrix();
    this.sun.target.position.copy(this.focus);
  }

  /** Recria os carros nas faixas da rua do terreno atual. */
  setLanes(ext: ExteriorLayout): void {
    const key = ext.lanes.map((l) => `${l.y}:${l.dir}`).join(',') + ext.vlanes.map((l) => `${l.x}:${l.dir}:${l.y0}:${l.y1}`).join(',') + `:${ext.bounds.x}:${ext.bounds.w}`;
    if (key === this.laneKey) return;
    this.laneKey = key;
    for (const c of this.cars) this.root.remove(c.g);
    this.cars = [];
    const rng = mulberry32(0xca12);
    const colors = ['#d9534f', '#4a78c9', '#e8b93c', '#4aa56a', '#e9e5dc', '#8d66cf'];
    const min = mapX(ext.bounds.x);
    const max = mapX(ext.bounds.x + ext.bounds.w);
    ext.lanes.forEach((lane, li) => {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.0), new THREE.MeshStandardMaterial({ color: colors[(li * 3 + i) % colors.length], roughness: 0.5 }));
        body.position.y = 0.45;
        body.castShadow = true;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.9), new THREE.MeshStandardMaterial({ color: '#bcd6f2', roughness: 0.2 }));
        cab.position.set(-0.1, 0.9, 0);
        cab.castShadow = true;
        g.add(body, cab);
        g.position.set(0, -0.06, mapZ(lane.y / TILE));
        g.rotation.y = lane.dir > 0 ? 0 : Math.PI;
        this.root.add(g);
        this.cars.push({ g, dir: lane.dir, speed: 2 + rng() * 2.4, x: min + ((i + rng()) / 3) * (max - min), min, max, axis: 'x' });
      }
    });
    // ruas norte-sul: o mesmo carro, girado, andando em z
    ext.vlanes.forEach((lane, li) => {
      const zmin = mapZ(lane.y0 / TILE);
      const zmax = mapZ(lane.y1 / TILE);
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.0), new THREE.MeshStandardMaterial({ color: colors[(li * 2 + i + 2) % colors.length], roughness: 0.5 }));
        body.position.y = 0.45;
        body.castShadow = true;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.9), new THREE.MeshStandardMaterial({ color: '#bcd6f2', roughness: 0.2 }));
        cab.position.set(-0.1, 0.9, 0);
        cab.castShadow = true;
        g.add(body, cab);
        g.position.set(mapX(lane.x / TILE), -0.06, 0);
        g.rotation.y = lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.root.add(g);
        this.cars.push({ g, dir: lane.dir, speed: 2 + rng() * 2.4, x: zmin + ((i + rng()) / 2) * (zmax - zmin), min: zmin, max: zmax, axis: 'z' });
      }
    });
  }

  /** Ajusta sol/lua, céu e luz ambiente pela hora (fracionária, 0 a 24) e anda com os carros. */
  update(hour: number, dt: number): void {
    const a = ambientAt(hour);
    this.night = a.night;
    // arco do sol: nasce a leste às 6 h, pino ao meio-dia, põe a oeste às 18 h; à noite a lua faz o caminho
    const moon = a.night > 0.5;
    const t = moon ? (((hour >= 18 ? hour - 18 : hour + 6) / 12) % 1) : Math.max(0, Math.min(1, (hour - 6) / 12));
    const ang = t * Math.PI;
    const el = Math.sin(ang);
    const f = this.focus;
    this.sun.position.set(f.x - Math.cos(ang) * 90, 25 + el * 80, f.z + 40);
    this.sun.color.set(moon ? '#9db4ff' : `rgb(${a.outside[0]},${a.outside[1]},${a.outside[2]})`);
    this.sun.intensity = moon ? 0.4 : 0.5 + 1.1 * el * (1 - a.night);
    this.hemi.intensity = 0.28 + 0.55 * (1 - a.night);
    this.hemi.color.set(moon ? '#6d7bb0' : '#dfe9ff');
    const sky = new THREE.Color(`rgb(${Math.round(a.outside[0] * 0.74)},${Math.round(a.outside[1] * 0.84)},${a.outside[2]})`);
    this.sky.lerp(sky, dt > 0 ? Math.min(1, dt * 2) : 1);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.sky);
    for (const c of this.cars) {
      c.x += c.speed * dt * c.dir;
      if (c.x > c.max) c.x = c.min;
      if (c.x < c.min) c.x = c.max;
      if (c.axis === 'x') c.g.position.x = c.x;
      else c.g.position.z = c.x;
    }
  }

  get nightness(): number {
    return this.night;
  }
}
