// Pilotagem de um kart pelo circuito (puro, sem o simulador): quem senta num kart do grid sai dele, dá voltas pelo
// traçado (layout/kart.ts) e volta ao mesmo lugar. Usado pelas corridas (social/social.ts) e pelos passeios pagos.
import type { Dir } from '../../art/api';
import type { KartTrack } from '../layout/kart';

/** Velocidade-base (tiles/s) de um piloto médio; a habilidade e as curvas mexem nela. */
export const KART_SPEED = 8.4;
/** Quanto leva o kart para voltar ao grid depois da corrida (s). */
const RETURN_S = 1.1;
/** Velocidade lateral para trocar de faixa (tiles/s) e a faixa máxima à esquerda/direita da linha central. */
const LANE_SPEED = 1;
const LANE_MAX = 1.4;

export interface Drive {
  /** Spot (assento do kart) de onde saiu e a que volta, e o móvel dele. */
  seat: string;
  kartId: string | null;
  /** Cor do kart (variante do móvel). */
  variant: string;
  /** Distância percorrida no circuito (tiles) e a faixa lateral atual/desejada (+ = à esquerda do rumo). */
  s: number;
  off: number;
  offGoal: number;
  offAt: number;
  /** Velocidade-base deste piloto (tiles/s) e a fase da oscilação dele. */
  base: number;
  phase: number;
  /** Só anda a partir deste instante (ms epoch): a contagem da largada. */
  startAt: number;
  /** Voltas da corrida (0 = só passeia, sem chegada). */
  laps: number;
  lapsDone: number;
  /** Quando cruzou a linha de chegada (ms epoch; 0 = ainda não). */
  finishedAt: number;
  /** Volta sozinho ao assento ao terminar (passeio); nas corridas quem volta é chamado de fora. */
  auto: boolean;
  /** Voltando ao assento: de onde (px) e o avanço (0..1). */
  back: { x: number; y: number; t: number } | null;
  done: boolean;
}

export interface DriveInit {
  seat: string;
  kartId: string | null;
  variant: string;
  /** Posição do kart no grid (tiles locais da pista) e a velocidade-base. */
  lx: number;
  ly: number;
  base: number;
  startAt: number;
  laps: number;
  auto: boolean;
  phase: number;
}

export function newDrive(track: KartTrack, o: DriveInit): Drive {
  const g = track.gridPos(o.lx, o.ly);
  return {
    seat: o.seat,
    kartId: o.kartId,
    variant: o.variant,
    s: g.s,
    off: g.off,
    offGoal: g.off,
    offAt: o.startAt + 1500,
    base: o.base,
    phase: o.phase,
    startAt: o.startAt,
    laps: o.laps,
    lapsDone: 0,
    finishedAt: 0,
    auto: o.auto,
    back: null,
    done: false,
  };
}

/** Voltas completas (da linha de largada), limitadas às da corrida. */
export function lapsOf(d: Drive, track: KartTrack): number {
  const n = Math.floor((d.s - track.sLine) / track.length);
  return Math.max(0, d.laps > 0 ? Math.min(d.laps, n) : n);
}

/** Manda o kart de volta ao assento: a partir de agora ele só vai (em linha reta) até lá. */
export function recall(d: Drive, from: { x: number; y: number }): void {
  if (!d.back) d.back = { x: from.x, y: from.y, t: 0 };
}

export interface DriveFrame {
  /** Pés (px de mundo) e a direção do desenho. */
  x: number;
  y: number;
  dir: Dir;
}

/**
 * Avança `dt` s. Parado até a largada, depois anda com a velocidade-base × freio das curvas × uma oscilação, trocando de
 * faixa de tempos em tempos. Ao completar as voltas marca `finishedAt` (e, se `auto`, volta ao assento). `seat` é onde
 * (px) o kart volta a ficar parado.
 */
export function stepDrive(d: Drive, track: KartTrack, dt: number, now: number, rng: () => number, seat: { x: number; y: number }): DriveFrame {
  if (d.back) {
    d.back.t = Math.min(1, d.back.t + dt / RETURN_S);
    const k = d.back.t * d.back.t * (3 - 2 * d.back.t);
    if (d.back.t >= 1) d.done = true;
    const dx = seat.x - d.back.x;
    const dy = seat.y - d.back.y;
    return { x: d.back.x + dx * k, y: d.back.y + dy * k, dir: Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up' };
  }
  if (now >= d.startAt && !d.finishedAt) {
    const v = d.base * track.speedAt(d.s) * (1 + 0.05 * Math.sin(now / 700 + d.phase));
    d.s += v * dt;
    if (now >= d.offAt) {
      d.offGoal = (rng() * 2 - 1) * LANE_MAX;
      d.offAt = now + 1800 + rng() * 2500;
    }
    const step = LANE_SPEED * dt;
    d.off += Math.max(-step, Math.min(step, d.offGoal - d.off));
    d.lapsDone = lapsOf(d, track);
    if (d.laps > 0 && d.lapsDone >= d.laps) d.finishedAt = now;
  } else if (d.finishedAt) {
    // depois da chegada continua rodando (uma volta de desaceleração) até o recall
    d.s += d.base * 0.6 * dt;
    d.off += Math.max(-LANE_SPEED * dt, Math.min(LANE_SPEED * dt, 0 - d.off));
  }
  const p = track.at(d.s, d.off);
  const f = track.feet(p);
  return { x: f.x, y: f.y, dir: p.dir };
}
