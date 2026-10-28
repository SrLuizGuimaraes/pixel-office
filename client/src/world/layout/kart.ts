// O kartódromo, na lateral leste do escritório (a pista acompanha a largura do prédio: começa 6 tiles depois da última coluna).
// É um circuito de verdade, com curvas (uma esse, um cotovelo e um retão de largada), e não um anel retangular: o traçado
// vem de uma linha central suave (spline por pontos de controle) engrossada em asfalto, com zebras vermelhas e brancas nas
// bordas, linha de largada quadriculada, o grid de largada (três duplas de karts lado a lado e dois karts soltos) e a
// arquibancada na infield. Os karts SAEM do grid e dão voltas pelo traçado (sim/kart-drive.ts), nas corridas e nos passeios.
// As duas últimas linhas da área são a calçada sul do prédio, e uma faixa de calçada liga o caminho do shopping até a pista.
//
// Os lugares novos (SpotKind kartgrid, kartwatch) são usados pela roda "kart" (social/social.ts) e pelo passeio pago de quem
// está à toa (sim/sim.ts).
import { tr } from '../../../../shared/i18n';
import type { Dir } from '../../art/api';
import { BUILDING_H, COL_W, TILE } from '../constants';
import { AreaBuilder } from './builder';
import type { AreaLayout, TileRect } from './types';

export const KART_ID = 'kart:pista';
export const KART_WALK_ID = 'kart:calcada';
/** Coluna do caminho do shopping (MALL_DOOR_X): de onde a calçada até a pista parte. */
export const KART_WALK_X = 23;
export const KART_W = 40;
export const KART_Y = 1;
export const KART_H = BUILDING_H + 4 - KART_Y;
/** Linha (local) em que a calçada do prédio começa dentro da pista. */
const WALK_ROW = BUILDING_H + 2 - KART_Y;
/** Distância (px) dos pés de quem dirige ao centro do tile do kart (a mesma de quem senta num assento do chão). */
const FOOT_BELOW_CENTER = 5;

export const KART_NAMES: Readonly<Record<string, string>> = {
  [KART_ID]: tr('Kartódromo Turbo'),
};

/** Primeira coluna da pista para um prédio de `cols` colunas. */
export const kartX = (cols: number): number => cols * COL_W + 6;
/** Onde o terreno do kartódromo termina (coluna). */
export const kartRight = (cols: number): number => kartX(cols) + KART_W;
export const kartRect = (cols: number): TileRect => ({ x: kartX(cols), y: KART_Y, w: KART_W, h: KART_H });

/** Os três pares do grid de largada (colunas locais), as linhas dos karts e a coluna dos dois karts soltos. */
export const GRID_COLS = [8, 11, 14] as const;
export const GRID_ROWS = [23, 26] as const;
const SPARE_COL = 16;
/** Coluna (local, meio do tile) da linha de largada e de chegada. */
const LINE_X = 18.5;
const COLORS = ['red', 'blue', 'green', 'yellow'] as const;

// ------------------------------------------------------------------------------------------------ o traçado

/** Pontos de controle da linha central (tiles locais), no sentido horário: sai pelo retão de baixo, para leste. */
const CONTROL: readonly (readonly [number, number])[] = [
  [8, 25], [24, 25], [33, 24], [36, 19], [33, 14], [36, 9], [31, 4], [24, 6], [19, 3], [11, 4], [5, 8], [7, 13], [4, 18], [5, 23],
];
/** Meia largura do asfalto (tiles): 6 de largura nos retões. */
const ROAD_R = 2.6;
const SAMPLES = 20;

interface Shape {
  /** Pontos da linha central (tiles locais, em volta do circuito). */
  pts: { x: number; y: number }[];
  /** Comprimento acumulado até cada ponto; o último elemento é o comprimento total. */
  cum: number[];
  length: number;
  /** Fator de velocidade em cada ponto (0.62..1): freia nas curvas fechadas. */
  slow: number[];
  /** Tiles de asfalto (local): road[y][x]. */
  road: boolean[][];
  sLine: number;
}

