import { rng } from "../engine/rng";
import { FRAME_MS, HITSTOP, IMPACT_SHIFT } from "../config/combat";

/**
 * Sistema de IMPACTO — partículas + hitstop + deslocamento do alvo.
 *
 * O nome do arquivo diz "partículas" por história, mas o módulo responde
 * por uma pergunta só: "o que o jogador sente quando algo é atingido?".
 * Partícula é a parte visível; o HITSTOP (ver seção no fim do arquivo) é
 * a parte que dá massa, e ele mora aqui porque nasce do MESMO evento —
 * quem chama `emit()`/`burst()` já está dizendo "isto foi um impacto",
 * então o call site não precisa pedir a pausa separadamente e não existe
 * caminho em que sai partícula sem sair peso.
 *
 * Não existe "partícula genérica" aqui: existe FAÍSCA DE METAL, MATÉRIA
 * PODRE, ESPORO, PÓ e FLASH. Cada um tem massa, arrasto, arco e rampa de
 * cor próprios, porque é isso que faz o jogador saber, sem ler número
 * nenhum, se a espada acertou carne corroída, se a flecha cravou, se o
 * bicho morreu, ou se ele só aterrissou.
 *
 * Vocabulário (DESIGN.md §2 — alvo Metal Slug / SOTN):
 *   · faísca de metal — curta, direcional, aditiva, quase branca no
 *     nascimento; some em <200ms. É brilho, não cor.
 *   · matéria podre  — pesada, cai com gravidade cheia, verde-doente
 *     dessaturado escurecendo até quase preto. The Rot corrói carne:
 *     o que sai do inimigo é polpa em decomposição, nunca sangue vivo.
 *   · esporo         — leve, SOBE, vida longa, alfa baixo. É a praga
 *     escapando do corpo.
 *   · pó             — rente ao chão, espalha na horizontal, arrasto
 *     alto, quase sem gravidade.
 *   · flash / anel   — 3-6 frames. É o que faz o golpe "conectar" na
 *     percepção; sem ele o resto vira confete atrasado.
 *
 * Regras que valem pra todas: nada de movimento retilíneo (tudo tem
 * gravidade e/ou arrasto, logo tudo faz arco), e nada some de repente —
 * morrer é encolher e apagar junto.
 *
 * Aleatoriedade só via `rng` (engine/rng.ts). `Math.random` quebraria a
 * captura determinística de `shots/`.
 */

/* ------------------------------------------------------------------ *
 * Rampas de cor — amostradas ao longo da vida (índice 0 = nascimento). *
 * A cena é verde-acinzentada e o passe de grade ainda dessatura em      *
 * 0.68, então o que separa partícula de fundo é LUMINÂNCIA, não croma.  *
 * ------------------------------------------------------------------ */
const RAMP = {
  /** Aço batendo em placa/osso. Branco-quente → âmbar → brasa morta. */
  spark: ["#f2e6b0", "#d8bc72", "#a8823c", "#6d4a1e", "#33200e"],
  /** Núcleo do flash: branco puxado pro verde pálido, pra pertencer à cena. */
  flash: ["#e8ecc8", "#c8d49a", "#9aa872", "#6a7551"],
  /**
   * Polpa corroída. Começa clara (é o interior exposto pegando luz) e
   * escurece rápido: a queda de valor ao longo da vida é o que impede
   * que um punhado destes vire pipoca clara parada na tela.
   */
  rot: ["#c9d0a2", "#93a06d", "#5d6c42", "#374028", "#1e241a"],
  /** Pedaço grosso do corpo — valor médio, some no fundo em ~4 frames. */
  gore: ["#8e9a6b", "#606c44", "#3a4429", "#232a1a", "#141810"],
  /**
   * Massa escura do corpo colapsando. Existe pra dar CONTRASTE DE VALOR
   * dentro do próprio efeito: sem uma base escura, os cacos claros da
   * morte viram pipoca clara sobre fundo escuro e nada tem volume.
   */
  mass: ["#414a33", "#2c3423", "#1c2217", "#12160f"],
  /** Esporo em suspensão. Alfa baixo, sobe. */
  spore: ["#c3cea8", "#95a17c", "#6a7458", "#414937"],
  /** Poeira de aterrissagem — cinza-terroso, sem verde. Clara: pó pega luz. */
  dust: ["#c6c8b2", "#a0a38b", "#767963", "#4c4f42"],
  /** Dano no jogador: brasa da armadura amaldiçoada, não sangue. */
  ember: ["#ffe6c6", "#e88f4e", "#a04524", "#4a1e10"],
  /** Moeda. */
  gold: ["#fff8cf", "#f6d45e", "#b7871f", "#5d4310"],
} as const;

/* ------------------------------------------------------------------ */

/** Como a partícula é rasterizada. */
const enum Kind {
  /** Quadrado de N px. Massa, respingo, cisco. */
  Px = 0,
  /** Risco na direção da velocidade, cabeça brilhante. Faísca. */
  Streak = 1,
  /** Estrela de impacto: núcleo cheio + braços irregulares. */
  Flash = 2,
  /** Anel oco expandindo. Só na descarga carregada. */
  Ring = 3,
  /** Disco macio de alfa baixo. Fumaça/pó volumétrico. */
  Puff = 4,
}

