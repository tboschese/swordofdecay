/**
 * Palco: os blocos do nível viram geometria.
 *
 * ── O que a câmera de fato mostra ─────────────────────────────────────
 *
 * A câmera é lateral e olha **4.3° pra baixo** (`CAMERA.pitchTan` 0.075;
 * a distância respira entre 14 e 18). Remedido numa captura de 900×506 com
 * `#play@30`, porque o número antigo deste comentário (11°) é de uma versão
 * anterior da câmera e induzia a decisões erradas:
 *
 *   escala .......... 41 px por unidade do mundo, nos DOIS eixos
 *   face de cima .... os 4u de `stageDepth` projetam 27px no total
 *
 * Ou seja: a face frontal carrega quase toda a arte, e o topo inteiro é uma
 * faixa de 27px. É a frente que se pinta; gastar detalhe no topo é pintar o
 * que ninguém vê. Uma versão anterior deste arquivo pôs a ênfase de valor no
 * topo (correto em vista 3/4) e o palco leu como laje lisa.
 *
 * Mas essa faixa de 27px tem UM papel, e é decisivo: ela é a SILHUETA. O
 * limite de cima dela é a única coisa do palco que encosta no céu — e
 * enquanto esse limite foi uma reta matemática, todo bloco leu como adesivo
 * recortado, por melhor que estivesse sombreado o que vinha embaixo. Duas
 * coisas dependem dela, e as duas moram no mesmo lugar:
 *
 *   LEGIBILIDADE  se a aresta de trás empatar de valor com a névoa, o
 *                 jogador não vê onde a plataforma acaba. Daí o gradiente:
 *                 fio claríssimo na beirada da frente (onde se pisa),
 *                 escurecendo até virar contorno escuro lá atrás.
 *   MATÉRIA       se ela for RETA, nada mais importa. Ver `crest`.
 *
 * ── Fresta nunca é buraco ─────────────────────────────────────────────
 *
 * Argamassa é SOMBRA entre pedras, não ausência de parede. Encolher os
 * quads pra abrir junta deixou o céu aparecer através do muro numa
 * captura anterior. Todo bloco leva um quad de fundo escuro atrás da
 * alvenaria, e as pedras se afastam DELE, nunca do vazio.
 *
 * ── Orçamento ─────────────────────────────────────────────────────────
 *
 * A Fase 0 (`3d/PHASE0.md`) mediu 19.7ms de compilação de shader num
 * quadro. Cada material distinto é um programa a compilar. Por isso o
 * palco inteiro — pedra, madeira e Rot — sai de UMA geometria fundida com
 * UM material, mais uma segunda malha só pro bafo do Rot, que é a única
 * coisa que se mexe. **2 draw calls, 2 programas** contra os 3 e 3 da
 * versão anterior. O que separa os três tipos é cor de vértice e forma,
 * que não custam draw call nenhum.
 *
 * ── Variação ──────────────────────────────────────────────────────────
 *
 * Toda variação vem de `hash2` da posição no MUNDO, nunca de índice de
 * laço nem de `Math.random()`. Índice de laço cintila quando a câmera anda
 * e a captura determinística deixa de valer alguma coisa.
 *
 * E ela tem DUAS frequências, que resolvem problemas diferentes:
 *
 *   por pedra e por mancha .. tira o efeito teclado dentro de uma tela.
 *   por ATO da fase ......... tira a impressão de cenário gerado ao longo
 *                             dos 200u. Dois campos contínuos em X
 *                             (`decayAt`, `ruinAt`) empurram os MESMOS
 *                             parâmetros que já existiam aqui — largura da
 *                             junta, frequência de nicho, altura de fiada,
 *                             valor — de modo que a parede conte a mesma
 *                             história que o nível conta.
 *
 * A segunda não acrescenta material nenhum, e isso é requisito: material
 * novo é programa novo pra compilar (ver o Orçamento acima). O que ela
 * acrescenta é geometria já existente, deslocada e apagada por posição.
 */
import * as THREE from "three";
import type { Block, BlockKind, LevelData, StageRig } from "../contracts";
import { hash2 } from "../engine/rng";
import { WORLD } from "../game/tuning";
import { PALETTE, breathMaterial, solidMaterial, type RGB, type ValueScale } from "./materials";

// ── Escalas de detalhe ────────────────────────────────────────────────
// A face frontal de um bloco de chão (4u) ocupa ~170px numa captura de
// 960x540, ou ~42px por unidade. Os números abaixo foram escolhidos pra
// que cada elemento caia numa faixa legível nessa escala, não por gosto:
// pedra de 0.7-1.2u sai com 30-50px, que é o tamanho em que o olho ainda
// lê "unidade de alvenaria" em vez de "ruído".

/** Altura de uma fiada de alvenaria. */
const COURSE = 0.58;
/** Fresta entre pedras. Some abaixo disso; vira grade de azulejo acima. */
const JOINT = 0.05;
/** Altura de uma tábua. Menos que isto e a madeira lê como listra. */
const PLANK = 0.42;
/** Profundidade visual do palco (jogabilidade continua em XY). */
const D = WORLD.stageDepth;

/** Quanto do topo o Rot já comeu, medido pra baixo a partir da superfície. */
const ROT_DEPTH = 3.0;
/** Largura da borda de transição limpo → corroído, nas pontas do bloco. */
const ROT_FADE = 5.0;
/** Passo do perfil da crosta. Menor = silhueta mais nervosa, mais triângulo. */
const CRUST_STEP = 0.34;
/** Quanto da profundidade do topo a crosta cobre, a partir da frente. */
const CRUST_REACH = 1.1;

// ── A aresta contra o céu ─────────────────────────────────────────────
//
// Medido na captura de 900×506 com `#play@30`: a câmera fica a ~18u e a
// escala é **41 px por unidade do mundo**, nos dois eixos. Toda a faixa de
// topo de um bloco (os 4u de `stageDepth`) projeta só 27px, porque a
// inclinação é de 4.3° (`CAMERA.pitchTan` 0.075) — a face de cima é quase
// um fio. E o limite de cima desse fio é a SILHUETA do palco.
//
// É por isso que relevo em Z não resolve nada aqui (uma saliência de 0.06u
// dá 0px no centro do quadro) e deslocamento em Y resolve tudo: 0.25u são
// 10px, 0.5u são 20px. O Rot já vive disso — `rotCrest` trabalha numa faixa
// de 0.04 a 0.41u, que é exatamente a amplitude que a captura mostra
// quebrando a linha dele enquanto a da pedra continua matemática.
//
// Os números abaixo são dessa medida, não de gosto: a peça de remate tem
// que ter largura de PEÇA (0.78u = 32px, mesma ordem da pedra de alvenaria,
// que sai com ~43px) e altura suficiente pra virar degrau visível.

/** Passo do remate. Do tamanho de uma pedra: o que remata um muro é pedra. */
const CAP_STEP = 0.78;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/**
 * Hash de posição no MUNDO com sal. O sal separa fluxos (largura de pedra,
 * pedra faltando, mancha de crosta) que precisam ser independentes entre
 * si — sem ele, "pedra larga" e "pedra faltando" cairiam sempre juntas e a
 * parede ganharia um padrão que o olho pega na hora.
 */
function h(x: number, y: number, salt: number): number {
  return hash2(Math.round(x * 8), Math.round(y * 8) + salt * 977);
}

/**
 * Mancha larga: umidade, líquen, fuligem. Interpola hash numa grade GROSSA
 * (5.5u x 3.2u), então cinco ou seis pedras vizinhas compartilham tom.
 *
 * Este é o remédio contra a leitura de TECLADO, e vale mais que qualquer
 * detalhe por pedra. Variação só de alta frequência (uma pedra clara, uma
 * escura, alternando) o olho lê como padrão regular; variação de baixa
 * frequência agrupa as pedras em manchas e a parede vira superfície. Muro
 * de verdade suja em mancha, não em xadrez.
 */
function stain(x: number, y: number): number {
  const gx = x / 5.5;
  const gy = y / 3.2;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const a = hash2(ix, iy + 611);
  const b = hash2(ix + 1, iy + 611);
  const c = hash2(ix, iy + 612);
  const d = hash2(ix + 1, iy + 612);
  const t = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  return 0.80 + t * 0.34;
}

// ── A vila apodrece da esquerda pra direita ───────────────────────────
//
// A fase tem 200u e é uma narrativa (`3d/levels/world1.ts`): rua da vila →
// telhados → a TORÇÃO, onde o chão é veneno → descida até o portão caído.
// Se a parede recebe o mesmo tratamento nos 200u, o jogador anda 150u e vê
// a mesma parede — e cenário que não muda lê como GERADO, não construído.
//
// A variação por posição não pode ser ruído: ruído distribui o acidente por
// igual e o resultado é tão uniforme quanto a parede constante, só que mais
// sujo. Ela tem que contar a MESMA história que o nível conta. Por isso são
// dois campos, e não um — porque "comido" e "caído" são coisas diferentes, e
// é a diferença entre elas que separa a torção do desfecho:
//
//   decay  quanto o Rot COMEU. Entra pela junta, escurece, mata o volume da
//          pedra e deixa crosta. Pico no `ten`, onde o chão é a poça; recua
//          depois dela, mas nunca volta ao limpo.
//   ruin   quanta pedra a vila PERDEU. Nicho vazio, fiada desalinhada,
//          cimalha partida. Só sobe — ruína não se desfaz — e chega ao
//          máximo no portão caído, que é onde o `ketsu` termina.
//
// No `ki` os dois ficam perto de zero de propósito: a rua tem que ler como
// ORDEM, senão a corrupção mais adiante não tem contra o que ser medida. O
// lore pede "sinais ainda sutis", não apocalipse na primeira tela.
const ACT_KI = 62;
const ACT_SHO = 118;
const ACT_TEN = 156;
const ACT_END = 206;

/**
 * Rampa por pontos-chave em X do mundo, com passagem suavizada entre eles.
 *
 * Suavizada e não linear porque a emenda de duas retas deixa um vinco na
 * derivada, e vinco em campo de variação vira uma coluna visível na parede —
 * exatamente a "linha onde o cenário troca de tema" que se está evitando.
 */
function keyed(x: number, keys: ReadonlyArray<readonly [number, number]>): number {
  const first = keys[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (x <= b[0]) return a[1] + (b[1] - a[1]) * smooth((x - a[0]) / (b[0] - a[0]));
  }
  return keys[keys.length - 1]![1];
}

/**
 * Ondulação lenta (~9u) por cima da rampa: a frente de contaminação não é
 * uma vertical perfeita. Sem ela, "pior à direita" lê como degradê de
 * ferramenta; com ela, um trecho adiante já está pior que o de trás e o olho
 * lê avanço irregular, que é como mancha de fato caminha numa parede.
 *
 * Interpolada de hash da posição no MUNDO, como todo o resto do arquivo.
 */
function drift(x: number, salt: number): number {
  const g = x / 9;
  const i = Math.floor(g);
  const f = smooth(g - i);
  const a = hash2(i, salt);
  const b = hash2(i + 1, salt);
  return a + (b - a) * f;
}

/**
 * Quanto o Rot comeu a alvenaria naquele ponto da fase.
 *
 * A rampa não é uniforme, e os pontos-chave não são redondos por acaso: o
 * que interessa é o valor do campo ONDE EXISTE PAREDE DE PEDRA pra recebê-lo.
 * A fase só tem alvenaria em x -6..70 e x 188..210 (no meio o jogador está em
 * telhados de madeira e sobre a poça). Uma rampa linear de 0 a 200 gastaria
 * quase toda a sua variação em trechos sem parede nenhuma, e as duas paredes
 * que o jogador de fato encara sairiam quase iguais — que é exatamente o
 * defeito que este campo existe pra corrigir.
 *
 * Por isso o degrau grande cai no fim do `ki`: quem anda a rua da vila vê a
 * pedra piorar sob os próprios pés, e a última pedra antes do chão acabar já
 * está visivelmente mordida.
 */
function decayAt(x: number): number {
  const base = keyed(x, [
    [6, 0.03], [40, 0.12], [ACT_KI, 0.36], [ACT_SHO, 0.72], [136, 1.0], [ACT_TEN, 1.0],
    [188, 0.55], [ACT_END, 0.30],
  ]);
  // A ondulação encolhe junto com a base: na rua limpa uma pedra podre
  // avulsa não é variação, é erro de continuidade.
  return clamp01(base + (drift(x, 811) - 0.5) * 0.26 * Math.min(1, base * 2.5));
}

/**
 * Quanta pedra a vila já PERDEU naquele ponto.
 *
 * Sobe sempre, e o pico fica no `ketsu` e não no `ten`: o Rot é o que COME, e
 * ele mora na poça; o portão é o que CAIU, e queda não se desfaz. É essa
 * defasagem entre os dois campos que faz a última parede não ser só "mais do
 * mesmo" — ela tem menos Rot que a poça e muito mais ausência.
 */
function ruinAt(x: number): number {
  const base = keyed(x, [
    [6, 0.02], [40, 0.10], [ACT_KI, 0.28], [ACT_SHO, 0.48], [ACT_TEN, 0.68], [ACT_END, 1.0],
  ]);
  return clamp01(base + (drift(x, 812) - 0.5) * 0.22 * Math.min(1, base * 2.5));
}

// ── A FACE NÃO É UMA GRADE ────────────────────────────────────────────
//
// A silhueta foi resolvida na rodada passada (o desvio da skyline da pedra
// subiu de 5.07px pra 14.08px, contra 17.09px do Rot). O que sobrou está
// medido, na captura de 900×506 em `#play@30`, na faixa de face que o
// quadro mostra (y 374..504):
//
//     variância de valor (CV) .......... 34.0%    Rot: 78.4%
//     estrutura de BAIXA frequência .... 18.9%    Rot: 65.1%
//     junta horizontal contínua ........ 81% da largura, em 4 linhas
//
// A terceira linha é o diagnóstico inteiro. Quatro juntas atravessando 900px
// sem uma interrupção é uma GRADE, e nenhuma dose de variação POR PEDRA a
// desfaz — variação por pedra é o que DESENHA a grade, célula por célula. A
// segunda linha diz o mesmo pelo outro lado: toda a estrutura da pedra mora
// na frequência da PEDRA, e não existe nada na frequência do MURO.
//
// O padrão-ouro está dentro do próprio jogo. O Rot não lê como adesivo
// porque tem formas grandes que atravessam a alvenaria sem obedecer a ela —
// as línguas de `rotMass` descem por cima de cinco pedras e três fiadas de
// uma vez. Traduzido pra vocabulário de pedra são quatro coisas, e nenhuma
// delas é uma pedra:
//
//   RECALQUE     a parede afundou em trechos e a fiada afundou junto. É o
//                que tira a RÉGUA: linha de assentamento deixa de ser reta
//                sem deixar de ser linha. Custa zero triângulo (`settle`).
//   REBOCO       a vila revestia o muro. O pano agarra em painéis e cai em
//                trechos, e onde ele está a alvenaria SOME. É a maior forma
//                de baixa frequência da parede e é ela que devolve a
//                variância que falta — pra cima (`renderCoat`).
//   ESCORRIDO    a junta que vaza mancha tudo abaixo dela, atravessando
//                fiadas. Mesma direção do Rot (pra baixo, afinando), lida
//                em pedra: água, não matéria (`washAt`).
//   DESABAMENTO  trecho inteiro de alvenaria que veio abaixo, com o
//                enchimento do miolo à mostra. É a variância pra baixo, e é
//                o que o `ketsu` tem no lugar do reboco (`collapse`).
//
// As quatro andam com os campos que já existiam, e em direções OPOSTAS nas
// duas pontas da fase: o reboco é máximo no `ki` (vila que ainda se cuidava)
// e o desabamento é máximo no portão. A parede conta a mesma história por
// meios contrários nas duas pontas — que informa mais que contar duas vezes
// a mesma coisa. E nenhuma delas é material novo: é a mesma geometria de
// cor por vértice, na frequência que faltava.

/**
 * Recalque: quanto aquele trecho de parede afundou.
 *
 * Duas oitavas LARGAS (12u e 4.3u) de propósito: quem assenta é a parede,
 * não a pedra. Uma pedra fora de linha é erro de pedreiro e o olho lê como
 * ruído; doze metros de fiada descendo devagar é o terreno cedendo, e o olho
 * lê como peso. É a mesma diferença de frequência que separa `stain` de
 * variação por pedra, só que aplicada à FORMA em vez de ao valor.
 *
 * Nunca é positivo. Parede afunda, não sobe — e a consequência prática é de
 * coexistência, não de física: a cimalha carrega este campo e a fiada de
 * remate não, então um deslocamento pra cima acabaria empurrando a cimalha
 * pra dentro do remate, que é a linha de pisar.
 */
function settle(x: number): number {
  return -(drift(x * 0.74, 81) * 0.72 + drift(x * 2.1, 82) * 0.28) * 0.30;
}

// ── O reboco ──────────────────────────────────────────────────────────

/** Passo do desenho do pano. 0.30u = 12px: o tamanho de uma lasca. */
const COAT_STEP = 0.30;
/** Espaçamento dos panos. Um em cada dois se soltou; a outra metade agarrou. */
const COAT_CELL = 7.0;

