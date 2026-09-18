import { TILE_SIZE } from "../config/tileset";
import { LEVEL_1_GRID } from "../levels/level1";

/**
 * Tileset desenhado por código. Módulo m1 do push AAA.
 *
 * Por que não um PNG: o tileset original é o OpenGameArt "Platformer Tileset
 * 16x16", estilo NES chapado — medido no baseline, o tile de chão tem
 * 2 tons no matiz dominante e 46% de área com entorno de cor idêntica,
 * contra os 3-4 tons que o DESIGN.md §2.1 exige. Geração por modelo de
 * imagem está proibida (§2.3), então sobra curadoria ou código. Código é
 * o caminho que o projeto já usa no `KnightRenderer` e o único que dá
 * variantes de graça.
 *
 * ── O que mudou na rodada 9 ──────────────────────────────────────────
 *
 * Até a rodada 8 havia 4 variantes por tipo e todas com a MESMA FORMA:
 * mudava a textura, não a silhueta. Ao longo de uma tela inteira o olho
 * ainda achava o padrão, porque um tileset de 16 bits de verdade não é
 * uma peça repetida com ruído diferente — é um alfabeto de peças de
 * meio, borda, quina, transição e decoração.
 *
 * Agora cada tipo tem duas dimensões independentes:
 *
 *   **classe** — vem da VIZINHANÇA. O chão termina de forma diferente
 *   quando é quina esquerda, quina direita, pilar isolado ou pé de
 *   degrau. A classe muda a silhueta (o tile é recortado, com pixels
 *   transparentes) e a iluminação da face exposta.
 *
 *   **slot** — vem de um hash da posição, INDEPENDENTE da vizinhança.
 *   Os slots baixos são variações só de textura; os altos carregam um
 *   adereço da camada de decoração (raiz, ossada, alvenaria rachada,
 *   inscrição ilegível, mato seco, sangramento de podridão, cascalho,
 *   brasão irreconhecível). É isso que desacopla decoração de colisão:
 *   qual adereço aparece não é função da geometria do terreno.
 *
 * A coluna do tilesheet é `classe * SLOTS + slot`, então uma única
 * chamada a `variantFor` carrega as duas informações e o renderer não
 * precisa saber de nada disso.
 *
 * ── O que mudou na rodada 11 ─────────────────────────────────────────
 *
 * Terceira dimensão, e a que mais trabalha a 1x: **material de
 * superfície coluna a coluna** (`surfaceRow`). Até a rodada 10 o
 * material era propriedade do tile inteiro e 70% dos tiles caíam em
 * musgo, então numa corrida plana — onde quase todo tile é da classe MID
 * — o lábio verde emendava de tile em tile e a fileira lia como UMA
 * linha contínua, exatamente o defeito que as variantes existem pra
 * matar. Agora o musgo morre dentro do tile, em clareiras de terra
 * pisada que atravessam a borda de 16px, e o material dominante por slot
 * é uma tabela escolhida (~37% musgo / ~37% terra / ~25% calçamento) em
 * vez de um resto de divisão.
 *
 * ── Luz ──────────────────────────────────────────────────────────────
 *
 * Direção herdada do `RimLight` ([0.32, -0.95]): vem de cima e um pouco
 * da DIREITA. Face exposta à direita recebe borda clara; face exposta à
 * esquerda cai na sombra; degrau à direita projeta sombra sobre o tile.
 *
 * ── Vizinhança sem hook ──────────────────────────────────────────────
 *
 * O grid ASCII da fase é um módulo estático (`levels/level1.ts`), a mesma
 * instância que o `TilemapGame` consome. Ler dele aqui dá o bitmask de
 * vizinhos sem tocar no renderer. `setTerrainOracle` existe pro dia em
 * que houver mais de uma fase — aí o dono do TilemapGame injeta a grid
 * dele e nada mais muda.
 */

export const TILE_KIND = {
  groundTop: 0,
  groundFill: 1,
  platform: 2,
  waterTop: 3,
  waterBody: 4,
  door: 5,
  goalFlag: 6,
  checkpointFlag: 7,
} as const;

const KIND_COUNT = 8;

/** Slots por classe: 8 de textura pura + 8 com adereço de decoração. */
const PLAIN_SLOTS = 8;
const DECOR_SLOTS = 8;
const SLOTS = PLAIN_SLOTS + DECOR_SLOTS;
/** Fatia do hash que cai em slot liso. Adereço em ~38% dos tiles. */
const PLAIN_SHARE = 0.62;

/** Classes de chão exposto (superfície). */
const GT_MID = 0;
const GT_CAP_L = 1;
const GT_CAP_R = 2;
const GT_ISO = 3;
const GT_STEP_L = 4;
const GT_STEP_R = 5;
const GT_CLASSES = 6;

/** Classes de chão interno. */
const GF_CORE = 0;
const GF_FACE_L = 1;
const GF_FACE_R = 2;
const GF_PILLAR = 3;
const GF_UNDER = 4;
const GF_CLASSES = 5;

/** Classes de plataforma one-way. */
const PF_MID = 0;
const PF_END_L = 1;
const PF_END_R = 2;
const PF_SINGLE = 3;
const PF_CLASSES = 4;

/** Colunas do tilesheet. A classe mais larga (chão exposto) manda no total. */
export const TILE_VARIANTS = GT_CLASSES * SLOTS;

/** Hash determinístico — nunca rng: o terreno não pode mudar entre frames. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Paleta das Terras Esquecidas (Região 1). Dessaturada e fria — a cena
 * inteira foi reautorada assim na rodada 1, e um tile saturado brigaria
 * com o fundo e com o grade.
 */
const PAL = {
  mossHi: "#aec98a",
  mossMid: "#7a935f",
  mossLo: "#425435",
  mossDeep: "#212a1b",
  earthHi: "#b3a382",
  earthMid: "#7d6c52",
  earthLo: "#4a4133",
  earthDeep: "#26211a",
  /** Borda de face exposta virada pra luz (cima-direita). */
  earthRim: "#7d6b52",
  stoneHi: "#6d7369",
  stoneMid: "#535a50",
  stoneLo: "#3c423a",
  stoneRim: "#848a7e",
  /** Ocre doentio: a praga assentando nas frestas. Usar POUCO. */
  rot: "#6b6a33",
  rotDim: "#4c4b28",
  rootHi: "#5d4a35",
  root: "#443627",
  rootLo: "#2c231a",
  boneHi: "#b0aa93",
  bone: "#8a8476",
  boneLo: "#5c5849",
  grassHi: "#7d7458",
  grass: "#5c5641",
  waterHi: "#5c7a76",
  waterMid: "#425c5a",
  waterLo: "#2c3f3f",
  wood: "#4a3b2c",
  woodHi: "#63503c",
  woodLo: "#382c20",
  metal: "#8a8f86",
  metalHi: "#c8cdc2",
  /**
   * ÂNCORA DE COR do quadro. Ferrugem/sangue seco, o único matiz quente
   * saturado da arte do mundo — ver TASKS.md, rodada 16.
   *
   * Por que este matiz e não outro, medido antes de escolher: o quadro já
   * tem 4.6-5.0% de pixels com s>=0.40, mas ~85% disso é o AZUL do céu —
   * campo grande e passivo, não âncora. O acento quente que de fato prende
   * o olho somava 0.6-1.0% e quase todo ele estava no HUD ou em item, não
   * no mundo. Ferrugem é complementar do campo verde-acinzentado, não
   * colide com o amarelo puro da moeda (separa por matiz E por valor) nem
   * com o azul do céu, e vai em matéria ESTÁTICA — acento de cenário que
   * parece coletável é erro que o projétil magenta já custou uma rodada.
   *
   * Autorada em s≈0.70-0.79, NÃO na saturação que se quer ver. A primeira
   * versão foi autorada em s≈0.60 — a saturação de destino — e chegava na
   * tela logo ABAIXO de 0.40, sem força de âncora. O pipeline cobra duas
   * vezes no caminho: o grade dessatura por 0.68 e a névoa baixa soma até
   * ~15% de tom pálido justamente na altura do plano de jogo, que é onde
   * a ferrugem mora. Autorar no valor de destino é autorar pro que o
   * pixel era antes do pipeline, não pro que o jogador vê.
   *
   * USAR POUCO — âncora que cobre metade da tela deixa de ancorar. A área
   * é pequena de propósito: é assim que o ouro de SOTN funciona, e é assim
   * que a moeda já funciona aqui. Saliência vem de matiz e brilho, não de
   * cobertura.
   */
  rustHi: "#e8703a",
  rust: "#c04a20",
  rustLo: "#8a3018",
};

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ── Vizinhança ────────────────────────────────────────────────────────

type TerrainOracle = (col: number, row: number) => string;

