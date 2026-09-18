/**
 * O guerreiro amaldiçoado — montado em geometria primitiva do three.
 *
 * Por que geometria de código e não um modelo importado: é o padrão do
 * projeto e tem precedente direto. No jogo 2D o guerreiro era desenhado
 * membro a membro em `src/render/KnightRenderer.ts` (pose paramétrica,
 * 1300 linhas de Canvas 2D). O ganho é o mesmo aqui: a pose é uma função
 * de parâmetros nomeados, então game feel se ajusta mexendo em número, e
 * não reabrindo um DCC.
 *
 * ## A régua: 1 unidade = 59 pixels
 *
 * A câmera (ver `game/tuning.ts`) fica entre 14u e 18u com fov 34. A 14u
 * ela enxerga 2·14·tan(17°) = 8.56u de altura, então numa tela de 506px
 * **1u vale 59px** e o guerreiro de 1.7u sai com ~100px. É essa a régua
 * que decide o que entra neste arquivo, e ela tem duas consequências que
 * o arquivo já violou uma vez cada:
 *
 * - **Peça com menos de ~0.03u numa direção não existe.** 0.03u = 1.8px.
 * - **O eixo Z quase não chega na tela.** O personagem olha pra ±X, a
 *   câmera olha por -Z, e o corpo gira só `T.cheat` (~21°) pra ela. Uma
 *   medida em X chega multiplicada por ~0.94; a MESMA medida em Z chega
 *   multiplicada por ~0.35. Detalhe cuja informação está na profundidade
 *   é invisível por construção — foi assim que a lâmina da espada (larga
 *   em Z, fina em X) passou a produção inteira lendo como cajado, e assim
 *   que o pente do elmo (0.012 em X) desenhava 0.7px. Ao autorar uma
 *   peça, pergunte em que eixo mora a informação dela.
 *
 * ## As três decisões que sustentam este arquivo
 *
 * 1. SILHUETA ACIMA DE TUDO. Detalhe de superfície não sobrevive a 100px
 *    de altura. Sobrevivem quatro coisas, e é nelas que a geometria
 *    gasta: coroa cônica + viseira em bico (bacinete), espáldeiras mais
 *    largas que o elmo, saiote flarado separando tronco de perna, e a
 *    ESPADA cruzando as costas em diagonal. Preenchido de preto, o boneco
 *    é reconhecível por essas quatro e por mais nada.
 *
 *    Isso é AFERIDO, não afirmado. Silhueta exata do guerreiro parado,
 *    900×506, medida contra máscara chapada:
 *
 *                             antes      depois
 *        caixa                43×104px   52×98px
 *        ombro / cabeça       1.24       ~1.6
 *        espada               traço vertical de 2px   diagonal de 5px
 *                                                     com guarda de 15px
 *
 * 1b. E VALOR É METADE DA SILHUETA. Um contorno certo não salva um corpo
 *    de um valor só. Medido no mesmo quadro, luminância do corpo:
 *
 *                    antes                    depois
 *        p10/p50/p90   0 / 8 / 40             2 / 33 / 127
 *        fundo claro   181 → buraco chapado   181 → massa com forma
 *        fundo escuro    4 → ele SOME           4 → ele salta
 *
 *    A causa está na nota de METAL_STEEL, mais abaixo, e ela vale a
 *    leitura antes de mexer em qualquer cor daqui.
 *
 * 2. O CHÃO TRAVA O PÉ. Poses grounded não escolhem a altura do quadril
 *    por número mágico: ela é DERIVADA do alcance vertical da perna
 *    (`legReach`), de modo que a perna de apoio termina exatamente em
 *    y=0. É o que faz o agachamento de aterrissagem ficar fundo sem o pé
 *    atravessar o chão, e o que garante que o contrato "pés na origem"
 *    valha em toda pose, não só em repouso.
 *
 * 3. ATERRISSAGEM É CAMADA ADITIVA, NÃO ESTADO. Lição cara do jogo 2D:
 *    o ciclo de pulo tinha quadros de pouso no fim e eles NUNCA tocavam,
 *    porque o estado virava idle/run no mesmo quadro em que o pé
 *    encostava. Aqui o impacto é disparado pela transição ar→chão
 *    detectada por este módulo, roda por conta própria e soma por cima da
 *    pose base. Se quem chama nunca mandar "land", o peso aparece assim
 *    mesmo.
 *
 * Determinismo: sem relógio e sem `Math.random()`. Todo tempo vem do dt
 * acumulado; toda "variação orgânica" vem de senos de frequências
 * incomensuráveis. O harness de captura depende disso.
 */
import * as THREE from "three";
import type { HeroAnim, HeroRig } from "../contracts";

const TAU = Math.PI * 2;

/**
 * Inclinação da espada nas costas, em radianos, negativa = punho pra
 * frente. Constante e não literal porque ela é lida em DOIS lugares —
 * `buildSword` planta a pose de repouso e `apply` a reconstrói a cada
 * quadro somando o balanço. Antes eram dois `-0.3` soltos, e mudar um sem
 * o outro faz a espada dar um salto no primeiro `update`.
 */
const SWORD_TILT = -0.44;

// ── Paleta ────────────────────────────────────────────────────────────
// Portada da paleta do guerreiro 2D pra manter coerência entre os dois
// jogos. A regra que importa aqui é a do brief: material tem que se
// distinguir COM A COR REMOVIDA — então aço, couro, pano e podridão são
// separados por metalness/roughness, não por matiz.
const PAL = {
  /** Aço vivo. É o valor ALTO do personagem — ver a nota de metalness. */
  steel: 0x9daaba,
  /**
   * Aço de CORPO: o tom médio da família.
   *
   * Existe porque com dois tons só (claro e escuro) a couraça e a
   * espáldeira caíam no mesmo `steel` e, medido na captura, o tronco
   * inteiro virava uma mancha clara única — o peito desaparecia dentro do
   * ombro. Três tons da mesma matiz é o contrato do DESIGN.md §2.1, e
   * aqui ele tem função estrutural: placa que aponta pra CIMA usa
   * `steel` (é ela que recebe o sol), placa vertical de tronco usa este,
   * peça recuada usa `steelDark`.
   */
  steelBody: 0x74808e,
  /** Aço recuado (peças internas, lado da sombra). O valor BAIXO. */
  steelDark: 0x4b5460,
  /** Aço já comido pela praga: cinza sem azul, morto. */
  steelRot: 0x585448,
  /** Couro: fosco absoluto, sem specular nenhum. */
  leather: 0x7b5735,
  leatherDark: 0x3d2a1b,
  /** Pano do tabardo. A única área grande de matiz quente no corpo. */
  cloth: 0x9c2a1d,
  /** Ouro: único metal quente. Usado com parcimônia, só em aresta. */
  gold: 0xdcb35d,
  /** Vazio: fresta da viseira, sombra interna. Lê como buraco. */
  hollow: 0x090a0b,
  /** A Podridão. Dessaturada e escura de propósito: é estranhamento,
   *  não efeito luminoso. */
  rot: 0x66783a,
  rotGlow: 0x8b9c52,
  /** Brasa doente atrás da viseira. O único ponto emissivo forte. */
  eye: 0xc2cf7e,
} as const;

