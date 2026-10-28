// Personagens em 3D no estilo simulação de vida: corpo liso (cabeça com rosto, tronco afunilado, membros em cápsula; ver body3d.ts)
// vestido com as cores da aparência do agente (art/api.ts Appearance) e animado por pose (andar, sentar, digitar, cochilar...).
import * as THREE from 'three';
import type { Appearance, Dir, HeldItem, Pose } from '../art/api';
import type { Character } from '../world/sim/character';
import { YAW } from './furniture3d';
import { HIP_Y, NECK_Y, SHOULDER_Y, buildArm, buildHead, buildLeg, buildTorso, setMouth } from './body3d';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 12, 9);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const mats = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: string, opts: { emissive?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = color + (opts.emissive ? 'e' : '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
    if (opts.emissive) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 0.8;
    }
    mats.set(key, m);
  }
  return m;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number, emissive = false): THREE.Mesh {
  const m = new THREE.Mesh(BOX, mat(color, { emissive }));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function ball(parent: THREE.Object3D, r: number, color: string, x: number, y: number, z: number, sy = 1): THREE.Mesh {
  const m = new THREE.Mesh(SPHERE, mat(color));
  m.scale.set(r, r * sy, r);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Item na mão direita, na ponta do braço. */
function heldMesh(kind: HeldItem): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (kind) {
    case 'coffee': {
      const m = new THREE.Mesh(CYL, mat('#e9e5dc'));
      m.scale.set(0.05, 0.1, 0.05);
      g.add(m);
      const top = new THREE.Mesh(CYL, mat('#5a3a22'));
      top.scale.set(0.045, 0.01, 0.045);
      top.position.y = 0.05;
      g.add(top);
      break;
    }
    case 'water': {
      const m = new THREE.Mesh(CYL, mat('#9fd0ee'));
      m.scale.set(0.045, 0.12, 0.045);
      g.add(m);
      break;
    }
    case 'papers':
      box(g, 0.2, 0.02, 0.28, '#f4f4f0', 0, 0, 0);
      break;
    case 'laptop':
      box(g, 0.34, 0.025, 0.24, '#8d97a6', 0, 0, 0);
      box(g, 0.34, 0.22, 0.02, '#3a3f4b', 0, 0.12, -0.12);
      box(g, 0.28, 0.16, 0.005, '#4aa3f0', 0, 0.12, -0.108, true);
      break;
    case 'book':
      box(g, 0.2, 0.04, 0.26, '#8d66cf', 0, 0, 0);
      break;
    case 'box':
      box(g, 0.26, 0.2, 0.26, '#c99a5e', 0, 0, 0);
      break;
    case 'paddle': {
      const m = new THREE.Mesh(CYL, mat('#d94a4a'));
      m.scale.set(0.1, 0.015, 0.1);
      m.rotation.x = Math.PI / 2;
      m.position.set(0, 0.05, 0.1);
      g.add(m);
      break;
    }
    case 'popcorn':
      box(g, 0.14, 0.18, 0.14, '#d94a4a', 0, 0, 0);
      ball(g, 0.1, '#fff2c2', 0, 0.12, 0);
      break;
    case 'controller':
      box(g, 0.2, 0.05, 0.1, '#2b2f38', 0, 0, 0);
      break;
    case 'phone':
      box(g, 0.07, 0.13, 0.015, '#14171f', 0, 0, 0);
      box(g, 0.055, 0.1, 0.005, '#4aa3f0', 0, 0, 0.01, true);
      break;
    default:
      return null;
  }
  return g;
}

export class Character3D {
  readonly root = new THREE.Group();
  /** Corpo (a pose abaixa/gira por aqui). */
  private readonly body = new THREE.Group();
  private readonly legUL = new THREE.Group();
  private readonly legUR = new THREE.Group();
  private readonly legLL = new THREE.Group();
  private readonly legLR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly hand = new THREE.Group();
  private ring: THREE.Mesh;
  private mouth!: THREE.Mesh;
  private eyes: THREE.Object3D[] = [];
  private gesture: 'smile' | 'wide' | 'pout' | 'calm' = 'calm';
  private heldKind: HeldItem = 'none';
  private heldObj: THREE.Object3D | null = null;
  private yaw = 0;
  private lastPos = new THREE.Vector3();
  private moving = 0;
  private readonly phase: number;
  /** Posição do alvo no quadro (para a UI posicionar rótulos). */
  readonly headWorld = new THREE.Vector3();

  constructor(
    readonly id: string,
    private a: Appearance,
    seed: number,
  ) {
    this.phase = (seed % 100) / 100 * Math.PI * 2;
    this.root.userData.agentId = id;
    this.root.add(this.body);
    this.build();
    // anel de seleção/hover no chão
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.root.add(this.ring);
    this.body.traverse((o) => {
      o.userData.agentId = id;
    });
  }

  private build(): void {
    const a = this.a;
    const b = this.body;
    // pernas: coxa no pivô do quadril, canela e pé no pivô do joelho
    for (const [up, low, x] of [[this.legUL, this.legLL, -0.09], [this.legUR, this.legLR, 0.09]] as const) {
      up.position.set(x, HIP_Y, 0);
      buildLeg(up, low, a);
      b.add(up);
    }
    this.torso.position.set(0, HIP_Y, 0);
    buildTorso(this.torso, a);
    b.add(this.torso);
    const armX = a.look === 'f' ? 0.225 : 0.245;
    for (const [arm, x] of [[this.armL, -armX], [this.armR, armX]] as const) {
      arm.position.set(x, SHOULDER_Y, 0);
      buildArm(arm, a);
      b.add(arm);
    }
    this.hand.position.set(0, -0.58, 0.02);
    this.armR.add(this.hand);
    this.head.position.set(0, NECK_Y, 0);
    const face = buildHead(this.head, a);
    this.mouth = face.mouth;
    this.eyes = face.eyes;
    b.add(this.head);
  }

  /** Troca a aparência (o agente foi editado). */
  setAppearance(a: Appearance): void {
    this.a = a;
    const keep = this.ring;
    this.body.clear();
    for (const g of [this.legUL, this.legUR, this.legLL, this.legLR, this.armL, this.armR, this.torso, this.head, this.hand]) g.clear();
    this.build();
    this.body.traverse((o) => {
      o.userData.agentId = this.id;
    });
    this.ring = keep;
  }

  setHighlight(selected: boolean, hovered: boolean): void {
    this.ring.visible = selected || hovered;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(selected ? '#ffd84a' : '#ffffff');
  }

  private setHeld(kind: HeldItem): void {
    if (kind === this.heldKind) return;
    this.heldKind = kind;
    if (this.heldObj) {
      this.hand.remove(this.heldObj);
      this.heldObj = null;
    }
    const m = heldMesh(kind);
    if (m) {
      this.hand.add(m);
      this.heldObj = m;
    }
  }

  /**
   * Atualiza posição, giro e pose. `p` = pés em 3D; `seat` = altura do assento quando sentado. `dir` = para onde a
   * simulação diz que ele olha (usado parado); andando, ele gira para o rumo do movimento.
   */
  update(p: THREE.Vector3, ch: Character, seatY: number | null, dt: number, now: number): void {
    const pose: Pose = ch.pose;
    const seated = seatY !== null && ch.seated;
    this.root.position.copy(p);
    const dx = p.x - this.lastPos.x;
    const dz = p.z - this.lastPos.z;
    const dist = Math.hypot(dx, dz);
    this.lastPos.copy(p);
    const walking = (pose === 'walk' || pose === 'run') && !seated;
    this.moving += ((dist > 1e-4 && walking ? 1 : 0) - this.moving) * Math.min(1, dt * 10);
    let target = YAW[ch.dir as Dir];
    if (walking && dist > 1e-4) target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * (walking ? 14 : 9));
    this.body.rotation.y = this.yaw;
    this.animate(pose, seated, seated ? (seatY as number) : 0, (ch.animT + this.phase * 300) / 1000, now / 1000, ch, dt);
    this.setHeld(ch.held);
    this.headWorld.set(p.x, p.y + (seated ? seatY! - HIP_Y + 0.06 : 0) + NECK_Y + 0.5, p.z);
  }

  /**
   * Quadro determinístico para o bake de sprites da vista isométrica (world/iso/bake.ts): sem suavização entre poses, rosto
   * virado para `yaw`, olhos abertos, sem anel. `t` = instante do ciclo da pose (s).
   */
  poseForBake(ch: { pose: Pose; held: HeldItem }, yaw: number, seatY: number | null, t: number): void {
    this.snap = true;
    this.ring.visible = false;
    const seated = seatY !== null;
    this.root.position.set(0, 0, 0);
    this.yaw = yaw;
    this.body.rotation.y = yaw;
    this.moving = (ch.pose === 'walk' || ch.pose === 'run') && !seated ? 1 : 0;
    const open = (((0.5 - this.phase) % 4.3) + 4.3) % 4.3;
    this.animate(ch.pose, seated, seatY ?? 0, t, open, {} as Character, 0.1);
    this.setHeld(ch.held);
    this.snap = false;
  }

  private snap = false;

  private animate(pose: Pose, seated: boolean, seatY: number, t: number, wall: number, _ch: Character, dt: number): void {
    const joints = [this.legUL, this.legUR, this.legLL, this.legLR, this.armL, this.armR, this.torso, this.head];
    const prev = joints.map((j) => [j.rotation.x, j.rotation.y, j.rotation.z]);
    const prevBody = this.body.position.y;
    const legs = [this.legUL, this.legUR, this.legLL, this.legLR];
    for (const g of legs) g.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.torso.position.y = HIP_Y;
    this.head.position.y = NECK_Y;
    this.armL.position.y = this.armR.position.y = SHOULDER_Y;
    this.body.position.y = 0;
    if (seated) {
      // quadril no assento: coxas para a frente, canelas para baixo
      this.body.position.y = seatY + 0.06 - HIP_Y;
      this.legUL.rotation.x = this.legUR.rotation.x = -Math.PI / 2;
      this.legLL.rotation.x = this.legLR.rotation.x = Math.PI / 2;
    }
    const sw = Math.sin(t * (pose === 'run' ? 13 : 8.5));
    switch (pose) {
      case 'walk':
      case 'run': {
        const k = this.moving * (pose === 'run' ? 1.05 : 0.7);
        this.legUL.rotation.x = sw * k;
        this.legUR.rotation.x = -sw * k;
        this.legLL.rotation.x = Math.max(0, -sw) * k * 1.1;
        this.legLR.rotation.x = Math.max(0, sw) * k * 1.1;
        this.armL.rotation.x = -sw * k * 0.9;
        this.armR.rotation.x = sw * k * 0.9;
        this.body.position.y += Math.abs(Math.cos(t * (pose === 'run' ? 13 : 8.5))) * 0.05 * this.moving;
        if (pose === 'run') this.torso.rotation.x = 0.18;
        break;
      }
      case 'type':
        this.armL.rotation.x = -1.15 + Math.sin(t * 14) * 0.06;
        this.armR.rotation.x = -1.15 + Math.sin(t * 14 + 2) * 0.06;
        this.head.rotation.x = 0.12;
        break;
      case 'sleep':
        this.head.rotation.x = 0.75 + Math.sin(t * 1.4) * 0.03;
        this.torso.rotation.x = 0.22;
        this.armL.rotation.x = -0.35;
        this.armR.rotation.x = -0.35;
        break;
      case 'drink':
        this.armR.rotation.x = -2.3;
        this.armR.rotation.z = -0.15;
        this.head.rotation.x = -0.1;
        break;
      case 'use':
        this.armR.rotation.x = -1.3;
        this.armL.rotation.x = -0.3 + Math.sin(t * 6) * 0.05;
        break;
      case 'raise_hand':
        this.armR.rotation.x = Math.PI;
        this.armR.rotation.z = -0.25 + Math.sin(t * 6) * 0.25;
        break;
      case 'talk':
        this.armR.rotation.x = -1.0 + Math.sin(t * 5) * 0.4;
        this.armL.rotation.x = -0.5 + Math.sin(t * 4 + 1) * 0.3;
        this.head.rotation.y = Math.sin(t * 2) * 0.2;
        break;
      case 'stretch':
        this.armL.rotation.x = this.armR.rotation.x = Math.PI - 0.15;
        this.armL.rotation.z = 0.2;
        this.armR.rotation.z = -0.2;
        this.torso.rotation.x = -0.12;
        break;
      case 'read':
        this.armL.rotation.x = -1.2;
        this.armR.rotation.x = -1.2;
        this.armL.rotation.z = 0.25;
        this.armR.rotation.z = -0.25;
        this.head.rotation.x = 0.35;
        break;
      case 'play':
        this.armR.rotation.x = -1.2 + Math.sin(t * 9) * 0.6;
        this.torso.rotation.y = Math.sin(t * 9) * 0.15;
        break;
      case 'wait':
        this.armL.rotation.x = -0.9;
        this.armR.rotation.x = -0.9;
        this.armL.rotation.z = 0.55;
        this.armR.rotation.z = -0.55;
        this.legUR.rotation.x += Math.sin(t * 5) * 0.08;
        break;
      case 'cheer':
        this.armL.rotation.x = this.armR.rotation.x = Math.PI - 0.1 + Math.sin(t * 12) * 0.2;
        this.body.position.y += Math.max(0, Math.sin(t * 8)) * 0.14;
        break;
      case 'laugh':
        this.torso.rotation.x = Math.sin(t * 20) * 0.08;
        this.armR.rotation.x = -0.5;
        this.head.rotation.x = -0.25;
        break;
      case 'game':
        this.armL.rotation.x = -1.15;
        this.armR.rotation.x = -1.15;
        this.armL.rotation.z = 0.2;
        this.armR.rotation.z = -0.2;
        this.torso.rotation.x = 0.1;
        break;
      case 'rps':
        this.armR.rotation.x = -1.2 + Math.sin(t * 8) * 0.5;
        break;
      case 'groom':
        this.armR.rotation.x = -2.1 + Math.sin(t * 4) * 0.2;
        break;
      case 'sulk':
        this.head.rotation.x = 0.5;
        this.torso.rotation.x = 0.12;
        break;
      case 'sit':
      case 'stand':
      default:
        // respiração sutil
        this.torso.position.y = HIP_Y + Math.sin(wall * 1.6 + this.phase) * 0.006;
        this.armL.rotation.z = 0.05;
        this.armR.rotation.z = -0.05;
        if (seated) {
          this.armL.rotation.x = -0.45;
          this.armR.rotation.x = -0.45;
        }
        break;
    }
    // transição suave entre poses: cada junta caminha para o alvo da pose nova em vez de saltar
    const k = this.snap ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 18);
    joints.forEach((j, i) => {
      j.rotation.x = prev[i][0] + (j.rotation.x - prev[i][0]) * k;
      j.rotation.y = prev[i][1] + (j.rotation.y - prev[i][1]) * k;
      j.rotation.z = prev[i][2] + (j.rotation.z - prev[i][2]) * k;
    });
    this.body.position.y = prevBody + (this.body.position.y - prevBody) * k;
    // rosto: gesto da boca pela pose e piscadas de tempos em tempos (dormindo, olhos fechados)
    const gesture = pose === 'laugh' ? 'wide' : pose === 'cheer' || pose === 'talk' || pose === 'play' || pose === 'rps' ? 'smile' : pose === 'sulk' ? 'pout' : 'calm';
    if (gesture !== this.gesture) {
      this.gesture = gesture;
      setMouth(this.mouth, gesture);
    }
    const bt = (wall + this.phase) % 4.3;
    const lid = pose === 'sleep' ? 0.08 : bt < 0.14 ? Math.max(0.1, Math.abs(bt - 0.07) / 0.07) : 1;
    for (const e of this.eyes) e.scale.y = lid;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

export { HIP_Y, NECK_Y };
