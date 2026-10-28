// Sprites isométricos GERADOS dos modelos 3D que já existem (world3d/): cada móvel, árvore e personagem é "fotografado" por
// uma câmera ortográfica 2:1 num WebGLRenderer fora da tela, em pixels nítidos (sem suavização), com um contorno escuro de
// 1px, e guardado num canvas com cache. É sob demanda: só vira sprite o que aparece, e cada (tipo, variante, giro...) uma vez.
import * as THREE from 'three';
import type { Appearance, Dir, FurnitureKind, HeldItem, Pose } from '../../art/api';
import type { ExteriorProp } from '../layout/types';
import { propObject } from '../../world3d/exterior3d';
import { buildFurniture, YAW, type Facing, type Painter } from '../../world3d/furniture3d';
import { AVATAR_ANCHOR, AVATAR_FRAMES, AVATAR_H, AVATAR_W, drawAvatar, viewOf } from './hotel-avatar';
import { HALF_H, HALF_W, HEIGHT_PX, SPRITE_SCALE, type Rot } from './projection';

/** Um desenho pronto: o canvas e o ponto dele que corresponde à origem do modelo (os pés, no chão). */
export interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
  w: number;
  h: number;
}

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const CORNER = new THREE.Vector3();
const ROT_Y = new THREE.Matrix4();

/** Retângulo (px, relativo à origem do modelo) que o modelo girado `rotY` ocupa na tela isométrica; null se não tem malha. Puro (sem GL). */
export function projectedBounds(obj: THREE.Object3D, rotY: number): Bounds | null {
  obj.updateMatrixWorld(true);
  ROT_Y.makeRotationY(rotY);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    for (let i = 0; i < 8; i++) {
      CORNER.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld).applyMatrix4(ROT_Y);
      const sx = (CORNER.x - CORNER.z) * HALF_W;
      const sy = (CORNER.x + CORNER.z) * HALF_H - CORNER.y * HEIGHT_PX;
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy;
      if (sy > y1) y1 = sy;
    }
  });
  return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
}

// ------------------------------------------------------------------ renderer compartilhado

interface Gl {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  holder: THREE.Group;
  w: number;
  h: number;
}
let gl: Gl | null = null;

function glFor(w: number, h: number): Gl {
  if (!gl) {
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    // luz fixa: o topo mais claro, a face da esquerda (sul) média e a da direita (leste) mais escura, como no hotel retrô
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaab0c0, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.55);
    sun.position.set(0.55, 1.2, 1.0);
    scene.add(sun);
    const holder = new THREE.Group();
    scene.add(holder);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    const d = 60;
    camera.position.set(d * Math.cos(Math.PI / 6) * Math.SQRT1_2, d * Math.sin(Math.PI / 6), d * Math.cos(Math.PI / 6) * Math.SQRT1_2);
    camera.lookAt(0, 0, 0);
    gl = { renderer, scene, camera, holder, w: 0, h: 0 };
  }
  if (w > gl.w || h > gl.h) {
    gl.w = Math.max(gl.w, 256, Math.ceil(w / 64) * 64);
    gl.h = Math.max(gl.h, 256, Math.ceil(h / 64) * 64);
    gl.renderer.setPixelRatio(1);
    gl.renderer.setSize(gl.w, gl.h, false);
  }
  return gl;
}

const OUTLINE = '#1b1d27';
const OFFSETS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function outlined(src: HTMLCanvasElement): HTMLCanvasElement {
  const edge = document.createElement('canvas');
  edge.width = src.width;
  edge.height = src.height;
  const e = edge.getContext('2d')!;
  for (const [dx, dy] of OFFSETS) e.drawImage(src, dx, dy);
  e.globalCompositeOperation = 'source-in';
  e.fillStyle = OUTLINE;
  e.fillRect(0, 0, edge.width, edge.height);
  e.globalCompositeOperation = 'source-over';
  e.drawImage(src, 0, 0);
  return edge;
}

const PAD = 2;

/** "Fotografa" o modelo (girado `rotY` em torno de Y) com a câmera isométrica. Precisa de WebGL. */
export function bakeObject(obj: THREE.Object3D, rotY: number, outline = true): Sprite | null {
  const b = projectedBounds(obj, rotY);
  if (!b) return null;
  const ax = Math.ceil(-b.x0) + PAD;
  const ay = Math.ceil(-b.y0) + PAD;
  const w = ax + Math.ceil(b.x1) + PAD;
  const h = ay + Math.ceil(b.y1) + PAD;
  const g = glFor(w, h);
  const s = SPRITE_SCALE;
  g.camera.left = -ax / s;
  g.camera.right = (g.w - ax) / s;
  g.camera.top = ay / s;
  g.camera.bottom = -(g.h - ay) / s;
  g.camera.updateProjectionMatrix();
  const parent = obj.parent;
  g.holder.rotation.y = rotY;
  g.holder.add(obj);
  g.renderer.render(g.scene, g.camera);
  g.holder.remove(obj);
  if (parent) parent.add(obj);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(g.renderer.domElement, 0, 0, w, h, 0, 0, w, h);
  return { canvas: outline ? outlined(canvas) : canvas, ax, ay, w, h };
}

