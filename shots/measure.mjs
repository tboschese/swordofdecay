#!/usr/bin/env node
/**
 * Métricas objetivas de um frame do jogo. "Ficou bom" não é evidência.
 *
 *   node shots/measure.mjs shots/out/r0/vista_f260.png
 *   node shots/measure.mjs shots/out/r0/*.png --brief
 *   node shots/measure.mjs <png> --region 0,150,384,74     # só o chão
 *
 * As métricas foram escolhidas pra medir as falhas que o baseline
 * realmente tem, não as que soam sofisticadas:
 *
 *  chapado%     — fração de pixels cujo entorno 3x3 é da MESMA cor exata.
 *                 É a medida direta de "bloco de cor sólida", que é o
 *                 fault dominante hoje. Arte estilo SNES/Neo Geo sombreia
 *                 em gradiente e derruba esse número.
 *  tons/matiz   — quantos níveis distintos de luminância existem dentro
 *                 da família de matiz dominante. É o critério testável do
 *                 DESIGN.md §2.1 ("3-4 tons da mesma cor"), medido.
 *  cinza        — desvio-padrão da luminância. Se a estrutura da imagem
 *                 mora na cor e não no valor, isso desaba e a imagem lê
 *                 chapada em preto e branco (policy #1 do hero/BRIEF).
 *  faixas       — luminância média por faixa horizontal (fundo/meio/
 *                 frente). Separação por valor entre planos é o que dá
 *                 profundidade; se as faixas empatam, a cena é plana.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

/**
 * Colunas ocupadas por ator (guerreiro, inimigos) na captura.
 *
 * As métricas de camada e de aresta julgam CENÁRIO. Sem esta máscara elas
 * contavam o ator como ruído de cenário e reprovavam cena por ela estar
 * cheia de ator — no `roster` a falha inteira de ruído eram os três atores
 * (0.442 cortes/px nas colunas deles contra 0.357 do cenário, com o fundo
 * em 0.348), e a `--edge` chegava a apontar a "aresta do piso" na perna do
 * guerreiro. Ator detalhado no plano de jogo é o que se QUER; a métrica é
 * que não sabia separar.
 *
 * As caixas vêm do jogo (`TilemapGame.debugState().actors`), gravadas pelo
 * harness em `<cena>_state.json`. Não são recalculadas aqui de propósito:
 * o jogo é a autoridade sobre onde desenhou.
 *
 * Silenciosa quando não acha o arquivo — medir PNG solto continua válido,
 * só sai sem máscara, e todo relatório diz quantas colunas mascarou.
 */
function frameState(file) {
  const m = /^(.*)_f(\d+)\.png$/.exec(file.split("/").pop() ?? "");
  if (!m) return null;
  const statePath = join(dirname(file), `${m[1]}_state.json`);
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")).find((s) => s.f === Number(m[2])) ?? null;
  } catch {
    return null;
  }
}

function actorColumns(file, width) {
  const entry = frameState(file);
  if (!entry || !Array.isArray(entry.actors)) return null;

  const masked = new Uint8Array(width);
  for (const a of entry.actors) {
    for (let x = Math.max(0, a.x); x < Math.min(width, a.x + a.w); x++) masked[x] = 1;
  }
  return masked;
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("não é png");
  let i = 8;
  const idat = [];
  let w = 0, h = 0, bd = 0, ct = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  if (bd !== 8) throw new Error("precisa de png 8-bit");
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!nch) throw new Error("color type não suportado: " + ct);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * nch, out = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= nch ? line[x - nch] : 0, b = prev[x], c = x >= nch ? prev[x - nch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, nch, px: out };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let hh;
  if (mx === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) hh = ((b - r) / d + 2) / 6;
  else hh = ((r - g) / d + 4) / 6;
  return [hh, s, l];
}

