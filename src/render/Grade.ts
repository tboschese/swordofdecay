import type { GradePreset } from "../config/grade";
import { rng } from "../engine/rng";

/**
 * Passe de grade (pós-processamento) em canvas 2D puro.
 *
 * Por que CPU e não WebGL: a resolução lógica é 384x224 = 86k pixels, e o
 * passe completo foi medido em 0.62ms (3.7% do orçamento de 60fps). Ver
 * `PIXI.md` — migrar o renderer pra GPU por causa disso não se paga.
 *
 * Ordem das operações, que importa:
 *   1. extrai brilho e borra em 1/4 de resolução  (bloom)
 *   2. exposição -> curva em S -> dessaturação     (via LUT, 1x por preset)
 *   3. split tone por luminância                   (frio na sombra, quente na luz)
 *   4. vinheta + bloom aditivo + grão
 *
 * Tudo que não depende do frame (LUT da curva, máscara de vinheta) é
 * pré-computado uma vez e reaproveitado — é o que mantém o custo baixo.
 */
export class Grade {
  private readonly width: number;
  private readonly height: number;
  private preset: GradePreset;

  private curve = new Uint8Array(256);
  private vignetteMask: Float32Array;
  private grainField: Int8Array;

  private readonly bloomW: number;
  private readonly bloomH: number;
  private readonly bloomA: Float32Array;
  private readonly bloomB: Float32Array;

  private frame = 0;

  constructor(width: number, height: number, preset: GradePreset) {
    this.width = width;
    this.height = height;
    this.preset = preset;

    this.bloomW = width >> 2;
    this.bloomH = height >> 2;
    this.bloomA = new Float32Array(this.bloomW * this.bloomH * 3);
    this.bloomB = new Float32Array(this.bloomW * this.bloomH * 3);

    this.vignetteMask = new Float32Array(width * height);
    this.grainField = new Int8Array(width * height);

    this.rebuild();
  }

  setPreset(preset: GradePreset): void {
    this.preset = preset;
    this.rebuild();
  }

  /** Recalcula tudo que depende só do preset — chamado na troca, não por frame. */
  private rebuild(): void {
    const p = this.preset;

    for (let i = 0; i < 256; i++) {
      let v = (i / 255) * p.exposure;
      // curva em S ancorada no pivot: comprime sombra, expande meio-tom
      const t = v < p.pivot ? v / p.pivot : (v - p.pivot) / (1 - p.pivot);
      const s = t * t * (3 - 2 * t); // smoothstep
      const curved = v < p.pivot ? s * p.pivot : p.pivot + s * (1 - p.pivot);
      v = v + (curved - v) * p.contrast;
      v = p.lift + v * (1 - p.lift);
      this.curve[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }

    const cx = this.width / 2, cy = this.height / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const k = Math.max(0, (d - p.vignetteInner) / (1 - p.vignetteInner));
        this.vignetteMask[y * this.width + x] = 1 - p.vignette * k * k;
      }
    }

