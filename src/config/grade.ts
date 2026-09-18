/**
 * Presets de grade (pós-processamento). Orientado a dados, como física e
 * combate — nenhum número de look mora espalhado no renderer.
 *
 * A rodada 0 mediu o baseline: media de luminância 0.58, 36.5% do frame
 * nas altas e só 7.5% em sombra. Isso é imagem de dia claro, e briga com
 * a lore (The Rot corrói carne, pedra e memória; a fase 1 fica no trecho
 * de estranhamento da curva de 10 regiões — ver DESIGN.md §4).
 *
 * O alvo declarado da rodada 1 está em `ROT_TARGET` e é verificável com
 * `node shots/measure.mjs`.
 */
export interface GradePreset {
  /** Ganho linear antes da curva. <1 escurece a cena inteira. */
  exposure: number;
  /** Levanta o preto pra sombra não fechar em zero morto (look de filme). */
  lift: number;
  /** Força da curva em S. 0 = linear, 1 = contraste forte. */
  contrast: number;
  /** Ponto de articulação da curva — abaixo dele comprime, acima expande. */
  pivot: number;
  /** 1 = cor original, 0 = cinza. Fantasia sombria vive dessaturada. */
  saturation: number;
  /** Tinta aplicada nas sombras (RGB -255..255). Frio/violeta dá volume. */
  shadowTint: readonly [number, number, number];
  /** Tinta aplicada nas altas. Quente separa a luz da sombra por temperatura. */
  highlightTint: readonly [number, number, number];
  /** Escurecimento de canto. 0 = sem vinheta. */
  vignette: number;
  /** Início da vinheta em fração da diagonal — antes disso não escurece. */
  vignetteInner: number;
  /** Luminância (0..1) a partir da qual um pixel alimenta o bloom. */
  bloomThreshold: number;
  /** Quanto do bloom volta pra imagem. */
  bloomStrength: number;
  /** Amplitude do grão, em níveis de 0-255. Fica sob o detalhe, não sobre. */
  grain: number;
}

/**
 * Alvo mensurável da rodada 1, derivado da review em
 * `shots/reviews/r0_baseline.md`. Critério de saída do m8.
 */
export const ROT_TARGET = {
  /**
   * ATENÇÃO — este alvo foi CORRIGIDO, e a correção precisa ser lida
   * antes de alguém tentar "consertar" a cena pra bater o número antigo.
   *
   * A primeira versão exigia 30-45% de massa de sombra, escrita por
   * extrapolação **antes de existir qualquer cena montada**. A rodada 1
   * mediu 21.7% e eu tentei fechar a diferença escurecendo as faixas de
   * parallax — o resultado foi massa uniforme de meio-tom sem separação
   * de profundidade (desvio-padrão despencou de 0.19 pra 0.12, amplitude
   * entre faixas de 0.36 pra 0.14). A imagem piorou enquanto a métrica
   * melhorava, que é a definição de gamear a métrica.
   *
   * A causa é geométrica, não artística: uma vista externa de dia
   * encoberto é dominada por bandas de céu e mata em meio-tom. Cena
   * fechada — caverna, interior, noite — bate 35% naturalmente.
   *
   * Por isso o alvo passou a depender do TIPO DE CENA. Isso não é abaixar
   * a barra: é parar de exigir de uma cena externa um comportamento que
   * só cena fechada tem. As outras três metas não mudaram.
   */
  outdoorDay: { shadowMassMin: 0.18, shadowMassMax: 0.32 },
  enclosed: { shadowMassMin: 0.3, shadowMassMax: 0.45 },

  highlightMax: 0.1,
  meanMin: 0.32,
  meanMax: 0.42,
  /** A imagem tem que continuar tendo brilho real — não é só escurecer tudo. */
  p99Min: 0.75,
} as const;

/** Fase 1 — Terras Esquecidas. Começo da curva: estranhamento, não fim do mundo. */
export const GRADE_ROT: GradePreset = {
  exposure: 0.88,
  lift: 0.004,
  contrast: 0.42,
  pivot: 0.36,
  saturation: 0.68,
  shadowTint: [-6, -2, 14],
  highlightTint: [14, 6, -8],
  vignette: 0.30,
  vignetteInner: 0.52,
  bloomThreshold: 0.62,
  bloomStrength: 0.5,
  grain: 3.2,
};

/** Sem grade — para comparação A/B durante o ajuste. */
export const GRADE_OFF: GradePreset = {
  exposure: 1,
  lift: 0,
  contrast: 0,
  pivot: 0.5,
  saturation: 1,
  shadowTint: [0, 0, 0],
  highlightTint: [0, 0, 0],
  vignette: 0,
  vignetteInner: 1,
  bloomThreshold: 2,
  bloomStrength: 0,
  grain: 0,
};