/**
 * O pano de reboco daquela célula: onde começa, onde acaba, e quanto desce.
 *
 * PANO E NÃO CAMPO, e isto foi medido. A primeira versão decidia o reboco por
 * limiar sobre um campo contínuo: deu 59% de cobertura em manchas emendadas,
 * e a captura mostrou a face inteira revestida — parede lisa de ponta a
 * ponta. A variância de baixa frequência não mexeu um décimo (18.9% → 18.8%),
 * e o motivo é aritmético antes de ser visual: **camada uniforme não tem
 * frequência nenhuma.** Quem carrega a informação não é o pano, é a
 * ALTERNÂNCIA entre pano e alvenaria — e alternância precisa de PONTA.
 *
 * Daí a peça ter começo e fim explícitos: 1.8 a 4.6u de largura (70 a 190px)
 * numa célula de 7u, com metade das células vazias. Cobertura de ~26%, e três
 * ou quatro bordas verticais por tela.
 *
 * O limiar sobe com a ruína e com o Rot, então este é o único elemento do
 * arquivo que ANDA PRA TRÁS ao longo da fase: a rua tem pano, o portão não
 * tem nenhum. É de propósito que ele seja o oposto de tudo o mais aqui — o
 * `ki` precisava de uma forma GRANDE que não fosse destruição, senão a ordem
 * da rua só poderia ser contada como ausência de acidente, e ausência de
 * acidente é exatamente o que produz a grade.
 */
function coatPanel(gi: number): readonly [number, number, number] | null {
  const cx = (gi + 0.5) * COAT_CELL;
  if (hash2(gi, 101) < 0.42 + ruinAt(cx) * 0.62 + decayAt(cx) * 0.26) return null;
  const a = (gi + 0.06 + hash2(gi, 102) * 0.30) * COAT_CELL;
  return [a, a + (0.22 + hash2(gi, 103) * 0.33) * COAT_CELL, 0.55 + hash2(gi, 104) * 1.25];
}

/** Quanto o pano desce abaixo da cimalha naquele x. Zero = ali não há pano. */
function coatDrop(x: number): number {
  // Onde alguém REMENDOU não há reboco: quem refaz a alvenaria de um trecho
  // não a reveste de novo, e as duas formas grandes da rua não podem cair
  // uma em cima da outra — na captura o pano comeu o remendo inteiro e a
  // face ficou com uma forma onde deveria ter duas.
  if (patchedX(x)) return 0;
  const g0 = Math.floor(x / COAT_CELL);
  for (let i = g0 - 1; i <= g0; i++) {
    const p = coatPanel(i);
    if (!p || x < p[0] || x > p[1]) continue;
    const t = (x - p[0]) / (p[1] - p[0]);
    // Nas pontas o pano desce menos, mas NÃO some: o que a borda lateral tem
    // que entregar é uma quebra, e quebra tem altura. Pano que afina até zero
    // vira lente, e lente é a forma do desabamento — as duas coisas não podem
    // ter a mesma silhueta.
    // A borda quebra em LASCA, e a lasca tem tamanho: 0.9u (36px), sorteada
    // inteira, com uma oitava larga por baixo dando a inclinação geral.
    //
    // Sem a lasca a borda saía como ESCADA — a oitava fina de 1.1u corre
    // monotônica dentro de cada período e as colunas de 12px caíam em degraus
    // regulares, o que a captura mostrou como uma escadinha desenhada na
    // parede. Escada é padrão tanto quanto reta; o que arrebenta arrebenta em
    // pedaço, e pedaço vizinho não sabe do tamanho do outro.
    const d = p[2] * (0.45 + 0.55 * smooth(Math.min(t, 1 - t) / 0.16))
      * (0.58 + drift(x * 4.0, 105) * 0.45 + hash2(Math.floor(x / 0.9), 109) * 0.55);
    // Teto de 2.2u contra 2.8u de face visível: sempre sobra alvenaria
    // embaixo. É o CONTRASTE entre as duas que faz as duas lerem — pano que
    // vai do fio ao rodapé não tem borda no quadro, e a borda é a forma.
    return d < 0.35 ? 0 : Math.min(d, 2.2);
  }
  return 0;
}

/** Se aquele ponto da parede está sob o pano. `faceTop` é a linha da cimalha. */
function coated(x: number, y: number, faceTop: number): boolean {
  if (y > faceTop || y < faceTop - 2.25) return false;
  const d = coatDrop(x);
  return d > 0 && y > faceTop - d;
}

// ── O escorrido ───────────────────────────────────────────────────────

/** Espaçamento das juntas que vazam. Uma em duas vaza; a outra metade não. */
const LEAK_CELL = 6.2;

/**
 * A junta que vaza: onde ela está, quanto desce, e quão largo abre.
 *
 * Metade das células não tem vazamento nenhum, e é a FALTA que faz a que
 * existe contar. Uma mancha a cada seis metros lê como defeito do muro; uma
 * a cada dois lê como textura, e textura volta a ser grade.
 */
function leak(gi: number): readonly [number, number, number] | null {
  if (hash2(gi, 121) > 0.58) return null;
  return [
    (gi + 0.16 + hash2(gi, 122) * 0.68) * LEAK_CELL,
    1.5 + hash2(gi, 123) * 2.4,
    0.32 + hash2(gi, 124) * 0.52,
  ];
}

/**
 * Halo do escorrido: a parede escurecida abaixo da junta que vaza.
 *
 * Multiplicador de cor de vértice em geometria que já existe — custa ZERO
 * triângulo, e é a mancha INTEIRA. Não há nem pode haver um feixe de fios
 * desenhado por cima dela, e a razão é a regra que rege este arquivo:
 *
 * **Nada que seja desenhado SOBRE a parede pode ignorar o campo que escurece
 * a parede.** Houve aqui um `runnels` — quads de 2 a 5px de largura em
 * `zF + 0.021`, por cima de tudo — e o `j` dele levava `stain`, `decayAt`,
 * `ruinAt` e `skyOcc`, mas não levava ESTA função. Sob a junta que vaza a
 * alvenaria cai a 52% (o `1 - wsh * 0.48` lá embaixo) e o fio ficava no
 * valor cheio: medido na captura de `#play@30`, fios de 5px a 87 de
 * luminância sobre parede a 63 — 13 dos 17 fios visíveis da rua saíam MAIS
 * CLAROS que a mancha em que moravam, que é o contrário exato do que um
 * escorrido é. O recorte ampliado mostrava um pente de barras retas de lado
 * a lado, e barra reta é a única coisa que a rua inteira não tem.
 *
 * E corrigir o valor não os salvava: com o `wsh` aplicado, o fio empata com
 * o fundo no miolo da mancha (0.385 contra 0.36-0.50) e empata com a pedra
 * fora dela (0.72-0.94 contra 0.66-0.97). Ou seja, o elemento só era visível
 * enquanto estava errado. Cortado.
 *
 * O que dá CONTORNO à mancha sem desenhar nada é a perda do chanfro: em
 * `course` o `bevel` some com `1 - wsh * 0.85`, então vinte pedras seguidas
 * perdem a fita clara da aresta de cima. Some o molde onde a água passou, e
 * é essa ausência — não uma linha — que faz a mancha atravessar as fiadas.
 * A quantização por pedra, que era o medo original, morre dentro do próprio
 * degradê: ver o perfil largo logo abaixo.
 */
function washAt(x: number, y: number, faceTop: number): number {
  const g0 = Math.floor(x / LEAK_CELL);
  let w = 0;
  for (let i = g0 - 1; i <= g0 + 1; i++) {
    const L = leak(i);
    if (!L) continue;
    const d = faceTop - y;
    if (d < -0.15 || d > L[1]) continue;
    const t = clamp01(d / L[1]);
    // Abre descendo: água espalha na parede, não desce em coluna.
    const u = Math.abs(x - L[0]) / (L[2] * (0.6 + t * 1.2));
    if (u >= 1) continue;
    // Perfil LARGO, e não uma cabeça chata com queda na borda.
    //
    // A primeira versão usava `u*u`, que concentra toda a transição no fim do
    // raio: a mancha saía com miolo uniforme e borda curta, e como ela é
    // amostrada POR PEDRA a borda curta caía sempre num limite de pedra. Na
    // captura isso virou um retângulo escuro de 60×67px com lados verticais —
    // ou seja, uma célula de grade maior, que é o defeito que se está
    // corrigindo, não uma mancha. Com a transição espalhada por todo o raio
    // (40px), a quantização some dentro do degradê e o que sobra é sombra.
    w = Math.max(w, (1 - smooth(u)) * (1 - smooth(t * t * t)));
  }
  return w;
}

// ── O remendo ─────────────────────────────────────────────────────────

/** Espaçamento dos remendos. Muro de vila se conserta; é isso que ele diz. */
const PATCH_CELL = 13.0;

/**
 * O remendo daquela célula: `[x0, x1, topo, fundo]`, os dois últimos medidos
 * pra baixo a partir da cimalha.
 *
 * É a forma que o `ki` precisava e que nem o reboco nem o desabamento davam.
 * O reboco COBRE a alvenaria; o desabamento a TIRA. Nenhum dos dois responde
 * ao defeito de frente — que a fiada é uma faixa de espessura constante
 * atravessando o bloco inteiro. O remendo responde: dentro dele a fiada tem
 * metade da altura, a pedra tem um terço da largura e a junta está noutro
 * lugar, então as quatro linhas que atravessavam 900px passam a atravessar
 * 150, esbarrar num pedaço de parede com outro ritmo, e recomeçar
 * desalinhadas do outro lado.
 *
 * E é a forma mais compatível com a ORDEM que o `ki` tem que entregar: quem
 * remenda um muro é quem ainda cuida dele. Por isso a frequência CAI com a
 * ruína, ao contrário de quase tudo o mais neste arquivo — no portão ninguém
 * conserta nada.
 */
function patchAt(gi: number): readonly [number, number, number, number] | null {
  const cx = (gi + 0.5) * PATCH_CELL;
  if (hash2(gi, 161) > 0.60 - ruinAt(cx) * 0.34) return null;
  const a = (gi + 0.08 + hash2(gi, 162) * 0.34) * PATCH_CELL;
  const t = 0.25 + hash2(gi, 164) * 0.70;
  return [a, a + 1.9 + hash2(gi, 163) * 2.4, t, t + 1.0 + hash2(gi, 170) * 1.3];
}

/** Se aquele x cai num remendo. Só a faixa em X — quem usa é o reboco. */
function patchedX(x: number): boolean {
  const g0 = Math.floor(x / PATCH_CELL);
  for (let i = g0 - 1; i <= g0; i++) {
    const p = patchAt(i);
    if (p && x >= p[0] - 0.2 && x <= p[1] + 0.2) return true;
  }
  return false;
}

/**
 * A extensão vertical do remendo naquele x.
 *
 * O contorno anda em passo de PEDRA (oitava de 1.5u) e não é um retângulo:
 * quem abriu o buraco arrancou peça inteira, e quem o fechou assentou até
 * onde o buraco ia. Remendo retangular leria como janela tapada — que é uma
 * história diferente, e não é a que a rua conta.
 */
function patchSpan(x: number, faceTop: number): readonly [number, number] | null {
  const g0 = Math.floor(x / PATCH_CELL);
  for (let i = g0 - 1; i <= g0; i++) {
    const p = patchAt(i);
    if (!p || x < p[0] || x > p[1]) continue;
    const wob = (drift(x * 6.0, 168) - 0.5) * 0.36;
    return [faceTop - p[3] + wob, faceTop - p[2] - wob * 0.7];
  }
  return null;
}

/**
 * A alvenaria nova do remendo: pedra miúda, fiada baixa, junta em outro
 * lugar.
 *
 * Vem por cima da alvenaria velha com uma chapa escura por trás — pela mesma
 * regra que rege o arquivo desde a primeira linha: a fresta entre as pedras
 * novas tem que mostrar ARGAMASSA, não a pedra velha que ficou atrás. Sem a
 * chapa, o chanfro claro de uma pedra grande apareceria pela junta de uma
 * pedra pequena e o remendo leria como transparência.
 */
function patchWork(
  s: Surface, x0: number, x1: number, faceTop: number, zF: number, tints: RGB[], V: ValueScale,
): void {
  for (let gi = Math.floor(x0 / PATCH_CELL) - 1; gi <= Math.floor(x1 / PATCH_CELL); gi++) {
    const p = patchAt(gi);
    if (!p) continue;
    const a = Math.max(p[0], x0), b = Math.min(p[1], x1);
    if (b - a < 0.7) continue;
    // 0.24-0.35u contra 0.46-0.77u da alvenaria em volta: metade da altura,
    // que é o que faz o olho ver DUAS alvenarias e não uma irregular.
    const ch = 0.24 + hash2(gi, 165) * 0.11;
    // Chapa 0.006 atrás das pedras novas, e não 0.002: mesma lição do
    // desabamento — coplanar separado por menos de 0.004 vira moiré a 18u.
    s.front(a, faceTop - p[3] - 0.12, b, faceTop - p[2] + 0.12, zF + 0.004, tints[0]!,
      V.mortar * 0.82, V.mortar * 0.82, V.mortar * 0.60, V.mortar * 0.60);

    let cy = faceTop - p[3];
    let row = 0;
    while (cy < faceTop - p[2] - 0.03) {
      const top = Math.min(faceTop - p[2], cy + ch);
      let cx = a - hash2(gi * 17 + row, 166) * 0.42;
      while (cx < b - 1e-4) {
        const w = 0.30 + hash2(Math.round(cx * 8), row * 7 + 167) * 0.30;
        const sx0 = Math.max(a, cx + 0.035), sx1 = Math.min(cx + w - 0.035, b);
        cx += w;
        if (sx1 - sx0 < 0.1) continue;
        const xm = (sx0 + sx1) / 2;
        const sp = patchSpan(xm, faceTop);
        // Recortado pelo próprio contorno: a pedra que sai da borda não é
        // assentada. É daqui que vem o degrau do remendo.
        if (!sp || cy < sp[0] - 0.02 || top > sp[1] + 0.02) continue;
        if (coated(xm, cy, faceTop)) continue;
        const g = hash2(Math.round(sx0 * 8), row * 31 + 169);
        // Um pouco mais ESCURO que a parede em volta, e não mais claro. O
        // pano de reboco já é a forma clara do `ki`; se o remendo também
        // fosse, as duas grandes formas da rua estariam do mesmo lado do
        // valor e a face ganharia média em vez de variância.
        const j = (0.82 + g * 0.28) * stain(xm, cy) * (1 - clamp01((faceTop - top) / 6) * 0.26);
        s.front(sx0, cy + 0.032, sx1, top - 0.022, zF + 0.010, tints[Math.floor(g * 2)]!,
          V.lo * 0.86 * j, V.lo * 0.82 * j, V.hi * 0.94 * j, V.hi * 0.90 * j);
        // Sombra de contato, e chanfro nenhum: a 12px de altura o chanfro
        // seria 1px e viraria serrilha. A sombra é o que prova assentamento
        // nesse tamanho.
        s.front(sx0, cy + 0.032, sx1, cy + 0.032 + Math.min(0.055, ch * 0.24), zF + 0.015,
          tints[0]!, V.contact * 0.9 * j, V.contact * 0.9 * j, V.lo * 0.86 * j, V.lo * 0.82 * j);
      }
      cy = top;
      row++;
    }
  }
}

// ── O desabamento ─────────────────────────────────────────────────────

/**
 * O trecho de parede que veio abaixo: de onde até onde, em Y, naquele x.
 *
 * Uma lente e não um retângulo: fundo no meio, some nas pontas. Retângulo
 * seria trocar a célula da grade por uma célula maior — o que tem que ler
 * é ARRANCADO, e o que arranca alvenaria não deixa canto reto.
 *
 * Fica inteiro ABAIXO da cimalha por contrato de colisão: a linha onde o pé
 * pousa continua onde o motor diz, e a devastação toda mora na face.
 */
function scarSpan(x: number, faceTop: number): readonly [number, number] | null {
  const cell = 8.5;
  const g0 = Math.floor(x / cell);
  for (let i = g0 - 1; i <= g0 + 1; i++) {
    const rn = ruinAt((i + 0.5) * cell);
    if (rn < 0.34) continue;
    if (hash2(i, 141) > (rn - 0.28) * 1.2) continue;
    const cx = (i + 0.22 + hash2(i, 142) * 0.56) * cell;
    const u = (x - cx) / (1.2 + hash2(i, 143) * 1.9);
    if (u <= -1 || u >= 1) continue;
    // A borda é picotada em passo de PEDRA (2.6u de oitava sobre a lente):
    // o que cede cede por peça inteira, e o degrau é a assinatura disso.
    const prof = Math.sqrt(1 - u * u) * (0.55 + drift(x * 2.6, 144) * 0.78);
    const dp = (0.85 + hash2(i, 145) * 1.5) * prof;
    if (dp < 0.25) return null;
    const top = faceTop - 0.12 - hash2(i, 146) * 0.5 - drift(x * 3.4, 147) * 0.45;
    return [top - dp, top];
  }
  return null;
}

