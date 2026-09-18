/**
 * Luz e atmosfera. Mundo 1 — dia encoberto sobre uma vila abandonada.
 *
 * ## O defeito que este arquivo existe pra corrigir
 *
 * A versão anterior media assim (960×540, HUD descontado):
 *
 *     max 190.6      preto real (<40) 0.1%      ALTA (>215) 0.0%
 *     moda L=191 com 42.1% dos pixels
 *     faixas topo/meio/base 165.8 / 101.7 / 162.3
 *
 * Três achados, todos estruturais:
 *
 * 1. **Não havia alta nenhuma.** O pixel mais claro da cena inteira era
 *    191. Uma imagem sem alta não tem para onde o olho ir.
 * 2. **42% do quadro era UM valor exato** — o céu `THREE.Color` sólido.
 *    Campo chapado não é fundo, é buraco.
 * 3. **A base do quadro era mais CLARA que o meio** (162 contra 102): o
 *    palco acabava em y=-4 e abaixo dele reaparecia céu pálido. Num
 *    plataforma isso é o pior lugar possível pra pôr o valor mais alto.
 *
 * ## A estrutura de valor que substitui aquilo
 *
 * Preto real + massa de tom médio + alta pequena — o mesmo contrato que o
 * jogo 2D mediu, e ele vale igual aqui. Cada camada tem um dono:
 *
 *     alta (>215)   topo dos blocos — a SUPERFÍCIE ONDE SE PISA
 *     claro         faixa estreita de clarão no horizonte
 *     médio         face frontal em alvenaria; silhuetas da vila
 *     escuro        colinas distantes descendo
 *     preto real    terra sob o palco, e a sombra projetada
 *
 * A decisão que amarra tudo: **a alta mora no plano de jogo, não no céu.**
 * Num plataforma o palco tem que ganhar a atenção, e o jeito de garantir
 * isso não é escurecer o fundo até virar breu — é fazer o pixel mais claro
 * do quadro ser exatamente o lugar onde o jogador pode pisar. O céu, que
 * antes era o campo mais claro da imagem, agora é tom médio em gradiente.
 *
 * ## Custo
 *
 * A Fase 0 (`3d/PHASE0.md`) mediu 19.7ms de compilação de shader num
 * quadro. Por isso o orçamento aqui é explícito:
 *
 * - **Um único mapa de sombra**, igual a antes (2048², direcional). É o
 *   item caro e ele NÃO cresceu.
 * - Uma segunda direcional **sem sombra**. Custa um termo a mais no laço
 *   de iluminação do fragment shader e zero passe extra de render; a
 *   contagem de luzes muda 1→2 uma única vez, então é uma variante de
 *   shader, não uma por material.
 * - Céu: um domo com `ShaderMaterial`, 1 draw call, sem textura.
 * - Fundo: 4 draw calls de `MeshBasicMaterial` com cor por vértice — a
 *   névoa das silhuetas é assada no vértice, então não há shader novo.
 */
import * as THREE from "three";
import type { AtmosphereRig } from "../contracts";
import { hash2 } from "../engine/rng";

// ── Paleta ────────────────────────────────────────────────────────────
//
// Os valores foram escolhidos INVERTENDO a resposta do pipeline (ACES a
// 1.05 de exposição + codificação sRGB, ambos fixados no `main.ts`), não
// no olho: cada constante mira uma luminância de saída conhecida. Trocar o
// tone mapping lá invalida esta calibragem — é o acoplamento a vigiar.

/** Alto do céu, fora do quadro. Frio e fechado: nuvem grossa vista de baixo. */
const ZENITH = 0x2f3a45;
/** Céu no topo do quadro. Mais frio e MAIS ESCURO que o horizonte. */
const SKY_HIGH = 0x5c6b78;
/** Horizonte: pálido e morno. É o valor mais alto do céu, e é uma faixa. */
const SKY_HORIZON = 0xb3a992;
/** Clarão do sol velado. Aditivo, quente, estreito. */
const GLOW = 0xffdfae;
/** Terra logo abaixo da linha do horizonte. */
const EARTH = 0x2c2d22;
/** Fundo do quadro. O preto real da imagem. */
const EARTH_DEEP = 0x090b07;