/**
 * Fora do grid pela ESQUERDA/DIREITA é vazio (a fase acaba, então a quina
 * é real). Fora pelo FUNDO é sólido — senão a última fileira do chão
 * inteira viraria "borda de baixo" e ganharia raiz pendurada sem motivo.
 */
const defaultOracle: TerrainOracle = (col, row) => {
  if (row >= LEVEL_1_GRID.length) return "#";
  const line = LEVEL_1_GRID[row];
  if (line === undefined) return ".";
  if (col < 0 || col >= line.length) return ".";
  return line[col] ?? ".";
};

let oracle: TerrainOracle = defaultOracle;

/** Hook opcional: troca a fonte de vizinhança quando houver mais de uma fase. */
export function setTerrainOracle(next: TerrainOracle | null): void {
  oracle = next ?? defaultOracle;
}

const isSolid = (col: number, row: number): boolean => oracle(col, row) === "#";
const isPlatform = (col: number, row: number): boolean => oracle(col, row) === "=";

// ── Máscara / pintura ─────────────────────────────────────────────────

const N = TILE_SIZE;

/** Máscara de pixels sólidos do tile. É ela que dá silhueta de verdade. */
type Mask = Uint8Array;

function newMask(): Mask {
  return new Uint8Array(N * N);
}

function maskAt(m: Mask, x: number, y: number): boolean {
  return x >= 0 && x < N && y >= 0 && y < N && m[y * N + x] === 1;
}

/** Põe um pixel só onde o tile é sólido — clipa decoração e rim de graça. */
function pxm(ctx: CanvasRenderingContext2D, ox: number, oy: number, m: Mask, x: number, y: number, color: string): void {
  if (!maskAt(m, x, y)) return;
  px(ctx, ox + x, oy + y, 1, 1, color);
}

/** Ruído determinístico dentro da máscara — quebra o preenchimento chapado. */
function grainMask(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  m: Mask,
  seed: number,
  colors: readonly string[],
  density: number,
  fromY = 0,
): void {
  for (let y = fromY; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!maskAt(m, x, y)) continue;
      if (hash2(x + seed * 97, y + seed * 31) > density) continue;
      const c = colors[Math.floor(hash2(x * 7 + seed, y * 13) * colors.length)] ?? colors[0]!;
      px(ctx, ox + x, oy + y, 1, 1, c);
    }
  }
}

/**
 * Recorte de uma face vertical exposta.
 *
 * O perfil é feito de PATAMARES contíguos, não de ruído linha a linha:
 * medido na primeira passada, serrilha de 1px por linha lê como dither
 * sujo a 1x, enquanto três patamares leem como rocha lascada. Só uma
 * lasca solta ocasional quebra o degrau.
 */
function edgeCut(open: boolean, seed: number, side: number): Int16Array {
  const cut = new Int16Array(N);
  if (!open) return cut;
  const b1 = 3 + Math.floor(hash2(seed * 31 + side, 5) * 5);
  const b2 = b1 + 3 + Math.floor(hash2(seed + side * 13, 9) * 5);
  const step = [
    1 + Math.floor(hash2(seed, side + 1) * 2),
    1 + Math.floor(hash2(seed, side + 5) * 3),
    2 + Math.floor(hash2(seed, side + 9) * 2),
  ];
  for (let y = 0; y < N; y++) {
    let c = y < b1 ? step[0]! : y < b2 ? step[1]! : step[2]!;
    if (y > 13) c += 1;
    if (hash2(y + seed * 7, side * 3 + 1) > 0.9) c += 1;
    cut[y] = Math.min(4, Math.max(1, c));
  }
  return cut;
}

// ── Chão exposto (superfície) ─────────────────────────────────────────

/**
 * Material da superfície. É a variação que mais trabalha a 1x: numa
 * corrida plana quase todo tile cai na classe MID, e se o topo for
 * sempre musgo a fileira vira uma faixa verde contínua — o padrão volta
 * mesmo com 16 texturas diferentes. Terra pelada (musgo comido pela
 * praga) e calçamento partido da vila quebram a linha em VALOR e em
 * MATERIAL, não só em ruído.
 */
const SURF_MOSS = 0;
const SURF_BARE = 1;
const SURF_PAVE = 2;

/**
 * Material dominante por slot. Tabela explícita, não módulo: as regras
 * `slot % 7` / `slot % 5` da rodada 10 deixavam 70% dos tiles com musgo,
 * e 70% de musgo numa corrida plana É a linha verde contínua. Aqui a
 * proporção é escolhida — ~37% musgo, ~37% terra pelada, ~25% calçamento
 * — e nos slots de decoração (8..15) o material combina com o adereço
 * que aquele slot carrega: osso e cascalho pousam em terra, alvenaria e
 * laje inscrita pousam em calçamento, mato seco e sangramento em musgo.
 */
const SURF_BY_SLOT: readonly number[] = [
  // 0..7 — slots lisos
  SURF_MOSS, SURF_BARE, SURF_MOSS, SURF_BARE, SURF_PAVE, SURF_MOSS, SURF_BARE, SURF_MOSS,
  // 8..15 — slots com adereço (id = slot - 8)
  SURF_BARE, SURF_BARE, SURF_PAVE, SURF_PAVE, SURF_MOSS, SURF_MOSS, SURF_BARE, SURF_MOSS,
];

/** [topo, meio, baixo, oclusão] por material. */
const SURF_PAL: readonly (readonly [string, string, string, string])[] = [
  [PAL.mossHi, PAL.mossMid, PAL.mossLo, PAL.mossDeep],
  [PAL.earthHi, PAL.earthMid, PAL.earthLo, PAL.earthDeep],
  [PAL.stoneHi, PAL.stoneMid, PAL.stoneLo, PAL.earthDeep],
];

/**
 * Perfil de material COLUNA A COLUNA — o trabalho da rodada 11.
 *
 * Até aqui o material era propriedade do tile INTEIRO. Dois tiles de
 * musgo vizinhos emendavam num lábio verde de 32px contínuos, e como
 * numa corrida plana quase todo tile cai em MID, o olho reencontrava a
 * linha mesmo com o material variando de tile pra tile. Agora o musgo
 * morre DENTRO do tile: clareiras de 3 a 8 colunas de terra pisada, com
 * borda irregular, que podem começar FORA do tile — se toda clareira
 * coubesse dentro, a borda de 16px nunca seria atravessada e o grid
 * voltaria a aparecer. A linha se rompe mesmo num trecho onde todos os
 * tiles sorteados são de musgo.
 */
function surfaceRow(base: number, seed: number): Uint8Array {
  const row = new Uint8Array(N).fill(base);
  // O que aparece onde o dominante falhou: sob o musgo há terra; sob a
  // laje partida, terra; na terra pelada, o musgo que sobreviveu.
  const alt = base === SURF_BARE ? SURF_MOSS : SURF_BARE;
  const gaps = base === SURF_PAVE
    ? (hash2(seed, 101) > 0.5 ? 1 : 0)
    : 1 + (hash2(seed, 101) > 0.42 ? 1 : 0);
  for (let g = 0; g < gaps; g++) {
    const w = 3 + Math.floor(hash2(seed * 3 + g * 17, 103) * 6);
    const x0 = -4 + Math.floor(hash2(seed + g * 11, 107) * (N + 2));
    for (let k = 0; k < w; k++) {
      const x = x0 + k;
      if (x < 0 || x >= N) continue;
      // Extremidade desfiada: a clareira não termina em corte reto.
      if ((k === 0 || k === w - 1) && hash2(x * 5 + seed, 109) > 0.45) continue;
      row[x] = alt;
    }
  }
  return row;
}

/**
 * Espessura do colchão de superfície, em LOBOS contíguos de 4 a 9
 * colunas — e o vigor daquele lobo, que sai do mesmo sorteio.
 *
 * Esta é a correção da segunda tentativa da rodada 11. Trocar o material
 * não bastou (musgo, terra e laje têm todos um tom claro no topo, e o
 * olho segue VALOR antes de cor: a régua continuava lá, só que
 * multicolorida). Mas variar o valor por trecho num campo SEPARADO do
 * material foi pior: dois campos de ruído independentes, cada emenda com
 * seu degrau vertical duro e a banda de oclusão reta por baixo — a
 * fileira virou uma parede de tijolos, medido na captura.
 *
 * Um campo só, então. A espessura do colchão manda em tudo ao mesmo
 * tempo: onde a relva está viva ela é grossa E clara; onde foi pisada é
 * fina E escura. Silhueta, valor e textura mudam juntos, então o degrau
 * entre lobos lê como torrão de terra — forma — e não como junta de
 * alvenaria. A banda de oclusão passa a ondular junto, que é o que tira
 * o retângulo fechado em volta de cada trecho.
 *
 * O primeiro lobo começa FORA do tile (offset negativo) pra que as
 * emendas caiam em qualquer offset e não sempre na borda de 16px.
 */