function analyse(file, region) {
  const { w, h, nch, px } = decodePNG(readFileSync(file));
  const [rx, ry, rw, rh] = region ?? [0, 0, w, h];

  const at = (x, y) => (y * w + x) * nch;
  const lum = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) {
    const p = k * nch;
    lum[k] = (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
  }

  // ---- chapado: entorno 3x3 exatamente da mesma cor
  let flat = 0, considered = 0;
  for (let y = ry + 1; y < ry + rh - 1; y++) {
    for (let x = rx + 1; x < rx + rw - 1; x++) {
      const p = at(x, y);
      let same = true;
      for (let dy = -1; dy <= 1 && same; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const q = at(x + dx, y + dy);
          if (px[q] !== px[p] || px[q + 1] !== px[p + 1] || px[q + 2] !== px[p + 2]) { same = false; break; }
        }
      }
      considered++;
      if (same) flat++;
    }
  }

  // ---- paleta e tons dentro do matiz dominante
  const colors = new Set();
  const hueBins = new Array(24).fill(0);
  const hueLums = Array.from({ length: 24 }, () => new Set());
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const p = at(x, y);
      colors.add((px[p] << 16) | (px[p + 1] << 8) | px[p + 2]);
      const [hh, s, l] = rgbToHsl(px[p], px[p + 1], px[p + 2]);
      if (s < 0.08) continue;                       // cinza não tem matiz útil
      const bin = Math.min(23, Math.floor(hh * 24));
      hueBins[bin]++;
      hueLums[bin].add(Math.round(l * 40));         // quantiza em ~2.5% de luminância
    }
  }
  const domHue = hueBins.indexOf(Math.max(...hueBins));
  const tonesInDomHue = hueLums[domHue].size;

  // ---- estrutura em valor
  const sub = [];
  for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) sub.push(lum[y * w + x]);
  sub.sort((a, b) => a - b);
  const pct = (q) => sub[Math.min(sub.length - 1, Math.floor(q * sub.length))];
  const mean = sub.reduce((a, b) => a + b, 0) / sub.length;
  const sd = Math.sqrt(sub.reduce((a, b) => a + (b - mean) ** 2, 0) / sub.length);
  const shadow = sub.filter((v) => v < 0.25).length / sub.length;
  const mid = sub.filter((v) => v >= 0.25 && v < 0.75).length / sub.length;
  const high = sub.filter((v) => v >= 0.75).length / sub.length;

  // ---- faixas horizontais: separação de profundidade por valor
  const bands = [];
  for (let b = 0; b < 4; b++) {
    const y0 = ry + Math.floor((rh * b) / 4), y1 = ry + Math.floor((rh * (b + 1)) / 4);
    let s = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = rx; x < rx + rw; x++) { s += lum[y * w + x]; n++; }
    bands.push(s / n);
  }
  const bandSpread = Math.max(...bands) - Math.min(...bands);

  return {
    file, w, h,
    flatPct: (flat / considered) * 100,
    colors: colors.size,
    tonesInDomHue,
    sd, mean,
    p01: pct(0.01), p50: pct(0.5), p99: pct(0.99),
    shadow, mid, high,
    bands, bandSpread,
  };
}

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const brief = argv.includes("--brief");
const ri = argv.indexOf("--region");
const region = ri >= 0 ? argv[ri + 1].split(",").map(Number) : null;
// ri === -1 quando não há --region; nesse caso nenhum índice é o valor dele.
const regionValueIndex = ri >= 0 ? ri + 1 : -1;
const files = argv.filter((a, i) => !a.startsWith("--") && i !== regionValueIndex);
if (!files.length) {
  console.error("uso: measure.mjs <png...> [--region x,y,w,h] [--brief]");
  process.exit(1);
}

const f2 = (v) => v.toFixed(2);
const results = files.map((f) => analyse(f, region));

if (brief) {
  console.log("arquivo".padEnd(30) + "chapado%  cores  tons  sd     faixas");
  for (const r of results) {
    console.log(
      r.file.split("/").pop().padEnd(30) +
        f2(r.flatPct).padStart(7) + "  " +
        String(r.colors).padStart(5) + "  " +
        String(r.tonesInDomHue).padStart(4) + "  " +
        f2(r.sd).padStart(5) + "  " +
        f2(r.bandSpread).padStart(6),
    );
  }
} else {
  for (const r of results) {
    console.log(`\n=== ${r.file}  ${r.w}x${r.h} ===`);
    console.log(`chapado        ${f2(r.flatPct)}%  (pixels com entorno 3x3 de cor idêntica)`);
    console.log(`paleta         ${r.colors} cores distintas`);
    console.log(`tons/matiz     ${r.tonesInDomHue}  (DESIGN.md §2.1 pede 3-4 no mínimo)`);
    console.log(`valor          media ${f2(r.mean)}  sd ${f2(r.sd)}  p01 ${f2(r.p01)}  p50 ${f2(r.p50)}  p99 ${f2(r.p99)}`);
    console.log(`distribuicao   sombra ${(r.shadow * 100).toFixed(1)}%  meio ${(r.mid * 100).toFixed(1)}%  alta ${(r.high * 100).toFixed(1)}%`);
    console.log(`faixas         ${r.bands.map(f2).join("  ")}   amplitude ${f2(r.bandSpread)}`);
  }
}

