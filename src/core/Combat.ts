import { PROJECTILE, SWORD, type CombatTypeId } from "../config/combat";
import type { Keyboard } from "../engine/input";
import type { Player } from "./Player";

export interface CombatTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  readonly isAlive: boolean;
  takeDamage(amount: number, source: CombatTypeId): boolean;
}

export interface Arrow {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  damage: number;
  color: number;
  lifeMs: number;
}

export interface HitEvent {
  x: number;
  y: number;
  charged: boolean;
}

/** Disparado no instante em que o jogador solta o ataque (não no impacto) — usado pra tocar a animação certa. */
export interface ActionEvent {
  type: "sword" | "arrow";
  charged: boolean;
}

/**
 * Porte 1:1 de src/entities/CombatController.ts (versão Phaser) — o
 * guerreiro de Sword of Decay usa espada+flecha sempre ativos, sem toggle
 * (`toggleable=false` no original), então essa versão já nasce fixa nos
 * dois tipos, sem as teclas 6-8/9 de dev do playground.
 */
export class Combat {
  private swordCooldown = 0;
  private projectileCooldown = 0;
  private swordChargeStart: number | null = null;
  private projectileChargeStart: number | null = null;
  private nowMs = 0;

  private readonly arrows: Arrow[] = [];
  private readonly hitEvents: HitEvent[] = [];
  private readonly actionEvents: ActionEvent[] = [];

  constructor(
    private readonly player: Player,
    private readonly targets: CombatTarget[],
  ) {}

  get activeArrows(): readonly Arrow[] {
    return this.arrows;
  }

  /** Acertos ocorridos desde a última chamada — consumido pelo jogo pra disparar partículas/screen shake. */
  consumeHitEvents(): HitEvent[] {
    const events = [...this.hitEvents];
    this.hitEvents.length = 0;
    return events;
  }

  /** Ataques iniciados desde a última chamada — consumido pra escolher a animação do KnightRenderer. */
  consumeActionEvents(): ActionEvent[] {
    const events = [...this.actionEvents];
    this.actionEvents.length = 0;
    return events;
  }

  /** 0-1 (carga em progresso) ou null (nenhum ataque segurado). */
  get chargeProgress(): { progress: number; charged: boolean } | null {
    const chargeStart = this.swordChargeStart ?? this.projectileChargeStart;
    if (chargeStart === null) return null;
    const threshold = this.swordChargeStart !== null ? SWORD.chargeThresholdMs : PROJECTILE.chargeThresholdMs;
    const progress = clamp((this.nowMs - chargeStart) / threshold, 0, 1);
    return { progress, charged: progress >= 1 };
  }

  update(deltaMs: number, keyboard: Keyboard): void {
    this.nowMs += deltaMs;
    this.swordCooldown = Math.max(0, this.swordCooldown - deltaMs);
    this.projectileCooldown = Math.max(0, this.projectileCooldown - deltaMs);

    this.updateSword(keyboard);
    this.updateProjectile(keyboard);
    this.updateArrows(deltaMs);
  }

  private updateSword(keyboard: Keyboard): void {
    const canStart = keyboard.justDown("KeyX") && this.swordCooldown <= 0;
    if (canStart) this.swordChargeStart = this.nowMs;
    if (this.swordChargeStart === null) return;

    if (keyboard.justUp("KeyX")) {
      const held = this.nowMs - this.swordChargeStart;
      const charged = held >= SWORD.chargeThresholdMs;
      this.swingSword(charged);
      this.swordCooldown = charged ? SWORD.chargedCooldownMs : SWORD.cooldownMs;
      this.swordChargeStart = null;
    }
  }

  private updateProjectile(keyboard: Keyboard): void {
    const canStart = keyboard.justDown("KeyC") && this.projectileCooldown <= 0;
    if (canStart) this.projectileChargeStart = this.nowMs;
    if (this.projectileChargeStart === null) return;

    if (keyboard.justUp("KeyC")) {
      const held = this.nowMs - this.projectileChargeStart;
      const charged = held >= PROJECTILE.chargeThresholdMs;
      this.shootProjectile(charged);
      this.projectileCooldown = charged ? PROJECTILE.chargedCooldownMs : PROJECTILE.cooldownMs;
      this.projectileChargeStart = null;
    }
  }

  private swingSword(charged: boolean): void {
    const facing = this.player.facing;
    const rangePx = charged ? SWORD.chargedRangePx : SWORD.rangePx;
    const heightPx = charged ? SWORD.chargedHeightPx : SWORD.heightPx;
    const damage = charged ? SWORD.chargedDamage : SWORD.damage;

    const hitboxX = this.player.x + facing * (rangePx / 2);
    const bounds = { x: hitboxX - rangePx / 2, y: this.player.y - heightPx / 2, width: rangePx, height: heightPx };

    for (const target of this.targets) {
      if (target.isAlive && rectsOverlap(bounds, targetBounds(target))) {
        if (target.takeDamage(damage, "sword")) {
          this.hitEvents.push({ x: target.x, y: target.y, charged });
        }
      }
    }

    this.actionEvents.push({ type: "sword", charged });
  }

  private shootProjectile(charged: boolean): void {
    const facing = this.player.facing;
    const width = charged ? PROJECTILE.chargedWidth : PROJECTILE.width;
    const height = charged ? PROJECTILE.chargedHeight : PROJECTILE.height;
    const speed = charged ? PROJECTILE.chargedSpeed : PROJECTILE.speed;
    const color = charged ? PROJECTILE.chargedColor : PROJECTILE.color;
    const damage = charged ? PROJECTILE.chargedDamage : PROJECTILE.damage;

    this.arrows.push({
      x: this.player.x + facing * 10,
      y: this.player.y,
      width,
      height,
      vx: facing * speed,
      damage,
      color,
      lifeMs: PROJECTILE.lifetimeMs,
    });

    this.actionEvents.push({ type: "arrow", charged });
  }

  private updateArrows(deltaMs: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]!;
      arrow.x += arrow.vx * (deltaMs / 1000);
      arrow.lifeMs -= deltaMs;

      let consumed = arrow.lifeMs <= 0;
      if (!consumed) {
        for (const target of this.targets) {
          if (target.isAlive && rectsOverlap(arrowBounds(arrow), targetBounds(target))) {
            if (target.takeDamage(arrow.damage, "projectile")) {
              this.hitEvents.push({ x: target.x, y: target.y, charged: false });
            }
            consumed = true;
            break;
          }
        }
      }

      if (consumed) this.arrows.splice(i, 1);
    }
  }

}

function targetBounds(target: CombatTarget): { x: number; y: number; width: number; height: number } {
  return { x: target.x - target.width / 2, y: target.y - target.height / 2, width: target.width, height: target.height };
}

function arrowBounds(arrow: Arrow): { x: number; y: number; width: number; height: number } {
  return { x: arrow.x - arrow.width / 2, y: arrow.y - arrow.height / 2, width: arrow.width, height: arrow.height };
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
