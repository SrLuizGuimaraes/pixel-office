// Corpo "Sims" dos personagens 3D: formas lisas (cápsulas, elipsoides e sólidos de revolução) no lugar das caixas, com rosto,
// cabelo, roupas e acessórios moldados. Só monta geometria (sem animação): characters3d.ts liga os pivôs e anima.
import * as THREE from 'three';
import type { Appearance } from '../art/api';

/** Alturas dos pivôs (tiles): quadril, ombro e pescoço, a partir do chão. */
export const LEG_UP = 0.42;
export const LEG_LOW = 0.42;
export const HIP_Y = LEG_UP + LEG_LOW;
export const SHOULDER_Y = HIP_Y + 0.56;
export const NECK_Y = HIP_Y + 0.64;
export const ARM_LEN = 0.58;
/** Centro da cabeça acima do pivô do pescoço. */
const HEAD_CY = 0.17;
const HEAD_R = { x: 0.155, y: 0.18, z: 0.165 };

const SHORT_SLEEVE = new Set(['tshirt', 'polo', 'blouse']);

const SPHERE = new THREE.SphereGeometry(1, 24, 16);
const capCache = new Map<string, THREE.CapsuleGeometry>();
const mats = new Map<string, THREE.MeshStandardMaterial>();

export function darker(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

type Kind = 'skin' | 'cloth' | 'hair' | 'gloss' | 'matte';
const SURFACE: Record<Kind, { rough: number; metal: number; emissive: number }> = {
  skin: { rough: 0.55, metal: 0, emissive: 0.07 },
  cloth: { rough: 0.85, metal: 0, emissive: 0 },
  hair: { rough: 0.45, metal: 0.05, emissive: 0.03 },
  gloss: { rough: 0.25, metal: 0.1, emissive: 0 },
  matte: { rough: 0.9, metal: 0, emissive: 0 },
};

/** Material em cache por cor e tipo de superfície (pele um pouco quente e brilhante, tecido fosco, cabelo com brilho). */
export function surface(color: string, kind: Kind = 'cloth', glow = false): THREE.MeshStandardMaterial {
  const key = `${kind}${glow ? 'g' : ''}:${color}`;
  let m = mats.get(key);
  if (!m) {
    const s = SURFACE[kind];
    m = new THREE.MeshStandardMaterial({ color, roughness: s.rough, metalness: s.metal });
    if (glow || s.emissive > 0) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = glow ? 0.8 : s.emissive;
    }
    mats.set(key, m);
  }
  return m;
}

function capsuleGeo(r: number, len: number): THREE.CapsuleGeometry {
  const key = `${r.toFixed(3)}:${len.toFixed(3)}`;
  let g = capCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14);
    capCache.set(key, g);
  }
  return g;
}

function place<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Elipsoide de semieixos rx, ry, rz. */
export function ell(parent: THREE.Object3D, rx: number, ry: number, rz: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(SPHERE, m);
  mesh.scale.set(rx, ry, rz);
  mesh.castShadow = true;
  return place(parent, mesh, x, y, z);
}

/** Cápsula vertical de raio r e comprimento total len, centrada em (x, y, z). */
export function cap(parent: THREE.Object3D, r: number, len: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(capsuleGeo(r, len), m);
  mesh.castShadow = true;
  return place(parent, mesh, x, y, z);
}

/** Cone/tronco de cone vertical (altura h, raios rTop e rBot). */
function taper(parent: THREE.Object3D, rTop: number, rBot: number, h: number, m: THREE.Material, x: number, y: number, z: number, sz = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true), m);
  mesh.scale.z = sz;
  mesh.castShadow = true;
  return place(parent, mesh, x, y, z);
}

// ------------------------------------------------------------------ pernas

