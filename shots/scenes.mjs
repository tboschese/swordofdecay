/**
 * Cenários nomeados para captura determinística.
 *
 * Cada cenário é uma timeline de input roteirizado. `hold` é a lista de
 * teclas pressionadas naquele intervalo de frames — o driver sintetiza
 * keydown/keyup reais na window, então a classe `Keyboard` do jogo não
 * precisa saber que está sendo dirigida por script.
 *
 * `shots` são os frames em que o PNG é gravado. Escolhidos por situação,
 * não por número redondo: o que importa é pegar o jogo no momento em que
 * a rubrica do AAA_BRIEF.md tem algo a julgar.
 *
 * Frames são a 60fps (dt fixo de 1000/60 ms).
 */

const Z = "KeyZ";        // pulo
const X = "KeyX";        // espada
const C = "KeyC";        // arco
const R = "ArrowRight";
const L = "ArrowLeft";

const BASE_SCENES = [
  {
    name: "idle",
    why: "Pose parada. Julga leitura do guerreiro e do cenário sem movimento borrando nada.",
    frames: 90,
    timeline: [],
    shots: [60, 89],
  },
  {
    name: "run",
    why: "Corrida em velocidade máxima. Rubrica §1 (legibilidade em movimento) e §2 (separação de profundidade com parallax ativo).",
    frames: 120,
    timeline: [{ from: 10, to: 120, hold: [R] }],
    shots: [45, 80, 119],
  },
  {
    name: "air",
    why: "No ar E a ATERRISSAGEM. O arquétipo é floaty (hangtime generoso). Os frames de pouso existem porque o squash de aterrissagem nao aparecia em captura nenhuma — o m3 implementou e ninguem podia julgar.",
    frames: 140,
    timeline: [
      { from: 10, to: 140, hold: [R] },
      { from: 30, to: 48, hold: [R, Z] },
    ],
    shots: [56, 64, 78, 87, 89, 91, 100],
  },
  {
    name: "sword",
    why: "Golpe de espada conectando. Rubrica §5 (impacto tem peso): hitstop, deslocamento, partícula.",
    // Sem summon este cenário golpeava o AR: o jogador chega a x=187 em
    // 150 frames e o primeiro inimigo está em x=903. Duas rodadas de
    // trabalho de impacto foram feitas sem nada pra julgar.
    summon: { index: 0, dx: 34 },
    frames: 150,
    timeline: [
      { from: 48, to: 55, hold: [X] },
      // AVANCAR depois do golpe. O walker anda ate o jogador e morre
      // sobreposto, entao o guerreiro cobria o cadaver e a pose de morte
      // era injulgavel. Recuar nao serve: o jogador ja esta na parede do
      // spawn. Avancando, o corpo fica pra tras e exposto.
      { from: 62, to: 110, hold: [R] },
    ],
    shots: [52, 57, 66, 95, 120],
  },
  {
    name: "sword_charged",
    why: "Espada carregada (5 de dano). O feedback tem que escalar visivelmente contra o golpe normal, senão a carga não se comunica.",
    summon: { index: 0, dx: 40 },
    frames: 190,
    timeline: [{ from: 20, to: 110, hold: [X] }],
    shots: [100, 112, 118, 130],
  },
  {
    name: "arrow",
    why: "Flecha em voo e cravando. Projétil precisa ler contra o fundo em qualquer ponto do trajeto.",
    frames: 170,
    timeline: [
      { from: 10, to: 40, hold: [R] },
      { from: 60, to: 66, hold: [C] },
    ],
    shots: [70, 85, 100, 130],
  },
  {
    name: "hurt",
    why: "Guerreiro tomando dano — invulnerabilidade pisca por 900ms. Julga se o estado de dano lê sem virar strobe.",
    frames: 240,
    timeline: [{ from: 10, to: 240, hold: [R] }],
    shots: [150, 165, 200],
  },
  {
    name: "vista",
    why: "Frame sem ação, longe do spawn. É a captura pra julgar cenário puro: tileset, parallax, atmosfera, grade.",
    frames: 300,
    timeline: [
      { from: 10, to: 200, hold: [R] },
      { from: 60, to: 78, hold: [R, Z] },
      { from: 130, to: 148, hold: [R, Z] },
    ],
    shots: [220, 260, 299],
  },
];

/**
 * Cenários de combate REAL, construídos a partir da sonda de estado
 * (`*_state.json`), não de frames chutados.
 *
 * Os cenários `sword`/`sword_charged` acima golpeiam o AR: a sonda mostra
 * que o jogador chega a x=187 em 150 frames, e o primeiro inimigo está em
 * x=903. O módulo de impacto não tinha como ser julgado, e isso passou
 * despercebido por duas rodadas — um agente descobriu ao tentar avaliar o
 * próprio trabalho. Use estes para julgar feedback de impacto.
 */