let shapeCache: Shape | null = null;

function buildShape(): Shape {
  const n = CONTROL.length;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n];
    const p3 = CONTROL[(i + 2) % n];
    for (let k = 0; k < SAMPLES; k++) {
      const t = k / SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const m = pts.length;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = cum[m];
  // curvatura (mudança de rumo por tile) suavizada numa janela de 5 pontos
  const turn: number[] = [];
  for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m];
    const b = pts[i];
    const c = pts[(i + 1) % m];
    let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const prev = (i - 1 + m) % m;
    turn.push(Math.abs(d) / (((cum[i + 1] - cum[i]) + (cum[prev + 1] - cum[prev])) / 2 || 1));
  }
  const slow = turn.map((_, i) => {
    let sum = 0;
    for (let k = -2; k <= 2; k++) sum += turn[(i + k + m) % m];
    return Math.max(0.62, Math.min(1, 1 - 2.2 * (sum / 5)));
  });
  // asfalto: todo tile cujo centro está a ROAD_R da linha central (amostrada a cada ~0.25 tile)
  const road: boolean[][] = Array.from({ length: KART_H }, () => Array<boolean>(KART_W).fill(false));
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
    for (let k = 0; k < steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      for (let ty = Math.max(0, Math.floor(y - ROAD_R)); ty <= Math.min(KART_H - 1, Math.ceil(y + ROAD_R)); ty++) {
        for (let tx = Math.max(0, Math.floor(x - ROAD_R)); tx <= Math.min(KART_W - 1, Math.ceil(x + ROAD_R)); tx++) {
          if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= ROAD_R) road[ty][tx] = true;
        }
      }
    }
  }
  // a linha de largada: o ponto da linha central mais perto de (LINE_X, 25) no retão de baixo
  let sLine = 0;
  let best = Infinity;
  for (let i = 0; i < m; i++) {
    const d = Math.hypot(pts[i].x - LINE_X, pts[i].y - 25);
    if (d < best) {
      best = d;
      sLine = cum[i];
    }
  }
  return { pts, cum, length, slow, road, sLine };
}

const shape = (): Shape => (shapeCache ??= buildShape());

export interface TrackPoint {
  /** Posição (tiles locais, centro do kart). */
  x: number;
  y: number;
  /** Rumo (vetor unitário) e a direção do desenho. */
  hx: number;
  hy: number;
  dir: Dir;
}

/** O circuito para um prédio de `cols` colunas: o mesmo desenho, com a origem deslocada. */
export class KartTrack {
  readonly x0: number;
  readonly y0: number;

  constructor(readonly cols: number) {
    this.x0 = kartX(cols);
    this.y0 = KART_Y;
  }

  /** Volta completa, em tiles. */
  get length(): number {
    return shape().length;
  }

  /** Distância (tiles) em que está a linha de largada/chegada. */
  get sLine(): number {
    return shape().sLine;
  }

