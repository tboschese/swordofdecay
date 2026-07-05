import Phaser from "phaser";
import { DUMMY, type CombatTypeId } from "../config/combat";

const NORMAL_COLOR = 0xf8b800;
const SPIKY_COLOR = 0x7c1c1c;
const HIT_FLASH_COLOR = 0xffffff;
const HIT_FLASH_MS = 80;
const DEAD_ALPHA = 0.15;

/**
 * Alvo de teste pro playground de combate. Não é um inimigo do jogo real
 * (isso vem só na sessão de chunks/validador) — só existe pra dar feedback
 * visual imediato de dano por tipo de ataque. `spiky` reproduz a regra de
 * DESIGN.md §1.2: imune a stomp, vulnerável ao resto.
 */
export class Dummy {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  readonly spiky: boolean;
  private hp: number;
  private alive = true;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    spiky: boolean,
  ) {
    this.spiky = spiky;
    this.hp = DUMMY.maxHp;
    this.gameObject = scene.add.rectangle(x, y, DUMMY.width, DUMMY.height, this.baseColor());
    this.label = scene.add
      .text(x, y - DUMMY.height / 2 - 8, this.labelText(), {
        fontFamily: "monospace",
        fontSize: "7px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  private baseColor(): number {
    return this.spiky ? SPIKY_COLOR : NORMAL_COLOR;
  }

  private labelText(): string {
    const name = this.spiky ? "SPIKY" : "DUMMY";
    return this.alive ? `${name} ${this.hp}/${DUMMY.maxHp}` : `${name} ...`;
  }

  /** Retorna true se o dano foi de fato aplicado (stomp não afeta spiky). */
  takeDamage(amount: number, source: CombatTypeId): boolean {
    if (!this.alive) return false;
    if (source === "stomp" && this.spiky) return false;

    this.hp -= amount;
    this.gameObject.setFillStyle(HIT_FLASH_COLOR);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.alive) this.gameObject.setFillStyle(this.baseColor());
    });

    if (this.hp <= 0) {
      this.die();
    }
    this.label.setText(this.labelText());
    return true;
  }

  private die(): void {
    this.alive = false;
    this.gameObject.setAlpha(DEAD_ALPHA);
    this.label.setText(this.labelText());
    this.scene.time.delayedCall(DUMMY.respawnMs, () => this.respawn());
  }

  private respawn(): void {
    this.hp = DUMMY.maxHp;
    this.alive = true;
    this.gameObject.setAlpha(1);
    this.gameObject.setFillStyle(this.baseColor());
    this.label.setText(this.labelText());
  }
}
