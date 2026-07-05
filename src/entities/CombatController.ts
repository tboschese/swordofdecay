import Phaser from "phaser";
import { PROJECTILE, STOMP, SWORD, type CombatTypeId } from "../config/combat";
import type { PlayerController } from "./PlayerController";

const TOGGLE_KEYS: { code: number; id: CombatTypeId }[] = [
  { code: Phaser.Input.Keyboard.KeyCodes.SIX, id: "stomp" },
  { code: Phaser.Input.Keyboard.KeyCodes.SEVEN, id: "projectile" },
  { code: Phaser.Input.Keyboard.KeyCodes.EIGHT, id: "sword" },
];

const CHARGE_GAUGE_WIDTH = 16;
const CHARGE_GAUGE_HEIGHT = 3;
const CHARGE_GAUGE_COLOR = 0xf8f8f8;
const CHARGE_GAUGE_OFFSET_Y = 14;

export interface CombatTarget {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  readonly isAlive: boolean;
  takeDamage(amount: number, source: CombatTypeId): boolean;
}

/**
 * Controlador de combate, orientado pelos parâmetros de config/combat.ts.
 * No playground de teste, cada tipo pode ser ligado/desligado
 * independentemente (teclas 6-8). No jogo com classe fixa (guerreiro/
 * maga), `toggleable=false` trava o tipo definido em `initialEnabled` —
 * a classe escolhida na tela inicial não pode ser alternada em combate.
 *
 * Espada e projétil usam segura-e-solta: soltar antes do limiar de carga
 * dispara a versão normal, soltar depois dispara a versão carregada (mais
 * dano/alcance/velocidade, cooldown maior).
 */
export class CombatController {
  private readonly enabled = new Set<CombatTypeId>();
  private swordCooldown = 0;
  private projectileCooldown = 0;
  private swordChargeStart: number | null = null;
  private projectileChargeStart: number | null = null;
  /** Espelha mechanics.chargedAttacks do SPEC.md — decisão por jogo, não fixa do engine. */
  private chargedAttacksEnabled = true;