type P3 = readonly [number, number, number];

/**
 * Acumulador de triângulos com cor POR VÉRTICE.
 *
 * A cor por vértice é o ponto do módulo inteiro. Um quad com um valor só
 * é uma faceta chapada, e parede feita de facetas chapadas lê como
 * impressão. Com quatro valores, cada pedra ganha rampa própria — que é
 * exatamente o "3-4 tons da mesma cor em gradiente" que o alvo SNES/Neo
 * Geo pede (DESIGN.md §2.1), só que resolvido no vértice em vez de no
 * pixel.
 */
class Surface {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];

  constructor(private readonly withAlpha = false) {}

  private vert(p: P3, n: P3, c: RGB, m: number, a: number): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0] * m, c[1] * m, c[2] * m);
    if (this.withAlpha) this.col.push(a);
  }

  /** Quad em ordem CCW vista do lado da normal. */
  quad(
    a: P3, b: P3, c: P3, d: P3, n: P3, col: RGB,
    ma: number, mb: number, mc: number, md: number,
    aa = 1, ab = 1, ac = 1, ad = 1,
  ): void {
    this.vert(a, n, col, ma, aa);
    this.vert(b, n, col, mb, ab);
    this.vert(c, n, col, mc, ac);
    this.vert(a, n, col, ma, aa);
    this.vert(c, n, col, mc, ac);
    this.vert(d, n, col, md, ad);
  }

  /** Retângulo na face frontal. Ordem dos valores: baixo-esq, baixo-dir, cima-dir, cima-esq. */
  front(
    x0: number, y0: number, x1: number, y1: number, z: number, col: RGB,
    mBL: number, mBR: number, mTR: number, mTL: number,
  ): void {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], FRONT, col, mBL, mBR, mTR, mTL);
  }

  /**
   * Polígono livre na face frontal. Existe porque crosta e escorrido do
   * Rot não são retângulos — e é justamente por não serem que eles se
   * distinguem da alvenaria quando a cor sai da imagem.
   */
  frontPoly(
    p0: readonly [number, number], p1: readonly [number, number],
    p2: readonly [number, number], p3: readonly [number, number],
    z: number, col: RGB, m0: number, m1: number, m2: number, m3: number,
  ): void {
    this.quad(
      [p0[0], p0[1], z], [p1[0], p1[1], z], [p2[0], p2[1], z], [p3[0], p3[1], z],
      FRONT, col, m0, m1, m2, m3,
    );
  }

  /** Faixa da face de cima. Valores: fundo-esq, fundo-dir, frente-dir, frente-esq. */
  top(
    x0: number, x1: number, zBack: number, zFront: number, y: number, col: RGB,
    mBL: number, mBR: number, mFR: number, mFL: number,
  ): void {
    if (x1 - x0 < 1e-4) return;
    this.quad(
      [x0, y, zBack], [x1, y, zBack], [x1, y, zFront], [x0, y, zFront],
      UP, col, mBL, mBR, mFR, mFL,
    );
  }

  /** Leque de 4 triângulos: sopro macio sem textura, alfa no centro e zero na borda. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, col: RGB, m: number, a: number): void {
    const c: P3 = [cx, cy, cz];
    const pts: P3[] = [
      [cx - rx, cy, cz], [cx, cy - ry, cz], [cx + rx, cy, cz], [cx, cy + ry, cz],
    ];
    for (let i = 0; i < 4; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % 4]!;
      this.vert(c, FRONT, col, m, a);
      this.vert(p, FRONT, col, m * 0.8, 0);
      this.vert(q, FRONT, col, m * 0.8, 0);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, this.withAlpha ? 4 : 3));
    return g;
  }
}

const FRONT: P3 = [0, 0, 1];
const UP: P3 = [0, 1, 0];
const LEFT: P3 = [-1, 0, 0];
const RIGHT: P3 = [1, 0, 0];
const DOWN: P3 = [0, -1, 0];
/** Normal da capa inclinada da crosta: quase pra cima, com um pouco de frente. */
const CREST: P3 = [0, 0.94, 0.34];

// ── Palco ─────────────────────────────────────────────────────────────

export class Stage implements StageRig {
  readonly object = new THREE.Group();

  private readonly breath: THREE.Mesh | null;
  /** Posição de repouso de cada vértice do bafo, pra animar sem acumular erro. */
  private readonly breathRest: Float32Array | null;
  /** Fase própria por vértice: sem ela o bafo inteiro pulsa junto e vira piscada. */
  private readonly breathPhase: Float32Array | null;

  constructor(data: LevelData) {
    const solid = new Surface();
    const haze = new Surface(true);

    // Ordem de construção = ordem no buffer, e o buffer é o que o
    // determinismo da captura depende. Iterar por tipo mantém a ordem
    // estável mesmo se o nível reordenar blocos do mesmo tipo.
    for (const kind of ["stone", "timber", "rot"] as BlockKind[]) {
      for (const b of data.blocks) {
        if (b.kind !== kind) continue;
        if (kind === "timber") buildTimber(solid, b);
        else if (kind === "rot") buildRot(solid, haze, b, freeEnds(data.blocks, b));
        else buildStone(solid, b, freeEnds(data.blocks, b));
      }
    }

    const mesh = new THREE.Mesh(solid.geometry(), solidMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = "stage-solid";
    this.object.add(mesh);

    if (haze.pos.length > 0) {
      const g = haze.geometry();
      const m = new THREE.Mesh(g, breathMaterial());
      // Sem sombra: miasma que projeta sombra dura denuncia que é geometria.
      m.castShadow = false;
      m.receiveShadow = false;
      // Desenhado depois de tudo: é casca translúcida, e translúcido que
      // entra antes do opaco recorta o que está atrás dele.
      m.renderOrder = 2;
      m.name = "stage-rot-breath";
      this.object.add(m);
      this.breath = m;

      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      this.breathRest = new Float32Array(pos.array as Float32Array);
      this.breathPhase = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        // Fase amarrada ao X do MUNDO: dois trechos de Rot distantes
        // respiram fora de sincronia, como matéria e não como efeito.
        this.breathPhase[i] = hash2(Math.round(this.breathRest[i * 3]! * 4), 13) * Math.PI * 2;
      }
    } else {
      this.breath = null;
      this.breathRest = null;
      this.breathPhase = null;
    }
  }

  /**
   * O palco sólido é estático de propósito: mexer nele custaria reenviar o
   * buffer inteiro todo quadro. Quem respira é só o bafo do Rot, que é uma
   * malha pequena — e a respiração é DESLOCAMENTO, não brilho. Movimento
   * lento sobrevive à conversão pra cinza; pulso de emissão, não.
   */
  update(frame: number): void {
    const mesh = this.breath;
    const rest = this.breathRest;
    const phase = this.breathPhase;
    if (!mesh || !rest || !phase) return;

    const attr = (mesh.geometry as THREE.BufferGeometry).getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    // ~0.36 rad/s a 60Hz: lento o bastante pra ler como exalação, não como
    // tremor. Acima disso a coisa vibra e vira efeito de partícula.
    const t = frame * 0.006;
    for (let i = 0; i < phase.length; i++) {
      const p = phase[i]!;
      arr[i * 3 + 1] = rest[i * 3 + 1]! + Math.sin(t + p) * 0.11;
      arr[i * 3] = rest[i * 3]! + Math.sin(t * 0.61 + p * 1.7) * 0.05;
    }
    attr.needsUpdate = true;
  }
}

// ── Pedra ─────────────────────────────────────────────────────────────

/**
 * Quatro tons por família, e não uma rampa contínua.
 *
 * Paleta limitada é o que faz uma superfície ler como MATERIAL em vez de
 * ruído: o olho agrupa pedras do mesmo tom e enxerga fiada, mancha,
 * remendo. Com tom contínuo por pedra, cada uma vira um caso isolado e a
 * parede volta a parecer aleatória.
 */
function ramp(a: RGB, b: RGB, n: number): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

const STONE_TINTS = ramp(PALETTE.stone.base, PALETTE.stone.warm, 4);
const TIMBER_TINTS = ramp(PALETTE.timber.base, PALETTE.timber.warm, 4);
const ROT_TINTS = ramp(PALETTE.rot.dead, PALETTE.stone.base, 4);

function pick(tints: RGB[], t: number): RGB {
  return tints[Math.min(tints.length - 1, Math.floor(t * tints.length))]!;
}

/**
 * Puxa o tom da pedra na direção da pedra MORTA, conforme o Rot chegou ali.
 *
 * É o único efeito de matiz do campo de variação, e é de propósito o mais
 * fraco deles: o teste do módulo é a captura em cinza, e matiz não sobrevive
 * a ela. Quem carrega a informação é o VALOR (a parede escurece), a JUNTA
 * (que engorda) e a FALTA (nicho, fiada partida). A cor doente é confirmação
 * pra quem vê colorido, nunca o argumento.
 */
function sick(c: RGB, t: number): RGB {
  const d = PALETTE.rot.dead;
  const k = t * 0.45;
  return [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k];
}

/**
 * Alvenaria da vila.
 *
 * A leitura que ela precisa entregar é "ordem": fiada travada, junta
 * deslocada, cimalha no alto. Ordem é o que faz o Rot parecer desordem
 * mais tarde — sem uma referência arrumada, superfície irregular não lê
 * como corrupção, lê como estilo.
 *
 * O acidente vem de pedra FALTANDO, não de cor sorteada: nicho escuro na
 * parede é vila abandonada, e quebra o ritmo da grade sem inventar matiz.
 */
function buildStone(s: Surface, b: Block, free: readonly [boolean, boolean]): void {
  const V = PALETTE.stone.value;
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
  const zF = D / 2, zB = -D / 2;

  backing(s, b, PALETTE.stone.base, V.mortar);
  masonry(s, x0, x1, y0, y1, zF, STONE_TINTS, V, null, free);
  stoneTop(s, x0, x1, y1, zF, zB, STONE_TINTS, V);
  ends(s, b, PALETTE.stone.base, V, false);
}

/**
 * Quais pontas do bloco dão pra fora. Ver `CourseOpts.freeL`.
 *
 * Só olha vizinho que COMPARTILHA ALTURA: um bloco encostado mas inteiro
 * abaixo do outro não cobre a ponta de cima, e ali a pedra pode avançar.
 */
function freeEnds(blocks: readonly Block[], b: Block): [boolean, boolean] {
  let l = true;
  let r = true;
  for (const o of blocks) {
    if (o === b) continue;
    if (o.y >= b.y + b.h - 0.05 || o.y + o.h <= b.y + 0.05) continue;
    if (Math.abs(o.x + o.w - b.x) < 0.4) l = false;
    if (Math.abs(o.x - (b.x + b.w)) < 0.4) r = false;
  }
  return [l, r];
}

/**
 * Fundo escuro atrás da alvenaria. É ele que garante que fresta seja
 * SOMBRA e não vazio — sem ele, as juntas viram furos e o céu aparece
 * através do muro (verificado em captura: o palco leu como grade de
 * azulejo iluminada por trás).
 */
function backing(s: Surface, b: Block, col: RGB, m: number): void {
  const z = D / 2 - 0.04;
  s.front(b.x, b.y, b.x + b.w, b.y + b.h, z, col, m * 0.7, m * 0.7, m, m);
}

/**
 * Corpo da alvenaria: cimalha, sombra de cimalha, fiadas e embasamento.
 *
 * `rot` não-nulo transforma a mesma rotina no substrato corroído: a
 * estrutura continua sendo a de um muro (é preciso ver que ALI ERA UM
 * MURO), o que muda é quanto de cada pedra sobrou.
 */
function masonry(
  s: Surface, x0: number, x1: number, y0: number, y1: number, zF: number,
  tints: RGB[], V: ValueScale,
  rot: ((x: number, y: number) => number) | null,
  free: readonly [boolean, boolean],
): void {
  const H = y1 - y0;
  const capH = Math.min(0.44, H * 0.18);
  const corniceH = Math.min(0.20, H * 0.08);
  const plinthH = H > 2.2 ? 0.8 : 0;
  const bodyTop = y1 - capH - corniceH;
  const bodyBot = y0 + plinthH;
  // Ruína no MEIO do bloco. A decisão de quanto a fiada varia é da fiada
  // inteira (uma fiada é uma fiada), então ela usa um X só; o que é POR
  // PEDRA fica dentro de `course`, onde cada pedra tem o X dela.
  const ruin = ruinAt((x0 + x1) / 2);

  // Cimalha: pedras largas e claras, sem pedra faltando. É a promessa de
  // "dá pra pisar aqui", e promessa com buraco não vale.
  //
  // Ela é a ÚNICA coisa que a ruína não morde, e é decisão de jogabilidade,
  // não de arte: um nicho vazio na beirada onde o pé pousa seria o cenário
  // mentindo sobre a colisão. A vila desaba por baixo da linha de pisar.
  course(s, x0, x1, y1 - capH, capH, zF, tints, V, rot, {
    minW: 1.3, jitter: 0.9, hi: V.hi * 1.16, lo: V.hi * 0.92, gaps: false, top: y1,
    face: bodyTop, foot: bodyBot, freeL: free[0], freeR: free[1],
  });

  cornice(s, x0, x1, y1 - capH - corniceH, corniceH, zF, tints[0]!, V, ruin);

  // Altura de fiada VARIÁVEL. Com todas iguais o muro sai com pauta de
  // caderno, e pauta é a metade do efeito teclado — a outra metade era a
  // junta preta. Alvenaria de vila mistura fiadas grossas e finas porque
  // ninguém serrou aquelas pedras.
  //
  // E a variação CRESCE com a ruína, sem crescer a média: onde a vila ainda
  // é vila, o pedreiro nivelou o que deu; no fim, fiada fina e fiada grossa
  // se alternam sem lei porque o que se vê já é remendo sobre remendo.
  let cy = bodyTop;
  while (cy > bodyBot + 0.08) {
    const ch = COURSE * (0.80 - ruin * 0.30 + h(x0, cy, 4) * (0.52 + ruin * 1.0));
    const bot = Math.max(bodyBot, cy - ch);
    course(s, x0, x1, bot, cy - bot, zF, tints, V, rot, {
      minW: 0.72, jitter: 0.62, hi: V.hi, lo: V.lo, gaps: true, top: y1,
      face: bodyTop, foot: bodyBot, freeL: free[0], freeR: free[1],
    });
    cy = bot;
  }

  if (plinthH > 0) {
    // Embasamento: pedra maior, mais escura, sem brilho. Onde o muro
    // encontra o chão junta terra e musgo — e é o que impede o bloco de
    // parecer que flutua.
    course(s, x0, x1, y0, plinthH, zF, tints, V, rot, {
      minW: 1.5, jitter: 1.1, hi: V.plinth, lo: V.plinth * 0.72, gaps: false, top: y1,
      face: bodyTop, foot: bodyBot, freeL: free[0], freeR: free[1],
    });
  }

  // As formas que ATRAVESSAM a alvenaria, e só na pedra sadia: o Rot já tem
  // as dele (`rotMass`), e são elas que estas imitam em vocabulário de
  // pedra. Vêm depois das fiadas porque são camadas por cima da parede, não
  // parte dela — e é essa diferença de espécie que o olho usa pra parar de
  // contar pedras.
  if (!rot) {
    collapse(s, x0, x1, bodyTop, zF, tints, V);
    patchWork(s, x0, x1, bodyTop, zF, tints, V);
    renderCoat(s, x0, x1, bodyTop, zF, V);
  }
}

/**
 * O REBOCO: o pano de revestimento que sobrou, e a borda por onde ele caiu.
 *
 * É a peça que muda a leitura da rua, e a razão é de FREQUÊNCIA. A face
 * media 18.9% de variância em baixa frequência contra 65.1% do Rot: toda a
 * estrutura da pedra estava na escala da pedra, e não havia nada na escala
 * do muro. Um pano de 4u por 1.5u é uma forma de 160×60px que cobre cinco
 * pedras e três fiadas de uma vez — a mesma escala das línguas de `rotMass`,
 * pela mesma razão.
 *
 * Onde o pano está, a alvenaria SOME, e é isso que quebra a grade em vez de
 * enfeitá-la. Uma junta que atravessava 900px sem interrupção passa a
 * atravessar 200 e sumir.
 *
 * ── O que impede o pano de virar adesivo ─────────────────────────────
 *
 * Um retângulo claro e chapado seria trocar um defeito por outro maior. Três
 * coisas o resolvem, e nenhuma é textura:
 *
 *   A BORDA   quebrada em passo de 0.30u (12px) e com a sombra da lasca
 *             desenhada logo abaixo dela. É a sombra que prova ESPESSURA —
 *             sem ela o pano é tinta, com ela é camada.
 *   O VALOR   rampa vertical própria (claro embaixo da cimalha, que é onde
 *             a chuva não bate; sujo na quebra) mais mancha larga e o halo
 *             do escorrido. Nunca uniforme, nunca no ritmo da pedra.
 *   O TETO    2.7u de queda no máximo, contra 2.8u de face visível. O pano
 *             nunca chega ao rodapé do quadro: sempre sobra alvenaria
 *             embaixo, e é o CONTRASTE entre as duas que faz as duas lerem.
 */
