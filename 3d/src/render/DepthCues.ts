/**
 * LEITURA DE PROFUNDIDADE.
 *
 * O defeito nº1 de plataforma 3D não é gráfico, é informacional: **o
 * jogador não consegue julgar onde vai pousar.** Ele erra o pulo, não
 * entende por quê, e conclui que o controle é ruim. A sombra de contato do
 * `main.ts` é a base certa — fica no CHÃO, nunca colada nos pés — mas ela
 * responde "onde eu estou", e a pergunta do pulo é "onde eu vou PARAR".
 *
 * Três ajudas aqui, cada uma respondendo UMA pergunta:
 *
 *  1. **Preditor de pouso** — "onde eu caio?". Roda a física REAL à frente
 *     (mesma ordem de integração do `Player`, mesmo passo fixo, mesma
 *     colisão do `Level`) e marca o desfecho. Não é estimativa balística:
 *     é o próprio jogo simulado, então acerta parede, teto e beirada.
 *  2. **Prumo tracejado** — "quão alto eu estou?". A câmera lateral 2.5D
 *     está inclinada ~9°, o que comprime tudo que é HORIZONTAL a ~1/6 na
 *     tela. Por isso a sombra sozinha não dá altura: 3u e 6u projetam
 *     quase igual. Uma linha VERTICAL não sofre essa compressão, e
 *     tracejada de 1 em 1u ela vira régua — dá pra CONTAR a altura.
 *  3. **Beirada anunciada** — "onde essa plataforma acaba?". Em 2D isso
 *     foi resolvido com um lábio claro na arte; aqui o lábio já existe na
 *     face frontal (`Stage.ts`), mas ele diz "isto é chão", não "o chão
 *     termina AQUI". O canto ganha um colchete e um prumo pendurado no
 *     vazio ao lado — que é, de quebra, a "ancoragem vertical" ligando
 *     plataforma alta ao que existe embaixo.
 *
 * ── CONTRA POLUIÇÃO VISUAL ────────────────────────────────────────────
 * Ajuda que aparece sempre vira textura e o jogador para de ver. Todas as
 * três são proporcionais à DÚVIDA, e todas somem sozinhas:
 *   · nada aparece no chão parado — no chão não há o que julgar;
 *   · o preditor entra depois de ~90ms de voo (pulinho de degrau não
 *     acende nada) e some no quadro do pouso;
 *   · o preditor não aparece se não houver o que decidir: pulo vertical
 *     que volta ao mesmo lugar tem deslocamento zero e força zero;
 *   · perigo (Rot ou vão sem fundo) fura essas regras e aparece cedo, em
 *     laranja quente — a única cor do jogo que não é verde dessaturado;
 *   · beirada e prumo caem com a distância; longe da ação, alfa zero.
 *
 * ── POR QUE PLANOS DE Z DIFERENTES ────────────────────────────────────
 * A câmera está a 17u em perspectiva, e os blocos ocupam z −2..+2. Um
 * mesmo x projeta em telas diferentes conforme o z (17/15 ≈ 1.13x na face
 * frontal). Então:
 *   · o preditor e o prumo vivem em **z = 0**, o plano do guerreiro — é o
 *     único z em que "está alinhado na tela" significa "está alinhado no
 *     jogo". Marcador na face frontal mentiria até 1u no canto da tela.
 *   · a beirada vive em **z = +2**, colada na face frontal — porque a
 *     silhueta que o olho lê como "borda da plataforma" é a quina
 *     frontal, e é nela que a marca tem que encostar.
 *
 * Todo traço é desenhado duas vezes: um halo escuro largo e o núcleo claro
 * por cima. Sem isso a marca some contra o céu (`HORIZON` 0xb9c2ad é
 * claro) ou contra a pedra clara do topo — o par claro/escuro sobrevive a
 * qualquer fundo, que é o mesmo motivo de legenda de vídeo ter contorno.
 */
