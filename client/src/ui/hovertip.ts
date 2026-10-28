// Dica flutuante do personagem sob o cursor: acompanha o personagem quadro a quadro.
import type { UiComponent, UiContext } from './context';
import { h, setHidden, setText, setVariant } from './dom';
import { formatDuration } from './format';
import { screenModeFor } from '../world/sim/behavior';
import { shellStage, shellWaitIn, statusLabel } from './model';
import { providerOf } from './provider';
import {
  createAccountChip,
  createActivityLine,
  createProviderTag,
  createStatusDot,
  updateAccountChip,
  updateActivityLine,
  updateProviderTag,
  updateShellActivityLine,
  updateStatusDot,
} from './widgets';
import { tr } from '../../../shared/i18n';
import type { AgentInfo } from '../../../shared/types';
import type { ScreenMode } from '../art/api';

/** Nome do programa que a tela do monitor está rodando. */
const SCREEN_NAMES: Partial<Record<ScreenMode, string>> = {
  terminal: tr('Terminal'),
  code: tr('Editor'),
  browser: tr('Navegador'),
  search: tr('Busca'),
  docs: tr('Documento'),
};

export class HoverTip implements UiComponent {
  readonly el: HTMLElement;
  private id: string | null = null;
  private raf = 0;
  private name: HTMLElement;
  private chip: HTMLElement;
  private prov: HTMLElement;
  private dot: HTMLElement;
  private status: HTMLElement;
  private activity: HTMLElement;
  private mood: HTMLElement;
  private task: HTMLElement;
  private since: HTMLElement;
  /** O monitor ampliado: o que a tela da mesa está mostrando (o comando, o arquivo, a consulta). */
  private screen: HTMLElement;
  private screenHead: HTMLElement;
  private screenBody: HTMLElement;
  private screenTail: HTMLElement;

  constructor(private ctx: UiContext) {
    this.name = h('strong', { class: 'ui-tip__name' });
    this.chip = createAccountChip('sm');
    this.prov = createProviderTag('ui-prov--xs');
    this.dot = createStatusDot();
    this.status = h('span', { class: 'ui-tip__status' });
    this.activity = createActivityLine();
    this.mood = h('div', { class: 'ui-tip__mood', hidden: true });
    this.task = h('div', { class: 'ui-tip__task', hidden: true });
    this.since = h('span', { class: 'ui-tip__since' });
    this.screenHead = h('div', { class: 'ui-tip__screenhead' });
    this.screenBody = h('pre', { class: 'ui-tip__screenbody' });
    this.screenTail = h('div', { class: 'ui-tip__screentail' });
    this.screen = h('div', { class: 'ui-tip__screen', hidden: true }, this.screenHead, this.screenBody, this.screenTail);
    this.el = h(
      'div',
      { class: 'ui-tip', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'ui-tip__top' }, this.name, this.chip, this.prov),
      this.task,
      h('div', { class: 'ui-tip__line' }, this.dot, this.status, this.since),
      this.activity,
      this.screen,
      this.mood,
    );
    ctx.world.onHover((id) => this.setTarget(id));
  }

  private setTarget(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    this.el.classList.toggle('is-visible', !!id);
    cancelAnimationFrame(this.raf);
    if (id) {
      this.render();
      this.follow();
    }
  }

  /** Reposiciona a cada quadro enquanto houver alguém sob o cursor. */
  private follow = (): void => {
    if (!this.id) return;
    const p = this.ctx.world.screenPositionOf(this.id);
    if (!p) {
      this.el.classList.remove('is-visible');
    } else {
      this.el.classList.add('is-visible');
      const w = this.el.offsetWidth;
      const hgt = this.el.offsetHeight;
      const x = Math.round(Math.min(innerWidth - w - 8, Math.max(8, p.x - w / 2)));
      const below = p.y - hgt - 10 < 72;
      const y = Math.round(below ? p.y + 46 : p.y - hgt - 10);
      this.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    this.raf = requestAnimationFrame(this.follow);
  };

  /** O monitor ampliado: o conteúdo exato da atividade (já mascarado de segredos pelo servidor) e as últimas ações. */
  private renderScreen(a: AgentInfo): void {
    const act = a.activity;
    const text = act?.detail?.trim();
    const show = !!act && !!text && a.status !== 'idle';
    setHidden(this.screen, !show);
    if (!show || !act || !text) return;
    const mode = screenModeFor(act.kind);
    this.screen.dataset.mode = mode;
    setText(this.screenHead, SCREEN_NAMES[mode] ?? tr('Tela'));
    setText(this.screenBody, act.kind === 'run' || act.kind === 'test' || act.kind === 'git' ? `$ ${text}` : text);
    const before = a.recent.filter((r) => r.id !== act.id).slice(-3);
    setHidden(this.screenTail, !before.length);
    setText(this.screenTail, before.map((r) => `› ${r.text}`).join('\n'));
  }

  render(): void {
    if (!this.id) return;
    const a = this.ctx.agent(this.id);
    if (!a) {
      this.setTarget(null);
      return;
    }
    setText(this.name, a.name);
    updateAccountChip(this.chip, this.ctx.account(a.account), a.account, a.provider);
    updateProviderTag(this.prov, providerOf(a));
    // Esperando um shell: o que ele espera (com o tempo correndo) e o que anda fazendo enquanto isso.
    const now = this.ctx.now();
    const wait = shellWaitIn(a, this.ctx.store.snapshot?.agents ?? [], now);
    const status = wait ? 'shell' : a.status;
    updateStatusDot(this.dot, status);
    setText(this.status, a.status === 'waiting' && a.waitingFor ? `${statusLabel(a.status)}: ${a.waitingFor}` : `${statusLabel(status)}${a.kind === 'sub' ? ` · ${a.role}` : ''}`);
    setVariant(this.el, 'is-', status);
    // Do que se trata a sessão (título) e há quanto tempo está nesse estado (ex.: ociosa há 12 min).
    const title = a.title?.trim();
    setHidden(this.task, !title);
    if (title) setText(this.task, title);
    const inStatus = now - a.statusSince;
    setText(this.since, a.statusSince && inStatus >= 60_000 ? tr('há {0}', [formatDuration(inStatus)]) : '');
    if (wait) updateShellActivityLine(this.activity, wait, now);
    else updateActivityLine(this.activity, a.activity);
    this.renderScreen(a);
    setHidden(this.mood, !wait);
    if (wait) {
      const stage = shellStage(now - wait.since);
      setText(this.mood, `${stage.emoji} ${stage.text}`);
    }
  }
}
