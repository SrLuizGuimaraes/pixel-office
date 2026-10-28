// As telas das mesas em 3D: cada monitor mostra o texto real da atividade de quem está sentado ali (como o monitor 2D),
// em cores do programa que a tela "roda"; mesa vaga ou sala apagada fica em espera.
import * as THREE from 'three';
import type { Character } from '../world/sim/character';
import type { Sim } from '../world/sim/sim';
import { screenModeFor } from '../world/sim/behavior';
import { monitorColors, monitorText } from '../world/render/monitor-text';
import type { DeskVis } from './building3d';

const W = 160;
const H = 96;

interface Screen {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  key: string;
}

export class DeskScreens {
  private screens = new Map<THREE.Mesh, Screen>();
  private deskSpot = new Map<string, string>();
  private version = -1;
  private nextAt = 0;

  constructor(private readonly sim: Sim) {}

  private index(): void {
    if (this.version === this.sim.layoutVersion) return;
    this.version = this.sim.layoutVersion;
    this.deskSpot.clear();
    for (const s of this.sim.spots.all()) if (s.kind === 'desk' && s.deskId) this.deskSpot.set(s.deskId, s.id);
  }

  /** Redesenha as telas que mudaram (no máximo a cada 350 ms). */
  update(desks: readonly DeskVis[], now: number): void {
    if (now < this.nextAt) return;
    this.nextAt = now + 350;
    this.index();
    for (const d of desks) {
      const spotId = this.deskSpot.get(d.furnitureId);
      const owner = spotId ? this.sim.spots.ownerOf(spotId) : undefined;
      const ch: Character | undefined = owner ? this.sim.chars.get(owner) : undefined;
      const here = !!ch && ch.atSpot === spotId && !ch.leaving;
      let mode: string;
      let text = '';
      let fg = '#4aa3f0';
      let bg = '#22324f';
      if (here && ch) {
        const act = ch.info.activity;
        if (ch.mode === 'work' || ch.mode === 'wait' || ch.mode === 'shell') {
          const m = screenModeFor(act?.kind);
          const c = monitorColors(m);
          fg = c.fg;
          bg = c.bg;
          text = monitorText(act);
          mode = m;
        } else {
          mode = 'standby';
        }
      } else mode = 'standby';
      const key = `${mode}|${text}|${fg}`;
      let s = this.screens.get(d.mesh);
      if (!s) {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        s = { canvas, tex, key: '' };
        this.screens.set(d.mesh, s);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        d.mesh.material = mat;
      }
      if (s.key === key) continue;
      s.key = key;
      const g = s.canvas.getContext('2d')!;
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      if (mode === 'standby') {
        g.fillStyle = 'rgba(74,163,240,.55)';
        g.fillRect(W / 2 - 8, H / 2 - 8, 16, 16);
      } else {
        g.fillStyle = fg;
        g.font = 'bold 15px ui-monospace, monospace';
        g.textBaseline = 'top';
        const t = text || '…';
        // quebra em linhas de ~22 caracteres (até 5)
        const lines: string[] = [];
        for (let i = 0; i < t.length && lines.length < 5; i += 22) lines.push(t.slice(i, i + 22));
        lines.forEach((l, i) => g.fillText(l, 6, 6 + i * 17));
        g.globalAlpha = 0.35;
        g.fillRect(6, H - 10, 40, 3);
        g.globalAlpha = 1;
      }
      s.tex.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const s of this.screens.values()) s.tex.dispose();
    this.screens.clear();
  }
}