function lipRow(surf: Uint8Array, seed: number): { depth: Int8Array; vigor: Int8Array } {
  const depth = new Int8Array(N);
  const vigor = new Int8Array(N);
  let x = -Math.floor(hash2(seed, 149) * 8);
  let k = 0;
  while (x < N) {
    // Lobos LARGOS e vigor concentrado no meio. Medido: o plano de jogo
    // estava com 0.478 cortes/px contra 0.374 do fundo — mais picotado
    // que o cenario, entao beirada, buraco e inimigo no chao competiam
    // com textura na mesma frequencia do personagem. Num plataforma o
    // palco tem que ser a camada MAIS limpa, nao a mais ruidosa.
    const w = 7 + Math.floor(hash2(seed * 5 + k * 19, 151) * 8);
    const h = hash2(seed + k * 29, 157);
    const v = h < 0.22 ? 0 : h < 0.78 ? 1 : 2;
    for (let i = 0; i < w; i++, x++) {
      if (x < 0 || x >= N) continue;
      const mat = surf[x]!;
      let d: number;
      if (mat === SURF_PAVE) d = 3;
      else if (mat === SURF_BARE) d = v === 0 ? 1 : 2;
      else d = v === 0 ? 2 : v === 1 ? 3 : 4 + (hash2(x + seed, 161) > 0.6 ? 1 : 0);
      // As pontas do lobo cedem 1px: sem isso o lobo é um degrau reto e
      // volta a ler como peça encaixada.
      if ((i === 0 || i === w - 1) && hash2(x * 3 + seed, 159) > 0.5) d = Math.max(1, d - 1);
      depth[x] = d;
      vigor[x] = v;
    }
    k++;
  }
  return { depth, vigor };
}