import * as THREE from "three";
import type { Aabb, Level } from "../game/Level";
import { MOVE, WORLD } from "../game/tuning";

// ── Estado que o módulo consome ──────────────────────────────────────────

/**
 * Subconjunto do `Player`. É estrutural de propósito: `cues.update(game.player, …)`
 * compila sem o núcleo precisar saber que este módulo existe.
 *
 * `box` vem de fora em vez de eu redeclarar meia-largura e altura aqui —
 * duplicar as constantes do `Player` criaria dois números que precisam ser
 * mudados juntos, e um deles ia ficar pra trás.
 */
export interface CueTarget {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  readonly box: Aabb;
}

export type LandingVerdict =
  /** Pousa em superfície firme. */
  | "ground"
  /** Toca perigo antes de pousar (ou pousa dentro dele). */
  | "hazard"
  /** Não há chão: a trajetória chega na altura do chão sobre o vazio. */
  | "void"
  /**
   * Nada que valha marcar — o horizonte da simulação acabou, ou a queda já
   * passou da altura do chão de origem (num vão sem fundo, depois disso não
   * há mais decisão a tomar e marcador vira ruído em cima de um morto).
   */
  | "open";

export interface LandingForecast {
  verdict: LandingVerdict;
  /** Ponto a marcar. Em `void` é onde o arco cruza a altura do chão de origem. */
  x: number;
  y: number;
  /** Quadros de voo até o desfecho. */
  frames: number;
}

// ── Números ──────────────────────────────────────────────────────────────

const CUE = {
  /** Voo curto não acende nada: degrau de 30cm não é dúvida. */
  airDelayMs: 90,
  /** Rampa de entrada depois do atraso. Curta o bastante pra servir no ar. */
  airRiseMs: 150,
  /** Perigo entra mais cedo — avisar tarde é o mesmo que não avisar. */
  dangerRiseMs: 80,
  /** 150 quadros = 2.5s. A queda mais longa da fase leva ~0.9s. */
  maxForecastFrames: 150,

  /**
   * Amortecimento do marcador (por segundo). Pouso na quina alterna de
   * superfície entre um quadro e outro; sem amortecer, a marca pisca. Com
   * λ=26 ela ATRAVESSA o vão em ~3 quadros, e esse escorregão é a leitura
   * honesta de "você está no limite".
   */
  markLambda: 26,
  /** Abaixo disto não há o que julgar: pulo que volta pro mesmo lugar. */
  markMinTravel: 3.0,
  markMinDrop: 2.2,

  /** Prumo do jogador: começa a valer acima de 1.3u, cheio a partir de 2.9u. */
  plumbMinHeight: 1.3,
  plumbRiseHeight: 1.6,
  plumbAlpha: 0.62,
  /** Passo do tracejado. É 1.0 porque a régua só serve se der pra CONTAR. */
  dashPitch: 1.0,
  dashLength: 0.62,
  maxDashes: 10,

  /** Um degrau de 1.2u não é queda — marcar isso seria ruído. */
  edgeMinDrop: 1.6,
  // 0.42 e nao 0.8, com raio menor abaixo: verificado em captura, com 0.8
  // num raio de 11u as marcas apareciam em quase todos os telhados da tela
  // ao mesmo tempo e liam como caixas de vidro em volta das plataformas.
  // Ajuda de leitura que aparece o tempo todo vira ruido e o jogador para
  // de ve-la — que e o oposto do que este modulo existe pra fazer.
  edgeAlpha: 0.42,
  /** No chão a beirada fica discreta: ali ela é arquitetura, não alerta. */
  /**
   * 0.12, não 0.45.
   *
   * Com 0.45 a marca de beirada ficava visível o tempo todo em que o
   * guerreiro estava perto de uma plataforma — inclusive parado, andando,
   * sem nenhuma dúvida a resolver. O efeito colateral foi apontado por
   * quem trabalhou na oclusão: os painéis translúcidos nas pontas
   * **pesam na leitura de adesivo**, porque são interface colada por cima
   * da arte, com valor e nitidez que não pertencem ao mundo.
   *
   * Ajuda de leitura tem que aparecer quando é ÚTIL. No ar, onde existe a
   * dúvida de onde vou pousar, ela sobe (o `airFade` manda). No chão vira
   * um sussurro: ainda separa a beirada, mas para de disputar leitura com
   * o palco. Ajuda que aparece sempre é ruído, e ruído o jogador aprende
   * a não ver — que é o oposto do que este módulo existe pra fazer.
   */
  edgeGroundedMix: 0.12,
  edgeRangeX: 6,
  edgeRangeY: 4.5,
  /** O prumo da beirada tem alcance MENOR que o colchete: dois ou três na
   *  tela informam, dez viram grade. */
  rulerAlpha: 0.5,
  rulerRangeX: 6.5,
  rulerRangeY: 5,
  /** Vão sem fundo não tem onde parar o prumo; ele desce isto e apaga. */
  rulerOpenDepth: 5,

  /** Espessura extra e opacidade do halo escuro. */
  haloGrow: 0.085,
  haloAlpha: 0.72,

  markZ: 0,
  edgeZ: 2.02,
} as const;

