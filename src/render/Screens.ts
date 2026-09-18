/**
 * Telas de produto: TITULO, VITORIA e DERROTA. Modulo m7.
 *
 * Antes disto o jogo tinha uma faixa central de duas linhas de monospace
 * para "FASE CONCLUIDA" e "VOCE CAIU", e nenhuma tela de titulo. Um jogo
 * sem tela de titulo nao e produto, e build de dev: e a primeira coisa
 * que o jogador ve e a unica que ele ve antes de decidir se joga.
 *
 * Regras de oficio aplicadas aqui:
 *
 * **384x224 e um cartaz, nao uma caixa de dialogo.** A tela de titulo usa
 * a altura inteira: ceu, lua corroida, silhueta de mata morta, bloco
 * tipografico grande, prompt, rodape. Uma caixa centralizada de 52px de
 * altura em 224 desperdicia 76% do cartaz.
 *
 * **Tipografia de verdade, sem asset.** As fontes do sistema (serifada
 * pra display, monospace pra corpo) sao rasterizadas num canvas
 * auxiliar, e o alpha e LIMIARIZADO — vira mascara 1-bit. Isso mata o
 * antialias cinza que denuncia "texto de navegador em cima de pixel art".
 * Sobre a mascara vem sombreamento de 3 tons + luz de topo + contorno de
 * 1px, o mesmo criterio de tile do DESIGN.md §2.1.
 *
 * **A podridao come as letras.** A erosao das glifos e o motivo visual do
 * jogo, nao enfeite: The Rot corroi carne, pedra e MEMORIA — o nome do
 * jogo apodrecendo na propria tela de titulo e a tese em uma imagem. A
 * intensidade separa os tres estados: titulo come pouco (Regiao 1 e
 * estranhamento, nao fim do mundo), vitoria quase nada, derrota come
 * fundo.
 *
 * **Erosao e MANCHA, nunca ponto.** Toda decadencia desta tela — letra,
 * lua e moldura da derrota — sai da mesma funcao `decayField`: ruido de
 * valor de baixa frequencia, com nucleo opaco e franja que perde valor
 * antes de sumir. Sorteio por pixel foi tentado e reprovado: produz
 * sal-e-pimenta, cada sobrevivente vira ilha cercada de contorno, e o
 * conjunto le como CONFETE BRILHANTE — cintilancia de alta frequencia,
 * o oposto de materia sumindo. Regra que caiu dali: nenhum pixel com
 * decadencia acima de 0.16 recebe luz, e contorno e derivado da mascara
 * ORIGINAL da letra, nunca da borda do estrago.
 *
 * **Vitoria e derrota se distinguem por TOM, nao por texto.** Vitoria
 * levanta a exposicao, esquenta o split-tone e faz a poeira SUBIR.
 * Derrota drena a saturacao do frame congelado por baixo (leitura quase
 * monocromatica), fecha a vinheta, faz cinza CAIR e deixa a corrosao
 * comer as bordas da tela pra dentro. Trocar as duas legendas de lugar
 * ainda deixaria obvio qual e qual — que e o teste.
 *
 * **Determinismo.** Nada aqui chama `Math.random()` nem `rng.random()`:
 * toda variacao vem de `hash2()`, hash inteiro puro de (x, y, sal). Nao
 * tocar no `rng` global e deliberado — o mesmo fluxo alimenta screenshake
 * e particulas, e consumir dele aqui desalinharia a captura do jogo com e
 * sem tela aberta. Mesma seed, mesmo frame, PNG byte-identico.
 *
 * Custo: os cartazes sao rasterizados UMA vez e guardados em cache; por
 * frame sobra o blit, as particulas e o piscar do prompt.
 */

type RGB = readonly [number, number, number];

export interface VictoryStats {
  /** Moedas coletadas na fase. Omitido = linha de placar nao aparece. */
  coins?: number;
}

/** Hash inteiro puro. Substitui o RNG global: deterministico e sem estado. */
function hash2(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruido 1D suavizado a partir do hash — para contornos organicos. */
function smoothNoise(t: number, salt: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash2(i, 0, salt);
  const b = hash2(i + 1, 0, salt);
  return a + (b - a) * (f * f * (3 - 2 * f));
}

/** Ruido de valor 2D, bilinear com smoothstep. Base do campo de decadencia. */
function valueNoise(x: number, y: number, scale: number, salt: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, salt);
  const b = hash2(ix + 1, iy, salt);
  const c = hash2(ix, iy + 1, salt);
  const e = hash2(ix + 1, iy + 1, salt);
  return lerp(lerp(a, b, sx), lerp(c, e, sx), sy);
}

/**
 * Campo de decadencia — MANCHA, nao ponto.
 *
 * A versao anterior sorteava pixel a pixel se a podridao comia ou nao.
 * Isso produz sal-e-pimenta: cada pixel sobrevivente vira uma ilha
 * cercada de contorno preto, e o conjunto le como CONFETE BRILHANTE — o
 * olho enxerga cintilancia de alta frequencia, nao materia sumindo. A
 * podridao de The Rot apaga inscricao: come em placas, com borda macia,
 * e o que ainda nao caiu ja perdeu valor. Por isso o campo e ruido de
 * baixa frequencia (placa de ~9px) com duas oitavas finas so pra sujar a
 * borda da placa — nunca com energia pra isolar um pixel sozinho.
 */