/** Origem angular do leque de emissão. */
type Base =
  /** Na direção do golpe. */
  | "dir"
  /** Contra o golpe (respingo voltando pra quem bateu). */
  | "back"
  /** 360°. */
  | "radial"
  /** Quase horizontal, escolhendo um dos dois lados. Pó rente ao chão. */
  | "ground"
  /** Cone pra cima. Esporo, fumaça. */
  | "up";

interface LayerSpec {
  kind: Kind;
  /** [min, max] inclusivo. */
  count: readonly [number, number];
  base: Base;
  /** Meia-abertura do leque, em radianos. */
  spread: number;
  /** [min, max] px/s. */
  speed: readonly [number, number];
  /** px/s². Faísca leve, carne ~1g, esporo negativo (sobe). */
  gravity: number;
  /** Fração da velocidade PERDIDA por segundo. 0 = sem arrasto. */
  drag: number;
  /** [min, max] ms. */
  life: readonly [number, number];
  /** [nascimento, morte] em px (raio, no caso de Ring/Puff/Flash). */
  size: readonly [number, number];
  ramp: readonly string[];
  /** Alfa de pico (antes da curva de fade). */
  alpha: number;
  /** Soma luz em vez de cobrir. Só faísca/flash — é o que alimenta o bloom do grade. */
  additive?: boolean;
  /** Comprimento do risco por unidade de velocidade (só Kind.Streak). */
  streak?: number;
  /** Raio de dispersão do ponto de nascimento, em px. */
  offset?: number;
  /** Empurrão vertical extra no nascimento (negativo = pra cima). */
  rise?: number;
  /**
   * Achatamento de Flash/Ring: [x, y]. Golpe de espada é horizontal, e
   * um flash circular perfeito denuncia código — os de Metal Slug são
   * sempre esticados no eixo do movimento.
   */
  stretch?: readonly [number, number];
}

interface EmissionSpec {
  /** Camadas desenhadas na ordem: massa primeiro, luz por cima. */
  layers: readonly LayerSpec[];
}

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ *
 * Camadas reutilizáveis. Uma emissão nomeada é uma RECEITA de camadas;  *
 * nenhuma constante mora solta no meio da lógica.                       *
 * ------------------------------------------------------------------ */

/** Faíscas de aço: rápidas, curtas, aditivas. O "tec" metálico do acerto. */
const sparks = (
  count: readonly [number, number],
  speed: readonly [number, number],
  life: readonly [number, number],
): LayerSpec => ({
  kind: Kind.Streak,
  count,
  base: "dir",
  spread: 62 * DEG,
  speed,
  gravity: 210,
  drag: 0.92,
  life,
  size: [1, 1],
  ramp: RAMP.spark,
  alpha: 1,
  additive: true,
  streak: 0.024,
  offset: 2,
});

/**
 * Respingo de polpa em DUAS camadas de propósito.
 *
 * Uma nuvem de 18 quadrados claros iguais vira pipoca: o olho lê "muitos
 * pontos", não "matéria". O que dá massa é contraste de valor — poucos
 * cacos claros e grandes (`rotChunk`) num enxame de cisco escuro e
 * pequeno (`rotFleck`), cada grupo com peso e vida diferentes.
 */
const rotChunk = (
  count: readonly [number, number],
  speed: readonly [number, number],
  life: readonly [number, number],
): LayerSpec => ({
  kind: Kind.Px,
  count,
  base: "dir",
  spread: 74 * DEG,
  speed,
  gravity: 660,
  drag: 0.5,
  life,
  size: [3, 1],
  ramp: RAMP.rot,
  alpha: 1,
  offset: 3,
  rise: -55,
});

const rotFleck = (
  count: readonly [number, number],
  speed: readonly [number, number],
  life: readonly [number, number],
): LayerSpec => ({
  kind: Kind.Px,
  count,
  base: "dir",
  spread: 86 * DEG,
  speed,
  gravity: 700,
  drag: 0.42,
  life,
  size: [2, 1],
  ramp: RAMP.gore,
  alpha: 1,
  offset: 4,
  rise: -30,
});

/** Esporo: sobe, dura, quase transparente. É a assinatura visual da praga. */
const spores = (count: readonly [number, number], life: readonly [number, number]): LayerSpec => ({
  kind: Kind.Px,
  count,
  base: "up",
  spread: 70 * DEG,
  speed: [14, 40],
  gravity: -30,
  drag: 0.35,
  life,
  size: [2, 1],
  ramp: RAMP.spore,
  alpha: 0.72,
  offset: 5,
});

/**
 * Estrela de impacto. `radius` é o raio do núcleo; os braços chegam a
 * ~2x isso, então o alcance visual é bem maior que o número. É o raio
 * que separa golpe fraco de descarga carregada.
 */
const flash = (
  radius: number,
  life: number,
  alpha = 1,
  stretch: readonly [number, number] = [1.3, 0.82],
): LayerSpec => ({
  kind: Kind.Flash,
  count: [1, 1],
  base: "radial",
  spread: 0,
  speed: [0, 0],
  gravity: 0,
  drag: 0,
  life: [life, life],
  size: [radius, radius * 0.2],
  ramp: RAMP.flash,
  alpha,
  additive: true,
  stretch,
});

