// O avatar da vista isométrica no estilo do hotel retrô, desenhado em pixel art por código a partir da `Appearance` do agente:
// cabeça grande e quadrada com rosto simples (olhos pequenos, boca só quando fala ou ri), pescoço curto, torso retangular com a
// camisa, mangas curtas e braços finos, mãos pequenas, calça reta e sapatos pequenos; contorno escuro de 1px e sombreado de três
// tons (claro à esquerda, escuro à direita). Proporção de ~1 cabeça para 3 de corpo. Puro (sem DOM), para testar: devolve um
// buffer RGBA; bake.ts transforma em canvas e guarda em cache por (aparência, direção, pose, quadro).
//
// Direções: as 4 da vista (rosto na diagonal): 0 = de frente virado para a esquerda da tela, 1 = de frente para a direita,
// 2 = de costas para a direita, 3 = de costas para a esquerda. As da direita são o espelho das da esquerda (o sombreado não).
import type { Appearance, HeldItem, Pose } from '../../art/api';

export const AVATAR_W = 48;
export const AVATAR_H = 72;
/** Ponto do sprite que fica nos pés (entre os dois sapatos, no chão). */
export const AVATAR_ANCHOR = { x: 24, y: 67 };
/** Altura (px) do quadril em pé: o sentado desce até a altura do assento. */
export const HIP_PX = 20;

export type View = 0 | 1 | 2 | 3;

export interface AvatarSpec {
  app: Appearance;
  view: View;
  pose: Pose;
  frame: number;
  /** Altura do assento em px (sentado) ou null (em pé). */
  seatPx: number | null;
  held: HeldItem;
}

export class Px {
  readonly d: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly w: number, readonly h: number) {
    this.d = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  }
  set(x: number, y: number, c: Rgb): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
  opaque(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0;
  }
}

type Rgb = readonly [number, number, number];
const cache = new Map<string, Rgb>();

export function rgbOf(color: string | undefined): Rgb {
  const key = color ?? '';
  let v = cache.get(key);
  if (v) return v;
  let n = 0x888888;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(key);
  if (m) n = parseInt(m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1], 16);
  else {
    const r = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(key);
    if (r) n = (Number(r[1]) << 16) | (Number(r[2]) << 8) | Number(r[3]);
  }
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(key, v);
  return v;
}

const mul = (c: Rgb, k: number): Rgb => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
const INK: Rgb = [27, 29, 39];
const WHITE: Rgb = [244, 244, 240];

/** Os quadros que cada pose tem e a duração do ciclo (ms). */
export const AVATAR_FRAMES: Readonly<Partial<Record<Pose, { n: number; ms: number }>>> = {
  walk: { n: 4, ms: 560 },
  run: { n: 4, ms: 360 },
  type: { n: 2, ms: 380 },
  raise_hand: { n: 2, ms: 700 },
  talk: { n: 2, ms: 500 },
  play: { n: 2, ms: 420 },
  cheer: { n: 2, ms: 520 },
  laugh: { n: 2, ms: 300 },
  rps: { n: 2, ms: 600 },
  groom: { n: 2, ms: 800 },
  drink: { n: 2, ms: 900 },
  use: { n: 2, ms: 700 },
  game: { n: 2, ms: 400 },
  wait: { n: 2, ms: 900 },
  read: { n: 2, ms: 1200 },
  sulk: { n: 2, ms: 1400 },
  stand: { n: 2, ms: 2200 },
  sit: { n: 2, ms: 2200 },
};

/** Direção em oitavos de volta no mundo, já com o giro da vista, para uma das 4 vistas do avatar. */
export function viewOf(rel8: number): View {
  return ((((rel8 % 8) + 8) % 8 + 1) >> 1) % 4 as View;
}

// ------------------------------------------------------------------ desenhista

class Pen {
  constructor(
    readonly px: Px,
    private readonly flip: boolean,
  ) {}

