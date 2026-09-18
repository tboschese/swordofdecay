import { FOREST_PARALLAX, type ParallaxLayer } from "../config/parallax";

/**
 * Fundo em camadas. Módulo m4 do push AAA.
 *
 * REESCRITO na rodada 2 depois de uma crítica correta: a versão da rodada
 * 1 tinha silhueta boa e distribuição de valor dentro do alvo, mas cada
 * camada continuava sendo um PREENCHIMENTO SÓLIDO de uma cor só. Isso é a
 * mesma chapação do baseline com cor melhor — passar na métrica de valor
 * não é a mesma coisa que a arte estar boa.
 *
 * O que separa fundo de Neo Geo/SOTN de silhueta vetorial:
 *
 * **Toda massa tem luz em cima e sombra embaixo.** Nenhuma superfície é
 * um tom só. Aqui cada camada renderiza em três tons — crista iluminada,
 * corpo, base escura — com a transição feita por DITHER, que é como
 * hardware de 16 bits fazia gradiente e continua sendo a assinatura
 * visual do período.
 *
 * **Formas, não ondulações.** Árvore é tronco mais copa, com massas
 * separadas e vãos entre elas. Uma linha ondulada lê como duna. As
 * camadas próximas desenham árvores individuais; só as distantes podem se
 * resolver em massa.
 *
 * **O cenário conta a história.** A lore fala de vilas abandonadas e uma
 * civilização que perdeu — então há ruínas na linha do horizonte: torres
 * quebradas, muros caídos. Fundo sem nada construído não é "atmosférico",
 * é vazio.
 *
 * Tudo é função da posição no MUNDO e determinístico: nada de rng, senão
 * o relevo cintila enquanto a câmera anda.
 */

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mix(a: number, b: number, t: number): number {
  return (
    (lerpChannel((a >> 16) & 255, (b >> 16) & 255, t) << 16) |
    (lerpChannel((a >> 8) & 255, (b >> 8) & 255, t) << 8) |
    lerpChannel(a & 255, b & 255, t)
  );
}

function shade(color: number, amount: number): number {
  return amount >= 0 ? mix(color, 0xffffff, amount) : mix(color, 0x000000, -amount);
}