/** Osso claro: o valor mais alto do quadro, contra um mundo verde médio. */
const CORE_SAFE = new THREE.Color(0xf1f4e4);
/** Laranja quente. Aviso NÃO pode ser verde — verde aqui é o Rot, e o Rot
 *  é justamente o que se está avisando. */
const CORE_WARN = new THREE.Color(0xf07a26);
const CORE_DIM = new THREE.Color(0xd2dabc);
const HALO = new THREE.Color(0x12180f);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// ── Preditor ─────────────────────────────────────────────────────────────

/**
 * Roda a física do guerreiro à frente e devolve o desfecho do voo.
 *
 * É uma RÉPLICA da ordem de operações de `Player.update` — horizontal,
 * gravidade, colisão em X, colisão em Y —, não uma parábola analítica. Dois
 * motivos: a parábola erra 4.5% (a altura real do pulo é 3.31u e não os
 * 3.47u da fórmula, perda da integração discreta a 60Hz), e a parábola não
 * sabe de parede, teto nem quina. Marcador que erra é pior que marcador
 * nenhum, porque o jogador confia nele.
 *
 * O que ela NÃO pode saber é o futuro do controle. A hipótese é "o jogador
 * segue segurando o que está segurando agora" — por isso `dirX` entra de
 * fora. Quando ele muda de direção no ar, o marcador se move, e essa
 * movimentação é informação: mostra quanto controle aéreo ainda resta.
 *
 * Pura, sem THREE e sem estado: dá pra rodar em Node contra o `Player` de
 * verdade e conferir que o palpite bate com o pouso real.
 */
