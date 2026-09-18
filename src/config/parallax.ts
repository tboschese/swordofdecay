/**
 * Parallax desenhado por código, não por imagem (DESIGN.md §2.2, mínimo
 * 3 camadas). Reconstruído na rodada 1 a partir da review em
 * `shots/reviews/r0_baseline.md`, que apontou dois defeitos:
 *
 * 1. As camadas eram festões idênticos igualmente espaçados — o olho
 *    trava no período em menos de um segundo. Nenhum fundo de Neo Geo
 *    repete um arco assim. Agora cada silhueta é a soma de senoides de
 *    períodos incomensuráveis mais jitter por índice, o que dá período
 *    aparente longo demais pra ser percebido.
 * 2. A camada distante era uma cor sólida só, "verde mais claro". Isso
 *    não é perspectiva atmosférica: distância em arte 16/32-bit se faz
 *    dessaturando em direção à cor do céu E comprimindo a faixa de
 *    valor. Agora cada camada declara o quanto se dissolve no céu.
 *
 * Valores autorados em tom médio de propósito — o grade (`config/grade.ts`)
 * é quem faz o escurecimento e o split tone. Autorar já escuro empilharia
 * as duas coisas e fecharia a sombra em preto morto.
 */

export interface ParallaxLayer {
  /** Cor base da camada, antes da dissolução atmosférica. */
  color: number;
  /** 0 = fixo com a câmera, 1 = acompanha o mundo. Maior = mais perto. */
  scrollFactorX: number;
  /** Altura da linha de base, em fração da altura da viewport. */
  baselineRatio: number;
  /** Amplitude do relevo, em pixels. */
  amplitude: number;
  /** Os três períodos da silhueta, em px. Não podem ser múltiplos entre si. */
  periods: readonly [number, number, number];
  /** 0 = cor pura, 1 = dissolvida na cor do horizonte. Perspectiva atmosférica. */
  haze: number;
  /** Densidade de copas na crista. 0 = crista lisa (serra), >0 = mata. */
  canopy: number;
}

export const FOREST_PARALLAX = {
  sky: {
    /** Topo frio — o céu não é fonte de alegria neste mundo. */
    top: 0x4a5468,
    /** Horizonte pálido e adoentado: é ele que silhueta as camadas. */
    horizon: 0xdde2cb,
    /** Onde o gradiente chega ao tom de horizonte. */
    horizonRatio: 0.62,
  },
  /** Névoa baixa que assenta as camadas no chão em vez de empilhá-las. */
  fog: {
    color: 0xdde2cb,
    /** Fração da viewport onde a névoa começa a somar. */
    startRatio: 0.44,
    strength: 0.24,
  },
  layers: [
    {
      color: 0xa8b39c,
      scrollFactorX: 0.16,
      baselineRatio: 0.5,
      amplitude: 17,
      periods: [263, 97, 41],
      haze: 0.72,
      canopy: 0,
    },
    {
      color: 0x64714f,
      scrollFactorX: 0.3,
      baselineRatio: 0.58,
      amplitude: 14,
      periods: [197, 73, 31],
      haze: 0.42,
      canopy: 0.35,
    },
    {
      color: 0x36432c,
      scrollFactorX: 0.5,
      baselineRatio: 0.68,
      amplitude: 11,
      periods: [149, 59, 23],
      haze: 0.14,
      canopy: 0.8,
    },
    {
      color: 0x121711,
      scrollFactorX: 0.78,
      baselineRatio: 0.79,
      amplitude: 8,
      periods: [113, 43, 19],
      haze: 0,
      canopy: 1,
    },
  ] as readonly ParallaxLayer[],
};