/**
 * Rasgo: o mesmo flash esticado quase até virar uma lasca horizontal.
 * Dura 2-3 frames e é o que dá DIREÇÃO ao impacto — sem ele a estrela
 * sozinha lê como explosão genérica, não como corte de espada.
 */
const slashRip = (radius: number, life: number, alpha: number): LayerSpec => ({
  ...flash(radius, life, alpha, [2.1, 0.28]),
});

/* ------------------------------------------------------------------ *
 * Emissões nomeadas.                                                   *
 * ------------------------------------------------------------------ */

export type EmissionId =
  | "swordHit"
  | "swordHitCharged"
  | "arrowStick"
  | "enemyDeath"
  | "landingDust"
  | "playerHurt"
  | "pickup";

const EMISSIONS: Record<EmissionId, EmissionSpec> = {
  /**
   * Espada em inimigo, 3 de dano. Leitura em ~10 frames:
   * flash de 4 frames → faíscas → polpa caindo → esporo subindo.
   */
  swordHit: {
    layers: [
      // Rebalanceado: a versao anterior tinha faisca e flash dominando e
      // o golpe lia como raio eletrico. A materia corroida e que tem que
      // ser o evento — o clarao de aco e so o acento.
      rotChunk([6, 8], [80, 175], [260, 400]),
      rotFleck([14, 18], [60, 190], [200, 330]),
      spores([10, 13], [420, 660]),
      sparks([4, 6], [180, 300], [90, 160]),
      slashRip(5, 55, 0.7),
      flash(3, 52),
    ],
  },

  /**
   * Descarga carregada, 5 de dano. Não é "o mesmo com mais partículas":
   * ganha ANEL de choque e um flash ~2.4x maior — o salto tem que ser
   * óbvio em frame parado, senão a mecânica de carga não se comunica.
   */
  swordHitCharged: {
    layers: [
      {
        kind: Kind.Puff,
        count: [3, 4],
        base: "radial",
        spread: Math.PI,
        speed: [18, 46],
        gravity: -34,
        drag: 0.25,
        life: [320, 480],
        size: [5, 12],
        ramp: RAMP.gore,
        alpha: 0.34,
        offset: 3,
      },
      rotChunk([13, 17], [130, 300], [340, 520]),
      rotFleck([28, 34], [90, 320], [260, 430]),
      spores([22, 28], [560, 940]),
      sparks([9, 12], [300, 540], [120, 220]),
      {
        kind: Kind.Ring,
        count: [1, 1],
        base: "radial",
        spread: 0,
        speed: [0, 0],
        gravity: 0,
        drag: 0,
        life: [155, 155],
        size: [5, 21],
        ramp: RAMP.flash,
        alpha: 0.9,
        additive: true,
        stretch: [1.35, 0.5],
      },
      slashRip(9, 70, 0.75),
      flash(5, 74, 0.7),
    ],
  },

  /**
   * Flecha cravando. Perfuração, não explosão: cone estreito, contagem
   * baixa, vida curta. Se isto ficar parecido com o golpe de espada, o
   * jogador para de distinguir as duas armas pelo feedback.
   */
  arrowStick: {
    layers: [
      { ...rotChunk([1, 2], [70, 130], [240, 340]), base: "back", spread: 30 * DEG },
      { ...rotFleck([5, 7], [60, 150], [180, 280]), base: "back", spread: 40 * DEG },
      spores([3, 4], [400, 580]),
      { ...sparks([4, 5], [190, 320], [70, 120]), base: "back", spread: 24 * DEG },
      slashRip(2.5, 45, 0.6),
      flash(3.5, 60, 0.9, [1.1, 1.0]),
    ],
  },

  /**
   * Morte de inimigo. Sem faísca: nada está batendo em metal, o corpo
   * está se desfazendo. Puff escuro (a silhueta colapsando) + polpa
   * pesada em 360° + esporo longo subindo, que é o que deixa o "lugar
   * onde algo morreu" marcado por quase um segundo.
   */
  enemyDeath: {
    layers: [
      {
        kind: Kind.Puff,
        count: [4, 5],
        base: "radial",
        spread: Math.PI,
        speed: [14, 42],
        gravity: -26,
        drag: 0.22,
        life: [460, 700],
        size: [5, 16],
        ramp: RAMP.mass,
        alpha: 0.6,
        offset: 4,
      },
      { ...rotChunk([5, 7], [70, 190], [480, 760]), base: "radial", spread: Math.PI, rise: -80 },
      { ...rotFleck([15, 19], [55, 200], [380, 620]), base: "radial", spread: Math.PI, rise: -60 },
      {
        kind: Kind.Px,
        count: [6, 8],
        base: "ground",
        spread: 16 * DEG,
        speed: [45, 105],
        gravity: 70,
        drag: 0.12,
        life: [320, 500],
        size: [2, 1],
        ramp: RAMP.dust,
        alpha: 0.75,
        offset: 5,
      },
      spores([11, 14], [750, 1200]),
    ],
  },

  /**
   * Poeira de aterrissagem. Rente ao chão, abrindo pros dois lados,
   * arrasto alto e gravidade quase nula — pó não voa em arco de bala,
   * ele desacelera e assenta. Nunca aditiva: pó bloqueia luz.
   */
  landingDust: {
    layers: [
      {
        kind: Kind.Puff,
        count: [4, 5],
        base: "ground",
        spread: 22 * DEG,
        speed: [30, 70],
        gravity: -14,
        drag: 0.2,
        life: [330, 520],
        size: [3, 11],
        ramp: RAMP.dust,
        alpha: 0.36,
        offset: 4,
        rise: -10,
      },
      {
        kind: Kind.Px,
        count: [9, 13],
        base: "ground",
        spread: 20 * DEG,
        speed: [55, 130],
        gravity: 60,
        drag: 0.1,
        life: [300, 480],
        size: [3, 1],
        ramp: RAMP.dust,
        alpha: 0.95,
        offset: 3,
        rise: -22,
      },
    ],
  },

  /** Jogador levando dano: brasa da armadura + faísca quente. Curto. */
  playerHurt: {
    layers: [
      {
        kind: Kind.Px,
        count: [5, 7],
        base: "radial",
        spread: Math.PI,
        speed: [60, 140],
        gravity: 520,
        drag: 0.45,
        life: [240, 380],
        size: [2, 1],
        ramp: RAMP.ember,
        alpha: 1,
        offset: 4,
        rise: -40,
      },
      {
        ...sparks([6, 8], [170, 300], [70, 130]),
        base: "radial",
        spread: Math.PI,
        ramp: RAMP.ember,
      },
      flash(6, 65, 0.8),
    ],
  },

  /** Moeda coletada. Cintila, sobe e some — nada de peso. */
  pickup: {
    layers: [
      {
        kind: Kind.Px,
        count: [5, 7],
        base: "up",
        spread: 80 * DEG,
        speed: [35, 85],
        gravity: 210,
        drag: 0.3,
        life: [280, 420],
        size: [1, 1],
        ramp: RAMP.gold,
        alpha: 1,
        additive: true,
        offset: 3,
        rise: -30,
      },
      flash(4, 50, 0.7),
    ],
  },
};