export function predictLanding(
  level: Level,
  s: CueTarget,
  dirX: number,
  refY: number,
  dtMs: number,
  maxFrames: number = CUE.maxForecastFrames,
): LandingForecast {
  const dt = dtMs / 1000;
  const halfW = s.box.w / 2;
  const dir = Math.sign(dirX);

  let x = s.x;
  let y = s.y;
  let vx = s.vx;
  let vy = s.vy;
  /** Reaproveitada a cada passo: alocar uma caixa por quadro de simulação
   *  seriam 150 objetos por quadro de jogo, só pra jogar fora. */
  const box: Aabb = { x: 0, y: 0, w: s.box.w, h: s.box.h };
  let crossedRef: { x: number; y: number } | null = null;

  for (let f = 1; f <= maxFrames; f++) {
    if (dir !== 0) {
      const accel = MOVE.accel * MOVE.airControl;
      vx = Math.max(-MOVE.maxSpeed, Math.min(MOVE.maxSpeed, vx + dir * accel * dt));
    } else {
      const drop = MOVE.frictionAir * dt;
      vx = Math.abs(vx) <= drop ? 0 : vx - Math.sign(vx) * drop;
    }

    const g = vy > 0 ? MOVE.gravityUp : MOVE.gravityDown;
    vy = Math.max(-MOVE.maxFallSpeed, vy - g * dt);

    box.x = x - halfW;
    box.y = y;
    const rx = level.moveX(box, vx * dt);
    if (rx.hit) vx = 0;
    x = rx.x + halfW;

    box.x = x - halfW;
    box.y = y;
    const ry = level.moveY(box, vy * dt);
    const prevY = y;
    y = ry.y;

    // Altura do chão de onde ele saiu: é ali que o jogador ESPERA encontrar
    // piso. Num vão sem fundo é esse cruzamento que vira a marca — o arco
    // chega na altura do chão exatamente aqui, e aqui não tem chão.
    if (crossedRef === null && prevY >= refY && y < refY) crossedRef = { x, y: refY };

    box.x = x - halfW;
    box.y = y;
    // Perigo antes de pouso: encostar no Rot mata no ar, então a checagem
    // tem que vir antes — é a ordem que o `Game` usa.
    if (level.touchesHazard(box)) return { verdict: "hazard", x, y, frames: f };
    if (ry.grounded) return { verdict: "ground", x, y, frames: f };
    if (ry.ceiling && vy > 0) vy = 0;
    if (y < WORLD.killPlaneY) {
      // Sem cruzamento não há onde pôr a marca: o guerreiro já estava
      // ABAIXO da altura do chão quando o palpite foi pedido (andou pra
      // fora da beirada, por exemplo). Marcar no plano de morte, 14u
      // abaixo, jogaria o chevron pra fora da tela — pior que não marcar.
      // Esse caso quem cobre é a marca de beirada, que já diz "aqui cai".
      if (crossedRef === null) return { verdict: "open", x, y, frames: f };
      return { verdict: "void", x: crossedRef.x, y: crossedRef.y, frames: f };
    }
  }
  return { verdict: "open", x, y, frames: maxFrames };
}

// ── Escrita de geometria ─────────────────────────────────────────────────

/**
 * Traços num buffer só.
 *
 * Tudo aqui é retângulo no plano XY escrito num `Float32Array`
 * pré-alocado: o palco inteiro sai em 3 draw calls (`Stage.ts`) e seria
 * ridículo gastar mais que isso em ajuda de leitura. Duas malhas no total,
 * uma estática e uma por quadro.
 */
class StrokeBuffer {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private v = 0;