function drawGroundTop(ctx: CanvasRenderingContext2D, ox: number, oy: number, cls: number, slot: number): void {
  const seed = cls * SLOTS + slot + 1;
  const openL = cls === GT_CAP_L || cls === GT_ISO;
  const openR = cls === GT_CAP_R || cls === GT_ISO;
  const base = SURF_BY_SLOT[slot % SLOTS] ?? SURF_MOSS;
  const surf = surfaceRow(base, seed);
  const { depth, vigor } = lipRow(surf, seed);
  const clampX = (x: number): number => Math.min(N - 1, Math.max(0, x));
  const matAt = (x: number): number => surf[clampX(x)]!;
  const palAt = (x: number): readonly [string, string, string, string] => SURF_PAL[matAt(x)]!;
  /**
   * Rampa de tons da coluna. `step` 0 é o topo; o vigor do lobo empurra a
   * rampa inteira pro escuro, então relva pisada não é só mais rasa, é
   * mais apagada — a mesma causa física produzindo os dois efeitos.
   *
   * O deslocamento é de DOIS tons no lobo morto, não de um. Medido na
   * banda de valor: com um tom só, musgo, laje e terra iluminada caíam
   * todos entre 0.36 e 0.52 de luminância e a fileira continuava sendo
   * uma régua clara — em preto e branco a variação de material some,
   * porque material é matiz. Com dois, o lobo morto desce pra 0.22-0.30,
   * abaixo do corpo de terra, e vira um entalhe escuro de verdade: é o
   * único evento que interrompe a régua a 1x.
   */
  const shiftOf = (v: number): number => (v === 0 ? 2 : v === 1 ? 1 : 0);
  /**
   * O TOPO quase não escurece junto com o corpo.
   *
   * Este comentário já afirmava "o topo nunca escurece" enquanto o código
   * aplicava `shiftOf` em TODOS os passos, inclusive no 0 — o topo descia
   * dois tons no tufo morto exatamente como o corpo. Comentário descrevendo
   * a intenção e código fazendo outra coisa; segunda vez nesta sessão (a
   * primeira foi o dither de transição do parallax).
   *
   * O que a medição mostrou, com a `--edge` já confiável (linha do piso
   * vinda do tilemap, ator e buraco excluídos): das 292 colunas julgadas
   * em `run_f080`, 126 eram fracas e a diferença estava TODA no lábio —
   * fracas com lábio em 0.242, fortes em 0.419, e o fundo atrás
   * praticamente igual nas duas (0.184 contra 0.215). As fracas vinham em
   * corridas de ~16px, ou seja por tile, não por posição dentro do tile.
   *
   * Fisicamente o topo escurecer também estava errado: uma placa de relva
   * morta continua tendo face voltada pro céu. O que ela perde é cor e
   * volume, não a luz que bate em cima.
   *
   * Deslocamento do topo limitado a 1 em vez de zerado: o entalhe escuro
   * do lobo morto é "o único evento que interrompe a régua a 1x" (ver a
   * rampa acima) e zerar o topo devolveria a fileira contínua e clara que
   * duas rodadas trabalharam pra quebrar. O entalhe continua vindo do
   * corpo, que escurece cheio, e do degrau de 1px que o lobo morto assenta.
   */
  const toneAt = (x: number, step: number): string => {
    const shift = shiftOf(vigor[clampX(x)]!);
    const applied = step === 0 ? Math.min(1, shift) : shift;
    return palAt(x)[Math.min(3, Math.max(0, step + applied))]!;
  };

  // Perfil do topo: erosão de 1px espalhada (silhueta viva mesmo no tile
  // de meio) e até 2px perto de uma quina exposta, onde a borda desmorona.
  // Laje cortada não erode: fica plana, e é justamente esse contraste de
  // contorno que denuncia o trecho de calçamento no meio da terra — agora
  // dentro do próprio tile, coluna a coluna.
  const topY = new Int16Array(N);
  for (let x = 0; x < N; x++) {
    // O lobo morto ASSENTA. Não é enfeite: um entalhe pintado de escuro
    // sem baixar a superfície lê como mancha; baixado, lê como pisada. E
    // o degrau é o que dá ao entalhe uma borda superior contra o céu,
    // que é onde a régua se rompe de fato.
    let t = vigor[x] === 0 ? 1 : 0;
    if (matAt(x) === SURF_PAVE) {
      topY[x] = t;
      continue;
    }
    if (hash2(x * 13 + seed * 29, seed * 7 + 3) > 0.84) t += 1;
    // Terra pisada assenta mais um degrau abaixo do colchão vivo ao lado.
    if (matAt(x) === SURF_BARE && base === SURF_MOSS) t += 1;
    if (openL && x < 3 && hash2(x + seed, 41) > 0.3) t += 1;
    if (openR && x > 12 && hash2(x + seed, 43) > 0.3) t += 1;
    topY[x] = Math.min(2, t);
  }

  const cutL = edgeCut(openL, seed, 0);
  const cutR = edgeCut(openR, seed, 1);

  const m = newMask();
  for (let y = 0; y < N; y++) {
    const lo = cutL[y]!;
    const hi = N - 1 - cutR[y]!;
    for (let x = lo; x <= hi; x++) {
      if (y >= topY[x]!) m[y * N + x] = 1;
    }
  }

  // Corpo: colchão de superfície em degradê → banda de oclusão → terra →
  // base escura. A profundidade do colchão e a rampa de tons vêm do lobo,
  // então mudam de coluna pra coluna; o banding do subsolo usa y ABSOLUTO
  // pra que a base escura alinhe entre tiles vizinhos.
  const lipOf = (x: number): number => depth[clampX(x)]!;
  for (let x = 0; x < N; x++) {
    const mat = matAt(x);
    const lip = lipOf(x);
    // Lasco claro só no lobo mais vigoroso, e raro: devolve cintilação
    // pontual sem reconstruir a régua.
    let top = toneAt(x, 0);
    if (vigor[x] === 2 && hash2(x * 11 + seed * 5, 19) > 0.84) {
      top = mat === SURF_PAVE ? PAL.stoneRim : mat === SURF_BARE ? PAL.earthRim : PAL.mossHi;
    }
    for (let y = 0; y < N; y++) {
      if (!maskAt(m, x, y)) continue;
      const d = y - topY[x]!;
      let c: string;
      // Degradê DENTRO do colchão, não banda chapada. Um lobo grosso
      // pintado inteiro no tom claro é um bloco de 5px com quina viva —
      // medido na captura, a fileira voltou a ler como caixotes
      // enfileirados. Escurecendo a cada pixel de profundidade o mesmo
      // lobo vira touceira: claro no fio de cima, apagando pra raiz.
      if (d === 0) c = top;
      else if (d === 1) c = toneAt(x, 1);
      else if (d <= lip) c = toneAt(x, 2);
      else if (d === lip + 1) c = palAt(x)[3]!;
      else if (y < 10) c = PAL.earthMid;
      else if (y < 14) c = PAL.earthLo;
      else c = PAL.earthDeep;
      px(ctx, ox + x, oy + y, 1, 1, c);
    }
  }

  // Emenda entre lobos: a coluna de fronteira troca de lobo linha a
  // linha. Sem isso o corte entre um lobo vivo e um pisado é uma quina
  // vertical perfeita de 4px e o par lê como duas peças encostadas.
  for (let x = 1; x < N; x++) {
    if (vigor[x] === vigor[x - 1]) continue;
    for (const [dst, src] of [[x, x - 1], [x - 1, x]] as const) {
      const lip = lipOf(dst);
      for (let d = 0; d <= lip; d++) {
        if (hash2(dst * 7 + seed, d * 13 + 167) < 0.55) continue;
        const step = d === 0 ? 0 : d === 1 ? 1 : 2;
        pxm(ctx, ox, oy, m, dst, topY[dst]! + d, toneAt(src, step));
      }
    }
  }

  // Sombra projetada do degrau. A luz vem de cima-DIREITA (herdado do
  // RimLight, [0.32,-0.95]), então um lobo alto escurece o vizinho à
  // ESQUERDA. É o que faz a ondulação ler como relevo em vez de como
  // faixas pintadas — e cada sombra dessas é mais um corte na régua.
  for (let x = 0; x < N - 1; x++) {
    const rise = topY[x]! - topY[x + 1]!;
    if (rise < 1) continue;
    pxm(ctx, ox, oy, m, x, topY[x]!, palAt(x)[3]!);
    if (rise > 1) pxm(ctx, ox, oy, m, x, topY[x]! + 1, palAt(x)[3]!);
  }

  // Costura entre materiais — SÓ a franja de musgo. A junta escura que
  // havia aqui na primeira tentativa punha um divisor vertical em toda
  // troca de material e era metade do efeito de tijolo; o degrau de
  // espessura já separa os dois materiais sem precisar de contorno.
  for (let x = 1; x < N; x++) {
    const a = matAt(x - 1);
    const b = matAt(x);
    if (a === b) continue;
    const mossX = a === SURF_MOSS ? x - 1 : b === SURF_MOSS ? x : -1;
    if (mossX < 0) continue;
    // O musgo desfia POR CIMA do vizinho — a borda viva avança, não é
    // aparada. Só onde ele está vigoroso: relva pisada não invade nada.
    const o = mossX === x ? x - 1 : x + 1;
    if (o < 0 || o >= N || vigor[mossX] === 0) continue;
    pxm(ctx, ox, oy, m, o, topY[o]!, PAL.mossLo);
    if (hash2(o + seed, 113) > 0.45) pxm(ctx, ox, oy, m, o, topY[o]! + 1, PAL.mossDeep);
  }

  if (base === SURF_PAVE) {
    // Junta entre lajes, com musgo brotando dela. Uma junta por tile —
    // duas já lêem como tijolinho e o tile perde escala. Só cai em coluna
    // que ainda é laje: no trecho de terra não existe junta.
    let j = 3 + Math.floor(hash2(seed, 61) * 10);
    for (let k = 0; k < N && matAt(j) !== SURF_PAVE; k++) j = (j + 1) % N;
    if (matAt(j) === SURF_PAVE) {
      for (let y = 0; y <= 3; y++) pxm(ctx, ox, oy, m, j, y, PAL.stoneLo);
      pxm(ctx, ox, oy, m, j, 0, PAL.earthDeep);
      if (hash2(seed, 63) > 0.4) {
        pxm(ctx, ox, oy, m, j, 1, PAL.mossDeep);
        pxm(ctx, ox, oy, m, j - 1, 0, PAL.mossLo);
      }
    }
    // canto lascado da laje
    const chip = hash2(seed, 67) > 0.5 ? 0 : N - 1;
    if (matAt(chip) === SURF_PAVE) {
      pxm(ctx, ox, oy, m, chip, 0, PAL.stoneLo);
      pxm(ctx, ox, oy, m, chip, 1, PAL.earthDeep);
    }
  }

  // Terra pisada: pedrinha aflorando e cova rasa. Textura de chão gasto —
  // é o que impede a clareira de virar um retângulo liso mais escuro.
  for (let x = 0; x < N; x++) {
    if (matAt(x) !== SURF_BARE) continue;
    const y0 = topY[x]!;
    const h = hash2(x * 17 + seed * 9, 29);
    if (h > 0.9) {
      pxm(ctx, ox, oy, m, x, y0 + 1, PAL.stoneMid);
      pxm(ctx, ox, oy, m, x, y0 + 2, PAL.stoneLo);
    } else if (h < 0.1) {
      pxm(ctx, ox, oy, m, x, y0, PAL.earthLo);
      pxm(ctx, ox, oy, m, x, y0 + 1, PAL.earthDeep);
    }
  }

  grainMask(ctx, ox, oy, m, seed, [PAL.earthMid, PAL.earthLo], 0.07, 6);

  // Barba de musgo descendo pela terra. Em TUFOS, não espalhada: na
  // primeira passada o musgo caía em ~22% das colunas de todo tile e a
  // fileira inteira virava um pente regular — o próprio padrão que essas
  // variantes existem pra matar. Alguns tiles não têm tufo nenhum.
  const tufts = Math.floor(hash2(seed, 71) * 3);
  for (let t = 0; t < tufts; t++) {
    const cx = Math.floor(hash2(seed * 5 + t, 19) * 14);
    const cw = 2 + Math.floor(hash2(seed + t, 23) * 3);
    for (let k = 0; k < cw; k++) {
      const x = cx + k;
      if (x >= N) break;
      // A barba só desce de onde há musgo vivo. Tufo pendurado sob terra
      // pisada era o pente da rodada 10 reaparecendo por outra porta.
      if (matAt(x) !== SURF_MOSS) continue;
      const start = topY[x]! + lipOf(x) + 1;
      const len = 1 + Math.floor(hash2(x * 3 + seed, t + 1) * 4);
      pxm(ctx, ox, oy, m, x, start, PAL.mossLo);
      for (let y = start + 1; y < start + len; y++) pxm(ctx, ox, oy, m, x, y, PAL.mossDeep);
    }
  }

  // Faces expostas. Luz de cima-direita: direita ganha borda clara,
  // esquerda afunda. É o que separa quina esquerda de quina direita a
  // olho nu, mesmo com a mesma textura.
  if (openR) {
    for (let y = 0; y < N; y++) {
      const ex = N - 1 - cutR[y]!;
      if (!maskAt(m, ex, y)) continue;
      const d = y - topY[ex]!;
      // A borda não é uma linha de valor único: alterna em camadas, senão
      // lê como contorno desenhado por cima da rocha.
      const rim = hash2(seed, Math.floor(y / 3)) > 0.45 ? PAL.earthRim : PAL.earthHi;
      pxm(ctx, ox, oy, m, ex, y, d <= 1 ? palAt(ex)[0] : y > 13 ? PAL.earthMid : rim);
      if (d > 2 && y <= 13) pxm(ctx, ox, oy, m, ex - 1, y, PAL.earthMid);
    }
  }
  if (openL) {
    for (let y = 0; y < N; y++) {
      const ex = cutL[y]!;
      if (!maskAt(m, ex, y)) continue;
      const d = y - topY[ex]!;
      pxm(ctx, ox, oy, m, ex, y, d <= 1 ? palAt(ex)[2] : PAL.earthDeep);
      if (d > 1) pxm(ctx, ox, oy, m, ex + 1, y, PAL.earthLo);
    }
  }

  // Pé de degrau. À esquerda é só oclusão de quina (estreita); à direita
  // o bloco de cima intercepta a luz, então a sombra projetada é larga.
  if (cls === GT_STEP_L) {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < N; y++) {
        if (!maskAt(m, x, y)) continue;
        const d = y - topY[x]!;
        if (x === 0 || hash2(x + seed, y) > 0.25) {
          // Sombra de quina no tom do PRÓPRIO material: musgo escuro sobre
          // laje pintava verde numa pedra e denunciava o atalho.
          pxm(ctx, ox, oy, m, x, y, d <= lipOf(x) ? palAt(x)[2] : y < 10 ? PAL.earthLo : PAL.earthDeep);
        }
      }
    }
  } else if (cls === GT_STEP_R) {
    for (let x = 10; x < N; x++) {
      const strength = (x - 9) / 6;
      for (let y = 0; y < N; y++) {
        if (!maskAt(m, x, y)) continue;
        if (hash2(x * 3 + seed, y * 5) > strength) continue;
        const d = y - topY[x]!;
        pxm(ctx, ox, oy, m, x, y, d <= lipOf(x) ? palAt(x)[3] : PAL.earthDeep);
      }
    }
  }

  if (slot >= PLAIN_SLOTS) {
    drawDecor(ctx, ox, oy, m, slot - PLAIN_SLOTS, seed, topY[8]! + lipOf(8) + 2, 14, true);
  }
}