  /** Retângulo sombreado em 3 tons (claro à esquerda e no topo, escuro à direita), com a espelhação aplicada. */
  rect(x: number, y: number, w: number, h: number, base: Rgb, shadeAmt = 1): void {
    if (w <= 0 || h <= 0) return;
    const sx = this.flip ? AVATAR_W - x - w : x;
    const light = mul(base, 1.16);
    const dark = mul(base, 1 - 0.24 * shadeAmt);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let c = base;
        if (shadeAmt > 0) {
          if (i === 0 || j === 0) c = light;
          else if (i >= w - Math.min(2, Math.floor(w / 4)) || j === h - 1) c = dark;
        }
        this.px.set(sx + i, y + j, c);
      }
    }
  }

  /** Pixel solto (sem sombreado). */
  dot(x: number, y: number, c: Rgb): void {
    this.px.set(this.flip ? AVATAR_W - 1 - x : x, y, c);
  }

  /** Disco preenchido (cabelo cheio, pão). */
  disc(cx: number, cy: number, r: number, base: Rgb): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + 1) continue;
        this.dot(cx + x, cy + y, x + y < -r * 0.6 ? mul(base, 1.16) : x > r * 0.45 ? mul(base, 0.78) : base);
      }
    }
  }
}

const CX = 24;

interface Limb {
  /** Deslocamento vertical (px; negativo = sobe). */
  dy: number;
}

/** Os parâmetros do corpo em cada pose e quadro. */
interface Body {
  bob: number;
  legL: Limb;
  legR: Limb;
  /** Braços: tipo e deslocamento. */
  armL: 'down' | 'front' | 'up' | 'hip';
  armR: 'down' | 'front' | 'up' | 'mouth' | 'hip';
  armLdy: number;
  armRdy: number;
  headDy: number;
  eyes: 'open' | 'closed' | 'half';
  mouth: 'none' | 'small' | 'wide';
  /** Corpo inclinado (px para a direita da tela): corrida, risada. */
  lean: number;
}

function bodyFor(pose: Pose, frame: number, seated: boolean): Body {
  const f = frame;
  const b: Body = { bob: 0, legL: { dy: 0 }, legR: { dy: 0 }, armL: 'down', armR: 'down', armLdy: 0, armRdy: 0, headDy: 0, eyes: 'open', mouth: 'none', lean: 0 };
  switch (pose) {
    case 'walk':
    case 'run': {
      const big = pose === 'run' ? 1.5 : 1;
      const l = [0, -2, -3, -1][f % 4];
      const r = [-3, -1, 0, -2][f % 4];
      b.legL.dy = Math.round(l * big);
      b.legR.dy = Math.round(r * big);
      b.armLdy = Math.round(-(l - r) * 0.6 * big);
      b.armRdy = Math.round((l - r) * 0.6 * big);
      b.bob = f % 2 ? -1 : 0;
      if (pose === 'run') b.lean = 1;
      break;
    }
    case 'type':
      b.armL = b.armR = 'front';
      b.armLdy = f % 2 ? 1 : 0;
      b.armRdy = f % 2 ? 0 : 1;
      b.headDy = 1;
      break;
    case 'sleep':
      b.headDy = 4;
      b.eyes = 'closed';
      b.armL = b.armR = 'front';
      break;
    case 'drink':
      b.armR = 'mouth';
      break;
    case 'use':
      b.armR = 'front';
      b.armRdy = f % 2 ? 1 : 0;
      break;
    case 'raise_hand':
      b.armR = 'up';
      b.armRdy = f % 2 ? -2 : 0;
      break;
    case 'talk':
      b.armR = 'front';
      b.armRdy = f % 2 ? -3 : 0;
      b.armL = 'hip';
      b.mouth = f % 2 ? 'small' : 'none';
      break;
    case 'stretch':
      b.armL = b.armR = 'up';
      break;
    case 'read':
      b.armL = b.armR = 'front';
      b.headDy = 2;
      break;
    case 'play':
      b.armR = 'front';
      b.armRdy = f % 2 ? -3 : 1;
      break;
    case 'wait':
      b.armL = b.armR = 'front';
      b.armLdy = f % 2 ? 1 : 0;
      break;
    case 'cheer':
      b.armL = b.armR = 'up';
      b.mouth = 'wide';
      b.bob = f % 2 && !seated ? -3 : 0;
      b.armLdy = b.armRdy = f % 2 ? -2 : 0;
      break;
    case 'laugh':
      b.eyes = 'closed';
      b.mouth = 'wide';
      b.armR = 'hip';
      b.bob = f % 2 ? -1 : 0;
      b.lean = f % 2 ? 1 : -1;
      break;
    case 'game':
      b.armL = b.armR = 'front';
      b.armLdy = f % 2 ? 1 : 0;
      b.headDy = 1;
      break;
    case 'rps':
      b.armR = 'front';
      b.armRdy = f % 2 ? 3 : -3;
      break;
    case 'groom':
      b.armR = 'mouth';
      b.armRdy = f % 2 ? -2 : 0;
      break;
    case 'sulk':
      b.headDy = 3;
      b.eyes = 'half';
      b.armLdy = b.armRdy = 1;
      break;
    default:
      b.bob = !seated && f % 2 ? -1 : 0;
      break;
  }
  return b;
}

