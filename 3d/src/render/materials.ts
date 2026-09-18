/**
 * Paleta e materiais do palco.
 *
 * Existe separado do `Stage.ts` por uma razão de custo, não de arrumação:
 * a Fase 0 (`3d/PHASE0.md`) mediu **19.7ms de compilação de shader** num
 * único quadro. Cada configuração DISTINTA de material é um programa novo
 * pra compilar, então o número de materiais é orçamento — e orçamento se
 * controla num lugar só, onde dá pra contar. Duas instâncias de
 * `MeshStandardMaterial` com os MESMOS parâmetros compartilham programa no
 * three.js; duas com `roughness` diferente, não. Por isso as três
 * superfícies do jogo saem do mesmo molde: quem separa pedra de madeira de
 * Rot é a COR DE VÉRTICE, que é de graça, não o material.
 *
 * ── Por que a paleta é escrita como VALOR e não como cor ──────────────
 *
 * O critério que este módulo tem que passar é "convertido pra cinza,
 * continua legível". Matiz não sobrevive a essa conversão; valor sim. Então
 * cada superfície é uma cor-base (que só carrega temperatura) multiplicada
 * por uma escala de valores nomeados. Ajustar a leitura é mexer nos
 * multiplicadores; ajustar o clima é mexer na base. Os dois não se
 * atrapalham.
 *
 * ── Os alvos são de PIXEL RENDERIZADO, não de cor-base ────────────────
 *
 * Escolher cor-base olhando o hexadecimal é errar: entre a base e o pixel
 * há luz hemisférica, direcional 2.4, tone mapping ACES e exposição 1.05.
 * A primeira rodada deste arquivo saiu com a parede de pedra em 114 de
 * média contra 178 do céu — pouco separada do fundo — e com a MADEIRA
 * empatada com a pedra em 110. Os alvos abaixo são medidos na captura,
 * e as bases foram escurecidas até baterem:
 *
 *     céu ....... 178   (vem de `atmosphere.ts`, não é ajustável aqui)
 *     pedra ..... 120   ordem; desvio BAIXO, ~20
 *     madeira .... 85   linha corrida; desvio baixo
 *     Rot ........ 60   e o desvio é o dobro de tudo — é ele o alarme
 *
 * A separação entre pedra e madeira mora nessa distância de valor somada à
 * DIREÇÃO da textura (grade travada contra linha corrida). A do Rot não
 * mora na média — mora na VARIÂNCIA: crosta em 150 encostada em cratera em
 * 20 na mesma parede. Nada saudável tem esse salto, e ele sobrevive
 * inteiro em preto e branco.
 */
import * as THREE from "three";

export type RGB = readonly [number, number, number];

function rgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * Escala de valor de uma superfície. Os nomes são papéis de leitura, não
 * posições numa rampa: `lip` é "onde dá pra pisar", `socket` é "aqui
 * faltou pedra". Quem ajusta game feel visual mexe aqui sabendo o que
 * está prometendo ao jogador.
 */
export interface ValueScale {
  /** Fio de luz na aresta que a câmera lê como "beirada". O ponto mais claro. */
  lip: number;
  /** Face de cima, junto da beirada. */
  topFront: number;
  /** Face de cima, no fundo — escurece pra virar CONTORNO contra o céu. */
  topBack: number;
  /** Topo de uma pedra/tábua individual. */
  hi: number;
  /** Base da mesma pedra/tábua: o degrau interno que dá volume. */
  lo: number;
  /** Sombra de contato logo abaixo de cada pedra. */
  contact: number;
  /** Fundo entre as pedras. NUNCA é buraco — é sombra de argamassa. */
  mortar: number;
  /** Nicho de pedra faltando: mais fundo que a argamassa. */
  socket: number;
  /** Faixa escura sob a cimalha: o maior salto de valor da parede. */
  cornice: number;
  /** Embasamento: onde a parede encontra o chão e junta sujeira. */
  plinth: number;
  /** Face lateral perto da câmera / longe dela. Dizem onde a plataforma ACABA. */
  sideNear: number;
  sideFar: number;
}

