/**
 * Loop de jogo sem Phaser: requestAnimationFrame com delta variável (igual
 * ao comportamento default do Phaser), com teto pra evitar "spiral of
 * death" quando a aba fica em background e volta com um delta gigante.
 */
const MAX_DELTA_MS = 50;

export class GameLoop {
  private rafHandle: number | null = null;
  private lastTimestamp: number | null = null;

  constructor(
    private readonly update: (deltaMs: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafHandle === null) return;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
    this.lastTimestamp = null;
  }

  private readonly tick = (timestamp: number): void => {
    const deltaMs = this.lastTimestamp === null ? 16.7 : Math.min(MAX_DELTA_MS, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;

    this.update(deltaMs);
    this.render();

    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