/**
 * Névoa de CENA, e ela é de valor MÉDIO de propósito.
 *
 * A tentação é usar a cor do horizonte, como manda o manual de névoa que
 * some no céu. Aqui isso estaria errado: nada do palco recua até o
 * horizonte — a fase é uma faixa lateral a 15-21u da câmera o tempo todo.
 * O trabalho da névoa aqui é COMPRIMIR a faixa de valor da geometria que
 * está mais longe (as bordas do quadro, que ficam ~26% mais distantes que
 * o centro). Névoa clara só sabe levantar preto; névoa média levanta o
 * escuro E baixa o claro, que é o que perspectiva atmosférica faz de
 * verdade.
 */
const SCENE_HAZE = 0x4b5347;

/** Cor pra onde as silhuetas distantes se dissolvem. */
const BACKDROP_HAZE = 0x8d8f78;
/** Cor da matéria das silhuetas antes da névoa. Escura: é silhueta. */
const BACKDROP_INK = 0x191d16;

// ── Luz ───────────────────────────────────────────────────────────────

/** Sol velado: pálido e quente, mas ainda com direção. */
const SUN_COLOR = 0xf5ecd2;
/**
 * Alta. Este número é o que põe o topo dos blocos acima de 215 — é a ALTA
 * da imagem inteira, e ela é pequena porque a face de cima é uma fatia
 * fina nesta câmera (~9° de inclinação).
 */
// 2.5, nao 5.6. Com 5.6 a pedra — autorada corretamente num cinza medio
// (0x767c6f em materials.ts) — chegava na tela quase branca, e o palco
// virava a coisa MAIS clara do quadro, mais que o ceu. Verificado em
// captura. Num plataforma o palco tem que ganhar a atencao, mas por
// nitidez e contraste, nao por estourar em branco.
const SUN_INTENSITY = 2.5;
/**
 * Preenchimento frio, VINDO DA CÂMERA. Sem sombra.
 *
 * Existe por uma razão de leitura, não de realismo: com o sol quase a
 * pino, a face FRONTAL — que é ~6x maior que o topo nesta câmera e é onde
 * mora a arte de alvenaria — receberia quase nada e o palco viraria uma
 * massa preta com um fio claro em cima. Esta luz devolve valor à frente e,
 * sendo FRIA contra um sol quente, separa "parede" de "onde se pisa"
 * também por temperatura, não só por valor.
 */
const FILL_COLOR = 0x9db2c4;
const FILL_INTENSITY = 0.85;

/** Céu como fonte: frio por cima. */
const HEMI_SKY = 0x7d8e9b;
/** Rebote do solo: terroso e ESCURO. Rebote claro apaga a sombra projetada. */
const HEMI_GROUND = 0x3a3a2c;
/**
 * O que sobra numa superfície de topo quando a sombra do sol cai nela.
 * Sozinho, define o contraste da sombra: alto demais e a sombra some,
 * baixo demais e ela vira buraco recortado num dia que deveria ser
 * encoberto.
 */
const HEMI_INTENSITY = 0.95;

/**
 * Extensão da caixa de sombra, em unidades. 30 cobre confortavelmente a
 * largura visível (a câmera a 17u de distância com fov 44 enxerga ~26u) e
 * a altura dos telhados, sem gastar resolução em pedaço de mapa que
 * ninguém está vendo.
 */
const SHADOW_EXTENT = 30;

/**
 * Raio do domo de céu.
 *
 * O gradiente é função da DIREÇÃO do raio câmera→fragmento, então a
 * posição do domo não desloca o horizonte — ela só precisa garantir duas
 * coisas: cobrir a tela inteira e caber entre `near` e `far` da câmera
 * (0.1 e 400). 180 deixa o ponto mais próximo do domo a ~163u, bem atrás
 * da camada de fundo mais distante (~75u).
 */