// ── Chão interno ──────────────────────────────────────────────────────

function drawGroundFill(ctx: CanvasRenderingContext2D, ox: number, oy: number, cls: number, slot: number): void {
  const seed = 200 + cls * SLOTS + slot;
  const openL = cls === GF_FACE_L || cls === GF_PILLAR;
  const openR = cls === GF_FACE_R || cls === GF_PILLAR;
  const openD = cls === GF_UNDER;

  const cutL = edgeCut(openL, seed, 2);
  const cutR = edgeCut(openR, seed, 3);

  const m = newMask();
  for (let y = 0; y < N; y++) {
    const lo = cutL[y]!;
    const hi = N - 1 - cutR[y]!;
    for (let x = lo; x <= hi; x++) m[y * N + x] = 1;
  }

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!maskAt(m, x, y)) continue;
      px(ctx, ox + x, oy + y, 1, 1, y < 11 ? PAL.earthLo : PAL.earthDeep);
    }
  }
  grainMask(ctx, ox, oy, m, seed, [PAL.earthMid, PAL.earthLo], 0.09);

  // Estratos: duas linhas horizontais quebradas. Dão escala ao subsolo e
  // são o que impede a terra de ler como um retângulo de ruído.
  for (const band of [4, 11]) {
    const yy = band + (hash2(seed, band) > 0.5 ? 1 : 0);
    for (let x = 0; x < N; x++) {
      if (hash2(x * 9 + seed, band) < 0.22) continue;
      pxm(ctx, ox, oy, m, x, yy, PAL.earthDeep);
      pxm(ctx, ox, oy, m, x, yy - 1, PAL.earthMid);
    }
  }

  // Pedras embutidas — só no miolo; na face expostas quem manda é a rocha.
  if (!openL && !openR) {
    const rocks = 1 + Math.floor(hash2(seed, 21) * 3);
    for (let i = 0; i < rocks; i++) {
      const rx = Math.floor(hash2(seed * 13 + i, 5) * 11) + 1;
      const ry = Math.floor(hash2(seed * 7 + i, 9) * 11) + 2;
      const rw = 2 + Math.floor(hash2(i, seed) * 3);
      for (let k = 0; k < rw; k++) {
        pxm(ctx, ox, oy, m, rx + k, ry, PAL.stoneMid);
        pxm(ctx, ox, oy, m, rx + k, ry + 1, PAL.stoneLo);
        pxm(ctx, ox, oy, m, rx + k, ry + 2, PAL.earthDeep);
      }
    }
  }

  // Face de rocha exposta: a parede vertical não é terra, é pedra em
  // camadas. Material diferente + silhueta recortada = peça de borda de
  // verdade, não a mesma peça mais escura.
  const rockFace = (side: number, cut: Int16Array): void => {
    const lit = side > 0;
    for (let y = 0; y < N; y++) {
      const ex = lit ? N - 1 - cut[y]! : cut[y]!;
      for (let k = 0; k < 4; k++) {
        const x = lit ? ex - k : ex + k;
        if (!maskAt(m, x, y)) continue;
        const band = Math.floor((y + hash2(seed, y) * 2) / 3) % 3;
        let c = band === 0 ? PAL.stoneMid : band === 1 ? PAL.stoneLo : PAL.earthLo;
        if (k === 0) c = lit ? PAL.stoneRim : PAL.earthDeep;
        else if (k === 1) c = lit ? PAL.stoneHi : PAL.stoneLo;
        else if (k === 3) c = PAL.earthLo;
        px(ctx, ox + x, oy + y, 1, 1, c);
      }
      // fenda vertical partindo a face
      if (hash2(y * 7 + seed, 77) > 0.72) {
        pxm(ctx, ox, oy, m, lit ? ex - 2 : ex + 2, y, PAL.earthDeep);
      }
    }
  };
  if (openR) rockFace(1, cutR);
  if (openL) rockFace(-1, cutL);

  // Barriga exposta: lábio de saliência claro e tocos de raiz descendo.
  if (openD) {
    for (let x = 0; x < N; x++) {
      pxm(ctx, ox, oy, m, x, 12, PAL.earthMid);
      pxm(ctx, ox, oy, m, x, 13, PAL.earthDeep);
      pxm(ctx, ox, oy, m, x, 14, PAL.earthDeep);
      pxm(ctx, ox, oy, m, x, 15, PAL.rootLo);
      if (hash2(x * 19 + seed, 13) > 0.7) {
        const len = 1 + Math.floor(hash2(x, seed) * 3);
        for (let k = 0; k < len; k++) pxm(ctx, ox, oy, m, x, 13 + k, PAL.root);
        pxm(ctx, ox, oy, m, x, 12, PAL.rootHi);
      }
    }
  } else {
    for (let x = 0; x < N; x++) pxm(ctx, ox, oy, m, x, 15, PAL.earthDeep);
  }

  if (slot >= PLAIN_SLOTS) {
    drawDecor(ctx, ox, oy, m, slot - PLAIN_SLOTS, seed, 2, openD ? 11 : 14, false);
  }
}

// ── Plataforma one-way ────────────────────────────────────────────────

function drawPlatform(ctx: CanvasRenderingContext2D, ox: number, oy: number, cls: number, slot: number): void {
  const seed = 400 + cls * SLOTS + slot;
  const endL = cls === PF_END_L || cls === PF_SINGLE;
  const endR = cls === PF_END_R || cls === PF_SINGLE;
  const x0 = endL ? 1 : 0;
  const x1 = endR ? N - 2 : N - 1;

  const m = newMask();
  for (let y = 0; y < 6; y++) for (let x = x0; x <= x1; x++) m[y * N + x] = 1;

  for (let y = 0; y < 6; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = y === 0 ? PAL.woodHi : y < 3 ? PAL.wood : y < 5 ? PAL.woodLo : PAL.earthDeep;
      px(ctx, ox + x, oy + y, 1, 1, c);
    }
  }
  // Veio da madeira: riscos curtos, nunca a linha inteira.
  for (let x = x0; x <= x1; x++) {
    if (hash2(x + seed * 23, 1) > 0.72) {
      pxm(ctx, ox, oy, m, x, 1, PAL.woodLo);
      pxm(ctx, ox, oy, m, x, 2, PAL.wood);
    }
    if (hash2(x * 5 + seed, 9) > 0.86) pxm(ctx, ox, oy, m, x, 3, PAL.woodHi);
  }
  // Apodrecimento: uma falha na tábua em parte das variantes.
  if (slot % 3 === 0) {
    const bx = 3 + Math.floor(hash2(seed, 31) * 9);
    for (let k = 0; k < 3; k++) pxm(ctx, ox, oy, m, bx + k, 4, PAL.earthDeep);
    pxm(ctx, ox, oy, m, bx + 1, 3, PAL.rotDim);
  }
  // Cantoneira de ferro na ponta: a peça de ponta existe, não é a de meio
  // cortada. O ferro está ENFERRUJADO, e isso faz dois trabalhos de uma vez:
  // é a âncora de cor quente do quadro (ver `PAL.rust`) e marca onde a
  // plataforma ACABA. Beirada é a informação que o jogador mais precisa ler
  // em movimento, e um tique quente na ponta a entrega por matiz, sem
  // depender só do degrau de valor — que é justamente o que a métrica
  // `--edge` mostra fraco no pior 10% das colunas.
  //
  // O pixel de metal limpo fica: sem ele a peça lê como tinta laranja em
  // vez de ferro oxidado. Ferrugem é o que sobrou do metal, não uma cor
  // aplicada em cima dele.
  // 2px de largura, não 1: verificado ampliado em `vista_f299`, a versão de
  // 1px existia mas sumia a 1x — um pixel de acento é uma cintilação, não
  // uma âncora. 2px é o mínimo que lê como PEÇA a essa resolução.
  if (endL) {
    for (let y = 0; y < 5; y++) px(ctx, ox + x0, oy + y, 1, 1, PAL.woodLo);
    for (let y = 1; y < 5; y++) px(ctx, ox + x0 + 1, oy + y, 2, 1, PAL.rust);
    px(ctx, ox + x0 + 1, oy + 1, 2, 1, PAL.rustHi);
    px(ctx, ox + x0 + 1, oy + 2, 1, 1, PAL.metalHi);
    px(ctx, ox + x0 + 1, oy + 4, 2, 1, PAL.rustLo);
  }
  if (endR) {
    for (let y = 0; y < 5; y++) px(ctx, ox + x1 - 1, oy + y, 2, 1, PAL.rust);
    px(ctx, ox + x1 - 1, oy, 2, 1, PAL.rustHi);
    px(ctx, ox + x1, oy + 2, 1, 1, PAL.metalHi);
    px(ctx, ox + x1 - 1, oy + 4, 2, 1, PAL.rustLo);
    // Escorrido de óxido descendo pela tábua: ferrugem mancha o que está
    // embaixo dela. É o que separa "peça pintada" de "peça que enferrujou
    // ali por muito tempo".
    px(ctx, ox + x1 - 2, oy + 4, 1, 1, PAL.rustLo);
  }
  if (!endL && !endR && slot % 4 === 1) {
    // junta entre tábuas — só em algumas peças de meio
    for (let y = 0; y < 5; y++) px(ctx, ox + 7, oy + y, 1, 1, PAL.woodLo);
    px(ctx, ox + 8, oy, 1, 1, PAL.woodHi);
  }
  if (slot >= PLAIN_SLOTS && slot % 2 === 0) {
    // decoração da plataforma: musgo agarrado na quina de cima
    const gx = 2 + Math.floor(hash2(seed, 51) * 10);
    for (let k = 0; k < 3; k++) {
      pxm(ctx, ox, oy, m, gx + k, 0, PAL.mossMid);
      if (hash2(gx + k, seed) > 0.5) pxm(ctx, ox, oy, m, gx + k, 1, PAL.mossDeep);
    }
    pxm(ctx, ox, oy, m, gx, 0, PAL.mossHi);
  }
}