export const PALETTE = {
  /**
   * Pedra da vila: o chão confiável. Cinza-verde frio, quase sem croma —
   * é a régua contra a qual madeira (quente) e Rot (doente) se medem.
   */
  stone: {
    base: rgb(0x767c6f),
    /**
     * Segunda base, sorteada por pedra. Ela desloca MATIZ e quase não
     * desloca valor, de propósito: quem faz a parede variar é o
     * multiplicador de cada pedra e a mancha de umidade, não a base. Se a
     * segunda base fosse mais clara, a variação de cor viraria variação de
     * valor e a fiada ganharia um xadrez que o olho pega na hora.
     */
    warm: rgb(0x7d7663),
    value: {
      // `mortar` em 0.52 e não em 0.33: com a junta quase preta cada pedra
      // ganhava contorno fechado e a parede leu como TECLADO na captura.
      // Argamassa é sombra rasa; o único preto forte da parede é a faixa
      // sob a cimalha, e ele vale mais por ser o único.
      lip: 1.50, topFront: 1.05, topBack: 0.30,
      hi: 1.05, lo: 0.74, contact: 0.58,
      mortar: 0.52, socket: 0.24,
      cornice: 0.44, plinth: 0.62,
      sideNear: 0.95, sideFar: 0.44,
    } satisfies ValueScale,
  },

  /**
   * Madeira: telhado, viga, tábua. Precisa ler como MAIS FRÁGIL que pedra,
   * e fragilidade em imagem é vão: tábua é fina, longa e trabalha em flexão.
   * Por isso a textura corre na horizontal de ponta a ponta, ao contrário
   * da grade travada da alvenaria — é a direção, não o matiz, que separa
   * os dois quando a cor sai.
   */
  timber: {
    base: rgb(0x60492f),
    warm: rgb(0x53412c),
    value: {
      lip: 1.45, topFront: 1.00, topBack: 0.28,
      hi: 1.10, lo: 0.70, contact: 0.50,
      mortar: 0.42, socket: 0.25,
      cornice: 0.42, plinth: 0.60,
      // Topo de tábua é a ÚNICA lateral clara do jogo: é madeira cortada
      // atravessando a fibra, e fibra cortada espalha luz. Serve de rima
      // com a leitura de fragilidade — dá pra ver que aquilo foi serrado.
      sideNear: 1.15, sideFar: 0.55,
    } satisfies ValueScale,
  },

  /**
   * O Rot. Três materiais em um, porque o que se vê é um processo, não uma
   * superfície: a pedra MORTA que sobrou, o CANAL preto por onde a matéria
   * entrou (as juntas), e a CROSTA pálida que saiu delas e escorreu.
   *
   * O contraste entre `crust` e `pit` é o alarme. Ele é deliberadamente
   * maior que qualquer salto que exista na pedra ou na madeira.
   */
  rot: {
    /** Pedra que o Rot já matou: mesma forma da alvenaria, sem vida nenhuma. */
    dead: rgb(0x474b39),
    /** Canal da junta comida. Quase preto — é ausência de matéria. */
    channel: rgb(0x12160e),
    /** Cratera: onde a pedra sumiu de vez. Mais fundo que o canal. */
    pit: rgb(0x090b07),
    /** Crosta: a matéria nova. Clara o bastante pra ser o pico do quadro. */
    crust: rgb(0xa6b85c),
    /** Bafo: a única coisa da cena que se mexe. Vai no material sem luz. */
    breath: rgb(0xbccb84),
    value: {
      lip: 0.60, topFront: 0.70, topBack: 0.30,
      hi: 0.95, lo: 0.55, contact: 0.35,
      mortar: 0.90, socket: 1.0,
      cornice: 0.50, plinth: 0.50,
      sideNear: 0.80, sideFar: 0.40,
    } satisfies ValueScale,
  },
} as const;

/**
 * O material sólido do palco INTEIRO — pedra, madeira e Rot.
 *
 * Um só, de propósito. Roughness diferente por tipo custaria dois shaders
 * a mais pra devolver quase nada: sob céu encoberto e sem env map, a
 * diferença entre 0.7 e 0.95 desaparece na primeira captura, enquanto o
 * pico de compilação é medido em quadros perdidos. O que separa os
 * materiais aos olhos do jogador está na geometria e na cor de vértice.
 */
export function solidMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
    // `flatShading` fica FALSE: as normais aqui são por face e já são
    // constantes por quad, então ligar isso só custaria um define a mais.
    dithering: true,
  });
}

/**
 * O bafo do Rot: sem luz, com alfa por vértice.
 *
 * Sem luz porque miasma não tem face virada pro sol — se ele obedecesse à
 * direcional, sumiria exatamente na sombra, que é onde ele mais precisa
 * aparecer. `depthWrite` desligado porque são cascas moles empilhadas: se
 * escrevessem profundidade, uma recortaria a outra e o resultado leria
 * como papel picado.
 *
 * Este material é SECUNDÁRIO por contrato. Se ele for removido, o Rot tem
 * que continuar dizendo "não pise" — a prova está na captura em cinza.
 */
export function breathMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}