function renderCoat(s: Surface, x0: number, x1: number, faceTop: number, zF: number, V: ValueScale): void {
  for (let cx = x0; cx < x1 - 1e-4; cx += COAT_STEP) {
    const ex = Math.min(cx + COAT_STEP, x1);
    const xm = (cx + ex) / 2;
    const d = coatDrop(xm);
    if (d <= 0) continue;
    // Onde a parede desabou não há o que revestir.
    if (scarSpan(xm, faceTop)) continue;
    const bot = faceTop - d;
    const g = h(cx, faceTop, 107);
    // Cal suja: clara o bastante pra ser outra MATÉRIA e não outra pedra,
    // escura o bastante pra nunca disputar com o fio da beirada. Duas
    // superfícies claras concorrendo na mesma parede trocariam um defeito de
    // superfície por um de leitura de jogo — e a comparação que vale é a
    // MEDIDA NA TELA, não a dos multiplicadores. Ver `hiV` mais abaixo.
    //
    // A rampa interna é FORTE (1.20 no alto contra 0.68 na quebra) e corre a
    // altura inteira do pano, não a de uma pedra. É ela que separa o pano da
    // alvenaria quando a cor sai da imagem: embaixo da cimalha a chuva não
    // bate e a cal continua clara; na borda quebrada ela está suja e gasta.
    // Uma faixa clara de valor único seria um cartão colado na parede.
    //
    // E ela é ESTRIADA na vertical (oitava de 1.4u somada a um arrepio por
    // coluna): cal velha lava em faixa, e sem isso um pano de 190px sai como
    // um cartão de valor único colado na parede — que é o defeito que este
    // elemento existe pra corrigir, só que numa escala maior.
    const j = (0.84 + drift(xm * 6.4, 106) * 0.36 + h(cx, faceTop, 110) * 0.10)
      * stain(xm, faceTop) * (1 - washAt(xm, faceTop - d * 0.45, faceTop) * 0.34);
    // A rampa não corre o pano inteiro: o pano é um PLANO claro, e o escuro
    // se concentra no quarto de baixo, junto da quebra.
    //
    // A diferença é medida, não estética. Com a rampa espalhada da cimalha à
    // lasca, a média do pano ficava a 20% da média da alvenaria e a variância
    // de baixa frequência não mexia — a rampa longa se parece com a rampa que
    // toda pedra já tem, só que maior, e o bloco de 24px não sabe distinguir
    // as duas. Concentrada, sobra um plano grande e uniformemente claro (a
    // forma) com um pé sujo (a aresta), e é o plano que a métrica lê.
    // Custa um quad por coluna.
    //
    // ── E O PANO NÃO PODE SER O PIXEL MAIS CLARO DO QUADRO ────────────
    //
    // O comentário acima sempre disse que a cal é "escura o bastante pra
    // nunca disputar com o fio da beirada". Isso era verdade em NÚMERO
    // NOMINAL (1.26 contra `V.lip` 1.50) e falso na TELA, e a razão é que os
    // dois não são a mesma face: o fio é face de CIMA (normal +Y) e o pano é
    // face de FRENTE (normal +Z), e sob esta luz a frente recebe mais. A
    // ordem se invertia na renderização.
    //
    // Medido em `#play@30`, coluna a coluna (pico do fio / pico do pano):
    //
    //     x=400 ....... 147 / 129     o fio ganha
    //     x=450 ....... 136 / 151     o PANO ganha por 11%
    //     x=500 ....... 136 / 138     empate
    //     x=90  ....... 128 / 133     o PANO ganha
    //
    // Em três de quatro colunas o pano encosta ou passa o fio — e não é uma
    // linha de 2px disputando com outra: é um plano de 150×60px contra um
    // fio, então o olho vai no pano. O contrato do fio ("o pé pousa aqui") não
    // se cumpre por ele estar claro, e sim por ele ser O MAIS CLARO; quem o
    // apagava era o reboco, sem nunca ter escurecido um décimo.
    //
    // O corte foi calibrado em DUAS passadas, e a segunda existe porque estes
    // multiplicadores não chegam à tela linearmente: com `ACESFilmicToneMapping`
    // ligado, cortar o valor em 18% (1.26 → 1.03) só derrubou a luminância em
    // 12.5% (152 → 133). O expoente efetivo medido é ~0.66, e sem ele a coluna
    // mais clara do pano (x=450) ficou em 133 contra 134 do fio — passava pelo
    // critério por UM ponto, que é ruído de dithering e não hierarquia.
    //
    // Com 0.93 a folga na pior coluna vai pra ~10 pontos, e o pano fica em
    // ~101-124 contra 128-147 do fio e 52-88 da alvenaria em volta. Continua
    // 1.4 a 1.9× mais claro que a pedra, que é o que o faz ler como outra
    // MATÉRIA — e o que de fato separa pano de pedra nem é o valor: é não
    // haver junta nenhuma em 150px de superfície contínua.
    //
    // Os dois números descem JUNTOS porque a rampa interna é que dá o volume
    // (claro embaixo da cimalha, sujo na quebra); baixar só o de cima
    // inverteria a rampa. O pé (0.62) NÃO desce: ele tem que continuar 24%
    // acima da sombra da quebra logo abaixo (`V.contact * 0.86`), senão os
    // dois se fundem e a lasca perde a aresta que prova espessura.
    const hiV = 0.93 * j;
    const midV = 0.80 * j;
    const foot = bot + (faceTop - bot) * 0.28;
    s.front(cx, foot, ex, faceTop, zF + 0.013, PALETTE.stone.warm,
      midV, midV * 0.98, hiV, hiV * 0.98);
    s.front(cx, bot, ex, foot, zF + 0.013, PALETTE.stone.warm,
      0.62 * j, 0.60 * j, midV, midV * 0.98);
    // Sombra da quebra, na alvenaria logo abaixo da lasca. Funda (0.14u = 6px)
    // e escura de propósito: o par claro-escuro na borda é o que dá ao pano
    // uma ARESTA em vez de um contorno, e é o que a métrica de baixa
    // frequência lê. Um pano claro sozinho quase não muda a média de um bloco
    // de 24px; um pano claro que termina num escuro muda os dois.
    s.front(cx, bot - 0.14, ex, bot, zF + 0.017, PALETTE.stone.base,
      V.contact * 0.52 * j, V.contact * 0.52 * j, V.contact * 0.86 * j, V.contact * 0.86 * j);
    // Fissura: o pano trinca antes de cair, e a trinca desce inteira. É a
    // única linha VERTICAL longa da parede — a alvenaria não tem nenhuma,
    // porque junta alinhada leria como azulejo. Aqui ela é bem-vinda pelo
    // motivo oposto: ela corta as fiadas.
    if (g > 0.90 && d > 1.0) {
      const w = 0.035 + g * 0.05;
      const lean = (h(cx, faceTop, 108) - 0.5) * 0.5;
      s.frontPoly([cx + 0.1 + lean, bot], [cx + 0.1 + lean + w, bot],
        [cx + 0.1 + w, faceTop], [cx + 0.1, faceTop],
        zF + 0.019, PALETTE.stone.base, V.contact * 0.5 * j, V.contact * 0.5 * j,
        V.mortar * 0.9 * j, V.mortar * 0.9 * j);
    }
  }
}

/**
 * O DESABAMENTO: o trecho de parede que veio abaixo, e o miolo à mostra.
 *
 * É o par do reboco na outra ponta da fase, e a variância pra baixo. Um muro
 * de vila não é uma casca: por trás da face bem assentada há ENCHIMENTO —
 * pedra miúda e argamassa jogadas entre os dois paramentos. Quando a face
 * cai, é isso que aparece, e é isso que a torna diferente de um nicho de
 * pedra faltando: o nicho tem o tamanho de uma pedra e o fundo liso, o
 * desabamento tem 4u de boca e o fundo é ENTULHO.
 *
 * Três coisas por coluna, e a terceira é a que fecha a leitura:
 *   o VÃO       escuro no alto, onde o teto do buraco não vê céu, clareando
 *               no fundo. Degrau invertido — o mesmo da cratera do Rot.
 *   o MIOLO     pedaços de enchimento em valor médio, alturas desiguais. Sem
 *               eles o vão é um retângulo preto, e retângulo preto na parede
 *               é adesivo preto.
 *   a SOLEIRA   o fio claro de pedra que sobrou na borda de baixo. Uma linha
 *               clara em volta do escuro é o que faz o escuro ter fundo.
 */
function collapse(
  s: Surface, x0: number, x1: number, faceTop: number, zF: number, tints: RGB[], V: ValueScale,
): void {
  const step = 0.30;
  for (let cx = x0; cx < x1 - 1e-4; cx += step) {
    const ex = Math.min(cx + step, x1);
    const sp = scarSpan((cx + ex) / 2, faceTop);
    if (!sp) continue;
    const [lo, hi] = sp;
    if (hi - lo < 0.22) continue;
    const g = h(cx, faceTop, 148);
    const j = stain((cx + ex) / 2, hi);

    // O vão fica em -0.026, ATRÁS do plano do nicho.
    //
    // O nicho de pedra faltando é desenhado em zF - 0.020 desde sempre, e a
    // primeira versão deste vão usou o mesmo número — EXATAMENTE coplanar. No
    // portão 20% das pedras são nicho (`g > 0.97 - rn*0.17` com rn=1), então
    // na borda do desabamento havia nicho e vão brigando no mesmo z, e o que
    // saía na captura era um pente de linhas de 1px alternando entre o valor
    // do nicho e o do vão. Não é forma nenhuma: é o depth buffer sorteando
    // linha a linha. Foram cinco tentativas de corrigir isso como se fosse
    // desenho (jitter do monte, pedra fatiada, chanfro em fiada fina, pedra
    // sobreposta ao vão, separação do monte) antes de eu medir os pixels e ver
    // duas superfícies alternando por LINHA, que é assinatura de z e não de
    // geometria. Medir cedo teria custado uma captura em vez de cinco.
    s.front(cx, lo, ex, hi, zF - 0.026, tints[0]!,
      V.socket * 1.45 * j, V.socket * 1.35 * j, V.socket * 0.5 * j, V.socket * 0.55 * j);

    // O MONTE é uma forma só, não um pedaço por coluna.
    //
    // A primeira versão sorteava a altura do entulho por coluna: na captura
    // saiu um BARCODE — vinte tracinhos horizontais de alturas independentes,
    // que é padrão novo dentro do buraco em vez de matéria. O perfil agora
    // vem de uma oitava de 4u (uma duna atravessando o vão inteiro) com um
    // arrepio por coluna por cima, então as colunas vizinhas se somam num
    // monte só e o que varia é a crista dele.
    // Só a oitava larga, sem arrepio por coluna. O arrepio foi tentado duas
    // vezes e nas duas a captura devolveu a mesma coisa: com a crista pulando
    // de coluna em coluna, as faixas claras de 3px empilham desalinhadas e o
    // vão ganha um BARCODE dentro dele — padrão novo no lugar exato onde o
    // que tem que ler é ausência de padrão. O monte é uma duna atravessando o
    // buraco inteiro; quem varia é o buraco, não a pilha.
    const rise = (hi - lo) * clamp01(0.14 + drift(cx * 2.2, 150) * 0.44);
    if (rise > 0.12) {
      s.front(cx, lo, ex, lo + rise, zF - 0.016, tints[1]!,
        V.plinth * 0.40 * j, V.plinth * 0.36 * j, V.plinth * 0.80 * j, V.plinth * 0.74 * j);
      // A crista pega luz, e é UMA linha contínua e torta: pilha. Grossa o
      // bastante (0.10u = 4px) pra ler como aresta e não como fio.
      //
      // E ela fica 0.008 à frente do corpo do monte, não 0.002. Este número
      // custou três capturas: a crista está DENTRO da faixa do corpo (ela é a
      // borda de cima dele), então as duas são sobrepostas por construção, e
      // com 0.002 o depth buffer não separava as duas a 18u de distância. O
      // que saía era MOIRÉ — linhas pretas de 1px alternando a cada 3px, num
      // pente de 25×13px dentro do vão. Passei três rodadas atacando isso como
      // se fosse forma (jitter do monte, pedra fatiada, pedra sobreposta ao
      // vão) porque parecia desenho; não era desenho, era z-fighting. O resto
      // do arquivo separa coplanares por 0.004 no mínimo, e havia razão.
      s.front(cx, lo + rise - 0.10, ex, lo + rise, zF - 0.008, tints[2]!,
        V.lo * 0.68 * j, V.lo * 0.66 * j, V.hi * (0.80 + g * 0.24) * j, V.hi * 0.84 * j);
    }

    // Soleira: o fio de alvenaria que sobrou na borda de baixo do vão. À
    // FRENTE das pedras (zF + 0.006) e não atrás delas — abaixo do buraco a
    // parede continua inteira, e uma soleira desenhada atrás some sob a
    // primeira pedra sadia. Uma linha clara em volta do escuro é o que faz o
    // escuro ter fundo; escondida, ela não faz nada.
    s.front(cx, lo - 0.055, ex, lo, zF + 0.006, tints[3]!,
      V.lo * 0.62 * j, V.lo * 0.58 * j, V.hi * 1.05 * j, V.hi * 0.98 * j);
  }
}

/**
 * A faixa escura sob a cimalha — e o que a ruína faz com ela.
 *
 * É o maior salto de valor da parede inteira e o degrau que a vista lateral
 * usa pra separar "topo" de "parede". Mas ela é também a linha mais RETA e
 * mais CONTÍNUA do palco, e por isso é o melhor sinal de ordem que existe
 * aqui: uma reta de 40u atravessando o bloco só se sustenta onde alguém
 * ainda assenta pedra.
 *
 * Então é ela que a ruína parte. No `ki` a faixa sai idêntica ao que sempre
 * foi — um retângulo só, contínuo. No `ketsu` ela some em trechos, muda de
 * espessura e sobe e desce alguns centímetros, e a parede perde a régua. Em
 * cinza isso continua legível, porque o que mudou foi a CONTINUIDADE de uma
 * linha, não a cor dela.
 */
function cornice(
  s: Surface, x0: number, x1: number, y: number, hgt: number, zF: number,
  col: RGB, V: ValueScale, ruin: number,
): void {
  if (hgt < 1e-4) return;
  // Passo largo: o objetivo é uma linha PARTIDA em pedaços de tamanho de
  // pedra, não uma linha serrilhada. Serrilha lê como falha de render.
  const step = 1.15;
  for (let cx = x0; cx < x1 - 1e-4; cx += step) {
    const ex = Math.min(cx + step, x1);
    // Trecho que caiu de vez. Atrás dele continua o fundo do bloco, então o
    // buraco é profundidade e não vazio — mesma regra do resto do módulo.
    if (ruin > 0.45 && h(cx, y, 16) > 1.36 - ruin * 0.72) continue;
    const hh = hgt * (1 - ruin * 0.5 * h(cx, y, 17));
    const dy = (h(cx, y, 18) - 0.5) * ruin * 0.10;
    // A CIMALHA ACOMPANHA O RECALQUE — e nada além disso muda aqui.
    //
    // Ela é a linha mais reta e mais contínua do palco: a captura mediu 81%
    // da largura do quadro numa junta só, e esta faixa é a mais forte das
    // quatro. Reta perfeita de 40u é metade da leitura de grade, por melhor
    // que esteja pintado o que vem embaixo.
    //
    // Nenhum trecho novo some: a peça continua inteira onde já estava, só
    // desce com o terreno. E é POLÍGONO e não retângulo pelo mesmo motivo
    // que a pedra virou polígono — dois trechos vizinhos avaliam o campo no
    // MESMO x e casam exato; com retângulo, cada trecho ficaria plano e a
    // linha ganharia degrau, que numa linha contínua lê como falha de
    // render, não como parede que assentou.
    const sL = settle(cx);
    const sR = settle(ex);
    // Meio milímetro à frente da alvenaria: a fiada de baixo agora ondula
    // por conta própria e pode encostar aqui. Coplanar, quem ganha é a
    // sorte do depth buffer; a decisão tem que ser tomada neste arquivo.
    s.frontPoly([cx, y + dy + sL], [ex, y + dy + sR], [ex, y + hh + dy + sR], [cx, y + hh + dy + sL],
      zF + 0.002, col, V.cornice * 1.5, V.cornice * 1.5, V.cornice, V.cornice);
  }
}

interface CourseOpts {
  minW: number;
  jitter: number;
  hi: number;
  lo: number;
  gaps: boolean;
  /** Topo do bloco, em Y do mundo. Só serve à oclusão de céu (`skyOcc`). */
  top: number;
  /**
   * A faixa em que a face pode ser devastada: da cimalha (`face`) ao
   * embasamento (`foot`).
   *
   * Os dois existem por causa de COEXISTÊNCIA, não de estilo. A linha de
   * assentamento agora ondula, e ondulação que passasse destes limites
   * empurraria pedra pra dentro da fiada de remate (a linha de pisar) ou pra
   * dentro do embasamento — os dois desenhados no mesmo z, os dois com
   * promessa a cumprir. A parede afunda entre eles e para neles.
   */
  face: number;
  foot: number;
  /**
   * As pontas que dão pra FORA — as únicas em que uma pedra pode avançar.
   *
   * Onde dois blocos se encostam (a rua sobe um degrau em x=34) o que está
   * do lado de lá não é céu, é a alvenaria do vizinho no MESMO z: pedra
   * avançada ali disputaria profundidade com ela e o resultado é
   * cintilação — que é pior que a reta que se está tentando quebrar.
   */
  freeL: boolean;
  freeR: boolean;
}