// ── Camada de decoração ───────────────────────────────────────────────

/**
 * Oito adereços. O índice vem do slot — hash da posição — e não da classe
 * de vizinhança, então o mesmo canto de chão pode ter osso, raiz ou nada.
 *
 * Vocabulário escolhido pelo lore: The Rot corrói carne, pedra E memória.
 * O adereço que carrega o tom é o que se APAGA — a inscrição ilegível, o
 * brasão que ninguém mais reconhece — não o gore. Região 1 é
 * estranhamento, não fim do mundo.
 */
function drawDecor(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  m: Mask,
  id: number,
  seed: number,
  yTop: number,
  yBot: number,
  surface: boolean,
): void {
  const span = Math.max(1, yBot - yTop - 2);
  const py = yTop + Math.floor(hash2(seed, 3) * span);
  const pxx = 2 + Math.floor(hash2(seed, 5) * 6);
  const put = (x: number, y: number, c: string): void => pxm(ctx, ox, oy, m, x, y, c);

  switch (id) {
    case 0: {
      // raiz exposta, correndo na horizontal com uma bifurcação
      const w = 7 + Math.floor(hash2(seed, 6) * 5);
      let y = py;
      for (let i = 0; i < w; i++) {
        const x = pxx + i;
        if (hash2(x + seed, 17) > 0.76) y += hash2(x, seed) > 0.5 ? 1 : -1;
        y = Math.max(yTop, Math.min(yBot, y));
        put(x, y - 1, PAL.rootHi);
        put(x, y, PAL.root);
        put(x, y + 1, PAL.rootLo);
        if (i === Math.floor(w * 0.6)) {
          put(x, y + 2, PAL.root);
          put(x + 1, y + 3, PAL.rootLo);
        }
      }
      break;
    }
    case 1: {
      // ossada: fragmento de costela meio enterrado
      const w = 5 + Math.floor(hash2(seed, 8) * 3);
      for (let i = 0; i < w; i++) {
        const x = pxx + i;
        const y = py + (i > w / 2 ? 1 : 0);
        put(x, y, PAL.boneHi);
        put(x, y + 1, PAL.bone);
        put(x, y + 2, PAL.earthDeep);
      }
      put(pxx - 1, py, PAL.bone);
      put(pxx - 1, py + 1, PAL.boneLo);
      put(pxx + w, py + 1, PAL.bone);
      put(pxx + w, py + 2, PAL.boneLo);
      break;
    }
    case 2: {
      // alvenaria da vila: bloco cortado, rachado ao meio
      const w = 6;
      const h = 4;
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          const c = j === 0 ? PAL.stoneHi : j === h - 1 ? PAL.stoneLo : PAL.stoneMid;
          put(pxx + i, py + j, c);
        }
      }
      const crack = 1 + Math.floor(hash2(seed, 12) * (w - 2));
      for (let j = 0; j < h; j++) put(pxx + crack + (j > 1 ? 1 : 0), py + j, PAL.earthDeep);
      for (let i = 0; i < w; i++) put(pxx + i, py + h, PAL.earthDeep);
      break;
    }
    case 3: {
      // laje com inscrição ilegível — o detalhe que se apaga
      const w = 7;
      const h = 5;
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          put(pxx + i, py + j, j === 0 ? PAL.stoneMid : j === h - 1 ? PAL.stoneLo : PAL.stoneLo);
        }
      }
      // As marcas não formam letra nenhuma, e metade já sumiu: o brasão
      // ilegível é o motivo visual da Região 1 — memória corroída, não gore.
      for (let k = 0; k < 3; k++) {
        const mx = pxx + 1 + k * 2;
        const my = py + 1;
        const gone = hash2(seed + k, 23) > 0.45;
        put(mx, my, gone ? PAL.stoneMid : PAL.earthDeep);
        if (!gone) put(mx, my + 1, PAL.earthDeep);
        if (!gone && hash2(k, seed) > 0.5) put(mx + 1, my + 1, PAL.stoneLo);
      }
      for (let i = 0; i < w; i++) put(pxx + i, py + h, PAL.earthDeep);
      break;
    }
    case 4: {
      if (surface) {
        // mato seco deitado no lábio — nada cresce mais aqui
        for (let k = 0; k < 5; k++) {
          const sx = pxx + k * 2;
          const lean = hash2(sx, seed) > 0.5 ? 1 : -1;
          put(sx, py, PAL.grassHi);
          put(sx + lean, py + 1, PAL.grass);
          put(sx + lean, py + 2, PAL.earthDeep);
        }
      } else {
        // radicela: fios finos descendo
        for (let k = 0; k < 6; k++) {
          const sx = pxx + k;
          const len = 2 + Math.floor(hash2(sx, seed) * 4);
          for (let j = 0; j < len; j++) put(sx, py + j, j === 0 ? PAL.rootHi : PAL.root);
        }
      }
      break;
    }
    case 5: {
      // sangramento da praga numa fenda — ocre, pouquíssimo
      let y = py;
      for (let i = 0; i < 6; i++) {
        const x = pxx + i;
        if (hash2(x, seed) > 0.6) y += 1;
        put(x, y, PAL.earthDeep);
        put(x, y + 1, PAL.rotDim);
        if (hash2(x + seed, 3) > 0.6) put(x, y - 1, PAL.rot);
      }
      break;
    }
    case 6: {
      // cascalho: pedrinhas soltas com contato escuro
      for (let k = 0; k < 5; k++) {
        const gx = pxx + Math.floor(hash2(seed + k, 31) * 9) - 2;
        const gy = py + Math.floor(hash2(seed + k, 37) * 5);
        put(gx, gy, PAL.stoneHi);
        put(gx + 1, gy, PAL.stoneMid);
        put(gx, gy + 1, PAL.stoneLo);
        put(gx + 1, gy + 1, PAL.earthDeep);
      }
      break;
    }
    default: {
      // quina de tijolo com brasão que ninguém mais reconhece
      const w = 5;
      const h = 5;
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          if (i + j > w + 1 && hash2(i + seed, j) > 0.4) continue;
          put(pxx + i, py + j, j === 0 ? PAL.stoneHi : PAL.stoneMid);
        }
      }
      const ex = pxx + 1;
      const ey = py + 1;
      for (let k = 0; k < 6; k++) {
        if (hash2(seed + k, 43) > 0.55) continue;
        put(ex + (k % 3), ey + Math.floor(k / 3), PAL.stoneLo);
      }
      put(ex + 1, ey + 2, PAL.rotDim);
      for (let i = 0; i < w; i++) put(pxx + i, py + h, PAL.earthDeep);
      break;
    }
  }
}

// ── Água ──────────────────────────────────────────────────────────────

/**
 * Água. As colunas 0..3 do tilesheet NAO sao variantes de posicao — sao
 * FASES DE CICLO DE PALETA, escolhidas por tempo.
 *
 * Color cycling e requisito formal do DESIGN.md 2.2 ("obrigatorio em pelo
 * menos 1 elemento por fase") e e a tecnica que mais barato compra vida
 * numa cena estatica: o hardware de 16 bits nao animava a agua, girava a
 * paleta dela. Aqui as fases sao pre-desenhadas e o seletor troca por
 * tempo, que e o equivalente exato.
 */