/** Perna: coxa no pivô do quadril (`up`) e canela + pé no pivô do joelho (`low`, filho de `up`). */
export function buildLeg(up: THREE.Group, low: THREE.Group, a: Appearance): void {
  const style = a.bottomStyle ?? 'pants';
  const upperM = surface(style === 'skirt' ? a.skin : a.bottom, style === 'skirt' ? 'skin' : 'cloth');
  const lowerM = surface(style === 'pants' ? a.bottom : a.skin, style === 'pants' ? 'cloth' : 'skin');
  cap(up, 0.088, LEG_UP + 0.02, upperM, 0, -LEG_UP / 2 + 0.01, 0);
  ell(up, 0.078, 0.078, 0.078, lowerM === upperM ? upperM : lowerM, 0, -LEG_UP, 0);
  low.position.set(0, -LEG_UP, 0);
  const lowLen = LEG_LOW - 0.04;
  cap(low, 0.068, lowLen, lowerM, 0, -lowLen / 2, 0);
  // sapato arredondado, com a ponta para a frente (+z)
  ell(low, 0.08, 0.055, 0.15, surface(a.shoes, 'gloss'), 0, -LEG_LOW + 0.055, 0.045);
  up.add(low);
}

// ------------------------------------------------------------------ tronco

const TORSO_PTS: Record<'m' | 'f', [number, number][]> = {
  m: [[0.001, 0], [0.15, 0.005], [0.17, 0.05], [0.155, 0.2], [0.175, 0.38], [0.2, 0.5], [0.17, 0.575], [0.06, 0.615], [0.001, 0.63]],
  f: [[0.001, 0], [0.155, 0.005], [0.18, 0.05], [0.14, 0.2], [0.158, 0.38], [0.17, 0.5], [0.15, 0.575], [0.055, 0.615], [0.001, 0.63]],
};
const SPLIT_Y = 0.17;
const torsoCache = new Map<string, [THREE.LatheGeometry, THREE.LatheGeometry]>();

function torsoGeos(look: 'm' | 'f'): [THREE.LatheGeometry, THREE.LatheGeometry] {
  let g = torsoCache.get(look);
  if (!g) {
    const curve = new THREE.SplineCurve(TORSO_PTS[look].map(([r, y]) => new THREE.Vector2(r, y)));
    const pts = curve.getPoints(40);
    const lower = pts.filter((p) => p.y <= SPLIT_Y + 0.001).map((p) => new THREE.Vector2(p.x * 1.012, p.y));
    const upper = pts.filter((p) => p.y >= SPLIT_Y);
    g = [new THREE.LatheGeometry(lower, 28), new THREE.LatheGeometry(upper, 28)];
    torsoCache.set(look, g);
  }
  return g;
}

/** Tronco liso, afunilado na cintura (mais marcado em 'f'), com a parte de baixo na cor da calça/saia e as peças do estilo de camisa. */
export function buildTorso(torso: THREE.Group, a: Appearance): void {
  const look = a.look === 'f' ? 'f' : 'm';
  const [lowerG, upperG] = torsoGeos(look);
  const style = a.bottomStyle ?? 'pants';
  const lower = new THREE.Mesh(lowerG, surface(a.bottom, 'cloth'));
  const upper = new THREE.Mesh(upperG, surface(a.top, 'cloth'));
  for (const m of [lower, upper]) {
    m.scale.z = 0.62;
    m.castShadow = true;
    torso.add(m);
  }
  void style;
  const top = a.top;
  const chest = look === 'f' ? 0.17 : 0.19;
  switch (a.topStyle) {
    case 'hoodie':
      // capuz caído atrás do pescoço e bolso canguru
      ell(torso, 0.13, 0.07, 0.085, surface(darker(top, 0.85)), 0, 0.56, -0.06);
      ell(torso, 0.12, 0.07, 0.03, surface(darker(top, 0.9)), 0, 0.17, 0.095);
      break;
    case 'shirt_tie': {
      const tie = cap(torso, 0.018, 0.3, surface('#3a3f58'), 0, 0.33, 0.112);
      tie.scale.z = 0.5;
      ell(torso, 0.035, 0.03, 0.02, surface('#3a3f58'), 0, 0.5, 0.1);
      break;
    }
    case 'jacket':
      for (const x of [-0.045, 0.045]) cap(torso, 0.014, 0.36, surface(a.topAccent), x, 0.36, 0.105).scale.z = 0.5;
      break;
    case 'polo':
    case 'blouse': {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 8, 20), surface(darker(top, 0.88)));
      collar.rotation.x = Math.PI / 2 - 0.25;
      collar.scale.y = 0.9;
      place(torso, collar, 0, 0.6, 0.015);
      break;
    }
    case 'sweater': {
      const neck = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 20), surface(darker(top, 0.92)));
      neck.rotation.x = Math.PI / 2;
      place(torso, neck, 0, 0.61, 0);
      break;
    }
    default:
      break;
  }
  if (a.lanyard) {
    for (const x of [-0.05, 0.05]) {
      const strap = cap(torso, 0.012, 0.3, surface(a.lanyard), x, 0.44, 0.11);
      strap.rotation.z = x < 0 ? -0.2 : 0.2;
      strap.scale.z = 0.4;
    }
    const badge = ell(torso, 0.05, 0.06, 0.012, surface('#f4f4f0', 'matte'), 0, 0.22, chest * 0.58);
    badge.scale.z = 0.012;
  }
  if (style === 'skirt') {
    const skirt = taper(torso, 0.17, 0.27, 0.34, surface(a.bottom), 0, -0.07, 0, 0.78);
    (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  }
}

