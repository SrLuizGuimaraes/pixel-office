// O texto REAL que o monitor da mesa mostra (em vez de só desenhos): o comando, o arquivo ou a consulta da atividade de
// quem está sentado ali. O servidor já manda isso mascarado de segredos em Activity.detail. A tela do monitor é pequena
// (16x11 px), então o texto passa em faixa rolante; o conteúdo completo aparece ao passar o mouse (ui/hovertip.ts).
// Puro (sem canvas), para testar.
import type { ScreenMode } from '../../art/api';
import type { Activity } from '../../../../shared/types';

const MAX_CHARS = 160;
/** Tipos cuja tela mostra o texto da atividade. */
const SHOWS = new Set(['run', 'test', 'git', 'edit', 'write', 'read', 'search', 'web', 'browser', 'mcp', 'respond']);

export interface MonitorColors {
  /** Cor do texto e do fundo da faixa (seguem o programa que a tela está "rodando"). */
  fg: string;
  bg: string;
}

const COLORS: Partial<Record<ScreenMode, MonitorColors>> = {
  terminal: { fg: '#8cf5a8', bg: '#0d1a13' },
  code: { fg: '#9fd0ff', bg: '#0f1829' },
  browser: { fg: '#eef3ff', bg: '#1b3860' },
  search: { fg: '#ffd98a', bg: '#2a2418' },
  docs: { fg: '#ece6cf', bg: '#2a2923' },
};
const FALLBACK: MonitorColors = { fg: '#d6e6ff', bg: '#14213b' };

export function monitorColors(mode: ScreenMode): MonitorColors {
  return COLORS[mode] ?? FALLBACK;
}

/** Último trecho de um caminho (a pasta some; o nome do arquivo é o que importa numa tela pequena). */
function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/** Cara de caminho de arquivo (sem espaços nem operadores de shell). */
const looksLikePath = (s: string) => /[\\/]/.test(s) && !/\s/.test(s) && !/[|&;<>$`]/.test(s);

/**
 * O texto para a faixa do monitor, ou '' quando a atividade não tem o que mostrar (pensando, sem detalhe...).
 * Terminal: "$ comando"; editor e leitura: o nome do arquivo; navegador e busca: o endereço ou a consulta sem "https://".
 */
export function monitorText(activity: Activity | undefined): string {
  if (!activity || !SHOWS.has(activity.kind)) return '';
  const raw = (activity.detail ?? '').split('\n').find((l) => l.trim()) ?? '';
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // só arquivos viram nome curto: o endereço e a consulta ficam como vieram
  if ((activity.kind === 'edit' || activity.kind === 'write' || activity.kind === 'read') && looksLikePath(text)) text = basename(text);
  switch (activity.kind) {
    case 'run':
    case 'test':
    case 'git':
      text = `$ ${text}`;
      break;
    case 'web':
    case 'browser':
      text = text.replace(/^https?:\/\/(www\.)?/i, '');
      break;
  }
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}

/** Posição x (px) do início do texto rolante: entra pela direita e sai pela esquerda, sem parar, em `speed` px/s. */
export function marqueeX(left: number, width: number, textWidth: number, now: number, seed: number, speed = 22): number {
  const span = textWidth + width;
  const phase = (seed % 97) * 5;
  return left + width - (((now / 1000) * speed + phase) % span);
}