function drawWater(ctx: CanvasRenderingContext2D, ox: number, oy: number, phase: number, top: boolean): void {
  const m = newMask();
  m.fill(1);
  px(ctx, ox, oy, N, N, PAL.waterMid);
  grainMask(ctx, ox, oy, m, 60, [PAL.waterLo, PAL.waterHi], 0.14);

  for (let y = 2; y < N - 1; y++) {
    const band = (y + phase * 2) % 6;
    if (band === 0) px(ctx, ox, oy + y, N, 1, PAL.waterHi);
    else if (band === 3) px(ctx, ox, oy + y, N, 1, PAL.waterLo);
  }

  if (top) {
    for (let x = 0; x < N; x++) {
      const wave = Math.sin((x + phase * 4) * 0.7) > 0 ? 0 : 1;
      px(ctx, ox + x, oy + wave, 1, 1, PAL.waterHi);
      px(ctx, ox + x, oy + wave + 1, 1, 1, PAL.waterMid);
    }
  }
  px(ctx, ox, oy + 15, N, 1, PAL.waterLo);
}

/** Fases do ciclo de agua — independentes do numero de colunas do sheet. */
export const WATER_PHASES = 4;
export const WATER_PHASE_MS = 180;

/**
 * Porta.
 *
 * A versão anterior era um retângulo marrom com ripas HORIZONTAIS a cada
 * 3px e um ponto de metal — lia como caixote ou armário, não como porta.
 * Ripa horizontal é o oposto de como porta se constrói: tábua de porta é
 * VERTICAL, e são as barras de ferro que atravessam na horizontal. Era o
 * tipo de erro que só aparece quando alguém finalmente olha o tile —
 * este nunca tinha sido capturado.
 *
 * Estrutura: batente de pedra, vão recuado (a sombra que diz "isto é uma
 * abertura, não um painel"), tábuas verticais com veio, duas barras de
 * ferro e argola.
 */
function drawDoor(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  // Batente de pedra em volta — sem moldura a porta flutua na parede.
  px(ctx, ox, oy, N, N, PAL.stoneMid);
  px(ctx, ox, oy, N, 1, PAL.stoneRim);
  px(ctx, ox, oy, 1, N, PAL.stoneLo);
  px(ctx, ox + N - 1, oy, 1, N, PAL.stoneLo);

  // Vão recuado: a linha escura no topo e nas laterais é o que faz o
  // painel ler como afundado no batente em vez de colado por cima.
  px(ctx, ox + 2, oy + 1, 12, 15, PAL.earthDeep);

  // Tábuas VERTICAIS. Larguras irregulares (3/4/3 px) porque tábua serrada
  // à mão não sai igual, e igual é o que faz ler como textura gerada.
  const planks = [
    { x: 3, w: 3 },
    { x: 6, w: 4 },
    { x: 10, w: 3 },
  ];
  for (const [i, p] of planks.entries()) {
    for (let y = 2; y < 15; y++) {
      // Degradê vertical: madeira velha escurece pro pé, onde encosta a
      // umidade do chão.
      const t = (y - 2) / 12;
      const c = t > 0.78 ? PAL.woodLo : t < 0.12 ? PAL.woodHi : PAL.wood;
      px(ctx, ox + p.x, oy + y, p.w, 1, c);
    }
    // Junta entre tábuas e um veio curto por tábua.
    px(ctx, ox + p.x + p.w - 1, oy + 2, 1, 13, PAL.woodLo);
    const gy = 4 + Math.floor(hash2(i * 31 + 5, 17) * 8);
    px(ctx, ox + p.x, oy + gy, 1, 2, PAL.woodLo);
  }

  // Duas barras de ferro atravessando — é o que diz "porta" antes de
  // qualquer outro detalhe, e o que faltava por completo.
  for (const by of [4, 11]) {
    px(ctx, ox + 2, oy + by, 12, 1, PAL.metal);
    px(ctx, ox + 2, oy + by + 1, 12, 1, PAL.rustLo);
    px(ctx, ox + 2, oy + by, 1, 2, PAL.rustLo);
    px(ctx, ox + 13, oy + by, 1, 2, PAL.rustLo);
  }

  // Argola, à direita e na altura da mão.
  px(ctx, ox + 11, oy + 7, 2, 1, PAL.metalHi);
  px(ctx, ox + 10, oy + 8, 1, 2, PAL.metal);
  px(ctx, ox + 13, oy + 8, 1, 2, PAL.metal);
  px(ctx, ox + 11, oy + 9, 2, 1, PAL.metal);
}

/**
 * Estandarte do objetivo / checkpoint.
 *
 * A versão anterior tinha os MESMOS dois defeitos dos espinhos, e pelo
 * mesmo motivo (ninguém nunca capturou este tile): era um triângulo
 * `beginPath/lineTo/fill` — vetorial e antialiasado no meio de arte
 * pixel a pixel — em cor única chapada, com um `#ffffff33` por cima. Alfa
 * translúcido em pixel art inventa tons fora da paleta, que é exatamente
 * o que o DESIGN.md §2.1 não quer.
 *
 * E era o pior ativo do quadro justamente onde mais importa: o estandarte
 * é o ALVO NARRATIVO da fase, a coisa pra onde o nível inteiro aponta.
 *
 * Agora: pano RASGADO, em 3 tons, com a borda de fuga mordida. Não é
 * enfeite — um mundo tomado por The Rot não tem bandeira nova, e o
 * esfarrapado é o que diferencia "marco de um mundo que perdeu" de
 * "bandeirinha de chegada de corrida".
 */
function drawFlag(ctx: CanvasRenderingContext2D, ox: number, oy: number, base: number, seed: number): void {
  // Mastro: ferro, face esquerda pegando a luz do horizonte como o resto
  // da cena, e alargando na base pra não parecer espetado no ar.
  for (let y = 1; y < N; y++) px(ctx, ox + 3, oy + y, 1, 1, PAL.metal);
  for (let y = 1; y < N; y++) px(ctx, ox + 4, oy + y, 1, 1, PAL.stoneLo);
  px(ctx, ox + 3, oy + 1, 1, 1, PAL.metalHi);
  px(ctx, ox + 2, oy + N - 2, 4, 2, PAL.stoneLo);
  px(ctx, ox + 2, oy + N - 1, 4, 1, PAL.earthDeep);

  const cloth = shadeHex(base, 0);
  const clothHi = shadeHex(base, 0.26);
  const clothLo = shadeHex(base, -0.3);

  // Pano: alto de 7px, saindo do mastro. A borda de fuga é mordida por
  // hash, e o comprimento cai nas pontas — pano preso por cima e por
  // baixo esvoaça mais no meio.
  const top = 2;
  const h = 7;
  for (let i = 0; i < h; i++) {
    const y = top + i;
    const t = i / (h - 1);
    // Barriga do pano: mais longo no meio do que nas bordas presas.
    let len = 5 + Math.round(Math.sin(t * Math.PI) * 3);
    // Rasgo: algumas fileiras perdem 1-3px de ponta.
    const bite = hash2(seed + i * 13, 71);
    if (bite > 0.62) len -= 1 + Math.floor(bite * 3);
    len = Math.max(2, len);

    for (let k = 0; k < len; k++) {
      const x = 5 + k;
      if (x >= N) break;
      // Dobra: a metade de cima pega luz, a de baixo cai na sombra, e a
      // ponta escurece — é o que dá volume em vez de recorte de papel.
      let c = cloth;
      if (i <= 1) c = clothHi;
      else if (i >= h - 2) c = clothLo;
      if (k >= len - 1) c = clothLo;
      px(ctx, ox + x, oy + y, 1, 1, c);
    }
    // Fiapo solto de vez em quando, 1px além da borda: é o detalhe que
    // faz o rasgo ler como TECIDO e não como corte de tesoura.
    if (hash2(seed + i * 7, 91) > 0.78 && 5 + len < N) {
      px(ctx, ox + 5 + len, oy + y, 1, 1, clothLo);
    }
  }
}