const SKY_RADIUS = 180;

export class Atmosphere implements AtmosphereRig {
  private readonly sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  private readonly fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
  private readonly hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY);
  private readonly rim = new THREE.DirectionalLight(0xcfe0ff, 1.9);
  private readonly target = new THREE.Object3D();
  private readonly fillTarget = new THREE.Object3D();
  private readonly sky = buildSkyDome();

  install(scene: THREE.Scene): void {
    // Só aparece se o domo falhar. Escuro de propósito: uma falha que
    // deixa buraco preto é diagnosticável; uma que deixa buraco pálido se
    // confunde com céu e passa despercebida.
    scene.background = new THREE.Color(EARTH_DEEP);
    scene.fog = new THREE.Fog(SCENE_HAZE, 15, 105);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -SHADOW_EXTENT;
    c.right = SHADOW_EXTENT;
    c.top = SHADOW_EXTENT;
    c.bottom = -SHADOW_EXTENT;
    c.near = 1;
    c.far = 120;
    // Bias negativo pequeno: sem ele a sombra "descola" do pé e o
    // personagem parece pairar; grande demais e ela vaza pela geometria.
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;

    this.sun.target = this.target;
    this.fill.target = this.fillTarget;
    scene.add(this.sun, this.target, this.fill, this.fillTarget, this.hemi, this.sky);
  }

  update(): void {
    // Luz estável de propósito: dia encoberto não cintila, e luz que pulsa
    // sem motivo é a primeira coisa que denuncia efeito por efeito. O
    // gancho do quadro fica disponível pra quando houver algo com motivo —
    // o Rot pulsando, uma nuvem passando na fase que pedir.
  }

  followShadow(x: number, y: number): void {
    // O sol vem de cima e da esquerda, à frente do palco. A inclinação é
    // FORTE (~61° de elevação) por dois motivos que se somam: é assim que
    // luz de dia encoberto se comporta — o céu inteiro é a fonte, então o
    // que aponta pra cima recebe quase tudo — e é o que faz a superfície
    // de pisar ser a mais clara do quadro. A componente horizontal que
    // sobra existe pra sombra sair de baixo do personagem e ser vista.
    this.target.position.set(x, y, 0);
    this.sun.position.set(x - 14, y + 40, 16);
    this.sun.shadow.camera.updateProjectionMatrix();

    // Preenchimento vindo de onde a câmera está, um pouco à direita: é a
    // face frontal que ele tem que acender, e cruzar a direção do sol
    // impede que sol e preenchimento somem no mesmo lugar e chapem.
    this.fillTarget.position.set(x, y, 0);
    this.fill.position.set(x + 9, y + 5, 30);

    // O domo acompanha o jogador só pra continuar cobrindo a tela; o
    // gradiente não se mexe com isso porque é calculado a partir da
    // direção do raio de visão, não da posição do vértice no mundo.
    this.sky.position.set(x, y, 0);
  }
}

/**
 * Céu em gradiente, gerado no shader. Sem textura, sem HDRI.
 *
 * Um `THREE.Color` sólido custa o mesmo que isto e entrega 42% do quadro
 * num valor único. O gradiente resolve metade do problema de chapado de
 * graça, e a metade que importa: ele dá ao céu uma DIREÇÃO (mais escuro e
 * frio em cima, pálido e morno embaixo), que é o que faz o horizonte
 * existir sem desenhar nada.
 */
function buildSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    // Não escreve profundidade e desenha primeiro: o domo nunca disputa
    // com a geometria, só preenche o que sobrou.
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(ZENITH) },
      uHigh: { value: new THREE.Color(SKY_HIGH) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uEarth: { value: new THREE.Color(EARTH) },
      uDeep: { value: new THREE.Color(EARTH_DEEP) },
      uGlow: { value: new THREE.Color(GLOW) },
      uGlowAmt: { value: 0.42 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vRay;
      void main() {
        // Direção do raio de visão, não posição no mundo: é isso que faz o
        // horizonte ficar parado enquanto o domo viaja com o jogador.
        vRay = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHigh;
      uniform vec3 uHorizon;
      uniform vec3 uEarth;
      uniform vec3 uDeep;
      uniform vec3 uGlow;
      uniform float uGlowAmt;
      varying vec3 vRay;

      void main() {
        vec3 d = normalize(vRay);
        float e = d.y;

        // Esta câmera só enxerga de -33° a +11° de elevação. Toda a
        // variação de valor do céu tem que caber nos primeiros ~15°, senão
        // o gradiente existe no papel e o quadro continua chapado.
        vec3 col = mix(uHorizon, uHigh, smoothstep(0.0, 0.26, e));
        col = mix(col, uZenith, smoothstep(0.22, 0.90, e));

        // Abaixo do horizonte não há céu: há terra em névoa. É daqui que
        // sai o preto real, e é isso que ancora o palco — antes, o pé do
        // quadro era a região MAIS CLARA da imagem.
        vec3 below = mix(uHorizon, uEarth, smoothstep(0.0, 0.15, -e));
        below = mix(below, uDeep, smoothstep(0.09, 0.52, -e));
        col = mix(col, below, step(e, 0.0));

        // O clarão é o sol tentando furar o encoberto, do mesmo lado de
        // onde vem a luz principal. Sem disco — encoberto não tem disco — e
        // preso numa faixa estreita acima do horizonte: alta espalhada
        // vira outro campo pálido, que é o defeito que se está corrigindo.
        float band = exp(-pow(max(e, 0.0) / 0.085, 2.0));
        float azim = smoothstep(0.0, 0.85, -d.x);
        col += uGlow * (uGlowAmt * band * azim);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), mat);
  mesh.renderOrder = -1;
  // A câmera está DENTRO do domo, então a esfera envolvente sempre
  // intersecta o frustum; desligar o teste evita pagar por essa conta e
  // evita qualquer chance de sumiço quando o domo se move.
  mesh.frustumCulled = false;
  mesh.name = "sky";
  return mesh;
}

// ── Fundo ─────────────────────────────────────────────────────────────

/** Profundidade em Z das camadas do fundo, da mais próxima à mais distante. */
const HILL_Z = -16;
const LAYERS = [
  { z: -22, step: 9.5, hMin: 3.0, hMax: 6.4, depth: 0.62, seed: 11 },
  { z: -38, step: 12, hMin: 4.0, hMax: 8.4, depth: 1.15, seed: 37 },
  { z: -58, step: 15, hMin: 5.2, hMax: 11.0, depth: 1.95, seed: 73 },
] as const;

/** Teto de névoa. Silhueta que dissolve 100% deixa de ser silhueta. */
const HAZE_MAX = 0.84;

/**
 * Fração de névoa num ponto do fundo.
 *
 * Duas variáveis, e a segunda é a que faz a diferença: a névoa é mais
 * densa PERTO DO CHÃO. Por isso a BASE de uma construção distante apaga
 * antes do telhado, e é esse degrau vertical dentro de cada silhueta que
 * faz o horizonte ler como ar com corpo em vez de recorte de papel — que
 * era exatamente como a versão anterior lia.
 *
 * A curva é exponencial (Beer-Lambert), não linear: névoa linear tem um
 * começo e um fim visíveis, e o olho acha os dois.
 */
function haze(depth: number, worldY: number): number {
  // A dependencia de ALTURA foi reduzida (era 0.62 de peso, agora 0.18).
  //
  // Ela existia como nevoa de chao — mais densa embaixo — e e fisicamente
  // razoavel, mas estava produzindo o defeito. Medido com
  // `3d/harness/layers.mjs` nos quatro trechos da fase: em x=126, onde o
  // guerreiro corre pelos TELHADOS, o fundo saltava pra 37% da tela com
  // sd 0.180, contra 22-25% e sd ~0.05 no resto, e a razao palco/fundo
  // despencava de 4.39 pra 1.35.
  //
  // A causa: casa alta recebia POUCA nevoa justamente quando o jogador
  // esta no alto e ve mais fundo. Perspectiva atmosferica de verdade
  // depende sobretudo de DISTANCIA; deixar a altura mandar tanto fazia o
  // cenario recuperar contraste no pior momento possivel.
  const low = 1 - Math.min(1, Math.max(0, (worldY + 4) / 15));
  // 1.05 e nao 0.62: verificado em captura, as casas do fundo chegavam na
  // tela com contraste parelho ao do palco e a imagem virava uma sopa em
  // que nao se distinguia plataforma de cenario. Num plataforma o plano de
  // acao TEM que ganhar a atencao — foi a conclusao da review r12 do jogo
  // 2D e vale identica aqui.
  const dens = depth * (1.15 + 0.18 * low);
  return Math.min(HAZE_MAX, 1 - Math.exp(-dens));
}

/**
 * Perfil das colinas distantes. Duas oitavas: a longa dá a forma da terra,
 * a curta tira a leitura de "onda", que é o que uma oitava só sempre dá.
 */
function hillTop(x: number): number {
  const fade = (t: number) => t * t * (3 - 2 * t);
  const octave = (period: number, seed: number) => {
    const i = Math.floor(x / period);
    const t = fade(x / period - i);
    const a = hash2(i, seed);
    return a + (hash2(i + 1, seed) - a) * t;
  };
  return -1.6 + octave(27, 91) * 3.9 + octave(9, 57) * 1.2;
}

/**
 * Fundo: a vila que ficou pra trás, e a terra em que ela está.
 *
 * Não é decoração — é o que impede o céu de ser um vazio pálido ocupando
 * metade do quadro, e é lore visível: MUNDO 1 é uma vila ABANDONADA, e um
 * horizonte sem uma única construção contradiz isso.
 *
 * Quatro planos, cada um com um trabalho:
 *
 *     z=-16  colinas — massa de valor que desce até o PRETO REAL e tapa o
 *            vazio sob o palco. A versão anterior não tinha isto e o pé do
 *            quadro era céu pálido.
 *     z=-22  vila próxima — a mais escura e a de silhueta MAIOR na tela
 *     z=-38  vila média
 *     z=-58  vila distante — quase dissolvida
 *
 * O tamanho APARENTE cai com a distância (0.16, 0.15, 0.14 de radiano no
 * telhado mais alto de cada camada). Parece óbvio e não era: na versão
 * anterior a camada distante era desenhada tão maior que compensava a
 * perspectiva e aparecia MAIOR que a próxima — o que inverte a pista de
 * profundidade e transforma o horizonte em fileira de monumentos.
 */
export function buildBackdrop(spanX: number): THREE.Group {
  const g = new THREE.Group();
  g.add(buildHills(spanX));
  for (const L of LAYERS) g.add(buildTown(spanX, L));
  return g;
}

/** Acumulador de triângulos com cor por vértice. */
class Mass {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  private readonly ink = new THREE.Color(BACKDROP_INK);
  private readonly fog = new THREE.Color(BACKDROP_HAZE);
  private readonly tmp = new THREE.Color();

  /** Cor de um vértice já com a névoa assada. */
  private tint(depth: number, y: number): THREE.Color {
    return this.tmp.copy(this.ink).lerp(this.fog, haze(depth, y));
  }

  vert(x: number, y: number, z: number, depth: number): void {
    const c = this.tint(depth, y);
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
  }

  /** Quad em ordem antihorária vista de +Z. */
  quad(x0: number, y0: number, x1: number, y1: number, z: number, depth: number): void {
    this.vert(x0, y0, z, depth);
    this.vert(x1, y0, z, depth);
    this.vert(x1, y1, z, depth);
    this.vert(x0, y0, z, depth);
    this.vert(x1, y1, z, depth);
    this.vert(x0, y1, z, depth);
  }

  mesh(name: string): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    // Sem sombra e sem luz: silhueta distante tem que ser massa de valor
    // ESTÁVEL. Iluminá-la faria a névoa que já está assada no vértice
    // brigar com a luz da cena, e o fundo cintilaria quando o sol se move
    // junto com o jogador.
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.name = name;
    return m;
  }
}

