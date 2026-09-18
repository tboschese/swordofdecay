/**
 * PRNG semeável (mulberry32). Nada de `Math.random()` no jogo: a captura
 * determinística do harness é o que torna duas rodadas comparáveis, e uma
 * única chamada solta a quebra inteira.
 */
export class Rng {
  private state = 0;
  seed(value: number): void {
    this.state = value >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export const rng = new Rng();

/** Hash de posição: variação estável, que não cintila quando a câmera anda. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