/** Desenha o avatar e devolve o buffer RGBA (com contorno de 1px). */
export function drawAvatar(spec: AvatarSpec): Px {
  const { app: a, view } = spec;
  const front = view === 0 || view === 1;
  const flip = view === 1 || view === 2;
  const turn = front ? -2 : 2;
  const seated = spec.seatPx !== null;
  const body = bodyFor(spec.pose, spec.frame, seated);
  const px = new Px(AVATAR_W, AVATAR_H);
  const pen = new Pen(px, flip);

  const skin = rgbOf(a.skin);
  const hair = rgbOf(a.hair);
  const top = rgbOf(a.top);
  const accent = rgbOf(a.topAccent);
  const bottom = rgbOf(a.bottom);
  const shoes = rgbOf(a.shoes);
  const female = a.look === 'f';

  // altura do quadril: em pé 20px acima do chão; sentado, na altura do assento
  const hipPx = seated ? Math.max(8, Math.min(HIP_PX, spec.seatPx!)) : HIP_PX;
  const down = HIP_PX - hipPx + body.bob; // quanto o tronco desce (positivo) em relação ao em pé
  const ground = AVATAR_ANCHOR.y;
  const torsoTop = 28 + down;
  const torsoH = 20;
  const hipY = torsoTop + torsoH; // y do quadril
  const headTop = 8 + down + body.headDy;
  const lean = body.lean;
  const tw = female ? 15 : 16;
  const tx = CX - Math.floor(tw / 2) + lean;

  // ---- pernas e sapatos
  const bottomStyle = a.bottomStyle ?? 'pants';
  const legTop = hipY;
  const legL = { x: CX - 8 + lean, w: 8 };
  const legR = { x: CX, w: 8 };
  if (seated) {
    if (front) {
      // coxas para a frente (encurtadas) e canelas para baixo
      for (const l of [legL, legR]) {
        pen.rect(l.x, legTop, l.w, 5, bottomStyle === 'shorts' || bottomStyle === 'skirt' ? skin : bottom);
        pen.rect(l.x, legTop + 5, l.w, Math.max(2, ground - 4 - (legTop + 5)), bottomStyle === 'pants' ? bottom : skin);
        pen.rect(l.x - 1, ground - 4, l.w + 1, 4, shoes);
      }
    }
  } else {
    for (const [l, lim] of [[legL, body.legL], [legR, body.legR]] as const) {
      const end = ground - 4 + lim.dy;
      pen.rect(l.x, legTop, l.w, Math.max(2, end - legTop), bottomStyle === 'pants' ? bottom : bottomStyle === 'shorts' ? (legTop + 6 < end ? skin : bottom) : skin);
      if (bottomStyle === 'shorts') pen.rect(l.x, legTop, l.w, 6, bottom);
      pen.rect(l.x - (l === legL ? 1 : 0), end, l.w + 1, 4, shoes);
    }
  }

  // ---- tronco
  pen.rect(tx, torsoTop, tw, torsoH, top);
  if (bottomStyle === 'skirt') {
    pen.rect(tx - 2, hipY - 4, tw + 4, 8, bottom);
  } else pen.rect(tx, hipY - 3, tw, 3, bottom, 0.6);
  const t = spec.pose;
  if (front) {
    switch (a.topStyle) {
      case 'shirt_tie':
        pen.rect(CX - 3 + lean, torsoTop, 6, 3, WHITE, 0.4);
        pen.rect(CX - 1 + lean, torsoTop + 2, 2, 12, accent, 0.5);
        break;
      case 'polo':
        pen.rect(CX - 4 + lean, torsoTop, 8, 3, accent, 0.4);
        pen.dot(CX + lean, torsoTop + 5, mul(accent, 0.7));
        pen.dot(CX + lean, torsoTop + 8, mul(accent, 0.7));
        break;
      case 'hoodie':
        pen.rect(CX - 5 + lean, torsoTop - 1, 10, 3, mul(top, 0.85), 0.8);
        pen.rect(CX - 5 + lean, torsoTop + 12, 10, 4, mul(top, 0.9), 0.8);
        break;
      case 'sweater':
        pen.rect(tx, torsoTop + torsoH - 6, tw, 2, accent, 0.4);
        pen.rect(CX - 3 + lean, torsoTop, 6, 2, accent, 0.4);
        break;
      case 'jacket':
        pen.rect(CX - 2 + lean, torsoTop, 4, torsoH - 3, accent, 0.5);
        break;
      case 'blouse':
        pen.rect(CX - 2 + lean, torsoTop, 4, 4, skin, 0.5);
        break;
      default:
        pen.rect(CX - 3 + lean, torsoTop, 6, 1, accent, 0.3);
        break;
    }
    if (a.lanyard) {
      const l = rgbOf(a.lanyard);
      for (let i = 0; i < 6; i++) {
        pen.dot(CX - 3 + i + lean, torsoTop + i, l);
        pen.dot(CX + 3 - i + lean, torsoTop + i, l);
      }
      pen.rect(CX - 2 + lean, torsoTop + 8, 4, 5, l, 0.5);
    }
  } else {
    // de costas: costura central discreta
    pen.rect(CX + lean, torsoTop + 2, 1, torsoH - 6, mul(top, 0.82), 0);
  }
  void t;

  // ---- braços (mangas curtas: camisa até o meio, pele no resto)
  const longSleeve = a.topStyle === 'hoodie' || a.topStyle === 'sweater' || a.topStyle === 'jacket';
  const armX = (side: 'L' | 'R') => (side === 'L' ? tx - 4 : tx + tw - 1);
  const arm = (side: 'L' | 'R', kind: string, dy: number): void => {
    const x = armX(side);
    const w = 5;
    const sy = torsoTop + 1 + dy;
    const sleeve = longSleeve ? top : top;
    const bare = longSleeve ? top : skin;
    if (kind === 'down') {
      pen.rect(x, sy, w, 7, sleeve);
      pen.rect(x, sy + 7, w, 8, bare);
      pen.rect(x, sy + 15, w, 3, skin);
    } else if (kind === 'hip') {
      pen.rect(x, sy, w, 6, sleeve);
      pen.rect(x + (side === 'L' ? 2 : -2), sy + 6, w, 5, bare);
      pen.rect(x + (side === 'L' ? 3 : -3), sy + 11, 4, 3, skin);
    } else if (kind === 'front') {
      // antebraço dobrado diante do tronco, mãos na altura do peito
      pen.rect(x, sy, w, 7, sleeve);
      pen.rect(x + (side === 'L' ? 3 : -3), sy + 6, w + 2, 4, bare);
      pen.rect(x + (side === 'L' ? 6 : -6), sy + 7, 4, 3, skin);
    } else if (kind === 'mouth') {
      pen.rect(x, sy, w, 6, sleeve);
      pen.rect(x + (side === 'L' ? 1 : -1), sy - 6, w, 7, bare);
      pen.rect(x + (side === 'L' ? 2 : -2), sy - 10, 4, 4, skin);
    } else {
      // 'up': braço para o alto ao lado da cabeça
      pen.rect(x + (side === 'L' ? -1 : 1), sy - 16 + dy, w, 8, bare);
      pen.rect(x + (side === 'L' ? -1 : 1), sy - 8 + dy, w, 8, sleeve);
      pen.rect(x + (side === 'L' ? -1 : 1), sy - 20 + dy, 5, 4, skin);
    }
  };
  arm('L', body.armL, body.armLdy);
  arm('R', body.armR, body.armRdy);

  // item na mão direita
  heldItem(pen, spec.held, armX('R') + 1, torsoTop + (body.armR === 'down' ? 17 : body.armR === 'mouth' ? -9 : 9) + body.armRdy, flip);

  // ---- pescoço e cabeça
  pen.rect(CX - 2 + lean, headTop + 17, 4, 4, skin, 0.7);
  const hx = CX - 9 + lean;
  const hw = 18;
  const hh = 18;
  // cabelo por trás da cabeça (comprido, rabo, maria-chiquinha)
  hairBack(pen, a.hairStyle, hair, hx, headTop, hw, front);
  pen.rect(hx, headTop, hw, hh, skin);
  if (front) face(pen, hx, headTop, hw, turn, body, a, skin);
  else if (a.hairStyle === 'bald') pen.rect(hx + 1, headTop + 1, hw - 2, hh - 2, skin, 0.5);
  hairFront(pen, a.hairStyle, hair, hx, headTop, hw, hh, front, turn);
  accessory(pen, a, hx, headTop, hw, front, turn, hair);

  outline(px);
  return px;
}