// ---------------------------------------------------------------- camadas
/**
 * Razão de leitura entre PLANO DE JOGO e PLANO DE FUNDO.
 *
 * Esta métrica existe porque as outras não enxergaram o maior defeito do
 * projeto: com os 8 módulos aprovados, o plano em que o jogador anda era
 * a parte mais escura e mais ruidosa do quadro, e o fundo lia melhor que
 * o palco. Toda métrica anterior é global ao frame ou local a uma região
 * escolhida à mão — nenhuma COMPARA camadas, então o instrumento era cego
 * pra inversão de hierarquia.
 *
 * Num plataforma o plano de jogo tem que ganhar: mais claro OU mais
 * contrastado que o fundo, e com MENOS ruído de alta frequência, porque
 * ruído na mesma frequência do personagem disputa leitura com ele.
 *
 *   node shots/measure.mjs <png> --layers
 */
function layerReport(file) {
  const { w, h, nch, px } = decodePNG(readFileSync(file));
  const lumAt = (x, y) => {
    const p = (y * w + x) * nch;
    return (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
  };

  // Bandas por fração de altura: fundo é o miolo, jogo é o terço de baixo.
  const bands = {
    fundo: [Math.floor(h * 0.42), Math.floor(h * 0.72)],
    // Termina em 0.92, NAO em h-1: a franja de primeiro plano e quase
    // preta DE PROPOSITO (e ela que da o preto real e a oclusao), e
    // incluir enquadramento na medicao do palco falseia o resultado pra
    // baixo. A primeira versao desta metrica cometia esse erro.
    jogo: [Math.floor(h * 0.78), Math.floor(h * 0.92)],
  };

  // Colunas de ator ficam de fora: a métrica julga CENÁRIO, e o detalhe do
  // guerreiro e dos inimigos é justamente o que se quer no plano de jogo.
  const masked = actorColumns(file, w);
  const skip = (x) => masked !== null && masked[x] === 1;
  const nMasked = masked ? masked.reduce((a, b) => a + b, 0) : 0;

  const out = {};
  for (const [name, [y0, y1]] of Object.entries(bands)) {
    let sum = 0, n = 0;
    // "cortes": quantas vezes a luminância muda de degrau ao andar na
    // horizontal. É a medida de frequência de ruído que compete com o
    // personagem — não de quanto detalhe existe, mas de quão picotado é.
    let cuts = 0, cmp = 0;
    for (let y = y0; y <= y1; y++) {
      let prev = null;
      for (let x = 0; x < w; x++) {
        if (skip(x)) { prev = null; continue; }   // corta o par que cruza o ator
        const l = lumAt(x, y);
        sum += l; n++;
        const q = Math.round(l * 24);
        if (prev !== null) { if (q !== prev) cuts++; cmp++; }
        prev = q;
      }
    }
    const mean = sum / n;
    let vsum = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) if (!skip(x)) vsum += (lumAt(x, y) - mean) ** 2;
    out[name] = { mean, sd: Math.sqrt(vsum / n), cutRate: cuts / cmp, nMasked };
  }

  const j = out.jogo, f = out.fundo;
  console.log(`\n=== ${file} — hierarquia de camadas ===`);
  console.log(
    j.nMasked
      ? `mascara  ${j.nMasked} de ${w} colunas excluidas (atores)`
      : "mascara  nenhuma (sem _state.json ao lado, ou sem ator na cena)",
  );
  console.log(`fundo   media ${f.mean.toFixed(3)}  sd ${f.sd.toFixed(3)}  cortes/px ${f.cutRate.toFixed(3)}`);
  console.log(`jogo    media ${j.mean.toFixed(3)}  sd ${j.sd.toFixed(3)}  cortes/px ${j.cutRate.toFixed(3)}`);
  // CRITERIO CORRIGIDO. A primeira versao exigia que o palco fosse mais
  // CLARO que o fundo — impossivel, porque a banda de fundo contem o ceu,
  // que e a coisa mais clara de qualquer plataforma. Nem Metal Slug
  // satisfaz isso. Foi o mesmo erro do ROT_TARGET.shadowMassMin: alvo
  // escrito antes de entender a geometria da cena.
  //
  // O que importa de verdade sao duas razoes:
  //   contraste  o palco precisa de contraste INTERNO suficiente pra
  //              beirada e buraco lerem. Se o chao tem metade do sd do
  //              fundo, ele e uma massa escura sem informacao.
  //   ruido      e precisa de MENOS ruido de alta frequencia que o fundo,
  //              senao a textura disputa leitura com o personagem.
  const cr = j.sd / f.sd;
  const dn = j.cutRate - f.cutRate;
  // ATENCAO ao limiar de 0.75: ele NAO foi validado contra arte real, e
  // e o terceiro alvo desta sessao com risco de estar errado pelo mesmo
  // motivo dos dois anteriores. A banda de fundo contem ceu claro E massa
  // de mata escura, entao tem faixa enorme por natureza; chao de terra e
  // musgo tem faixa mais estreita por natureza. Exigir 75% pode ser
  // exigir do palco um comportamento que so o fundo tem.
  //
  // O numero AINDA e util como direcao: 0.48 -> 0.53 acompanhou uma
  // melhora visivel na leitura da beirada. Use como gradiente, nao como
  // aprovacao. Antes de tratar como criterio de saida, medir contraste
  // LOCAL na aresta do piso, que e o que de fato governa a leitura.
  console.log(`\nrazao de contraste (jogo/fundo) ${cr.toFixed(2)}  ${cr >= 0.75 ? "OK" : "abaixo do limiar NAO VALIDADO de 0.75 — ver nota no codigo"}`);
  console.log(`delta de ruido (jogo - fundo)   ${dn >= 0 ? "+" : ""}${dn.toFixed(3)}  ${dn < 0.03 ? "OK" : "FALHA: o palco e mais picotado que o fundo"}`);
}

