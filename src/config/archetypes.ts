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
  /**
   * Arquétipo do guerreiro (o jogo inteiro roda neste — ver CLAUDE.md).
   *
   * RETUNADO em 2026-08-14 depois do primeiro playtest de verdade, em que
   * o retorno foi "movimentação estranha". Os números antigos e o que eles
   * produziam, medidos:
   *
   *   gravityDown/gravityUp .. 1.17   <- a causa principal
   *   ar total por pulo ...... 1.00s
   *   altura do pulo ......... 65px (4.1 tiles)
   *   travessia da tela ...... 3.3s
   *   tempo até vel. máxima .. 0.27s
   *
   * A razão de 1.17 é o defeito nomeável: a queda praticamente não
   * acelerava, então subida e descida tinham o mesmo ritmo. Pulo real cai
   * mais rápido do que sobe, e quando não cai o corpo lê como boneco
   * puxado por barbante — é isso que se sente como "estranho" sem
   * conseguir nomear. Plataforma que se sustenta usa 1.8-2.2.
   *
   * Um segundo inteiro de ar é o dobro do normal, e somado a 3.3s de
   * travessia e 0.27s de rampa de aceleração deixava o controle mole.
   *
   * O que FOI preservado, porque é a identidade do arquétipo: gravidade de
   * subida ainda baixa (hangtime generoso perto do ápice), controle aéreo
   * alto e as janelas de perdão (coyote 120ms, buffer 150ms) intactas.
   * "Floaty" é pairar no ápice, não cair devagar o caminho todo.
   *
   * Encurtar o pulo era seguro e isso foi VERIFICADO, não presumido: o
   * maior vão do nível é de 3 tiles (48px) e o alcance novo é de 99px,
   * ainda o dobro. O alcance antigo de 115px estava superdimensionado.
   */
  floaty: {
    id: "floaty",
    label: "FLOATY",
    description: "pairada no ápice · queda firme · controle aéreo alto",
    accel: 1100,
    frictionGround: 1300,
    frictionAir: 500,
    maxSpeed: 150,
    airControl: 0.75,
    jumpForce: 300,
    speedJumpBonus: 0,
    gravityUp: 780,
    gravityDown: 1500,
    jumpCutoffMultiplier: 0.5,
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