  constructor(maxQuads: number) {
    this.pos = new Float32Array(maxQuads * 6 * 3);
    this.col = new Float32Array(maxQuads * 6 * 4);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    // itemSize 4: o alfa por vértice é o que permite acender e apagar
    // dezenas de marcas independentes sem uma malha (nem um draw call) por
    // marca.
    this.colAttr = new THREE.BufferAttribute(this.col, 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("color", this.colAttr);
    this.geometry.setDrawRange(0, 0);
  }

  get cursor(): number {
    return this.v;
  }

  reset(): void {
    this.v = 0;
  }

  /**
   * Segmento grosso de (ax,ay) a (bx,by). Os extremos são estendidos meia
   * espessura pra que dois segmentos que se encontram num vértice fechem a
   * quina em vez de deixar um entalhe — é o que separa um chevron de dois
   * palitos soltos.
   */
  seg(ax: number, ay: number, bx: number, by: number, z: number, t: number, c: THREE.Color, a: number): void {
    if (a <= 0.004) return;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy * (t / 2);
    const ny = ux * (t / 2);
    const ex = ux * (t / 2);
    const ey = uy * (t / 2);
    const x0 = ax - ex;
    const y0 = ay - ey;
    const x1 = bx + ex;
    const y1 = by + ey;
    this.vert(x0 + nx, y0 + ny, z, c, a);
    this.vert(x1 + nx, y1 + ny, z, c, a);
    this.vert(x1 - nx, y1 - ny, z, c, a);
    this.vert(x0 + nx, y0 + ny, z, c, a);
    this.vert(x1 - nx, y1 - ny, z, c, a);
    this.vert(x0 - nx, y0 - ny, z, c, a);
  }

  private vert(x: number, y: number, z: number, c: THREE.Color, a: number): void {
    const p = this.v * 3;
    const q = this.v * 4;
    if (q + 3 >= this.col.length) return; // capacidade estourada: cala, não quebra
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.col[q] = c.r;
    this.col[q + 1] = c.g;
    this.col[q + 2] = c.b;
    this.col[q + 3] = a;
    this.v++;
  }

  /** Alfa de um intervalo de vértices. Usado pela malha estática das
   *  beiradas: posição não muda nunca, só a visibilidade. */
  fade(start: number, count: number, mul: number): void {
    for (let i = start; i < start + count; i++) this.col[i * 4 + 3] = this.baseAlpha[i]! * mul;
  }

  /** Alfa "de projeto" de cada vértice, congelado depois da construção. */
  private baseAlpha: Float32Array = new Float32Array(0);

  freezeAlpha(): void {
    this.baseAlpha = new Float32Array(this.v);
    for (let i = 0; i < this.v; i++) this.baseAlpha[i] = this.col[i * 4 + 3]!;
  }

  commit(): void {
    this.geometry.setDrawRange(0, this.v);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  commitColors(): void {
    this.colAttr.needsUpdate = true;
  }

  build(): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        // Sem escrever profundidade: dentro da malha a ordem é a de escrita,
        // então halo vem antes e o núcleo cobre. Com `depthWrite` ligado o
        // halo recortaria o próprio núcleo.
        depthWrite: false,
        // Mas COM `depthTest`: marca que atravessa parede destrói a leitura
        // de profundidade que ela existe pra dar.
        depthTest: true,
        // Face dupla porque a bobina do quad inverte quando o segmento aponta
        // pra esquerda, e ficar contando sentido em cada traço é convite a bug.
        side: THREE.DoubleSide,
        // Névoa apaga o que está longe; ajuda de leitura apagada não ajuda.
        fog: false,
      }),
    );
    // Posição muda todo quadro na malha viva: deixar o THREE cachear uma
    // esfera envolvente velha faria a marca sumir por culling.
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  }
}

/** Traço pendente. Reaproveitado entre quadros pra não gerar lixo no laço. */
interface Stroke {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  t: number;
  a: number;
}

class StrokeList {
  private readonly items: Stroke[] = [];
  private n = 0;

  reset(): void {
    this.n = 0;
  }

  add(ax: number, ay: number, bx: number, by: number, t: number, a = 1): void {
    let s = this.items[this.n];
    if (s === undefined) {
      s = { ax: 0, ay: 0, bx: 0, by: 0, t: 0, a: 0 };
      this.items.push(s);
    }
    s.ax = ax;
    s.ay = ay;
    s.bx = bx;
    s.by = by;
    s.t = t;
    s.a = a;
    this.n++;
  }

  /** Duas passadas: TODO o halo primeiro, depois TODO o núcleo. A ordem é
   *  a profundidade aqui — se cada traço fosse halo+núcleo em sequência, o
   *  halo do segundo comeria o núcleo do primeiro na quina do chevron. */
  flush(buf: StrokeBuffer, z: number, core: THREE.Color, alpha: number): void {
    if (alpha <= 0.004) {
      this.reset();
      return;
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.items[i]!;
      buf.seg(s.ax, s.ay, s.bx, s.by, z, s.t + CUE.haloGrow, HALO, s.a * alpha * CUE.haloAlpha);
    }
    for (let i = 0; i < this.n; i++) {
      const s = this.items[i]!;
      buf.seg(s.ax, s.ay, s.bx, s.by, z, s.t, core, s.a * alpha);
    }
    this.reset();
  }
}

// ── Beiradas (malha estática) ────────────────────────────────────────────