  /** Posição na distância `s` (qualquer s: dá voltas) com `off` tiles à esquerda do rumo (negativo = direita). */
  at(s: number, off = 0): TrackPoint {
    const sh = shape();
    const m = sh.pts.length;
    const u = ((s % sh.length) + sh.length) % sh.length;
    let lo = 0;
    let hi = m;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sh.cum[mid] <= u) lo = mid;
      else hi = mid;
    }
    const a = sh.pts[lo];
    const b = sh.pts[(lo + 1) % m];
    const len = sh.cum[lo + 1] - sh.cum[lo] || 1;
    const t = (u - sh.cum[lo]) / len;
    const hx = (b.x - a.x) / len;
    const hy = (b.y - a.y) / len;
    return {
      x: a.x + (b.x - a.x) * t + hy * off,
      y: a.y + (b.y - a.y) * t - hx * off,
      hx,
      hy,
      dir: Math.abs(hx) >= Math.abs(hy) ? (hx > 0 ? 'right' : 'left') : hy > 0 ? 'down' : 'up',
    };
  }

  /** Fator de velocidade (0.62..1) na distância `s`: freia nas curvas. */
  speedAt(s: number): number {
    const sh = shape();
    const u = ((s % sh.length) + sh.length) % sh.length;
    let lo = 0;
    let hi = sh.pts.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sh.cum[mid] <= u) lo = mid;
      else hi = mid;
    }
    return sh.slow[lo];
  }

  /** A distância do kart parado no tile local (lx, ly) do grid: atrás da linha, e o deslocamento lateral até a linha central. */
  gridPos(lx: number, ly: number): { s: number; off: number } {
    return { s: this.sLine - (LINE_X - (lx + 0.5)), off: 25 - (ly + 0.5) };
  }

  /** Pés (px de mundo) de quem dirige um kart em um ponto do circuito. */
  feet(p: { x: number; y: number }): { x: number; y: number } {
    return { x: (this.x0 + p.x) * TILE, y: (this.y0 + p.y) * TILE + FOOT_BELOW_CENTER };
  }
}

const tracks = new Map<number, KartTrack>();

export function kartTrack(cols: number): KartTrack {
  let t = tracks.get(cols);
  if (!t) tracks.set(cols, (t = new KartTrack(cols)));
  return t;
}

/** Tiles de asfalto (local), para os testes e para o desenho. */
export function kartRoad(): readonly (readonly boolean[])[] {
  return shape().road;
}

// ------------------------------------------------------------------------------------------------ as áreas

/** Junta tiles consecutivos de uma linha (ou coluna) em segmentos [início, fim). */
function runs(flags: readonly boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) {
      if (from < 0) from = i;
    } else if (from >= 0) {
      out.push([from, i]);
      from = -1;
    }
  }
  return out;
}

