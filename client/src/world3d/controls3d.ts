// Painel da vista 3D: como as paredes que ficam entre a câmera e o foco se comportam (cheias, recortadas, baixas), como
// os controles de parede do simulação de vida.
import { tr } from '../../../shared/i18n';
import { LABEL_CSS } from './labels3d';

export const STYLE_ID = 'w3d-style';
export type WallMode = 'up' | 'cut' | 'down';

const CSS = `${LABEL_CSS}
.w3d-panel{position:fixed;right:14px;bottom:86px;display:flex;flex-direction:column;gap:8px;padding:8px;border-radius:12px;background:rgba(18,21,29,.82);border:1px solid rgba(255,255,255,.16);color:#e8ecf5;font:600 12px/1.2 "Pixelify Sans",system-ui,sans-serif;z-index:5;pointer-events:auto;backdrop-filter:blur(6px)}
.w3d-panel h4{margin:0 0 2px;font:700 11px/1 inherit;opacity:.7;letter-spacing:.06em;text-transform:uppercase}
.w3d-col{display:flex;flex-direction:column;gap:3px}
.w3d-btn{cursor:pointer;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:inherit;border-radius:8px;padding:5px 9px;font:inherit}
.w3d-btn:hover{background:rgba(255,255,255,.16)}
.w3d-btn.is-on{background:#3f7fd8;border-color:#8cb6f0;color:#fff}
.w3d-row{display:flex;gap:4px}.w3d-row .w3d-btn{flex:1;font-size:15px;padding:3px 8px}
.w3d-hint{opacity:.55;font-weight:500;max-width:150px}
`;

export class Controls3d {
  readonly el: HTMLDivElement;
  private wallBtns = new Map<WallMode, HTMLButtonElement>();
  private mode: WallMode = 'cut';

  constructor(
    private readonly onChange: (mode: WallMode) => void,
    private readonly onRotate: (turns: 1 | -1) => void = () => {},
    hintText: string = tr('Arraste para girar (ou use Q e E), botão direito para mover, roda para o zoom.'),
  ) {
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.append(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'w3d-panel';
    const walls = document.createElement('div');
    walls.className = 'w3d-col';
    const wh = document.createElement('h4');
    wh.textContent = tr('Paredes');
    walls.append(wh);
    for (const [mode, label] of [['up', tr('Cheias')], ['cut', tr('Recorte')], ['down', tr('Baixas')]] as const) {
      const b = document.createElement('button');
      b.className = 'w3d-btn';
      b.textContent = label;
      b.addEventListener('click', () => this.set(mode));
      this.wallBtns.set(mode, b);
      walls.append(b);
    }
    const rot = document.createElement('div');
    rot.className = 'w3d-col';
    const rh = document.createElement('h4');
    rh.textContent = tr('Girar');
    rot.append(rh);
    const row = document.createElement('div');
    row.className = 'w3d-row';
    for (const [turns, label, title] of [[-1, '⟲', tr('Girar a vista (Q)')], [1, '⟳', tr('Girar a vista (E)')]] as const) {
      const b = document.createElement('button');
      b.className = 'w3d-btn';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => this.onRotate(turns));
      row.append(b);
    }
    rot.append(row);
    const hint = document.createElement('div');
    hint.className = 'w3d-hint';
    hint.textContent = hintText;
    this.el.append(walls, rot, hint);
    document.body.append(this.el);
    this.paint();
  }

  get value(): WallMode {
    return this.mode;
  }

  set(mode: WallMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.paint();
    this.onChange(mode);
  }

  private paint(): void {
    for (const [m, b] of this.wallBtns) b.classList.toggle('is-on', m === this.mode);
  }

  dispose(): void {
    this.el.remove();
  }
}