// ------------------------------------------------------------------ braços

/** Braço no pivô do ombro: manga (curta ou longa) na cor da camisa, antebraço e mão de pele. Retorna a mão (onde vai o item). */
export function buildArm(arm: THREE.Group, a: Appearance): void {
  const short = SHORT_SLEEVE.has(a.topStyle);
  const sleeve = surface(a.top, 'cloth');
  const skin = surface(a.skin, 'skin');
  ell(arm, 0.075, 0.075, 0.075, sleeve, 0, -0.01, 0);
  if (short) {
    cap(arm, 0.062, 0.26, sleeve, 0, -0.13, 0);
    cap(arm, 0.047, 0.34, skin, 0, -0.34, 0);
  } else {
    cap(arm, 0.056, ARM_LEN - 0.04, sleeve, 0, -(ARM_LEN - 0.04) / 2, 0);
  }
  ell(arm, 0.052, 0.062, 0.05, skin, 0, -ARM_LEN, 0.01);
}

// ------------------------------------------------------------------ cabeça

export interface FaceParts {
  /** Boca: o gesto muda com a pose (sorriso, bico, neutro). */
  mouth: THREE.Mesh;
  /** Pálpebras: escala y vai a ~0 numa piscada. */
  eyes: THREE.Object3D[];
}

function hairCap(parent: THREE.Object3D, m: THREE.Material, grow = 1.07, theta = 0.48 * Math.PI, tilt = -0.41): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, theta);
  const mesh = new THREE.Mesh(g, m);
  mesh.scale.set(HEAD_R.x * grow, HEAD_R.y * grow, HEAD_R.z * grow);
  mesh.rotation.x = tilt;
  mesh.castShadow = true;
  return place(parent, mesh, 0, HEAD_CY + 0.005, -0.008);
}

