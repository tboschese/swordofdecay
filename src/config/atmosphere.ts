/**
 * ATMOSFERA — o que existe ENTRE a câmera e o cenário.
 *
 * O parallax (config/parallax.ts) resolve "o que está longe". A grade
 * (config/grade.ts) resolve "que cor o mundo inteiro tem". Faltava a
 * terceira: "o ar tem alguma coisa dentro dele?". Sem isso a cena lê como
 * recortes bem espaçados — camadas nítidas separadas por vazio — e não
 * como espaço. A medição da rodada 8 (`shots/measure.mjs`) mostrava
 * amplitude 0.36 entre faixas com nada ocupando o intervalo.
 *
 * Três mecanismos, do mais barato ao mais caro:
 *
 * 1. PARTÍCULAS DE AR — esporo, poeira e cinza em profundidades
 *    diferentes, cada camada com seu parallax. É o maior ganho por
 *    esforço: assim que dois grãos passam em velocidades diferentes na
 *    frente da mesma árvore, o cérebro para de ler recorte e passa a ler
 *    volume. Metade delas é MAIS ESCURA que o fundo, não mais clara —
 *    poeira perto da câmera contra céu pálido lê como silhueta; só o que
 *    está longe e iluminado é que brilha.
 * 2. FEIXES DE LUZ — a fonte da cena é o horizonte pálido (0xdde2cb),
 *    o céu é encoberto e doente. Então feixe aqui NÃO é raio de sol
 *    dourado atravessando folhagem: é luz difusa, fria, quase sem croma,
 *    cortando as camadas em ângulo raso. Alfa baixo por decisão — feixe
 *    que se anuncia vira efeito de tela, não ar.
 * 3. CLIMA — modificador ORTOGONAL (DESIGN.md §2.2): um preset nomeado
 *    muda a atmosfera sem tocar em uma linha do cenário. O mesmo bosque
 *    sob `drizzle` e sob `deepFog` é o mesmo bosque, e ainda assim é
 *    outro lugar.
 *
 * Lore (Lore/lore.md): Região 1, Terras Esquecidas — começo da curva de
 * tom. Estranhamento e negação, NÃO fim do mundo. Verde-acinzentado
 * dessaturado e frio. Nada saturado, nada dourado, nada de laranja de
 * "hora mágica": The Rot corrói também a memória de que houve cor.
 */

/** Uma camada de partícula em suspensão, com profundidade própria. */
export interface MoteLayer {
  /** Só pra debug/leitura. */
  readonly name: string;
  readonly count: number;
  /**
   * 0 = colado na câmera, 1 = colado no mundo, >1 = na FRENTE do mundo.
   * O que vende profundidade é a razão entre camadas, não o valor.
   */
  readonly scrollFactorX: number;
  readonly scrollFactorY: number;
  /** Aresta do quadrado, em px. Pixel art: 1 ou 2, nada de subpixel. */
  readonly sizePx: number;
  readonly color: number;
  readonly alpha: number;
  /** Deriva horizontal constante, px/s. O vento não tem rajada aqui. */
  readonly driftX: number;
  /** px/s. Negativo sobe (esporo), positivo desce (cinza, poeira). */
  readonly driftY: number;
  /** Amplitude do bamboleio lateral, px — é o que tira o movimento retilíneo. */
  readonly swayAmp: number;
  readonly swayPeriodMs: number;
  /** Campo de repetição. Precisa ser > viewport pra o wrap cair fora da tela. */
  readonly fieldW: number;
  readonly fieldH: number;
  /** 0-1: quanto o alfa oscila ao longo do bamboleio (grão girando na luz). */
  readonly twinkle: number;
  /**
   * Rastro em px, na direção contrária à deriva.
   *
   * Existe por causa de um problema de JULGAMENTO: a captura é um frame
   * parado, e num frame parado um grão distante e um grão colado na
   * lente são o mesmo quadradinho — a profundidade só apareceria em
   * movimento, onde ninguém consegue medir. O rastro é o borrão de
   * movimento que uma partícula rápida perto da câmera realmente tem, e
   * ele torna a camada próxima identificável PELA FORMA. Zero nas
   * camadas distantes: longe, nada se move rápido o bastante pra borrar.
   */
  readonly streakPx: number;
  /** true = desenhada ANTES do tilemap (fica atrás do mundo). */
  readonly behindWorld: boolean;
}

