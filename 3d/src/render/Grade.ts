/**
 * Passe de imagem: oclusão de contato, bloom e grade de cor.
 *
 * Este arquivo é a alavanca mais alta do render, e isso não é opinião — é
 * o que o projeto 2D mediu. Lá, o passe de grade foi o primeiro trabalho
 * feito e o único que mudou a leitura da imagem inteira de uma vez: média
 * de luminância 0.58 → 0.41, massa de sombra 7.5% → 25.9%. Geometria boa
 * sob luz sem tratamento continua parecendo protótipo; geometria simples
 * sob imagem tratada já parece jogo.
 *
 * A cadeia, na ordem, e por que cada uma:
 *
 *  **ContactAO (oclusão de ambiente)** — escurece frestas e o encontro
 *  entre superfícies. É o que faz um bloco POUSAR no chão em vez de
 *  flutuar sobre ele. Sem isso, geometria de caixas lê como colagem de
 *  adesivos, que é exatamente o que estava acontecendo com a alvenaria.
 *  Implementação própria; o porquê está no comentário da classe.
 *
 *  **Bloom** — só nas altas. Num mundo encoberto ele não é brilho, é
 *  difusão: a brasa do portão e o Rot sangram um pouco pro ar. É também o
 *  que dá "alta" de verdade, e o jogo 2D mediu que cena sem alta lê lavada.
 *
 *  **Grade** — curva em S, dessaturação, split tone (frio na sombra,
 *  quente na luz), vinheta e grão. O split tone é o que tira a imagem do
 *  cinza morto sem precisar colorir nada: sombra fria e luz quente é como
 *  o olho lê "dia encoberto" em vez de "sem cor".
 *
 * Grão por último e sutil: ele existe pra tirar o banding do céu em
 * gradiente, que é o defeito mais visível de um degradê em 8 bits.
 *
 * A AO vem ANTES do bloom de propósito: o buffer nesse ponto ainda é
 * linear e HDR (o tone mapping só acontece no `OutputPass`, porque o
 * three não aplica curva ao renderizar pra render target). Multiplicar
 * oclusão em luz linear é o lugar certo; depois do bloom, a AO apagaria
 * um brilho que já vazou pro lado e apareceria como halo.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { SAOPass } from "three/examples/jsm/postprocessing/SAOPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ── Oclusão de contato ────────────────────────────────────────────────

/**
 * Raio da oclusão, em unidades de MUNDO. É o número que decide o que a
 * AO significa, e ele foi escolhido contra a escala do palco, não por
 * gosto: uma fiada de alvenaria tem 0.58u e o degrau entre dois blocos
 * de chão tem 1.2u. Com raio ~0.9 a AO enxerga o DEGRAU e ignora a junta
 * — que é o que se quer. Raio pequeno demais vira contorno em cada pedra
 * e devolve a leitura de TECLADO que o `Stage.ts` passou o projeto
 * inteiro combatendo; raio grande demais vira sujeira cinza em tudo.
 */
const AO_RADIUS = 1.0;
/**
 * Força. Multiplica luz LINEAR, então o ACES depois come boa parte: 1.15
 * (o primeiro palpite) rendia 7 níveis de variação no quadro inteiro, o
 * que é o mesmo que nada. Medido no buffer cru, não estimado.
 */
const AO_INTENSITY = 2.8;
/** Tolerância contra auto-oclusão de superfície plana. */
const AO_BIAS = 0.04;
/**
 * Tolerância EXTRA para superfície de raspão, e ela não é refinamento —
 * sem ela o passe tem artefato visível. A face de cima dos blocos é vista
 * quase de perfil (a câmera tomba pouco), então 4u de profundidade se
 * espremem em ~30px: a normal reconstruída ali fica quase paralela à
 * vista e QUALQUER amostra vizinha aparece "acima do plano tangente". O
 * resultado, verificado no buffer cru, eram espinhos verticais subindo do
 * fio da plataforma, espaçados como o calçamento do topo. Somar tolerância
 * proporcional à inclinação (`1 - N.z`) some com eles e não encosta na
 * face frontal, que é onde a AO tem que trabalhar.
 */
const AO_SLOPE_BIAS = 0.45;
/**
 * Distância além da qual não se calcula AO. Existe por duas razões: o
 * fundo (`buildBackdrop`) fica a 210u e não tem relevo nenhum pra ocluir,
 * e céu + fundo ocupam metade do quadro — pular os dois é o corte de
 * custo mais barato que existe aqui.
 */