/**
 * METALNESS — a constante mais cara que este arquivo já teve errada.
 *
 * A versão anterior autorava o aço com `metalness` 0.6–0.9, achando que
 * comprava brilho. Comprava o contrário. No `MeshStandardMaterial` do
 * three, `material.diffuseColor = albedo * (1 - metalness)`; e o termo
 * especular indireto (`RE_IndirectSpecular`) só existe sob `USE_ENVMAP`.
 * A cena deste jogo NÃO tem `scene.environment` — nem PMREM, nem HDRI,
 * nem cubemap; conferido em `main.ts` e em `render/atmosphere.ts`. Logo
 * um metal aqui perde 60–90% do difuso e não recebe nada de volta: sobra
 * um lóbulo GGX estreito das duas direcionais e escuro no resto.
 *
 * O custo medido, guerreiro isolado sob a luz real, 900×506, máscara de
 * silhueta exata (43×104px):
 *
 *     luminância do corpo   min 0   p10 0   p50 8   p90 40   máx 183
 *     fundo claro (céu)     181       →  ele é um buraco sem forma
 *     fundo escuro (Rot)      4       →  ele SOME
 *
 * Um personagem com mediana 8 não tem sombreamento: tem ausência de luz.
 * Todo o trabalho de forma deste arquivo estava sendo renderizado dentro
 * de uma faixa de 8 valores.
 *
 * Por isso o aço aqui é quase dielétrico. O que faz superfície ler como
 * METAL a 100px de altura não é o BRDF — é aresta dura e dois planos de
 * valor bem separados, que é como o pixel art sempre resolveu isso e é o
 * que `flatShading` já entrega. A pitada de metalness que sobra existe só
 * pra a direcional ainda cravar um realce na quina.
 *
 * Se algum dia entrar um `scene.environment`, ISTO é o número a revisar.
 */
const METAL_STEEL = 0.16;
const METAL_DULL = 0.08;

// ── Proporção ─────────────────────────────────────────────────────────
// Pés na origem (y=0), topo da crista em ~1.70. ~5.4 cabeças: heroico,
// não chibi — mas a cabeça é maior que o realista porque a essa escala
// cabeça pequena vira ponto e o boneco perde o rosto na silhueta.
const DIM = {
  hipY: 0.78,
  thigh: 0.36,
  shin: 0.33,
  /** Tornozelo→sola. Entra no cálculo de alcance da perna. */
  footH: 0.09,
  footLen: 0.26,
  legZ: 0.115,
  /** Alturas abaixo são LOCAIS ao grupo do quadril (y=0 no quadril). */
  shoulderY: 0.38,
  upperArm: 0.24,
  foreArm: 0.24,
  armZ: 0.235,
  neckY: 0.455,
  helmY: 0.47,
} as const;

/** Alcance vertical do quadril até a sola, dados os ângulos da perna. */
function legReach(hip: number, knee: number): number {
  // Coxa faz ângulo `hip` com a vertical; canela faz `hip - knee` porque
  // a flexão do joelho leva o pé PRA TRÁS (subtrai do ângulo da coxa).
  return (
    DIM.thigh * Math.cos(hip) + DIM.shin * Math.cos(hip - knee) + DIM.footH
  );
}

// ── Tempos ────────────────────────────────────────────────────────────
const T = {
  /**
   * Virada de 180°. 125ms ≈ 7.5 quadros a 60fps. Instantâneo lê como
   * papel virando; acima de ~200ms o jogador sente que o input foi
   * ignorado, porque a física já mudou de direção e a imagem não.
   */
  turnMs: 125,
  /**
   * Rotação de trapaça: o corpo não fica em perfil puro, gira pra câmera.
   * Em perfil exato as espáldeiras — a parte mais larga do personagem —
   * apontam pro fundo e somem, e o peito vira uma linha.
   *
   * 0.36 (~21°), não os 0.28 de antes. A conta: com giro θ, uma medida no
   * eixo Z do personagem chega na tela multiplicada por sin(θ). A 0.28 o
   * vão de ombro (0.62 em Z) rendia 0.17 de largura na tela e a silhueta
   * media 26px de ombro contra 21px de cabeça — razão 1.24, quando o
   * arquivo inteiro foi escrito supondo 2.6. A 0.36 o mesmo vão rende
   * 0.22, e o peito (onde moram tabardo e quilha) vira área em vez de
   * linha. Acima de ~0.45 o bico da viseira aponta pra câmera e o
   * personagem perde a direção do olhar, que é o que ele não pode perder.
   */
  cheat: 0.36,
  /** Cross-fade padrão entre poses. Curto: 5-6 quadros. */
  blendMs: 90,
  /** Dano e aterrissagem entram com estalo; suavizar mata o impacto. */
  blendSnapMs: 30,
  /** Base do envelope de aterrissagem; cresce com o tempo de queda. */
  landMs: 200,
  landMsHeavy: 130,
  /** Tempo de voo que satura o impacto em 1.0. */
  airFullMs: 460,
  hurtMs: 420,
} as const;

// ── Pose ──────────────────────────────────────────────────────────────
// Uma pose é um punhado de escalares nomeados. Todos os ângulos em
// radianos, e todos com o MESMO sinal: positivo = a ponta do membro vai
// pra FRENTE (+X local). Isso vale pro quadril, pro ombro e pra
// inclinação do tronco; o joelho e o cotovelo invertem porque flexão
// leva a extremidade pra trás, e isso está explícito em `apply`.
const POSE_KEYS = [
  "root",
  "lean",
  "twist",
  "pelvis",
  "headPitch",
  "sqX",
  "sqY",
  "hipA",
  "hipB",
  "kneeA",
  "kneeB",
  "ankleA",
  "ankleB",
  "shoA",
  "shoB",
  "elbA",
  "elbB",
  "crest",
  "cloth",
  "lock",
] as const;

type PoseKey = (typeof POSE_KEYS)[number];
type Pose = Record<PoseKey, number>;

function newPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  p.sqX = 1;
  p.sqY = 1;
  return p;
}

function copyPose(dst: Pose, src: Pose): void {
  for (const k of POSE_KEYS) dst[k] = src[k];
}

function lerpPose(dst: Pose, a: Pose, b: Pose, t: number): void {
  for (const k of POSE_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Mola de 1 grau de liberdade, integrada em passo fixo.
 *
 * Existe pra dar movimento SECUNDÁRIO de graça: crista do elmo e tabardo
 * seguem o corpo com atraso e passam do ponto ao parar. Sem isso as duas
 * peças leem como plástico colado, que é o tell mais barato de rig
 * amador — e o jogo 2D já tinha resolvido isso com defasagem manual de
 * 1/8 de ciclo no penacho.
 */
class Spring {
  private vel = 0;
  value = 0;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}

  step(target: number, dtSec: number): number {
    this.vel +=
      ((target - this.value) * this.stiffness - this.vel * this.damping) *
      dtSec;
    this.value += this.vel * dtSec;
    return this.value;
  }
}

// ── Fábricas de peça ──────────────────────────────────────────────────

function mat(
  color: number,
  roughness: number,
  metalness: number,
  flat = true,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    // Facetado de propósito: a leitura "32-bit mas 2D" vem de planos de
    // valor bem separados. Sombreamento suave em poucos polígonos vira
    // gradiente mole e o metal perde a aresta.
    flatShading: flat,
  });
}