function addHair(head: THREE.Group, a: Appearance): void {
  const S = a.hairStyle;
  if (S === 'bald') return;
  const hm = surface(a.hair, 'hair');
  const spike = (x: number, y: number, z: number, h: number, r: number, rx = 0, rz = 0) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), hm);
    c.castShadow = true;
    c.rotation.set(rx, 0, rz);
    return place(head, c, x, y, z);
  };
  switch (S) {
    case 'buzz':
      hairCap(head, hm, 1.025);
      break;
    case 'short':
    case 'side_part':
      hairCap(head, hm);
      ell(head, 0.1, 0.045, 0.07, hm, S === 'side_part' ? 0.06 : 0, 0.3, 0.1).rotation.z = S === 'side_part' ? -0.25 : 0;
      break;
    case 'spiky':
      hairCap(head, hm);
      for (const [x, z, k] of [[-0.09, 0.03, 0.4], [0, 0.07, 0], [0.09, 0.03, -0.4], [-0.05, -0.07, 0.3], [0.05, -0.07, -0.3]] as const) spike(x, 0.37, z, 0.15, 0.05, 0, k);
      break;
    case 'mohawk':
      hairCap(head, hm, 1.02);
      for (let i = 0; i < 5; i++) ell(head, 0.035, 0.1 - Math.abs(i - 2) * 0.012, 0.045, hm, 0, 0.37, 0.1 - i * 0.065);
      break;
    case 'curly':
      hairCap(head, hm, 1.1);
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        ell(head, 0.065, 0.065, 0.065, hm, Math.cos(ang) * 0.12, 0.33 + (i % 2) * 0.01, Math.sin(ang) * 0.12 - 0.02);
      }
      ell(head, 0.075, 0.075, 0.075, hm, 0, 0.38, 0);
      break;
    case 'afro':
      ell(head, 0.255, 0.235, 0.245, hm, 0, 0.26, -0.03);
      break;
    case 'bob':
      hairCap(head, hm, 1.08);
      ell(head, 0.185, 0.15, 0.17, hm, 0, 0.1, -0.035);
      break;
    case 'long':
      hairCap(head, hm, 1.08);
      ell(head, 0.185, 0.17, 0.17, hm, 0, 0.1, -0.035);
      ell(head, 0.16, 0.34, 0.09, hm, 0, -0.1, -0.11);
      break;
    case 'wavy':
      hairCap(head, hm, 1.09);
      ell(head, 0.19, 0.18, 0.17, hm, 0, 0.09, -0.035);
      for (const [x, y] of [[-0.12, -0.02], [0.12, -0.02], [-0.07, -0.1], [0.07, -0.1], [0, -0.08]] as const) ell(head, 0.07, 0.09, 0.07, hm, x, y, -0.1);
      break;
    case 'ponytail': {
      hairCap(head, hm);
      const tail = cap(head, 0.05, 0.3, hm, 0, 0.08, -0.22);
      tail.rotation.x = -0.35;
      ell(head, 0.05, 0.05, 0.05, surface(darker(a.hair, 0.6)), 0, 0.22, -0.17);
      break;
    }
    case 'bun':
      hairCap(head, hm);
      ell(head, 0.095, 0.09, 0.095, hm, 0, 0.37, -0.07);
      break;
    case 'pigtails':
      hairCap(head, hm);
      for (const x of [-0.2, 0.2]) {
        ell(head, 0.07, 0.07, 0.07, hm, x, 0.22, -0.02);
        cap(head, 0.045, 0.2, hm, x * 1.05, 0.08, -0.03);
      }
      break;
  }
}

function addAccessory(head: THREE.Group, a: Appearance): void {
  const c = a.accessoryColor;
  switch (a.accessory) {
    case 'glasses':
    case 'sunglasses': {
      const sun = a.accessory === 'sunglasses';
      const frame = surface(sun ? '#15171d' : c, 'gloss');
      for (const x of [-0.065, 0.065]) {
        if (sun) {
          const lens = ell(head, 0.05, 0.036, 0.008, surface('#15171d', 'gloss'), x, 0.19, 0.16);
          lens.rotation.x = 0;
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.005, 8, 20), frame);
          ring.scale.y = 0.85;
          place(head, ring, x, 0.19, 0.158);
        }
      }
      const bridge = cap(head, 0.004, 0.04, frame, 0, 0.195, 0.162);
      bridge.rotation.z = Math.PI / 2;
      break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.011, 8, 28, Math.PI), surface(c, 'gloss'));
      band.rotation.z = 0;
      place(head, band, 0, HEAD_CY, 0);
      for (const x of [-0.165, 0.165]) {
        const cup = ell(head, 0.03, 0.062, 0.058, surface(c, 'gloss'), x, HEAD_CY, 0);
        cup.castShadow = true;
      }
      break;
    }
    case 'cap': {
      const m = surface(c, 'cloth');
      hairCap(head, m, 1.13, 0.4 * Math.PI, -0.1);
      ell(head, 0.11, 0.012, 0.09, m, 0, 0.295, 0.19);
      break;
    }
    case 'beanie': {
      const m = surface(c, 'cloth');
      hairCap(head, m, 1.14, 0.54 * Math.PI, -0.2);
      ell(head, 0.05, 0.05, 0.05, m, 0, 0.38, -0.03);
      break;
    }
    case 'earrings':
      for (const x of [-0.158, 0.158]) ell(head, 0.016, 0.016, 0.016, surface(c, 'gloss'), x, 0.08, 0.02);
      break;
    case 'bow': {
      const m = surface(c, 'cloth');
      ell(head, 0.055, 0.04, 0.03, m, 0.1, 0.34, 0.04).rotation.z = 0.5;
      ell(head, 0.055, 0.04, 0.03, m, 0.2, 0.31, 0.04).rotation.z = -0.5;
      ell(head, 0.02, 0.02, 0.02, m, 0.15, 0.325, 0.045);
      break;
    }
  }
}

