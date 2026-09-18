import {
  ENEMY_BY_SPAWN_INDEX,
  SHOOTER,
  WALKER,
  type EnemyConfig,
  type EnemyKind,
  type ShooterConfig,
  type WalkerConfig,
} from "../config/enemies";
import type { CombatTypeId } from "../config/combat";

/** Recuo antes de investir. */
const LUNGE_WINDUP_MS = 620;
/** Ciclo completo: recuo + avanco. */
const LUNGE_CYCLE_MS = 1180;
/** Quanto o avanco acelera contra a velocidade base. */
const LUNGE_SPEED_MUL = 2.1;

const EDGE_PROBE_X = 9;
const EDGE_PROBE_Y = 10;
const SHOOTER_VERTICAL_TOLERANCE = 12;
const HIT_FLASH_MS = 90;

export interface EnemyProjectile {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  damage: number;
  lifeMs: number;
}

export function enemyKindForSpawnIndex(index: number): EnemyKind {
  return ENEMY_BY_SPAWN_INDEX[index] ?? "walker";
}

/**
 * Porte 1:1 de src/entities/Enemy.ts (versão Phaser) — mesma config
 * (`config/enemies.ts`), mesma lógica de patrulha/mira/dano. Troca
 * `layer.getTileAtWorldXY` por lookup direto no grid de terreno e
 * `scene.time.delayedCall` por contadores decrementados em `update`.
 */
export class Enemy {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  readonly config: EnemyConfig;

  private hp: number;
  private alive = true;
  private direction: 1 | -1 = -1;
  /** Ciclo de investida do walker, em ms. Ver lungeCharge. */
  private lungeMs = 0;
  private fireCooldown = 0;
  private hitFlashTimer = 0;
  private respawnTimer = 0;
  private justDiedFlag = false;
  private readonly spawnX: number;
  private readonly spawnY: number;
  private readonly projectiles: EnemyProjectile[] = [];