/** Feixe de luz difusa cortando as camadas. */
export interface ShaftSpec {
  readonly count: number;
  readonly scrollFactorX: number;
  /** Campo de repetição horizontal, px. */
  readonly fieldW: number;
  /** Deslocamento horizontal por px de altura. Negativo = tomba pra esquerda. */
  readonly tilt: number;
  readonly widthPx: number;
  /** Variação de largura por feixe, px (± metade). */
  readonly widthJitter: number;
  readonly color: number;
  readonly alpha: number;
  /** Onde o feixe começa/termina, em fração da altura da viewport. */
  readonly topRatio: number;
  readonly bottomRatio: number;
  /**
   * Onde o feixe está MAIS FORTE, em fração do próprio comprimento.
   *
   * Autorar isso foi a correção da primeira iteração: com o pico no topo,
   * o feixe gastava toda a intensidade em cima do céu — que já está em
   * 0.87 de valor, então sobrepor pálido sobre pálido não muda nada e a
   * medição não se mexeu um décimo. Feixe só EXISTE quando cruza matéria
   * escura. Com o pico em 0.55 ele acende exatamente na linha das copas,
   * que é onde "cortar as camadas" quer dizer alguma coisa. Também é
   * fisicamente honesto: o ar fica mais denso e mais empoeirado perto do
   * chão, e é a poeira que torna o feixe visível.
   */
  readonly peakRatio: number;
  /** Respiração: o feixe pulsa devagar, senão vira decalque. */
  readonly breathePeriodMs: number;
  readonly breatheAmt: number;
}

/** Banco de névoa que passa NA FRENTE do mundo (o do parallax fica atrás). */
export interface HazeSpec {
  readonly color: number;
  readonly alpha: number;
  /** Fração da viewport onde o banco começa e onde acaba. */
  readonly topRatio: number;
  readonly bottomRatio: number;
  readonly scrollFactorX: number;
  readonly driftX: number;
  /** Amplitude da ondulação da borda superior, px. */
  readonly waveAmp: number;
  readonly wavePeriodMs: number;
}

/** Chuva fina. Nunca é gota redonda: é risco. */
export interface RainSpec {
  readonly count: number;
  readonly color: number;
  readonly alpha: number;
  /** px/s na vertical. */
  readonly speed: number;
  readonly lengthPx: number;
  /** px horizontais por px vertical. */
  readonly slant: number;
  readonly scrollFactorX: number;
}

/**
 * Preset de clima. Multiplicadores sobre a base, mais o que só existe em
 * clima (chuva, névoa frontal, véu de cor). Ortogonal por construção: o
 * preset não sabe qual cenário está embaixo.
 */
export interface WeatherPreset {
  readonly label: string;
  /** Multiplicadores sobre a atmosfera base. */
  readonly moteAlphaScale: number;
  readonly moteCountScale: number;
  readonly shaftAlphaScale: number;
  readonly shaftWidthScale: number;
  readonly haze: HazeSpec | null;
  readonly rain: RainSpec | null;
  /**
   * Véu global sob a grade. Serve pra deslocar a TEMPERATURA da cena
   * inteira sem repintar nada. Alfa alto aqui achata o contraste — o
   * limite prático é ~0.10.
   */
  readonly veil: { readonly color: number; readonly alpha: number } | null;
}

/* ------------------------------------------------------------------ *
 * Base — Região 1, Terras Esquecidas                                   *
 * ------------------------------------------------------------------ */

export const FOREST_ATMOSPHERE = {
  /**
   * Ordem importa: quem tem scrollFactor menor vai antes. As duas
   * primeiras ficam atrás do tilemap (poeira no vão entre as árvores do
   * parallax); as duas últimas na frente de tudo, inclusive do jogador —
   * é exatamente o grão que passa colado na lente que fecha a sensação
   * de que existe ar aqui.
   */
  motes: [
    {
      name: "esporo distante",
      count: 84,
      scrollFactorX: 0.22,
      scrollFactorY: 0.14,
      sizePx: 1,
      // Claro: está longe, imerso na luz do horizonte, e some no fundo.
      color: 0xc8d2b4,
      alpha: 0.26,
      driftX: 2.4,
      driftY: -1.6,
      swayAmp: 3,
      swayPeriodMs: 5200,
      fieldW: 512,
      fieldH: 288,
      twinkle: 0.5,
      streakPx: 0,
      behindWorld: true,
    },
    {
      name: "poeira média",
      count: 54,
      scrollFactorX: 0.55,
      scrollFactorY: 0.3,
      sizePx: 1,
      color: 0xdae0c4,
      alpha: 0.36,
      driftX: 5.5,
      driftY: -2.6,
      swayAmp: 5,
      swayPeriodMs: 3900,
      fieldW: 448,
      fieldH: 272,
      twinkle: 0.55,
      streakPx: 0,
      behindWorld: true,
    },
    {
      name: "cinza próxima",
      count: 34,
      scrollFactorX: 1.35,
      scrollFactorY: 0.55,
      sizePx: 2,
      /**
       * ESCURA de propósito. Contra um céu pálido, o que está perto da
       * lente é silhueta, não brilho. É esta camada que separa "câmera"
       * de "cenário" — sem ela o resto vira poeira decorativa flutuando
       * em lugar nenhum.
       */
      color: 0x4c5545,
      alpha: 0.46,
      driftX: -13,
      driftY: 7,
      swayAmp: 7,
      swayPeriodMs: 2600,
      fieldW: 432,
      fieldH: 256,
      twinkle: 0.3,
      streakPx: 2,
      behindWorld: false,
    },
    {
      name: "esporo próximo",
      count: 14,
      scrollFactorX: 1.7,
      scrollFactorY: 0.7,
      sizePx: 2,
      // Poucos e claros: é o contraponto de valor da camada escura acima.
      color: 0xe4e8d0,
      alpha: 0.34,
      driftX: -18,
      driftY: -4,
      swayAmp: 9,
      swayPeriodMs: 2100,
      fieldW: 464,
      fieldH: 240,
      twinkle: 0.65,
      streakPx: 3,
      behindWorld: false,
    },
  ] as readonly MoteLayer[],

  /**
   * Quatro feixes. Cinco já lia como listra de papel de parede; três
   * deixavam metade da tela sem nada acontecendo no ar.
   */
  shafts: {
    count: 4,
    scrollFactorX: 0.34,
    fieldW: 520,
    // Tombados pra esquerda: a luz vem do horizonte à direita da vista.
    tilt: -0.28,
    widthPx: 26,
    widthJitter: 14,
    /** A cor do horizonte de parallax.ts. A luz não pode ter outra fonte. */
    color: 0xdde2cb,
    /**
     * Testado por ablação: acima de ~0.2 vira holofote e a média de
     * luminância sai da faixa; em 0.04 some sob a grade.
     */
    alpha: 0.14,
    topRatio: 0.0,
    bottomRatio: 0.95,
    peakRatio: 0.55,
    breathePeriodMs: 7300,
    breatheAmt: 0.22,
  } as ShaftSpec,
} as const;

