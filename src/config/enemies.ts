export type EnemyKind = "walker" | "shooter";

export interface EnemyConfig {
  label: string;
  width: number;
  height: number;
  maxHp: number;
  contactDamage: number;
  color: number;
  hitColor: number;
  respawnMs: number;
}

export interface WalkerConfig extends EnemyConfig {
  speed: number;
}

export interface ShooterConfig extends EnemyConfig {
  rangePx: number;
  cooldownMs: number;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  projectileWidth: number;
  projectileHeight: number;
  projectileColor: number;
}

export const ENEMY_BY_SPAWN_INDEX: Record<number, EnemyKind> = {
  1: "walker",
  2: "shooter",
  3: "walker",
  4: "shooter",
  5: "walker",
};

export const WALKER: WalkerConfig = {
  label: "WALKER",
  width: 14,
  height: 14,
  maxHp: 3,
  contactDamage: 1,
  color: 0xd82800,
  hitColor: 0xffffff,
  respawnMs: 2000,
  speed: 34,
};

export const SHOOTER: ShooterConfig = {
  label: "SHOOTER",
  width: 14,
  height: 14,
  maxHp: 2,
  contactDamage: 1,
  color: 0x5030a0,
  hitColor: 0xffffff,
  respawnMs: 2400,
  rangePx: 120,
  cooldownMs: 1400,
  projectileSpeed: 82,
  projectileLifetimeMs: 2200,
  projectileWidth: 6,
  projectileHeight: 4,
  projectileColor: 0xa82890,
};
