/**
 * Teclado com bordas. `justDown` é o que permite pulo com buffer e ataque
 * carregado; sem borda, só dá pra ler "está apertado", que não distingue
 * apertar de segurar.
 */
const WATCHED = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyZ", "KeyX", "KeyC"] as const;
export type KeyCode = (typeof WATCHED)[number];

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (!WATCHED.includes(e.code as KeyCode)) return;
      e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      if (!WATCHED.includes(e.code as KeyCode)) return;
      e.preventDefault();
      this.down.delete(e.code);
      this.released.add(e.code);
    });
  }

  isDown(code: KeyCode): boolean {
    return this.down.has(code);
  }
  justDown(code: KeyCode): boolean {
    return this.pressed.has(code);
  }
  justUp(code: KeyCode): boolean {
    return this.released.has(code);
  }
  /** Chamar DEPOIS do update. Consome as bordas do quadro. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }
}
