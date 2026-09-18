/**
 * Trilha de fundo por mood.
 *
 * Existe porque a música SUMIU na migração do Phaser pro engine próprio e
 * ninguém notou: `config/music.ts` continuou lá, o ROADMAP continuou
 * dizendo que a faixa toca "em loop via TilemapScene" — e `TilemapScene` é
 * uma das cenas Phaser deletadas. O jogo passou a rodar sem uma nota, com
 * 20MB de .ogg em `public/` que nada lia.
 *
 * Deliberadamente pequeno: um `HTMLAudioElement` em loop. Não usa
 * `AudioContext` porque nada aqui precisa de mixagem, efeito ou sample
 * preciso — só uma faixa tocando por trás. Web Audio viraria complexidade
 * sem função.
 *
 * **Autoplay.** Navegador não deixa tocar áudio sem gesto do usuário, e o
 * jogo tem o gesto certo de graça: o Z que sai da tela de título. Por isso
 * `play()` é chamado dali e não da inicialização — carregar no boot e
 * tocar no gesto é o que evita tanto o bloqueio quanto o silêncio.
 *
 * **Harness.** A captura determinística chama `setEnabled(false)`: nada de
 * áudio deve rodar num headless que grava PNG. Não afeta determinismo (o
 * áudio não toca no `rng`), mas baixar 6MB por cenário e disparar
 * `play()` bloqueado só gera ruído no log e tempo de captura.
 */
import { MUSIC_TRACKS, MUSIC_VOLUME, type Mood } from "../config/music";

let enabled = true;
let current: HTMLAudioElement | null = null;
let currentMood: Mood | null = null;

/** Desliga tudo. Usado pelo harness de captura. */
export function setEnabled(value: boolean): void {
  enabled = value;
  if (!value) stop();
}

/**
 * Prepara a faixa do mood sem tocar. Chamar cedo (boot) pra que o áudio
 * já esteja em buffer quando o jogador apertar Z.
 */
export function preload(mood: Mood): void {
  if (!enabled || typeof Audio === "undefined") return;
  if (currentMood === mood && current) return;
  stop();
  const track = MUSIC_TRACKS[mood];
  const el = new Audio(track.path);
  el.loop = true;
  el.volume = MUSIC_VOLUME;
  el.preload = "auto";
  current = el;
  currentMood = mood;
}

/**
 * Toca a faixa já preparada. Só funciona a partir de um gesto do usuário —
 * a promise rejeitada é engolida de propósito: áudio bloqueado é chato,
 * mas não é motivo pra derrubar o jogo.
 */
export function play(): void {
  if (!enabled || !current) return;
  void current.play().catch(() => {});
}

export function stop(): void {
  if (!current) return;
  current.pause();
  current.currentTime = 0;
  current = null;
  currentMood = null;
}