function addFacialHair(head: THREE.Group, a: Appearance): void {
  const fh = a.facialHair;
  if (!fh || fh === 'none') return;
  const hm = surface(a.hair, 'hair');
  if (fh === 'stubble') {
    ell(head, 0.145, 0.085, 0.15, surface(darker(a.hair, 1.4), 'matte'), 0, 0.045, 0.012);
  } else if (fh === 'mustache') {
    const m = cap(head, 0.014, 0.1, hm, 0, 0.11, 0.152);
    m.rotation.z = Math.PI / 2;
  } else if (fh === 'goatee') {
    ell(head, 0.04, 0.045, 0.03, hm, 0, 0.03, 0.14);
    cap(head, 0.012, 0.07, hm, 0, 0.11, 0.152).rotation.z = Math.PI / 2;
  } else {
    ell(head, 0.15, 0.1, 0.13, hm, 0, 0.04, 0.045);
    cap(head, 0.014, 0.1, hm, 0, 0.115, 0.152).rotation.z = Math.PI / 2;
  }
}

/** Cabeça com pescoço, orelhas, rosto (olhos com íris, sobrancelhas, nariz, boca), cabelo, barba e acessório. */
export function buildHead(head: THREE.Group, a: Appearance): FaceParts {
  const skin = surface(a.skin, 'skin');
  cap(head, 0.05, 0.14, skin, 0, 0.0, 0);
  ell(head, HEAD_R.x, HEAD_R.y, HEAD_R.z, skin, 0, HEAD_CY, 0);
  for (const x of [-1, 1]) ell(head, 0.02, 0.04, 0.03, skin, x * 0.152, HEAD_CY, 0);
  // nariz
  ell(head, 0.022, 0.026, 0.026, surface(darker(a.skin, 0.94), 'skin'), 0, 0.14, 0.165);
  // olhos: branco, íris e pupila (piscam juntos)
  const eyes: THREE.Object3D[] = [];
  for (const x of [-0.062, 0.062]) {
    const eye = new THREE.Group();
    place(head, eye, x, 0.19, 0.138);
    ell(eye, 0.034, 0.038, 0.017, surface('#fafafa', 'gloss'), 0, 0, 0);
    ell(eye, 0.02, 0.024, 0.01, surface(a.eyes, 'gloss'), 0, 0, 0.011);
    ell(eye, 0.01, 0.012, 0.006, surface('#0c0d11', 'gloss'), 0, 0, 0.017);
    eyes.push(eye);
    // sobrancelha
    const brow = cap(head, 0.0085, 0.05, surface(darker(a.hair === a.skin ? '#3a2a20' : a.hair, 0.8), 'hair'), x, 0.246, 0.135);
    brow.rotation.z = Math.PI / 2 + (x < 0 ? -0.1 : 0.1);
  }
  // boca: arco fino, "∪" é sorriso; characters3d.setExpression muda a escala e a rotação
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0055, 6, 14, Math.PI), surface(darker(a.skin, 0.55), 'matte'));
  place(head, mouth, 0, 0.1, 0.147);
  mouth.rotation.z = Math.PI;
  mouth.scale.y = 0.35;
  addFacialHair(head, a);
  addHair(head, a);
  addAccessory(head, a);
  head.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { mouth, eyes };
}

/** Gestos da boca: 'smile' (comemora, ri), 'pout' (emburrado) e 'calm'. */
export function setMouth(mouth: THREE.Mesh, gesture: 'smile' | 'wide' | 'pout' | 'calm'): void {
  switch (gesture) {
    case 'wide':
      mouth.rotation.z = Math.PI;
      mouth.scale.set(1.2, 1.1, 1);
      break;
    case 'smile':
      mouth.rotation.z = Math.PI;
      mouth.scale.set(1, 0.7, 1);
      break;
    case 'pout':
      mouth.rotation.z = 0;
      mouth.scale.set(0.8, 0.55, 1);
      break;
    default:
      mouth.rotation.z = Math.PI;
      mouth.scale.set(1, 0.3, 1);
  }
}
