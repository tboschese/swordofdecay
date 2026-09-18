/**
 * Teclado sem Phaser: rastreia estado bruto (isDown) e computa
 * justDown/justUp comparando contra o snapshot do frame anterior.
 * `endFrame()` precisa ser chamado uma vez por tick, depois de todo update
 * ter lido o teclado — mesma semântica de Phaser.Input.Keyboard.JustDown,
 * só que sem consumir o evento (cada key pode ser checada mais de uma vez
 * no mesmo frame sem perder o estado).
 */
export class Keyboard {
  private readonly down = new Set<string>();
  private previousDown = new Set<string>();
  private readonly preventDefaultCodes: Set<string>;

  constructor(preventDefaultCodes: string[] = []) {
    this.preventDefaultCodes = new Set(preventDefaultCodes);

    window.addEventListener("keydown", (event) => {
      this.down.add(event.code);
      if (this.preventDefaultCodes.has(event.code)) event.preventDefault();
    });
    window.addEventListener("keyup", (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  justDown(code: string): boolean {
    return this.down.has(code) && !this.previousDown.has(code);
  }

  justUp(code: string): boolean {
    return !this.down.has(code) && this.previousDown.has(code);
  }

  /** Snapshot do estado atual — chamar 1x por tick, depois de todos os updates lerem o teclado. */
  endFrame(): void {
    this.previousDown = new Set(this.down);
  }
}