  constructor(
    x: number,
    y: number,
    readonly kind: EnemyKind,
  ) {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.config = kind === "walker" ? WALKER : SHOOTER;
    this.hp = this.config.maxHp;
    this.width = this.config.width;
    this.height = this.config.height;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /**
   * 0..1 — quao perto o shooter esta de disparar. Existe para o renderer
   * TELEGRAFAR o tiro: inimigo a distancia que atira sem aviso nao da ao
   * jogador nada pra reagir, e o dano lido como injusto e falha de design,
   * nao dificuldade.
   */
  get fireCharge(): number {
    const cfg = this.config as { cooldownMs?: number };
    if (!cfg.cooldownMs) return 0;
    const remaining = this.fireCooldown / cfg.cooldownMs;
    // So acende no ultimo terco da recarga — antes disso nao ha ameaca
    // iminente e um brilho constante viraria ruido.
    return remaining > 0.34 ? 0 : 1 - remaining / 0.34;
  }

  get isHitFlashing(): boolean {
    return this.hitFlashTimer > 0;
  }

  get hpLabel(): string {
    return this.alive ? `${this.config.label} ${this.hp}/${this.config.maxHp}` : `${this.config.label} ...`;
  }

  get contactDamage(): number {
    return this.alive ? this.config.contactDamage : 0;
  }

  get activeProjectiles(): readonly EnemyProjectile[] {
    return this.projectiles;
  }

  /** true uma única vez, no primeiro update após a morte — usado pra disparar partículas/efeitos. */
  consumeJustDied(): boolean {
    const value = this.justDiedFlag;
    this.justDiedFlag = false;
    return value;
  }

  update(
    deltaMs: number,
    playerX: number,
    playerY: number,
    terrain: number[][],
    tileSize: number,
    solidGids: ReadonlySet<number>,
  ): void {
    this.updateProjectiles(deltaMs, terrain, tileSize, solidGids);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaMs);

    if (!this.alive) {
      this.respawnTimer = Math.max(0, this.respawnTimer - deltaMs);
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    if (this.kind === "walker") {
      this.updateWalker(deltaMs, terrain, tileSize, solidGids);
    } else {
      this.updateShooter(deltaMs, playerX, playerY);
    }
  }

  takeDamage(amount: number, _source: CombatTypeId): boolean {
    if (!this.alive) return false;

    this.hp -= amount;
    this.hitFlashTimer = HIT_FLASH_MS;

    if (this.hp <= 0) this.die();
    return true;
  }

  private isSolidAt(worldX: number, worldY: number, terrain: number[][], tileSize: number, solidGids: ReadonlySet<number>): boolean {
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    const gid = terrain[row]?.[col] ?? 0;
    return solidGids.has(gid);
  }

  /**
   * 0..1 — quao perto o walker esta de investir, e depois quanto da
   * investida ja passou (ver lungeActive).
   *
   * Existe porque inimigo de contato que avanca sem aviso nao da ao
   * jogador nada pra reagir, e dano lido como injusto e falha de design,
   * nao dificuldade. O shooter ja telegrafava o tiro; o walker nao
   * telegrafava nada. O dono do modulo de arte descreveu o comportamento
   * exato em vez de inventar, porque a arte nao podia criar estado de
   * gameplay — este getter e a metade que faltava.
   */
  get lungeCharge(): number {
    if (this.lungeMs >= LUNGE_WINDUP_MS) return 1;
    return this.lungeMs / LUNGE_WINDUP_MS;
  }

  /** true durante o avanco propriamente dito, depois do recuo. */
  get lungeActive(): boolean {
    return this.lungeMs >= LUNGE_WINDUP_MS;
  }

  private updateWalker(deltaMs: number, terrain: number[][], tileSize: number, solidGids: ReadonlySet<number>): void {
    const config = WALKER satisfies WalkerConfig;
    if (this.shouldTurnAround(terrain, tileSize, solidGids)) {
      this.direction = (this.direction * -1) as 1 | -1;
    }

    this.lungeMs = (this.lungeMs + deltaMs) % LUNGE_CYCLE_MS;
    // No recuo o walker QUASE para: e a pausa que faz o avanco seguinte
    // ler como investida em vez de andar mais rapido.
    const windup = this.lungeMs < LUNGE_WINDUP_MS;
    const speedMul = windup ? 0.15 : LUNGE_SPEED_MUL;
    this.x += this.direction * config.speed * speedMul * (deltaMs / 1000);
  }

  private shouldTurnAround(terrain: number[][], tileSize: number, solidGids: ReadonlySet<number>): boolean {
    const frontX = this.direction === 1 ? this.x + this.width / 2 + EDGE_PROBE_X : this.x - this.width / 2 - EDGE_PROBE_X;
    const floorY = this.y + this.height / 2 + EDGE_PROBE_Y;

    if (this.isSolidAt(frontX, this.y, terrain, tileSize, solidGids)) return true;
    return !this.isSolidAt(frontX, floorY, terrain, tileSize, solidGids);
  }

  private updateShooter(deltaMs: number, playerX: number, playerY: number): void {
    const config = SHOOTER satisfies ShooterConfig;
    this.fireCooldown = Math.max(0, this.fireCooldown - deltaMs);

    const dx = playerX - this.x;
    const dy = Math.abs(playerY - this.y);
    if (Math.abs(dx) > config.rangePx || dy > SHOOTER_VERTICAL_TOLERANCE || this.fireCooldown > 0) return;

    this.direction = dx >= 0 ? 1 : -1;
    this.fireProjectile(config);
    this.fireCooldown = config.cooldownMs;
  }

  private fireProjectile(config: ShooterConfig): void {
    this.projectiles.push({
      x: this.x + this.direction * 16 * 0.6,
      y: this.y,
      width: config.projectileWidth,
      height: config.projectileHeight,
      vx: this.direction * config.projectileSpeed,
      damage: 1,
      lifeMs: config.projectileLifetimeMs,
    });
  }

  private updateProjectiles(deltaMs: number, terrain: number[][], tileSize: number, solidGids: ReadonlySet<number>): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.x += p.vx * (deltaMs / 1000);
      p.lifeMs -= deltaMs;

      const expired = p.lifeMs <= 0;
      const hitWall = this.isSolidAt(p.x, p.y, terrain, tileSize, solidGids);
      if (expired || hitWall) this.projectiles.splice(i, 1);
    }
  }

  removeProjectile(projectile: EnemyProjectile): void {
    const index = this.projectiles.indexOf(projectile);
    if (index === -1) return;
    this.projectiles.splice(index, 1);
  }

  private die(): void {
    this.alive = false;
    this.justDiedFlag = true;
    this.projectiles.length = 0;
    this.respawnTimer = this.config.respawnMs;
  }

  private respawn(): void {
    this.hp = this.config.maxHp;
    this.alive = true;
    this.x = this.spawnX;
    this.y = this.spawnY;
  }
}
