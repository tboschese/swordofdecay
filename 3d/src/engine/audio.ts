/**
 * Som por SÍNTESE, não por arquivo.
 *
 * O projeto proíbe asset externo, e o destino de publicação roda sob CSP
 * estrito — mas a razão principal é outra: um plataforma sem som de pulo e
 * de impacto lê como protótipo por mais bonita que esteja a arte. Foi o
 * diagnóstico do playtest do jogo 2D, onde a trilha existia e nenhuma AÇÃO
 * fazia barulho.
 *
 * Web Audio dá osciladores e ruído de graça. Cada som aqui é um envelope
 * curto sobre uma fonte simples — é o suficiente pra ação ter peso, e não
 * carrega um byte.
 *
 * **Autoplay.** Navegador não deixa tocar sem gesto do usuário. O jogo tem
 * o gesto de graça: o Z que sai do cartaz de título. Por isso `unlock()` é
 * chamado dali, e antes disso tudo aqui é inerte.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

/** Ruído branco reaproveitado — gerar um buffer por disparo é desperdício. */
let noiseBuf: AudioBuffer | null = null;

export function setEnabled(value: boolean): void {
  enabled = value;
}

/** Chamar de dentro de um gesto do usuário. Idempotente. */
export function unlock(): void {
  if (!enabled || ctx) return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  // Volume de fundo baixo de propósito: som de ação some se a mistura
  // estiver alta, e no jogo 2D o valor herdado nunca tinha sido OUVIDO.
  master.gain.value = 0.32;
  master.connect(ctx.destination);

  const len = Math.floor(ctx.sampleRate * 0.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // PRNG local: `Math.random` está proibido no projeto por causa da captura
  // determinística, e ruído é justamente onde a tentação aparece.
  let s = 0x9e3779b9;
  for (let i = 0; i < len; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    d[i] = (((t ^ (t >>> 14)) >>> 0) / 2147483648) - 1;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  bendTo?: number,
  delay = 0,
): void {
  if (!ctx || !master) return;
  // Atraso agendado no relógio do ÁUDIO, não em `setTimeout`. Dois motivos:
  // o relógio do navegador desliza sob carga e desalinha a segunda nota, e
  // `window` nem existe no harness em Node — a primeira versão quebrava o
  // smoke test de travessia ao alcançar o objetivo.
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (bendTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, bendTo), t0 + dur);
  // Ataque de 4ms: subida instantânea estala (clique de descontinuidade),
  // subida lenta tira o impacto. 4ms é o meio-termo que soa como golpe.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain: number, hz: number, q = 1): void {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(hz, t0);
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/**
 * Cada som é desenhado pra dizer uma coisa específica:
 * o pulo SOBE em altura (o corpo saindo do chão), o pouso DESCE e tem
 * corpo de ruído (massa encontrando pedra), o golpe é ruído passando
 * (ar cortado) e o impacto é ruído grave e curto (matéria cedendo).
 */
export const sfx = {
  jump(): void {
    tone(300, 0.16, "square", 0.16, 620);
  },
  land(): void {
    tone(190, 0.1, "sine", 0.16, 90);
    noise(0.1, 0.1, 420, 0.8);
  },
  swing(): void {
    noise(0.14, 0.14, 1700, 1.6);
  },
  hit(): void {
    // Dois componentes: o estalo agudo do aço e o baque grave da carne.
    noise(0.09, 0.3, 900, 0.7);
    tone(120, 0.18, "square", 0.2, 55);
  },
  enemyDeath(): void {
    noise(0.34, 0.24, 320, 0.5);
    tone(160, 0.3, "sawtooth", 0.12, 48);
  },
  hurt(): void {
    tone(220, 0.26, "sawtooth", 0.22, 90);
  },
  goal(): void {
    // Duas notas subindo: é o único som ascendente e resolvido do jogo, e
    // por isso lê como conclusão sem precisar de fanfarra.
    tone(392, 0.16, "triangle", 0.2);
    tone(587, 0.34, "triangle", 0.2, undefined, 0.13);
  },
};