/**
 * Ponte pro `burst()` legado (assinatura antiga: cor + contagem + speed).
 * Os call sites em `game/TilemapGame.ts` ainda chamam assim; enquanto
 * chamarem, a cor exata identifica a intenção. Chamar `emit()` direto é o
 * caminho preferido — esta tabela é compatibilidade, não design.
 */
const LEGACY_ROUTES: ReadonlyArray<{
  color: string;
  id: EmissionId;
  chargedId?: EmissionId;
  /** Desempate quando a cor sozinha é ambígua. Ver a nota do #d82800. */
  maxCount?: number;
}> = [
  { color: "#f8d820", id: "swordHit", chargedId: "swordHitCharged" },
  { color: "#f8d800", id: "pickup" },
  /*
   * `WALKER.color` em config/enemies.ts é EXATAMENTE 0xd82800 — a mesma
   * cor que o call site de dano no jogador passa. Sem o desempate por
   * contagem (dano no jogador manda 8, morte manda 14), TODA morte de
   * walker caía nesta rota e saía como brasa de armadura amaldiçoada —
   * a partícula de quem APANHOU — em vez do corpo desabando em esporo e
   * massa escura. Passou batido por rodadas porque as duas são laranjas
   * e ninguém isolou uma morte de walker no zoom.
   */
  { color: "#d82800", id: "playerHurt", maxCount: 8 },
];
/** Contagem a partir da qual o `burst` legado de acerto conta como carregado. */
const LEGACY_CHARGED_COUNT = 9;

/* ------------------------------------------------------------------ *
 * Peso por emissão: quantos frames o mundo para, e quanto o alvo anda.  *
 *                                                                       *
 * A tabela é indexada pela MESMA EmissionId das partículas de propósito. *
 * "Que efeito sai" e "quanto isso pesa" são a mesma decisão de design —  *
 * separar as duas em dois lugares é como se acaba com um golpe que       *
 * cospe faísca de espada e pausa de moeda.                              *
 * ------------------------------------------------------------------ */

/** Emissão ausente = impacto sem pausa (pó de aterrissagem, moeda). */
const HITSTOP_FRAMES: Partial<Record<EmissionId, number>> = {
  swordHit: HITSTOP.swordFrames,
  swordHitCharged: HITSTOP.swordChargedFrames,
  arrowStick: HITSTOP.arrowFrames,
  enemyDeath: HITSTOP.killFrames,
  playerHurt: HITSTOP.playerHurtFrames,
};

/** Emissão ausente = alvo não é empurrado (morte: o corpo desaba, não recua). */
const SHIFT_PX: Partial<Record<EmissionId, number>> = {
  swordHit: IMPACT_SHIFT.swordPx,
  swordHitCharged: IMPACT_SHIFT.swordChargedPx,
  arrowStick: IMPACT_SHIFT.arrowPx,
};

const RAMP_MS = HITSTOP.rampFrames * FRAME_MS;
const SHIFT_OUT_MS = IMPACT_SHIFT.outFrames * FRAME_MS;
const SHIFT_SETTLE_MS = IMPACT_SHIFT.settleFrames * FRAME_MS;
const SHIFT_TOTAL_MS = SHIFT_OUT_MS + SHIFT_SETTLE_MS;

