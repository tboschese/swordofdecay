/**
 * PRNG LOCAL, de proposito — nao o `rng` global de engine/rng.ts.
 *
 * O construtor sorteia ~1100 valores pra semear os campos de grao. Feito
 * no rng global, isso deslocaria o fluxo compartilhado e TODA captura
 * anterior deixaria de ser comparavel: continuariam deterministicas, mas
 * o conteudo mudaria por um efeito colateral de inicializacao de outro
 * modulo. O proprio agente que escreveu este arquivo apontou o risco.
 *
 * Com estado proprio e semente fixa, a atmosfera e reproduzivel e nao
 * interfere em ninguem.
 */
function makeLocalRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const localRandom = makeLocalRng(0x5eeda700);
import {
  DEFAULT_WEATHER,
  FOREST_ATMOSPHERE,
  WEATHER,
  type HazeSpec,
  type MoteLayer,
  type ShaftSpec,
  type WeatherPreset,
} from "../config/atmosphere";

/**
 * ATMOSFERA — o volume de ar entre a câmera e o cenário.
 *
 * A cena da rodada 8 tinha parallax, névoa baixa, grade e vinheta, e
 * ainda assim lia como recortes bem espaçados. O motivo é que TUDO
 * estava no plano do cenário: nada ocupava o intervalo entre a lente e a
 * primeira camada. Perspectiva aérea de verdade precisa de matéria no
 * meio do caminho — é ela que dá escala, porque o olho mede distância
 * pela diferença de velocidade entre coisas que passam.
 *
 * Este módulo NÃO desenha cenário e NÃO sabe o que tem embaixo. Ele só
 * responde: "o que está suspenso no ar, e como a luz o atravessa".
 *
 * Contrato de desenho (dois pontos, porque profundidade exige os dois):
 *   · `renderBack`  — depois do parallax, ANTES do tilemap. Poeira que
 *     está lá no vão entre as árvores distantes. Se isso fosse desenhado
 *     por cima, o grão apareceria na frente do tronco que deveria
 *     escondê-lo, e a ilusão morre na hora.
 *   · `renderFront` — depois de tudo, ANTES da grade. Feixes, névoa
 *     frontal, o grão colado na lente, o clima. Vem antes da grade
 *     porque a grade é quem UNIFICA: atmosfera desenhada por cima dela
 *     lê como overlay de interface, não como ar do mundo.
 *
 * DETERMINISMO (o harness de `shots/` exige PNG byte-idêntico com a
 * mesma seed): todo o estado aleatório é sorteado UMA VEZ no construtor,
 * via `rng` de engine/rng.ts. Depois disso, a posição de cada grão é
 * função pura de (constantes do grão, tempo acumulado). Nada de
 * `Math.random()`, nada de `Date.now()`, e nada de integração
 * incremental por partícula — integrar acumula erro e faz duas
 * execuções divergirem em ponto flutuante.
 *
 * A quantidade de sorteios no construtor NÃO depende do clima: os
 * arrays são alocados no pior caso e o preset só corta quantos são
 * desenhados. Assim trocar de clima não desloca o fluxo do RNG e não
 * muda o resto da cena.
 *
 * ORÇAMENTO: alvo < 0.4ms a 384x224. O que é caro (gradiente com
 * borda suave, banco de névoa) é RASTERIZADO UMA VEZ em canvas
 * offscreen no construtor e depois é só `drawImage`. Por frame sobram
 * ~150 fillRect de 1-2px e um stroke de path único pra chuva.
 */

/* ------------------------------------------------------------------ *
 * Utilitários                                                         *
 * ------------------------------------------------------------------ */

/** Módulo que devolve resultado positivo (o `%` de JS não devolve). */
function wrap(value: number, size: number): number {
  const r = value % size;
  return r < 0 ? r + size : r;
}