/** Clareia/escurece uma cor 0xRRGGBB e devolve em CSS. */
function shadeHex(color: number, amount: number): string {
  const t = Math.abs(amount);
  const target = amount >= 0 ? 255 : 0;
  const ch = (shift: number): number => {
    const v = (color >> shift) & 255;
    return Math.round(v + (target - v) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

// ── Sheet ─────────────────────────────────────────────────────────────

/**
 * Gera o tilesheet: colunas = classe*SLOTS+slot, linhas = tipos de tile.
 * Chamado uma vez na criação do jogo.
 */
export function buildTileSheet(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE * TILE_VARIANTS;
  canvas.height = TILE_SIZE * KIND_COUNT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("TileArt: contexto 2d indisponível");
  ctx.imageSmoothingEnabled = false;

  for (let v = 0; v < TILE_VARIANTS; v++) {
    const ox = v * TILE_SIZE;
    const slot = v % SLOTS;
    const cls = Math.floor(v / SLOTS);

    drawGroundTop(ctx, ox, TILE_KIND.groundTop * TILE_SIZE, Math.min(cls, GT_CLASSES - 1), slot);
    drawGroundFill(ctx, ox, TILE_KIND.groundFill * TILE_SIZE, cls < GF_CLASSES ? cls : GF_CORE, slot);
    drawPlatform(ctx, ox, TILE_KIND.platform * TILE_SIZE, cls < PF_CLASSES ? cls : PF_MID, slot);
    drawWater(ctx, ox, TILE_KIND.waterTop * TILE_SIZE, v % WATER_PHASES, true);
    drawWater(ctx, ox, TILE_KIND.waterBody * TILE_SIZE, v % WATER_PHASES, false);
    drawDoor(ctx, ox, TILE_KIND.door * TILE_SIZE);
    drawFlag(ctx, ox, TILE_KIND.goalFlag * TILE_SIZE, 0xb8483a, 500 + v * 17);
    drawFlag(ctx, ox, TILE_KIND.checkpointFlag * TILE_SIZE, 0x7f9a5e, 700 + v * 23);
  }
  return canvas;
}

// ── Seleção de peça ───────────────────────────────────────────────────

function slotFor(col: number, row: number): number {
  // Hash independente do usado pela textura interna do tile, e sobretudo
  // independente da vizinhança: e' isso que desacopla decoracao de colisao.
  const h = hash2(col * 3 + 7, row * 5 + 13);
  const s =
    h < PLAIN_SHARE
      ? Math.floor((h / PLAIN_SHARE) * PLAIN_SLOTS)
      : PLAIN_SLOTS + Math.floor(((h - PLAIN_SHARE) / (1 - PLAIN_SHARE)) * DECOR_SLOTS);
  return Math.min(SLOTS - 1, Math.max(0, s));
}

function groundTopClass(col: number, row: number): number {
  const l = isSolid(col - 1, row);
  const r = isSolid(col + 1, row);
  if (!l && !r) return GT_ISO;
  if (!l) return GT_CAP_L;
  if (!r) return GT_CAP_R;
  if (isSolid(col - 1, row - 1)) return GT_STEP_L;
  if (isSolid(col + 1, row - 1)) return GT_STEP_R;
  return GT_MID;
}

function groundFillClass(col: number, row: number): number {
  const l = isSolid(col - 1, row);
  const r = isSolid(col + 1, row);
  if (!l && !r) return GF_PILLAR;
  if (!l) return GF_FACE_L;
  if (!r) return GF_FACE_R;
  if (!isSolid(col, row + 1)) return GF_UNDER;
  return GF_CORE;
}

function platformClass(col: number, row: number): number {
  const l = isPlatform(col - 1, row);
  const r = isPlatform(col + 1, row);
  if (!l && !r) return PF_SINGLE;
  if (!l) return PF_END_L;
  if (!r) return PF_END_R;
  return PF_MID;
}

/**
 * Peça estável para a posição de mundo. Determinística por construção —
 * mesma coluna/linha, mesmo desenho, sempre. Nunca `rng`: se o terreno
 * mudasse entre frames ele cintilaria quando a câmera anda.
 */
export function variantFor(col: number, row: number): number {
  const slot = slotFor(col, row);
  const ch = oracle(col, row);
  let cls = 0;
  if (ch === "#") {
    cls = isSolid(col, row - 1) ? groundFillClass(col, row) : groundTopClass(col, row);
  } else if (ch === "=") {
    cls = platformClass(col, row);
  } else {
    return slot;
  }
  return cls * SLOTS + slot;
}

// ── Espinhos ──────────────────────────────────────────────────────────

/**
 * Folha de espinhos, desenhada em PIXEL.
 *
 * A versão anterior vivia em `TilemapGame.renderSpikes` e era o único
 * elemento do jogo que não era pixel art: `beginPath/moveTo/lineTo` com
 * `fill()` e `stroke()`, ou seja triângulos VETORIAIS antialiasados, numa
 * única cor chapada (`#8a8a9a`), dois por tile em offset fixo. Daí os três
 * defeitos que a captura `spikes` mostrou de uma vez:
 *
 *  - **plástico**: forma vetorial com borda suavizada no meio de arte
 *    desenhada pixel a pixel;
 *  - **régua**: triângulos idênticos em passo fixo, exatamente a
 *    periodicidade que duas rodadas tiraram do parallax e do terreno;
 *  - **flutuando**: sem encaixe nem sombra, a ponta encostava no chão sem
 *    nada dizendo que ela está CRAVADA nele.
 *
 * Eram invisíveis pro processo porque nenhuma captura chegava até eles —
 * o harness não sabia levar a câmera (ver `startAt` em `shots/scenes.mjs`).
 *
 * Ferro velho, não pedra: corpo em ramp de metal com a face esquerda
 * pegando a luz do horizonte (mesma direção do resto da cena), ferrugem
 * acumulando na base, e um soquete escuro que crava a peça no chão.
 */
export const SPIKE_VARIANT_COUNT = 6;
const SPIKE_VARIANTS = SPIKE_VARIANT_COUNT;
/** Célula de um espinho. Dois cabem num tile de 16. */
export const SPIKE_CELL_W = 8;
const SPIKE_W = SPIKE_CELL_W;

export function buildSpikeSheet(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPIKE_W * SPIKE_VARIANTS;
  canvas.height = N;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("TileArt: contexto 2d indisponível");
  ctx.imageSmoothingEnabled = false;

  for (let v = 0; v < SPIKE_VARIANTS; v++) drawSpike(ctx, v * SPIKE_W, v);
  return canvas;
}

function drawSpike(ctx: CanvasRenderingContext2D, ox: number, v: number): void {
  const seed = 900 + v * 37;
  // Altura e inclinação variam por peça: é o que quebra a régua. A faixa
  // é estreita de propósito — espinho é perigo, e perigo precisa de
  // silhueta previsível; o que varia é a peça, não a leitura.
  // 8-10px de altura, não 10-13. Com 12 de altura para 7 de base a peça
  // lê como ESPIRA, não como espinho: proporção de torre. Verificado
  // ampliado — a silhueta só diz "triangular" quando a base se aproxima
  // da altura.
  const h = 8 + Math.floor(hash2(seed, 11) * 3);
  const yTop = N - 1 - h;
  const cx = 3 + (hash2(seed, 23) > 0.6 ? 1 : 0);
  const lean = (hash2(seed, 31) - 0.5) * 1.6;

  for (let y = yTop; y < N; y++) {
    const t = (y - yTop) / h;
    // Perfil QUASE RETO (t^1.1). A primeira versão usou t^1.35 achando que
    // concavidade leria como lâmina forjada; verificado ampliado a 14x, o
    // resultado foi 1px de largura pela metade de cima inteira e a peça
    // lia como VELA — corpo estreito com pavio branco e base alaranjada.
    // Espinho precisa engrossar cedo: a silhueta tem que dizer "perigo
    // pontudo" a 1x, e um fio de 1px não diz nada.
    const half = Math.max(0, Math.round(Math.pow(t, 1.05) * 3.4));
    const c = Math.round(cx + lean * (1 - t));
    const x0 = c - half;
    const x1 = c + half;

    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= SPIKE_W) continue;
      let color: string;
      if (y >= N - 2) {
        // Base: ferrugem onde o metal encontra a terra. ESCURA e em 2
        // linhas, não 3 — na primeira versão usava `PAL.rust` (o acento
        // saturado, #c04a20) numa faixa alta, e a base virava um objeto
        // separado, laranja, brigando com a moeda pela atenção.
        color = x === x1 ? PAL.earthDeep : PAL.rustLo;
      } else if (y === yTop) {
        color = PAL.metalHi; // só a PONTA pega o céu, uma linha
      } else if (x === x0) {
        color = PAL.metal; // face voltada pra luz do horizonte
      } else if (x === x1) {
        color = PAL.stoneLo; // face de sombra
      } else {
        color = PAL.stoneRim;
      }
      px(ctx, ox + x, y, 1, 1, color);
    }

    // Mossa: um pixel escuro no corpo, raro, pra que a lâmina não leia
    // como peça nova saída da forja num mundo que está apodrecendo.
    if (t > 0.3 && t < 0.85 && hash2(seed + y * 7, 41) > 0.82) {
      px(ctx, ox + Math.min(SPIKE_W - 1, Math.max(0, c)), y, 1, 1, PAL.rustLo);
    }
  }

  // Soquete: sombra de contato espalhando pros lados na última linha. Sem
  // isto a peça fica POUSADA no chão em vez de cravada nele.
  px(ctx, ox + Math.max(0, cx - 3), N - 1, Math.min(SPIKE_W, 7), 1, PAL.earthDeep);
}