/**
 * Quanto de céu aquele ponto da parede enxerga.
 *
 * Parede real NUNCA é iluminada por igual de cima a baixo: quanto mais
 * fundo, menos céu a superfície vê, e é esse degradê lento que separa um
 * muro de um PAINEL com muro impresso. O palco não tinha nada disso — cada
 * bloco saía com a mesma exposição do fio ao rodapé, e é a maior razão
 * isolada pela qual a alvenaria lia como adesivo.
 *
 * Custa ZERO triângulo: é multiplicador de cor de vértice em geometria que
 * já existia. E é o oposto da mancha de `stain()`, de propósito — aquela é
 * alta frequência e local, esta é baixa frequência e global. Uma dá
 * material, a outra dá VOLUME.
 *
 * Os 6u são a altura que a câmera de fato mostra abaixo da beirada; abaixo
 * disso o degradê satura e não se gasta variação no que ninguém vê.
 */
function skyOcc(top: number, y: number): number {
  return 1 - clamp01((top - y) / 6.0) * 0.26;
}

/**
 * Deslocamento da pedra de PONTA. Positivo recua pra dentro do bloco,
 * negativo avança pra fora dele.
 *
 * O recuo mostra o fundo escuro do bloco (`backing`), nunca o céu — mesma
 * regra do resto do arquivo. O avanço é o que de fato quebra a silhueta
 * contra o céu, e por isso ele é o que precisa de trava:
 *
 * **Pedra que avança só existe bem abaixo da linha de pisar.** Uma saliência
 * a 20cm do topo insinuaria chão onde não há chão, e o jogador leria como
 * beirada uma coisa em que o pé não pousa. Perto do topo a ponta só recua;
 * de 1.1u pra baixo ela pode avançar, que é onde uma quina arrancada de
 * verdade deixa as pedras de amarração aparecendo.
 *
 * A amplitude cresce com a ruína pelo mesmo motivo que tudo aqui cresce
 * com ela: na rua a ponta é um muro que termina, no portão é um muro que
 * foi derrubado.
 */
function endBite(
  x: number, cy: number, ty: number, top: number, ruin: number, salt: number, free: boolean,
): number {
  const d = (h(x, cy, salt) - 0.58) * (0.22 + ruin * 0.34);
  return d < 0 && (ty > top - 1.1 || !free) ? 0 : d;
}

/** Uma fiada. A junta vertical anda com a fiada: junta alinhada lê como azulejo. */
function course(
  s: Surface, x0: number, x1: number, cy: number, ch: number, zF: number,
  tints: RGB[], V: ValueScale,
  rot: ((x: number, y: number) => number) | null,
  o: CourseOpts,
): void {
  if (ch < 0.06) return;

  // ── A LINHA DE ASSENTAMENTO DEIXA DE SER RETA ──────────────────────
  //
  // Toda fiada nascia com uma altura só, sorteada em `x0` e válida pelos 40u
  // do bloco: o resultado é uma faixa de espessura constante atravessando o
  // quadro inteiro, e quatro delas empilhadas são a GRADE que a captura
  // mediu (81% da largura numa junta só). Nenhuma dose de acidente por pedra
  // desfaz isso, porque o acidente por pedra mora DENTRO da célula.
  //
  // Aqui cada canto de cada pedra é avaliado neste campo, e a fiada vira uma
  // faixa que engorda e afina ao longo do bloco. Duas parcelas, com papéis
  // diferentes:
  //
  //   `settle`  move TODAS as juntas juntas — a parede afundou ali. É o que
  //             tira a régua sem tirar a ordem: no `ki` é só isto que age, e
  //             muro que assentou continua sendo muro bem feito.
  //   a onda    muda a ALTURA de cada fiada com sal próprio por junta. Sem
  //             ela as fiadas continuariam paralelas e a grade continuaria de
  //             pé, só que torta. Cresce com a ruína: no portão, fiada fina e
  //             fiada grossa se alternam dentro do mesmo bloco.
  //
  // É função pura de (junta, x) por um motivo mecânico e não estético: a
  // pedra vizinha avalia a MESMA junta a 10cm de distância, e a fiada de
  // baixo avalia a mesma junta no mesmo lugar. Campo contínuo mantém a fresta
  // com a espessura de sempre; qualquer parâmetro sorteado POR PEDRA abriria
  // fresta de verdade entre elas — e fresta aqui é céu através do muro, que é
  // a única coisa que este arquivo nunca deixa acontecer.
  //
  // As duas parcelas morrem nas duas pontas: na junta de cima porque logo
  // acima está a fiada de remate (a linha de pisar) e a cimalha, e no
  // embasamento porque é ele que apoia o bloco no chão. Ver `CourseOpts.face`.
  const off: (y: number, x: number) => number = o.gaps
    ? (y, x) => {
        const w = clamp01((y - o.foot) / 0.5);
        return settle(x) * w
          + (drift(x * 1.5, 300 + (Math.round(y * 4) & 63)) - 0.5)
          * (0.26 + ruinAt(x) * 0.22) * w * clamp01((o.face - y) / 0.45);
      }
    : () => 0;

  // Deslocamento amarrado ao Y do mundo, não à contagem de fiadas: assim
  // dois blocos vizinhos de alturas diferentes ainda casam a alvenaria.
  // FIADA FINA DEMAIS PRA TER DETALHE DE PEDRA.
  //
  // Onde a ruína é máxima a altura de fiada desce a 0.29u — 12px, e a pedra
  // dentro dela fica com 9. Um pé escuro de 3px mais uma fita clara de 2px
  // numa pedra de 9px param de descrever uma pedra: a captura do portão
  // mostrou o que eles descrevem quando se empilham, que é um PENTE de linhas
  // pretas de 1px a cada 3px, e ele apareceu dentro do vão do desabamento —
  // onde menos se pode ter padrão.
  //
  // O teste é na FIADA e não na pedra, e a diferença importa: pedra baixa numa
  // fiada alta é uma pedra pequena com a vizinha grande do lado, e continua
  // merecendo o chanfro que a faz ler como peça. O que vira pente é fiada fina
  // empilhada em fiada fina. Testar na pedra custou 700 triângulos de chanfro
  // na rua inteira pra resolver um defeito que só existe no portão.
  const thin = ch < 0.32;

  const shift = h(x0, cy, 3) * o.minW;
  let cx = x0 - shift;
  while (cx < x1 - 1e-4) {
    const k = h(cx, cy, 1);
    const w = o.minW + k * o.jitter;
    let s0 = Math.max(x0, cx + JOINT);
    let s1 = Math.min(cx + w - JOINT, x1);
    cx += w;
    if (s1 - s0 < 0.14) continue;

    const my = cy + JOINT;
    const ty = cy + ch - JOINT * 0.6;
    if (ty - my < 0.05) continue;

    // Quem encosta na ponta do bloco. Calculado ANTES da mordida, porque a
    // mordida move a pedra e o teste deixaria de valer.
    const atL = s0 <= x0 + JOINT * 1.5;
    const atR = s1 >= x1 - JOINT * 1.5;

    // A PONTA DO MURO É ARRANCADA, NÃO SERRADA.
    //
    // Toda fiada terminava exatamente em x0/x1, e um bloco de chão tem 9u:
    // o palco fechava numa vertical perfeita de 9u sem um acidente. É o
    // mesmo defeito da aresta de cima, virado 90° — reta matemática contra
    // o céu lê como recorte, e não importa quão bem sombreada esteja a face.
    //
    // Aqui a pedra da extremidade avança ou recua alguns centímetros, e é
    // por fiada: a variação anda na vertical, que é a direção em que a
    // silhueta da ponta precisa quebrar.
    if (o.gaps) {
      if (atL) s0 = x0 + endBite(x0, cy, ty, o.top, ruinAt(x0), 22, o.freeL);
      if (atR) s1 = x1 - endBite(x1, cy, ty, o.top, ruinAt(x1), 23, o.freeR);
    }

    const g = h(s0, cy, 2);
    const xm = (s0 + s1) / 2;
    const a = rot ? rot(xm, ty) : 0;
    // Onde esta pedra está NA FASE. É daqui que sai toda a variação por
    // posição: a mesma rotina desenha a rua da vila e o portão caído, e o
    // que a separa é o par de campos, não um ramo de código diferente.
    const dk = decayAt(xm);
    const rn = ruinAt(xm);

    // Os quatro cantos na linha ondulada. O topo desta fiada e o fundo da de
    // cima saem da MESMA junta nominal, então a fresta entre elas continua
    // com a espessura de projeto por mais que a linha ande.
    const ob0 = off(cy, s0), ob1 = off(cy, s1);
    const ot0 = off(cy + ch, s0), ot1 = off(cy + ch, s1);

    // ── O que a face perdeu ───────────────────────────────────────────
    //
    // Onde a parede DESABOU não há pedra a desenhar: o que se vê é o vão e o
    // enchimento, e quem os desenha é `collapse`. Onde alguém REMENDOU, quem
    // desenha é `patchWork`. Só a pedra inteiramente dentro some — a que
    // atravessa a borda fica, e é ela que dá ao buraco um contorno de PEDRA
    // ARRANCADA em vez de um recorte.
    //
    // Os dois testes olham só o centro da pedra, e isso é seguro porque os
    // dois campos são CONTÍNUOS em x: a pedra que sobrar por cima do vão o
    // cobre, e cobrir é inofensivo — atrás dela continua havendo parede.
    //
    // O REBOCO não entra aqui, e a ausência é deliberada. Havia um teste de
    // "pedra escondida sob o pano, não desenha", e ele custou uma rodada: a
    // borda do pano virou função em DEGRAU (as lascas de 0.9u), e três
    // amostras não bastam pra provar cobertura de uma função descontínua. Na
    // captura saíram blocos escuros de 60×40px no meio da parede — pedra que
    // não foi desenhada com pano que não chegou ali. Duzentos triângulos não
    // valem um buraco na face; o pano é opaco e cobre o que tiver embaixo.
    if (o.gaps && !rot) {
      // Pelo CENTRO da pedra, e não por contenção inteira. A regra antiga
      // deixava de pé toda pedra que atravessasse a borda — e num vão de 1.5u
      // isso são quatro pedras empilhadas por cima do buraco, cada uma com
      // uma fresta de 3px entre ela e a de cima. Fresta normalmente mostra o
      // fundo do bloco (argamassa, valor 0.52); aqui ela mostrava o VÃO, que
      // é quase preto e está 2cm à frente do fundo. Resultado na captura: um
      // pente de linhas pretas de 1px dentro do desabamento. Pelo centro,
      // sobra no máximo uma pedra de cada lado e a borda continua sendo feita
      // de pedra arrancada em vez de recorte.
      const sp = scarSpan(xm, o.face);
      if (sp && (my + ty) * 0.5 > sp[0] && (my + ty) * 0.5 < sp[1]) continue;
      const pt = patchSpan(xm, o.face);
      if (pt && ty < pt[1] - 0.05 && my > pt[0] + 0.05) continue;
    }

    // Pedra faltando: nicho escuro. Note que ele NÃO é um furo — o fundo
    // do bloco continua ali atrás, então o que se vê é profundidade.
    //
    // A FREQUÊNCIA é o campo de ruína, e é a variação mais forte do
    // arquivo: na rua o nicho é um acidente a cada trinta pedras e lê como
    // "faltou uma"; no fim, é uma a cada cinco e a parede lê como "isto
    // está caindo". Mesma primitiva, duas leituras opostas.
    if (o.gaps && !rot && g > 0.97 - rn * 0.17) {
      s.frontPoly([s0, my + ob0], [s1, my + ob1], [s1, ty + ot1], [s0, ty + ot0],
        zF - 0.02, tints[0]!,
        V.socket * 2.1, V.socket * 1.9, V.socket, V.socket);
      continue;
    }

    if (rot) {
      // A oclusão de céu não alcançava o substrato do Rot: este desvio
      // acontecia ANTES de `j` ser calculado, e a parede da poça saía com a
      // mesma exposição da crista ao rodapé — plana, que é exatamente o
      // defeito que `skyOcc` existe pra corrigir na pedra sadia. Agora ela
      // chega aqui, e a matéria morta ganha o mesmo volume que a viva.
      rotStone(s, s0, s1, my, ty, zF, tints, V, a, g, k, skyOcc(o.top, ty));
      continue;
    }

    // Três coisas variam por pedra, e as três precisam variar: o TOM
    // (senão a fiada lê impressa), a MANCHA larga que ela compartilha com
    // as vizinhas (senão vira xadrez), e a FORÇA da rampa interna — esta
    // última é a que mais importa. Com todas as pedras rampeadas igual,
    // cada uma fica com o mesmo bisel e a parede vira teclado; misturando
    // pedra quase chapada com pedra muito abaulada, o olho para de achar
    // o molde.
    const tint = sick(pick(tints, g), dk);
    const dark = g > 0.87 ? 0.74 : 1;
    // ESCORRIDO: a parede escurecida sob a junta que vaza. Custa zero
    // triângulo e atravessa três ou quatro fiadas de uma vez, que é o ponto —
    // é a única variação de valor deste laço que não tem o tamanho de uma
    // pedra. Ver `washAt`. Quem lhe dá contorno é o `bevel` mais abaixo, que
    // some junto: a mancha se anuncia por FALTA de aresta, não por linha.
    const wsh = o.gaps && !rot ? washAt(xm, ty, o.face) : 0;
    // A parede ESCURECE com o campo, e essa é a metade da variação que
    // sobrevive ao preto e branco. Duas contribuições diferentes: o Rot tira
    // luz da pedra (matéria morta não devolve luz), a ruína junta terra e
    // sombra nas frestas abertas. Somadas, a alvenaria do fim da fase sai
    // ~30% mais escura que a da rua sem sair da família de cor da pedra.
    const j = (0.80 + k * 0.34) * stain(xm, cy) * dark * (1 - dk * 0.26 - rn * 0.10)
      * skyOcc(o.top, ty) * (1 - wsh * 0.48);
    const mid = (o.hi + o.lo) / 2;
    // Rampa interna achatada pelo Rot: pedra comida perde o degrau que dá
    // volume. É o mesmo argumento de `rotStone` — superfície sem rampa lê
    // como coisa que já não tem forma própria.
    const spread = (o.hi - o.lo) * (0.35 + h(s0, cy, 6) * 1.15) * (1 - dk * 0.40);
    const hiV = (mid + spread / 2) * j;
    const loV = (mid - spread / 2) * j;
    // Aresta viva nas pontas do bloco: quina lascada pega luz, e é o
    // sinal mais barato de "a plataforma acaba aqui".
    const chipL = atL ? 1.22 : 1;
    const chipR = atR ? 1.22 : 1;

    // Junta COMIDA a partir da fresta, e é aqui que o `ten` se anuncia na
    // alvenaria: a pedra encolhe pra dentro e o que aparece em volta dela é
    // o fundo escuro do bloco. Não é a junta pintada mais escura — é pedra
    // que deixou de existir na borda, que é como o Rot de fato entra num
    // muro (pela água, pela fresta, de fora pra dentro).
    const eat = dk * (0.05 + k * 0.07);
    // Assentamento perdido: com a ruína alta cada pedra sobe ou desce um
    // pouco e a linha da fiada deixa de ser linha. Só no corpo do muro — a
    // cimalha e o embasamento (`gaps: false`) continuam nivelados, porque
    // um é a linha de pisar e o outro é o que apoia o bloco no chão.
    const sag = o.gaps ? (h(s0, cy, 14) - 0.5) * rn * 0.09 : 0;
    const ax0 = s0 + eat, ax1 = s1 - eat;
    // A pedra é um QUADRILÁTERO, não um retângulo: cada canto na sua junta,
    // cada junta na sua altura. Custa os mesmos 2 triângulos — `frontPoly`
    // existe desde sempre pra crosta do Rot, e é a mesma primitiva. O que
    // muda é que a pedra passa a ter assentamento em vez de encaixe.
    const ay0L = my + eat * 0.6 + sag + ob0, ay0R = my + eat * 0.6 + sag + ob1;
    // ── A PEDRA NÃO TEM A ALTURA DA FIADA ────────────────────────────
    //
    // Este é o resto do defeito, e sobreviveu a tudo o mais: com as formas
    // grandes no lugar, o recorte de 7u ENTRE elas ainda saía como grade
    // perfeita na captura, porque toda pedra de uma fiada ainda tinha
    // exatamente o mesmo topo e o mesmo fundo. Uma fileira de chanfros claros
    // alinhados ao pixel é uma linha tão reta quanto a junta, e ela reaparecia
    // a cada 20px pela tela inteira.
    //
    // Aqui a pedra encolhe pelo TOPO, nunca pelo fundo — e a assimetria é a
    // razão de isto ler como alvenaria em vez de estrago. Pedra ASSENTA: ela
    // apoia no leito da fiada de baixo, então o fundo acompanha a linha e é
    // por isso que o muro continua parecendo construído. O que sobra em cima
    // é cama de argamassa, mais grossa numa pedra que na vizinha, e o que
    // aparece ali é o fundo do bloco — sombra, nunca vazio, como sempre.
    //
    // Custa ZERO triângulo, e é o que os campos de baixa frequência não
    // podiam dar: eles quebram a parede onde estão, a cada 6 ou 13u; isto
    // quebra o ritmo em TODA pedra.
    // Média de 18% e pico de 42%: com 12% de média (a primeira tentativa) o
    // recorte ampliado ainda mostrava uma fiada de pedras da mesma altura —
    // 3px de diferença some no grão da imagem. O que o olho precisa pra parar
    // de contar módulos é diferença de TAMANHO entre vizinhas, e tamanho se
    // mede em dezenas de por cento, não em unidades.
    const short = Math.pow(h(s0, cy, 15), 1.3) * (0.42 + rn * 0.20);
    // Chão de 0.22u (9px) na pedra que sobra, e ele é obrigatório onde a
    // ruína é máxima: ali a fiada já varia de 0.29 a 1.17u por decisão de
    // outro agente, e 38% de uma fiada de 0.29u é uma lasca de 4px. Na
    // captura do portão isso empilhou em faixas finas e devolveu um BARCODE —
    // padrão novo no lugar da grade, que é o erro que esta rodada inteira
    // está evitando. Encolher pedra é variar tamanho, não fatiá-la.
    const drop = Math.min((ty - my) * short, Math.max(0, ty - my - 0.22));
    const ay1L = ty - eat * 0.6 + sag + ot0 - drop, ay1R = ty - eat * 0.6 + sag + ot1 - drop;
    const ayLo = Math.max(ay0L, ay0R), ayHi = Math.min(ay1L, ay1R);
    // Pedra comida até sumir: sobra o fundo do bloco, e sobra de graça.
    if (ax1 - ax0 < 0.1 || ayHi - ayLo < 0.05) continue;

    s.frontPoly([ax0, ay0L], [ax1, ay0R], [ax1, ay1R], [ax0, ay1L], zF, tint,
      loV * chipL, loV * chipR, hiV * chipR, hiV * chipL);

    // SOMBRA DE CONTATO — a peça que faltava, e a paleta já a prometia:
    // `ValueScale.contact` está documentado como "sombra de contato logo
    // abaixo de cada pedra" desde sempre e NUNCA foi desenhado para pedra
    // (só para a barriga de bloco fino, em `ends`). Sem ele cada pedra é um
    // retângulo com degradê suave de cima a baixo, que o olho lê como
    // superfície pintada; com ele a pedra ganha um pé escuro e passa a ler
    // como PEÇA ASSENTADA, com a de baixo carregando a de cima.
    //
    // Ela é uma FAIXA CURTA (30% da pedra, teto de 0.13u), não a rampa
    // inteira: o que distingue sombra de contato de sombreado genérico é o
    // gradiente ser apertado junto da junta. Espalhada, vira só "a pedra é
    // mais escura embaixo" e não informa contato nenhum.
    //
    // Vem à frente do chanfro e da trinca em Z (0.008 contra 0.004) porque
    // as três são coplanares por natureza e a ordem tem que ser decidida
    // aqui, não pela sorte do depth buffer.
    const cH = Math.min(0.13, (ayHi - ayLo) * 0.30);
    if (cH > 0.02 && !thin) {
      s.frontPoly([ax0, ay0L], [ax1, ay0R], [ax1, ay0R + cH], [ax0, ay0L + cH], zF + 0.008, tint,
        V.contact * j * chipL, V.contact * j * chipR, loV * chipR, loV * chipL);
    }

    // CHANFRO: fita fina de luz na aresta de cima da pedra.
    //
    // Pedra assentada não tem canto de navalha — o canto é quebrado, e o
    // quebrado pega luz. Sem isso cada pedra é um retângulo de corte reto,
    // e parede de retângulos de corte reto lê como GRADE, não como
    // alvenaria: foi o que a captura mostrou. Custa 2 triângulos por pedra
    // e é o detalhe que mais devolve materialidade por triângulo gasto.
    //
    // Só na aresta de CIMA porque a luz vem de cima: chanfrar os quatro
    // lados daria contorno fechado e a pedra voltaria a virar adesivo.
    //
    // O chanfro ENFRAQUECE com o Rot: canto quebrado só pega luz enquanto o
    // canto existe. Onde a junta já foi comida, a fita clara some junto — e
    // é essa perda que faz a pedra do fim da fase parecer gasta em vez de
    // apenas mais escura.
    //
    // E ele some no ESCORRIDO pela mesma razão, lida em água em vez de Rot:
    // canto molhado não devolve luz. É essa perda, mais que o escurecimento
    // de `wsh`, que faz a mancha atravessar fiadas — some a fita clara de
    // vinte pedras seguidas e o olho perde o molde onde a água passou.
    const bevel = Math.min(0.07, (ayHi - ayLo) * 0.22) * (1 - dk * 0.6) * (1 - wsh * 0.85);
    if (bevel > 0.012 && !thin) {
      s.frontPoly([ax0, ay1L - bevel], [ax1, ay1R - bevel], [ax1, ay1R], [ax0, ay1L], zF + 0.004, tint,
        hiV * 1.02, hiV * 1.02, hiV * 1.34 * chipL, hiV * 1.34 * chipR);
    }

    // Trinca: uma linha fina e torta atravessando a pedra. É o acidente
    // mais barato que existe contra ritmo — e é lore, porque a vila está
    // abandonada há tempo bastante pra pedra rachar.
    //
    // Uma pedra em dez racha na rua; perto de um terço racha no fim. A
    // trinca é o degrau intermediário entre "inteira" e "faltando": ela
    // deixa a parede do `ketsu` cheia de pedra ainda no lugar mas já
    // partida, que é o que separa ruína de demolição.
    if (k > 0.93 - (dk * 0.55 + rn * 0.45) * 0.26) {
      const t = 0.25 + g * 0.5;
      const tb = t + 0.1 - g * 0.22;
      const cxa = ax0 + (ax1 - ax0) * t;
      const cxb = ax0 + (ax1 - ax0) * tb;
      // As pontas seguem a inclinação da pedra: com a linha de assentamento
      // ondulada, uma trinca de topo e base retos sairia pela borda.
      const ya = ay0L + (ay0R - ay0L) * t;
      const yb = ay1L + (ay1R - ay1L) * tb;
      s.frontPoly([cxa, ya], [cxa + 0.035, ya], [cxb + 0.03, yb], [cxb, yb],
        zF + 0.004, tint, V.mortar * 0.8 * j, V.mortar * 0.8 * j, V.mortar * j, V.mortar * j);
    }

    // Crosta na junta de cima, na PEDRA SADIA. A mesma linha que o
    // substrato do Rot usa (`rotStone`), aqui rara e fraca: é o Rot tendo
    // passado por fora da poça. Existe pra que o `ketsu` não leia como um
    // lugar diferente da fase — a vila do portão caído é a mesma vila,
    // depois. Aparece só de `dk` 0.34 pra cima, então a rua nunca a vê.
    if (dk > 0.34 && g < (dk - 0.30) * 0.9) {
      const t0 = 0.02 + k * 0.05;
      const m = 0.30 + dk * 0.30;
      s.frontPoly(
        [ax0 - JOINT, ay1L - t0], [ax1 + JOINT, ay1R - t0 * 0.6],
        [ax1 + JOINT, ay1R + JOINT * 0.7], [ax0 - JOINT, ay1L + JOINT * 0.7],
        zF + 0.01, PALETTE.rot.crust, m * 0.42, m * 0.38, m, m * 1.15,
      );
    }
  }
}