function rgbOf(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function cssOf(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

/**
 * Matriz de Bayer 4x4. Gradiente de 8 bits numa faixa de alfa baixa
 * gera degrau visível — e degrau em arte de pixel lê como bug, não como
 * suavidade. O dither ordenado quebra o degrau com padrão regular, que é
 * exatamente como o hardware da época resolvia isso.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Borda suave simétrica: 0 nas pontas, 1 no centro, sem canto duro. */
function smoothEdge(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const s = u * u * (3 - 2 * u);
  return s;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* ------------------------------------------------------------------ *
 * Estado por grão — sorteado no construtor, imutável depois           *
 * ------------------------------------------------------------------ */

interface Mote {
  bx: number;
  by: number;
  phase: number;
  /** Multiplicador de alfa por grão: sem isso a camada lê como fileira. */
  alphaMul: number;
}

interface Drop {
  bx: number;
  by: number;
  /** Variação de comprimento — chuva fina não tem risco de tamanho único. */
  lenMul: number;
}

/* ------------------------------------------------------------------ */

export class Atmosphere {
  private readonly cfg: typeof FOREST_ATMOSPHERE;
  private weather: WeatherPreset;
  private weatherName: string;

  /** Um array de grãos por camada, na mesma ordem de `cfg.motes`. */
  private readonly motes: Mote[][] = [];
  private readonly drops: Drop[] = [];

  /** Feixes pré-rasterizados: um canvas por feixe. */
  private shaftSprites: HTMLCanvasElement[] = [];
  private shaftX: number[] = [];
  private shaftPhase: number[] = [];

  private hazeSprite: HTMLCanvasElement | null = null;

  /** Tempo acumulado, em segundos. Única fonte de animação. */
  private t = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    cfg: typeof FOREST_ATMOSPHERE = FOREST_ATMOSPHERE,
    weatherName: string = DEFAULT_WEATHER,
  ) {
    this.cfg = cfg;
    this.weatherName = weatherName;
    this.weather = WEATHER[weatherName] ?? WEATHER[DEFAULT_WEATHER]!;

    // Pior caso de contagem entre TODOS os climas: alocar aqui mantém o
    // número de sorteios constante e o RNG alinhado seja qual for o preset.
    let maxMoteScale = 1;
    let maxDrops = 0;
    for (const w of Object.values(WEATHER)) {
      if (w.moteCountScale > maxMoteScale) maxMoteScale = w.moteCountScale;
      if (w.rain && w.rain.count > maxDrops) maxDrops = w.rain.count;
    }

    for (const layer of cfg.motes) {
      const n = Math.ceil(layer.count * maxMoteScale);
      const arr: Mote[] = [];
      for (let i = 0; i < n; i++) {
        arr.push({
          bx: localRandom() * layer.fieldW,
          by: localRandom() * layer.fieldH,
          phase: localRandom() * Math.PI * 2,
          // 0.55-1.0: alguns grãos quase invisíveis dão a impressão de
          // que a nuvem de poeira continua além do que dá pra resolver.
          alphaMul: 0.55 + localRandom() * 0.45,
        });
      }
      this.motes.push(arr);
    }

    for (let i = 0; i < maxDrops; i++) {
      this.drops.push({
        bx: localRandom(),
        by: localRandom(),
        lenMul: 0.6 + localRandom() * 0.7,
      });
    }

    for (let i = 0; i < cfg.shafts.count; i++) {
      this.shaftPhase.push(localRandom() * Math.PI * 2);
    }

    this.rebuild();
  }

  /** Nome do clima ativo — útil pro dev overlay / dashboard. */
  get weatherLabel(): string {
    return this.weather.label;
  }

  /**
   * Troca o clima. É a operação ORTOGONAL do DESIGN.md §2.2: nada do
   * cenário é tocado, só o que existe suspenso no ar e como a luz passa
   * por ele. Re-rasteriza os sprites porque largura de feixe e banco de
   * névoa são propriedades do preset.
   */
  setWeather(name: string): void {
    const preset = WEATHER[name];
    if (!preset || name === this.weatherName) return;
    this.weatherName = name;
    this.weather = preset;
    this.rebuild();
  }

  update(deltaMs: number): void {
    this.t += deltaMs / 1000;
  }

  /* ---------------------------------------------------------------- *
   * Rasterização única                                               *
   * ---------------------------------------------------------------- */

  private rebuild(): void {
    this.buildShafts();
    this.hazeSprite = this.weather.haze ? this.buildHaze(this.weather.haze) : null;
  }

  /**
   * Cada feixe vira um sprite com a queda de intensidade já embutida —
   * suave na largura (é luz difusa, não tem borda) e desaparecendo pra
   * baixo (o feixe se dissolve no ar denso perto do chão). Fazer isso a
   * cada frame com createLinearGradient custaria mais que o resto do
   * módulo inteiro somado.
   */
  private buildShafts(): void {
    const spec: ShaftSpec = this.cfg.shafts;
    const [r, g, b] = rgbOf(spec.color);
    const H = this.height;
    const top = Math.round(spec.topRatio * H);
    const bottom = Math.round(spec.bottomRatio * H);
    const span = Math.max(1, bottom - top);

    this.shaftSprites = [];
    this.shaftX = [];

    for (let i = 0; i < spec.count; i++) {
      // Jitter determinístico por índice (função do índice, não estado):
      // dois feixes de mesma largura igualmente espaçados leem como
      // listra de papel de parede.
      const j = Math.sin(i * 12.9898) * 43758.5453;
      const jitter = j - Math.floor(j);
      const w = Math.max(4, (spec.widthPx + (jitter - 0.5) * spec.widthJitter) * this.weather.shaftWidthScale);
      const drift = Math.abs(spec.tilt) * span;
      const cw = Math.ceil(w + drift) + 2;

      const canvas = makeCanvas(cw, H);
      const c2d = canvas.getContext("2d")!;
      const img = c2d.createImageData(canvas.width, H);
      const data = img.data;

      const peak = Math.min(0.95, Math.max(0.05, spec.peakRatio));
      for (let y = top; y < bottom; y++) {
        const v = (y - top) / span;
        // Acende descendo (o ar engrossa) e morre antes do chão. O pico
        // fica em `peakRatio` porque é lá que o feixe cruza matéria
        // escura — sobre o céu pálido ele não teria contra o que existir.
        const vertical = smoothEdge(v / peak) * (1 - smoothEdge((v - peak) / (1 - peak)));
        if (vertical <= 0) continue;
        const cx = (spec.tilt < 0 ? drift : 0) + spec.tilt * (y - top) + w * 0.5;
        const half = w * 0.5;
        const x0 = Math.max(0, Math.floor(cx - half));
        const x1 = Math.min(canvas.width, Math.ceil(cx + half));
        for (let x = x0; x < x1; x++) {
          const u = Math.abs(x + 0.5 - cx) / half;
          const lateral = 1 - smoothEdge(u);
          const a = vertical * lateral * lateral;
          if (a <= 0.002) continue;
          const dither = (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
          const alpha = Math.min(255, Math.floor(a * 255 + dither));
          if (alpha <= 0) continue;
          const p = (y * canvas.width + x) * 4;
          data[p] = r;
          data[p + 1] = g;
          data[p + 2] = b;
          data[p + 3] = alpha;
        }
      }
      c2d.putImageData(img, 0, 0);
      this.shaftSprites.push(canvas);
      // Espaçamento irregular pela mesma razão do jitter de largura.
      this.shaftX.push((i + jitter * 0.7) * (spec.fieldW / spec.count));
    }
  }

  /**
   * Banco de névoa FRONTAL. A largura é fixa em 512 e todas as senoides
   * da borda têm período inteiro dentro dela — assim as duas cópias
   * lado a lado emendam sem costura visível quando a câmera anda.
   */
  private buildHaze(haze: HazeSpec): HTMLCanvasElement {
    const W = 512;
    const H = this.height;
    const [r, g, b] = rgbOf(haze.color);
    const top = haze.topRatio * H;
    const bottom = haze.bottomRatio * H;
    const canvas = makeCanvas(W, H);
    const c2d = canvas.getContext("2d")!;
    const img = c2d.createImageData(W, H);
    const data = img.data;

    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2;
      // Três harmônicos incomensuráveis entre si dentro da largura: a
      // borda ondula sem que o olho ache o período.
      const edge =
        Math.sin(u) * 0.5 + Math.sin(u * 3 + 1.7) * 0.32 + Math.sin(u * 7 + 0.4) * 0.18;
      const yTop = top + edge * haze.waveAmp;
      const span = Math.max(1, bottom - yTop);
      for (let y = Math.max(0, Math.floor(yTop)); y < H; y++) {
        const v = (y - yTop) / span;
        // Adensa pra baixo: névoa é mais pesada perto do chão.
        const a = smoothEdge(v / 0.45) * (0.45 + 0.55 * Math.min(1, v));
        if (a <= 0.002) continue;
        const dither = (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
        const alpha = Math.min(255, Math.floor(a * 255 + dither));
        if (alpha <= 0) continue;
        const p = (y * W + x) * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = alpha;
      }
    }
    c2d.putImageData(img, 0, 0);
    return canvas;
  }

  /* ---------------------------------------------------------------- *
   * Desenho                                                          *
   * ---------------------------------------------------------------- */

  /** Poeira distante — depois do parallax, antes do tilemap. */
  renderBack(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
    this.drawMotes(ctx, viewX, viewY, true);
  }

  /** Feixes, névoa frontal, grão perto da lente e clima. Antes da grade. */
  renderFront(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
    this.drawShafts(ctx, viewX);
    this.drawHaze(ctx, viewX);
    this.drawMotes(ctx, viewX, viewY, false);
    this.drawRain(ctx, viewX);
    this.drawVeil(ctx);
  }

  private drawMotes(
    ctx: CanvasRenderingContext2D,
    viewX: number,
    viewY: number,
    behind: boolean,
  ): void {
    const t = this.t;
    const alphaScale = this.weather.moteAlphaScale;
    const countScale = this.weather.moteCountScale;
    const prevAlpha = ctx.globalAlpha;

    for (let li = 0; li < this.cfg.motes.length; li++) {
      const layer: MoteLayer = this.cfg.motes[li]!;
      if (layer.behindWorld !== behind) continue;
      const pool = this.motes[li]!;
      const n = Math.min(pool.length, Math.round(layer.count * countScale));
      if (n <= 0) continue;

      ctx.fillStyle = cssOf(layer.color);
      const size = layer.sizePx;
      const streak = layer.streakPx;
      const swayW = (Math.PI * 2 * 1000) / layer.swayPeriodMs;
      const baseAlpha = layer.alpha * alphaScale;
      const camX = viewX * layer.scrollFactorX;
      const camY = viewY * layer.scrollFactorY;

      for (let i = 0; i < n; i++) {
        const m = pool[i]!;
        const s = Math.sin(t * swayW + m.phase);
        const wx = m.bx + layer.driftX * t + s * layer.swayAmp;
        const wy = m.by + layer.driftY * t + Math.cos(t * swayW * 0.7 + m.phase) * layer.swayAmp * 0.4;
        const sx = wrap(wx - camX, layer.fieldW);
        if (sx > this.width) continue;
        const sy = wrap(wy - camY, layer.fieldH);
        if (sy > this.height) continue;
        // Cintilação: o grão gira e pega luz de forma desigual. Sem isso
        // a camada inteira pisca junto ou não pisca — as duas leem mal.
        const a = baseAlpha * m.alphaMul * (1 - layer.twinkle * 0.5 + layer.twinkle * 0.5 * s);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        // Rastro atrás da deriva: alonga o grão no eixo em que ele anda.
        // É o que faz a camada próxima ser reconhecível num frame parado.
        ctx.fillRect(Math.round(sx) - (layer.driftX > 0 ? streak : 0), Math.round(sy), size + streak, size);
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  /**
   * Os feixes entram em `source-over`, não em aditivo. Numa cena
   * ENCOBERTA a luz que chega já está espalhada pelo próprio ar: o efeito
   * físico é a imagem tender à cor do espalhamento, que é exatamente o
   * que source-over faz. Aditivo daria estouro branco no céu (que já está
   * em 0.87 de valor) e a cena perderia o topo da faixa tonal.
   */
  private drawShafts(ctx: CanvasRenderingContext2D, viewX: number): void {
    const spec = this.cfg.shafts;
    const alpha = spec.alpha * this.weather.shaftAlphaScale;
    if (alpha <= 0.004 || this.shaftSprites.length === 0) return;
    const prevAlpha = ctx.globalAlpha;
    const breatheW = (Math.PI * 2 * 1000) / spec.breathePeriodMs;
    const camX = viewX * spec.scrollFactorX;

    for (let i = 0; i < this.shaftSprites.length; i++) {
      const sprite = this.shaftSprites[i]!;
      const breathe = 1 + Math.sin(this.t * breatheW + this.shaftPhase[i]!) * spec.breatheAmt;
      const a = alpha * breathe;
      if (a <= 0.004) continue;
      const x = wrap(this.shaftX[i]! - camX, spec.fieldW) - sprite.width;
      ctx.globalAlpha = a;
      // Duas cópias: o campo (520) é maior que a viewport (384), então
      // uma das duas sempre cobre a tela e a emenda acontece fora dela.
      ctx.drawImage(sprite, Math.round(x), 0);
      ctx.drawImage(sprite, Math.round(x + spec.fieldW), 0);
    }
    ctx.globalAlpha = prevAlpha;
  }

  private drawHaze(ctx: CanvasRenderingContext2D, viewX: number): void {
    const haze = this.weather.haze;
    const sprite = this.hazeSprite;
    if (!haze || !sprite) return;
    const prevAlpha = ctx.globalAlpha;
    const bobW = (Math.PI * 2 * 1000) / haze.wavePeriodMs;
    const bob = Math.round(Math.sin(this.t * bobW) * 2);
    const shift = viewX * haze.scrollFactorX - this.t * haze.driftX;
    const x = -wrap(shift, sprite.width);
    ctx.globalAlpha = haze.alpha;
    ctx.drawImage(sprite, Math.round(x), bob);
    ctx.drawImage(sprite, Math.round(x + sprite.width), bob);
    ctx.globalAlpha = prevAlpha;
  }

  /**
   * Todos os riscos num único path e um `stroke` só. 110 chamadas de
   * stroke separadas apareceriam no orçamento; uma não aparece.
   */
  private drawRain(ctx: CanvasRenderingContext2D, viewX: number): void {
    const rain = this.weather.rain;
    if (!rain) return;
    const n = Math.min(this.drops.length, rain.count);
    if (n <= 0) return;

    const W = this.width;
    const H = this.height;
    const fallH = H + 40;
    const fieldW = W + 60;
    const camX = viewX * rain.scrollFactorX;
    const drop = rain.speed * this.t;

    ctx.save();
    ctx.strokeStyle = cssOf(rain.color);
    ctx.globalAlpha = rain.alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = this.drops[i]!;
      const y = wrap(d.by * fallH + drop, fallH) - 20;
      const x = wrap(d.bx * fieldW + drop * rain.slant - camX, fieldW) - 30;
      const len = rain.lengthPx * d.lenMul;
      // +0.5 mantém a linha de 1px centrada no pixel; sem isso o Canvas
      // divide a cobertura entre duas colunas e o risco fica cinza-borrão.
      const px = Math.round(x) + 0.5;
      const py = Math.round(y) + 0.5;
      ctx.moveTo(px, py);
      ctx.lineTo(px + len * rain.slant, py + len);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Véu de temperatura. Última coisa antes da grade. */
  private drawVeil(ctx: CanvasRenderingContext2D): void {
    const veil = this.weather.veil;
    if (!veil || veil.alpha <= 0) return;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = veil.alpha;
    ctx.fillStyle = cssOf(veil.color);
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = prevAlpha;
  }
}
