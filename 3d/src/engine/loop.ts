/**
 * Laço com PASSO FIXO por acumulador.
 *
 * Não é delta variável: física de plataforma com dt variável muda de
 * comportamento entre um monitor de 60Hz e um de 144Hz, e a mesma entrada
 * deixa de produzir o mesmo pulo. Passo fixo é o que faz "sentiu bom aqui"
 * valer na máquina do outro.
 *
 * O teto de acumulação evita espiral da morte quando a aba volta de
 * background com um delta gigante.
 */
export const FIXED_DT_MS = 1000 / 60;
const MAX_ACCUM_MS = 200;

export class GameLoop {
  private raf: number | null = null;
  private last = 0;
  private accum = 0;

  constructor(
    private readonly step: (dtMs: number) => void,
    private readonly draw: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.raf !== null) return;
    this.last = performance.now();
    const tick = (now: number): void => {
      this.accum = Math.min(MAX_ACCUM_MS, this.accum + (now - this.last));
      this.last = now;
      while (this.accum >= FIXED_DT_MS) {
        this.step(FIXED_DT_MS);
        this.accum -= FIXED_DT_MS;
      }
      this.draw(this.accum / FIXED_DT_MS);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}