function decayField(x: number, y: number, salt: number): number {
  const n =
    valueNoise(x, y, 13, salt) * 0.66 +
    valueNoise(x, y, 4.2, salt + 7717) * 0.24 +
    valueNoise(x, y, 2.1, salt + 13109) * 0.10;
  // espalha o histograma: fbm de hashes uniformes se aglomera em 0.5 e o
  // resultado seria decadencia chapada em vez de placas com nucleo.
  return clamp01((n - 0.29) / 0.42);
}

function smoothstep01(t: number): number {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("contexto 2d indisponivel");
  g.imageSmoothingEnabled = false;
  return g;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Rampa de 3 tons — sombra/meio/luz, mesmo criterio dos pips do HUD. */
function ramp3(shadow: RGB, mid: RGB, light: RGB, t: number): RGB {
  if (t <= 0.5) {
    const k = t * 2;
    return [lerp(light[0], mid[0], k), lerp(light[1], mid[1], k), lerp(light[2], mid[2], k)];
  }
  const k = (t - 0.5) * 2;
  return [lerp(mid[0], shadow[0], k), lerp(mid[1], shadow[1], k), lerp(mid[2], shadow[2], k)];
}

const DISPLAY_FAMILY = '"Georgia", "Times New Roman", serif';
const BODY_FAMILY = 'monospace';

/** Estilo de uma palavra de display. `key` entra no cache. */
interface DisplayStyle {
  key: string;
  size: number;
  light: RGB;
  mid: RGB;
  shadow: RGB;
  highlight: RGB;
  outline: RGB;
  /** 0..1 — quanto a podridao come a base das letras. */
  rot: number;
  rotColor: RGB;
}

interface Glyph {
  canvas: HTMLCanvasElement;
  /** Distancia do topo do canvas ate a linha de base. */
  baseline: number;
  /** Largura da tinta (sem o padding). */
  inkW: number;
}

const PAD = 4;

let measureCtxCache: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!measureCtxCache) measureCtxCache = ctx2d(makeCanvas(8, 8));
  return measureCtxCache;
}

const glyphCache = new Map<string, Glyph>();

/**
 * Rasteriza um caractere como pixel art: limiariza o alpha da fonte do
 * sistema, sombreia em 3 tons, acende a linha de topo, come a base com
 * podridao e desenha contorno de 1px derivado da mascara ja comida.
 */