interface EdgeCue {
  /** x da quina. */
  x: number;
  /** Topo da superfície. */
  y: number;
  /** +1 se a plataforma continua pra direita da quina, −1 se pra esquerda. */
  inward: 1 | -1;
  /** Vértices do colchete e do prumo, pra acender cada um por conta. */
  bracket: { start: number; count: number };
  ruler: { start: number; count: number };
}

interface Run {
  x0: number;
  x1: number;
  y: number;
}

// ── Módulo ───────────────────────────────────────────────────────────────

export class DepthCues {
  readonly object = new THREE.Group();

  private readonly level: Level;
  private readonly edges: EdgeCue[] = [];
  private readonly edgeBuf: StrokeBuffer;
  private readonly liveBuf: StrokeBuffer;
  private readonly pending = new StrokeList();

  /** Tempo de voo acumulado por PASSO FIXO — nunca por relógio. */
  private airMs = 0;
  /** Altura do último chão pisado. Referência pro vão sem fundo. */
  private refY = 0;
  private markX = 0;
  private markY = 0;
  private markSettled = false;

  constructor(level: Level) {
    this.level = level;

    // A malha das beiradas é construída UMA vez: o nível é estático, e o
    // que muda por quadro é só quem está aceso.
    this.edgeBuf = new StrokeBuffer(this.countEdgeQuads(level));
    this.buildEdges(level);
    this.edgeBuf.freezeAlpha();
    this.edgeBuf.commit();

    this.liveBuf = new StrokeBuffer(64);

    this.object.add(this.edgeBuf.build(), this.liveBuf.build());
    this.object.name = "depth-cues";
  }

  /**
   * Passo fixo: `dtMs` vem do laço, não de `performance.now()`.
   * `dirX` é −1/0/+1 — a direção que o jogador segura AGORA, sem a qual o
   * preditor teria que adivinhar entre "continua" e "soltou", que dão
   * pousos a metros de distância um do outro.
   */
  update(p: CueTarget, dirX: number, dtMs: number): void {
    if (p.grounded) {
      this.airMs = 0;
      this.refY = p.y;
      this.markSettled = false;
    } else {
      this.airMs += dtMs;
    }

    const airFade = clamp01((this.airMs - CUE.airDelayMs) / CUE.airRiseMs);

    this.updateEdges(p, airFade);
    this.updateLive(p, dirX, dtMs, airFade);
  }