/**
 * Face de cima da pedra.
 *
 * Três informações, da frente pra trás: o FIO (a beirada, o pixel mais
 * claro do bloco — é onde o pé pousa), o calçamento, e o REMATE lá atrás,
 * que é o que separa a plataforma do céu. Sem ele, a silhueta some na
 * névoa e o jogador não sabe onde acaba o chão.
 *
 * O fio é a única coisa aqui que não pode mudar, e por isso ficou num laço
 * só dele: é literalmente o mesmo código de sempre. O que estava atrás dele
 * — uma faixa reta de espessura constante — saiu pra `crest`.
 */
function stoneTop(
  s: Surface, x0: number, x1: number, y1: number, zF: number, zB: number,
  tints: RGB[], V: ValueScale,
): void {
  const lipZ = zF - 0.13;
  const cell = 0.95;
  for (let cx = x0; cx < x1 - 1e-4; cx += cell) {
    const e = Math.min(cx + cell, x1);
    const g = h(cx, y1, 5);
    const dk = decayAt(cx);
    const tint = sick(pick(tints, g), dk);
    // Duas variações do mesmo tom, e a diferença entre elas é o ponto: `j`
    // leva o campo de decadência, `jLip` não.
    //
    // O FIO não escurece com o campo. O calçamento pode apodrecer inteiro —
    // a beirada é contrato de jogabilidade ("o pé pousa aqui") e cenário não
    // tem licença pra mentir sobre colisão. Ela continua variando de pedra
    // pra pedra como sempre variou; o que ela não faz é apagar porque o
    // jogador andou 150u. A rua envelhece do fio pra DENTRO, que também é
    // onde envelheceria de verdade: o pisoteio mantém a borda gasta e limpa
    // enquanto o miolo junta limo.
    const jLip = (0.86 + g * 0.3) * stain(cx, y1 + 2);
    const j = jLip * (1 - dk * 0.22);
    s.top(cx, e, lipZ, zF, y1, tint, V.topFront * j, V.topFront * j, V.lip * jLip, V.lip * jLip);
  }

  crest(s, x0, x1, y1, lipZ, zB, tints, V, STONE_CAP);
}

/**
 * Perfil e proporção de um remate. O que muda entre pedra e madeira não é
 * a rotina, é o TAMANHO DA PEÇA e a facilidade com que ela vai embora.
 */
interface CrestOpts {
  /** Largura MÉDIA da peça. A real varia ±35% — ver o laço. */
  step: number;
  /**
   * Profundidade da peça em Z, em unidades do mundo — e este número é o que
   * decidiu a rodada, então vale a régua.
   *
   * A primeira versão dava ao remate metade da profundidade do bloco (1.9u).
   * Na captura, cada peça virou um POLÍGONO ESCURO SOLTO boiando acima do
   * muro. O motivo é projeção, não sombreamento: o meio-ângulo horizontal do
   * quadro é 28.5°, então uma face horizontal de 1.9u de fundo CISALHA
   * 1.9·sen(28.5°) = 0.9u = 37px na borda da tela, contra os 32px de largura
   * da própria peça. A face de cima saía mais comprida na diagonal do que
   * larga, e o olho lia um risco, não uma pedra.
   *
   * Com 0.62u o cisalhamento cai pra 12px e a peça volta a ler como peça. O
   * que se perde é a face de cima (vira um fio de 3px) — e não se perde nada,
   * porque esse fio é exatamente o contorno escuro contra o céu que o topo
   * sempre teve que entregar.
   */
  depth: number;
  /** Altura de projeto da peça, e quanto o assentamento dela varia. */
  seat: number;
  seatVar: number;
  /** Entulho: acúmulo por cima do remate. Potência 3 — raro, mas não único. */
  rubble: number;
  /** Quão pontuda é a distribuição do entulho. 3 = coroa contínua; 1 = peça avulsa. */
  rubblePow: number;
  /**
   * Quanto do remate falta INDEPENDENTE da ruína — a diferença de espécie
   * entre um muro e um telhado.
   *
   * Muro de vila tem coroa de projeto: ela existe inteira, e é a ruína que a
   * arranca. Telhado abandonado não tem cume nenhum — tem tábua solta aqui e
   * ali. Com este número baixo nos dois, a captura de `#play@76` mostrou o
   * defeito: as peças do telhado encostaram umas nas outras e viraram UMA
   * BARRA HORIZONTAL CONTÍNUA boiando sobre o telhado. Trocar uma reta por
   * uma reta levantada não é quebrar silhueta.
   */
  gone: number;
  /** Sensibilidade à ruína. Telhado perde o cume mais fácil que muro perde a coroa. */
  bite: number;
  /** Sal do hash: pedra e madeira não podem sortear o mesmo perfil. */
  salt: number;
}

/**
 * Muro de vila: a coroa é fiada de projeto, e por isso o `ki` a mantém
 * quase inteira. O que a ruína faz é arrancar pedra dela em TRECHOS.
 */
const STONE_CAP: CrestOpts = {
  step: CAP_STEP, depth: 0.50, seat: 0.13, seatVar: 0.28,
  rubble: 0.34, rubblePow: 3, gone: 0.07, bite: 1.0, salt: 41,
};

/**
 * Telhado: RARO E ALTO, o oposto do muro.
 *
 * A plataforma de madeira tem 0.9u de espessura e a câmera a vê quase de
 * perfil — não há espaço pra uma coroa corrida ali, e a captura provou:
 * corrida, ela virou uma barra flutuando. O que quebra a silhueta de um
 * telheiro caído é tábua SOLTA: `gone` alto (mais da metade do cume não
 * existe), `seat` quase zero (o que sobrou está no nível do telhado) e o
 * acidente todo no entulho, com potência 1 pra que a peça que sobra seja
 * de fato alta. O resultado é um caibro aqui, outro dez metros adiante.
 */
const TIMBER_CAP: CrestOpts = {
  step: 1.05, depth: 0.45, seat: 0.05, seatVar: 0.10,
  rubble: 0.52, rubblePow: 1, gone: 0.56, bite: 1.15, salt: 71,
};

/**
 * O REMATE — a peça que estava faltando, e o assunto desta rodada.
 *
 * Toda pedra e toda plataforma de madeira do palco terminava numa aresta
 * horizontal MATEMATICAMENTE RETA contra o céu, com uma faixa escura de
 * espessura constante logo abaixo. Nenhum sombreamento salva isso: reta
 * perfeita de 40u lê como recorte de adesivo por melhor que esteja pintado
 * o que vem embaixo. A prova estava dentro da própria arte do jogo — o Rot
 * é a única superfície que não lê como adesivo, e a única cuja crista é
 * quebrada (`rotCrest`).
 *
 * A correção não é textura nem pós-processamento nem relevo em Z (esse
 * último foi medido e dá 0px: face paralela ao plano frontal não muda de
 * normal nem de posição na tela quando anda em Z). É GEOMETRIA EM Y, na
 * faixa de trás do topo, que é o lugar onde a silhueta de fato mora.
 *
 * ── O que o remate NÃO pode fazer ────────────────────────────────────
 *
 * Ele mora inteiro ATRÁS do fio de caminhada e ACIMA da superfície de
 * colisão. Nunca abre buraco na linha de pisar, nunca escurece o fio,
 * nunca desce abaixo de `y1` na faixa da frente. Cenário não tem licença
 * pra mentir sobre onde o pé pousa: o que pode ficar irregular é o que
 * está atrás e em cima, e é justamente ali que a silhueta se resolve.
 *
 * E ele também não pode competir com o fio: o topo do remate sai em
 * `topFront * 1.12`, bem abaixo de `lip`. Duas linhas claras concorrendo
 * na mesma beirada seria trocar um defeito de silhueta por um de leitura.
 *
 * ── Por que o vão é escuro e não vazio ───────────────────────────────
 *
 * Onde a peça faltou, o que aparece é o LEITO dela — a cama de argamassa
 * exposta, mais escura que qualquer remate. Mesma regra que rege a junta
 * no resto do arquivo: falta é profundidade, nunca céu. E é o degrau entre
 * peça e leito, não a peça sozinha, que faz a linha ler como partida.
 */