function face(pen: Pen, hx: number, hy: number, hw: number, turn: number, body: Body, a: Appearance, skin: Rgb): void {
  const ex = [hx + 4 + turn, hx + hw - 6 + turn];
  const eye = mul(rgbOf(a.eyes), 0.45);
  const ey = hy + 9;
  for (const x of ex) {
    if (body.eyes === 'open') {
      pen.rect(x, ey, 2, 3, INK, 0);
      pen.dot(x, ey, eye);
    } else if (body.eyes === 'half') pen.rect(x, ey + 1, 3, 1, INK, 0);
    else {
      pen.dot(x, ey + 1, INK);
      pen.dot(x + 1, ey, INK);
      pen.dot(x + 2, ey + 1, INK);
    }
  }
  // nariz: um pixel mais escuro no meio
  pen.dot(hx + hw / 2 - 1 + turn, hy + 12, mul(skin, 0.8));
  if (body.mouth === 'small') pen.rect(hx + hw / 2 - 2 + turn, hy + 14, 3, 1, mul(INK, 1.6), 0);
  else if (body.mouth === 'wide') {
    pen.rect(hx + hw / 2 - 3 + turn, hy + 13, 5, 3, INK, 0);
    pen.rect(hx + hw / 2 - 2 + turn, hy + 13, 3, 1, WHITE, 0);
  }
  const hair = rgbOf(a.hair);
  switch (a.facialHair) {
    case 'stubble':
      for (let i = 0; i < 6; i++) pen.dot(hx + 4 + i * 2 + turn, hy + 15 + (i % 2), mul(skin, 0.78));
      break;
    case 'beard':
      pen.rect(hx + 2 + turn, hy + 13, hw - 4, 5, hair, 0.6);
      pen.rect(hx + hw / 2 - 2 + turn, hy + 13, 4, 1, skin, 0);
      break;
    case 'mustache':
      pen.rect(hx + hw / 2 - 4 + turn, hy + 13, 8, 2, hair, 0.5);
      break;
    case 'goatee':
      pen.rect(hx + hw / 2 - 2 + turn, hy + 15, 4, 3, hair, 0.5);
      break;
    default:
      break;
  }
}