/**
 * Colinas: uma faixa de terra que desce do horizonte até o pé do quadro.
 *
 * Faz três trabalhos ao mesmo tempo, e é o item de maior retorno do
 * arquivo: tapa o céu que aparecia POR BAIXO do palco (o defeito de faixa
 * invertida), enche os vãos entre as casas com massa em vez de céu, e é
 * onde o preto real da imagem realmente mora.
 *
 * As faixas horizontais não são decorativas: sem elas o gradiente do
 * degradê se espalharia pelos ~62u de altura da malha e a parte VISÍVEL
 * (uns 20u) sairia quase toda da mesma cor. As profundidades abaixo da
 * crista foram escolhidas pra que o preto chegue por volta de 9u — que é
 * onde a silhueta do palco começa a cobrir tudo.
 */
function buildHills(spanX: number): THREE.Mesh {
  const m = new Mass();
  const ink = new THREE.Color(BACKDROP_INK);
  const fog = new THREE.Color(BACKDROP_HAZE);
  const deep = new THREE.Color(EARTH_DEEP);
  const tmp = new THREE.Color();

  /** Profundidade abaixo da crista → cor. Névoa em cima, breu embaixo. */
  const shade = (below: number): THREE.Color => {
    const t = Math.min(1, below / 9.5);
    const c = tmp.copy(ink).lerp(fog, 0.80 * (1 - t * t));
    return c.lerp(deep, Math.min(1, Math.max(0, (below - 2.2) / 12)));
  };

  const bands = [0, 1.4, 3.2, 6.0, 10.5, 62];
  const step = 2.2;
  const x0 = -70;
  const x1 = spanX + 70;

  for (let x = x0; x < x1; x += step) {
    const xa = x;
    const xb = Math.min(x + step, x1);
    const ta = hillTop(xa);
    const tb = hillTop(xb);
    for (let k = 0; k + 1 < bands.length; k++) {
      const d0 = bands[k]!;
      const d1 = bands[k + 1]!;
      const c0 = shade(d0).clone();
      const c1 = shade(d1).clone();
      const push = (px: number, py: number, c: THREE.Color) => {
        m.pos.push(px, py, HILL_Z);
        m.col.push(c.r, c.g, c.b);
      };
      push(xa, ta - d0, c0);
      push(xb, tb - d0, c0);
      push(xb, tb - d1, c1);
      push(xa, ta - d0, c0);
      push(xb, tb - d1, c1);
      push(xa, ta - d1, c1);
    }
  }
  return m.mesh("backdrop-hills");
}