function crest(
  s: Surface, x0: number, x1: number, y1: number, zFront: number, zB: number,
  tints: RGB[], V: ValueScale, o: CrestOpts,
): void {
  const zCap = Math.min(zFront - 0.1, zB + o.depth);

  /** Altura da peça de remate naquele x. Zero = peça perdida. */
  const prof = (x: number): number => {
    if (x < x0 - 1e-4 || x > x1 - o.step * 0.5) return 0;
    const rn = ruinAt(x);
    const k = h(x, y1, o.salt);
    // Falta de espécie: o telhado quase não tem cume, o muro quase sempre
    // tem coroa. Ver `CrestOpts.gone`.
    if (h(x, y1, o.salt + 6) < o.gone) return 0;
    // A ruína come o remate em TRECHOS, não peça sim peça não. Um muro
    // perde a coroa onde alguma coisa bateu nele, e o que bate é grande —
    // com a falta distribuída por igual a crista sairia com dente de pente,
    // que é padrão e não acidente. Daí a ondulação lenta multiplicando.
    const run = drift(x * 0.33, o.salt + 1);
    if (k < rn * o.bite * (0.34 + run * 0.92)) return 0;
    // Quina vai primeiro. É onde a chuva escorre e onde tudo esbarra, e é
    // também onde a silhueta do bloco tem o pior defeito de todos: o
    // ângulo reto perfeito entre o topo e a ponta.
    const edge = Math.min(x - x0, x1 - x);
    if (edge < o.step * 1.7 && h(x, y1, o.salt + 2) < 0.40 - edge * 0.15) return 0;
    // Entulho: potência 3. A versão anterior usava 5 e a crista saiu com
    // ALTURA QUASE CONSTANTE — uma fileira de dentes do mesmo tamanho, que
    // é regularidade nova no lugar da reta antiga, não acidente. O que tira
    // o dente de pente é a peça alta aparecer com frequência suficiente pro
    // olho não achar o molde, e ainda assim ser minoria.
    return o.seat + k * o.seatVar + Math.pow(h(x, y1, o.salt + 3), o.rubblePow) * o.rubble;
  };

  /** Fechamento lateral do degrau entre duas peças de altura diferente. */
  const step = (x: number, a: number, bH: number, tint: RGB, j: number): void => {
    if (Math.abs(a - bH) < 0.02) return;
    const lo = y1 + Math.min(a, bH);
    const hi = y1 + Math.max(a, bH);
    // Sem este quad o céu entra por uma fresta vertical entre duas peças —
    // e fresta que mostra céu é exatamente o defeito que o módulo inteiro
    // evita desde a primeira linha ("fresta nunca é buraco").
    //
    // O valor fica PERTO do da frente da peça, e não na escala de lateral de
    // bloco. Lateral de bloco é escura porque diz "a plataforma acaba aqui",
    // que é informação de jogo; aqui não acaba nada — é a costela de uma
    // pedra de coroa. Com o valor escuro (a primeira versão usava
    // `sideFar`), estes quads saíram na captura como riscos pretos soltos
    // acima do muro, e risco preto solto é pior que a reta que se tirou.
    if (bH > a) {
      s.quad([x, lo, zB], [x, lo, zCap], [x, hi, zCap], [x, hi, zB], LEFT, tint,
        V.cornice * 0.72 * j, V.cornice * 1.02 * j, V.cornice * 1.14 * j, V.cornice * 0.80 * j);
    } else {
      s.quad([x, lo, zCap], [x, lo, zB], [x, hi, zB], [x, hi, zCap], RIGHT, tint,
        V.cornice * 0.94 * j, V.cornice * 0.66 * j, V.cornice * 0.74 * j, V.cornice * 1.06 * j);
    }
  };

  let prev = 0;
  let prevTint = tints[0]!;
  let prevJ = 1;
  let px = x0;
  while (px < x1 - 1e-4) {
    // LARGURA VARIÁVEL, e é a metade da correção que não é sombreamento.
    //
    // Com passo fixo a crista saiu na captura como uma fileira de dentes do
    // mesmo tamanho: trocou-se uma reta por um pente, e pente é tão evidente
    // quanto reta. É a mesma lição que `masonry` já tinha aprendido pra
    // altura de fiada ("com todas iguais o muro sai com pauta de caderno") —
    // só que a fiada aprendeu e o remate nasceu sem saber.
    const ex = Math.min(px + o.step * (0.66 + h(px, y1, o.salt + 5) * 0.78), x1);
    const ph = prof(px);
    const g = h(px, y1, o.salt + 4);
    const rn = ruinAt(px);
    const tint = sick(pick(tints, g), decayAt(px));
    // Peça escura avulsa, como a alvenaria tem: sem ela as peças presentes
    // saem todas no mesmo tom e a variação fica só na altura.
    const dark = g > 0.84 ? 0.76 : 1;
    const j = (0.84 + g * 0.32) * stain(px, y1 + 2) * dark;
    // Laje afundada — herdada do topo de pedra: onde a vila caiu o
    // calçamento cede, e o remate cede junto com ele. Mesmo sal (19) de
    // antes, então é o mesmo campo, só amostrado no passo do remate.
    const b = rn > 0.4 && h(px, y1, 19) > 0.95 - rn * 0.22 ? 0.34 : 1;
    // Junta: cada peça escurece no encosto da vizinha da esquerda. Sem ela
    // o remate vira fita corrida e o olho perde a contagem de peças, que é
    // metade da leitura de alvenaria.
    const jt = 0.70;

    // ── Quem é claro e quem é escuro, e por que nesta ordem ───────────
    //
    // A rodada anterior deixou o calçamento quase preto e o remate em tom
    // médio. Na captura o resultado foi o pior dos dois mundos: as peças
    // ficaram do MESMO VALOR do casario do fundo — a silhueta estava
    // quebrada e não se via — e ainda pareciam caixas soltas boiando sobre
    // uma prateleira preta, porque o que as separava da parede era uma
    // faixa preta larga em vez do próprio muro.
    //
    // Invertido: o calçamento fica MÉDIO e o remate fica ESCURO. Assim a
    // faixa de topo lê nos três degraus que ela sempre prometeu — fio
    // claríssimo, calçamento médio, CONTORNO escuro contra o céu — só que
    // agora o contorno tem altura variável em vez de espessura constante.
    // É a mesma frase do cabeçalho deste arquivo; o que mudou é que ela
    // deixou de ser uma reta.
    //
    // E resolve de graça o outro defeito: os quads de fechamento lateral,
    // que saíam como riscos pretos avulsos, agora são parte da coroa
    // escura — deixaram de ser anomalia e viraram matéria.
    s.top(px, ex, zCap, zFront, y1, tint,
      V.topFront * 0.66 * j * b, V.topFront * 0.72 * j * b,
      V.topFront * j * b, V.topFront * j * b * jt);

    if (ph > 0.03) {
      // Frente da peça: quase de frente pra câmera, então é ela que carrega
      // a silhueta. Escura, e um pouco menos escura em cima, onde a quina
      // ainda vê céu.
      s.front(px, y1, ex, y1 + ph, zCap, tint,
        V.cornice * 0.88 * j * b * jt, V.cornice * 0.94 * j * b,
        V.cornice * 1.42 * j * b, V.cornice * 1.30 * j * b * jt);
      // Face de cima da peça: um fio de 3px, e é o `topBack` de sempre
      // fazendo o trabalho de sempre — só que numa altura que muda de peça
      // pra peça, que é o ponto do módulo inteiro.
      s.top(px, ex, zB, zCap, y1 + ph, tint,
        V.topBack * j * 0.86, V.topBack * j,
        V.topBack * 1.9 * j, V.topBack * 1.9 * j * jt);
    } else {
      // Leito da peça perdida: o vão da coroa. Aqui o contorno afina até
      // quase sumir, e é essa alternância entre coroa alta e leito raso que
      // o olho lê como linha PARTIDA.
      s.top(px, ex, zB, zCap, y1, tint,
        V.topBack * j * b * 0.82, V.topBack * j * b * 0.82,
        V.topFront * 0.60 * j * b, V.topFront * 0.60 * j * b * jt);
    }

    step(px, prev, ph, ph > prev ? tint : prevTint, ph > prev ? j : prevJ);
    prev = ph;
    prevTint = tint;
    prevJ = j;
    px = ex;
  }
  // Fecha a última peça contra a ponta do bloco.
  step(x1, prev, 0, prevTint, prevJ);
}

/**
 * As duas pontas do bloco, e o fundo se ele for fino.
 *
 * A ponta é a informação que decide um pulo. Uma versão anterior deixou as
 * laterais só com a luz da direcional e elas fecharam em preto — a
 * plataforma acabava num nada, sem dizer a que distância. Aqui a lateral
 * tem rampa própria (clara junto da câmera, escura no fundo) e um fio
 * claro no alto, então mesmo virada pra sombra ela ainda tem forma.
 */
function ends(s: Surface, b: Block, col: RGB, V: ValueScale, endGrain: boolean): void {
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
  const zF = D / 2, zB = -D / 2;
  const rim = Math.min(0.09, b.h * 0.18);
  const g = endGrain ? 1.0 : 0.86;

  for (const [x, n, k] of [[x0, LEFT, 1.08], [x1, RIGHT, 0.8]] as Array<[number, P3, number]>) {
    // Corpo da lateral.
    if (n === LEFT) {
      s.quad([x, y0, zB], [x, y0, zF], [x, y1 - rim, zF], [x, y1 - rim, zB], n, col,
        V.sideFar * k * g, V.sideNear * k * g, V.sideNear * 1.1 * k * g, V.sideFar * 1.1 * k * g);
      s.quad([x, y1 - rim, zB], [x, y1 - rim, zF], [x, y1, zF], [x, y1, zB], n, col,
        V.sideNear * k, V.sideNear * 1.2 * k, V.lip * 0.8 * k, V.lip * 0.55 * k);
    } else {
      s.quad([x, y0, zF], [x, y0, zB], [x, y1 - rim, zB], [x, y1 - rim, zF], n, col,
        V.sideNear * k * g, V.sideFar * k * g, V.sideFar * 1.1 * k * g, V.sideNear * 1.1 * k * g);
      s.quad([x, y1 - rim, zF], [x, y1 - rim, zB], [x, y1, zB], [x, y1, zF], n, col,
        V.sideNear * 1.2 * k, V.sideNear * k, V.lip * 0.55 * k, V.lip * 0.8 * k);
    }
  }

  // Barriga só em bloco fino: numa plataforma suspensa a câmera passa por
  // baixo no pulo, e sem fundo o telhado vira casca vazada.
  if (b.h < 1.6) {
    s.quad([x0, y0, zF], [x1, y0, zF], [x1, y0, zB], [x0, y0, zB], DOWN, col,
      V.contact * 0.9, V.contact * 0.9, V.contact * 0.5, V.contact * 0.5);
  }
}

// ── Madeira ───────────────────────────────────────────────────────────

/**
 * Tábua, viga, telhado.
 *
 * O contrato diz "lê como mais frágil que pedra". Fragilidade em imagem é
 * DIREÇÃO: a alvenaria é uma grade travada, que distribui carga; a tábua é
 * uma linha corrida de ponta a ponta, que trabalha em flexão. Essa
 * diferença de direção é o que separa os dois quando a cor sai da imagem —
 * o matiz quente é só o bônus.
 *
 * A emenda de topo (o encontro de duas tábuas) aparece de propósito em
 * posição irregular: é ela que diz que aquilo foi PREGADO por alguém, e
 * não extrudado.
 */
function buildTimber(s: Surface, b: Block): void {
  const V = PALETTE.timber.value;
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
  const zF = D / 2, zB = -D / 2;

  backing(s, b, PALETTE.timber.base, V.mortar);

  const rows = Math.max(2, Math.round((y1 - y0) / PLANK));
  const ph = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const py = y0 + r * ph;
    const isTop = r === rows - 1;
    // Emendas de topo a cada 2.4-4.6u. Tábua de vila é curta; uma linha
    // sem emenda por 18u lê como perfil metálico.
    let cx = x0 - h(x0, py, 7) * 3;
    while (cx < x1 - 1e-4) {
      const k = h(cx, py, 8);
      const w = 2.4 + k * 2.2;
      const s0 = Math.max(x0, cx + 0.045);
      const s1 = Math.min(cx + w - 0.045, x1);
      cx += w;
      if (s1 - s0 < 0.2) continue;

      const g = h(s0, py, 9);
      const tint = pick(TIMBER_TINTS, g);
      const j = 0.88 + g * 0.24;
      const top = py + ph - 0.035;
      const bot = py + 0.035;
      const hiV = (isTop ? V.hi * 1.12 : V.hi) * j;
      const loV = V.lo * j;
      s.front(s0, bot, s1, top, zF, tint, loV, loV, hiV, hiV);

      // Sombra de contato sob a tábua — mesmo argumento da alvenaria, e
      // aqui ela vale ainda mais: tábua é FINA, e o que prova espessura numa
      // vista quase frontal é a sombra que a de cima joga na de baixo. Sem
      // isso o telhado lê como listras pintadas num plano só, que é
      // exatamente como ele estava lendo na captura dos telhados.
      // `contact * 0.80` e não `contact` puro: medido em captura, a versão
      // direta mexeu a média das tábuas em 1.8 níveis (53.4 → 51.6) e não
      // se lia. A madeira precisa de um pé mais escuro que a pedra porque a
      // tábua é FINA — a sombra é a única prova de espessura que sobra
      // quando a câmera olha quase de frente e o topo vira um fio.
      const cH = Math.min(0.12, (top - bot) * 0.28);
      if (cH > 0.02) {
        s.front(s0, bot, s1, bot + cH, zF + 0.008, tint,
          V.contact * 0.80 * j, V.contact * 0.80 * j, loV, loV);
      }

      // Veio: duas linhas longas, finas, valor perto do corpo. Se elas
      // ganharem contraste viram tabuado pintado; a leitura de madeira
      // vem da CONTINUIDADE da linha, não da força dela.
      for (let v = 0; v < 2; v++) {
        const t = 0.28 + h(s0, py + v, 10) * 0.5;
        const gy = bot + (top - bot) * t;
        const gh = 0.035 + h(s0, py + v, 11) * 0.03;
        const gm = v === 0 ? V.lo * 0.78 : V.hi * 1.1;
        s.front(s0 + 0.1, gy, s1 - 0.1, gy + gh, zF + 0.005, tint, gm * j, gm * j, gm * j, gm * j);
      }
    }
    // Ranhura entre tábuas: a linha escura que corre inteira.
    if (r > 0) {
      s.front(x0, py - 0.03, x1, py + 0.03, zF - 0.01, TIMBER_TINTS[0]!,
        V.mortar, V.mortar, V.mortar * 0.8, V.mortar * 0.8);
    }
  }

  // Topo: uma tábua vista de cima mostra as juntas correndo em X, não em
  // Z — o oposto do calçamento de pedra. Mesma leitura de direção.
  //
  // As três faixas retas que corriam daqui até o fundo do bloco saíram: num
  // telhado de 18u elas davam UMA linha reta de 18u contra o céu, que é o
  // pior recorte do palco inteiro. O cume agora é peça a peça, como o do
  // muro — só que com tábua no lugar de pedra (peça mais comprida, mais
  // rasa, e que falta muito mais).
  const lipZ = zF - 0.11;
  s.top(x0, x1, lipZ, zF, y1, TIMBER_TINTS[2]!, V.topFront, V.topFront, V.lip, V.lip);
  crest(s, x0, x1, y1, lipZ, zB, TIMBER_TINTS, V, TIMBER_CAP);

  ends(s, b, PALETTE.timber.warm, V, true);
  if (b.h < 1.6) eaves(s, x0, x1, y0, zF, V);
}

/**
 * O BEIRAL PARTIDO: o que pende por baixo de um telhado suspenso.
 *
 * A aresta de BAIXO de uma plataforma flutuante é tão reta quanto a de cima
 * e está tão contra o céu quanto ela — na captura de `#play@76` o telhado
 * sai como um retângulo perfeito, reto nos quatro lados. E esta é a aresta
 * mais livre do palco inteiro: ninguém pisa embaixo, a colisão só olha o
 * topo, então quebrar aqui não custa promessa nenhuma.
 *
 * Caibro partido e tábua solta pendurada: formas CURTAS, RARAS e que
 * apontam pra baixo. Raras porque uma franja contínua leria como decoração
 * (mesmo argumento das línguas de `rotMass`); pra baixo porque é a direção
 * que diz "isto cedeu" — a rima com o Rot é intencional, e é a mesma
 * gramática de silhueta lida por duas matérias diferentes.
 *
 * Fechado nos quatro lados de propósito. Um cartão sem espessura mostraria
 * céu pela lateral na borda do quadro, que é exatamente o defeito de
 * recorte que este arquivo está tentando tirar.
 */
function eaves(s: Surface, x0: number, x1: number, y0: number, zF: number, V: ValueScale): void {
  // Passo de 1.0 e não 1.15, limiar de 0.44 e não 0.58: na primeira captura
  // um telhado de 6u sorteava UMA peça, e uma peça num vão de 6u não quebra
  // aresta nenhuma — some como sujeira. Com estes números saem três ou
  // quatro por telhado, que é o bastante pra que a linha de baixo deixe de
  // ser lida como corte de tesoura sem virar franja.
  const step = 1.0;
  const zBack = zF - 0.62;
  for (let cx = x0; cx < x1 - 1e-4; cx += step) {
    const ex = Math.min(cx + step, x1);
    if (ex - cx < step * 0.55) continue;
    const g = h(cx, y0, 61);
    if (g < 0.44) continue;
    const k = h(cx, y0, 62);
    // A peça não ocupa a célula inteira: se ocupasse, duas vizinhas
    // encostariam e o beiral voltaria a ser uma linha corrida.
    const a0 = cx + 0.10 + k * 0.22;
    const a1 = ex - 0.10 - h(cx, y0, 63) * 0.26;
    if (a1 - a0 < 0.2) continue;
    const d = 0.13 + k * 0.40;
    const tint = pick(TIMBER_TINTS, h(cx, y0, 64));

    // Frente: a única face que a câmera lê de fato. Escurece pra baixo —
    // ponta pendurada não pega luz do céu.
    s.front(a0, y0 - d, a1, y0, zF, tint,
      V.contact * 0.6, V.contact * 0.55, V.lo * 0.95, V.lo * 0.9);
    // Barriga, e as duas laterais que fecham a peça.
    s.quad([a0, y0 - d, zF], [a1, y0 - d, zF], [a1, y0 - d, zBack], [a0, y0 - d, zBack], DOWN, tint,
      V.contact * 0.5, V.contact * 0.5, V.contact * 0.28, V.contact * 0.28);
    s.quad([a0, y0 - d, zBack], [a0, y0 - d, zF], [a0, y0, zF], [a0, y0, zBack], LEFT, tint,
      V.sideFar * 0.5, V.sideNear * 0.5, V.sideNear * 0.6, V.sideFar * 0.6);
    s.quad([a1, y0 - d, zF], [a1, y0 - d, zBack], [a1, y0, zBack], [a1, y0, zF], RIGHT, tint,
      V.sideNear * 0.45, V.sideFar * 0.45, V.sideFar * 0.55, V.sideNear * 0.55);
  }
}