/** Um empurrão visual em andamento, ancorado na posição do alvo atingido. */
interface Shift {
  x: number;
  y: number;
  /** Amplitude em px. O SINAL vem de quem consulta — só o call site sabe pra que lado é "longe do jogador". */
  distance: number;
  elapsedMs: number;
}

/** Teto de partículas vivas. Estourou, a mais antiga sai — nunca a nova (a nova é a que o jogador está olhando). */
const MAX_PARTICLES = 460;

/** Fração final da vida em que o alfa cai a zero. */
const FADE_TAIL = 0.42;

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  lifeMs: number;
  maxLifeMs: number;
  size0: number;
  size1: number;
  ramp: readonly string[];
  alpha: number;
  additive: boolean;
  streak: number;
  stretchX: number;
  stretchY: number;
  /** Pares [ângulo, comprimento relativo] dos braços do flash, sorteados no nascimento. */
  arms: number[];
}

export class Particles {
  private readonly particles: Particle[] = [];

  /** Congelamento duro restante (ms de tempo REAL). */
  private freezeMs = 0;
  /** Retomada em rampa restante (ms de tempo REAL). Só corre depois do congelamento. */
  private rampMs = 0;
  /**
   * Delta real do frame, gravado por `beginFrame`. É o que permite as
   * partículas continuarem correndo enquanto o mundo recebe delta 0.
   * `null` = ninguém instalou o hook, e aí `update` usa o próprio delta.
   */
  private realDeltaMs: number | null = null;
  private readonly shifts: Shift[] = [];

  get count(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
    this.shifts.length = 0;
    this.freezeMs = 0;
    this.rampMs = 0;
    this.realDeltaMs = null;
  }

  /* ---------------------------------------------------------------- *
   * HITSTOP                                                            *
   *                                                                    *
   * Contrato com o jogo, em três peças:                                *
   *                                                                    *
   *   · `requestHitstop(ms)` — pede a pausa. Já é chamado sozinho por   *
   *     `emit()`/`burst()`, então o caminho normal não precisa disso.   *
   *   · `timeScale`          — 0 congelado, `rampScale`..1 retomando,   *
   *     1 normal. O resto do jogo MULTIPLICA o delta por isto.          *
   *   · `beginFrame(delta)`  — açúcar: faz as duas coisas de uma vez e  *
   *     devolve o delta que o mundo deve usar. Uma linha no loop.       *
   *                                                                    *
   * O que NÃO para: partícula, flash e screen shake. `update()` sempre  *
   * anda em tempo real (ver `realDeltaMs`), e o shake é sorteado no     *
   * render, que roda todo frame. Congelar o frame inteiro lê como       *
   * travamento de jogo; congelar só o MUNDO, com o efeito ainda vivo    *
   * por cima, lê como impacto.                                         *
   * ---------------------------------------------------------------- */

  /** 0 = mundo congelado · <1 = retomando · 1 = normal. */
  get timeScale(): number {
    if (this.freezeMs > 0) return 0;
    if (this.rampMs > 0) {
      const done = 1 - this.rampMs / RAMP_MS;
      return HITSTOP.rampScale + (1 - HITSTOP.rampScale) * done;
    }
    return 1;
  }

  /** True enquanto o congelamento duro está de pé. */
  get frozen(): boolean {
    return this.freezeMs > 0;
  }

  /**
   * Pede uma pausa de impacto.
   *
   * A MAIOR VENCE, nunca soma: dois acertos no mesmo frame (golpe que
   * mata = hit + morte) somariam 9+ frames e o jogo engasgaria de vez.
   * O teto de `maxFrames` é a segunda trava.
   */
  requestHitstop(ms: number): void {
    const capped = Math.min(ms, HITSTOP.maxFrames * FRAME_MS);
    if (capped <= this.freezeMs) return;
    this.freezeMs = capped;
    this.rampMs = RAMP_MS;
  }

  /**
   * ÚNICO ponto de contato com o loop do jogo.
   *
   * Recebe o delta REAL do frame e devolve o delta que o mundo deve usar
   * (0 durante a pausa). Guarda o real pra que `update()` continue
   * animando partícula e flash mesmo com o mundo parado.
   *
   * A escala é lida ANTES de descontar o tempo: é isso que faz um pedido
   * de 3 frames render exatamente 3 frames congelados, e não 2.
   */
  beginFrame(realDeltaMs: number): number {
    this.realDeltaMs = realDeltaMs;
    const scale = this.timeScale;
    if (this.freezeMs > 0) this.freezeMs = Math.max(0, this.freezeMs - realDeltaMs);
    else if (this.rampMs > 0) this.rampMs = Math.max(0, this.rampMs - realDeltaMs);
    return realDeltaMs * scale;
  }

