export interface MovementArchetype {
  id: "precise" | "momentum" | "heavy" | "floaty" | "slippery";
  label: string;
  description: string;

  /** Aceleração horizontal no chão (px/s²). No ar, é multiplicada por airControl. */
  accel: number;
  /** Desaceleração horizontal quando não há input, no chão (px/s²). */
  frictionGround: number;
  /** Desaceleração horizontal quando não há input, no ar (px/s²). */
  frictionAir: number;
  /** Velocidade horizontal máxima (px/s). */
  maxSpeed: number;
  /** 0-1: fração da aceleração disponível no ar. 0 = sem controle aéreo. */
  airControl: number;

  /** Velocidade vertical inicial do pulo (px/s, positivo = para cima). */
  jumpForce: number;
  /**
   * Bônus opcional de jumpForce escalado por |vx|/maxSpeed no instante do
   * pulo (px/s extra na velocidade máxima). Usado por arquétipos cujo pulo
   * varia com a velocidade horizontal (ex. momentum). Default 0.
   */
  speedJumpBonus: number;

  /** Gravidade aplicada enquanto sobe (px/s²). */
  gravityUp: number;
  /** Gravidade aplicada enquanto cai (px/s²). Deve ser > gravityUp. */
  gravityDown: number;
  /**
   * Multiplicador aplicado uma vez à velocidade vertical ao soltar o botão
   * de pulo enquanto ainda sobe (jump cutoff / variable jump height).
   * Ex.: 0.5 corta a subida pela metade.
   */
  jumpCutoffMultiplier: number;

  /** Janela pós-borda em que ainda é possível pular (ms). */
  coyoteTimeMs: number;
  /** Janela de tolerância para pulo pressionado antes de aterrissar (ms). */
  jumpBufferMs: number;
}

export const ARCHETYPES: Record<MovementArchetype["id"], MovementArchetype> = {
  precise: {
    id: "precise",
    label: "PRECISE",
    description: "para instantâneo · pulo seco · controle aéreo total",
    accel: 2200,
    frictionGround: 2200,
    frictionAir: 1400,
    maxSpeed: 130,
    airControl: 1.0,
    jumpForce: 300,
    speedJumpBonus: 0,
    gravityUp: 900,
    gravityDown: 1500,
    jumpCutoffMultiplier: 0.45,
    coyoteTimeMs: 80,
    jumpBufferMs: 100,
  },
  momentum: {
    id: "momentum",
    label: "MOMENTUM",
    description: "acelera e derrapa · pulo varia com velocidade",
    accel: 620,
    frictionGround: 380,
    frictionAir: 150,
    maxSpeed: 165,
    airControl: 0.55,
    jumpForce: 290,
    speedJumpBonus: 70,
    gravityUp: 850,
    gravityDown: 1250,
    jumpCutoffMultiplier: 0.55,
    coyoteTimeMs: 100,
    jumpBufferMs: 120,
  },
  heavy: {
    id: "heavy",
    label: "HEAVY",
    description: "pulo comprometido · zero controle aéreo pós-salto",
    accel: 480,
    frictionGround: 850,
    frictionAir: 0,
    maxSpeed: 105,
    airControl: 0.0,
    jumpForce: 350,
    speedJumpBonus: 0,
    gravityUp: 1000,
    gravityDown: 1750,
    jumpCutoffMultiplier: 0.7,
    coyoteTimeMs: 60,
    jumpBufferMs: 150,
  },
  floaty: {
    id: "floaty",
    label: "FLOATY",
    description: "queda lenta · hangtime generoso",
    accel: 420,
    frictionGround: 420,
    frictionAir: 380,
    maxSpeed: 115,
    airControl: 0.85,
    jumpForce: 250,
    speedJumpBonus: 0,
    gravityUp: 480,
    gravityDown: 560,
    jumpCutoffMultiplier: 0.6,
    coyoteTimeMs: 120,
    jumpBufferMs: 150,
  },
  slippery: {
    id: "slippery",
    label: "SLIPPERY",
    description: "fricção baixíssima como identidade central",
    accel: 320,
    frictionGround: 70,
    frictionAir: 120,
    maxSpeed: 155,
    airControl: 0.5,
    jumpForce: 300,
    speedJumpBonus: 0,
    gravityUp: 900,
    gravityDown: 1350,
    jumpCutoffMultiplier: 0.5,
    coyoteTimeMs: 100,
    jumpBufferMs: 120,
  },
};

export const ARCHETYPE_ORDER: MovementArchetype["id"][] = [
  "precise",
  "momentum",
  "heavy",
  "floaty",
  "slippery",
];
