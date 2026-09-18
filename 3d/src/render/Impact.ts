/**
 * Impacto da espada: o que SAI do corpo quando a lâmina abre um aldeão.
 *
 * ── O erro que este arquivo existe pra não repetir ────────────────────
 *
 * O acerto soltava uma esfera clara que crescia e sumia. Isso lê como
 * MAGIA — e é exatamente o mesmo erro que a versão 2D deste projeto já
 * cometeu e já corrigiu: as rampas de partícula começavam em quase-branco
 * e o golpe lia como RAIO ELÉTRICO. A correção registrada lá foi tirar o
 * branco puro, reduzir a contagem de faísca e aumentar a matéria corroída.
 * Este módulo é essa mesma conclusão, aplicada em 3D.
 *
 * O mundo é corroído pelo Rot e os inimigos são gente que a praga pegou
 * primeiro. Quando a espada abre um deles não sai luz: sai **matéria em
 * decomposição**. Então o evento é feito de quatro vozes, nesta ordem de
 * importância — e a ordem é o argumento inteiro:
 *
 *  1. **NACO** (22 lascas sólidas, iluminadas pela cena) — pedaço de
 *     crosta e de carne morta arremessado no arco do golpe, com peso e
 *     giro. São ILUMINADAS pelas luzes do palco de propósito: matéria
 *     pertence ao mundo, e o que pertence ao mundo recebe a mesma luz que
 *     a parede. Efeito que se acende sozinho é efeito que flutua por cima
 *     da cena.
 *  2. **PÓ** (26 pontos) — a nuvem seca que salta junto e desacelera
 *     rápido. É ela que dá o VOLUME do golpe no quadro congelado.
 *  3. **ESPORO** (18 pontos) — o que SOBRA. Sobe devagar e é o último a
 *     apagar, meio segundo depois de tudo. É o esporo que diz "praga",
 *     não o clarão.
 *  4. **AÇO** (6 pontos, ~5 quadros de vida) — o ACENTO. Cinza-osso, nunca
 *     branco, e abaixo do limiar de bloom (0.82) de propósito: se ele
 *     sangrasse pro ar viraria brilho, e brilho é a assinatura de magia.
 *     Seis contra setenta é a proporção que faz dele tempero.
 *
 * Há ainda 4 BAFOS escuros: a única coisa "grande" do efeito é ESCURA, não
 * clara. Um borrão escuro no ponto do corte lê como buraco aberto em coisa
 * podre; um borrão claro leria como explosão de energia. Inverter o sinal
 * do maior elemento é o que mais separa "matéria" de "feitiço".
 *
 * ── Congelamento ──────────────────────────────────────────────────────
 *
 * O chamador passa `dtMs = 0` durante o hitstop, então a matéria PARA
 * junto com o mundo. Pra que os 4 quadros parados não mostrem um ponto
 * único, o nascimento já vem adiantado em `PRE_ROLL` segundos de voo: o
 * quadro congelado pega o jorro JÁ FORMADO, que é a imagem que dá peso.
 *
 * ── Orçamento ─────────────────────────────────────────────────────────
 *
 MEDIDO com `renderer.info` em `3d/harness/impact.mjs`, contra o quadro
 * anterior ao acerto (900x506, cadeia de pós inteira):
 *
 *     parado ................ +0 draw calls,  +0 triângulos
 *     efeito inteiro no ar ... +2 draw calls, +88 triângulos
 *     rabo de esporo ......... +1 draw call,   +0 triângulos
 *
 * São dois objetos e nunca mais: um `THREE.Points` com 54 partículas (que
 * não gera triângulo nenhum) e um `THREE.InstancedMesh` de 22 tetraedros.
 * Sai mais barato que a esfera que substitui (216 triângulos) e some do
 * orçamento quando não há acerto. Uma malha por partícula custaria 88 draw
 * calls — é assim que projeto 3D estoura.
 *
 * Determinismo: nada de `Math.random()`. Toda variação vem de `hash2` com
 * o índice da partícula e o número do jorro, então a mesma sequência de
 * entradas produz o mesmo impacto, quadro a quadro.
 */