/** A pista: o circuito em asfalto com zebras, o grid, a linha de largada e a arquibancada na infield. */
function layoutPista(cols: number): AreaLayout {
  const b = new AreaBuilder(KART_ID, 'reception', kartRect(cols));
  const road = kartRoad();
  const isRoad = (x: number, y: number) => y >= 0 && y < KART_H && x >= 0 && x < KART_W && road[y][x];
  b.floor('grass', 0, 0, KART_W, KART_H, 960);
  b.floor('sidewalk', 0, WALK_ROW, KART_W, 2, 961);
  // asfalto: segmentos horizontais, juntando as linhas seguidas que têm o mesmo segmento
  const open = new Map<string, number>();
  const flush = (key: string, endY: number) => {
    const [x, w] = key.split(':').map(Number);
    const y = open.get(key)!;
    b.floor('street', x, y, w, endY - y, 962);
    open.delete(key);
  };
  for (let y = 0; y <= KART_H; y++) {
    const now = new Set(y < KART_H ? runs(road[y]).map(([a, c]) => `${a}:${c - a}`) : []);
    for (const key of [...open.keys()]) if (!now.has(key)) flush(key, y);
    for (const key of now) if (!open.has(key)) open.set(key, y);
  }
  b.walk(0, 0, KART_W, KART_H);
  // zebras vermelhas e brancas em toda borda do asfalto (faixas de 2 tiles, alternando as cores)
  let c = 0;
  const strip = (lx: number, ly: number, w: number, h: number) => b.rug(lx, ly, w, h, c++ % 2 ? '#f4f4f0' : '#d33a32', 970 + c);
  const T = 0.4;
  for (let y = 0; y < KART_H; y++) {
    for (const [a, e] of runs(Array.from({ length: KART_W }, (_, x) => isRoad(x, y) && !isRoad(x, y - 1)))) for (let x = a; x < e; x += 2) strip(x, y, Math.min(2, e - x), T);
    for (const [a, e] of runs(Array.from({ length: KART_W }, (_, x) => isRoad(x, y) && !isRoad(x, y + 1)))) for (let x = a; x < e; x += 2) strip(x, y + 1 - T, Math.min(2, e - x), T);
  }
  for (let x = 0; x < KART_W; x++) {
    for (const [a, e] of runs(Array.from({ length: KART_H }, (_, y) => isRoad(x, y) && !isRoad(x - 1, y)))) for (let y = a; y < e; y += 2) strip(x, y, T, Math.min(2, e - y));
    for (const [a, e] of runs(Array.from({ length: KART_H }, (_, y) => isRoad(x, y) && !isRoad(x + 1, y)))) for (let y = a; y < e; y += 2) strip(x + 1 - T, y, T, Math.min(2, e - y));
  }
  // linha de largada e de chegada quadriculada, atravessando o retão de baixo
  for (let y = 22; y < 28; y++) for (let k = 0; k < 2; k++) b.rug(LINE_X - 0.5 + k * 0.5, y, 0.5, 1, (y + k) % 2 ? '#f4f4f0' : '#2a2e38', 1000 + y * 2 + k);
  // o grid: pares lado a lado (o piloto senta no kart, virado para leste)
  let n = 0;
  for (const [g, lx] of GRID_COLS.entries()) {
    for (const ly of GRID_ROWS) {
      const id = b.furn('kart', lx, ly, COLORS[n++ % COLORS.length], { order: 0.5 + ly * 0.001 });
      b.seat('kartgrid', 'kart', lx, ly, 'right', undefined, { noFurniture: true, furnitureId: id, group: `kart:${'abc'[g]}` });
    }
  }
  // dois karts soltos para quem só quer dar umas voltas
  for (const ly of GRID_ROWS) {
    const id = b.furn('kart', SPARE_COL, ly, COLORS[n++ % COLORS.length], { order: 0.5 + ly * 0.001 });
    b.seat('kartgrid', 'kart', SPARE_COL, ly, 'right', undefined, { noFurniture: true, furnitureId: id });
  }
  // arquibancada: quatro bancos no gramado da infield, virados para o retão do grid
  for (const [i, lx] of [12, 16, 20, 24].entries()) {
    const id = b.furn('bench', lx, 20, undefined, { order: 0.5 + i * 0.01 });
    for (let k = 0; k < 2; k++) b.seat('kartwatch', 'bench', lx + k, 20, 'down', undefined, { noFurniture: true, furnitureId: id });
  }
  // enfeites: plantas na infield, postes nos cantos e uma lixeira perto do grid
  b.furn('plant_tall', 17, 12, 'ficus', { order: 0.3 });
  b.furn('plant_tall', 22, 12, 'ficus', { order: 0.31 });
  b.furn('plant_small', 14, 10, 'flower', { order: 0.3 });
  b.furn('plant_small', 26, 10, 'fern', { order: 0.3 });
  for (const [lx, ly] of [[0, 0], [39, 0], [0, 29], [39, 29]] as const) b.furn('floor_lamp', lx, ly, undefined, { order: 0.3 });
  b.spot('staffpost', 10, 29, 'up', { group: 'kart' });
  b.furn('trash_bin', 31, 29, undefined, { order: 0.6 });
  return b.build();
}

/** A calçada que liga o caminho do shopping (coluna KART_WALK_X) à pista, ao longo da fachada sul do prédio. */
function layoutCalcada(cols: number): AreaLayout {
  const x = KART_WALK_X;
  const b = new AreaBuilder(KART_WALK_ID, 'corridor', { x, y: BUILDING_H + 2, w: kartX(cols) - x, h: 2 });
  b.walk(0, 0, kartX(cols) - x, 2);
  return b.build();
}

const cache = new Map<number, AreaLayout[]>();

/** As áreas do kartódromo para um prédio de `cols` colunas (calculadas uma vez por largura). */
export function kartAreas(cols: number): AreaLayout[] {
  let a = cache.get(cols);
  if (!a) cache.set(cols, (a = [layoutCalcada(cols), layoutPista(cols)]));
  return a;
}