    // Grão fixo: campo estático deslocado por frame. Regerar ruído a cada
    // frame custa caro e cintila; deslocar um campo pronto não.
    // `rng`, não Math.random — o harness de captura exige que dois runs
    // com a mesma seed deem PNG byte-idêntico (ver shots/).
    for (let i = 0; i < this.grainField.length; i++) {
      this.grainField[i] = Math.round((rng.random() * 2 - 1) * 127);
    }
  }

  /** Aplica o grade in-place no contexto. Chamar depois do mundo, antes do HUD. */
  apply(ctx: CanvasRenderingContext2D): void {
    const p = this.preset;
    const { width: w, height: h } = this;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // ---- 1. mapeamento tonal, in-place
    // Tem que vir ANTES do bloom: extrair brilho dos valores originais faz
    // um céu claro alimentar o bloom como se fosse specular, e a cena
    // inteira estoura. O bloom mora depois da curva, sempre.
    const curve = this.curve;
    const [stR, stG, stB] = p.shadowTint;
    const [htR, htG, htB] = p.highlightTint;
    for (let i = 0; i < w * h; i++) {
      const s = i * 4;
      let r = curve[d[s]!]!, g = curve[d[s + 1]!]!, b = curve[d[s + 2]!]!;
      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      r = lum + (r - lum) * p.saturation;
      g = lum + (g - lum) * p.saturation;
      b = lum + (b - lum) * p.saturation;
      const t = lum / 255;
      const sh = (1 - t) * (1 - t);
      const hi = t * t;
      r += stR * sh + htR * hi;
      g += stG * sh + htG * hi;
      b += stB * sh + htB * hi;
      d[s] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[s + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[s + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }

    // ---- 2. bloom: extrai brilho em 1/4 de resolução, já mapeado
    const bw = this.bloomW, bh = this.bloomH;
    const A = this.bloomA, B = this.bloomB;
    A.fill(0);
    const thr = p.bloomThreshold * 255;
    if (p.bloomStrength > 0) {
      for (let y = 0; y < h; y++) {
        const by = (y >> 2) * bw;
        for (let x = 0; x < w; x++) {
          const s = (y * w + x) * 4;
          const lum = (d[s]! * 77 + d[s + 1]! * 150 + d[s + 2]! * 29) >> 8;
          if (lum > thr) {
            const k = (lum - thr) / (255 - thr) / 16; // /16 = média da caixa 4x4
            const b = (by + (x >> 2)) * 3;
            A[b]! += d[s]! * k;
            A[b + 1]! += d[s + 1]! * k;
            A[b + 2]! += d[s + 2]! * k;
          }
        }
      }
      // blur separável no buffer pequeno (horizontal, depois vertical)
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const o = (y * bw + x) * 3;
          const l = (y * bw + Math.max(0, x - 1)) * 3;
          const r = (y * bw + Math.min(bw - 1, x + 1)) * 3;
          for (let c = 0; c < 3; c++) B[o + c] = (A[l + c]! + 2 * A[o + c]! + A[r + c]!) * 0.25;
        }
      }
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const o = (y * bw + x) * 3;
          const u = (Math.max(0, y - 1) * bw + x) * 3;
          const dn = (Math.min(bh - 1, y + 1) * bw + x) * 3;
          for (let c = 0; c < 3; c++) A[o + c] = (B[u + c]! + 2 * B[o + c]! + B[dn + c]!) * 0.25;
        }
      }
    }

    // ---- 3. composite: vinheta + bloom + grão
    const vig = this.vignetteMask;
    const grain = this.grainField;
    const gOff = (this.frame * 7919) % grain.length;
    const bloomK = p.bloomStrength;

    for (let y = 0; y < h; y++) {
      // Upsample bilinear do buffer de bloom. Amostragem por vizinho mais
      // próximo deixa blocos 4x4 visíveis no céu — o artefato que apareceu
      // na primeira versão deste passe.
      const fy = Math.min(bh - 1.001, Math.max(0, (y - 2) / 4));
      const y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1);
      const wy = fy - y0;

      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const s = i * 4;
        let r = d[s]!, g = d[s + 1]!, b = d[s + 2]!;

        const v = vig[i]!;
        r *= v; g *= v; b *= v;

        if (bloomK > 0) {
          const fx = Math.min(bw - 1.001, Math.max(0, (x - 2) / 4));
          const x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1);
          const wx = fx - x0;
          const i00 = (y0 * bw + x0) * 3, i10 = (y0 * bw + x1) * 3;
          const i01 = (y1 * bw + x0) * 3, i11 = (y1 * bw + x1) * 3;
          for (let c = 0; c < 3; c++) {
            const top = A[i00 + c]! * (1 - wx) + A[i10 + c]! * wx;
            const bot = A[i01 + c]! * (1 - wx) + A[i11 + c]! * wx;
            const val = (top * (1 - wy) + bot * wy) * bloomK;
            if (c === 0) r += val; else if (c === 1) g += val; else b += val;
          }
        }

        if (p.grain > 0) {
          const n = (grain[(i + gOff) % grain.length]! / 127) * p.grain;
          r += n; g += n; b += n;
        }

        d[s] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[s + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[s + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }

    ctx.putImageData(img, 0, 0);
    this.frame++;
  }
}