  /**
   * Deslocamento visual em px do alvo atingido em (worldX, worldY), pra
   * somar na posição de desenho — não na posição de mundo. Knockback de
   * LEITURA: não muda hitbox, não muda colisão, não pode empurrar
   * ninguém pra dentro de parede.
   *
   * @param dirX sinal do empurrão (tipicamente `sign(alvo.x - jogador.x)`).
   *             Fica com quem consulta porque só o jogo sabe quem bateu.
   */
  impactShiftX(worldX: number, worldY: number, dirX: number): number {
    const r2 = IMPACT_SHIFT.matchRadiusPx * IMPACT_SHIFT.matchRadiusPx;
    // Entre dois impactos no raio, vence o MAIS NOVO: se o alvo levou
    // outro golpe antes do primeiro empurrão assentar, é o golpe novo que
    // o jogador está olhando. Pegar o primeiro da lista deixaria o
    // segundo acerto sem reação nenhuma.
    let best: Shift | null = null;
    for (const s of this.shifts) {
      const dx = s.x - worldX;
      const dy = s.y - worldY;
      if (dx * dx + dy * dy > r2) continue;
      if (best === null || s.elapsedMs < best.elapsedMs) best = s;
    }
    if (best === null) return 0;
    // Reancora no alvo: ele volta a andar depois da pausa, e sem isto o
    // empurrão descolaria do corpo no meio do próprio empurrão.
    best.x = worldX;
    best.y = worldY;
    return dirX * shiftOffset(best.elapsedMs, best.distance);
  }

  /**
   * Dispara uma emissão nomeada.
   *
   * @param dirX/dirY direção do golpe (ex.: facing do jogador). Ambos 0
   *                  = radial, usado quando o call site não sabe pra que
   *                  lado bateu — degrada pra leque duplo, não pra bolha.
   * @param scale     multiplicador de contagem/velocidade, pra modular
   *                  sem inventar preset novo (ex.: força da queda no pó).
   */
  emit(id: EmissionId, x: number, y: number, opts: { dirX?: number; dirY?: number; scale?: number } = {}): void {
    const spec = EMISSIONS[id];
    const dirX = opts.dirX ?? 0;
    const dirY = opts.dirY ?? 0;
    const scale = opts.scale ?? 1;
    const dirAngle = dirX === 0 && dirY === 0 ? null : Math.atan2(dirY, dirX);

    // Peso antes de arte: a pausa é o que o jogador sente primeiro.
    const frames = HITSTOP_FRAMES[id];
    if (frames !== undefined) this.requestHitstop(frames * FRAME_MS);
    const push = SHIFT_PX[id];
    if (push !== undefined) this.shifts.push({ x, y, distance: push * scale, elapsedMs: 0 });

    for (const layer of spec.layers) {
      const [cMin, cMax] = layer.count;
      const raw = cMin + Math.floor(rng.random() * (cMax - cMin + 1));
      const n = Math.max(1, Math.round(raw * scale));
      for (let i = 0; i < n; i++) this.spawn(layer, x, y, dirAngle, scale, i);
    }
  }

  /**
   * @deprecated Assinatura antiga, mantida enquanto `TilemapGame` não
   * migra pra `emit()`. Roteia por cor (ver LEGACY_ROUTES); cor
   * desconhecida = cor do inimigo = morte de inimigo.
   */
  burst(x: number, y: number, count: number, color: string, speed: number, _opts: { gravity?: boolean } = {}): void {
    void speed;
    const route = LEGACY_ROUTES.find(
      (r) => r.color === color.toLowerCase() && (r.maxCount === undefined || count <= r.maxCount),
    );
    if (!route) {
      this.emit("enemyDeath", x, y);
      return;
    }
    const chargedId = route.chargedId;
    this.emit(chargedId !== undefined && count >= LEGACY_CHARGED_COUNT ? chargedId : route.id, x, y);
  }

