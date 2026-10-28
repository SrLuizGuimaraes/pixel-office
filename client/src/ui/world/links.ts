// Links do Pixel Office World para fora (termos e privacidade), usados pela seção de Configurações, pelo cartão "Seu
// prédio", pela janela "Ver o que foi enviado" e pelo cartão de convite.
import { h } from '../dom';

export const WORLD_TERMS_URL = 'https://github.com/SrLuizGuimaraes/pixel-office/blob/main/docs/world/privacidade.md';
export const WORLD_PRIVACY_URL = 'https://github.com/SrLuizGuimaraes/pixel-office/blob/main/docs/world/privacidade.md';

/** Link para fora (termos, privacidade), sempre em outra aba. */
export function extLink(text: string, href: string): HTMLAnchorElement {
  return h('a', { class: 'ui-link-btn', text, attrs: { href, target: '_blank', rel: 'noopener noreferrer' } });
}