function hairBack(pen: Pen, style: Appearance['hairStyle'], c: Rgb, hx: number, hy: number, hw: number, front: boolean): void {
  switch (style) {
    case 'long':
    case 'wavy':
      pen.rect(hx - 1, hy + 2, hw + 2, front ? 24 : 22, c);
      break;
    case 'bob':
      pen.rect(hx - 1, hy + 2, hw + 2, 17, c);
      break;
    case 'afro':
      pen.disc(hx + hw / 2, hy + 7, 13, c);
      break;
    case 'ponytail':
      pen.rect(hx + hw - 1, hy + 5, 5, 20, c);
      break;
    case 'pigtails':
      pen.rect(hx - 5, hy + 7, 5, 14, c);
      pen.rect(hx + hw, hy + 7, 5, 14, c);
      break;
    default:
      break;
  }
}

function hairFront(pen: Pen, style: Appearance['hairStyle'], c: Rgb, hx: number, hy: number, hw: number, hh: number, front: boolean, turn: number): void {
  if (style === 'bald') return;
  const cap = (rows: number): void => pen.rect(hx - 1, hy - 1, hw + 2, rows, c);
  const backFill = (): void => {
    if (!front) pen.rect(hx - 1, hy - 1, hw + 2, hh - 1, c);
  };
  switch (style) {
    case 'buzz':
      cap(front ? 3 : 14);
      break;
    case 'spiky':
      cap(front ? 5 : 15);
      for (let i = 0; i < 4; i++) pen.rect(hx + 1 + i * 4, hy - 5 + (i % 2), 3, 5, c);
      break;
    case 'side_part':
      cap(front ? 5 : 14);
      if (front) pen.rect(hx - 1, hy - 1, 7, 9, c);
      break;
    case 'curly':
      cap(front ? 6 : 15);
      for (let i = 0; i < 9; i++) pen.rect(hx - 2 + i * 2, hy - 3 + (i % 2) * 2, 3, 3, c);
      break;
    case 'afro':
      if (front) {
        cap(6);
        pen.rect(hx - 2, hy - 1, 3, 11, c);
        pen.rect(hx + hw - 1, hy - 1, 3, 11, c);
      } else pen.disc(hx + hw / 2, hy + 7, 12, c);
      break;
    case 'bob':
      cap(front ? 6 : 17);
      if (front) {
        pen.rect(hx - 1, hy - 1, 3, 17, c);
        pen.rect(hx + hw - 2, hy - 1, 3, 17, c);
      }
      break;
    case 'long':
    case 'wavy':
      cap(front ? 6 : 24);
      if (front) {
        pen.rect(hx - 1, hy - 1, 3, 22, c);
        pen.rect(hx + hw - 2, hy - 1, 3, 22, c);
      }
      if (style === 'wavy') for (let i = 0; i < 4; i++) pen.dot(hx - 2 + (i % 2) * 2, hy + 8 + i * 4, c);
      break;
    case 'ponytail':
      cap(front ? 5 : 15);
      if (front) pen.rect(hx - 1, hy - 1, 3, 8, c);
      break;
    case 'bun':
      cap(front ? 5 : 15);
      pen.disc(hx + hw / 2, hy - 3, 4, c);
      break;
    case 'pigtails':
      cap(front ? 5 : 15);
      break;
    case 'mohawk':
      pen.rect(hx + hw / 2 - 3, hy - 5, 6, front ? 8 : 20, c);
      if (!front) pen.rect(hx + hw / 2 - 3, hy - 5, 6, 22, c);
      break;
    default:
      // short
      cap(front ? 5 : 14);
      if (front) {
        pen.rect(hx - 1, hy - 1, 2, 8, c, 0.6);
        pen.rect(hx + hw - 1, hy - 1, 2, 8, c, 0.6);
      }
      break;
  }
  if (style !== 'mohawk') backFill();
  void turn;
}