function buildGlyph(ch: string, st: DisplayStyle): Glyph {
  const cacheKey = `${ch}|${st.key}`;
  const hit = glyphCache.get(cacheKey);
  if (hit) return hit;

  const font = `bold ${st.size}px ${DISPLAY_FAMILY}`;
  const mc = measureCtx();
  mc.font = font;
  const m = mc.measureText(ch);

  const left = Math.ceil(m.actualBoundingBoxLeft ?? 0);
  const right = Math.ceil(m.actualBoundingBoxRight ?? m.width);
  const asc = Math.ceil(m.actualBoundingBoxAscent ?? st.size * 0.7);
  const desc = Math.ceil(m.actualBoundingBoxDescent ?? 0);
  const inkW = Math.max(1, left + right);
  const inkH = Math.max(1, asc + desc);

  // Folga extra embaixo pros respingos de podridao caindo da letra.
  const padBottom = PAD + Math.round(st.rot * 5);
  const w = inkW + PAD * 2;
  const h = inkH + PAD + padBottom;

  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  g.font = font;
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.fillStyle = "#ffffff";
  g.fillText(ch, PAD + left, PAD + asc);

  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  // 1. limiar: mascara 1-bit. Sem isto a letra chega com franja cinza de
  //    antialias e le como texto de navegador, nao como arte do jogo.
  //    `on` e a mascara ORIGINAL e permanece intacta ate o fim: a
  //    silhueta da letra e o que mantem o nome legivel, e tanto a luz de
  //    topo quanto o contorno sao derivados DELA, nunca do estrago. Foi
  //    exatamente o contrario disso que produziu confete na rodada
  //    anterior — contorno preto em volta de cada buraco de 1px.
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) on[i] = d[i * 4 + 3]! >= 128 ? 1 : 0;

  const inkTop = PAD;
  const inkBottom = PAD + inkH - 1;

  // 2. campo de decadencia continuo, uma placa por vez. Nao ha sorteio
  //    por pixel: `decay[i]` e a MESMA funcao suave amostrada, entao
  //    pixels vizinhos tem valores vizinhos e a podridao avanca em
  //    lingua, com nucleo e borda.
  const salt = st.size * 31 + ch.charCodeAt(0) * 7 + 101;
  const decay = new Float32Array(n);
  if (st.rot > 0) {
    for (let y = 0; y < h; y++) {
      const t = clamp01((y - inkTop) / Math.max(1, inkH - 1));
      // Sobe do CHAO da letra. A curva e agressiva de proposito: quando a
      // decadencia se espalhava parelha pelo corpo todo, o resultado lia
      // como camuflagem militar — textura decorativa distribuida, nao
      // materia sendo consumida. Erosao precisa de DIRECAO: topo intacto,
      // base comida, e o olho conclui sozinho pra onde a coisa vai.
      const weight = 0.10 + 1.25 * smoothstep01((t - 0.38) / 0.62);
      const amt = st.rot * weight;
      for (let x = 0; x < w; x++) {
        decay[y * w + x] = clamp01(amt * (0.42 + 1.18 * decayField(x, y, salt)));
      }
    }
  }

  // Limiares do campo. Entre RESIDUE e HOLE a tinta ainda esta la, mas ja
  // e so mancha: e essa faixa que faz a leitura de "inscricao se
  // apagando" em vez de "letra furada".
  const RESIDUE = 0.44;
  const HOLE = 0.74;
  const rotDeep: RGB = [st.rotColor[0] * 0.5, st.rotColor[1] * 0.52, st.rotColor[2] * 0.46];

  // 3. cor. Regra dura: NENHUM pixel com decadencia acima de 0.16 recebe
  //    luz. A luz de topo e o unico tom claro da letra; deixa-la cair
  //    perto do estrago e o que transforma podridao em purpurina.
  for (let y = 0; y < h; y++) {
    const t = clamp01((y - inkTop) / Math.max(1, inkH - 1));
    const base = ramp3(st.shadow, st.mid, st.light, t);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = i * 4;
      if (!on[i]) {
        d[s + 3] = 0;
        continue;
      }
      const dec = decay[i]!;
      if (dec >= HOLE) {
        d[s + 3] = 0;
        continue;
      }

      let col: RGB;
      let alpha = 255;
      if (dec >= RESIDUE) {
        // residuo: a materia ja caiu, sobrou sujeira. Escurece e perde
        // opacidade junto — some por VALOR, nao por recorte.
        // Em degraus: rampa continua em 384x224 le como aerografo, e
        // aerografo em pixel art denuncia a origem do desenho.
        const k = Math.round(((dec - RESIDUE) / (HOLE - RESIDUE)) * 2) / 2;
        col = [
          lerp(st.rotColor[0] * 0.78, rotDeep[0], k),
          lerp(st.rotColor[1] * 0.78, rotDeep[1], k),
          lerp(st.rotColor[2] * 0.78, rotDeep[2], k),
        ];
        // alpha em degraus: meio-tom continuo em 384x224 vira franja.
        alpha = 64 * Math.max(1, Math.round((235 - 150 * k) / 64));
      } else {
        // tinta viva, mas ja puxando pro verde morto conforme a placa
        // se aproxima. E o degrade que le como "apagando" — em 4 degraus,
        // pelo mesmo motivo do residuo.
        const k = Math.round(Math.pow(dec / RESIDUE, 2.4) * 0.95 * 3) / 3;
        const above = y > 0 ? on[i - w]! : 0;
        const below = y < h - 1 ? on[i + w]! : 0;
        let lit: RGB = base;
        if (!above && t < 0.5 && dec < 0.16) lit = st.highlight;
        else if (!below) lit = [base[0] * 0.6, base[1] * 0.6, base[2] * 0.64];
        const fade = 1 - 0.22 * k;
        col = [
          lerp(lit[0], st.rotColor[0], k) * fade,
          lerp(lit[1], st.rotColor[1], k) * fade,
          lerp(lit[2], st.rotColor[2], k) * fade,
        ];
      }
      d[s] = Math.round(col[0]);
      d[s + 1] = Math.round(col[1]);
      d[s + 2] = Math.round(col[2]);
      d[s + 3] = alpha;
    }
  }

  // 4. escorrido. O que foi comido nao vira faisca solta no ar: escorre
  //    pela coluna, colado na letra, escuro e curto. Sequencia VERTICAL
  //    contigua — um pixel isolado a 6px da letra e ruido; tres pixels
  //    em fio abaixo dela e materia caindo.
  if (st.rot > 0.2) {
    for (let x = 0; x < w; x++) {
      // pe da coluna de tinta
      let foot = -1;
      for (let y = inkBottom; y >= inkTop; y--) {
        if (on[y * w + x]) {
          foot = y;
          break;
        }
      }
      if (foot < 0) continue;
      if (decay[foot * w + x]! < 0.34) continue;
      if (hash2(x, foot, salt + 4409) > 0.34 * st.rot + 0.1) continue;
      const len = 1 + Math.round(st.rot * (1 + hash2(x, 3, salt) * 4));
      for (let k = 1; k <= len; k++) {
        const y = foot + k;
        if (y >= h) break;
        const i = y * w + x;
        const s = i * 4;
        if (on[i] || d[s + 3]! > 0) continue;
        d[s] = Math.round(rotDeep[0]);
        d[s + 1] = Math.round(rotDeep[1]);
        d[s + 2] = Math.round(rotDeep[2]);
        d[s + 3] = k === 1 ? 192 : k === 2 ? 128 : 64;
      }
    }
  }

  // 5. contorno de 1px derivado da mascara ORIGINAL — segue a silhueta da
  //    letra, nao o buraco. Onde a tinta por dentro ja apodreceu o
  //    contorno tambem enfraquece, entao a borda nao sobrevive como
  //    moldura dura em volta do vazio.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (on[i]) continue;
      const s = i * 4;
      if (d[s + 3]! > 0) continue; // escorrido ja pintado
      let near = false;
      let worst = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!on[ni]) continue;
          near = true;
          if (decay[ni]! > worst) worst = decay[ni]!;
        }
      }
      if (!near) continue;
      const a = 255 - 175 * clamp01(worst / HOLE);
      d[s] = st.outline[0];
      d[s + 1] = st.outline[1];
      d[s + 2] = st.outline[2];
      d[s + 3] = 64 * Math.max(1, Math.round(a / 64));
    }
  }

  g.putImageData(img, 0, 0);
  const glyph: Glyph = { canvas: c, baseline: PAD + asc, inkW };
  glyphCache.set(cacheKey, glyph);
  return glyph;
}