const AO_MAX_DIST = 60.0;
/** Número de amostras por pixel. */
const AO_TAPS = 14;

/**
 * `#ao=raio,forca` sobrescreve os dois números acima sem recompilar nada.
 * Existe porque ajustar AO exige VER, e cada captura no harness custa
 * minutos: com isto dá pra disparar três capturas em paralelo variando
 * só a URL, que foi como o raio saiu de 0.9 (traçava cada junta de
 * argamassa) pro valor atual.
 */
function aoOverride(): { radius: number; intensity: number } {
  const m = /[#&]ao=([\d.]+)(?:,([\d.]+))?/.exec(location.hash);
  return {
    radius: m && m[1] ? Number(m[1]) : AO_RADIUS,
    intensity: m && m[2] ? Number(m[2]) : AO_INTENSITY,
  };
}

/**
 * Oclusão de contato em espaço de tela, escrita à mão.
 *
 * **Por que não usar os passes prontos do three.** Os dois foram testados
 * nesta cena e os dois falharam, cada um do seu jeito:
 *
 *  - `SAOPass`: canvas PRETO. Ablação confirmou (sem ele + com bloom
 *    renderiza; com ele, preto).
 *  - `SSAOPass`: renderiza, mas produz LISTRAS VERTICAIS por toda a
 *    imagem. Os dois montam a própria passada de NORMAIS renderizando a
 *    cena inteira de novo com `MeshNormalMaterial` num alvo à parte e
 *    orientam o kernel por ela — numa cena de câmera quase ortogonal e
 *    superfícies grandes e chapadas, a quantização dessa normal vira
 *    estrutura regular na imagem. Custa ainda uma segunda travessia da
 *    cena, que é o passe mais caro do quadro.
 *
 * O que este passe faz de diferente, e é a diferença inteira:
 *
 *  1. **Não renderiza a cena de novo.** O `EffectComposer` carrega um
 *     `DepthTexture` anexado aos próprios buffers, então a profundidade
 *     que o `RenderPass` já escreveu é lida direto. Zero travessia extra.
 *  2. **Não guarda normais em buffer** — reconstrói a normal do próprio
 *     campo de profundidade, por diferenças finitas, escolhendo o lado
 *     de menor salto em cada eixo (é isso que impede a normal de virar
 *     lixo na silhueta). Sem buffer quantizado, sem listra.
 *  3. **Rejeita amostra fora de alcance.** Sem esse teste, a silhueta de
 *     qualquer objeto contra o fundo distante gera um halo escuro — o
 *     artefato clássico de AO só por profundidade.
 *
 * O padrão de amostragem é espiral de ângulo áureo girada por pixel
 * (interleaved gradient noise). O ruído resultante é dissolvido por meia
 * resolução + filtro linear + tent de 5 toques na composição, e não por
 * um blur separado: um passe a menos.
 */
class ContactAOPass extends Pass {
  private readonly aoTarget: THREE.WebGLRenderTarget;
  private readonly aoMaterial: THREE.ShaderMaterial;
  private readonly blendMaterial: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();

  constructor(
    private readonly camera: THREE.Camera,
    width: number,
    height: number,
    /** `#aoraw` mostra só o termo de oclusão, em cinza. Ferramenta de ajuste. */
    raw: boolean,
  ) {
    super();
    this.needsSwap = true;

    // MEIA resolução, e isso é escolha de qualidade tanto quanto de custo:
    // o borrão do reescalonamento é exatamente o que dissolve o ruído do
    // padrão girado por pixel. `depthBuffer: false` porque um alvo de
    // quad de tela cheia não tem o que testar.
    this.aoTarget = new THREE.WebGLRenderTarget(Math.max(1, width >> 1), Math.max(1, height >> 1), {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.aoTarget.texture.name = "ContactAO.ao";

    this.aoMaterial = new THREE.ShaderMaterial({
      name: "ContactAO",
      depthTest: false,
      depthWrite: false,
      defines: { TAPS: AO_TAPS },
      uniforms: {
        tDepth: { value: null as THREE.Texture | null },
        uProjInv: { value: new THREE.Matrix4() },
        /** (P[0][0]/2, P[1][1]/2): converte raio de mundo em raio de UV. */
        uProjScale: { value: new THREE.Vector2(1, 1) },
        /** 1 / resolução do alvo de AO. Passo da reconstrução de normal. */
        uTexel: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: aoOverride().radius },
        uIntensity: { value: aoOverride().intensity },
        uBias: { value: AO_BIAS },
        uSlopeBias: { value: AO_SLOPE_BIAS },
        uMaxDist: { value: AO_MAX_DIST },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth;
        uniform mat4 uProjInv;
        uniform vec2 uProjScale, uTexel;
        uniform float uRadius, uIntensity, uBias, uSlopeBias, uMaxDist;
        varying vec2 vUv;

        /* Posição em espaço de VISTA a partir da profundidade de janela.
           Pela inversa da projeção, não por fórmula de near/far: assim o
           código vale igual pra qualquer câmera e não há constante de
           precisão pra errar. */
        vec3 viewPos(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 v = uProjInv * clip;
          return v.xyz / v.w;
        }

        void main() {
          float d0 = texture2D(tDepth, vUv).x;
          // Céu: nada atrás pra ocluir, e sair cedo economiza metade do quadro.
          if (d0 >= 0.9999) { gl_FragColor = vec4(1.0); return; }

          vec3 P = viewPos(vUv);
          float dist = -P.z;
          if (dist > uMaxDist) { gl_FragColor = vec4(1.0); return; }

          // NORMAL RECONSTRUÍDA, e a escolha do lado é o detalhe que faz
          // funcionar: usar sempre a diferença pra frente produz normal
          // lixo em toda silhueta, porque um dos vizinhos está no fundo
          // distante. Pegando o lado de MENOR salto em profundidade, a
          // borda usa o vizinho que ainda está na mesma superfície.
          vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0));
          vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0));
          vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y));
          vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y));
          vec3 ddx = abs(pr.z - P.z) < abs(P.z - pl.z) ? (pr - P) : (P - pl);
          vec3 ddy = abs(pu.z - P.z) < abs(P.z - pd.z) ? (pu - P) : (P - pd);
          vec3 N = normalize(cross(ddx, ddy));
          if (N.z < 0.0) N = -N;

          // Raio CONSTANTE EM MUNDO: em UV ele encolhe com a distância.
          // Raio fixo em pixel daria oclusão que muda de tamanho quando a
          // câmera anda, que o olho lê na hora como efeito de tela.
          // Superfície de raspão ganha tolerância maior — ver AO_SLOPE_BIAS.
          float bias = uBias + uSlopeBias * (1.0 - clamp(N.z, 0.0, 1.0));

          // O teto de 0.08 não é detalhe: com 0.14 as amostras se espalham
          // por ~126px e a localidade de cache morre — a captura no
          // harness (rasterizador de software) passou de ~1min pra >6min.
          vec2 rad = min(uRadius * uProjScale / dist, vec2(0.08));

          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float a0 = ign * 6.2831853;

          float occ = 0.0;
          for (int i = 0; i < TAPS; i++) {
            float fi = (float(i) + 0.5) / float(TAPS);
            float ang = a0 + float(i) * 2.39996323;
            vec2 off = vec2(cos(ang), sin(ang)) * sqrt(fi) * rad;
            vec3 V = viewPos(vUv + off) - P;
            float len = max(length(V), 1e-4);
            // Quanto a amostra sobe acima do plano tangente = quanto ela oclui.
            float nv = dot(N, V) / len;
            // Fora de alcance NÃO oclui. Sem esta linha, todo objeto
            // recortado contra o fundo ganha halo escuro em volta.
            float att = 1.0 - smoothstep(uRadius * 0.55, uRadius * 1.35, len);
            occ += max(0.0, nv - bias) * att;
          }

          float ao = clamp(1.0 - (occ / float(TAPS)) * uIntensity, 0.0, 1.0);
          gl_FragColor = vec4(ao, ao, ao, 1.0);
        }
      `,
    });

    this.blendMaterial = new THREE.ShaderMaterial({
      name: "ContactAO.blend",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        tAO: { value: this.aoTarget.texture },
        uAoTexel: { value: new THREE.Vector2(1, 1) },
        uRaw: { value: raw ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tAO;
        uniform vec2 uAoTexel;
        uniform float uRaw;
        varying vec2 vUv;

        void main() {
          // Tent de 5 toques nas diagonais. O alvo de AO já é meia
          // resolução com filtro linear; isto termina de dissolver o
          // ruído do padrão girado por pixel, e custa muito menos que um
          // passe de blur separado.
          float ao = texture2D(tAO, vUv).r * 0.40
            + (texture2D(tAO, vUv + uAoTexel * vec2( 1.0,  1.0)).r
             + texture2D(tAO, vUv + uAoTexel * vec2(-1.0,  1.0)).r
             + texture2D(tAO, vUv + uAoTexel * vec2( 1.0, -1.0)).r
             + texture2D(tAO, vUv + uAoTexel * vec2(-1.0, -1.0)).r) * 0.15;

          vec4 c = texture2D(tDiffuse, vUv);
          gl_FragColor = mix(vec4(c.rgb * ao, c.a), vec4(vec3(ao), 1.0), uRaw);
        }
      `,
    });

    this.setSize(width, height);
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, width >> 1);
    const h = Math.max(1, height >> 1);
    this.aoTarget.setSize(w, h);
    (this.aoMaterial.uniforms.uTexel!.value as THREE.Vector2).set(1 / w, 1 / h);
    (this.blendMaterial.uniforms.uAoTexel!.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    // O `RenderPass` escreve no readBuffer e NÃO troca os buffers, então
    // este é o alvo cuja profundidade acabou de ser preenchida. Ler daqui,
    // e não de um `renderTarget1` fixo, é o que sobrevive ao rodízio de
    // buffers que os passes seguintes fazem entre quadros.
    const depth = readBuffer.depthTexture;
    if (!depth) {
      // Sem profundidade não há AO. Passar adiante em vez de escurecer
      // tudo: falha de configuração não deve virar tela preta, que é
      // exatamente como o `SAOPass` desapareceu sem explicar por quê.
      this.blendMaterial.uniforms.tAO!.value = null;
      this.blendMaterial.uniforms.uRaw!.value = 0;
    }

    if (depth) {
      this.aoMaterial.uniforms.tDepth!.value = depth;
      (this.aoMaterial.uniforms.uProjInv!.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
      const e = this.camera.projectionMatrix.elements;
      (this.aoMaterial.uniforms.uProjScale!.value as THREE.Vector2).set(e[0]! * 0.5, e[5]! * 0.5);

      renderer.setRenderTarget(this.aoTarget);
      this.quad.material = this.aoMaterial;
      this.quad.render(renderer);
      this.blendMaterial.uniforms.tAO!.value = this.aoTarget.texture;
    }

    this.blendMaterial.uniforms.tDiffuse!.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.blendMaterial;
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.aoTarget.dispose();
    this.aoMaterial.dispose();
    this.blendMaterial.dispose();
    this.quad.dispose();
  }
}