if (argv.includes("--layers")) {
  for (const file of files) layerReport(file);
}

// ---------------------------------------------------------------- aresta
/**
 * Contraste LOCAL na aresta do piso — a medição que de fato governa se o
 * jogador lê a beirada de plataforma em movimento.
 *
 * Por que esta e não a razão de contraste entre camadas: a razão global
 * compara uma banda de fundo que contém céu claro E mata escura (faixa
 * enorme por natureza) com um chão de terra e musgo (faixa estreita por
 * natureza). Exigir paridade ali é exigir do palco um comportamento que
 * só o fundo tem — foi o terceiro alvo mal-calibrado desta sessão.
 *
 * O que importa é local: existe um degrau de valor nítido na linha em que
 * o piso começa? É isso que o olho usa pra saber onde dá pra pisar.
 *
 *   node shots/measure.mjs <png> --edge
 */
function edgeReport(file) {
  const { w, h, nch, px } = decodePNG(readFileSync(file));
  const L = (x, y) => {
    const p = (y * w + x) * nch;
    return (0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]) / 255;
  };

  const steps = [];

  // Duas exclusões, e sem elas o número não significa nada. Medido na
  // rodada 16: 30.5% de "colunas fracas" no `run_f080`, e inspecionando
  // coluna a coluna a maior parte era artefato —
  //
  //  ator     onde o guerreiro ocluí o piso a métrica acha a maior
  //           descontinuidade na silhueta DELE: em x=140 apontava y=173,
  //           que é a perna, não o chão. Aresta forte, medida errada.
  //  buraco   coluna sobre buraco não tem aresta de piso pra medir. Ela
  //           entrava como "fraca" e puxava a estatística pra baixo,
  //           quando na verdade o buraco estar escuro e vazio é o certo.
  //
  // Nas colunas que sobram a aresta é forte e consistente (lábio em y=192
  // com salto de 0.28-0.66), que é o que a inspeção ampliada já mostrava.
  const masked = actorColumns(file, w);
  let nActor = 0, nNoFloor = 0;

  // A linha do piso vem do JOGO (`debugState().floorLine`), não é mais
  // inferida do pixel. Três tentativas de inferir erraram, cada uma de um
  // jeito, e todas viraram limiar novo pra calibrar errado:
  //
  //  1. "maior descontinuidade vertical da coluna" misturava duas
  //     transições reais — lábio iluminado (y=192) e entrada no corpo do
  //     chão (y=197) — numa estatística só. As alturas saíam em dois
  //     grupos: 192 com 36 fracas/18 boas, 197 com 14 fracas/95 boas.
  //  2. A mesma versão media com 2-3px de folga "pra fugir do antialias"
  //     e com isso PULAVA o lábio de 1px, comparando escuro contra
  //     escuro — daí degraus de 0.01 em coluna de lábio visivelmente claro.
  //  3. Procurar "superfície clara" a partir de 0.72h achava a faixa de
  //     névoa entre camadas de mata, e o limiar de 0.22 que eu afirmei ser
  //     o vale entre as populações não separa nada: a variação por coluna
  //     do banco escuro é maior que a distância dele pro corpo do chão.
  //
  // Com a linha vinda do tilemap não há o que calibrar: onde há piso a
  // posição é exata, e onde não há, é buraco de verdade e não coluna que
  // o limiar deixou passar.
  const st = frameState(file);
  const floorLine = st && Array.isArray(st.floorLine) ? st.floorLine : null;
  if (!floorLine) {
    console.log(`\n=== ${file} — aresta do piso ===`);
    console.log("sem _state.json com floorLine ao lado — recapture com o harness atual.");
    return;
  }

  // Corrida cega: quantas colunas SEGUIDAS ficam sem lábio legível. É este
  // o número que governa a leitura, não a porcentagem de colunas fracas —
  // ver a nota no relatório.
  let run = 0, worstRun = 0;
  const closeRun = () => { worstRun = Math.max(worstRun, run); run = 0; };

  for (let x = 0; x < w; x++) {
    if (masked !== null && masked[x] === 1) { nActor++; closeRun(); continue; }
    const floorY = floorLine[x];
    if (floorY === null || floorY === undefined || floorY < 6 || floorY > h - 4) { nNoFloor++; closeRun(); continue; }

    // Sinal da beirada: o pico mais claro do lábio (tenha ele 1px ou 3px)
    // contra o que está ATRÁS dele. É o que o olho usa pra saber onde dá
    // pra pisar, e agora está medido no lugar certo por construção.
    let lip = 0;
    for (let y = floorY; y <= Math.min(h - 1, floorY + 3); y++) lip = Math.max(lip, L(x, y));
    let backSum = 0, backN = 0;
    for (let y = Math.max(0, floorY - 5); y <= floorY - 2; y++) { backSum += L(x, y); backN++; }
    if (backN === 0) { nNoFloor++; closeRun(); continue; }
    const step = Math.abs(lip - backSum / backN);
    steps.push(step);
    if (step < 0.12) run++; else closeRun();
  }
  closeRun();

  steps.sort((a, b) => a - b);
  const med = steps[Math.floor(steps.length / 2)] ?? 0;
  const p10 = steps[Math.floor(steps.length * 0.1)] ?? 0;
  const weak = steps.filter((s) => s < 0.12).length / steps.length;

  console.log(`\n=== ${file} — aresta do piso ===`);
  console.log(
    `colunas julgadas     ${steps.length} de ${w}` +
      `   (${nActor} ocluidas por ator, ${nNoFloor} sem piso)`,
  );
  console.log(`degrau mediano       ${med.toFixed(3)}`);
  console.log(`degrau no pior 10%   ${p10.toFixed(3)}`);
  console.log(`colunas fracas       ${(weak * 100).toFixed(1)}%  (degrau < 0.12)`);
  console.log(`pior corrida cega    ${worstRun}px seguidos sem labio legivel`);
  console.log(
    `\n${med >= 0.18 ? "OK" : "FALHA"}: mediana ${med >= 0.18 ? "acima" : "abaixo"} de 0.18` +
      `   ${worstRun <= 12 ? "OK" : "FALHA"}: pior corrida ${worstRun}px (limite 12px)`,
  );
  console.log(
    "A CORRIDA e o criterio, a porcentagem e so descricao. Um labio que\n" +
      "escurece em entalhes espalhados e TEXTURA — e o que quebra a regua\n" +
      "clara continua que duas rodadas trabalharam pra tirar. O que cega o\n" +
      "jogador e um TRECHO seguido sem beirada. Medido depois do conserto do\n" +
      "topo: 23-25% de colunas fracas, e a pior corrida em 4-6px nos quatro\n" +
      "cenarios — entalhe, nunca trecho cego. Julgar pela porcentagem teria\n" +
      "reprovado a arte por ter a variacao que ela precisa ter.\n" +
      "Limite de 12px = menos da metade da largura do guerreiro (~27px), ou\n" +
      "seja um vao cego nunca cabe um ponto de pouso inteiro. Calibrado\n" +
      "nesta cena, nao validado contra arte publicada.",
  );
}