function spaceAdvance(size: number): number {
  const mc = measureCtx();
  mc.font = `bold ${size}px ${DISPLAY_FAMILY}`;
  return Math.round(mc.measureText(" ").width);
}

function wordWidth(text: string, st: DisplayStyle, tracking: number): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    total += ch === " " ? spaceAdvance(st.size) : buildGlyph(ch, st).inkW;
    if (i < text.length - 1) total += tracking;
  }
  return total;
}

/** Desenha a palavra centrada em `cx`, alinhada pela linha de base. */
function drawWord(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  baselineY: number,
  st: DisplayStyle,
  tracking: number,
): void {
  const total = wordWidth(text, st, tracking);
  let x = Math.round(cx - total / 2);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === " ") {
      x += spaceAdvance(st.size) + tracking;
      continue;
    }
    const gl = buildGlyph(ch, st);
    ctx.drawImage(gl.canvas, x - PAD, Math.round(baselineY - gl.baseline));
    x += gl.inkW + tracking;
  }
}

/**
 * Ajusta o corpo da fonte ate a palavra caber. A metrica da serifada do
 * sistema varia por maquina; sem isto o titulo estoura a margem em
 * qualquer ambiente que nao seja o do autor.
 */
function fitStyle(text: string, base: DisplayStyle, tracking: number, maxWidth: number): DisplayStyle {
  let st = base;
  while (st.size > 10 && wordWidth(text, st, tracking) > maxWidth) {
    st = { ...st, size: st.size - 2, key: `${base.key}@${st.size - 2}` };
  }
  return st;
}