// ── O Rot ─────────────────────────────────────────────────────────────

/**
 * O Rot — e este é o ponto do arquivo inteiro.
 *
 * A fase tem uma TORÇÃO (`3d/levels/world1.ts`, `ten`): depois de subir
 * pelos telhados, o chão VOLTA, largo e convidativo, e é veneno. A lição
 * ensinada na rua ("chão = seguro") tem que se inverter, e a inversão só
 * funciona se o jogador ler o perigo ANTES de pisar. Ler por matiz não
 * conta: metade dos jogadores lê valor melhor que cor, e num dia encoberto
 * verde-doente e cinza-pedra ficam a poucos passos de distância.
 *
 * Então o Rot se anuncia por quatro coisas, todas sobreviventes ao
 * preto e branco:
 *
 * 1. **Silhueta quebrada.** A pedra termina numa linha reta; o Rot termina
 *    numa crista irregular. É a primeira coisa que a vista lateral entrega,
 *    e é geometria, não cor.
 * 2. **A gramática do fio invertida.** Toda superfície pisável deste jogo
 *    tem um fio CLARO na beirada. O Rot não tem — a crosta engole a luz na
 *    beirada. Onde o olho procura o fio, ele acha escuro.
 * 3. **Variância absurda.** Cratera quase preta encostada em crosta quase
 *    branca, na mesma pedra. Alvenaria sadia varia 25%; aqui varia 700%.
 *    Em cinza isso continua gritando.
 * 4. **Direção de escorrimento.** A matéria sai das JUNTAS e escorre pra
 *    BAIXO, afinando. Nada estável tem forma que aponta pra baixo.
 *
 * O bafo (malha translúcida) e o matiz doente são a QUINTA e a SEXTA
 * coisa. Se qualquer uma das duas fosse necessária, o desenho estaria
 * errado — e é por isso que a captura em cinza é o teste, não a colorida.
 */
function buildRot(s: Surface, haze: Surface, b: Block, free: readonly [boolean, boolean]): void {
  const V = PALETTE.rot.value;
  const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
  const zF = D / 2, zB = -D / 2;

  /**
   * Quanto o Rot já consumiu num ponto. É a BORDA DE TRANSIÇÃO: nas
   * pontas do bloco sobrou pedra quase limpa, no meio não sobrou nada, e
   * a passagem entre os dois é suave. Sem essa borda, o Rot vira um
   * retângulo de outra cor coladinho — que é o que denuncia decoração.
   */
  const amount = (x: number, y: number): number => {
    const edge = smooth(Math.min(x - x0, x1 - x) / ROT_FADE);
    const vert = clamp01(1.12 - (y1 - y) / ROT_DEPTH);
    // Manchas avulsas atravessando a borda: contágio não tem contorno reto.
    const stain = (h(x, y, 21) - 0.62) * 0.5;
    // O campo da fase entra aqui pra desfazer a SIMETRIA. Uma poça que
    // desbota igual pros dois lados lê como mancha decorativa centrada no
    // bloco; com o campo, a borda por onde o jogador ENTRA ainda tem
    // alvenaria reconhecível e o fundo da poça não tem mais nada. Andar em
    // frente é andar pra dentro do pior, que é o que a torção precisa.
    const world = 0.62 + decayAt(x) * 0.42;
    return clamp01(((0.16 + 0.84 * edge) * vert + stain * edge) * world);
  };

  // Fundo do bloco: aqui ele é mais escuro que na pedra sadia, porque
  // atrás da junta comida não há argamassa, há o dentro do muro.
  s.front(x0, y0, x1, y1, zF - 0.04, PALETTE.rot.channel, 1.0, 1.0, 0.6, 0.6);

  masonry(s, x0, x1, y0, y1, zF, ROT_TINTS, V, amount, free);

  rotMass(s, x0, x1, y1, zF, amount);
  rotCrest(s, haze, x0, x1, y1, zF, zB, amount);
  rotTop(s, x0, x1, y1, zF - CRUST_REACH, zB, amount);
  ends(s, b, PALETTE.rot.dead, V, false);
}

/**
 * Uma pedra do substrato: o que sobrou dela, e o que cresceu por cima.
 *
 * A junta ENGORDA com a quantidade de Rot — a matéria entrou por ali e
 * comeu a pedra de fora pra dentro. É por isso que a alvenaria continua
 * reconhecível mesmo destruída: o padrão que sobra é o negativo do muro.
 */
function rotStone(
  s: Surface, s0: number, s1: number, my: number, ty: number, zF: number,
  tints: RGB[], V: ValueScale, a: number, g: number, k: number, occ: number,
): void {
  // Junta comida: 0.05 de argamassa vira até 0.20 de canal aberto.
  const eat = a * (0.06 + k * 0.09);
  const ex0 = s0 + eat, ex1 = s1 - eat;
  const ey0 = my + eat * 0.7, ey1 = ty - eat * 0.7;
  if (ex1 - ex0 < 0.1 || ey1 - ey0 < 0.05) return;

  // Cratera: a pedra sumiu. Não é sombra, é falta de matéria — por isso
  // usa a cor mais escura da paleta inteira.
  //
  // O sombreamento dela é o de um NICHO, não o de uma pedra: escuro no
  // alto, onde o teto do buraco se esconde do céu, clareando um pouco no
  // fundo, que ainda pega luz de cima. É esse degrau invertido que faz o
  // preto ter profundidade em vez de virar adesivo preto.
  if (a > 0.5 && g > 1 - a * 0.34) {
    s.front(ex0, ey0, ex1, ey1, zF - 0.02, PALETTE.rot.pit, 2.6, 2.3, 0.7, 0.8);
    // Soleira: o fiozinho de pedra que sobrou na borda de baixo e pega
    // luz. Uma linha clara em volta do preto é o que fecha a leitura.
    s.front(ex0, ey0, ex1, ey0 + 0.045, zF - 0.015, PALETTE.rot.crust, 0.5, 0.42, 0.85, 0.75);
    return;
  }

  const tint = pick(tints, g * (1 - a * 0.7));
  // `occ` entra no corpo com força total e na crosta pela metade. A parede
  // tem que ganhar o volume que a pedra sadia já tinha, mas a crosta é o
  // ALARME da fase — apagá-la no rodapé por conta de um degradê de
  // profundidade seria pagar a leitura de jogo pra comprar a de imagem.
  const j = (0.86 + k * 0.26) * stain((ex0 + ex1) / 2, my) * occ;
  // Pedra morta: o degrau interno some junto com o Rot. Superfície sem
  // rampa lê como coisa que já não tem volume — que é o que se quer.
  const hi = V.hi * (1 - a * 0.34) * j;
  const lo = V.lo * (1 - a * 0.16) * j;
  s.front(ex0, ey0, ex1, ey1, zF, tint, lo, lo * 0.94, hi, hi * 0.97);

  // Crosta NA JUNTA, e não em cima da pedra.
  //
  // A rodada anterior punha uma mancha no meio de cada pedra e a parede
  // ficou com cara de post-it colado — a forma era retangular, do tamanho
  // certo, e no lugar errado. O Rot entra por onde a água entra: pela
  // junta. Então aqui ele é uma LINHA de espessura irregular deitada sobre
  // a junta de cima, que é a leitura de "está comendo a partir dali".
  if (a > 0.22 && a < 0.86 && g < 0.34 + a * 0.4) {
    const t0 = 0.02 + k * 0.07;
    const t1 = 0.02 + g * 0.08;
    const c = 0.5 + occ * 0.5;
    s.frontPoly(
      [ex0 - JOINT, ey1 - t0], [ex1 + JOINT, ey1 - t1],
      [ex1 + JOINT, ey1 + JOINT * 0.8], [ex0 - JOINT, ey1 + JOINT * 0.8],
      zF + 0.01, PALETTE.rot.crust, 0.42 * c, 0.38 * c, 1.05 * c, 1.2 * c,
    );
  }
}

/**
 * A massa: o Rot descendo pela parede a partir da superfície.
 *
 * Este é o elemento que faz a torção funcionar. O jogador chega aqui vindo
 * dos telhados, olha pra baixo e precisa entender ANTES de pisar que
 * aquele chão largo e convidativo não é chão. Uma superfície plana de
 * outra cor não entrega isso; uma MASSA com borda inferior rasgada,
 * pendendo em línguas de comprimento desigual, entrega — porque forma que
 * aponta pra baixo é forma que escorre, e nada que escorre sustenta peso.
 *
 * A massa é montada em COLUNAS de 0.42u, cada uma com valor próprio. Isso
 * dá estriamento vertical, que é como matéria viscosa de fato desce por
 * uma parede: em feixes, não em lençol. E as línguas longas vêm de uma
 * potência alta do hash (^7), então elas são RARAS — três ou quatro num
 * trecho de 38u. Se fossem comuns leriam como franja decorativa.
 */
function rotMass(
  s: Surface, x0: number, x1: number, y1: number, zF: number,
  amount: (x: number, y: number) => number,
): void {
  const step = 0.42;
  const reach = (x: number): number => {
    const a = amount(x, y1);
    const body = -0.2 + Math.pow(h(x, y1, 51), 1.15) * 2.0;
    const tongue = Math.pow(h(x * 0.63, y1, 52), 7) * 3.6;
    return Math.max(0, body + tongue) * a;
  };

  for (let px = x0; px < x1 - 1e-4; px += step) {
    const nx = Math.min(px + step, x1);
    const d0 = reach(px);
    const d1 = reach(nx);
    if (d0 < 0.1 && d1 < 0.1) continue;

    const g = h(px, y1, 53);
    const k = h(px, y1, 54);

    // Sombra própria, um pouco maior que a massa: contorno escuro em
    // volta é o que separa a matéria da parede. Sem ele a massa clara
    // encosta na pedra clara e as duas viram uma coisa só.
    s.frontPoly(
      [px - 0.04, y1 - d0 - 0.12], [nx + 0.04, y1 - d1 - 0.12],
      [nx + 0.04, y1], [px - 0.04, y1],
      zF + 0.016, PALETTE.rot.channel, 2.2, 2.2, 1.1, 1.1,
    );

    // Corpo, com valor por coluna: o estriamento é o que faz ler como
    // feixe de escorrido em vez de chapa recortada.
    const m = 0.42 + k * 0.85;
    s.frontPoly(
      [px, y1 - d0], [nx, y1 - d1], [nx, y1 + 0.04], [px, y1 + 0.04],
      zF + 0.022, PALETTE.rot.crust, m * 0.4, m * 0.36, m * 1.05, m * 1.15,
    );

    // Buraco na massa: a pedra morta aparecendo por dentro dela. Sem
    // esses vazios a massa vira mancha sólida e perde a leitura de casca.
    if (g > 0.72 && d0 > 0.7) {
      const hy = y1 - d0 * (0.3 + k * 0.4);
      const hh = d0 * (0.14 + g * 0.2);
      s.frontPoly(
        [px + 0.06, hy], [nx - 0.05, hy - hh * 0.3], [nx - 0.08, hy + hh], [px + 0.05, hy + hh * 0.8],
        zF + 0.028, PALETTE.rot.pit, 2.4, 2.2, 1.0, 1.1,
      );
    }
  }
}

/**
 * A crista: a silhueta quebrada, e o motivo principal de o Rot não ser
 * "pedra verde".
 *
 * Ela sobe ACIMA da superfície de colisão, o que só é honesto porque
 * ninguém pisa aqui — é zona de dano (`hazards` em world1.ts, y -0.4 a
 * 0.8), então geometria acima do plano não mente sobre onde o pé para.
 * Numa plataforma sadia isso seria proibido.
 */
function rotCrest(
  s: Surface, haze: Surface, x0: number, x1: number, y1: number,
  zF: number, _zB: number, amount: (x: number, y: number) => number,
): void {
  const zCap = zF - CRUST_REACH;
  const prof = (x: number): number => {
    const a = amount(x, y1);
    // Duas oitavas: uma dá os montes grandes, a outra a casca miúda. Uma
    // só sai com ritmo de serra, e serra lê como padrão, não como matéria.
    const big = Math.pow(h(x, y1, 31), 1.5);
    const fine = h(x * 3.1, y1, 32);
    return (0.04 + big * 0.30 + fine * 0.07) * a;
  };

  let px = x0;
  let ph = prof(px);
  while (px < x1 - 1e-4) {
    const nx = Math.min(px + CRUST_STEP, x1);
    const nh = prof(nx);
    const a = amount((px + nx) / 2, y1);
    const g = h(px, y1, 33);
    const bright = 0.55 + g * 0.85;

    // Frente da crista: fica ESCURA na beirada. Toda plataforma pisável
    // deste jogo tem fio claro ali; o Rot é a única que engole a luz. O
    // olho procura o fio e não acha — é uma ausência que informa.
    s.front(px, y1 - 0.03, nx, y1 + Math.max(ph, nh), zF + 0.02, PALETTE.rot.crust,
      0.30, 0.30, 0.20 + bright * 0.22, 0.20 + bright * 0.22);

    // Capa inclinada, ligando a crista ao topo do bloco.
    s.quad([px, y1, zCap], [nx, y1, zCap], [nx, y1 + nh, zF + 0.02], [px, y1 + ph, zF + 0.02],
      CREST, PALETTE.rot.crust, 0.5, 0.5, bright, bright * 0.9);

    px = nx;
    ph = nh;
    if (g > 0.86 && a > 0.55) {
      // Bafo: uma bolha por monte alto, não por passo. Concentrado nos
      // picos, ele parece exalar DA matéria; espalhado, vira filtro.
      //
      // Alfa baixíssimo e bolha pequena porque a primeira rodada saiu com
      // uma faixa branca contínua atravessando a cena na linha da crista —
      // e ela apagava exatamente a silhueta quebrada que é o argumento
      // principal do Rot. O bafo é tempero; se ele competir com a forma,
      // está errado por definição.
      haze.blob(px, y1 + nh + 0.34 + g * 0.5, zF + 0.4,
        0.28 + g * 0.3, 0.22 + g * 0.3, PALETTE.rot.breath, 0.9, 0.09 + g * 0.07);
    }
  }
}

/**
 * Face de cima do Rot.
 *
 * Vista de cima dos telhados (que é justamente de onde o jogador olha
 * antes de decidir descer), esta é a maior área contínua da torção. Ela
 * não pode ser uma fita de cor: é mancha grande, com crateras pretas e
 * placas pálidas na mesma superfície, sem ritmo. A ausência de calçamento
 * regular é o contraste direto com o topo de pedra da rua.
 */
function rotTop(
  s: Surface, x0: number, x1: number, y1: number, zFront: number, zB: number,
  amount: (x: number, y: number) => number,
): void {
  const cell = 0.72;
  for (let cx = x0; cx < x1 - 1e-4; cx += cell) {
    const ex = Math.min(cx + cell, x1);
    const a = amount((cx + ex) / 2, y1);
    for (let cz = zB; cz < zFront - 1e-4; cz += cell) {
      const ez = Math.min(cz + cell, zFront);
      const g = hash2(Math.round(cx * 8), Math.round(cz * 8) + 41) ;
      const k = hash2(Math.round(cx * 8) + 7, Math.round(cz * 8));
      // Perto da câmera a placa é mais visível, então é ali que vale
      // gastar o extremo de valor.
      const near = (ez - zB) / (zFront - zB);

      let col: RGB;
      let m0: number;
      let m1: number;
      if (g > 0.76 && a > 0.4) {
        col = PALETTE.rot.crust;
        m0 = (0.5 + k * 0.4) * (0.6 + near * 0.6);
        m1 = m0 * 1.25;
      } else if (g < 0.17 && a > 0.35) {
        col = PALETTE.rot.pit;
        m0 = 1.6;
        m1 = 0.9;
      } else {
        col = ROT_TINTS[Math.min(3, Math.floor(k * 4))]!;
        const dead = 1 - a * 0.4;
        m0 = (0.34 + k * 0.3) * dead;
        m1 = m0 * (1.2 + near * 0.5);
      }
      s.top(cx, ex, cz, ez, y1, col, m0, m0 * 0.92, m1, m1 * 0.94);
    }
  }
}