import * as THREE from "three";
import { hash2 } from "../engine/rng";

/** Gancho que o `Game` publica no acerto: ponto e uma vida que decai de 1. */
export interface HitFx {
  x: number;
  y: number;
  t: number;
}

// ── Composição do jorro ───────────────────────────────────────────────
//
// As contagens são o argumento visual escrito em número. Matéria (bafo +
// pó + esporo + naco = 70) contra aço (6): 12 pra 1. No 2D a proporção invertida
// foi o que fez o golpe ler como eletricidade.
const N_HAZE = 4;
const N_DUST = 26;
const N_SPORE = 18;
const N_STEEL = 6;
const N_POINTS = N_HAZE + N_DUST + N_SPORE + N_STEEL;
const N_CHUNKS = 22;

const I_HAZE = 0;
const I_DUST = I_HAZE + N_HAZE;
const I_SPORE = I_DUST + N_DUST;
const I_STEEL = I_SPORE + N_SPORE;

/**
 * Quanto o jorro nasce à FRENTE do ponto de acerto, na direção do golpe.
 *
 * O `Game` entrega o centro do inimigo, e o inimigo é uma massa escura —
 * medido na captura, metade da matéria nascia POR CIMA dele e sumia por
 * falta de contraste. Nascer na borda da ferida põe o jorro contra o
 * fundo, que é onde ele se lê.
 */
const WOUND_OUT = 0.34;

/** Segundos de voo já embutidos no nascimento — ver "Congelamento". */
const PRE_ROLL = 0.075;

/**
 * Paleta da matéria. Escrita como VALOR, igual ao resto do jogo: o teste é
 * "em preto e branco, ainda lê como sujeira e não como luz". Nenhuma
 * entrada aqui passa de 0.78 de luminância linear, que é o que mantém o
 * efeito inteiro fora do bloom (limiar 0.82 em `Grade.ts`).
 */
const MATTER = {
  /** Bafo do corte: oliva sujo e ESCURO. A maior forma do efeito é a mais
   *  escura — é buraco aberto em coisa podre, não explosão de energia. */
  haze: [0x39402a, 0x2a2f1b],
  /** Pó seco: cinza-oliva de coisa morta, um degrau ACIMA do fundo. Medido
   *  na captura: a primeira rodada usou 0x6d7056 e o pó sumia contra os
   *  telhados (mesmo valor), então o golpe ficava só com as lascas. */
  dust: [0x6f6d52, 0x585744, 0x807a5d, 0x484b33],
  /** Esporo: o verde-doente do Rot, mais escuro que a crosta do palco. */
  spore: [0x7f9440, 0x62762f, 0x8a9a52],
  /** Naco: da carne morta ao preto, com a lasca de crosta como pico. */
  chunk: [0x23261a, 0x3a3d29, 0x4d5138, 0x7f8f45],
  /** Aço. Cinza-OSSO. Branco puro é o erro que este arquivo não comete. */
  steel: 0xc4c6b2,
} as const;

/** Perfil de cada voz. Tudo em unidades de mundo e segundos. */
interface Voice {
  /** Velocidade inicial mínima/máxima, u/s. */
  speed: [number, number];
  /** Abertura do leque em torno da direção do golpe, em radianos. */
  spread: number;
  /** Inclinação do leque: positivo joga matéria pra cima. */
  rise: number;
  /** Arrasto do ar (1/s). Alto = para rápido, como pó. */
  drag: number;
  /** Aceleração vertical: negativa cai, positiva sobe (esporo). */
  buoy: number;
  /** Diâmetro no nascimento e na morte, em unidades de mundo. */
  size: [number, number];
  /** Opacidade inicial. */
  alpha: number;
  /** Vida em segundos. */
  life: number;
  /** 0 = borrão redondo e macio, 1 = flocinho quadrado de borda dura. */
  hard: number;
  /** Espalhamento do ponto de nascimento. */
  jitter: number;
}

