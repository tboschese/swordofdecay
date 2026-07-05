import Phaser from "phaser";
import type { CombatTypeId } from "../config/combat";
import {
  ENEMY_BY_SPAWN_INDEX,
  SHOOTER,
  WALKER,
  type EnemyConfig,
  type EnemyKind,
  type ShooterConfig,
  type WalkerConfig,
} from "../config/enemies";
import { TILE_SIZE } from "../config/tileset";
import type { PlayerController } from "./PlayerController";

const DEAD_ALPHA = 0.2;
const HIT_FLASH_MS = 90;
const EDGE_PROBE_X = 9;
const EDGE_PROBE_Y = 10;
const SHOOTER_VERTICAL_TOLERANCE = 12;

export interface EnemyProjectile {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  readonly damage: number;
}

export function enemyKindForSpawnIndex(index: number): EnemyKind {
  return ENEMY_BY_SPAWN_INDEX[index] ?? "walker";
}

export class Enemy {
  readonly gameObject: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.Physics.Arcade.Body;
  private readonly label: Phaser.GameObjects.Text;
  private readonly projectiles: EnemyProjectile[] = [];
  private readonly config: EnemyConfig;

  private hp: number;
  private alive = true;
  private direction: 1 | -1 = -1;
  private fireCooldown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    readonly kind: EnemyKind,
    private readonly layer: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.config = kind === "walker" ? WALKER : SHOOTER;
    this.hp = this.config.maxHp;
    this.gameObject = scene.add.rectangle(x, y, this.config.width, this.config.height, this.config.color);
    scene.physics.add.existing(this.gameObject, false);

    this.body = this.gameObject.body as Phaser.Physics.Arcade.Body;
    this.body.setAllowGravity(false);
    this.body.setSize(this.config.width, this.config.height);
    this.body.setImmovable(true);

    this.label = scene.add
      .text(x, y - this.config.height / 2 - 4, this.labelText(), {
        fontFamily: "monospace",
        fontSize: "7px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 1);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get contactDamage(): number {
    return this.alive ? this.config.contactDamage : 0;
  }

  get activeProjectiles(): EnemyProjectile[] {
    return this.projectiles;
  }

  update(deltaMs: number, player: PlayerController): void {
    this.updateProjectiles(deltaMs);

    if (!this.alive) {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.kind === "walker") {
      this.updateWalker();
    } else {
      this.updateShooter(deltaMs, player);
    }

    this.label.setPosition(this.gameObject.x, this.gameObject.y - this.config.height / 2 - 4);
  }

  takeDamage(amount: number, _source: CombatTypeId): boolean {
    if (!this.alive) return false;

    this.hp -= amount;
    this.gameObject.setFillStyle(this.config.hitColor);
    this.scene.time.delayedCall(HIT_FLASH_MS, () => {
      if (this.alive) this.gameObject.setFillStyle(this.config.color);
    });

    if (this.hp <= 0) {
      this.die();
    }
    this.label.setText(this.labelText());
    return true;
  }

  destroyProjectile(projectile: EnemyProjectile): void {
    const index = this.projectiles.indexOf(projectile);
    if (index === -1) return;
    this.projectiles.splice(index, 1);
    projectile.gameObject.destroy();
  }

  private updateWalker(): void {
    const config = WALKER satisfies WalkerConfig;
    const nextDirection = this.shouldTurnAround() ? ((this.direction * -1) as 1 | -1) : this.direction;
    this.direction = nextDirection;
    this.body.setVelocityX(this.direction * config.speed);
  }

  private shouldTurnAround(): boolean {
    const bounds = this.gameObject.getBounds();
    const frontX = this.direction === 1 ? bounds.right + EDGE_PROBE_X : bounds.left - EDGE_PROBE_X;
    const floorY = bounds.bottom + EDGE_PROBE_Y;
    const bodyY = this.gameObject.y;

    const tileAhead = this.layer.getTileAtWorldXY(frontX, bodyY);
    if (tileAhead?.collides) return true;

    const floorAhead = this.layer.getTileAtWorldXY(frontX, floorY);
    return !floorAhead?.collides;
  }

  private updateShooter(deltaMs: number, player: PlayerController): void {
    const config = SHOOTER satisfies ShooterConfig;
    this.body.setVelocity(0, 0);
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaMs);

    const dx = player.gameObject.x - this.gameObject.x;
    const dy = Math.abs(player.gameObject.y - this.gameObject.y);
    if (Math.abs(dx) > config.rangePx || dy > SHOOTER_VERTICAL_TOLERANCE || this.fireCooldown > 0) return;

    this.direction = dx >= 0 ? 1 : -1;
    this.fireProjectile(config);
    this.fireCooldown = config.cooldownMs;
  }

  private fireProjectile(config: ShooterConfig): void {
    const projectile = this.scene.add.rectangle(
      this.gameObject.x + this.direction * TILE_SIZE * 0.6,
      this.gameObject.y,
      config.projectileWidth,
      config.projectileHeight,
      config.projectileColor,
    );
    this.scene.physics.add.existing(projectile, false);
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(this.direction * config.projectileSpeed);

    const entry = { gameObject: projectile, damage: 1 };
    this.projectiles.push(entry);
    this.scene.time.delayedCall(config.projectileLifetimeMs, () => this.destroyProjectile(entry));
  }

  private updateProjectiles(_deltaMs: number): void {
    for (const projectile of [...this.projectiles]) {
      const tile = this.layer.getTileAtWorldXY(projectile.gameObject.x, projectile.gameObject.y);
      if (tile?.collides) {
        this.destroyProjectile(projectile);
      }
    }
  }

  private die(): void {
    this.alive = false;
    this.body.setVelocity(0, 0);
    this.gameObject.setAlpha(DEAD_ALPHA);
    this.gameObject.setFillStyle(this.config.color);
    this.label.setText(this.labelText());
    for (const projectile of [...this.projectiles]) {
      this.destroyProjectile(projectile);
    }
    this.scene.time.delayedCall(this.config.respawnMs, () => this.respawn());
  }

  private respawn(): void {
    this.hp = this.config.maxHp;
    this.alive = true;
    this.gameObject.setAlpha(1);
    this.gameObject.setFillStyle(this.config.color);
    this.label.setText(this.labelText());
  }

  private labelText(): string {
    return this.alive ? `${this.config.label} ${this.hp}/${this.config.maxHp}` : `${this.config.label} ...`;
  }
}