/* ------------------------------------------------------------------ *
 * Clima — modificador ortogonal (DESIGN.md §2.2)                       *
 * ------------------------------------------------------------------ */

export const WEATHER: Record<string, WeatherPreset> = {
  /** Base: encoberto. É o clima padrão das Terras Esquecidas. */
  overcast: {
    label: "encoberto",
    moteAlphaScale: 1,
    moteCountScale: 1,
    shaftAlphaScale: 1,
    shaftWidthScale: 1,
    haze: null,
    rain: null,
    veil: null,
  },

  /**
   * Chuva fina. Não é tempestade — é aquela garoa que não molha e não
   * passa. Os feixes quase somem (o céu fechou), a poeira assenta, e o
   * ar ganha risco vertical.
   */
  drizzle: {
    label: "chuva fina",
    moteAlphaScale: 0.55,
    moteCountScale: 0.7,
    shaftAlphaScale: 0.35,
    shaftWidthScale: 1.25,
    haze: {
      color: 0xb9c2ae,
      alpha: 0.13,
      topRatio: 0.5,
      bottomRatio: 1.0,
      scrollFactorX: 0.4,
      driftX: 7,
      waveAmp: 4,
      wavePeriodMs: 9000,
    },
    rain: {
      count: 110,
      color: 0xd6dcc6,
      alpha: 0.26,
      speed: 300,
      lengthPx: 7,
      slant: 0.22,
      scrollFactorX: 0.9,
    },
    veil: { color: 0x5d6a70, alpha: 0.07 },
  },

  /**
   * Neblina densa. O cenário não muda; a distância que se enxerga dele,
   * sim. Os feixes ficam LARGOS e fracos — luz difusa em meio denso não
   * tem borda.
   */
  deepFog: {
    label: "neblina densa",
    moteAlphaScale: 1.35,
    moteCountScale: 1.15,
    shaftAlphaScale: 0.8,
    shaftWidthScale: 2.1,
    haze: {
      color: 0xcdd4bd,
      // 0.19, nao 0.30: em 0.30 a media de luminancia batia 0.44 e o
      // chao inteiro sumia num leite so. Neblina densa e uma cortina que
      // se ATRAVESSA, nao uma tela branca colada na lente.
      alpha: 0.165,
      topRatio: 0.4,
      bottomRatio: 1.0,
      scrollFactorX: 0.28,
      driftX: 3.5,
      waveAmp: 7,
      wavePeriodMs: 13000,
    },
    rain: null,
    veil: { color: 0xc4cdb6, alpha: 0.035 },
  },

  /**
   * Entardecer. A tentação é dourar — e dourar aqui mente sobre o mundo.
   * O sol destas terras já está doente: o fim do dia esfria e ROXEIA em
   * vez de esquentar. Os feixes ficam mais rasos e mais presentes porque
   * a luz vem de baixo do horizonte.
   */
  dusk: {
    label: "entardecer",
    moteAlphaScale: 1.2,
    moteCountScale: 1,
    shaftAlphaScale: 1.65,
    shaftWidthScale: 0.85,
    haze: {
      color: 0x8f93a6,
      alpha: 0.11,
      topRatio: 0.56,
      bottomRatio: 1.0,
      scrollFactorX: 0.32,
      driftX: 2,
      waveAmp: 5,
      wavePeriodMs: 11000,
    },
    rain: null,
    // 0.055: em 0.09 o roxo comia o topo da faixa tonal e o p99 caia pra
    // 0.74. O entardecer tem que ESFRIAR a cena, nao apagar o horizonte —
    // e o horizonte palido e a unica fonte de luz que este mundo tem.
    veil: { color: 0x4a4a68, alpha: 0.055 },
  },
};

export type WeatherName = keyof typeof WEATHER;

/** Clima de abertura da fase 1. */
export const DEFAULT_WEATHER = "overcast";
