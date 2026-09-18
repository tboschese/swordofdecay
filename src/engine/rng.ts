/**
 * PRNG semeável — existe para tornar o jogo capturável de forma
 * determinística (ver `shots/`). Sem isso, screenshake e partículas
 * divergem entre execuções e duas capturas do "mesmo" frame não são
 * comparáveis, o que inviabiliza julgar uma rodada contra a anterior.
 *
 * mulberry32: 32 bits de estado, distribuição boa o suficiente pra
 * efeito visual, e barato — é chamado várias vezes por frame.
 *
 * Em jogo normal a seed vem do relógio, então o comportamento é o mesmo
 * de `Math.random()`. Só o harness chama `seed()` com valor fixo.
 */
class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  seed(seed: number): void {
    this.state = seed >>> 0;
  }

  /** Mesmo contrato de Math.random(): [0, 1). */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