/**
 * Uma camada da vila.
 *
 * **Casa é MAIS LARGA QUE ALTA.** A primeira versão do fundo dava 12u de
 * largura para até 30 de altura e o horizonte virou fileira de obeliscos —
 * verificado na captura. Proporção de casa de vila: 1.35 a 2.15 de largura
 * para 1 de altura, com o telhado de duas águas fazendo o resto. Não
 * regredir isto.
 *
 * A base fica em -4, abaixo da crista das colinas: casa que flutua em cima
 * do horizonte é a coisa que mais rápido denuncia fundo montado em camadas.
 */
function buildTown(spanX: number, L: (typeof LAYERS)[number]): THREE.Mesh {
  const m = new Mass();
  const base = -4;
  const from = Math.floor(-70 / L.step);
  const to = Math.ceil((spanX + 70) / L.step);

  for (let i = from; i < to; i++) {
    // Variação ancorada no índice+seed, nunca em `Math.random()`: a captura
    // determinística é o que torna duas rodadas comparáveis.
    const x = i * L.step + hash2(i, L.seed) * L.step * 0.55;
    // Expoente >1 na altura: muitas casas baixas e poucas altas, que é a
    // distribuição de uma vila. Sorteio uniforme dá uma fileira de alturas
    // médias e nenhum perfil.
    const h = L.hMin + Math.pow(hash2(i, L.seed + 2), 1.7) * (L.hMax - L.hMin);
    const w = h * (1.35 + hash2(i, L.seed + 1) * 0.8);
    const top = base + h;
    const roof = h * 0.26;

    m.quad(x, base, x + w, top, L.z, L.depth);
    // Telhado de duas águas: o triângulo em cima é o que faz a silhueta ler
    // como CASA e não como caixa empilhada.
    const beak = 0.11 * w;
    m.vert(x - beak, top, L.z, L.depth);
    m.vert(x + w + beak, top, L.z, L.depth);
    m.vert(x + w * 0.5, top + roof, L.z, L.depth);

    // Chaminé em parte das casas. Quebra o ritmo da fileira por quase nada
    // de geometria, e é o detalhe que diz "vila" em vez de "blocos".
    if (hash2(i, L.seed + 5) > 0.45) {
      const cw = w * 0.1;
      const cx = x + w * (0.2 + hash2(i, L.seed + 6) * 0.45);
      m.quad(cx, top, cx + cw, top + roof * (1.1 + hash2(i, L.seed + 7) * 0.7), L.z, L.depth);
    }
  }
  return m.mesh(`backdrop-town-${-L.z}`);
}

