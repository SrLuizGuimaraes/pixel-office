// Rótulos DOM da vista 3D: nome, balão de atividade e ícone sobre a cabeça de cada personagem, projetados a cada quadro.

export interface LabelData {
  id: string;
  name: string;
  /** Posição na tela (CSS px), ou null quando fora de vista. */
  x: number;
  y: number;
  visible: boolean;
  status: string;
  /** Mostra o nome (opção "nomes", seleção, hover ou espera). */
  showName: boolean;
  bubble: string;
  icon: string;
  selected: boolean;
  hovered: boolean;
}

const ICONS: Record<string, string> = {
  zzz: '💤', coffee: '☕', music: '🎵', idea: '💡', alert: '❗', question: '❓', check: '✅', heart: '❤️', sweat: '😅', star: '⭐',
  lightning: '⚡', chat: '💬', box: '📦', wave: '👋', hourglass: '⏳', hourglass_flip: '⏳', storm: '⛈️', coin: '🪙', cobweb: '🕸️',
};

export const iconEmoji = (icon: string | null | undefined): string => (icon ? (ICONS[icon] ?? '') : '');

const STATUS_COLOR: Record<string, string> = { working: '#4cd37b', waiting: '#ffb02e', idle: '#8a93a6', shell: '#5aa9ff', done: '#8a93a6', offline: '#555d6e' };

interface Slot {
  el: HTMLDivElement;
  dot: HTMLSpanElement;
  name: HTMLSpanElement;
  bubble: HTMLDivElement;
}

export class LabelLayer {
  readonly el: HTMLDivElement;
  private slots = new Map<string, Slot>();

  constructor(after: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'w3d-labels';
    after.after(this.el);
  }

  private make(): Slot {
    const el = document.createElement('div');
    el.className = 'w3d-label';
    const bubble = document.createElement('div');
    bubble.className = 'w3d-bubble';
    const row = document.createElement('div');
    row.className = 'w3d-name';
    const dot = document.createElement('span');
    dot.className = 'w3d-dot';
    const name = document.createElement('span');
    row.append(dot, name);
    el.append(bubble, row);
    this.el.append(el);
    return { el, dot, name, bubble };
  }

  update(items: readonly LabelData[]): void {
    const seen = new Set<string>();
    for (const it of items) {
      let s = this.slots.get(it.id);
      if (!s) this.slots.set(it.id, (s = this.make()));
      seen.add(it.id);
      const show = it.visible && (it.showName || !!it.bubble || !!it.icon);
      s.el.style.display = show ? '' : 'none';
      if (!show) continue;
      s.el.style.transform = `translate(${Math.round(it.x)}px, ${Math.round(it.y)}px) translate(-50%, -100%)`;
      s.el.classList.toggle('is-selected', it.selected);
      s.el.classList.toggle('is-hovered', it.hovered);
      s.el.style.zIndex = it.selected ? '3' : it.hovered ? '2' : '1';
      s.name.parentElement!.style.display = it.showName ? '' : 'none';
      if (s.name.textContent !== it.name) s.name.textContent = it.name;
      s.dot.style.background = STATUS_COLOR[it.status] ?? '#8a93a6';
      const b = `${it.icon ? it.icon + ' ' : ''}${it.bubble}`.trim();
      s.bubble.style.display = b ? '' : 'none';
      if (s.bubble.textContent !== b) s.bubble.textContent = b;
      s.el.classList.toggle('is-alert', it.status === 'waiting');
    }
    for (const [id, s] of this.slots) {
      if (seen.has(id)) continue;
      s.el.remove();
      this.slots.delete(id);
    }
  }

  dispose(): void {
    this.el.remove();
    this.slots.clear();
  }
}

export const LABEL_CSS = `
.w3d-labels{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.w3d-label{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;will-change:transform;font:600 11px/1.2 "Pixelify Sans",system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8)}
.w3d-name{display:flex;align-items:center;gap:4px;padding:1px 6px;border-radius:9px;background:rgba(18,21,29,.78);border:1px solid rgba(255,255,255,.18);white-space:nowrap}
.w3d-dot{width:7px;height:7px;border-radius:50%;flex:none}
.w3d-bubble{max-width:200px;padding:3px 7px;border-radius:8px;background:rgba(255,255,255,.95);color:#1b2030;text-shadow:none;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.w3d-label.is-selected .w3d-name{border-color:#ffd84a;background:rgba(48,40,10,.88)}
.w3d-label.is-hovered .w3d-name{border-color:#fff}
.w3d-label.is-alert .w3d-name{border-color:#ffb02e;animation:w3d-pulse 1.2s infinite}
@keyframes w3d-pulse{50%{box-shadow:0 0 0 3px rgba(255,176,46,.35)}}
`;