function place(m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ── O rig ─────────────────────────────────────────────────────────────

export class Hero implements HeroRig {
  readonly object = new THREE.Group();

  // Nós articulados. `turn` gira o corpo inteiro; `squash` deforma com
  // pivô nos PÉS (por isso mora em y=0); `hip` carrega tudo que sobe e
  // desce com o quadril, inclusive as pernas.
  private readonly turn = new THREE.Group();
  private readonly squash = new THREE.Group();
  private readonly hip = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly crest = new THREE.Group();
  private readonly clothPivot = new THREE.Group();
  private readonly sword = new THREE.Group();

  private readonly thighA = new THREE.Group();
  private readonly thighB = new THREE.Group();
  private readonly kneeA = new THREE.Group();
  private readonly kneeB = new THREE.Group();
  private readonly ankleA = new THREE.Group();
  private readonly ankleB = new THREE.Group();

  private readonly shoulderA = new THREE.Group();
  private readonly shoulderB = new THREE.Group();
  private readonly elbowA = new THREE.Group();
  private readonly elbowB = new THREE.Group();

  private readonly matRot: THREE.MeshStandardMaterial;
  private readonly matEye: THREE.MeshStandardMaterial;

  // Estado de animação.
  private readonly cur = newPose();
  private readonly tgt = newPose();
  private readonly from = newPose();
  private readonly out = newPose();

  private anim: HeroAnim = "idle";
  private blendT = 1;
  private blendDur: number = T.blendMs;

  private timeMs = 0;
  /** Tempo dentro do estado atual. Zera na troca de `anim`. */
  private stateMs = 0;
  /** Fase do ciclo de passo, em voltas. Só avança correndo. */
  private step = 0;

  private airMs = 0;
  private wasAir = false;
  /** <0 = nenhum impacto ativo. */
  private landMs = -1;
  private landPower = 0;
  private hurtMs = -1;

  /** -1..1 contínuo. É o que faz a virada ter duração em vez de estalo. */
  private facingBlend = 1;

  private readonly springCrest = new Spring(240, 16);
  private readonly springCloth = new Spring(150, 13);

  constructor() {
    this.object.name = "hero";
    this.object.add(this.turn);
    this.turn.add(this.squash);
    this.squash.add(this.hip);
    this.hip.position.y = DIM.hipY;
    this.hip.add(this.torso);

    const steel = mat(PAL.steel, 0.42, METAL_STEEL);
    const steelBody = mat(PAL.steelBody, 0.5, METAL_STEEL);
    const steelDark = mat(PAL.steelDark, 0.6, METAL_STEEL);
    const steelRot = mat(PAL.steelRot, 0.86, METAL_DULL);
    const leather = mat(PAL.leather, 0.95, 0.02);
    const leatherDark = mat(PAL.leatherDark, 0.95, 0.02);
    const cloth = mat(PAL.cloth, 1.0, 0.0, false);
    const gold = mat(PAL.gold, 0.34, 0.3);
    const hollow = mat(PAL.hollow, 1.0, 0.0);

    // A podridão é o único material orgânico: sem specular, levemente
    // emissiva. Guardada porque pulsa em `apply`.
    this.matRot = new THREE.MeshStandardMaterial({
      color: PAL.rot,
      roughness: 0.9,
      metalness: 0.0,
      emissive: new THREE.Color(PAL.rotGlow),
      emissiveIntensity: 0.12,
      flatShading: true,
    });
    this.matEye = new THREE.MeshStandardMaterial({
      color: PAL.hollow,
      roughness: 1.0,
      metalness: 0.0,
      emissive: new THREE.Color(PAL.eye),
      emissiveIntensity: 0.8,
    });

    this.buildLegs(steel, steelDark, leather, leatherDark);
    this.buildTorso(steel, steelBody, steelDark, leather, cloth, gold);
    this.buildArms(steel, steelDark, leather);
    this.buildHead(steel, steelDark, gold, hollow);
    this.buildSword(steel, steelDark, steelRot, leather, gold);

    // Pose de repouso aplicada uma vez pra o objeto nascer coerente —
    // quem instancia pode adicionar à cena e desenhar antes do primeiro
    // update sem pegar um boneco em T-pose.
    this.poseIdle(this.cur);
    copyPose(this.tgt, this.cur);
    copyPose(this.from, this.cur);
    this.apply(this.cur, 0);
  }

  // ── Construção ──────────────────────────────────────────────────────

  private buildLegs(
    steel: THREE.MeshStandardMaterial,
    steelDark: THREE.MeshStandardMaterial,
    leather: THREE.MeshStandardMaterial,
    leatherDark: THREE.MeshStandardMaterial,
  ): void {
    // Geometria compartilhada entre as duas pernas: menos upload de
    // buffer e o renderer consegue agrupar os draws.
    const thighGeo = new THREE.CylinderGeometry(0.078, 0.058, DIM.thigh, 6);
    const shinGeo = new THREE.CylinderGeometry(0.056, 0.045, DIM.shin, 6);
    // Greva: placa na CANELA, virada pra frente. É o que diferencia perna
    // blindada de perna de pano na silhueta em movimento — e é o único
    // aço abaixo do cinto, ou seja o único jeito de a perna não afundar
    // no escuro. Alargada de 0.055 pra 0.08 em X: a perna inteira media
    // 8px de coluna num boneco de 104px, e 8px de couro escuro somem.
    const greaveGeo = new THREE.BoxGeometry(0.08, 0.23, 0.12);
    // Bota chunky. Pé pequeno some; pé grande ancora o boneco no chão.
    const bootGeo = new THREE.BoxGeometry(DIM.footLen, DIM.footH, 0.135);
    // Biqueira em aço CLARO: o pé é a peça que encosta na sombra de
    // contato e no chão escuro, e bota inteira em couro escuro afunda ali.
    const toeGeo = new THREE.BoxGeometry(0.085, 0.06, 0.12);

    const sides: Array<[THREE.Group, THREE.Group, THREE.Group, number]> = [
      [this.thighA, this.kneeA, this.ankleA, DIM.legZ],
      [this.thighB, this.kneeB, this.ankleB, -DIM.legZ],
    ];

    for (const [thigh, knee, ankle, z] of sides) {
      thigh.position.set(0, 0, z);
      this.hip.add(thigh);
      thigh.add(place(new THREE.Mesh(thighGeo, leather), 0, -DIM.thigh / 2, 0));
      // Cocha/coxote: só a face de cima da coxa é blindada.
      thigh.add(
        place(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.145), steelDark), 0.01, -0.06, 0),
      );

      knee.position.y = -DIM.thigh;
      thigh.add(knee);
      // Joelheira: bolinha saliente. Marca a dobra na silhueta, que é o
      // que faz a passada ler — joelho liso vira macarrão.
      knee.add(
        place(new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), steel), 0.018, 0, 0),
      );
      knee.add(place(new THREE.Mesh(shinGeo, leatherDark), 0, -DIM.shin / 2, 0));
      knee.add(place(new THREE.Mesh(greaveGeo, steel), 0.028, -0.11, 0));

      ankle.position.y = -DIM.shin;
      knee.add(ankle);
      // Bota nasce no tornozelo e avança em +X: o calcanhar fica atrás do
      // eixo, o bico à frente. Com isso o pé plantado tem base real.
      ankle.add(place(new THREE.Mesh(bootGeo, leather), DIM.footLen / 2 - 0.09, -DIM.footH / 2, 0));
      ankle.add(place(new THREE.Mesh(toeGeo, steel), DIM.footLen - 0.105, -DIM.footH / 2, 0));
    }
  }

  private buildTorso(
    steel: THREE.MeshStandardMaterial,
    steelBody: THREE.MeshStandardMaterial,
    steelDark: THREE.MeshStandardMaterial,
    leather: THREE.MeshStandardMaterial,
    cloth: THREE.MeshStandardMaterial,
    gold: THREE.MeshStandardMaterial,
  ): void {
    // Saiote (faulds): cone invertido que ALARGA pra baixo. Peça de
    // silhueta pura — é ela que impede tronco e pernas de virarem um
    // tubo só, e o triângulo que ela cria é metade do "cavaleiro".
    const faulds = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.235, 0.17, 8),
      leather,
    );
    // 0.88, não 0.74. Achatar o tronco em X é anatomicamente certo — um
    // peito humano é mais largo de lado a lado que da frente pras costas —
    // e é exatamente por isso que custa caro AQUI: X é o eixo que chega
    // inteiro na tela e Z é o que a câmera esmaga. Achatar 26% em X
    // achatava 26% do saiote NA IMAGEM. Medido, o saiote saía com 21.6px
    // contra 33 de ombro; a 0.88 vai a ~25px e o triângulo volta a existir.
    // O saiote fica proporcionalmente MAIS largo que a couraça (0.88
    // contra 0.78) porque a flare é a informação: é ela que impede tronco
    // e perna de lerem como um tubo só.
    faulds.scale.x = 0.88;
    this.torso.add(place(faulds, -0.005, -0.005, 0));

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), leather);
    belt.scale.x = 0.84;
    this.torso.add(place(belt, 0, 0.062, 0));
    // Fivela: 0.03 em X chegava com 1.7px. Engrossada pra 0.05 vira um
    // acento quente de ~5px na cintura, que é onde o olho procura a
    // divisão entre tronco e perna.
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.1), gold);
    this.torso.add(place(buckle, 0.145, 0.062, 0));

    // Couraça: cilindro de 8 lados achatado no eixo do corpo. Oval, não
    // redondo — tronco cilíndrico lê como boneco de neve.
    const cuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.2, 0.4, 8), steelBody);
    cuirass.scale.x = 0.78;
    this.torso.add(place(cuirass, 0, 0.245, 0));
    // Quilha central: aresta vertical no peito. Pega a luz e divide o
    // peito em dois valores, que é o truque de "sombreamento em
    // gradiente dentro do sprite" traduzido pra 3D.
    this.torso.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.34, 0.05), steel), 0.125, 0.25, 0),
    );

    // Tabardo em pivô próprio: balança com atraso (mola). Duas abas,
    // frente e costas, pra ler dos dois lados da virada.
    this.clothPivot.position.set(0, 0.05, 0);
    this.torso.add(this.clothPivot);
    // Abas do tabardo. Elas são chapas no plano YZ, então quem entrega
    // largura na tela é o Z, não o X — 0.19 de Z rendia ~5px de faixa
    // vermelha de cada lado, e era por isso que a única área de matiz
    // quente do personagem não aparecia. Alargadas pra 0.30, cada aba
    // chega com ~8px e o vermelho vira COR, não pixel perdido.
    const panel = new THREE.BoxGeometry(0.03, 0.36, 0.30);
    this.clothPivot.add(place(new THREE.Mesh(panel, cloth), 0.155, -0.18, 0));
    this.clothPivot.add(place(new THREE.Mesh(panel, cloth), -0.155, -0.18, 0));
    // Pano apodrece antes do aço: a barra do tabardo é onde a praga
    // aparece primeiro, e cresce PRA CIMA a partir da ponta molhada.
    const hemRot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.24), this.matRot);
    this.clothPivot.add(place(hemRot, 0.158, -0.32, 0.02));

    // Espáldeiras. Regra herdada do 2D: o OMBRO é a parte mais larga do
    // personagem, mais largo que o elmo — senão a cabeça engole o corpo
    // e a silhueta vira retângulo. Elmo tem 0.235 de largura; o vão
    // ombro-a-ombro aqui é 0.62, ~2.6x.
    // 6×3 segmentos, não 8×5. Esticada 1.34 em X, a cúpula de 8×5 lia
    // como seixo liso — facetas de 2px viram gradiente e o ombro perdia a
    // quina justamente na peça que devia ser a mais dura do personagem.
    // Menos segmentos = plano de valor maior que o pixel.
    const domeGeo = new THREE.SphereGeometry(0.135, 6, 3, 0, TAU, 0, Math.PI * 0.55);
    const lameGeo = new THREE.CylinderGeometry(0.125, 0.1, 0.075, 8);
    for (const z of [DIM.armZ, -DIM.armZ]) {
      const dome = new THREE.Mesh(domeGeo, steel);
      // Achatada e esticada em X. O comentário antigo já dizia a regra
      // certa — "a projeção em X é que faz o ombro parecer pesado" — mas
      // o número não a cumpria. Medido na silhueta com scale.x 1.3: ombro
      // 26px contra cabeça 21px, razão 1.24, quando o arquivo inteiro foi
      // escrito supondo 2.6. A razão real vinha do vão em Z (0.62), e Z
      // não chega na tela. 1.34 é o teto útil: medido, 1.6 dava razão 1.6
      // mas na captura a espáldeira virava um disco claro que engolia a
      // couraça e o peito sumia — largura comprada com a leitura do
      // tronco não é lucro.
      dome.scale.set(1.34, 1.0, 1.05);
      // Recuada em X (-0.06, não -0.022). Esticada 1.34, a cúpula
      // avançava até x=0.159 e a frente da couraça está em 0.133: a
      // espáldeira cobria o PEITO e lia como peitoral, escondendo a
      // quilha e a fivela. Recuada, ela tampa o ombro, deixa a frente
      // livre pros dois acentos que moram lá, e ainda joga a massa pra
      // trás — o que lê como homem carregando peso, que é o personagem.
      this.torso.add(place(dome, -0.06, DIM.shoulderY + 0.005, z * 1.12));
      const lame = new THREE.Mesh(lameGeo, steelDark);
      lame.scale.set(1.3, 1, 1);
      this.torso.add(place(lame, -0.055, DIM.shoulderY - 0.072, z * 1.1));
    }

    // A corrosão ataca a ARESTA — é onde o metal fica exposto. E ataca
    // um ombro mais que o outro: assimetria é a regra de "carne" do
    // brief, e é o que separa "homem sendo consumido" de "textura de
    // ferrugem aplicada uniformemente".
    const blister = new THREE.SphereGeometry(0.055, 6, 4);
    const b1 = new THREE.Mesh(blister, this.matRot);
    b1.scale.set(0.8, 0.55, 1.15);
    this.torso.add(place(b1, -0.075, DIM.shoulderY + 0.015, DIM.armZ * 1.35));
    const b2 = new THREE.Mesh(blister, this.matRot);
    b2.scale.set(0.6, 0.45, 0.8);
    this.torso.add(place(b2, -0.1, DIM.shoulderY - 0.09, DIM.armZ * 1.2));

    // Gorjal: mais ESCURO e mais ESTREITO que a cabeça. Sem esse entalhe
    // cabeça e ombro colam num bloco só e o boneco perde o pescoço —
    // exatamente o erro que o renderizador 2D documenta ter cometido.
    const gorget = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.105, 0.08, 8), steelDark);
    gorget.scale.x = 0.85;
    this.torso.add(place(gorget, 0, DIM.neckY, 0));
  }

  private buildArms(
    steel: THREE.MeshStandardMaterial,
    steelDark: THREE.MeshStandardMaterial,
    leather: THREE.MeshStandardMaterial,
  ): void {
    const upperGeo = new THREE.CylinderGeometry(0.052, 0.045, DIM.upperArm, 6);
    const foreGeo = new THREE.CylinderGeometry(0.05, 0.04, DIM.foreArm, 6);
    const vambraceGeo = new THREE.BoxGeometry(0.095, 0.15, 0.095);
    const fistGeo = new THREE.BoxGeometry(0.085, 0.095, 0.09);

    const sides: Array<[THREE.Group, THREE.Group, number]> = [
      [this.shoulderA, this.elbowA, DIM.armZ],
      [this.shoulderB, this.elbowB, -DIM.armZ],
    ];

    for (const [shoulder, elbow, z] of sides) {
      shoulder.position.set(0, DIM.shoulderY, z);
      this.torso.add(shoulder);
      shoulder.add(place(new THREE.Mesh(upperGeo, leather), 0, -DIM.upperArm / 2, 0));
      shoulder.add(
        place(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.1), steelDark), 0, -0.05, 0),
      );

      elbow.position.y = -DIM.upperArm;
      shoulder.add(elbow);
      elbow.add(place(new THREE.Mesh(foreGeo, leather), 0, -DIM.foreArm / 2, 0));
      // Braçal: chapa no antebraço. Alarga o braço o suficiente pra a
      // oscilação da corrida ser visível — braço fino some a 12% de tela.
      elbow.add(place(new THREE.Mesh(vambraceGeo, steel), 0.012, -0.1, 0));
      elbow.add(place(new THREE.Mesh(fistGeo, steelDark), 0.02, -DIM.foreArm - 0.03, 0));
    }
  }

  private buildHead(
    steel: THREE.MeshStandardMaterial,
    steelDark: THREE.MeshStandardMaterial,
    gold: THREE.MeshStandardMaterial,
    hollow: THREE.MeshStandardMaterial,
  ): void {
    this.head.position.y = DIM.helmY;
    this.torso.add(this.head);

    // Bacinete. A escolha de forma é toda por silhueta: crânio em CONE
    // (ponta atrás e acima) mais viseira em BICO (ponta à frente e
    // abaixo) dão um perfil de losango que nenhum inimigo vai repetir.
    // Uma esfera na cabeça teria sido mais fácil e teria virado mancha.
    this.head.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.19, 0.235), steel), -0.005, 0.125, 0),
    );
    // Coroa CÔNICA, afinando até quase um ponto.
    //
    // Antes ela ia de 0.13 a 0.05 de raio em 0.135 de altura — um tronco
    // de cone que terminava numa tampa CHATA de 6px, e na silhueta medida
    // o alto da cabeça saía arredondado, sem ápice nenhum. O ápice é
    // metade do losango que este arquivo diz gastar.
    //
    // 0.022 de raio no topo resolve isso; a altura passou por um vai e
    // vem que vale registrar. 0.20 punha a cabeça inteira em 23px num
    // boneco de 101 — 4.4 cabeças, chibi — e na captura lia como capuz
    // pontudo, não elmo. 0.145 devolve ~5.1 cabeças e mantém a ponta,
    // que era o que interessava. Altura de coroa é orçamento de
    // PROPORÇÃO, não de detalhe.
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.128, 0.145, 6), steel);
    crown.scale.set(1.05, 1, 0.98);
    this.head.add(place(crown, -0.02, 0.288, 0));

    // Viseira em bico, e ela é ESCURA. Antes usava o mesmo `steel` do
    // crânio, então elmo e viseira eram um valor só e a cabeça media como
    // um bloco. O que faz um elmo ter forma a 20px de altura não é o
    // contorno: é a quebra de valor entre a calota clara (que recebe sol)
    // e a máscara escura (que fica na sombra própria). Baixada de y=0.115
    // pra 0.075 pra virar focinho, e não testa — o que abre espaço pra a
    // fresta existir ACIMA dela.
    const beak = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.105, 0.22, 4), steelDark);
    beak.rotation.z = -Math.PI / 2;
    beak.rotation.x = Math.PI / 4;
    const beakPivot = new THREE.Group();
    beakPivot.rotation.z = 0.14;
    beakPivot.add(place(beak, 0.115, 0, 0));
    beakPivot.position.set(0.05, 0.075, 0);
    this.head.add(beakPivot);

    // Fresta e brasa. A versão anterior punha as duas DENTRO do cone da
    // viseira — conferido contra a geometria: na estação x=0.145 o cone
    // tinha meia-altura 0.056 e a fresta estava em y=0.15, ou seja
    // enterrada. O único ponto emissivo do personagem não chegava na tela.
    // Agora ela mora na testa, acima do bico, e é uma faixa só em vez de
    // dois pontos de 1px: 0.055 em X mais 0.20 em Z projetam ~6px.
    this.head.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, 0.2), hollow), 0.1, 0.183, 0),
    );
    this.head.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.026, 0.17), this.matEye), 0.113, 0.183, 0),
    );
    // Aresta de ouro no supercílio, logo acima da fresta. Substitui o
    // pente que estava aqui — `BoxGeometry(0.012, …)` tinha 0.012 em X e
    // 0.24 em Z, ou seja guardava a informação toda no eixo que a câmera
    // esmaga: chegava com 0.7px de largura. Uma barra deitada em X entrega
    // os mesmos 10px de ouro no ponto pra onde o olho vai primeiro.
    this.head.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.235), gold), 0.077, 0.221, 0),
    );

    // A praga subiu do gorjal e está comendo a BASE do elmo, contra a
    // gravidade. Ancorada embaixo e crescendo pra cima: o brief pede
    // corrosão CRESCIDA, com ponto de contato, não overlay uniforme.
    // `creep2` saiu daqui: media 0.03 × 0.053, ou seja 1.8 × 3.1px, e
    // ficava encostada no `creep` — dois borrões de 2px na mesma quina não
    // leem como duas coisas, leem como serrilhado. Sobrou uma mancha só, e
    // ela cresceu pra ter área de verdade.
    const creep = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), this.matRot);
    creep.scale.set(1.0, 0.7, 1.3);
    this.head.add(place(creep, -0.085, 0.05, 0.02));

    // Nucal: a aba do elmo varrendo pra TRÁS na base do crânio, e é ela
    // que carrega a mola agora.
    //
    // No lugar das três aletas que estavam aqui. Elas mediam 6.8, 8 e
    // 3.5px e ficavam empilhadas no alto-atrás da cabeça — que é
    // exatamente o volume onde a maçaneta e a guarda da espada precisam
    // estar pra a espada ler. Duas famílias de detalhe pequeno brigando
    // pelo mesmo canto de 10px viram papa; o desempate é a favor da
    // espada, porque a espada é o objeto do título. Descendo a nucal pra
    // base do crânio ela ganha espaço livre, vira uma cunha só de ~12px, e
    // continua sendo o membro de movimento secundário do boneco.
    this.crest.position.set(-0.1, 0.045, 0);
    this.head.add(this.crest);
    const nape = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.075, 0.215), steelDark);
    nape.rotation.z = 0.42;
    this.crest.add(place(nape, -0.06, -0.02, 0));
    const napeRot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), this.matRot);
    napeRot.rotation.z = 0.42;
    this.crest.add(place(napeRot, -0.13, -0.05, 0.055));
  }

  private buildSword(
    steel: THREE.MeshStandardMaterial,
    steelDark: THREE.MeshStandardMaterial,
    steelRot: THREE.MeshStandardMaterial,
    leather: THREE.MeshStandardMaterial,
    gold: THREE.MeshStandardMaterial,
  ): void {
    // A ESPADA NAS COSTAS é o elemento de silhueta mais barato e mais
    // eficaz do personagem: uma diagonal longa cruzando uma massa
    // vertical. Ela estava sendo montada de lado, e esse é o defeito que
    // este bloco corrige.
    //
    // ## O plano da lâmina apontava pro lugar errado
    //
    // A lâmina era `BoxGeometry(0.026, 0.72, 0.078)`: 0.026 em X, 0.078
    // em Z. Como o personagem olha pra ±X e a câmera olha por -Z, o eixo
    // X é a LARGURA NA TELA e o Z é a PROFUNDIDADE. A espada estava
    // portanto três vezes mais grossa do que larga — de lado, o que
    // aparecia era o fio, 0.026·cos(θ) + 0.078·sin(θ) ≈ 0.05u, ou 2.7px.
    // A guarda tinha o mesmo erro invertido (0.07 em X contra 0.26 em Z):
    // a barra que identifica uma espada estava desenhada quase toda no
    // eixo que a projeção esmaga, e chegava na tela com 8px numa peça de
    // 15. A ponta, `scale.z = 0.55`, era a única peça montada no plano
    // certo — o que confirma que isto era engano de eixo, não escolha.
    //
    // Medido na silhueta do baseline: a espada saía como um traço vertical
    // de 2px com um "+" de 3px no topo. Lida como cajado, não como espada.
    //
    // Agora a lâmina é LARGA em X e FINA em Z: 0.089 de vão em X (em duas
    // faixas de valor, ver abaixo) contra 0.024 de espessura, o que
    // projeta ~0.09u ≈ 5.4px. A guarda tem 0.30 em X e chega com ~15px.
    //
    // ## E a diagonal precisa ser uma diagonal
    //
    // Inclinação era 0.3rad (17°). Com 1.09u entre maçaneta e ponta isso
    // dá 0.32u de corrida horizontal — perto demais da vertical pra o olho
    // chamar de diagonal. A 0.44rad (25°) a corrida vai a 0.46u ≈ 27px
    // contra 100px de altura do boneco: aí é diagonal.
    //
    // Geometria resultante, conferida: maçaneta em (-0.19, 1.55), guarda
    // cruzando de (-0.15, 1.29) a (-0.42, 1.42), ponta em (-0.66, 0.56).
    // O elmo termina em x=-0.13 e a espáldeira em x=-0.29: as três peças
    // que identificam a espada — maçaneta, guarda e ponta — caem TODAS
    // fora do contorno do corpo, que é a condição pra elas existirem
    // quando tudo estiver preto.
    this.sword.position.set(-0.417, 0.289, -0.075);
    this.sword.rotation.z = SWORD_TILT;
    this.sword.rotation.x = 0.1;
    this.torso.add(this.sword);

    // Lâmina em duas faixas de valor, não uma chapa só: o fio (à frente,
    // +X) claro e o dorso escuro. A 5px de largura isso é 3px claros e
    // 2px escuros — que é exatamente como pixel art diz "isto tem fio".
    this.sword.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.70, 0.024), steel), 0.016, -0.06, 0),
    );
    this.sword.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.70, 0.023), steelDark), -0.028, -0.06, 0),
    );
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.05, 0.16, 4), steel);
    tip.rotation.y = Math.PI / 4;
    tip.rotation.x = Math.PI;
    // Fina em Z pelo mesmo motivo que a lâmina: o que tem que aparecer é
    // a largura, e a largura mora em X.
    tip.scale.z = 0.4;
    this.sword.add(place(tip, 0, -0.49, 0));
    // Guarda: a peça que DIZ "espada". Longa em X, porque é X que chega
    // inteiro na tela. 0.30u de barra → ~15px atravessados na diagonal da
    // lâmina, num boneco de 100px.
    this.sword.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.055, 0.075), steel), 0, 0.315, 0),
    );
    // Quilhões pendentes nas duas pontas da guarda: transformam a barra
    // reta num "U" raso. Custa dois cubos e é o que separa cruzeta de
    // espada de cabo de martelo.
    for (const sx of [-0.135, 0.135]) {
      this.sword.add(
        place(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.07), steel), sx, 0.28, 0),
      );
    }
    this.sword.add(
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.15, 6), leather), 0, 0.405, 0),
    );
    this.sword.add(
      place(new THREE.Mesh(new THREE.SphereGeometry(0.052, 6, 5), gold), 0, 0.495, 0),
    );
    // A lâmina também está doente — o objeto do título não podia ser a
    // única superfície limpa da cena. Faixa fosca perto da guarda, onde
    // a mão encosta: contato é onde a praga pega.
    this.sword.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.15, 0.026), steelRot), 0, 0.2, 0),
    );
    this.sword.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.03), this.matRot), 0.028, 0.15, 0),
    );

    // Correia atravessando o peito: fecha o "por que a espada está
    // flutuando nas costas" e dá uma segunda diagonal, contrária à da
    // lâmina. Duas diagonais cruzadas leem como arreio. Engrossada de
    // 0.03 pra 0.055 pelo mesmo motivo da lâmina — 0.03 em X é 1.7px, e
    // 1.7px não é uma correia, é ruído.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.07), leather);
    strap.rotation.z = 0.42;
    strap.rotation.x = -0.15;
    this.torso.add(place(strap, 0.105, 0.27, 0.02));
    // Fivela da correia no peito, em ouro: um acento quente de ~3px no
    // ponto em que as duas diagonais se cruzam.
    this.torso.add(
      place(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.045), gold), 0.15, 0.2, 0.035),
    );
  }

  // ── Loop ────────────────────────────────────────────────────────────

  update(anim: HeroAnim, facing: 1 | -1, speed01: number, dtMs: number): void {
    const dt = dtMs;
    const dtSec = dt / 1000;
    this.timeMs += dt;

    const sp = clamp01(speed01);
    const airborne = anim === "jump" || anim === "fall";

    // Transição de estado.
    if (anim !== this.anim) {
      copyPose(this.from, this.cur);
      this.blendT = 0;
      // Dano e pouso entram no estalo; o resto entra suave. Cross-fade
      // longo num impacto transforma a pancada em carícia.
      this.blendDur = anim === "hurt" || anim === "land" ? T.blendSnapMs : T.blendMs;
      // Entrar em `run` vindo de parado começa o ciclo pouco antes do
      // contato, pra a primeira coisa visível ser um pé plantando e não
      // uma perna no meio do ar.
      if (anim === "run" && this.anim !== "run") this.step = 0.18;
      if (anim === "hurt") this.hurtMs = 0;
      this.stateMs = 0;
      this.anim = anim;
    } else {
      this.stateMs += dt;
    }

    // Impacto de aterrissagem. Duas portas pra mesma coisa: a transição
    // ar→chão detectada aqui, e o `land` explícito de quem chama. A
    // primeira existe porque o jogo 2D provou que a segunda sozinha não
    // dispara — o estado vira idle no mesmo quadro do contato.
    const landedNow = this.wasAir && !airborne;
    const askedLand = anim === "land" && this.stateMs === 0;
    if (landedNow || askedLand) {
      // Força do impacto vinda do TEMPO DE VOO: o contrato não expõe
      // velocidade vertical, e tempo de queda é o proxy honesto. Queda de
      // degrau e queda de torre não podem custar o mesmo agachamento.
      this.landPower = 0.34 + 0.66 * clamp01(this.airMs / T.airFullMs);
      this.landMs = 0;
      this.airMs = 0;
    }
    if (airborne) this.airMs += dt;
    else this.airMs = Math.max(0, this.airMs - dt * 2);
    this.wasAir = airborne;

    if (this.landMs >= 0) {
      this.landMs += dt;
      if (this.landMs > T.landMs + T.landMsHeavy) this.landMs = -1;
    }
    if (this.hurtMs >= 0) {
      this.hurtMs += dt;
      if (this.hurtMs > T.hurtMs) this.hurtMs = -1;
    }

    // Fase do passo. A CADÊNCIA varia com a velocidade junto com a
    // amplitude (ver `poseRun`): é isso que faz caminhada e corrida serem
    // animações diferentes, e não a mesma acelerada.
    if (anim === "run") this.step = (this.step + (1.35 + sp * 1.25) * dtSec) % 1;

    // Virada. `facingBlend` é contínuo, então a silhueta gira em ~125ms
    // em vez de trocar de lado num quadro.
    const rate = (2 / T.turnMs) * dt;
    const d = facing - this.facingBlend;
    this.facingBlend += Math.abs(d) <= rate ? d : Math.sign(d) * rate;
    const e = smooth((this.facingBlend + 1) * 0.5);
    // Interpolação escolhida pra a virada passar pelo PEITO virado à
    // câmera (θ = -π/2 no meio do caminho), nunca pelas costas. Girar
    // mostrando as costas some com o personagem por 4 quadros.
    this.turn.rotation.y = -Math.PI + T.cheat + e * (Math.PI - 2 * T.cheat);

    // Pose alvo do estado atual.
    switch (anim) {
      case "run":
        this.poseRun(this.tgt, sp);
        break;
      case "jump":
        this.poseJump(this.tgt);
        break;
      case "fall":
        this.poseFall(this.tgt);
        break;
      case "hurt":
        this.poseHurt(this.tgt);
        break;
      case "land":
      case "idle":
      default:
        // `land` NÃO tem pose própria de propósito: ele assenta em idle e
        // todo o peso vem da camada aditiva. Uma pose de agachamento
        // aqui somaria com o envelope e o guerreiro ficaria de cócoras.
        this.poseIdle(this.tgt);
        break;
    }

    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      lerpPose(this.cur, this.from, this.tgt, smooth(this.blendT));
    } else {
      copyPose(this.cur, this.tgt);
    }

    this.apply(this.cur, dtSec);
  }

  // ── Poses ───────────────────────────────────────────────────────────

  private poseIdle(p: Pose): void {
    const t = this.timeMs / 1000;
    const breath = Math.sin(TAU * t * 0.32);
    // Segunda frequência, incomensurável com a primeira: o idle nunca
    // fecha o loop exatamente e por isso não lê como GIF de 2 segundos.
    const drift = Math.sin(TAU * t * 0.1187);
    // Estremecimento da maldição. Pulso estreito (potência alta num seno
    // lento) ≈ um espasmo a cada ~13s. Determinístico, sem random. É a
    // única vez em que o corpo se move sozinho, e é o que planta a
    // dúvida de que ele também está apodrecendo.
    const shudder = Math.pow(Math.max(0, Math.sin(TAU * t * 0.077)), 24);

    p.root = breath * 0.006;
    p.sqY = 1 + breath * 0.009 + shudder * 0.012;
    p.sqX = 1 - breath * 0.007 - shudder * 0.01;
    p.lean = 0.055 + drift * 0.014 - shudder * 0.05;
    p.twist = drift * 0.03;
    p.pelvis = -drift * 0.02;
    p.headPitch = -0.02 + Math.sin(TAU * t * 0.32 - 0.5) * 0.02 - shudder * 0.12;

    // Postura em guarda, não em sentido: pernas ESCALONADAS e joelhos
    // desiguais. Duas pernas idênticas e retas leem como manequim, e a
    // assimetria é grátis na silhueta.
    p.hipA = 0.05;
    p.hipB = -0.07;
    p.kneeA = 0.1;
    p.kneeB = 0.14;
    p.ankleA = 0.02;
    p.ankleB = 0.0;

    p.shoA = 0.05 + breath * 0.03;
    p.shoB = -0.04 - breath * 0.025;
    p.elbA = 0.3;
    p.elbB = 0.24;

    p.crest = 0.1 + breath * 0.06;
    p.cloth = 0.03;
    p.lock = 1;
  }

  private poseRun(p: Pose, sp: number): void {
    const u = this.step;
    const w = u * TAU;

    // TUDO escala com `sp`. Amplitude do quadril quase triplica entre
    // andar e correr, o joelho abre 3x, o tronco inclina 5x. Reutilizar
    // uma curva só e acelerar o playback é o tell de amadorismo que o
    // brief chama pelo nome.
    const hipAmp = 0.24 + sp * 0.36;
    const kneeAmp = 0.34 + sp * 0.66;
    const kneeBase = 0.1 + sp * 0.07;
    const armAmp = 0.2 + sp * 0.38;
    const elbBase = 0.3 + sp * 0.9;
    const leanBase = 0.05 + sp * 0.22;
    const bobAmp = 0.02 + sp * 0.055;

    // CONTATO / PASSAGEM. Contato em u=0.25 e 0.75 (quadris na abertura
    // máxima); ponto mais baixo do corpo logo depois, em u=0.35 e 0.85;
    // voo entre eles. `lift` é a altura normalizada.
    const raw = (1 - Math.cos((u - 0.35) * 2 * TAU)) * 0.5;
    // Expoente <1 faz o corpo despencar rápido no contato e subir devagar
    // no voo. Um cosseno puro é simétrico e corrida simétrica flutua.
    const lift = Math.pow(raw, 0.62);
    const plant = Math.pow(1 - lift, 2.1);

    const swingA = Math.max(0, Math.cos(w));
    const swingB = Math.max(0, -Math.cos(w));
    const stanceA = Math.max(0, -Math.cos(w));
    const stanceB = Math.max(0, Math.cos(w));

    p.hipA = hipAmp * Math.sin(w);
    p.hipB = -hipAmp * Math.sin(w);
    // Joelho fecha no BALANÇO (pé passa longe do chão) e leva um extra de
    // flexão no APOIO durante a compressão. É a flexão de apoio que faz
    // o quadril baixar de verdade, via `legReach` — o bob não é um
    // deslocamento inventado, é consequência da perna dobrando.
    p.kneeA = kneeBase + Math.pow(swingA, 0.8) * kneeAmp + plant * stanceA * (0.2 + sp * 0.34);
    p.kneeB = kneeBase + Math.pow(swingB, 0.8) * kneeAmp + plant * stanceB * (0.2 + sp * 0.34);
    // Tornozelo: dorsiflexão no balanço (bico sobe pra não raspar) e
    // extensão no impulso. Some quase por completo a distância, mas o pé
    // rígido é visível como "patinando" mesmo pequeno.
    p.ankleA = 0.16 * Math.cos(w - 0.55) * (0.4 + sp * 0.6);
    p.ankleB = -0.16 * Math.cos(w - 0.55) * (0.4 + sp * 0.6);

    p.root = lift * bobAmp;
    p.lean = leanBase - plant * 0.045;
    // Cintura e ombro contra-rotacionam. Em quase-perfil isso é sutil,
    // mas é o que impede o tronco de virar uma caixa rígida sobre pernas
    // que se mexem.
    p.pelvis = 0.1 * sp * Math.sin(w);
    p.twist = -0.15 * sp * Math.sin(w);
    // Cabeça compensa parte da inclinação: o guerreiro olha pra frente,
    // não pro chão.
    p.headPitch = -p.lean * 0.55 - plant * 0.05;

    p.sqX = 1 + plant * (0.03 + sp * 0.055) - lift * (0.01 + sp * 0.022);
    p.sqY = 1 - plant * (0.028 + sp * 0.05) + lift * (0.01 + sp * 0.022);

    p.shoA = -armAmp * Math.sin(w);
    p.shoB = armAmp * Math.sin(w);
    p.elbA = elbBase + Math.max(0, -Math.sin(w)) * 0.35;
    p.elbB = elbBase + Math.max(0, Math.sin(w)) * 0.35;

    p.crest = 0.25 + lift * 0.5 + leanBase * 0.5;
    p.cloth = -0.12 - sp * 0.42;
    // Solta a trava do chão no voo: com os dois pés no ar não há perna de
    // apoio pra ancorar, e manter a trava esmagaria o salto do ciclo.
    p.lock = Math.pow(1 - lift, 0.7);
  }

  private poseJump(p: Pose): void {
    // Estico na subida. O envelope curto de decolagem existe porque um
    // pulo que já nasce na pose de ápice não tem impulso — a perna
    // precisa ser vista terminando de estender.
    const kick = Math.max(0, 1 - this.stateMs / 170);
    const t = 1 - kick;

    p.root = 0.01 + t * 0.025;
    p.sqX = 0.965 - t * 0.03 - kick * 0.02;
    p.sqY = 1.03 + t * 0.05 + kick * 0.02;
    p.lean = 0.11 - kick * 0.05;
    p.twist = 0.04;
    p.pelvis = -0.03;
    p.headPitch = -0.14;

    // Perna da frente recolhe (joelho sobe), a de trás fica pra trás
    // terminando o impulso. Duas pernas simétricas no ar leem como salto
    // de sapo.
    p.hipA = 0.15 + t * 0.48;
    p.hipB = -0.42 + t * 0.1;
    p.kneeA = 0.3 + t * 0.85;
    p.kneeB = 0.25 + t * 0.5;
    p.ankleA = -0.1 - t * 0.1;
    p.ankleB = -0.28 + t * 0.12;

    p.shoA = -0.35 - t * 0.3;
    p.shoB = -0.2 - t * 0.25;
    p.elbA = 0.5 + t * 0.3;
    p.elbB = 0.4 + t * 0.2;

    p.crest = -0.5 - t * 0.25;
    p.cloth = -0.55;
    p.lock = 0;
  }

  private poseFall(p: Pose): void {
    // Antecipação do chão: quanto mais tempo caindo, mais a perna estende
    // e abre pra receber. É a pose que faz o `land` ter pra onde ir — sem
    // ela a compressão vem do nada.
    const reach = clamp01(this.stateMs / 320);

    p.root = -0.005;
    p.sqX = 0.985 - reach * 0.02;
    p.sqY = 1.015 + reach * 0.03;
    p.lean = -0.05 + reach * 0.09;
    p.twist = -0.05;
    p.pelvis = 0.03;
    p.headPitch = 0.1 + reach * 0.06;

    p.hipA = 0.34 - reach * 0.1;
    p.hipB = -0.24 + reach * 0.06;
    p.kneeA = 0.55 - reach * 0.28;
    p.kneeB = 0.62 - reach * 0.3;
    p.ankleA = -0.14 + reach * 0.24;
    p.ankleB = -0.1 + reach * 0.2;

    p.shoA = 0.3 + reach * 0.18;
    p.shoB = -0.5 - reach * 0.2;
    p.elbA = 0.75;
    p.elbB = 0.6;

    p.crest = 0.65 + reach * 0.25;
    p.cloth = 0.5 + reach * 0.2;
    p.lock = 0;
  }

  private poseHurt(p: Pose): void {
    const u = clamp01((this.hurtMs < 0 ? T.hurtMs : this.hurtMs) / T.hurtMs);
    // Estala pra fora e volta assentando.
    const recoil = Math.sin(Math.min(1, u * 1.7) * Math.PI);
    // O primeiro quadro ESMAGA; o corpo só estica depois, ao ser jogado
    // pra trás. Sem esses dois tempos o dano lê como um deslize lateral.
    const imp = Math.max(0, 1 - u * 5);

    p.root = -0.03 * recoil;
    p.sqX = 1 + imp * 0.14 - recoil * 0.05;
    p.sqY = 1 - imp * 0.13 + recoil * 0.05;
    p.lean = -0.34 * recoil;
    p.twist = -0.22 * recoil;
    p.pelvis = 0.1 * recoil;
    p.headPitch = -0.42 * recoil;

    p.hipA = 0.3 * recoil + 0.05;
    p.hipB = -0.34 * recoil - 0.05;
    p.kneeA = 0.16 + 0.4 * recoil;
    p.kneeB = 0.2 + 0.34 * recoil;
    p.ankleA = 0.06 * recoil;
    p.ankleB = -0.12 * recoil;

    p.shoA = 0.45 * recoil;
    p.shoB = -0.5 * recoil;
    p.elbA = 0.35 + 0.5 * recoil;
    p.elbB = 0.3 + 0.4 * recoil;

    p.crest = 0.95 * recoil - imp * 0.35;
    p.cloth = 0.7 * recoil;
    // Trava parcial: cambaleia, mas o pé continua no chão.
    p.lock = 0.75;
  }

  // ── Aplicação ───────────────────────────────────────────────────────

  private apply(base: Pose, dtSec: number): void {
    const p = this.out;
    copyPose(p, base);

    // ── Camada aditiva de aterrissagem ────────────────────────────────
    // A parte do módulo que mais separa "personagem com peso" de "boneco
    // flutuando": compressão instantânea no contato, recuperação, e um
    // OVERSHOOT que passa do neutro antes de assentar. O overshoot é o
    // que faz o corpo parecer massa em vez de mola perfeita.
    if (this.landMs >= 0) {
      const dur = T.landMs + T.landMsHeavy * this.landPower;
      const u = clamp01(this.landMs / dur);
      const k = this.landPower;
      const comp = Math.pow(Math.max(0, 1 - u / 0.56), 1.35);
      const over = u > 0.5 ? Math.sin(((u - 0.5) / 0.5) * Math.PI) : 0;
      // Cabeça e crista rodam o MESMO envelope 45ms atrasado. Follow
      // through de graça: o corpo já parou e a cabeça ainda desce.
      const uL = clamp01((this.landMs - 45) / dur);
      const compL = Math.pow(Math.max(0, 1 - uL / 0.56), 1.35);
      const overL = uL > 0.5 ? Math.sin(((uL - 0.5) / 0.5) * Math.PI) : 0;

      // Quadril flexiona e o joelho flexiona o DOBRO: mantém a canela
      // espelhando a coxa, e com isso o pé não escapa pra frente do
      // corpo no agachamento. A altura do quadril cai sozinha, calculada
      // por `legReach` mais abaixo.
      const hipDrop = 0.72 * comp * k;
      p.hipA += hipDrop * 1.1;
      p.hipB += hipDrop * 0.82;
      p.kneeA += hipDrop * 2.15;
      p.kneeB += hipDrop * 1.75;
      p.ankleA += 0.3 * comp * k;
      p.ankleB += 0.22 * comp * k;

      p.sqX += (0.2 * comp - 0.055 * over) * k;
      p.sqY += (-0.18 * comp + 0.06 * over) * k;
      p.root += -0.02 * comp * k + 0.045 * over * k;
      p.lean += (0.34 * comp - 0.09 * over) * k;
      p.twist += 0.1 * comp * k;
      p.headPitch += (0.3 * compL - 0.14 * overL) * k;
      p.shoA += (-0.55 * comp + 0.12 * over) * k;
      p.shoB += (-0.4 * comp + 0.1 * over) * k;
      p.elbA += 0.5 * comp * k;
      p.elbB += 0.42 * comp * k;
      p.crest += (1.15 * compL - 0.45 * overL) * k;
      p.cloth += (0.8 * compL - 0.3 * overL) * k;
      p.lock = Math.max(p.lock, clamp01(comp * 1.6));
    }

    // ── Esqueleto ─────────────────────────────────────────────────────
    // Convenção única: rotação em Z no sentido anti-horário visto de +Z.
    // Membro aponta pra baixo, então +Z leva a ponta pra FRENTE; o tronco
    // aponta pra cima, então inclinar pra frente pede -Z. Flexão de
    // joelho e cotovelo levam a extremidade pra TRÁS, logo entram
    // negadas.
    this.thighA.rotation.z = p.hipA;
    this.thighB.rotation.z = p.hipB;
    this.kneeA.rotation.z = -p.kneeA;
    this.kneeB.rotation.z = -p.kneeB;
    this.ankleA.rotation.z = p.ankleA;
    this.ankleB.rotation.z = p.ankleB;

    this.shoulderA.rotation.z = p.shoA;
    this.shoulderB.rotation.z = p.shoB;
    this.elbowA.rotation.z = -p.elbA;
    this.elbowB.rotation.z = -p.elbB;

    this.torso.rotation.z = -p.lean;
    this.torso.rotation.y = p.twist;
    this.hip.rotation.y = p.pelvis;
    this.head.rotation.z = -p.headPitch;

    // ── Trava de chão ─────────────────────────────────────────────────
    // A altura do quadril não é escolhida, é DERIVADA: a perna que
    // alcança mais fundo define onde o quadril tem que estar pra a sola
    // parar exatamente em y=0. Sem isso, todo agachamento fundo enterra
    // o pé e o contrato "pés na origem" só vale em repouso.
    const reach = Math.max(
      legReach(p.hipA, p.kneeA),
      legReach(p.hipB, p.kneeB),
    );
    const lock = (reach - DIM.hipY) * clamp01(p.lock);
    this.hip.position.y = DIM.hipY + lock + p.root;

    // Esmaga/estica com pivô nos pés: a escala mora no grupo em y=0, por
    // isso a sola não sobe quando o corpo comprime. Simétrica em X e Z
    // pra o volume não mudar com a virada.
    this.squash.scale.set(p.sqX, p.sqY, p.sqX);

    // ── Secundário ────────────────────────────────────────────────────
    this.crest.rotation.z = this.springCrest.step(p.crest, dtSec);
    this.clothPivot.rotation.z = this.springCloth.step(p.cloth, dtSec);
    // Espada presa por correia: quase não se mexe, e é essa rigidez que
    // faz a crista e o tabardo parecerem soltos por contraste.
    this.sword.rotation.z = SWORD_TILT - this.springCloth.value * 0.1;

    // ── A praga respira ───────────────────────────────────────────────
    // Frequência propositalmente diferente da respiração do corpo
    // (0.19Hz contra 0.32Hz): homem e doença fora de sincronia. Nunca
    // batem, e é isso que deixa desconfortável sem virar efeito.
    const pulse = 0.5 + 0.5 * Math.sin(TAU * (this.timeMs / 1000) * 0.19);
    const flare = this.hurtMs >= 0 ? Math.max(0, 1 - this.hurtMs / 220) : 0;
    this.matRot.emissiveIntensity = 0.08 + pulse * 0.13 + flare * 0.55;
    this.matEye.emissiveIntensity = 0.55 + pulse * 0.45 + flare * 2.4;
  }

  /** Libera geometrias e materiais. Não faz parte do contrato; existe
   *  pra troca de fase não vazar buffers de GPU. */
  dispose(): void {
    const seen = new Set<THREE.BufferGeometry | THREE.Material>();
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        if (seen.has(mm)) continue;
        seen.add(mm);
        mm.dispose();
      }
    });
  }
}

export default Hero;
