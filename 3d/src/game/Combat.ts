/**
 * Espada e impacto.
 *
 * **Hitstop é a peça que faz o golpe ter peso**, e é contra-intuitiva: o
 * jogo PARA por alguns quadros no momento do acerto. Sem isso o inimigo
 * apenas desaparece e a pancada não existe. O projeto 2D mediu isso no
 * relógio do mundo e a conclusão foi que 4 quadros bastam pro golpe normal.
 *
 * Autorado em QUADROS e não em ms de propósito: hitstop é fenômeno de
 * quadro, e escrever "66.7ms" esconde que o número real é 4.
 */
import { Enemy } from "./Enemy";
import type { Aabb } from "./Level";
import type { Keyboard } from "../engine/input";

const SWING = {
  /** Quadros do golpe inteiro, do saque ao recolher. */
  durationFrames: 18,
  /** Quadros em que a lâmina machuca — bem menos que a animação toda. */
  activeFrom: 4,
  activeTo: 10,
  /** Alcance à frente e altura da caixa da lâmina. */
  reach: 1.5,
  height: 1.4,
  cooldownFrames: 8,
  hitstopFrames: 4,
} as const;

export interface CombatEvents {
  onSwing(): void;
  onHit(x: number, y: number): void;
  onKill(x: number, y: number): void;
}

export class Combat {
  private frame = 0;
  private swingStart = -999;
  private cooldown = 0;
  private hitstop = 0;
  private readonly struck = new Set<Enemy>();

  constructor(private readonly ev: CombatEvents) {}

  /** `true` enquanto o mundo deve ficar congelado. */
  get frozen(): boolean {
    return this.hitstop > 0;
  }

  get swinging(): boolean {
    return this.frame - this.swingStart < SWING.durationFrames;
  }

  /** 0..1 ao longo do golpe — a arte usa pra posicionar a lâmina. */
  get swingT(): number {
    if (!this.swinging) return 0;
    return (this.frame - this.swingStart) / SWING.durationFrames;
  }

  update(keys: Keyboard, playerX: number, playerY: number, facing: 1 | -1, enemies: Enemy[]): void {
    if (this.hitstop > 0) {
      this.hitstop--;
      // NÃO consumir a borda do teclado durante o congelamento: o quadro
      // parado comeria o `justDown` e o golpe seguinte nunca sairia. Foi
      // exatamente o bug que o jogo 2D encontrou ao ligar hitstop.
      return;
    }
    this.frame++;
    this.cooldown = Math.max(0, this.cooldown - 1);

    if (keys.justDown("KeyX") && !this.swinging && this.cooldown === 0) {
      this.swingStart = this.frame;
      this.struck.clear();
      this.ev.onSwing();
    }

    const t = this.frame - this.swingStart;
    if (t < SWING.activeFrom || t > SWING.activeTo) return;

    const blade: Aabb = {
      x: facing > 0 ? playerX : playerX - SWING.reach,
      y: playerY + 0.1,
      w: SWING.reach,
      h: SWING.height,
    };
    for (const e of enemies) {
      if (!e.alive || this.struck.has(e)) continue;
      const b = e.box;
      if (blade.x < b.x + b.w && blade.x + blade.w > b.x && blade.y < b.y + b.h && blade.y + blade.h > b.y) {
        this.struck.add(e);
        e.kill();
        this.hitstop = SWING.hitstopFrames;
        this.cooldown = SWING.cooldownFrames;
        this.ev.onHit(e.x, e.y + b.h * 0.6);
        this.ev.onKill(e.x, e.y);
      }
    }
  }
}
