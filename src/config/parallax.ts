/**
 * Parallax "forest" desenhado por código (Phaser Graphics), não por
 * imagem — evita depender de outro asset pack pra combinar de cor com o
 * tileset (paleta amostrada de `tileset.png`: grama #72BF7B, terra
 * #B48B3F). 3 camadas com scrollFactorX crescente = mais perto = mais
 * rápido (DESIGN.md §2.2).
 */
export const FOREST_PARALLAX = {
  sky: {
    color: 0xd8f3e6,
    scrollFactorX: 0.1,
    depth: -30,
  },
  hills: {
    color: 0x7fae86,
    scrollFactorX: 0.35,
    depth: -20,
    amplitude: 14,
    period: 140,
    baselineRatio: 0.55,
  },
  trees: {
    color: 0x3f7a52,
    scrollFactorX: 0.6,
    depth: -10,
    radius: 18,
    spacing: 46,
    baselineRatio: 0.72,
  },
};
