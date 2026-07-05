export type CombatTypeId = "stomp" | "projectile" | "sword";

export interface StompConfig {
  /** Velocidade vertical mínima de queda (px/s) pra contar como stomp. */
  minFallSpeed: number;
  /** Impulso vertical pra cima após stomp bem-sucedido (px/s). */
  bounceVelocity: number;
  damage: number;
}

export interface ProjectileConfig {
  speed: number;
  cooldownMs: number;
  lifetimeMs: number;
  damage: number;
  width: number;
  height: number;
  color: number;
  /** Tempo segurando o botão pra disparo sair carregado (ms). */
  chargeThresholdMs: number;
  chargedSpeed: number;
  chargedDamage: number;
  chargedWidth: number;
  chargedHeight: number;
  chargedColor: number;
  chargedCooldownMs: number;
}

export interface SwordConfig {
  /** Largura do hitbox à frente do jogador (px). */
  rangePx: number;
  heightPx: number;
  /** Quanto tempo o hitbox visual fica visível (ms). Dano é aplicado no instante do swing. */
  activeMs: number;
  cooldownMs: number;
  damage: number;
  color: number;
  /** Tempo segurando o botão pra golpe sair carregado (ms). */
  chargeThresholdMs: number;
  chargedRangePx: number;
  chargedHeightPx: number;
  chargedDamage: number;
  chargedColor: number;
  chargedCooldownMs: number;
}

export interface DummyConfig {
  width: number;
  height: number;
  maxHp: number;
  respawnMs: number;
}

export const STOMP: StompConfig = {
  minFallSpeed: 60,
  bounceVelocity: 220,
  damage: 1,
};

// "flecha" — nome do primitivo continua `projectile` (CombatTypeId), só o
// visual/flavor é de arco e flecha nesse jogo.
export const PROJECTILE: ProjectileConfig = {
  speed: 260,
  cooldownMs: 350,
  lifetimeMs: 900,
  damage: 1,
  width: 10,
  height: 3,
  color: 0xa0703c,
  chargeThresholdMs: 500,
  chargedSpeed: 420,
  chargedDamage: 3,
  chargedWidth: 16,
  chargedHeight: 5,
  chargedColor: 0xf8d800,
  chargedCooldownMs: 700,
};

export const SWORD: SwordConfig = {
  rangePx: 18,
  heightPx: 16,
  activeMs: 120,
  cooldownMs: 260,
  damage: 3,
  color: 0xf83800,
  chargeThresholdMs: 450,
  chargedRangePx: 30,
  chargedHeightPx: 22,
  chargedDamage: 5,
  chargedColor: 0xf8f8f8,
  chargedCooldownMs: 550,
};

export const DUMMY: DummyConfig = {
  width: 14,
  height: 14,
  maxHp: 3,
  respawnMs: 1500,
};