  private readonly swordKey: Phaser.Input.Keyboard.Key;
  private readonly shootKey: Phaser.Input.Keyboard.Key;
  private readonly chargedAttacksKey: Phaser.Input.Keyboard.Key;
  private readonly toggleKeys: { key: Phaser.Input.Keyboard.Key; id: CombatTypeId }[];
  private readonly projectiles: Phaser.GameObjects.Rectangle[] = [];
  private readonly chargeGauge: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: PlayerController,
    private readonly targets: CombatTarget[],
    initialEnabled: CombatTypeId[] = [],
    private readonly toggleable: boolean = true,
  ) {
    for (const id of initialEnabled) this.enabled.add(id);

    const keyboard = scene.input.keyboard!;
    this.swordKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.shootKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.chargedAttacksKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NINE);
    this.toggleKeys = TOGGLE_KEYS.map(({ code, id }) => ({ key: keyboard.addKey(code), id }));

    this.chargeGauge = scene.add
      .rectangle(0, 0, CHARGE_GAUGE_WIDTH, CHARGE_GAUGE_HEIGHT, CHARGE_GAUGE_COLOR)
      .setVisible(false)
      .setOrigin(0, 0.5);
  }

  isEnabled(id: CombatTypeId): boolean {
    return this.enabled.has(id);
  }

  get activeTypes(): CombatTypeId[] {
    return TOGGLE_KEYS.map((t) => t.id).filter((id) => this.enabled.has(id));
  }

  get chargedAttacks(): boolean {
    return this.chargedAttacksEnabled;
  }

  update(_deltaMs: number): void {
    if (this.toggleable) {
      for (const { key, id } of this.toggleKeys) {
        if (Phaser.Input.Keyboard.JustDown(key)) {
          if (this.enabled.has(id)) this.enabled.delete(id);
          else this.enabled.add(id);
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.chargedAttacksKey)) {
      this.chargedAttacksEnabled = !this.chargedAttacksEnabled;
    }

    const now = this.scene.time.now;
    this.swordCooldown = Math.max(0, this.swordCooldown - _deltaMs);
    this.projectileCooldown = Math.max(0, this.projectileCooldown - _deltaMs);

    this.updateSword(now);
    this.updateProjectile(now);
    this.updateChargeGauge();

    if (this.enabled.has("stomp")) {
      this.checkStomp();
    }

    this.pruneProjectiles();
  }

  private updateSword(now: number): void {
    const canStart = Phaser.Input.Keyboard.JustDown(this.swordKey) && this.enabled.has("sword") && this.swordCooldown <= 0;

    if (!this.chargedAttacksEnabled) {
      if (canStart) {
        this.swingSword(false);
        this.swordCooldown = SWORD.cooldownMs;
      }
      return;
    }

    if (canStart) {
      this.swordChargeStart = now;
    }

    if (this.swordChargeStart === null) return;

    if (Phaser.Input.Keyboard.JustUp(this.swordKey)) {
      const held = now - this.swordChargeStart;
      const charged = held >= SWORD.chargeThresholdMs;
      this.swingSword(charged);
      this.swordCooldown = charged ? SWORD.chargedCooldownMs : SWORD.cooldownMs;
      this.swordChargeStart = null;
    }
  }

  private updateProjectile(now: number): void {
    const canStart =
      Phaser.Input.Keyboard.JustDown(this.shootKey) && this.enabled.has("projectile") && this.projectileCooldown <= 0;

    if (!this.chargedAttacksEnabled) {
      if (canStart) {
        this.shootProjectile(false);
        this.projectileCooldown = PROJECTILE.cooldownMs;
      }
      return;
    }

    if (canStart) {
      this.projectileChargeStart = now;
    }

    if (this.projectileChargeStart === null) return;

    if (Phaser.Input.Keyboard.JustUp(this.shootKey)) {
      const held = now - this.projectileChargeStart;
      const charged = held >= PROJECTILE.chargeThresholdMs;
      this.shootProjectile(charged);
      this.projectileCooldown = charged ? PROJECTILE.chargedCooldownMs : PROJECTILE.cooldownMs;
      this.projectileChargeStart = null;
    }
  }

  private updateChargeGauge(): void {
    const now = this.scene.time.now;
    const chargeStart = this.swordChargeStart ?? this.projectileChargeStart;
    const threshold = this.swordChargeStart !== null ? SWORD.chargeThresholdMs : PROJECTILE.chargeThresholdMs;

    if (chargeStart === null) {
      this.chargeGauge.setVisible(false);
      return;
    }

    const progress = Phaser.Math.Clamp((now - chargeStart) / threshold, 0, 1);
    const origin = this.player.gameObject;
    this.chargeGauge
      .setVisible(true)
      .setPosition(origin.x - CHARGE_GAUGE_WIDTH / 2, origin.y - CHARGE_GAUGE_OFFSET_Y)
      .setSize(CHARGE_GAUGE_WIDTH * progress, CHARGE_GAUGE_HEIGHT)
      .setFillStyle(progress >= 1 ? SWORD.chargedColor : CHARGE_GAUGE_COLOR);
  }

  private swingSword(charged: boolean): void {
    const facing = this.player.facing;
    const origin = this.player.gameObject;
    const rangePx = charged ? SWORD.chargedRangePx : SWORD.rangePx;
    const heightPx = charged ? SWORD.chargedHeightPx : SWORD.heightPx;
    const damage = charged ? SWORD.chargedDamage : SWORD.damage;
    const color = charged ? SWORD.chargedColor : SWORD.color;

    const hitboxX = origin.x + facing * (rangePx / 2);
    const bounds = new Phaser.Geom.Rectangle(hitboxX - rangePx / 2, origin.y - heightPx / 2, rangePx, heightPx);

    for (const target of this.targets) {
      if (target.isAlive && Phaser.Geom.Intersects.RectangleToRectangle(bounds, target.gameObject.getBounds())) {
        target.takeDamage(damage, "sword");
      }
    }

    const visual = this.scene.add.rectangle(hitboxX, origin.y, rangePx, heightPx, color, 0.7);
    this.scene.time.delayedCall(SWORD.activeMs, () => visual.destroy());
  }

  private shootProjectile(charged: boolean): void {
    const facing = this.player.facing;
    const origin = this.player.gameObject;
    const width = charged ? PROJECTILE.chargedWidth : PROJECTILE.width;
    const height = charged ? PROJECTILE.chargedHeight : PROJECTILE.height;
    const speed = charged ? PROJECTILE.chargedSpeed : PROJECTILE.speed;
    const color = charged ? PROJECTILE.chargedColor : PROJECTILE.color;
    const damage = charged ? PROJECTILE.chargedDamage : PROJECTILE.damage;

    const projectile = this.scene.add.rectangle(origin.x + facing * 10, origin.y, width, height, color);
    projectile.setData("damage", damage);
    this.scene.physics.add.existing(projectile, false);
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(facing * speed);

    this.projectiles.push(projectile);
    this.scene.time.delayedCall(PROJECTILE.lifetimeMs, () => this.destroyProjectile(projectile));
  }

  private pruneProjectiles(): void {
    for (const projectile of [...this.projectiles]) {
      for (const target of this.targets) {
        if (
          target.isAlive &&
          Phaser.Geom.Intersects.RectangleToRectangle(projectile.getBounds(), target.gameObject.getBounds())
        ) {
          target.takeDamage(projectile.getData("damage") as number, "projectile");
          this.destroyProjectile(projectile);
          break;
        }
      }
    }
  }

  private destroyProjectile(projectile: Phaser.GameObjects.Rectangle): void {
    const index = this.projectiles.indexOf(projectile);
    if (index === -1) return;
    this.projectiles.splice(index, 1);
    projectile.destroy();
  }

  private checkStomp(): void {
    if (this.player.velocity.y < STOMP.minFallSpeed) return;

    const playerBounds = this.player.gameObject.getBounds();
    for (const target of this.targets) {
      if (!target.isAlive) continue;
      const targetBounds = target.gameObject.getBounds();
      const isAbove = playerBounds.bottom <= targetBounds.top + 6;
      if (isAbove && Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, targetBounds)) {
        if (target.takeDamage(STOMP.damage, "stomp")) {
          this.player.bounce(STOMP.bounceVelocity);
        }
      }
    }
  }
}