  private spawn(layer: LayerSpec, x: number, y: number, dirAngle: number | null, scale: number, index: number): void {
    const angle = this.pickAngle(layer, dirAngle, index);
    const speedScale = layer.kind === Kind.Streak || layer.kind === Kind.Px ? 0.6 + 0.4 * scale : 1;
    const speed = lerp(layer.speed[0], layer.speed[1], rng.random()) * speedScale;
    const offset = layer.offset ?? 0;
    const oa = rng.random() * Math.PI * 2;
    const od = offset * Math.sqrt(rng.random());
    const life = lerp(layer.life[0], layer.life[1], rng.random());

    // Braços irregulares em comprimento: uma estrela de raios iguais lê
    // como ícone, não como impacto.
    const arms: number[] = [];
    if (layer.kind === Kind.Flash) {
      const armCount = 5 + Math.floor(rng.random() * 3);
      for (let i = 0; i < armCount; i++) {
        arms.push((i / armCount) * Math.PI * 2 + (rng.random() - 0.5) * 0.8, 0.75 + rng.random() * 1.5);
      }
    }

    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      kind: layer.kind,
      x: x + Math.cos(oa) * od,
      y: y + Math.sin(oa) * od,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + (layer.rise ?? 0),
      gravity: layer.gravity,
      drag: layer.drag,
      lifeMs: life,
      maxLifeMs: life,
      size0: layer.size[0],
      size1: layer.size[1],
      ramp: layer.ramp,
      alpha: layer.alpha,
      additive: layer.additive === true,
      streak: layer.streak ?? 0,
      stretchX: layer.stretch?.[0] ?? 1,
      stretchY: layer.stretch?.[1] ?? 1,
      arms,
    });
  }

  /**
   * O lado alterna pelo ÍNDICE, não por sorteio: com 8 partículas, um
   * sorteio 50/50 sai 6-2 com frequência alta e a poeira/o respingo sai
   * torto pra um lado só. Alternar dá leque simétrico sem tirar o
   * jitter angular, que é o que mantém a coisa orgânica.
   */
  private pickAngle(layer: LayerSpec, dirAngle: number | null, index: number): number {
    const jitter = (rng.random() * 2 - 1) * layer.spread;
    const side = index % 2 === 0 ? 0 : Math.PI;
    switch (layer.base) {
      case "dir":
        // Sem direção conhecida vira leque duplo horizontal: continua
        // lendo como impacto, em vez de virar bolha simétrica.
        return (dirAngle ?? side) + jitter;
      case "back":
        return (dirAngle === null ? side : dirAngle + Math.PI) + jitter;
      case "up":
        return -Math.PI / 2 + jitter;
      case "ground":
        return side + jitter * 0.5 - 6 * DEG;
      case "radial":
      default:
        return rng.random() * Math.PI * 2;
    }
  }

  /**
   * Partícula NÃO congela.
   *
   * Se o hook de hitstop está instalado, este método recebe o delta já
   * escalado (0 durante a pausa) — e ignora, usando o delta real gravado
   * por `beginFrame`. É a metade que faz a pausa ler como impacto em vez
   * de travamento: o mundo para, o estilhaço continua voando.
   */
  update(deltaMs: number): void {
    const realMs = this.realDeltaMs ?? deltaMs;
    this.realDeltaMs = null;
    const dt = realMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      // Arrasto exponencial + gravidade: nenhuma partícula anda em reta.
      if (p.drag > 0) {
        const k = Math.pow(1 - p.drag, dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifeMs -= realMs;
      if (p.lifeMs <= 0) this.particles.splice(i, 1);
    }
    this.updateShifts(realMs);
  }

  /**
   * O empurrão só corre com o mundo andando: durante a pausa o alvo fica
   * cravado. Deslocar DURANTE o congelamento gastaria os dois efeitos ao
   * mesmo tempo e o golpe voltaria a não ter direção nenhuma.
   */
  private updateShifts(realMs: number): void {
    if (this.freezeMs > 0) return;
    for (let i = this.shifts.length - 1; i >= 0; i--) {
      const s = this.shifts[i]!;
      s.elapsedMs += realMs;
      if (s.elapsedMs >= SHIFT_TOTAL_MS) this.shifts.splice(i, 1);
    }
  }

  /** Massa primeiro (cobre), luz depois (soma). Inverter isso apaga o flash atrás do respingo. */
  render(ctx: CanvasRenderingContext2D, cameraX: number, cameraY: number): void {
    ctx.save();
    for (const p of this.particles) if (!p.additive) this.draw(ctx, p, cameraX, cameraY);
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) if (p.additive) this.draw(ctx, p, cameraX, cameraY);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private draw(ctx: CanvasRenderingContext2D, p: Particle, cameraX: number, cameraY: number): void {
    const t = 1 - p.lifeMs / p.maxLifeMs; // 0 = nasceu, 1 = morreu
    const remaining = 1 - t;
    const fade = remaining > FADE_TAIL ? 1 : remaining / FADE_TAIL;
    const x = p.x - cameraX;
    const y = p.y - cameraY;

    switch (p.kind) {
      case Kind.Flash:
        this.drawFlash(ctx, p, x, y, remaining);
        return;
      case Kind.Ring:
        this.drawRing(ctx, p, x, y, t, remaining);
        return;
      case Kind.Puff:
        this.drawPuff(ctx, p, x, y, t, fade);
        return;
      case Kind.Streak:
        this.drawStreak(ctx, p, x, y, t, fade);
        return;
      default:
        this.drawPx(ctx, p, x, y, t, fade);
    }
  }

  private drawPx(ctx: CanvasRenderingContext2D, p: Particle, x: number, y: number, t: number, fade: number): void {
    const size = Math.max(1, Math.round(lerp(p.size0, p.size1, t)));
    ctx.globalAlpha = p.alpha * fade;
    ctx.fillStyle = sampleRamp(p.ramp, t);
    ctx.fillRect(Math.round(x) - (size >> 1), Math.round(y) - (size >> 1), size, size);
  }

  /**
   * Faísca: risco de comprimento proporcional à velocidade ATUAL — ela
   * freia por arrasto, então o risco encurta sozinho e o movimento lê
   * como desaceleração, não como translação.
   */
  private drawStreak(ctx: CanvasRenderingContext2D, p: Particle, x: number, y: number, t: number, fade: number): void {
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < 1) {
      this.drawPx(ctx, p, x, y, t, fade);
      return;
    }
    const len = Math.min(7, Math.max(1, speed * p.streak));
    const ux = p.vx / speed;
    const uy = p.vy / speed;
    ctx.globalAlpha = p.alpha * fade;
    const head = t * (p.ramp.length - 1);
    for (let i = 0; i <= len; i++) {
      const along = i / Math.max(1, len);
      const idx = Math.min(p.ramp.length - 1, Math.round(head + along * 2));
      ctx.fillStyle = p.ramp[idx]!;
      ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
    }
  }

  /**
   * Estrela de impacto: núcleo PEQUENO + espinhos longos e afilados.
   *
   * A tentação é engordar o núcleo pra "ficar forte" — e aí o efeito vira
   * uma bola branca que come a silhueta do inimigo e não lê como golpe.
   * A força vem do ALCANCE dos espinhos (até ~2.2x o raio) e do contraste
   * do núcleo, não da área preenchida. Por isso os braços só têm 2px de
   * espessura no primeiro terço; do meio pra ponta são 1px, e mudam de
   * cor pro tom mais frio da rampa.
   */
  private drawFlash(ctx: CanvasRenderingContext2D, p: Particle, x: number, y: number, remaining: number): void {
    const radius = lerp(p.size1, p.size0, Math.pow(remaining, 0.5));
    if (radius < 0.5) return;
    const cx = Math.round(x);
    const cy = Math.round(y);
    ctx.globalAlpha = p.alpha * Math.pow(remaining, 0.6);

    ctx.fillStyle = p.ramp[0]!;
    fillEllipse(ctx, cx, cy, radius * 0.3 * p.stretchX, radius * 0.3 * p.stretchY);

    for (let i = 0; i < p.arms.length; i += 2) {
      const a = p.arms[i]!;
      const armLen = radius * p.arms[i + 1]!;
      const ux = Math.cos(a) * p.stretchX;
      const uy = Math.sin(a) * p.stretchY;
      // Passo em px de TELA, não no parâmetro: com stretch 2.6 um passo
      // fixo de 0.6 deixa 1.5px de buraco entre amostras e o braço vira
      // linha tracejada. Custou uma rodada inteira de captura.
      const step = 0.7 / Math.max(0.25, Math.hypot(ux, uy));
      for (let d = radius * 0.15; d <= armLen; d += step) {
        const along = d / armLen;
        const w = along < 0.34 ? 2 : 1;
        ctx.fillStyle = p.ramp[along < 0.5 ? 0 : along < 0.8 ? 1 : 2]!;
        ctx.fillRect(Math.round(cx + ux * d) - (w >> 1), Math.round(cy + uy * d) - (w >> 1), w, w);
      }
    }
  }

  /** Anel de choque: só na descarga carregada. Cresce e apaga em ~11 frames. */
  private drawRing(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    x: number,
    y: number,
    t: number,
    remaining: number,
  ): void {
    const radius = lerp(p.size0, p.size1, Math.pow(t, 0.55));
    const base = p.alpha * remaining * remaining;
    ctx.fillStyle = sampleRamp(p.ramp, t);
    // Amostragem pelo raio JÁ ESTICADO: com stretch 1.35 e `radius*6` o
    // espaçamento passa de 1px e o anel sai tracejado — que foi
    // exatamente o artefato pego na captura da rodada anterior.
    const steps = Math.max(16, Math.ceil(radius * Math.max(p.stretchX, p.stretchY) * 8));
    const cx = Math.round(x);
    const cy = Math.round(y);
    // Engrossa enquanto está nascendo: um anel de 1px some no ruído do
    // tileset, e o anel é justamente o que anuncia "isto foi carregado".
    const w = t < 0.3 ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      // Brilho ∝ |cos| — o anel acende nas pontas horizontais e apaga em
      // cima/embaixo. Anel de brilho uniforme lê como círculo de UI; este
      // lê como onda saindo do eixo do golpe.
      const c = Math.abs(Math.cos(a));
      ctx.globalAlpha = base * (0.25 + 0.75 * c * c);
      ctx.fillRect(
        Math.round(cx + Math.cos(a) * radius * p.stretchX),
        Math.round(cy + Math.sin(a) * radius * p.stretchY),
        w,
        w,
      );
    }
  }

  /** Disco macio: volume de fumaça/pó. Cresce enquanto apaga. */
  private drawPuff(ctx: CanvasRenderingContext2D, p: Particle, x: number, y: number, t: number, fade: number): void {
    const radius = lerp(p.size0, p.size1, t);
    ctx.globalAlpha = p.alpha * fade * (1 - t * 0.45);
    ctx.fillStyle = sampleRamp(p.ramp, t);
    fillDisc(ctx, Math.round(x), Math.round(y), radius);
  }
}