// ── Grade de cor ──────────────────────────────────────────────────────

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    /** Força da curva em S. */
    uContrast: { value: 1.10 },
    uSaturation: { value: 0.86 },
    /** Tinta da sombra e da luz — o split tone. */
    // 0x3c4a47, não 0x2b3a4a. O azul puro puxava a cena inteira pro teal e o
    // mundo do Mundo 1 é verde-acinzentado de mofo e pedra — verificado em
    // captura. Sombra fria aqui quer dizer VERDE frio, não azul de noite.
    uShadowTint: { value: new THREE.Color(0x3c4a47) },
    uLightTint: { value: new THREE.Color(0xffe9c4) },
    uVignette: { value: 0.30 },
    uGrain: { value: 0.028 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uContrast, uSaturation, uVignette, uGrain;
    uniform vec3 uShadowTint, uLightTint;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Curva em S em torno de 0.5. smoothstep sozinho fecharia demais as
      // pontas; a mistura por uContrast dá controle sem esmagar o preto.
      vec3 s = smoothstep(0.0, 1.0, c);
      c = mix(c, s, uContrast - 1.0 + 0.5);

      float l = luma(c);
      c = mix(vec3(l), c, uSaturation);

      // SPLIT TONE — e o detalhe que faz ou quebra: as tintas são
      // NORMALIZADAS pela própria luminância antes de multiplicar.
      //
      // A primeira versão multiplicava direto por 0x2b3a4a*2, que tem luma
      // ~0.45, então tingir a sombra também a escurecia pela metade. O
      // resultado, verificado em captura, foi uma imagem com os meios-tons
      // comidos e o guerreiro invisível. Split tone deve mudar TEMPERATURA,
      // não exposição; normalizar separa as duas coisas.
      vec3 shadowShift = uShadowTint / max(luma(uShadowTint), 0.001);
      vec3 lightShift  = uLightTint  / max(luma(uLightTint),  0.001);
      c = mix(c * shadowShift, c, smoothstep(0.0, 0.62, l));
      c = mix(c, c * lightShift, smoothstep(0.5, 1.0, l) * 0.7);

      // Vinheta suave. Forte demais come as altas — o jogo 2D descobriu
      // isso medindo: a vinheta derrubava o p99 de 0.84 pra 0.69 e o
      // specular sumia sem ninguém entender por quê.
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - smoothstep(0.42, 0.95, d) * uVignette;

      // Grão: existe pra quebrar o banding do céu em degradê, não pra
      // "dar textura". Por isso é sutil e some nas altas.
      float n = fract(sin(dot(vUv * 1024.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain * (1.0 - l * 0.6);

      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class Grade {
  private readonly composer: EffectComposer;
  private readonly grade: ShaderPass;
  private frame = 0;

  /**
   * SAO DESLIGADO — a decisão veio de ablação, não de gosto.
   *
   * Com ele na cadeia o canvas saía PRETO (o HUD em DOM continuava
   * aparecendo, que foi o que provou que a página vivia e só o render
   * morria). Desligando um passe por vez: sem SAO e com bloom, renderiza;
   * com SAO, preto.
   *
   * Fica atrás de flag em vez de removido como registro do que já foi
   * tentado. Quem procurar oclusão de contato agora acha `ContactAOPass`
   * acima, que é o que de fato roda. `#sao` liga isto pra depurar.
   */
  private readonly useSao = location.hash.includes("sao") && !location.hash.includes("nosao");
  private readonly useBloom = !location.hash.includes("nobloom");
  /**
   * SSAO também DESLIGADO. Diferente do SAO, ele renderiza — mas produz
   * LISTRAS VERTICAIS por toda a imagem, vindas da passada de normais que
   * ele guarda em buffer à parte (ver o comentário do `ContactAOPass`).
   * `#ssao` liga pra quem quiser ver o artefato de novo.
   */
  private readonly useSsao = location.hash.includes("ssao") && !location.hash.includes("nossao");

  /** Oclusão de contato LIGADA por padrão. `#noao` desliga, `#aoraw` isola. */
  private readonly useAo = !location.hash.includes("noao");

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    // O composer nasce com um alvo NOSSO, e a única diferença que importa
    // é o `depthTexture`: é ele que dá ao passe de AO a profundidade que
    // o `RenderPass` já escreveu, sem renderizar a cena uma segunda vez.
    // `clone()` copia o depth texture (cópia própria, não compartilhada),
    // então os dois buffers do rodízio ficam corretos.
    const dpr = renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    const target = new THREE.WebGLRenderTarget(bw, bh, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(bw, bh),
    });
    target.texture.name = "EffectComposer.rt1";

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    if (this.useAo) {
      this.composer.addPass(new ContactAOPass(camera, bw, bh, location.hash.includes("aoraw")));
    }

    if (this.useSsao) {
      const ssao = new SSAOPass(scene, camera, w, h);
      ssao.kernelRadius = 0.34;
      ssao.minDistance = 0.0022;
      ssao.maxDistance = 0.09;
      this.composer.addPass(ssao);
    }

    if (this.useSao) {
      const sao = new SAOPass(scene, camera);
      sao.params.saoScale = 0.9;
      sao.params.saoIntensity = 0.022;
      sao.params.saoKernelRadius = 14;
      sao.params.saoBlurRadius = 6;
      this.composer.addPass(sao);
    }

    // Limiar alto: só o que já é claro sangra. Bloom em tom médio vira
    // névoa leitosa e come o contraste que o palco precisa ter.
    if (this.useBloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.62, 0.82));

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  /** `frame`, não relógio: o grão precisa ser reproduzível no harness. */
  render(): void {
    const uTime = this.grade.uniforms.uTime;
    if (!uTime) throw new Error("GradeShader sem uniform uTime");
    uTime.value = (this.frame++ % 512) * 0.37;
    this.composer.render();
  }
}