const VOICES: Record<"haze" | "dust" | "spore" | "steel", Voice> = {
  // Grande, escuro e curto. Some antes do pó pra não virar mancha parada.
  haze: { speed: [0.9, 2.6], spread: 1.5, rise: 0.25, drag: 5.2, buoy: 0.5, size: [0.72, 1.5], alpha: 0.4, life: 0.55, hard: 0, jitter: 0.2 },
  // O corpo do evento: salta com o golpe e trava no ar quase na hora.
  dust: { speed: [2.2, 6.4], spread: 1.15, rise: 0.3, drag: 5.2, buoy: -1.1, size: [0.19, 0.36], alpha: 0.55, life: 0.78, hard: 0.25, jitter: 0.12 },
  // O rastro: devagar, sobe, e é o último a apagar.
  // `hard: 0.82` e não 0.55: com a borda mole o esporo virou PONTINHO
  // ACESO na captura — vaga-lume, que é o vizinho de porta da magia. Aresta
  // é o que faz o grão ler como floco de matéria suspensa.
  spore: { speed: [0.5, 2.1], spread: 1.7, rise: 0.35, drag: 1.7, buoy: 0.55, size: [0.05, 0.1], alpha: 0.72, life: 1.0, hard: 0.82, jitter: 0.16 },
  // O acento. Rápido, minúsculo, e morto em ~5 quadros.
  // Vida 0.18 e não 0.09: `PRE_ROLL` é tempo, e com 0.09 o aço nascia já
  // morto — a captura saiu sem acento nenhum. ~6 quadros depois do
  // congelamento é o que dá pra ver sem virar assunto.
  steel: { speed: [5.5, 9.5], spread: 0.42, rise: 0.12, drag: 6.5, buoy: 0, size: [0.11, 0.02], alpha: 0.9, life: 0.18, hard: 1, jitter: 0.05 },
};

/** Gravidade dos nacos. Menor que a do jogador: lasca é leve, mas CAI. */
const CHUNK_GRAVITY = -30;
const CHUNK_LIFE = 0.62;
const CHUNK_DRAG = 0.9;

export class Impact {
  readonly object = new THREE.Group();

  private readonly points: THREE.Points;
  private readonly pointGeo = new THREE.BufferGeometry();
  private readonly pointMat: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(N_POINTS * 3);
  private readonly vel = new Float32Array(N_POINTS * 3);
  private readonly col = new Float32Array(N_POINTS * 3);
  private readonly size = new Float32Array(N_POINTS);
  private readonly alpha = new Float32Array(N_POINTS);
  private readonly hard = new Float32Array(N_POINTS);
  private readonly life = new Float32Array(N_POINTS);
  /** Vida TOTAL sorteada de cada grão. A rampa de opacidade se mede contra
   *  ela, não contra o valor nominal da voz: com vidas desiguais, dividir
   *  pelo nominal faria o grão de vida curta já nascer meio apagado. */
  private readonly lifeMax = new Float32Array(N_POINTS);
  private readonly sizeK = new Float32Array(N_POINTS);

  private readonly chunks: THREE.InstancedMesh;
  private readonly cPos = new Float32Array(N_CHUNKS * 3);
  private readonly cVel = new Float32Array(N_CHUNKS * 3);
  private readonly cRot = new Float32Array(N_CHUNKS * 3);
  private readonly cSpin = new Float32Array(N_CHUNKS * 3);
  private readonly cScale = new Float32Array(N_CHUNKS * 3);
  private readonly cLife = new Float32Array(N_CHUNKS);
  private readonly cLifeMax = new Float32Array(N_CHUNKS);

  /** Número do jorro: é ele que semeia o `hash2`. Nunca um relógio. */
  private burst = 0;
  /** `t` do quadro anterior, pra detectar a BORDA de um acerto novo. */
  private prevT: number | null = null;

  private readonly mat4 = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly vec3 = new THREE.Vector3();
  private readonly vecB = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly viewport = new THREE.Vector2();