/** Disco rasterizado linha a linha — sem antialias, que inventaria tom fora da paleta. */
function fillDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  fillEllipse(ctx, cx, cy, radius, radius);
}

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  const a = Math.max(0.5, rx);
  const b = Math.max(0.5, ry);
  const bi = Math.ceil(b);
  for (let dy = -bi; dy <= bi; dy++) {
    const k = 1 - (dy * dy) / (b * b);
    if (k <= 0) continue;
    const half = Math.floor(a * Math.sqrt(k));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/**
 * Curva do empurrão: SAI SECO, VOLTA MACIO.
 *
 * Ida em `1-(1-u)²` (arranca rápido e desacelera, como corpo levando
 * pancada), volta em smoothstep, e a volta é mais longa que a ida. Uma
 * curva simétrica leria como objeto elástico — mola, não carne.
 */
function shiftOffset(elapsedMs: number, distance: number): number {
  if (elapsedMs < SHIFT_OUT_MS) {
    const u = elapsedMs / SHIFT_OUT_MS;
    return distance * (1 - (1 - u) * (1 - u));
  }
  const v = Math.min(1, (elapsedMs - SHIFT_OUT_MS) / SHIFT_SETTLE_MS);
  return distance * (1 - v * v * (3 - 2 * v));
}

function sampleRamp(ramp: readonly string[], t: number): string {
  const i = Math.min(ramp.length - 1, Math.max(0, Math.floor(t * ramp.length)));
  return ramp[i]!;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