// ------------------------------------------------------------------ materiais

const MATS = new Map<string, THREE.MeshStandardMaterial>();
/** Os materiais dos móveis assados (a luz do cômodo é aplicada depois, na tela). */
export const bakePainter: Painter = {
  mat(color, opts) {
    const key = `${color}|${opts?.emissive ? 'e' : ''}|${opts?.opacity ?? ''}|${opts?.rough ?? ''}`;
    let m = MATS.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: opts?.rough ?? 0.85, metalness: 0.02 });
      if (opts?.emissive) {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = 0.7;
      }
      if (opts?.opacity !== undefined) {
        m.transparent = true;
        m.opacity = opts.opacity;
        m.depthWrite = false;
      }
      MATS.set(key, m);
    }
    return m;
  },
};

// ------------------------------------------------------------------ cache

const cache = new Map<string, Sprite | null>();
const MAX_SPRITES = 6000;

function remember(key: string, s: Sprite | null): Sprite | null {
  if (cache.size >= MAX_SPRITES) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, s);
  return s;
}

export function clearSprites(): void {
  cache.clear();
}

export function cachedSpriteCount(): number {
  return cache.size;
}

/** Quanto tempo (ms) o bake de um quadro pode gastar por quadro da tela (o resto espera o próximo). */
let budgetUntil = 0;
export function startBakeBudget(ms: number): void {
  budgetUntil = performance.now() + ms;
}
function overBudget(): boolean {
  return performance.now() > budgetUntil;
}

const ROT_RAD = Math.PI / 2;

/** Sprite de um móvel de chão: `w`, `d` = footprint em tiles; `facing` = para onde o modelo olha; `rot` = giro da vista. */
export function furnitureSprite(kind: FurnitureKind, variant: string | undefined, seed: number, w: number, d: number, facing: Facing, rot: Rot): Sprite | null {
  const key = `f|${kind}|${variant ?? ''}|${seed}|${w}x${d}|${facing}|${rot}`;
  if (cache.has(key)) return cache.get(key)!;
  if (overBudget()) return null;
  const model = buildFurniture(kind, variant, seed, bakePainter, w, d);
  model.rotation.y = YAW[facing];
  return remember(key, bakeObject(model, rot * ROT_RAD));
}

/** Sprite de uma peça do terreno (árvore, poste...). */
export function propSprite(p: ExteriorProp, rot: Rot): Sprite | null {
  const key = `p|${p.kind}|${p.seed}|${rot}`;
  if (cache.has(key)) return cache.get(key)!;
  if (overBudget()) return null;
  return remember(key, bakeObject(propObject(p), rot * ROT_RAD));
}

// ------------------------------------------------------------------ personagens

/** Quantos quadros cada pose tem e quanto dura o ciclo (ms), para o laço de animação do sprite (hotel-avatar.ts). */
export const POSE_FRAMES = AVATAR_FRAMES;

export function frameOf(pose: Pose, animMs: number, offsetMs: number): number {
  const f = POSE_FRAMES[pose];
  if (!f) return 0;
  const t = (((animMs + offsetMs) % f.ms) + f.ms) % f.ms;
  return Math.floor((t / f.ms) * f.n) % f.n;
}

export function appearanceKey(a: Appearance): string {
  return JSON.stringify(a);
}

/**
 * Sprite de um quadro de um personagem, desenhado em pixel art no estilo hotel retrô (hotel-avatar.ts), sem passar pelo three.
 * `dir8` = direção do rosto em oitavos de volta no MUNDO (0 = sul, 2 = leste...); o giro da vista soma a ela.
 * `seatY` = altura do assento (sentado) ou null.
 */
export function characterSprite(app: Appearance, appKey: string, pose: Pose, frame: number, dir8: number, seatY: number | null, held: HeldItem, rot: Rot): Sprite | null {
  const view = viewOf(dir8 + 2 * rot);
  const seatPx = seatY === null ? null : Math.round(seatY * HEIGHT_PX);
  const key = `c|${appKey}|${pose}|${frame}|${view}|${seatPx ?? 'n'}|${held}`;
  if (cache.has(key)) return cache.get(key)!;
  if (overBudget()) return null;
  const px = drawAvatar({ app, view, pose, frame, seatPx, held });
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_W;
  canvas.height = AVATAR_H;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(px.d, AVATAR_W, AVATAR_H), 0, 0);
  return remember(key, { canvas, ax: AVATAR_ANCHOR.x, ay: AVATAR_ANCHOR.y, w: AVATAR_W, h: AVATAR_H });
}

export type { Appearance, Dir };