/**
 * PRIMEIRO PLANO: massa escura entre a câmera e a ação.
 *
 * É o ganho de profundidade mais barato que existe em 2.5D, e o jogo 2D
 * mediu isso: acrescentar uma franja de primeiro plano deu profundidade
 * por SOBREPOSIÇÃO — antes dela a profundidade vinha só de escala, que o
 * olho lê muito mais fraco — e ainda devolveu os pretos reais da cena
 * (p01 de 0.09 pra 0.02).
 *
 * A lição que veio junto, e custou uma rodada lá: a primeira versão era
 * alta demais e **escondia o chão onde o jogador anda**. Primeiro plano é
 * FRANJA — ele mordisca a borda inferior do quadro e sai da frente.
 *
 * Silhuetas quase pretas de propósito: elas não são assunto, são moldura.
 * Detalhe aqui rouba atenção do palco, que é o que tem que ganhar.
 */
export function buildForeground(spanX: number): THREE.Group {
  const g = new THREE.Group();
  const pos: number[] = [];
  const push = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, z: number) => {
    pos.push(ax, ay, z, bx, by, z, cx, cy, z);
  };

  for (let i = -2; i * 9 < spanX + 40; i++) {
    const h = hash2(i, 91);
    if (h < 0.42) continue; // esparso: franja contínua vira tarja preta
    const x = i * 9 + hash2(i, 92) * 6;
    const z = 5.5 + hash2(i, 93) * 2.5;
    const kind = hash2(i, 94);

    if (kind < 0.55) {
      // Poste de cerca quebrado. Vertical fino é o que menos come quadro.
      const w = 0.5 + hash2(i, 95) * 0.4;
      const top = -3.2 + hash2(i, 96) * 3.4;
      push(x, -14, x + w, -14, x + w, top, z);
      push(x, -14, x + w, top, x, top, z);
      // Ponta lascada
      push(x, top, x + w, top, x + w * 0.35, top + 0.8 + hash2(i, 97), z);
    } else {
      // Monte de entulho: base larga, topo irregular.
      const w = 3 + hash2(i, 98) * 5;
      const top = -5.4 + hash2(i, 99) * 2.6;
      push(x, -14, x + w, -14, x + w, top - 1.2, z);
      push(x, -14, x + w, top - 1.2, x, top - 0.6, z);
      push(x, top - 0.6, x + w, top - 1.2, x + w * 0.45, top, z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  // `fog: false` — a franja está NA FRENTE da câmera; deixar a névoa
  // clarear o que está perto inverteria a leitura de profundidade.
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0d1210, fog: false })));
  return g;
}