function css(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, "0")}`;
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Bayer 4x4 — a matriz de dither clássica de 16 bits. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Coluna sem copa nenhuma, no perfil rasterizado da copa. */
const EMPTY = 32767;

export class Parallax {
  /**
   * Rascunhos reusados pelo rasterizador de copa. Alocar por árvore seria
   * ~120 arrays por frame só pra jogar fora.
   */
  private readonly canopyTop = new Int16Array(96);
  private readonly canopyBot = new Int16Array(96);
  /** Lóbulos da copa atual, empacotados: cx, cy, rx, ry. */
  private readonly lobes = new Float32Array(6 * 4);

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  private crest(layer: ParallaxLayer, wx: number): number {
    const [p0, p1, p2] = layer.periods;
    const a = layer.amplitude;
    return (
      this.height * layer.baselineRatio -
      (Math.sin(wx / p0) * a * 0.6 + Math.sin(wx / p1 + 1.7) * a * 0.28 + Math.sin(wx / p2 + 4.1) * a * 0.12)
    );
  }

  /**
   * Desenha UMA árvore como forma: tronco mais copa.
   *
   * Por que não um perfil de altura: perfil senoidal em espaçamento fixo
   * lê como duna, por mais que se varie a altura por hash. O que faz o
   * olho reconhecer árvore é a massa irregular com reentrâncias, e o
   * espaçamento irregular entre indivíduos. Custou duas tentativas
   * descobrir isso.
   *
   * REESCRITO na rodada 6. A versão anterior desenhava cada lóbulo como
   * `ctx.ellipse` e o resultado lia como BRÓCOLIS: massa lisa, borda de
   * bézier, contorno que nunca quebra. Copa de 16 bits tem borda
   * MASTIGADA — reentrâncias, tufos destacados, céu aparecendo por dentro.
   *
   * Então os lóbulos deixaram de ser o que se desenha e viraram só o campo
   * que define a MASSA. A silhueta final é rasterizada coluna a coluna e
   * mastigada em duas escalas: grossa (grupos de 2px, o que dá pedaço em
   * vez de chiado) e fina (±1px). Mordidas fundas entram em grupos de 4
   * colunas.
   *
   * Os buracos de céu são feitos partindo o RUN vertical da coluna em
   * dois, não com `destination-out`: o canvas aqui é opaco e compartilhado
   * com o céu e as camadas já desenhadas, então apagar abriria um furo até
   * o fundo da página. Partir o run deixa aparecer exatamente o que estava
   * atrás — que é o que a mordida deve revelar — e sem canvas auxiliar.
   *
   * Nada disso pode usar `rng`: a copa é forma fixa da árvore, e se o
   * recorte mudasse por frame a mata cintilaria enquanto a câmera anda.
   * Tudo sai de `hash(seed, coluna local)`, e a árvore é quantizada em
   * pixel inteiro pra transladar rígida em vez de tremer em subpixel.
   */
  private drawTree(
    ctx: CanvasRenderingContext2D,
    xf: number,
    groundYf: number,
    h: number,
    seed: number,
    body: string,
    lit: string,
    trunk: string,
    dark: string,
  ): void {
    const ox = Math.round(xf);
    const groundY = Math.round(groundYf);
    const lean = (hash(seed * 17) - 0.5) * 3;
    const trunkTop = Math.round(groundY - h * 0.42);

    ctx.fillStyle = trunk;
    ctx.fillRect(ox, trunkTop, h > 26 ? 2 : 1, groundY - trunkTop + 1);

    // --- campo de massa: lóbulos ao longo de um arco raso ---
    const lobeCount = h > 20 ? 5 : 4;
    // Baixo o bastante pra copa MORDER o topo do tronco. Centrada mais
    // alto ela flutuava: com a base já recortada, sobrava ar entre folha e
    // pau e a árvore lia como nuvem espetada num poste.
    const cy = groundY - h * 0.64;
    const L = this.lobes;
    // Proporção por indivíduo: umas copas largas e baixas, outras estreitas
    // e altas. Sem isso toda árvore sai com a MESMA losango larga e a mata
    // repete — mastigar a borda de vinte silhuetas idênticas não resolve a
    // repetição, só disfarça.
    const wide = 0.68 + hash(seed * 61) * 0.8;
    const tall = 1.32 - wide * 0.44;
    let bx0 = Infinity;
    let bx1 = -Infinity;
    for (let i = 0; i < lobeCount; i++) {
      const ha = hash(seed * 31 + i * 7);
      const hb = hash(seed * 13 + i * 11);
      const u = (i + 0.5) / lobeCount;
      const lx = ox + lean * u + (u - 0.5) * h * 0.58 * wide + (ha - 0.5) * h * 0.14;
      // Os do meio sobem: copa com ombro, não bolha simétrica.
      const ly = cy - (1 - Math.abs(u - 0.5) * 2) * h * 0.1 * tall + (hb - 0.5) * h * 0.12;
      const rx = h * (0.17 + ha * 0.11) * (0.78 + wide * 0.28);
      const ry = rx * (0.88 + hb * 0.34) * tall;
      L[i * 4] = lx;
      L[i * 4 + 1] = ly;
      L[i * 4 + 2] = rx;
      L[i * 4 + 3] = ry;
      if (lx - rx < bx0) bx0 = lx - rx;
      if (lx + rx > bx1) bx1 = lx + rx;
    }
    bx0 = Math.floor(bx0);
    bx1 = Math.ceil(bx1);
    const n = Math.min(bx1 - bx0 + 1, this.canopyTop.length);
    if (n <= 0) return;

    // --- rasteriza e mastiga a silhueta ---
    const top = this.canopyTop;
    const bot = this.canopyBot;
    // Amplitude da mordida acompanha o tamanho. O calibre certo é a altura
    // da COPA (~0.5h), não a da árvore: na primeira tentativa desta rodada
    // amp saiu grande demais pro miolo disponível e a mata virou renda —
    // borda ótima, massa nenhuma. Mastigar é tirar naco da borda, não
    // esburacar a árvore inteira.
    const amp = h < 16 ? 1 : h < 30 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const px = bx0 + i + 0.5;
      let t = 1e9;
      let b = -1e9;
      for (let l = 0; l < lobeCount; l++) {
        const dx = px - L[l * 4]!;
        const rx = L[l * 4 + 2]!;
        if (dx <= -rx || dx >= rx) continue;
        const dy = L[l * 4 + 3]! * Math.sqrt(1 - (dx * dx) / (rx * rx));
        const ly = L[l * 4 + 1]!;
        if (ly - dy < t) t = ly - dy;
        if (ly + dy > b) b = ly + dy;
      }
      if (t > 1e8) {
        top[i] = EMPTY;
        continue;
      }

      // Duas escalas: a grossa faz PEDAÇO, a fina tira a régua da borda.
      // Só a fina daria chiado de 1px, que lê como serrilha, não como folha.
      const coarse = hash(seed * 911 + (i >> 1) * 7);
      const fine = hash(seed * 577 + i * 31);
      let dt = Math.round((coarse - 0.45) * 1.6 * amp) + (fine > 0.76 ? -1 : fine < 0.2 ? 1 : 0);
      // Mordida funda: some um naco de 4 colunas da silhueta. Rara de
      // propósito — se toda borda tem mordida, nenhuma lê como mordida.
      if (hash(seed * 331 + (i >> 2) * 13) > 0.9) dt += amp + Math.round(hash(seed * 7919 + (i >> 2)) * amp);
      // A base sobe em vão irregular, abrindo o tronco entre as moitas.
      let db = -Math.round(hash(seed * 1231 + (i >> 1) * 11) * 1.1 * amp);
      if (hash(seed * 613 + (i >> 2) * 17) > 0.85) db -= 1;

      const ti = Math.round(t) + dt;
      const bi = Math.round(b) + db;
      if (bi - ti < 0) {
        top[i] = EMPTY;
        continue;
      }
      top[i] = ti;
      bot[i] = bi;
    }

    // Não há passe anti-fresta aqui de propósito: escrevi um e medi que
    // nunca dispara. A mastigação grossa trabalha em PARES de coluna e a
    // fina é ±1, então nenhuma coluna consegue afundar 3px abaixo das duas
    // vizinhas — a fenda de 1px é impossível por construção. As poucas
    // frestas verticais que sobram são vão entre duas árvores vizinhas que
    // recuaram na mesma coluna, e isso um passe por árvore não enxerga.

    // --- massa, com o céu furando por dentro ---
    ctx.fillStyle = body;
    for (let i = 0; i < n; i++) {
      const t = top[i]!;
      if (t === EMPTY) continue;
      const b = bot[i]!;
      const g = hash(seed * 1471 + (i >> 1) * 29);
      if (g > 0.91 && b - t >= 7) {
        const hy = t + 2 + Math.round((b - t - 4) * hash(seed * 97 + (i >> 1) * 3));
        const hh = g > 0.955 ? 2 : 1;
        ctx.fillRect(bx0 + i, t, 1, hy - t);
        ctx.fillRect(bx0 + i, hy + hh, 1, b - hy - hh + 1);
      } else {
        ctx.fillRect(bx0 + i, t, 1, b - t + 1);
      }
    }

    // --- luz seguindo o contorno mastigado ---
    // O truque: pular as colunas afundadas numa mordida. Elas são parede
    // lateral/fundo de reentrância e não veem o céu — é essa alternância
    // entre topo aceso e recorte escuro que faz a copa ler como volume
    // recortado em vez de mancha com um chapéu claro.
    ctx.fillStyle = lit;
    for (let i = 0; i < n; i++) {
      const t = top[i]!;
      if (t === EMPTY) continue;
      const prev = i > 0 ? top[i - 1]! : EMPTY;
      const next = i + 1 < n ? top[i + 1]! : EMPTY;
      const higher = Math.min(prev, next);
      if (higher !== EMPTY && t - higher >= 3) continue;
      const th = 1 + (hash(seed * 263 + i * 19) > 0.55 ? 1 : 0) + (h > 26 ? 1 : 0);
      ctx.fillRect(bx0 + i, t, 1, Math.min(th, bot[i]! - t + 1));
    }

    // --- barriga escura, interrompida: linha contínua vira sublinhado ---
    ctx.fillStyle = dark;
    for (let i = 0; i < n; i++) {
      const t = top[i]!;
      if (t === EMPTY || bot[i]! - t < 3) continue;
      if (hash(seed * 419 + i * 23) < 0.32) continue;
      ctx.fillRect(bx0 + i, bot[i]!, 1, 1);
    }

    // --- tufos soltos: 2-4 aglomerados separados da massa por 1-2px ---
    // É o detalhe que mais afasta a copa do brócolis: prova que a folhagem
    // tem galho por baixo, e quebra o contorno fechado.
    const tufts = h > 14 ? 2 + Math.floor(hash(seed * 449) * 2) : 1;
    for (let k = 0; k < tufts; k++) {
      // Miolo da largura: tufo colado na ponta da copa não lê como
      // aglomerado solto, lê como sujeira no meio do céu.
      const i = Math.floor((0.18 + hash(seed * 769 + k * 23) * 0.64) * n);
      const t = top[i]!;
      if (t === EMPTY) continue;
      const tw = 2 + Math.floor(hash(seed * 151 + k * 5) * 2);
      const th = 1 + Math.floor(hash(seed * 353 + k * 9) * 2);
      const gap = 1 + (hash(seed * 887 + k * 3) > 0.6 ? 1 : 0);
      const tx = bx0 + i - (tw >> 1);
      const ty = t - gap - th;
      ctx.fillStyle = body;
      ctx.fillRect(tx, ty, tw, th);
      if (h > 24) {
        ctx.fillStyle = lit;
        ctx.fillRect(tx, ty, tw, 1);
      }
    }
  }

  /**
   * Ruínas na linha do horizonte: torre quebrada ou muro caído. Esparsas,
   * por hash da posição — a civilização perdeu, e o cenário precisa dizer
   * isso em vez de ser só relevo natural.
   */
  private ruinOffset(wx: number, spacing: number): number {
    const idx = Math.floor(wx / spacing);
    if (hash(idx * 977 + 13) < 0.72) return 0;
    const frac = wx / spacing - idx;
    const w = 0.1 + hash(idx * 7) * 0.14;
    const start = 0.3 + hash(idx * 11) * 0.3;
    if (frac < start || frac > start + w) return 0;

    const local = (frac - start) / w;
    if (hash(idx * 31) > 0.55) {
      // torre: alta, topo quebrado em degraus irregulares
      const step = Math.floor(local * 4);
      return -(20 + hash(idx * 3 + step) * 16);
    }
    // muro: mais baixo, desmoronando pra um dos lados
    return -(9 + (1 - local) * 12);
  }

  /**
   * Árvore morta: tronco nu com galhos, sem copa.
   *
   * Não é variedade decorativa — é a lore ficando visível. The Rot corrói
   * carne, PEDRA e memória; uma mata "corrompida" desenhada só com copas
   * saudáveis se contradiz. Espalhadas entre as vivas, as mortas também
   * quebram a uniformidade de silhueta que fazia a mata ler como fileira.
   */
  private drawDeadTree(
    ctx: CanvasRenderingContext2D,
    x: number,
    groundY: number,
    h: number,
    seed: number,
    color: string,
  ): void {
    const lean = (hash(seed * 23) - 0.5) * 5;
    ctx.strokeStyle = color;
    ctx.lineWidth = h > 22 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.quadraticCurveTo(x + lean * 0.4, groundY - h * 0.6, x + lean, groundY - h);
    ctx.stroke();

    // Galhos: alternando de lado, subindo pelo tronco, encurtando no topo.
    ctx.lineWidth = 1;
    const branches = 3 + Math.floor(hash(seed * 7) * 3);
    for (let i = 0; i < branches; i++) {
      const t = 0.34 + (i / branches) * 0.58;
      const bx = x + lean * t;
      const by = groundY - h * t;
      const side = i % 2 === 0 ? 1 : -1;
      const len = h * (0.3 - t * 0.16) * (0.7 + hash(seed * 13 + i) * 0.6);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + side * len * 0.6, by - len * 0.25, bx + side * len, by - len * 0.75);
      ctx.stroke();
    }
  }

  render(ctx: CanvasRenderingContext2D, viewX: number): void {
    const { sky, layers } = FOREST_PARALLAX;
    this.renderSky(ctx, sky);

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]!;
      const offset = viewX * layer.scrollFactorX;
      const near = li / (layers.length - 1);

      const base = mix(layer.color, sky.horizon, layer.haze);
      // Três tons por camada. A distante quase não separa — a névoa come
      // o contraste, que é o comportamento fisicamente certo.
      const sep = 0.1 + near * 0.3;
      const lit = shade(base, sep * 0.85);
      const dark = shade(base, -sep);

      const spacing = 34 - li * 6;
      const ruinSpacing = 190 + li * 40;

      const top = new Float32Array(this.width + 2);
      for (let x = -1; x <= this.width; x++) {
        const wx = x + offset;
        let y = this.crest(layer, wx);
        if (li <= 1) y += this.ruinOffset(wx, ruinSpacing);
        top[x + 1] = y;
      }

      // Corpo, escurecendo pra base. O gradiente vertical dentro da massa
      // é o que faz ela ler como volume; a versão anterior era um fill
      // sólido com dither por cima, o que virou textura de ruído.
      ctx.fillStyle = css(base);
      ctx.beginPath();
      ctx.moveTo(-1, this.height);
      for (let x = -1; x <= this.width; x++) ctx.lineTo(x, top[x + 1]!);
      ctx.lineTo(this.width, this.height);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      const gy0 = this.height * layer.baselineRatio - layer.amplitude;
      const g = ctx.createLinearGradient(0, gy0, 0, this.height);
      g.addColorStop(0, css(base));
      g.addColorStop(1, css(dark));
      ctx.fillStyle = g;
      ctx.fillRect(0, gy0, this.width, this.height - gy0);
      ctx.restore();

      // Crista iluminada: a face voltada pra cima pegando o céu.
      const litH = 2 + Math.round(near * 2);
      ctx.fillStyle = css(lit);
      for (let x = 0; x < this.width; x++) {
        ctx.fillRect(x, Math.round(top[x + 1]!), 1, litH);
      }

      // Transição crista→corpo, 3px. Dither é técnica de banda estreita
      // entre dois tons; espalhado pela massa inteira vira ruído e achata
      // tudo — foi o erro da primeira tentativa da rodada 2.
      //
      // A versão anterior era `BAYER[dy & 3][x & 3] >= 4 + dy * 4`, e não
      // fazia o que o comentário prometia. Expandindo:
      //   dy=0  [0,8,2,10]  >= 4   -> preenche em x&3 ∈ {1,3}
      //   dy=1  [12,4,14,6] >= 8   -> preenche em x&3 ∈ {0,2}
      //   dy=2  [3,11,1,9]  >= 12  -> NUNCA preenche, linha morta
      // Ou seja: em vez de uma rampa de densidade de 3px, saíam duas
      // linhas de pente 50% em fase oposta e uma linha que nunca desenha.
      // Um pente de período 2 é a frequência máxima que a grade suporta,
      // e ele corria sem quebra por 120+ px — medido na sonda de picos
      // isolados, `48- 49+ 50- 51+ ...` ininterrupto nas linhas 176 e 185.
      // Era a maior fonte de ruído do plano de jogo, não o detalhe de solo.
      const mid = shade(base, sep * 0.35);
      ctx.fillStyle = css(mid);
      if (li >= 2) {
        // Camadas do plano de ação: banda SÓLIDA, sem alta frequência
        // nenhuma. É a mesma lição que o m1 tirou do tileset — faixa
        // tonal larga tem que vir em baixa frequência. E é o que a arte
        // de referência faz no chão próximo: lábio em degraus nítidos,
        // não pontilhado. Dither aqui só disputa leitura com o guerreiro.
        for (let x = 0; x < this.width; x++) {
          ctx.fillRect(x, Math.round(top[x + 1]!) + litH, 1, 2);
        }
      } else {
        // Camadas distantes: aí sim dither, porque os dois tons já estão
        // próximos (a névoa comeu o contraste) e o padrão não compete com
        // nada. Agora com rampa de densidade de verdade, e com a fase
        // seguindo a altura da crista — assim colunas de alturas
        // diferentes caem em linhas diferentes da matriz e o padrão não
        // degenera num pente único atravessando a tela.
        for (let x = 0; x < this.width; x++) {
          const y0 = Math.round(top[x + 1]!) + litH;
          for (let dy = 0; dy < 3; dy++) {
            const density = 0.75 - dy * 0.25;
            if (BAYER[(y0 + dy) & 3]![x & 3]! / 16 < density) ctx.fillRect(x, y0 + dy, 1, 1);
          }
        }
      }

      // Detalhe de solo na faixa de chão exposta entre esta camada e a
      // próxima. Sem isso sobra uma área grande com só o gradiente, que
      // lê como parede lisa atravessando a tela — o gradiente sozinho não
      // é detalhe, é só ausência de degrau.
      //
      // Em AGLOMERADO, não em pixel solto. A primeira versão sorteava por
      // pixel e despejava 1px isolados na faixa inteira. Medido em
      // `vista_f260`: as linhas 175-186 — exatamente a altura das pernas
      // do guerreiro e dos pés dos inimigos — chegavam a 33% de pixels em
      // pico de 1px, contra 0.5-5% no resto do quadro. Ruído na mesma
      // frequência do personagem disputa leitura com ele, e era isso que
      // a review r12 estava vendo ao dizer que o palco é a parte MENOS
      // legível da imagem.
      //
      // A lição é a mesma que o m1 aprendeu no tileset: faixa tonal larga
      // tem que vir em BAIXA frequência. Uma pedra tem largura; um pixel
      // sozinho não lê como objeto, lê como sujeira no sensor.
      const isNearest = li === layers.length - 1;
      const stripTop = this.height * layer.baselineRatio + 2;
      // A camada mais próxima passa ATRÁS do chão jogável e desceria até o
      // rodapé. Detalhe ali ou fica escondido pelo tilemap (desperdício de
      // frame) ou aparece dentro de um buraco, onde o que se quer é escuro
      // quieto — buraco cheio de entulho compete com a beirada que o
      // jogador precisa ler. Cortada logo abaixo da crista.
      const stripBottom = isNearest
        ? this.height * layer.baselineRatio + 14
        : this.height * layers[li + 1]!.baselineRatio;
      if (stripBottom > stripTop + 3) {
        // Quanto mais perto do plano de ação, mais baixo o contraste do
        // detalhe: a camada de trás é fundo de palco, não é o palco.
        const detailSep = sep * (isNearest ? 0.45 : 1);
        const detailDark = css(shade(base, -detailSep * 0.9));
        const detailPale = css(shade(base, detailSep * 0.5));
        const cellW = 7;
        const cellH = 3;
        const c0 = Math.floor((offset - cellW) / cellW);
        const c1 = Math.floor((offset + this.width) / cellW) + 1;
        const cyTop = Math.floor(stripTop / cellH);
        const cyBottom = Math.ceil(stripBottom / cellH);
        for (let cx = c0; cx <= c1; cx++) {
          for (let cy = cyTop; cy < cyBottom; cy++) {
            const h = hash(cx * 92821 + cy * 689);
            if (h > 0.34) continue;
            const wx = cx * cellW + Math.floor(hash(cx * 31 + cy * 7) * cellW);
            const y = cy * cellH + (h > 0.17 ? 1 : 0);
            if (y < stripTop || y >= stripBottom) continue;
            // Sem isto o aglomerado flutua no céu onde a crista mergulha
            // abaixo da linha de base: a crista oscila ±amplitude e a
            // faixa começa em baseline+2, então o topo da faixa pode cair
            // acima do terreno. A versão por pixel tinha o mesmo furo, só
            // que 1px isolado no céu passava despercebido.
            if (y < this.crest(layer, wx) + 2) continue;
            ctx.fillStyle = h < 0.17 ? detailDark : detailPale;
            ctx.fillRect(Math.round(wx - offset), y, 3 + (Math.floor(h * 12) % 5), 1);
          }
        }
      }

      // Árvores como forma individual, com espaçamento IRREGULAR. O passo
      // fixo é o que fazia a mata ler como duna mesmo variando a altura.
      if (layer.canopy > 0) {
        const treeBody = css(shade(base, -sep * 0.5));
        const treeLit = css(shade(base, sep * 0.55));
        const treeDark = css(shade(base, -sep * 1.15));
        const treeTrunk = css(shade(base, -sep * 1.6));
        // Madeira morta fica ESCURA. Houve uma versão que a tingia de
        // ferrugem pra servir de âncora de cor quente; reprovada olhando
        // as duas capturas lado a lado (`shots/out/z18_COM/SEM_*`), e o
        // motivo técnico bate com a escolha: a mistura era
        // `0.12 + near * 0.58`, forte no plano próximo — só que a camada
        // próxima tem base quase preta (`0x121711`), e ferrugem misturada
        // em quase-preto dá lama, não ferrugem. A cor aparecia mesmo era
        // nas camadas do MEIO, de base mais clara, onde ela lia como
        // campo difuso de hastes quentes e ainda empurrava contra a
        // perspectiva atmosférica que essas camadas precisam ter.
        //
        // A âncora quente segue existindo só na cantoneira da plataforma
        // (`PAL.rust` em TileArt), que é pequena e faz trabalho de leitura:
        // marca onde a plataforma acaba.
        const deadTrunk = treeTrunk;
        const step = spacing * 0.62;
        const first = Math.floor(offset / step) - 2;
        for (let idx = first; idx * step < offset + this.width + step * 2; idx++) {
          const jitter = (hash(idx * 41) - 0.5) * step * 0.9;
          const wx = idx * step + jitter;
          const x = wx - offset;
          // Margem larga: a copa mastigada chega a ~0.6h de cada lado do
          // tronco, e cortar antes disso faz meia árvore piscar na borda.
          if (x < -46 || x > this.width + 46) continue;
          const hh = hash(idx * 7 + 3);
          if (hh < 0.18) continue; // clareiras: mata cheia demais vira parede
          const groundY = this.crest(layer, wx) + 3;
          // Faixa de altura larga: a versão anterior variava pouco e a
          // mata lia como fileira de brócolis do mesmo tamanho.
          const treeH = (6 + Math.pow(hh, 1.7) * 30) * (0.55 + layer.canopy * 0.75);

          if (hash(idx * 199 + li) > 0.76) {
            this.drawDeadTree(ctx, x, groundY, treeH * 1.25, idx * 53 + li, deadTrunk);
          } else {
            this.drawTree(ctx, x, groundY, treeH, idx * 97 + li * 13, treeBody, treeLit, treeTrunk, treeDark);
          }
        }
      }
    }

    this.renderFog(ctx);
  }

  private renderSky(ctx: CanvasRenderingContext2D, sky: typeof FOREST_PARALLAX.sky): void {
    const grad = ctx.createLinearGradient(0, 0, 0, this.height * sky.horizonRatio);
    grad.addColorStop(0, css(sky.top));
    grad.addColorStop(1, css(sky.horizon));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height * sky.horizonRatio);
    ctx.fillStyle = css(sky.horizon);
    ctx.fillRect(0, this.height * sky.horizonRatio - 1, this.width, this.height);

    // Banco de nuvem dithered: dá evento no espaço vazio de cima sem
    // competir com a ação.
    const bandY = this.height * 0.2;
    ctx.fillStyle = css(shade(sky.top, 0.12));
    for (let x = 0; x < this.width; x++) {
      const h = Math.sin(x / 47) * 4 + Math.sin(x / 19 + 2) * 2;
      for (let dy = 0; dy < 7; dy++) {
        if (BAYER[dy & 3]![x & 3]! >= 14 - dy * 2) ctx.fillRect(x, bandY + h + dy, 1, 1);
      }
    }
  }

  private renderFog(ctx: CanvasRenderingContext2D): void {
    const { fog } = FOREST_PARALLAX;
    const fogTop = this.height * fog.startRatio;
    const fogGrad = ctx.createLinearGradient(0, fogTop, 0, this.height);
    const [fr, fg, fb] = [(fog.color >> 16) & 255, (fog.color >> 8) & 255, fog.color & 255];
    fogGrad.addColorStop(0, `rgba(${fr},${fg},${fb},0)`);
    fogGrad.addColorStop(1, `rgba(${fr},${fg},${fb},${fog.strength})`);
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, fogTop, this.width, this.height - fogTop);
  }

  /**
   * Primeiro plano — desenhado DEPOIS do jogador, ocluindo.
   *
   * **Emoldura, não obstrui.** A primeira versão tinha 26px de massa mais
   * talos de até 32px e escondia o chão onde o jogador anda — falha de
   * legibilidade de jogo, não escolha estética.
   */
  renderForeground(ctx: CanvasRenderingContext2D, viewX: number): void {
    const offset = viewX * 1.35;
    const base = this.height + 4;
    const profile = (wx: number): number =>
      base - 11 - Math.sin(wx / 71) * 9 - Math.sin(wx / 23 + 2.3) * 5 - Math.sin(wx / 11 + 5.1) * 2.5;

    ctx.fillStyle = "#080b08";
    ctx.beginPath();
    ctx.moveTo(-1, this.height + 1);
    for (let x = -1; x <= this.width + 1; x++) ctx.lineTo(x, profile(x + offset));
    ctx.lineTo(this.width + 1, this.height + 1);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 90; i++) {
      const wx = Math.floor(offset / 13) * 13 + i * 13 - 60;
      const x = wx - offset;
      if (x < -8 || x > this.width + 8) continue;
      const h0 = hash(Math.floor(wx / 13));
      if (h0 < 0.42) continue;
      const bladeH = 5 + h0 * 13;
      const lean = (hash(Math.floor(wx / 13) * 7) - 0.5) * 7;
      const rootY = profile(wx);
      ctx.strokeStyle = "#080b08";
      ctx.lineWidth = 1 + h0;
      ctx.beginPath();
      ctx.moveTo(x, rootY + 2);
      ctx.quadraticCurveTo(x + lean * 0.5, rootY - bladeH * 0.6, x + lean, rootY - bladeH);
      ctx.stroke();
    }
  }
}