function accessory(pen: Pen, a: Appearance, hx: number, hy: number, hw: number, front: boolean, turn: number, hair: Rgb): void {
  const c = rgbOf(a.accessoryColor);
  const ey = hy + 8;
  switch (a.accessory) {
    case 'glasses':
    case 'sunglasses':
      if (!front) break;
      for (const x of [hx + 3 + turn, hx + hw - 8 + turn]) {
        pen.rect(x, ey, 6, 5, a.accessory === 'sunglasses' ? INK : mul(WHITE, 0.9), 0);
        pen.rect(x + 1, ey + 1, 4, 3, a.accessory === 'sunglasses' ? [40, 44, 60] : [190, 220, 240], 0);
      }
      pen.rect(hx + 9 + turn, ey + 1, hw - 18 + 2, 1, INK, 0);
      if (a.accessory === 'glasses') {
        pen.rect(hx + 5 + turn, ey + 2, 2, 2, INK, 0);
        pen.rect(hx + hw - 7 + turn, ey + 2, 2, 2, INK, 0);
      }
      break;
    case 'headphones':
      pen.rect(hx - 2, hy - 3, hw + 4, 3, c, 0.5);
      pen.rect(hx - 4, hy + 6, 4, 8, c);
      pen.rect(hx + hw, hy + 6, 4, 8, c);
      break;
    case 'cap':
      pen.rect(hx - 1, hy - 3, hw + 2, 7, c);
      if (front) pen.rect(hx + 1 + turn, hy + 3, hw - 2, 2, mul(c, 0.8), 0.5);
      break;
    case 'beanie':
      pen.rect(hx - 1, hy - 4, hw + 2, 9, c);
      pen.rect(hx - 1, hy + 4, hw + 2, 2, mul(c, 0.8), 0.5);
      pen.dot(hx + hw / 2, hy - 5, c);
      break;
    case 'earrings':
      if (front) {
        pen.rect(hx - 1, hy + 12, 2, 3, c, 0);
        pen.rect(hx + hw - 1, hy + 12, 2, 3, c, 0);
      }
      break;
    case 'bow':
      pen.rect(hx + hw - 5, hy - 3, 7, 4, c, 0.5);
      pen.rect(hx + hw - 3, hy - 2, 3, 2, mul(c, 0.7), 0);
      break;
    default:
      break;
  }
  void hair;
}