if (argv.includes("--edge")) {
  for (const file of files) edgeReport(file);
}

// ---------------------------------------------------------------- cor
/**
 * Onde mora a saturação do quadro — e se existe uma ÂNCORA de cor.
 *
 * A review r12 disse "não há âncora de cor: tudo verde-acinzentado". A
 * medição corrigiu o diagnóstico: o quadro tem 4.6-5.0% de pixels com
 * s>=0.40, o que não é pouco. O problema é ONDE essa saturação mora —
 * ~85% dela é o azul do céu, um campo grande e passivo. Campo grande não
 * ancora; ancora o acento pequeno e saliente, como a moeda.
 *
 * Por isso a métrica separa por FAMÍLIA DE MATIZ em vez de dar um número
 * só de saturação. "Quanto de cor tem" era a pergunta errada; a certa é
 * "quantas famílias de matiz disputam, e qual delas o olho pode usar de
 * âncora".
 *
 *   node shots/measure.mjs <png> --color
 */
const HUE_NAMES = [
  "vermelho", "laranja", "amarelo", "lima", "verde", "primavera",
  "ciano", "azul-cel", "azul", "violeta", "magenta", "rosa",
];

function colorReport(file) {
  const { w, h, nch, px } = decodePNG(readFileSync(file));
  const bins = new Array(12).fill(0);
  let satSum = 0, s25 = 0, s40 = 0;
  const n = w * h;
  for (let k = 0; k < n; k++) {
    const p = k * nch;
    const [hh, s] = rgbToHsl(px[p], px[p + 1], px[p + 2]);
    satSum += s;
    if (s >= 0.25) s25++;
    if (s >= 0.4) {
      s40++;
      bins[Math.min(11, Math.floor(hh * 12))]++;
    }
  }
  const ranked = bins
    .map((v, i) => [v, i])
    .filter(([v]) => v > 0)
    .sort((a, b) => b[0] - a[0]);

  console.log(`\n=== ${file} — cor ===`);
  console.log(`saturacao media  ${(satSum / n).toFixed(3)}`);
  console.log(`s>=0.25          ${((s25 / n) * 100).toFixed(2)}%`);
  console.log(`s>=0.40          ${((s40 / n) * 100).toFixed(2)}%   (o que pode ancorar)`);
  console.log("familias de matiz acima de 0.40:");
  for (const [v, i] of ranked.slice(0, 5)) {
    console.log(`  ${HUE_NAMES[i].padEnd(10)} ${((v / n) * 100).toFixed(2)}%`);
  }

  // O céu ocupa azul/azul-cel e é campo passivo, não âncora. O acento que
  // de fato prende o olho é o quente — e é ele que precisa existir.
  const warm = (bins[0] + bins[1] + bins[2] + bins[11]) / n;
  console.log(
    `\nacento quente (vermelho+laranja+amarelo+rosa)  ${(warm * 100).toFixed(2)}%`,
  );
  console.log(
    "SEM LIMIAR DE APROVACAO de proposito. Area nao e saliencia: a moeda\n" +
      "ancora com fracoes de 1% porque e brilhante, saturada e repetida.\n" +
      "Use como direcao entre rodadas e JULGUE VENDO — foi assim que a\n" +
      "cantoneira de 1px passou (existia ampliada, sumia a 1x).",
  );
}

if (argv.includes("--color")) {
  for (const file of files) colorReport(file);
}
