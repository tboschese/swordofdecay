/**
 * MUNDO 1 — Terras Esquecidas, fase 1.
 *
 * Lore (`Lore/lore.md`): início da decadência. Vila abandonada, sinais
 * ainda sutis. O tom é estranhamento — algo está errado e ninguém entende
 * o quê — não apocalipse.
 *
 * ESTRUTURA kishōtenketsu. Não é enfeite de vocabulário: é o que faz uma
 * fase ensinar em vez de só existir.
 *
 *   ki   (x 0-62)    a rua da vila. Andar, e o primeiro vão pequeno.
 *                    Ensina sem punir.
 *   shō  (x 62-118)  telhados quebrados subindo. Desenvolve a lição em
 *                    ALTURA — que é a razão de a fase ser 3D e não 2D.
 *   ten  (x 118-156) A TORÇÃO. O chão volta, e o chão é o Rot. A lição
 *                    "chão = seguro", ensinada na rua, se inverte: aqui
 *                    o chão mata e a salvação é ficar em cima.
 *   ketsu(x 156-206) descida combinando vão + altura, e o portão caído.
 *
 * A torção é o ponto todo. Uma fase que só fica mais difícil não é
 * projeto, é escada; o que se lembra é o momento em que a regra vira.
 *
 * Convenção: `y` é a BASE do bloco e `h` a altura, então o topo (onde se
 * pisa) é `y + h`. Vãos ficam em no máximo 4.5u e degraus em 2.4u — o
 * pulo alcança 6.7u e sobe 3.47u, então tudo tem margem folgada de
 * propósito. Fase 1 ensina; ela não é o teste.
 */
import type { LevelData } from "../src/contracts";

/** Bloco de chão: `top` é onde se pisa; a massa desce pra baixo. */
function ground(x: number, w: number, top: number, kind: LevelData["blocks"][number]["kind"]) {
  // 9 de profundidade, nao 4. A camera enxerga ~13.7u de altura e fica 2.6
  // acima do jogador, entao o quadro chega a ~y=-4.2: com 4 de massa o
  // rodape virava um vazio preto ocupando metade da tela. Massa abaixo do
  // que se ve nao custa colisao nenhuma (ela olha so o topo) e resolve a
  // composicao.
  const depth = 9;
  return { x, y: top - depth, w, h: depth, kind };
}

/** Plataforma fina: telhado, viga, tábua. */
function ledge(x: number, w: number, top: number, kind: LevelData["blocks"][number]["kind"] = "timber") {
  return { x, y: top - 0.9, w, h: 0.9, kind };
}

export const WORLD1_1: LevelData = {
  id: "w1-1",
  title: "Terras Esquecidas",
  spawn: { x: 4, y: 0.2 },
  goal: { x: 200, y: 0 },

  blocks: [
    // ── ki — a rua ────────────────────────────────────────────────────
    ground(-6, 40, 0, "stone"),
    ground(34, 10, 1.2, "stone"),
    // primeiro vão: 4u, com o telhado do outro lado na mesma altura.
    ground(48, 14, 1.2, "stone"),

    // ── shō — os telhados, subindo ────────────────────────────────────
    ground(62, 8, 1.2, "stone"),
    ledge(74, 6, 3.0),
    ledge(84, 6, 5.4),
    ledge(94, 6, 7.6),
    // corrida de telhado: dá fôlego depois da subida, e é onde o jogador
    // percebe que está ALTO — a informação que a torção vai usar.
    ledge(100, 18, 7.6),

    // ── ten — o chão é o Rot ──────────────────────────────────────────
    // Volta a existir chão contínuo, largo e convidativo. E é veneno.
    ground(118, 38, 0, "rot"),
    ledge(120, 8, 7.0),
    ledge(132, 8, 7.6),
    ledge(144, 8, 7.0),

    // ── ketsu — a descida ─────────────────────────────────────────────
    ledge(156, 6, 5.4),
    ledge(167, 6, 3.2),
    ledge(178, 8, 1.2),
    ground(188, 22, 0, "stone"),
  ],

  // A poça do Rot cobre a superfície do chão corroído, não o bloco todo:
  // encostar de raspão na lateral ao pular não deve matar — só pisar.
  hazards: [{ x: 118, y: -0.4, w: 38, h: 1.2 }],

  /**
   * Onde os inimigos entram, e por quê — a distribuição segue o arco:
   *  ki   um só, na rua larga, com espaço de sobra pra errar e aprender;
   *  shō  um no telhado longo, onde o vão pune mais que o golpe;
   *  ten  DOIS nos telhados sobre o Rot, que é onde a torção morde: recuar
   *       do inimigo é cair no veneno, então a decisão fica cara.
   *  ketsu nenhum. O fecho é sobre executar, não sobre novidade.
   */
  enemies: [
    { x: 24, y: 0, range: 5 },
    { x: 108, y: 7.6, range: 6 },
    { x: 124, y: 7.0, range: 3 },
    { x: 148, y: 7.0, range: 3 },
  ],
};