export const COMBAT_SCENES = [
  {
    name: "title",
    why: "Tela de titulo. O harness pula o titulo por padrao (senao toda captura vira cartaz), entao este cenario existe pra que ele possa ser julgado.",
    screen: "title",
    frames: 90,
    timeline: [],
    shots: [8, 45, 89],
  },
  {
    name: "roster",
    why: "Os dois inimigos lado a lado. Existe pra testar a rubrica §6: walker e shooter têm que ser distinguíveis como manchas pretas a 16px.",
    summon: [
      { index: 0, dx: 30 },
      { index: 1, dx: 58 },
    ],
    frames: 150,
    timeline: [],
    shots: [2, 90, 120],
  },
  {
    name: "hit_walker",
    why: "Golpe de espada conectando no walker. O único cenário em que impacto pode ser julgado.",
    summon: { index: 0, dx: 34 },
    frames: 230,
    timeline: [
      // Parado: o walker anda ate o jogador sozinho. Correr faz os dois
      // se cruzarem e o golpe sai no vazio — foi o que aconteceu antes.
      { from: 48, to: 55, hold: [X] },
      { from: 78, to: 85, hold: [X] },
      { from: 110, to: 117, hold: [X] },
      { from: 145, to: 215, hold: [X] },
    ],
    shots: [52, 57, 64, 82, 114, 218],
  },
  // ── Mobília do nível ────────────────────────────────────────────────
  // Água, espinho, chave, porta e objetivo nunca apareceram em captura
  // nenhuma, porque o harness não sabia levar a câmera até eles. Por isso
  // nenhum dos 8 módulos de arte olhou pra essas superfícies — elas são
  // literalmente o que ninguém julgou ainda.
  //
  // As posições vêm da leitura do grid (`levels/level1.ts`, linha 13 é o
  // piso), sempre sobre `#` sólido e nunca sobre buraco: coluna * 16.
  {
    name: "water",
    why: "Travessia de agua (colunas 36-41 do grid). O color cycling de 4 fases so pode ser julgado aqui.",
    startAt: { x: 544, y: 190 },
    frames: 120,
    timeline: [{ from: 10, to: 120, hold: [R] }],
    shots: [20, 60, 100],
  },
  {
    name: "spikes",
    why: "Campo de espinhos (colunas 63-68). Espinho e o unico perigo estatico do jogo e nunca foi capturado.",
    startAt: { x: 960, y: 190 },
    frames: 90,
    timeline: [],
    shots: [10, 50, 88],
  },
  {
    // Não é cenário de arte — é o smoke test de JOGABILIDADE que não
    // existia. Corre pra direita batendo pulo o tempo todo; a sonda de
    // estado diz até onde chegou. Serve pra responder "a fase continua
    // atravessável?" depois de mexer na física, que é pergunta que nenhum
    // cenário sabia responder.
    //
    // Pulo martelado de propósito: com `jumpBufferMs` de 150 e coyote de
    // 120, marretar Z é o que um jogador faz e é o que exercita as duas
    // janelas de perdão. Cenário com pulo em quadro fixo mede a física de
    // ontem — foi exatamente assim que o `vista` passou a cair no buraco
    // depois do retune.
    name: "traverse",
    why: "Smoke test de travessia: corre e pula do inicio ao fim, pra dizer se a fase continua jogavel depois de mexer na fisica.",
    frames: 1500,
    timeline: (() => {
      const spans = [{ from: 5, to: 1500, hold: ["ArrowRight"] }];
      for (let f = 20; f < 1500; f += 22) spans.push({ from: f, to: f + 6, hold: ["ArrowRight", "KeyZ"] });
      return spans;
    })(),
    shots: [400, 900, 1400],
  },
  {
    name: "goal",
    why: "Chave, porta e objetivo (colunas 92-99), o fim da fase. Nenhum dos tres foi julgado por modulo nenhum.",
    startAt: { x: 1480, y: 190 },
    frames: 90,
    timeline: [],
    shots: [10, 50, 88],
  },
];

/** Sequência contínua — rubrica §1 exige julgar em movimento, não só em frame parado. */
export const SEQUENCES = [
  {
    name: "seq_run",
    scene: "run",
    from: 40,
    to: 112,
    every: 4,
  },
  {
    name: "seq_sword",
    scene: "sword",
    from: 96,
    to: 140,
    every: 2,
  },
];

export const SCENES = [...BASE_SCENES, ...COMBAT_SCENES];

export function sceneByName(name) {
  const s = SCENES.find((x) => x.name === name);
  if (!s) throw new Error(`cenário desconhecido: ${name} (existem: ${SCENES.map((x) => x.name).join(", ")})`);
  return s;
}

/** Teclas seguradas no frame `f`, resolvendo a timeline. */
export function keysAtFrame(scene, f) {
  const held = new Set();
  for (const span of scene.timeline) {
    if (f >= span.from && f < span.to) for (const k of span.hold) held.add(k);
  }
  return [...held];
}