/** Texto de corpo em versalete espacado, com contorno de 1px. */
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  fill: string,
  tracking: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.font = `${size}px ${BODY_FAMILY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.globalAlpha = alpha;
  const widths: number[] = [];
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const wch = ctx.measureText(text[i]!).width;
    widths.push(wch);
    total += wch + (i < text.length - 1 ? tracking : 0);
  }
  let x = Math.round(cx - total / 2);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    ctx.fillStyle = "#080a08";
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) ctx.fillText(ch, x + dx, y + dy);
      }
    }
    ctx.fillStyle = fill;
    ctx.fillText(ch, x, y);
    x += widths[i]! + tracking;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Paleta. Verde-acinzentado dessaturado e frio; ouro/vermelho so como acento.
// ---------------------------------------------------------------------------

const TITLE_STYLE: DisplayStyle = {
  key: "title",
  size: 54,
  light: [206, 202, 178],
  mid: [140, 143, 118],
  shadow: [74, 84, 66],
  highlight: [232, 230, 210],
  outline: [10, 13, 11],
  // Regiao 1 e estranhamento, nao fim do mundo: a praga ja pegou a base
  // das letras e nada mais. Se o nome do jogo estiver ilegivel na tela de
  // titulo o cartaz falhou, por mais bonita que seja a podridao.
  rot: 0.44,
  rotColor: [52, 66, 44],
};

const VICTORY_STYLE: DisplayStyle = {
  key: "victory",
  size: 34,
  light: [240, 226, 176],
  mid: [190, 162, 92],
  shadow: [110, 92, 52],
  highlight: [255, 246, 214],
  outline: [12, 12, 10],
  rot: 0.16,
  rotColor: [76, 70, 40],
};

const DEFEAT_STYLE: DisplayStyle = {
  key: "defeat",
  size: 38,
  // Mais claro que o titulo — nao por energia, mas porque o veu por baixo
  // e muito mais fechado. Sem isto a palavra afunda no proprio breu.
  // Continua sem UMA gota de calor: o que separa derrota de vitoria e
  // temperatura, e ceder um amarelo aqui embaralharia os dois estados.
  light: [176, 180, 158],
  mid: [102, 110, 90],
  shadow: [46, 54, 44],
  highlight: [202, 205, 182],
  outline: [6, 8, 7],
  rot: 0.66,
  rotColor: [40, 56, 32],
};

export class Screens {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  // -------------------------------------------------------------------------
  // TITULO
  // -------------------------------------------------------------------------

  /** @param tMs tempo desde que a tela abriu (anima prompt e esporos). */
  renderTitle(ctx: CanvasRenderingContext2D, tMs: number): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.titlePoster(), 0, 0);

    // esporos: caem devagar e derivam. Reforcam que o ar esta contaminado.
    this.drawMotes(ctx, tMs, {
      count: 46,
      salt: 5501,
      speed: 5.5,
      down: true,
      color: "#9fae8c",
      alpha: 0.5,
      top: 24,
      bottom: this.height,
    });

    const blink = this.blink(tMs, 1500, 1080);
    if (blink > 0) {
      drawTracked(ctx, "PRESSIONE  Z  PARA COMECAR", this.width / 2, 178, 8, "#d9d2bb", 1.4, blink);
      // colchetes de menu: o prompt vira alvo, nao legenda
      const halfW = 84;
      ctx.save();
      ctx.globalAlpha = blink * 0.85;
      ctx.fillStyle = "#7d8a6c";
      for (const dir of [-1, 1]) {
        const bx = Math.round(this.width / 2 + dir * halfW);
        ctx.fillRect(bx - (dir < 0 ? 0 : 2), 179, 3, 1);
        ctx.fillRect(bx - (dir < 0 ? 0 : 2), 185, 3, 1);
        ctx.fillRect(dir < 0 ? bx : bx, 179, 1, 7);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private titlePoster(): HTMLCanvasElement {
    const hit = this.cache.get("title");
    if (hit) return hit;

    const c = makeCanvas(this.width, this.height);
    const g = ctx2d(c);
    const W = this.width;
    const H = this.height;

    // --- ceu frio, do quase-preto no topo pra um cinza-verde no horizonte
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0b1013");
    sky.addColorStop(0.42, "#141d1c");
    sky.addColorStop(0.62, "#212a23");
    sky.addColorStop(0.78, "#161d18");
    sky.addColorStop(1, "#080b09");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // --- lua corroida. E o unico circulo da tela: vira ponto focal e da
    //     contraste pro bloco tipografico. A mordida embaixo e a tese do
    //     jogo (a memoria tambem apodrece) dita sem uma linha de texto.
    this.paintRottenMoon(g, 192, 74, 47);

    // --- bruma no horizonte
    const haze = g.createLinearGradient(0, 118, 0, 176);
    haze.addColorStop(0, "rgba(150,168,140,0)");
    haze.addColorStop(0.5, "rgba(150,168,140,0.16)");
    haze.addColorStop(1, "rgba(120,138,112,0)");
    g.fillStyle = haze;
    g.fillRect(0, 118, W, 58);

    // --- duas cristas de mata morta: profundidade por valor, nao por escala
    this.paintDeadRidge(g, { baseY: 168, height: 34, count: 26, color: "#1a231f", salt: 311, width: W });
    this.paintDeadRidge(g, { baseY: 196, height: 52, count: 18, color: "#0d1210", salt: 977, width: W });

    // --- chao
    g.fillStyle = "#070a08";
    g.fillRect(0, 196, W, H - 196);
    g.fillStyle = "#101613";
    g.fillRect(0, 196, W, 1);

    this.postProcess(g, { vignette: 0.62, dither: 4, tint: [0, 0, 0], tintAmount: 0 });

    // --- bloco tipografico. Cartaz: tres pesos, nao uma linha so.
    // As duas palavras compartilham o corpo: fitStyle so encolhe, entao
    // encadear as duas medidas devolve o tamanho que serve pras duas.
    // Corpos diferentes em linhas irmas leriam como erro de diagramacao.
    const maxW = W - 40;
    let big = fitStyle("SWORD", TITLE_STYLE, 6, maxW);
    big = fitStyle("DECAY", big, 6, maxW);
    drawWord(g, "SWORD", W / 2, 86, big, 6);
    drawWord(g, "DECAY", W / 2, 148, big, 6);

    // "OF" pequeno entre reguas — hierarquia de cartaz
    const of: DisplayStyle = { ...TITLE_STYLE, key: "title_of", size: 14, rot: 0.3 };
    drawWord(g, "OF", W / 2, 106, of, 3);
    g.fillStyle = "#4b5546";
    g.fillRect(W / 2 - 78, 101, 58, 1);
    g.fillRect(W / 2 + 20, 101, 58, 1);
    g.fillStyle = "#6d7a62";
    g.fillRect(W / 2 - 78, 101, 22, 1);
    g.fillRect(W / 2 + 56, 101, 22, 1);

    // regua quebrada abaixo do titulo: a linha tambem foi comida
    for (let x = 62; x < W - 62; x++) {
      if (hash2(x, 160, 41) < 0.22) continue;
      g.fillStyle = hash2(x, 161, 42) < 0.3 ? "#5a6650" : "#38412f";
      g.fillRect(x, 160, 1, 1);
    }

    drawTracked(g, "ELA CORROI CARNE, PEDRA E MEMORIA", W / 2, 204, 8, "#7c8670", 1.2, 0.9);

    this.cache.set("title", c);
    return c;
  }

  /** Disco palido com a borda inferior comida — lua ou memoria, tanto faz. */
  private paintRottenMoon(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const img = g.getImageData(cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4);
    const d = img.data;
    const w = r * 2 + 4;
    const h = r * 2 + 4;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x - (r + 2);
        const py = y - (r + 2);
        const dist = Math.sqrt(px * px + py * py);
        if (dist > r) continue;
        // gradiente radial suave, mais claro em cima e a esquerda
        const light = clamp01(1 - (px * 0.35 + py * 0.8 + r * 0.55) / (r * 1.7));
        // Borda de cima curta (2px) e de baixo longa: o arco superior
        // precisa cortar limpo contra o ceu pra que a forma leia como
        // DISCO. Com a mesma franja macia dos dois lados a lua virava
        // borrao, e borrao atras do titulo le como sujeira de lente.
        let a = clamp01((r - dist) / (py < 0 ? 2.2 : 7)) * 0.86;
        // Mordida pelo MESMO campo de decadencia das letras. Antes era
        // sorteio por pixel e a lua ficava chuviscada — o mesmo confete
        // das glifos, na maior forma clara da tela. Agora a praga come a
        // lua em placas, e a borda de cada placa perde luz antes de
        // sumir: o disco parece corroido, nao pontilhado.
        const bite = clamp01((py + r * 0.15) / (r * 1.2)) * clamp01(dist / r + 0.15);
        const dec = clamp01(bite * 1.25 * (0.4 + 1.2 * decayField(x, y, 733)));
        if (dec > 0.62) a *= 0.06;
        else if (dec > 0.34) a *= 1 - (dec - 0.34) / 0.28 * 0.82;
        if (a <= 0.01) continue;
        const s = (y * w + x) * 4;
        // mares lunares: manchas largas de valor. Sem elas o disco e um
        // degrade liso, que nao existe em pixel art de referencia.
        const v = lerp(46, 138, light) * (0.86 + 0.2 * valueNoise(x, y, 13, 4177));
        d[s] = Math.round(lerp(d[s]!, v * 0.94, a));
        d[s + 1] = Math.round(lerp(d[s + 1]!, v * 1.02, a));
        d[s + 2] = Math.round(lerp(d[s + 2]!, v * 0.9, a));
      }
    }
    g.putImageData(img, cx - r - 2, cy - r - 2);
  }

  /** Crista de arvores mortas, gerada por hash — nenhuma se repete. */
  private paintDeadRidge(
    g: CanvasRenderingContext2D,
    o: { baseY: number; height: number; count: number; color: string; salt: number; width: number },
  ): void {
    g.save();
    g.fillStyle = o.color;
    for (let i = 0; i < o.count; i++) {
      const x = Math.round(hash2(i, 1, o.salt) * (o.width + 40)) - 20;
      const hgt = Math.round(o.height * (0.45 + hash2(i, 2, o.salt) * 0.75));
      const top = o.baseY - hgt;
      const thick = 1 + Math.round(hash2(i, 3, o.salt) * 2);
      // tronco com leve inclinacao: arvore morta nao e poste
      const lean = (hash2(i, 4, o.salt) - 0.5) * 8;
      for (let y = top; y < o.baseY; y++) {
        const k = (y - top) / Math.max(1, hgt);
        const tx = Math.round(x + lean * (1 - k));
        const tw = Math.max(1, Math.round(thick * (0.4 + k * 0.6)));
        g.fillRect(tx, y, tw, 1);
      }
      // galhos
      const branches = 1 + Math.round(hash2(i, 5, o.salt) * 2);
      for (let b = 0; b < branches; b++) {
        const by = top + Math.round(hgt * (0.1 + hash2(i, 10 + b, o.salt) * 0.5));
        const dir = hash2(i, 20 + b, o.salt) < 0.5 ? -1 : 1;
        const len = 3 + Math.round(hash2(i, 30 + b, o.salt) * 9);
        for (let s = 0; s < len; s++) {
          g.fillRect(Math.round(x + lean * 0.4 + dir * s), by - Math.round(s * 0.55), 1, 1);
        }
      }
    }
    g.restore();
  }

  // -------------------------------------------------------------------------
  // VITORIA
  // -------------------------------------------------------------------------

  /**
   * Sobrepoe o frame do mundo. Nao e comemoracao: a Regiao 1 e negacao, e
   * o guerreiro tambem esta apodrecendo. O tom e ALIVIO — luz palida
   * entrando, poeira SUBINDO, ouro so como acento.
   */
  renderVictory(ctx: CanvasRenderingContext2D, tMs: number, stats?: VictoryStats): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // levanta e esquenta o frame por baixo, sem apaga-lo
    ctx.globalCompositeOperation = "lighter";
    const lift = ctx.createLinearGradient(0, 0, 0, this.height);
    lift.addColorStop(0, "rgba(96,84,44,0.55)");
    lift.addColorStop(0.55, "rgba(52,50,32,0.30)");
    lift.addColorStop(1, "rgba(20,26,18,0.12)");
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = "source-over";

    ctx.drawImage(this.victoryOverlay(), 0, 0);

    // poeira SOBE. E o sinal de tom mais barato e mais legivel que existe.
    this.drawMotes(ctx, tMs, {
      count: 34,
      salt: 8123,
      speed: 7,
      down: false,
      color: "#f0dfae",
      alpha: 0.62,
      top: 0,
      bottom: this.height,
    });

    if (stats && typeof stats.coins === "number") {
      const cx = this.width / 2;
      ctx.fillStyle = "#c9a227";
      ctx.beginPath();
      ctx.arc(cx - 22, 146, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0d878";
      ctx.beginPath();
      ctx.arc(cx - 22.7, 145.2, 1.4, 0, Math.PI * 2);
      ctx.fill();
      drawTracked(ctx, String(stats.coins).padStart(2, "0"), cx + 6, 142, 8, "#e6dcc0", 1.2, 1);
    }

    const blink = this.blink(tMs, 1500, 1080);
    if (blink > 0) drawTracked(ctx, "PRESSIONE  Z  PARA SEGUIR", this.width / 2, 176, 8, "#e2d6ac", 1.4, blink);
    ctx.restore();
  }

  private victoryOverlay(): HTMLCanvasElement {
    const hit = this.cache.get("victory");
    if (hit) return hit;
    const c = makeCanvas(this.width, this.height);
    const g = ctx2d(c);
    const W = this.width;

    // veu quente e claro — deixa o mundo aparecer por baixo
    const wash = g.createLinearGradient(0, 0, 0, this.height);
    wash.addColorStop(0, "rgba(30,32,24,0.80)");
    wash.addColorStop(0.5, "rgba(24,28,22,0.62)");
    wash.addColorStop(1, "rgba(14,18,14,0.80)");
    g.fillStyle = wash;
    g.fillRect(0, 0, W, this.height);

    // raios de luz do alto: 5 cunhas, angulos por hash
    g.save();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const ax = 60 + hash2(i, 7, 4242) * (W - 120);
      const spread = 12 + hash2(i, 8, 4242) * 26;
      const grad = g.createLinearGradient(0, 0, 0, this.height);
      grad.addColorStop(0, "rgba(226,198,126,0.16)");
      grad.addColorStop(0.7, "rgba(180,160,100,0.03)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(ax - 3, -4);
      g.lineTo(ax + 3, -4);
      g.lineTo(ax + spread, this.height);
      g.lineTo(ax - spread, this.height);
      g.closePath();
      g.fill();
    }
    g.restore();

    drawWord(g, "SOBREVIVEU", W / 2, 104, fitStyle("SOBREVIVEU", VICTORY_STYLE, 3, W - 36), 3);

    // regua dupla de acento, inteira (ao contrario da do titulo)
    g.fillStyle = "#8a7538";
    g.fillRect(W / 2 - 62, 116, 124, 1);
    g.fillStyle = "#d8c46a";
    g.fillRect(W / 2 - 30, 118, 60, 1);

    drawTracked(g, "A REGIAO CEDE - POR ORA", W / 2, 126, 8, "#b9ab84", 1.2, 0.95);

    this.cache.set("victory", c);
    return c;
  }

  // -------------------------------------------------------------------------
  // DERROTA
  // -------------------------------------------------------------------------

  /**
   * Sobrepoe o frame do mundo, mas primeiro DRENA a cor dele. Derrota no
   * mundo de The Rot nao e "game over" alegre: a imagem perde saturacao,
   * a vinheta fecha, cinza cai e a corrosao entra pelas bordas.
   */
  renderDefeat(ctx: CanvasRenderingContext2D, tMs: number): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.drainColor(ctx, 0.82, 0.42);
    ctx.drawImage(this.defeatOverlay(), 0, 0);

    // cinza CAI, devagar. Contrapartida exata da poeira que sobe na vitoria.
    this.drawMotes(ctx, tMs, {
      count: 30,
      salt: 3307,
      speed: 4,
      down: true,
      color: "#6e7a63",
      alpha: 0.45,
      top: 0,
      bottom: this.height,
    });

    const blink = this.blink(tMs, 1800, 1200);
    if (blink > 0) drawTracked(ctx, "PRESSIONE  Z  PARA LEVANTAR", this.width / 2, 178, 8, "#8f9683", 1.4, blink);
    ctx.restore();
  }

  /** Dessatura e escurece o que ja esta no canvas. Um passe, 86k pixels. */
  private drainColor(ctx: CanvasRenderingContext2D, desat: number, darken: number): void {
    const img = ctx.getImageData(0, 0, this.width, this.height);
    const d = img.data;
    const n = this.width * this.height;
    const keep = 1 - desat;
    const mul = 1 - darken;
    for (let i = 0; i < n; i++) {
      const s = i * 4;
      const r = d[s]!;
      const gg = d[s + 1]!;
      const b = d[s + 2]!;
      const lum = (r * 77 + gg * 150 + b * 29) >> 8;
      // o cinza resultante puxa levemente pro verde doente, nao pro neutro
      d[s] = Math.round((r * keep + lum * desat * 0.94) * mul);
      d[s + 1] = Math.round((gg * keep + lum * desat * 1.02) * mul);
      d[s + 2] = Math.round((b * keep + lum * desat * 0.88) * mul);
    }
    ctx.putImageData(img, 0, 0);
  }

  private defeatOverlay(): HTMLCanvasElement {
    const hit = this.cache.get("defeat");
    if (hit) return hit;
    const c = makeCanvas(this.width, this.height);
    const g = ctx2d(c);
    const W = this.width;
    const H = this.height;

    const wash = g.createLinearGradient(0, 0, 0, H);
    wash.addColorStop(0, "rgba(6,9,8,0.86)");
    wash.addColorStop(0.45, "rgba(9,13,11,0.70)");
    wash.addColorStop(1, "rgba(10,16,9,0.90)");
    g.fillStyle = wash;
    g.fillRect(0, 0, W, H);

    // poca esverdeada subindo do rodape: a podridao esta ganhando terreno
    const pool = g.createLinearGradient(0, H - 64, 0, H);
    pool.addColorStop(0, "rgba(40,64,30,0)");
    pool.addColorStop(1, "rgba(48,78,34,0.30)");
    g.fillStyle = pool;
    g.fillRect(0, H - 64, W, 64);

    drawWord(g, "VOCE CAIU", W / 2, 108, fitStyle("VOCE CAIU", DEFEAT_STYLE, 4, W - 40), 4);
    drawTracked(g, "A PODRIDAO LEMBRA DE VOCE", W / 2, 128, 8, "#79826c", 1.2, 0.9);

    // vinheta pesada, fechando
    this.postProcess(g, { vignette: 1.05, dither: 3, tint: [12, 20, 10], tintAmount: 0.1 });

    // corrosao entrando pelas bordas — a propria moldura da tela apodrece
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // A vinheta do postProcess so escurece a COR do veu; pra ela
        // fechar de verdade sobre o mundo congelado o veu precisa ficar
        // mais opaco na borda tambem.
        const nx = (x - W / 2) / (W / 2);
        const ny = (y - H / 2) / (H / 2);
        const rad = Math.sqrt(nx * nx + ny * ny);
        const si = (y * W + x) * 4;
        d[si + 3] = Math.min(255, d[si + 3]! + clamp01((rad - 0.42) / 0.72) * 150);

        // Profundidade da corrosao varia por ruido de baixa frequencia:
        // uma faixa de espessura constante leria como moldura decorativa,
        // e o que se quer e a borda da tela sendo COMIDA em linguas.
        // Peso por borda: a praga SOBE do chao. Uma moldura de espessura
        // igual nos quatro lados le como vinheta decorativa; pesada
        // embaixo e rala em cima, le como a coisa entrando na tela.
        let p = 0;
        for (let e = 0; e < 4; e++) {
          const dist = e === 0 ? x : e === 1 ? W - 1 - x : e === 2 ? y : H - 1 - y;
          if (dist > 44) continue;
          const along = (e < 2 ? y : x) / 11;
          const weight = e === 3 ? 1.3 : e === 2 ? 0.5 : 0.88;
          const depth = (5 + 22 * smoothNoise(along, 6151 + e * 17)) * weight;
          if (dist >= depth) continue;
          const q = Math.pow(1 - dist / depth, 1.35);
          if (q > p) p = q;
        }
        if (p <= 0) continue;

        // A borda e comida em PLACA, com nucleo opaco e franja que perde
        // opacidade. A versao anterior sorteava pixel a pixel dentro da
        // faixa: virava chuvisco verde de televisao fora do ar — a coisa
        // mais brilhante e mais movimentada da tela de derrota, que e o
        // oposto do que a cena pede. Aqui o corte vem do mesmo campo de
        // decadencia das letras, entao a moldura apodrece com a mesma
        // gramatica.
        const f = clamp01(p * (0.62 + 0.85 * decayField(x, y, 6151)));
        if (f < 0.30) continue;
        const s = (y * W + x) * 4;
        // Dois valores escuros escolhidos por ruido de BAIXA frequencia:
        // manchas de tom, nao pontilhado. Nenhum e mais claro que o veu.
        const tone = valueNoise(x, y, 6.5, 991);
        const deep = tone < 0.5;
        d[s] = deep ? 7 : 16;
        d[s + 1] = deep ? 10 : 24;
        d[s + 2] = deep ? 7 : 13;
        const cover = clamp01((f - 0.30) / 0.34);
        d[s + 3] = Math.max(d[s + 3]!, 64 * Math.max(1, Math.round((120 + 135 * cover) / 64)));
      }
    }
    g.putImageData(img, 0, 0);

    this.cache.set("defeat", c);
    return c;
  }

  // -------------------------------------------------------------------------
  // Utilidades compartilhadas
  // -------------------------------------------------------------------------

  /**
   * Piscar em degraus, nao senoide continua: alpha fracionario em pixel
   * art vira franja cinza. Tres degraus leem como "respirando".
   */
  private blink(tMs: number, period: number, onFor: number): number {
    const p = ((tMs % period) + period) % period;
    if (p > onFor) return 0;
    const k = p / onFor;
    const fade = Math.min(k / 0.12, (1 - k) / 0.18, 1);
    return Math.max(0, Math.round(clamp01(fade) * 3) / 3);
  }

  /**
   * Particulas de ar. Posicao 100% derivada de hash + tempo: sem estado,
   * sem RNG, identica em qualquer replay do mesmo frame.
   */
  private drawMotes(
    ctx: CanvasRenderingContext2D,
    tMs: number,
    o: {
      count: number;
      salt: number;
      speed: number;
      down: boolean;
      color: string;
      alpha: number;
      top: number;
      bottom: number;
    },
  ): void {
    ctx.save();
    ctx.fillStyle = o.color;
    const span = o.bottom - o.top;
    const t = tMs / 1000;
    for (let i = 0; i < o.count; i++) {
      const speed = o.speed * (0.45 + hash2(i, 1, o.salt) * 1.1);
      const phase = hash2(i, 2, o.salt) * span;
      const travel = (phase + t * speed) % span;
      const y = Math.round(o.down ? o.top + travel : o.bottom - travel);
      const drift = Math.sin(t * (0.3 + hash2(i, 3, o.salt) * 0.5) + hash2(i, 4, o.salt) * 6.28) * 6;
      const x = Math.round(hash2(i, 5, o.salt) * this.width + drift);
      if (x < 0 || x >= this.width) continue;
      // brilha em degraus, nunca some por completo
      const life = travel / span;
      const fade = Math.min(life / 0.15, (1 - life) / 0.25, 1);
      ctx.globalAlpha = o.alpha * (Math.round(clamp01(fade) * 3) / 3) * (0.55 + hash2(i, 6, o.salt) * 0.45);
      const big = hash2(i, 7, o.salt) < 0.22;
      ctx.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
    }
    ctx.restore();
  }

  /**
   * Vinheta + dither num unico passe. O dither existe porque gradiente
   * liso em 384x224 exibe banda visivel — 1 nivel de ruido determinista
   * mata a banda e da a textura de 32-bit que o DESIGN.md pede.
   */
  private postProcess(
    g: CanvasRenderingContext2D,
    o: { vignette: number; dither: number; tint: RGB; tintAmount: number },
  ): void {
    const W = this.width;
    const H = this.height;
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const cx = W / 2;
    const cy = H / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = (y * W + x) * 4;
        if (d[s + 3] === 0) continue;
        const dx = (x - cx) / maxD;
        const dy = (y - cy) / maxD;
        const v = 1 - Math.pow(Math.sqrt(dx * dx + dy * dy) * 1.28, 2.1) * o.vignette;
        const k = clamp01(v);
        const n = (hash2(x, y, 12289) - 0.5) * o.dither;
        for (let ch = 0; ch < 3; ch++) {
          const base = d[s + ch]! * k + n;
          d[s + ch] = Math.max(0, Math.min(255, Math.round(lerp(base, o.tint[ch]!, o.tintAmount))));
        }
      }
    }
    g.putImageData(img, 0, 0);
  }
}
