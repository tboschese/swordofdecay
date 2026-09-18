/**
 * Rim light por detecção de borda no alpha.
 *
 * O problema que isto resolve, medido: depois do grade a cena ficou com
 * 0.1% dos pixels nas altas — sem specular nenhum. A rubrica §2 do
 * AAA_BRIEF exige preto real, massa média E brilho quente pequeno, e o
 * terceiro não existia. Além disso o guerreiro lia escuro contra chão
 * escuro, sem separação de valor.
 *
 * Rim light resolve os dois de uma vez, e é como arte 2D de verdade
 * separa personagem de fundo desde sempre: uma linha fina de luz na
 * borda voltada pra fonte. Em Neo Geo isso é quase obrigatório em cena
 * escura — sem ela o sprite afunda no cenário.
 *
 * A técnica é genérica: opera no ALPHA do buffer, não no desenho. Não
 * precisa saber nada sobre como o personagem foi construído, e por isso
 * serve igual pra inimigos e objetos.
 *
 * Regra de ofício: **o rim tem que variar de intensidade ao longo da
 * borda.** Um contorno de largura e brilho constantes lê como stroke de
 * vetor, não como luz. Aqui a intensidade cai conforme a normal da borda
 * se afasta da direção da luz.
 */

export interface RimConfig {
  /** Direção da luz em espaço de tela. Y negativo = vindo de cima. */
  dir: readonly [number, number];
  color: readonly [number, number, number];
  /** 0..1 — quanto o rim substitui a cor original na borda. */
  strength: number;
  /** Espessura em pixels do buffer. */
  width: number;
}

/** Luz do céu: vem de cima e um pouco de trás, fria e pálida. */
export const SKY_RIM: RimConfig = {
  dir: [0.32, -0.95],
  color: [232, 240, 220],
  strength: 0.85,
  width: 2,
};

/**
 * Aplica o rim in-place no contexto do buffer. Chamar depois de desenhar
 * o personagem e antes de blitar pra tela.
 */
export function applyRimLight(ctx: CanvasRenderingContext2D, w: number, h: number, cfg: RimConfig): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [lx, ly] = cfg.dir;
  const [cr, cg, cb] = cfg.color;

  // Cópia só do canal alpha: precisamos testar contra o alpha ORIGINAL,
  // senão pixels já iluminados nesta passada contaminam os vizinhos e o
  // rim engorda descontroladamente.
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3]!;

  const opaque = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && alpha[y * w + x]! > 128;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i]! <= 128) continue;

      // Normal da borda: aponta pro lado vazio. Somar as direções vazias
      // dá uma normal aproximada sem precisar de gradiente completo.
      let nx = 0, ny = 0;
      for (let k = 1; k <= cfg.width; k++) {
        if (!opaque(x, y - k)) ny -= 1;
        if (!opaque(x, y + k)) ny += 1;
        if (!opaque(x - k, y)) nx -= 1;
        if (!opaque(x + k, y)) nx += 1;
      }
      if (nx === 0 && ny === 0) continue; // interior, não é borda

      const len = Math.hypot(nx, ny);
      const dot = (nx / len) * lx + (ny / len) * ly;
      if (dot <= 0) continue; // borda virada pro lado oposto à luz

      // Distância até o vazio, na direção da normal: o rim afina.
      let dist = cfg.width;
      for (let k = 1; k <= cfg.width; k++) {
        if (!opaque(x + Math.round((nx / len) * k), y + Math.round((ny / len) * k))) {
          dist = k;
          break;
        }
      }
      const falloff = 1 - (dist - 1) / cfg.width;
      const k = cfg.strength * dot * dot * falloff;
      if (k <= 0.01) continue;

      const p = i * 4;
      d[p] = d[p]! + (cr - d[p]!) * k;
      d[p + 1] = d[p + 1]! + (cg - d[p + 1]!) * k;
      d[p + 2] = d[p + 2]! + (cb - d[p + 2]!) * k;
    }
  }

  ctx.putImageData(img, 0, 0);
}
