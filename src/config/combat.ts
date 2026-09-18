export type CombatTypeId = "stomp" | "projectile" | "sword";

/**
 * Um frame do jogo a 60fps, em ms. Impacto se autora em FRAMES, não em
 * milissegundos: o olho conta frames, e "3 frames" é uma decisão de game
 * feel verificável numa captura — "50ms" é um número que ninguém confere.
 */
export const FRAME_MS = 1000 / 60;

/**
 * HITSTOP — a pausa no instante do impacto.
 *
 * É metade do peso de um golpe em Metal Slug / Neo Geo: sem ela a espada
 * atravessa o inimigo como se ele fosse ar, por mais partícula que se
 * jogue em cima. O olho lê a pausa como MASSA.
 *
 * Três regras que separam hitstop bom de travamento:
 *  1. A pausa não congela tudo — partícula e flash continuam correndo
 *     (ver `Particles.update`, que sempre anda em tempo real).
 *  2. Escala com o dano — o carregado pausa mais que o normal, senão a
 *     mecânica de carga não se comunica.
 *  3. Retoma em rampa curta, não em degrau: `rampFrames` a `rampScale`
 *     antes de voltar a 1.
 */
export interface HitstopConfig {
  /** Espada normal (3 de dano). */
  swordFrames: number;
  /** Espada carregada (5 de dano) — o salto tem que ser óbvio. */
  swordChargedFrames: number;
  /** Flecha cravando: perfuração tem menos massa que corte. */
  arrowFrames: number;
  /**
   * Golpe que MATA.
   *
   * Contido de propósito, e a razão é aritmética de balanceamento: a
   * espada faz 3 de dano e o walker tem 3 de HP (o shooter, 2) — ou
   * seja, TODO golpe de espada que conecta é um golpe fatal. Se a morte
   * pausasse mais que o carregado, a pausa do carregado nunca apareceria
   * e a mecânica de carga perderia justamente a metade do feedback que
   * ela tem pra se comunicar. A morte já se anuncia sozinha: o corpo
   * some e vira esporo.
   */
  killFrames: number;
  /** Jogador levando dano — vende o baque de quem apanhou. */
  playerHurtFrames: number;
  /** Frames de retomada em câmera lenta depois do congelamento duro. */
  rampFrames: number;
  /**
   * Escala de tempo no primeiro frame da retomada (sobe até 1 ao longo da
   * rampa). PISO REAL, não gosto: com `gravityDown` de 560 px/s² do
   * arquétipo floaty, a queda por frame é `g·dt²`; abaixo de ~0.26 isso
   * fica menor que o EPS de 0.01px de `engine/collision.ts`, o teste de
   * chão nunca dispara e `Player.isGrounded` vira false no meio do
   * impacto — o herói troca pra pose aérea justamente no frame do golpe.
   */
  rampScale: number;
  /** Teto absoluto de uma pausa. Nem morte carregada passa disso. */
  maxFrames: number;
}

export const HITSTOP: HitstopConfig = {
  swordFrames: 3,
  swordChargedFrames: 7,
  arrowFrames: 2,
  killFrames: 4,
  playerHurtFrames: 4,
  rampFrames: 2,
  rampScale: 0.4,
  maxFrames: 9,
};

/**
 * Deslocamento visual do alvo no impacto (knockback de leitura, não de
 * física — não empurra hitbox nem muda colisão).
 *
 * Resolve DEPOIS da pausa, nunca durante: durante o hitstop o alvo fica
 * cravado no lugar, e é justamente o contraste entre "parado demais" e o
 * lurch que vem em seguida que faz o golpe ter direção. Deslocar durante
 * a pausa mataria as duas coisas ao mesmo tempo.
 */
export interface ImpactShiftConfig {
  /** Espada normal (px). */
  swordPx: number;
  /** Espada carregada (px). */
  swordChargedPx: number;
  /** Flecha (px). */
  arrowPx: number;
  /** Frames até o deslocamento máximo, contados do fim da pausa. */
  outFrames: number;
  /** Frames pra voltar ao lugar. Mais longo que a ida: sai seco, volta macio. */
  settleFrames: number;
  /**
   * Raio (px) em que uma consulta casa com um impacto registrado. O alvo
   * não tem id nesse caminho — o que identifica é a posição do acerto.
   */
  matchRadiusPx: number;
}

export const IMPACT_SHIFT: ImpactShiftConfig = {
  swordPx: 3,
  swordChargedPx: 6,
  arrowPx: 1.5,
  outFrames: 3,
  settleFrames: 7,
  matchRadiusPx: 16,
};

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