function heldItem(pen: Pen, held: HeldItem, x: number, y: number, flip: boolean): void {
  void flip;
  switch (held) {
    case 'coffee':
      pen.rect(x + 1, y, 5, 6, WHITE, 0.6);
      pen.rect(x + 1, y, 5, 1, [90, 58, 34], 0);
      break;
    case 'water':
      pen.rect(x + 1, y, 4, 7, [159, 208, 238], 0.6);
      break;
    case 'papers':
      pen.rect(x, y, 7, 8, WHITE, 0.5);
      pen.rect(x + 1, y + 2, 5, 1, [150, 150, 160], 0);
      break;
    case 'laptop':
      pen.rect(x - 1, y + 2, 9, 5, [141, 151, 166], 0.5);
      pen.rect(x, y, 7, 3, [74, 163, 240], 0);
      break;
    case 'book':
      pen.rect(x, y, 6, 8, [141, 102, 207], 0.6);
      break;
    case 'box':
      pen.rect(x - 1, y, 9, 8, [201, 154, 94], 0.7);
      break;
    case 'paddle':
      pen.disc(x + 3, y + 1, 3, [217, 74, 74]);
      break;
    case 'popcorn':
      pen.rect(x, y + 2, 6, 6, [217, 74, 74], 0.7);
      pen.rect(x, y, 6, 3, [255, 242, 194], 0);
      break;
    case 'controller':
      pen.rect(x - 1, y + 2, 8, 3, [43, 47, 56], 0.4);
      break;
    case 'phone':
      pen.rect(x + 1, y, 3, 5, [20, 23, 31], 0);
      pen.rect(x + 2, y + 1, 1, 3, [74, 163, 240], 0);
      break;
    case 'rock':
      pen.rect(x, y, 4, 4, [210, 170, 130], 0.6);
      break;
    case 'paper':
      pen.rect(x - 1, y, 6, 4, [226, 190, 150], 0.6);
      break;
    case 'scissors':
      pen.rect(x, y - 2, 2, 5, [226, 190, 150], 0.6);
      pen.rect(x + 3, y - 2, 2, 5, [226, 190, 150], 0.6);
      break;
    case 'lipstick':
      pen.rect(x + 1, y, 2, 5, [200, 40, 80], 0);
      break;
    case 'comb':
      pen.rect(x, y, 6, 2, [60, 60, 70], 0);
      break;
    default:
      break;
  }
}

/** Contorno de 1px (4 vizinhos) na cor da tinta, só em volta da silhueta. */
function outline(p: Px): void {
  const edge: [number, number][] = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.opaque(x, y)) continue;
      if (p.opaque(x - 1, y) || p.opaque(x + 1, y) || p.opaque(x, y - 1) || p.opaque(x, y + 1)) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) p.set(x, y, INK);
}