  dispose(): void {
    for (const child of this.object.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }

  // ── beiradas ───────────────────────────────────────────────────────────

  private updateEdges(p: CueTarget, airFade: number): void {
    // No chão a beirada é discreta e constante; no ar ela sobe junto com a
    // dúvida. Em nenhum dos dois ela pisca — marca que pisca vira alarme.
    const ctx = p.grounded ? CUE.edgeGroundedMix : Math.max(CUE.edgeGroundedMix, airFade);
    for (const e of this.edges) {
      const near = (rx: number, ry: number): number =>
        smooth(1 - Math.min(1, Math.hypot((e.x - p.x) / rx, (e.y - p.y) / ry)));
      this.edgeBuf.fade(e.bracket.start, e.bracket.count, CUE.edgeAlpha * near(CUE.edgeRangeX, CUE.edgeRangeY) * ctx);
      this.edgeBuf.fade(e.ruler.start, e.ruler.count, CUE.rulerAlpha * near(CUE.rulerRangeX, CUE.rulerRangeY) * ctx);
    }
    this.edgeBuf.commitColors();
  }

  /** Orçamento de vértices. Superestima de propósito — buffer curto some
   *  traço em silêncio, e silêncio é o pior modo de falhar aqui. */
  private countEdgeQuads(level: Level): number {
    return level.data.blocks.length * 2 * (2 + CUE.maxDashes) * 2 + 16;
  }

  private buildEdges(level: Level): void {
    for (const run of DepthCues.walkableRuns(level)) {
      // Superfície envenenada não ganha marca de "pode pisar". A torção da
      // fase 1 é justamente "o chão largo e convidativo é o Rot"; anunciar
      // a beirada dele seria o módulo mentindo pro jogador.
      if (level.touchesHazard({ x: run.x0 + 0.1, y: run.y + 0.02, w: run.x1 - run.x0 - 0.2, h: 0.4 })) continue;

      for (const inward of [1, -1] as const) {
        const ex = inward === 1 ? run.x0 : run.x1;
        const outX = ex - inward * 0.4;

        // Parede não é beirada. Um degrau pra CIMA logo ao lado significa
        // que dali não se cai — marcar seria ruído puro.
        if (DepthCues.solidAt(level, outX, run.y + 0.35)) continue;

        const below = level.groundBelow(outX, run.y - 0.05);
        const drop = below === null ? Infinity : run.y - below;
        if (drop < CUE.edgeMinDrop) continue;

        const start = this.edgeBuf.cursor;
        // Colchete na quina: um filete no topo da silhueta e um poste
        // descendo a face frontal. É a tradução do "lábio claro" 2D pra uma
        // câmera em que a face frontal aparece ~6x maior que o topo.
        this.pending.add(ex, run.y + 0.05, ex + inward * 1.0, run.y + 0.05, 0.1);
        this.pending.add(ex + inward * 0.08, run.y, ex + inward * 0.08, run.y - 0.7, 0.15);
        this.pending.flush(this.edgeBuf, CUE.edgeZ, CORE_SAFE, 1);
        const bracket = { start, count: this.edgeBuf.cursor - start };

        // Prumo PENDURADO NO VAZIO, do lado de fora da quina: assim ele
        // nunca cobre a alvenaria e cai exatamente por onde o jogador cairia.
        const rulerStart = this.edgeBuf.cursor;
        const floor = below ?? run.y - CUE.rulerOpenDepth;
        const poisonBelow =
          below !== null && level.touchesHazard({ x: outX - 0.15, y: below + 0.02, w: 0.3, h: 0.4 });
        const px = ex - inward * 0.22;
        let n = 0;
        for (let d = CUE.dashPitch; d <= run.y - floor + 0.001 && n < CUE.maxDashes; d += CUE.dashPitch, n++) {
          const top = run.y - d + CUE.dashLength;
          const bot = Math.max(floor, run.y - d);
          if (top - bot < 0.1) continue;
          // Apaga pra baixo: o traçado tem que ler como "pendurado daqui",
          // não como uma barra sólida atravessando o quadro.
          this.pending.add(px, bot, px, top, 0.07, 1 - (d / (run.y - floor + 0.001)) * 0.55);
        }
        this.pending.flush(this.edgeBuf, CUE.edgeZ, poisonBelow ? CORE_WARN : CORE_DIM, 1);

        this.edges.push({
          x: ex,
          y: run.y,
          inward,
          bracket,
          ruler: { start: rulerStart, count: this.edgeBuf.cursor - rulerStart },
        });
      }
    }
  }

  /**
   * Topos contíguos viram UMA superfície.
   *
   * Sem fundir, dois blocos encostados na mesma altura produzem duas
   * "beiradas" na junta — e a fase tem várias juntas dessas (o corredor de
   * telhado é `ledge(94)` + `ledge(100)`). Marca no meio de um chão
   * contínuo é exatamente a mentira que faz o jogador parar de confiar.
   */
  private static walkableRuns(level: Level): Run[] {
    const tops: Run[] = level.data.blocks.map((b) => ({ x0: b.x, x1: b.x + b.w, y: b.y + b.h }));
    tops.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const runs: Run[] = [];
    for (const t of tops) {
      const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
      if (last !== undefined && Math.abs(last.y - t.y) < 0.02 && t.x0 <= last.x1 + 0.02) {
        last.x1 = Math.max(last.x1, t.x1);
      } else {
        runs.push({ x0: t.x0, x1: t.x1, y: t.y });
      }
    }
    return runs;
  }

  private static solidAt(level: Level, x: number, y: number): boolean {
    for (const b of level.data.blocks) {
      if (x >= b.x && x <= b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  // ── preditor + prumo ───────────────────────────────────────────────────

  private updateLive(p: CueTarget, dirX: number, dtMs: number, airFade: number): void {
    this.liveBuf.reset();
    if (!p.grounded) {
      this.drawPlumb(p, airFade);
      this.drawLanding(p, dirX, dtMs, airFade);
    }
    this.liveBuf.commit();
  }

  /**
   * Régua vertical do guerreiro até o chão embaixo dele.
   *
   * Os traços são ancorados NO CHÃO e não nos pés: assim eles ficam
   * parados enquanto o guerreiro sobe, e um novo aparece a cada metro
   * ganho. Ancorados nos pés, deslizariam junto e a régua não mediria nada
   * — seria só uma franja pendurada no personagem.
   */
  private drawPlumb(p: CueTarget, airFade: number): void {
    const gy = this.level.groundBelow(p.x, p.y + 0.05);
    if (gy === null) return;
    const h = p.y - gy;
    const a = CUE.plumbAlpha * clamp01((h - CUE.plumbMinHeight) / CUE.plumbRiseHeight) * airFade;
    if (a <= 0.01) return;

    let n = 0;
    for (let d = 0.2; d < h - 0.1 && n < CUE.maxDashes; d += CUE.dashPitch, n++) {
      const bot = gy + d;
      const top = Math.min(bot + CUE.dashLength, p.y - 0.1);
      if (top - bot < 0.1) break;
      this.pending.add(p.x, bot, p.x, top, 0.075, 1 - (d / h) * 0.5);
    }
    this.pending.flush(this.liveBuf, CUE.markZ, CORE_DIM, a);
  }

  private drawLanding(p: CueTarget, dirX: number, dtMs: number, airFade: number): void {
    const f = predictLanding(this.level, p, dirX, this.refY, dtMs);
    if (f.verdict === "open") return;
    const danger = f.verdict !== "ground";

    if (!this.markSettled) {
      this.markX = f.x;
      this.markY = f.y;
      this.markSettled = true;
    } else {
      const k = Math.exp(-CUE.markLambda * (dtMs / 1000));
      this.markX = f.x + (this.markX - f.x) * k;
      this.markY = f.y + (this.markY - f.y) * k;
    }

    // Quanto há pra decidir. Pulo vertical que cai no mesmo lugar não
    // precisa de marcador; travessia de 6u precisa. Perigo ignora a conta
    // — ali não existe "pouco relevante".
    const relevance = danger
      ? 1
      : clamp01(Math.max(Math.abs(f.x - p.x) / CUE.markMinTravel, (p.y - f.y) / CUE.markMinDrop));
    const fade = danger ? clamp01(this.airMs / CUE.dangerRiseMs) : airFade * relevance;
    if (fade <= 0.01) return;

    const x = this.markX;
    const y = this.markY;
    if (f.verdict === "void") {
      // Sem barra: barra desenharia um chão que não existe. Dois chevrons
      // empilhados leem como "continua descendo, e não tem fundo".
      this.chevron(x, y + 0.62);
      this.chevron(x, y + 0.16);
    } else {
      this.pending.add(x - 0.6, y + 0.05, x + 0.6, y + 0.05, 0.09);
      this.chevron(x, y + 0.62);
    }
    this.pending.flush(this.liveBuf, CUE.markZ, danger ? CORE_WARN : CORE_SAFE, fade);
  }

  /** "▼" com a ponta em (x, yTop − 0.4). Aponta pra baixo porque a
   *  pergunta é "onde eu caio", e a resposta é embaixo dele. */
  private chevron(x: number, yTop: number): void {
    this.pending.add(x - 0.4, yTop, x, yTop - 0.4, 0.11);
    this.pending.add(x + 0.4, yTop, x, yTop - 0.4, 0.11);
  }
}
