// Pacote de palavrões: falas extras em português do Brasil (xingamento de humor entre colegas de trabalho:
// porra, caralho, merda...), usadas só quando a preferência "Pacote de palavrões" está ligada (ver
// WorldOptions.profanity). Regra: só palavrões genéricos. Nada contra raça, etnia, religião, gênero,
// orientação sexual, deficiência ou qualquer grupo, e nada de ameaça. As traduções ficam em shared/locales.
import { tr } from '../../../../shared/i18n';
import type { Pool } from './lines';

export const SWEAR = {
  lose: [tr("Puta que pariu!"), tr("Que merda, perdi!"), tr("Porra, de novo não!"), tr("Caralho, que azar do cacete!"), tr("Foda-se, na próxima eu ganho!"), tr("Que bosta de jogada!"), tr("Tô com um azar da porra!")] as Pool,
  win: [tr("Toma, caralho! 💰"), tr("Paga logo, porra!"), tr("Ganhei, porra! 🏆"), tr("Aí, caralho! Que jogada!"), tr("Mole demais, puta merda 😎")] as Pool,
  point: [tr("Toma essa, porra!"), tr("Defende essa, caralho!"), tr("Na veia, porra!"), tr("Que porra de lag é essa?!"), tr("Essa foi foda! 💥"), tr("Tá fácil pra caralho 😎")] as Pool,
  cheer: [tr("Vai, {nome}, porra!"), tr("Que jogada do caralho!"), tr("Puta merda, {nome}!")] as Pool,
  rivalInvite: [tr("Revanche, porra! Hoje não perco 😏"), tr("Vem cá, caralho, que hoje eu te ganho 😏")] as Pool,
  rematch: [tr("Revanche, porra!"), tr("De novo, caralho! Agora eu ganho!")] as Pool,
  watch: [tr("Puta merda!"), tr("Caralho!"), tr("Que porra foi essa?!")] as Pool,
  react: [tr("Caralho, sério?!"), tr("Que porra!"), tr("Tá de sacanagem?!")] as Pool,
  work: [tr("Esse bug em {sala} tá uma merda"), tr("Quem mexeu no package-lock, porra?!"), tr("Deploy na sexta? Que ideia de merda 😈"), tr("Esse teste instável é foda, caralho"), tr("Tô fodido com esse prazo")] as Pool,
  generic: [tr("Que dia de merda, hein"), tr("Tô cansado pra caralho"), tr("Preciso de férias, porra 🏖️")] as Pool,
  mirror: [tr("Esse cabelo não colabora, porra…"), tr("Tô lindo pra caralho ✨")] as Pool,
  called: [tr("Puta que pariu, me chamaram! 🏃"), tr("Fui, porra! Trabalho chegou")] as Pool,
  shellDone: [tr("Terminou a porra do build, fui!")] as Pool,
  shellFail: [tr("Puta merda, o comando falhou! 🌧️"), tr("Que merda, deu erro de novo…"), tr("Foda-se, roda de novo.")] as Pool,
  taskFail: [tr("Porra, deu erro! 😓"), tr("Caralho, que merda foi essa?")] as Pool,
  ciFail: [tr("Porra, o CI quebrou! 🔴"), tr("Caralho, o CI falhou de novo"), tr("Que merda, quebrei o build…")] as Pool,
  permission: [tr("Porra, preciso de permissão pra isso! ✋"), tr("Puta merda, bloquearam de novo! ✋")] as Pool,
};