  constructor() {
    this.pointGeo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.pointGeo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    this.pointGeo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.pointGeo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.pointGeo.setAttribute("aHard", new THREE.BufferAttribute(this.hard, 1));

    /**
     * Shader próprio, e não `PointsMaterial`, por uma razão só: tamanho e
     * opacidade PRECISAM ser por partícula. Com `PointsMaterial` o esporo
     * e o pó teriam que virar dois objetos (duas draw calls) e mesmo assim
     * não dava pra apagar cada grão na sua hora — a opacidade é do
     * material, não do vértice. Com atributo, as quatro vozes cabem num
     * `Points` só.
     *
     * `gl_PointSize` sai calculado com `projectionMatrix[1][1]`, então
     * `aSize` é diâmetro em unidades de MUNDO e a partícula encolhe com a
     * distância como qualquer objeto — o `PointsMaterial` do three ignora
     * a fov nessa conta e o tamanho mentiria com a câmera respirando.
     */
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: `
        uniform float uScale;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aHard;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vHard;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vHard = aHard;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * projectionMatrix[1][1] * uScale / max(0.25, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vHard;
        void main() {
          if (vAlpha <= 0.003) discard;
          vec2 d = gl_PointCoord - 0.5;
          // Duas silhuetas no mesmo shader: borrão redondo pro pó e pro
          // bafo, floco quadrado de borda dura pro esporo e pro aço.
          // Grão de matéria tem ARESTA; se tudo fosse gaussiana redonda o
          // efeito voltaria a ler como brilho.
          // Queda quase gaussiana (o quadrado da rampa) e não borda
          // definida: com um degrau de 0.16 a 0.5 cada grão de pó
          // saía como um DISCO e a nuvem lia como algodão. Núcleo mole é
          // o que faz vinte grãos somarem UMA nuvem.
          float s0 = 1.0 - smoothstep(0.02, 0.5, length(d));
          float soft = s0 * s0;
          float chip = 1.0 - smoothstep(0.30, 0.45, max(abs(d.x), abs(d.y)));
          float a = mix(soft, chip, vHard) * vAlpha;
          if (a < 0.005) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.pointGeo, this.pointMat);
    // As posições viajam no atributo, então a esfera de corte nasce velha
    // e o efeito sumiria em ângulos de câmera arbitrários.
    this.points.frustumCulled = false;
    /**
     * `uScale` = metade da altura do buffer, em pixels de verdade. Vem do
     * renderizador no momento do desenho e não de `window.innerHeight`:
     * quem sabe quantos pixels tem o alvo é quem está desenhando nele —
     * com `devicePixelRatio` 2 ou com a cadeia de pós em meia resolução,
     * o palpite estaria errado por um fator inteiro.
     */
    this.points.onBeforeRender = (renderer): void => {
      renderer.getDrawingBufferSize(this.viewport);
      this.pointMat.uniforms.uScale!.value = this.viewport.y * 0.5;
    };

    /**
     * Naco: tetraedro de 4 triângulos, achatado por escala não-uniforme —
     * o resultado é uma LASCA irregular, não uma bolinha. `flatShading`
     * porque o que faz a lasca ler como pedaço de crosta é a face plana
     * pegando luz diferente da vizinha enquanto gira.
     *
     * `MeshStandardMaterial` e não `Basic`: o naco tem que receber a mesma
     * luz do palco. Efeito auto-iluminado é o que faz partícula parecer
     * adesivo colado na lente.
     */
    const chunkGeo = new THREE.TetrahedronGeometry(0.5, 0);
    const chunkMat = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      dithering: true,
    });
    this.chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, N_CHUNKS);
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunks.frustumCulled = false;
    // Sem sombra projetada: 18 lascas no shadow map custam uma passada de
    // sombra a mais por um borrão de 3px que ninguém vê.
    this.chunks.castShadow = false;
    this.chunks.receiveShadow = false;
    for (let i = 0; i < N_CHUNKS; i++) {
      this.chunks.setMatrixAt(i, this.mat4.makeScale(0, 0, 0));
      this.chunks.setColorAt(i, this.tmpColor.setHex(MATTER.chunk[0]!));
    }
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;

    this.object.add(this.points, this.chunks);
    /**
     * Nasce VISÍVEL e vazio de propósito. O `main.ts` renderiza um quadro
     * de aquecimento antes do laço justamente pra compilar shader fora do
     * jogo (a Fase 0 mediu 19.7ms num quadro), e um objeto invisível não
     * compila nada — o primeiro golpe da partida pagaria esse engasgo
     * exatamente no quadro em que o hitstop promete peso. Com escala zero
     * e alfa zero, este quadro não desenha um pixel e mesmo assim compila
     * os dois programas.
     */
  }

  /**
   * @param fx    `game.hitFx` — `null` quando não há acerto recente.
   * @param facing Direção do guerreiro no acerto: pra onde a matéria voa.
   * @param dtMs   Passo FIXO em ms. O chamador passa 0 durante o hitstop,
   *               e é isso que congela a matéria junto com o mundo.
   */
  update(fx: HitFx | null, facing: 1 | -1, dtMs: number): void {
    // Borda de subida: `t` nasce em 1 e decai. Um acerto novo enquanto o
    // anterior ainda decai faz `t` SUBIR — daí a comparação, e não um
    // simples "era null".
    if (fx && (this.prevT === null || fx.t > this.prevT)) this.spawn(fx.x, fx.y, facing);
    this.prevT = fx ? fx.t : null;

    const dt = dtMs / 1000;
    const anyPoint = this.stepPoints(dt);
    const anyChunk = this.stepChunks(dt);
    this.object.visible = anyPoint || anyChunk;
  }

  /** Variação estável por partícula: índice + número do jorro, nunca relógio. */
  private h(i: number, stream: number): number {
    return hash2(i * 71 + stream * 7919, this.burst * 977 + stream * 131);
  }

  private spawn(x: number, y: number, facing: 1 | -1): void {
    this.burst = (this.burst + 1) & 0xffff;

    this.spawnVoice(VOICES.haze, I_HAZE, N_HAZE, MATTER.haze, x, y, facing, 1);
    this.spawnVoice(VOICES.dust, I_DUST, N_DUST, MATTER.dust, x, y, facing, 2);
    this.spawnVoice(VOICES.spore, I_SPORE, N_SPORE, MATTER.spore, x, y, facing, 3);
    this.spawnVoice(VOICES.steel, I_STEEL, N_STEEL, [MATTER.steel], x, y, facing, 4);
    this.spawnChunks(x, y, facing);

    (this.pointGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointGeo.getAttribute("aHard") as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnVoice(
    v: Voice,
    from: number,
    count: number,
    palette: readonly number[],
    x: number,
    y: number,
    facing: 1 | -1,
    stream: number,
  ): void {
    for (let n = 0; n < count; n++) {
      const i = from + n;
      const a = this.h(n, stream);
      const b = this.h(n, stream + 40);
      const c = this.h(n, stream + 80);
      const d = this.h(n, stream + 120);

      // Leque em torno da direção do golpe, inclinado pra cima: uma
      // estocada abre o corpo pra FRENTE e o que sai sobe um pouco antes
      // de cair. Leque simétrico leria como explosão radial de bomba.
      const ang = v.rise + (a - 0.5) * v.spread;
      const speed = v.speed[0] + b * (v.speed[1] - v.speed[0]);
      const vx = Math.cos(ang) * speed * facing;
      const vy = Math.sin(ang) * speed;
      // Componente em Z: sem ela o jorro é um decalque plano. Metade da
      // velocidade lateral, que é o bastante pra dar volume sem furar a
      // leitura 2D da ação.
      const vz = (c - 0.5) * speed * 0.5;

      const jx = (c - 0.5) * v.jitter;
      const jy = (d - 0.5) * v.jitter;
      const jz = (a - 0.5) * v.jitter * 2;

      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      // Nascimento adiantado: o quadro congelado pega o jorro já formado.
      this.pos[i * 3] = x + WOUND_OUT * facing + jx + vx * PRE_ROLL;
      this.pos[i * 3 + 1] = y + jy + vy * PRE_ROLL;
      // Viés de +0.2 em Z: o ponto de acerto fica no MEIO do corpo do
      // inimigo, e sem empurrar o jorro pra frente metade dele nasce
      // dentro da cápsula e é comida pelo teste de profundidade.
      this.pos[i * 3 + 2] = 0.2 + jz + vz * PRE_ROLL;

      const hex = palette[Math.min(palette.length - 1, Math.floor(d * palette.length))]!;
      this.tmpColor.setHex(hex);
      this.col[i * 3] = this.tmpColor.r;
      this.col[i * 3 + 1] = this.tmpColor.g;
      this.col[i * 3 + 2] = this.tmpColor.b;

      this.hard[i] = v.hard;
      // Escala por grão: nuvem de grãos do MESMO tamanho lê como padrão
      // impresso, não como pó. Guardada pra rampa de tamanho usar depois.
      this.sizeK[i] = 0.72 + b * 0.62;
      this.size[i] = v.size[0] * this.sizeK[i]!;
      this.alpha[i] = v.alpha;
      // Vidas desiguais: o efeito tem que APAGAR desfiado, não num corte
      // seco em que sessenta grãos somem no mesmo quadro.
      this.lifeMax[i] = v.life * (0.72 + c * 0.5);
      this.life[i] = this.lifeMax[i]! - PRE_ROLL;
    }
  }

  private spawnChunks(x: number, y: number, facing: 1 | -1): void {
    for (let i = 0; i < N_CHUNKS; i++) {
      const a = this.h(i, 5);
      const b = this.h(i, 45);
      const c = this.h(i, 85);
      const d = this.h(i, 125);

      const ang = 0.34 + (a - 0.5) * 1.6;
      const speed = 3.4 + b * 5.6;
      const vx = Math.cos(ang) * speed * facing;
      const vy = Math.sin(ang) * speed;
      const vz = (c - 0.5) * speed * 0.55;

      this.cVel[i * 3] = vx;
      this.cVel[i * 3 + 1] = vy;
      this.cVel[i * 3 + 2] = vz;
      this.cPos[i * 3] = x + WOUND_OUT * facing + (c - 0.5) * 0.16 + vx * PRE_ROLL;
      this.cPos[i * 3 + 1] = y + (d - 0.5) * 0.14 + vy * PRE_ROLL;
      this.cPos[i * 3 + 2] = 0.2 + (a - 0.5) * 0.4 + vz * PRE_ROLL;

      this.cRot[i * 3] = a * 6.28;
      this.cRot[i * 3 + 1] = b * 6.28;
      this.cRot[i * 3 + 2] = c * 6.28;
      // Giro rápido: lasca arrancada não plana, ela roda. Sinal por hash
      // pra que metade gire pra cada lado.
      this.cSpin[i * 3] = (a - 0.5) * 26;
      this.cSpin[i * 3 + 1] = (b - 0.5) * 26;
      this.cSpin[i * 3 + 2] = (d - 0.5) * 30;

      // Escala não-uniforme: o tetraedro vira LASCA achatada.
      const s = 0.13 + d * 0.17;
      this.cScale[i * 3] = s;
      this.cScale[i * 3 + 1] = s * (0.45 + c * 0.5);
      this.cScale[i * 3 + 2] = s * (0.6 + a * 0.5);

      this.cLifeMax[i] = CHUNK_LIFE * (0.75 + b * 0.45);
      this.cLife[i] = this.cLifeMax[i]! - PRE_ROLL;

      const hex = MATTER.chunk[Math.min(MATTER.chunk.length - 1, Math.floor(c * MATTER.chunk.length))]!;
      this.chunks.setColorAt(i, this.tmpColor.setHex(hex));
    }
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
  }

  /** @returns `true` se ainda há algum grão vivo. */
  private stepPoints(dt: number): boolean {
    let alive = false;
    for (let n = 0; n < N_POINTS; n++) {
      if (this.life[n]! <= 0) {
        this.alpha[n] = 0;
        continue;
      }
      alive = true;
      const v = n < I_DUST ? VOICES.haze : n < I_SPORE ? VOICES.dust : n < I_STEEL ? VOICES.spore : VOICES.steel;

      if (dt > 0) {
        this.life[n] = this.life[n]! - dt;
        // Arrasto exponencial e não subtração linear: linear inverte o
        // sinal da velocidade quando o passo é grande, e o pó voltaria
        // pro ponto de origem.
        const k = Math.exp(-v.drag * dt);
        this.vel[n * 3] = this.vel[n * 3]! * k;
        this.vel[n * 3 + 1] = this.vel[n * 3 + 1]! * k + v.buoy * dt;
        this.vel[n * 3 + 2] = this.vel[n * 3 + 2]! * k;
        this.pos[n * 3] = this.pos[n * 3]! + this.vel[n * 3]! * dt;
        this.pos[n * 3 + 1] = this.pos[n * 3 + 1]! + this.vel[n * 3 + 1]! * dt;
        this.pos[n * 3 + 2] = this.pos[n * 3 + 2]! + this.vel[n * 3 + 2]! * dt;
      }

      const u = Math.max(0, Math.min(1, 1 - this.life[n]! / Math.max(0.0001, this.lifeMax[n]!)));
      this.size[n] = (v.size[0] + (v.size[1] - v.size[0]) * u) * this.sizeK[n]!;
      // Segura a opacidade e apaga no fim: rampa linear faz tudo começar a
      // sumir no primeiro quadro, e o jorro nunca chega a existir.
      this.alpha[n] = v.alpha * (1 - u * u * u);
    }

    (this.pointGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (this.pointGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = alive;
    return alive;
  }

  /** @returns `true` se ainda há algum naco vivo. */
  private stepChunks(dt: number): boolean {
    let alive = false;
    for (let i = 0; i < N_CHUNKS; i++) {
      if (this.cLife[i]! <= 0) {
        this.chunks.setMatrixAt(i, this.mat4.makeScale(0, 0, 0));
        continue;
      }
      alive = true;
      if (dt > 0) {
        this.cLife[i] = this.cLife[i]! - dt;
        const k = Math.exp(-CHUNK_DRAG * dt);
        this.cVel[i * 3] = this.cVel[i * 3]! * k;
        this.cVel[i * 3 + 1] = this.cVel[i * 3 + 1]! * k + CHUNK_GRAVITY * dt;
        this.cVel[i * 3 + 2] = this.cVel[i * 3 + 2]! * k;
        for (let a = 0; a < 3; a++) {
          this.cPos[i * 3 + a] = this.cPos[i * 3 + a]! + this.cVel[i * 3 + a]! * dt;
          this.cRot[i * 3 + a] = this.cRot[i * 3 + a]! + this.cSpin[i * 3 + a]! * dt;
        }
      }

      // Some ENCOLHENDO, e só no fim da vida. Apagar por transparência
      // exigiria material transparente (mais um programa, mais ordenação)
      // e leria como fantasma; encolher lê como lasca indo pro chão.
      const u = Math.max(0, Math.min(1, 1 - this.cLife[i]! / Math.max(0.0001, this.cLifeMax[i]!)));
      const shrink = u < 0.68 ? 1 : Math.max(0, 1 - (u - 0.68) / 0.32);
      this.euler.set(this.cRot[i * 3]!, this.cRot[i * 3 + 1]!, this.cRot[i * 3 + 2]!);
      this.quat.setFromEuler(this.euler);
      this.vec3.set(this.cPos[i * 3]!, this.cPos[i * 3 + 1]!, this.cPos[i * 3 + 2]!);
      this.vecB.set(
        this.cScale[i * 3]! * shrink,
        this.cScale[i * 3 + 1]! * shrink,
        this.cScale[i * 3 + 2]! * shrink,
      );
      this.mat4.compose(this.vec3, this.quat, this.vecB);
      this.chunks.setMatrixAt(i, this.mat4);
    }
    this.chunks.instanceMatrix.needsUpdate = true;
    this.chunks.visible = alive;
    return alive;
  }
}
