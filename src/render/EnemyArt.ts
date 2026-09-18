import { applyRimLight, SKY_RIM, type RimConfig } from "./RimLight";

/**
 * Arte dos inimigos. Módulo m2 do push AAA.
 *
 * O que havia antes: retângulos de 12x9 em vermelho #d82800 e roxo
 * #5030a0 chapados, montados à mão linha a linha, com 1-2 tons cada. O
 * jogador tinha um renderer procedural de 48KB; os inimigos tinham 60
 * linhas de fillRect. Gramática de NES.
 *
 * Duas decisões de ofício governam este arquivo:
 *
 * **Silhueta antes de qualquer detalhe.** A rubrica §6 do AAA_BRIEF exige
 * que walker e shooter sejam distinguíveis como manchas pretas a 16px. Por
 * isso o walker é BAIXO E LARGO, curvado pra frente, com uma corcova
 * assimétrica; e o shooter é ALTO E ESTREITO, ereto, com um braço erguido.
 * Se dois inimigos viram a mesma mancha, um dos dois está errado — e a
 * silhueta é o que resolve isso, não a cor.
 *
 * **A lore decide a forma.** The Rot corrói carne, pedra e memória. Estes
 * são da Região 1 (Terras Esquecidas), o começo da curva de tom:
 * estranhamento e negação, não horror explícito. Então: assimetria,
 * crescimento errado, coisas que continuaram se movendo depois que deviam
 * ter parado — e não gore. A paleta é dessaturada porque a cena inteira é;
 * vermelho e roxo saturados brigariam com o fundo e com o grade.
 *
 * ---------------------------------------------------------------------
 * LAYOUT DA FOLHA (rodada 9)
 *
 * A folha deixou de ser só o ciclo de caminhada. Ela agora tem quatro
 * blocos contíguos, nesta ordem, e **quem consome precisa das constantes
 * exportadas** — nada de multiplicar por 16 na mão:
 *
 *   [0..3]   WALK   ciclo de caminhada (contato/passagem)
 *   [4..7]   HURT   os mesmos 4 frames, na rampa de valor alta
 *   [8..10]  DEATH  colapso: cede -> dobra -> monte assentado
 *   [11..12] TELL   antecipação -> compromisso (investida/disparo)
 *
 * Índices 0..3 continuam sendo exatamente os frames de caminhada de antes,
 * então quem ainda faz `phase * 16` não quebra — só não vê o resto.
 * `enemyFrameIndex()` existe pra que a ligação seja UMA linha.
 */

export const SPRITE_SIZE = 16;
const SIZE = SPRITE_SIZE;

/**
 * Frames de caminhada. Inimigo que desliza pelo chao sem ciclo de passo e
 * um dos tells mais rapidos de jogo amador — o olho registra a ausencia
 * de contato com o solo mesmo sem saber o que esta errado.
 *
 * 4 frames num ciclo de contato-passagem-contato-passagem, que e o
 * minimo pra ler como andar em pixel art (Metal Slug usa 4-6 pros
 * inimigos comuns).
 */
export const WALK_FRAMES = 4;
export const WALK_FRAME_MS = 130;

/**
 * Dano. O flash anterior era `globalCompositeOperation = "lighter"` do
 * sprite inteiro: aditivo, o que empurra tudo pra branco de uma vez, come
 * o shading E vaza pra fora da forma quando encosta em qualquer coisa
 * clara atrás. Em 16 bits o dano nunca foi aditivo — era TROCA DE PALETA:
 * o mesmo sprite, mesma silhueta, mesma ordem de tons, só que a rampa
 * inteira comprimida no alto. A forma continua legível durante o flash,
 * e é justamente durante o flash que o jogador está olhando.
 *
 * Um frame por frame de caminhada, 1:1, pra que o flash não faça o ciclo
 * de passo pular no meio do hitstop.
 */
export const HURT_FRAMES = WALK_FRAMES;

/**
 * Morte. Três frames: cede, dobra, assenta — e o terceiro FICA. É a pose
 * final que dá peso, não a animação; a animação só explica como chegou
 * lá. Antes o inimigo morto era o frame 0 de caminhada em alpha 0.2: uma
 * criatura em pé, andando, translúcida. Isso não lê como morte, lê como
 * bug de render.
 *
 * O hitstop (4 frames no golpe normal, ~10 no carregado) segura os dois
 * primeiros frames; é a janela em que o colapso pode ser visto.
 *
 * O que se apaga é o OLHO, não o corpo — a lore da Região 1 pede o
 * detalhe que se apaga, não o gore.
 */
export const DEATH_FRAMES = 3;
export const DEATH_FRAME_MS = 70;

/**
 * Telégrafo de ataque: [0] antecipação, [1] compromisso.
 *
 * O shooter já tinha aviso (o brilho externo antes do tiro) mas nenhuma
 * POSE — a criatura ficava parada enquanto uma bola de luz aparecia do
 * lado dela. O walker não tinha aviso nenhum: encostava e tirava vida.
 * Dano sem antecipação lê como injustiça, não como dificuldade.
 *
 * Os dois blocos compartilham o mesmo par de slots porque a gramática é a
 * mesma: recolher, depois soltar. Walker recua e agacha antes de avançar;
 * shooter puxa o braço antes de lançar.
 */
export const TELL_FRAMES = 2;

export const WALK_OFFSET = 0;
export const HURT_OFFSET = WALK_OFFSET + WALK_FRAMES;
export const DEATH_OFFSET = HURT_OFFSET + HURT_FRAMES;
export const TELL_OFFSET = DEATH_OFFSET + DEATH_FRAMES;
export const TOTAL_FRAMES = TELL_OFFSET + TELL_FRAMES;

/**
 * Duração recomendada do flash de dano. 50ms ≈ 3 frames a 60fps: o
 * suficiente pro olho registrar, curto o bastante pra não virar um sprite
 * branco piscando. (Enemy.ts usa 90ms hoje — decisão de gameplay, não
 * minha; fica aqui como recomendação de arte.)
 */
export const HURT_FLASH_MS = 50;

const WALKER = {
  hide: "#5a5344",
  hideMid: "#463f33",
  hideLo: "#332e25",
  hideDeep: "#201d17",
  /** Ocre da praga. Usar pouco: é acento, não cor de base. */
  rot: "#6e6a34",
  rotLo: "#4a4724",
  bone: "#8f8873",
  eye: "#c4a63a",
  /** Olho morrendo: o mesmo ocre drenado. Ponte entre aceso e apagado. */
  eyeDim: "#6b5c26",
};

const SHOOTER = {
  robe: "#4a4a55",
  robeMid: "#3a3a44",
  robeLo: "#2b2b33",
  robeDeep: "#1b1b21",
  rot: "#5f6b45",
  bone: "#9a9484",
  /** Um degrau acima de `robe`. Existe só pras poses de morte: deitado,
   *  o manto passa a ser quase todo topo virado pra luz, e no valor de
   *  repouso o cadáver empatava com o chão e sumia. */
  robeHi: "#5c5c68",
  eye: "#7fc4d8",
  eyeDim: "#3f6470",
};

/**
 * Rim mais fraco e mais fino pras poses de morte.
 *
 * Não é preciosismo: o rim decide o que é borda pelo alpha dos vizinhos, e
 * uma pose deitada é quase toda "topo virado pra luz". Com o SKY_RIM cheio
 * o cadáver saía mais claro que o inimigo vivo — a coisa morta virava o
 * elemento mais brilhante da tela. Metade da força e 1px de espessura
 * mantêm a separação contra o chão sem trazer o corpo pra frente.
 */
const DEATH_RIM: RimConfig = { ...SKY_RIM, strength: 0.42, width: 1 };

function px(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

/**
 * Walker — baixo, largo, curvado. A corcova fica de um lado só: simetria
 * é o que faz criatura corrompida parecer mascote.
 */
function drawWalker(c: CanvasRenderingContext2D, f: number): void {
  // massa do corpo, de baixo pra cima
  px(c, 2, 8, 12, 6, WALKER.hideLo);
  px(c, 3, 6, 10, 4, WALKER.hideMid);
  px(c, 4, 5, 8, 3, WALKER.hide);

  // corcova assimétrica — cresceu errado, e só de um lado
  px(c, 8, 3, 5, 4, WALKER.hideMid);
  px(c, 9, 2, 3, 2, WALKER.hide);
  px(c, 9, 2, 2, 1, WALKER.bone);

  // cabeça baixa, projetada pra frente
  px(c, 1, 7, 4, 4, WALKER.hideMid);
  px(c, 0, 8, 3, 3, WALKER.hide);
  px(c, 0, 9, 1, 1, WALKER.eye);

  // Patas em ciclo alternado. Pares opostos se movem juntos (como
  // quadrupede de verdade), e o corpo ja sobe/desce via bob no chamador.
  const a = f % 2 === 0 ? 0 : 1;
  const b = 1 - a;
  px(c, 3, 13 + a, 2, 3 - a, WALKER.hideDeep);
  px(c, 7, 13 + b, 2, 2 + a, WALKER.hideDeep);
  px(c, 10, 13 + a, 2, 3 - a, WALKER.hideDeep);
  px(c, 12, 13 + b, 1, 2 + a, WALKER.hideDeep);

  // a praga nas frestas: entre a corcova e o lombo, onde a umidade fica
  px(c, 7, 5, 2, 1, WALKER.rot);
  px(c, 10, 6, 2, 1, WALKER.rotLo);
  px(c, 5, 9, 1, 2, WALKER.rotLo);

  // costelas expostas — memória de um animal que já foi inteiro
  px(c, 4, 8, 1, 3, WALKER.bone);
  px(c, 6, 8, 1, 2, WALKER.bone);

  // oclusão sob a barriga: assenta a criatura, não deixa flutuar
  px(c, 3, 12, 10, 1, WALKER.hideDeep);
}

/**
 * Colapso do walker. A leitura é "as patas cederam primeiro": a massa
 * desaba antes da cabeça, e a corcova — que é osso mal-crescido — é a
 * última coisa a assentar. No frame final o bicho virou um monte
 * compacto e corcunda; contra o do shooter (uma poça larga e rasa) as
 * duas silhuetas continuam opostas mesmo mortas, que é o teste da §6.
 */
function drawWalkerDeath(c: CanvasRenderingContext2D, f: number): void {
  if (f === 0) {
    // Cede. Tudo desce 2px, as patas dobram pra fora e a cabeça mergulha.
    // Único frame em que o olho ainda está aceso.
    px(c, 2, 15, 12, 1, WALKER.hideDeep);
    px(c, 2, 10, 12, 5, WALKER.hideLo);
    px(c, 3, 8, 10, 3, WALKER.hideMid);
    px(c, 4, 7, 8, 2, WALKER.hide);

    // a corcova ainda tem inércia — não desceu junto com o resto
    px(c, 8, 5, 5, 4, WALKER.hideMid);
    px(c, 9, 4, 3, 2, WALKER.hide);
    px(c, 9, 4, 2, 1, WALKER.bone);

    // cabeça mergulhando pro chão, pescoço sem sustentação
    px(c, 1, 11, 4, 4, WALKER.hideMid);
    px(c, 0, 12, 3, 3, WALKER.hide);
    px(c, 0, 13, 1, 1, WALKER.eye);

    // patas dobrando pra fora, joelho pra cima
    px(c, 2, 14, 2, 2, WALKER.hideDeep);
    px(c, 5, 15, 3, 1, WALKER.hideDeep);
    px(c, 10, 14, 2, 2, WALKER.hideDeep);
    px(c, 12, 15, 2, 1, WALKER.hideDeep);

    px(c, 7, 7, 2, 1, WALKER.rot);
    px(c, 5, 11, 1, 2, WALKER.rotLo);
    px(c, 4, 10, 1, 3, WALKER.bone);
    px(c, 6, 10, 1, 2, WALKER.bone);
    return;
  }

  if (f === 1) {
    // Dobra. O corpo achata, a cabeça já está no chão, a corcova tomba
    // pro lado. Uma pata dianteira ficou pra cima — continuou se movendo
    // depois que devia ter parado.
    px(c, 1, 12, 14, 4, WALKER.hideLo);
    px(c, 1, 15, 14, 1, WALKER.hideDeep);
    px(c, 3, 10, 10, 3, WALKER.hideMid);
    px(c, 5, 9, 6, 2, WALKER.hide);

    // corcova tombada, agora um caroço lateral
    px(c, 9, 8, 4, 3, WALKER.hideMid);
    px(c, 10, 8, 2, 1, WALKER.bone);

    // cabeça deitada, focinho no chão
    px(c, 0, 12, 4, 4, WALKER.hideMid);
    px(c, 0, 13, 3, 3, WALKER.hide);
    px(c, 0, 14, 1, 1, WALKER.eyeDim);

    // patas espalhadas, e uma ainda erguida
    px(c, 2, 15, 3, 1, WALKER.hideDeep);
    px(c, 6, 15, 4, 1, WALKER.hideDeep);
    px(c, 11, 15, 3, 1, WALKER.hideDeep);
    px(c, 13, 10, 1, 3, WALKER.hideDeep);
    px(c, 13, 9, 2, 1, WALKER.hideDeep);

    px(c, 6, 11, 1, 2, WALKER.bone);
    px(c, 4, 11, 1, 2, WALKER.bone);
    px(c, 7, 9, 2, 1, WALKER.rotLo);
    px(c, 3, 14, 2, 1, WALKER.rotLo);
    return;
  }

  // Assenta. MONTE, não poça: a massa se recolhe num caroço de 7px de
  // pico e 12 de largura, com o cume fora do centro. A distinção importa —
  // o shooter morto vira uma poça de 16x5 e as duas silhuetas continuam
  // opostas depois de mortas, que é o mesmo teste da §6 aplicado ao
  // estado que o jogador mais olha (o hitstop segura a câmera nele).
  //
  // O olho apagou; sobrou a órbita. As costelas ficaram por cima porque a
  // carne cedeu ao redor delas, e a praga escorreu pra fora da massa:
  // continua trabalhando depois que o bicho parou.
  px(c, 1, 12, 12, 4, WALKER.hideLo);
  px(c, 1, 15, 12, 1, WALKER.hideDeep);
  px(c, 3, 11, 8, 1, WALKER.hideMid);

  // o caroço da corcova, deslocado do centro — é o que dá o pico
  px(c, 6, 10, 6, 2, WALKER.hideMid);
  px(c, 7, 9, 4, 2, WALKER.hideMid);
  px(c, 8, 9, 3, 1, WALKER.hide);
  px(c, 8, 9, 2, 1, WALKER.bone);

  // costelas emergindo do lombo afundado
  px(c, 3, 12, 1, 3, WALKER.bone);
  px(c, 5, 12, 1, 2, WALKER.bone);

  // crânio de lado, órbita vazia
  px(c, 0, 13, 4, 3, WALKER.hideMid);
  px(c, 0, 12, 3, 1, WALKER.hideLo);
  px(c, 1, 13, 1, 1, WALKER.hideDeep);

  // a pata que ficou pra cima, rígida
  px(c, 12, 10, 1, 3, WALKER.hideDeep);
  px(c, 12, 9, 2, 1, WALKER.hideDeep);

  // praga escorrendo pra fora, no chão
  px(c, 2, 15, 2, 1, WALKER.rotLo);
  px(c, 6, 15, 3, 1, WALKER.rot);
  px(c, 10, 15, 2, 1, WALKER.rotLo);
}

/**
 * Telégrafo do walker: recolher, depois soltar.
 *
 * [0] recuo/agachamento — a massa vai PRA TRÁS e PRA BAIXO, as quatro
 *     patas se juntam sob o corpo, a cabeça se recolhe. Silhueta mais
 *     curta e mais compacta que a de caminhada: é essa diferença de
 *     mancha que o jogador lê, não os detalhes.
 * [1] investida — o oposto exato: esticado, cabeça lançada à frente
 *     ultrapassando a linha do corpo, patas abertas nas duas pontas.
 *
 * Curto-e-alto seguido de longo-e-baixo é a leitura de antecipação mais
 * antiga que existe em animação, e funciona a 16px porque é diferença de
 * PROPORÇÃO, não de detalhe.
 */
function drawWalkerTell(c: CanvasRenderingContext2D, f: number): void {
  if (f === 0) {
    // Recolhido. A pegada inteira encolhe: 12px de largura contra 15 da
    // caminhada, e o topo cai de y=2 pra y=6. A corcova afunda entre os
    // ombros em vez de crescer — a criatura junta massa antes de gastá-la.
    px(c, 6, 10, 10, 4, WALKER.hideLo);
    px(c, 6, 13, 10, 1, WALKER.hideDeep);
    px(c, 7, 8, 8, 3, WALKER.hideMid);
    px(c, 8, 7, 6, 2, WALKER.hide);

    // corcova comprimida pela tensão — mais baixa e mais gorda
    px(c, 10, 6, 5, 3, WALKER.hideMid);
    px(c, 11, 6, 3, 1, WALKER.hide);
    px(c, 11, 6, 2, 1, WALKER.bone);

    // cabeça recolhida, queixo contra o peito
    px(c, 5, 9, 4, 4, WALKER.hideMid);
    px(c, 4, 10, 3, 3, WALKER.hide);
    px(c, 4, 11, 1, 1, WALKER.eye);

    // as quatro patas reunidas sob a massa, prontas pra empurrar
    px(c, 7, 13, 2, 3, WALKER.hideDeep);
    px(c, 9, 13, 2, 3, WALKER.hideDeep);
    px(c, 12, 13, 2, 3, WALKER.hideDeep);
    px(c, 14, 13, 2, 3, WALKER.hideDeep);

    px(c, 9, 7, 2, 1, WALKER.rot);
    px(c, 13, 8, 2, 1, WALKER.rotLo);
    px(c, 8, 11, 1, 2, WALKER.rotLo);
    px(c, 7, 10, 1, 3, WALKER.bone);
    px(c, 9, 10, 1, 2, WALKER.bone);
    return;
  }

  // Estirado. A pegada volta a 16px e o topo continua baixo (y=5): longo e
  // raso é a leitura oposta de curto e alto, e é a diferença entre os dois
  // frames que o jogador lê, não o desenho de nenhum dos dois sozinho.
  px(c, 3, 8, 13, 5, WALKER.hideLo);
  px(c, 4, 12, 12, 1, WALKER.hideDeep);
  px(c, 4, 7, 11, 3, WALKER.hideMid);
  px(c, 5, 6, 8, 2, WALKER.hide);

  // corcova achatada pelo estiramento
  px(c, 9, 5, 5, 2, WALKER.hideMid);
  px(c, 10, 5, 2, 1, WALKER.bone);

  // cabeça lançada à frente, pescoço esticado, encosta na borda do frame
  px(c, 4, 9, 2, 2, WALKER.hideMid);
  px(c, 1, 8, 4, 4, WALKER.hideMid);
  px(c, 0, 9, 3, 3, WALKER.hide);
  px(c, 0, 10, 1, 1, WALKER.eye);

  // dianteiras estendidas à frente, traseiras ainda no impulso
  px(c, 2, 12, 3, 2, WALKER.hideDeep);
  px(c, 5, 13, 2, 3, WALKER.hideDeep);
  px(c, 11, 13, 2, 3, WALKER.hideDeep);
  px(c, 14, 12, 2, 2, WALKER.hideDeep);

  px(c, 7, 6, 2, 1, WALKER.rot);
  px(c, 12, 7, 2, 1, WALKER.rotLo);
  px(c, 6, 9, 1, 2, WALKER.bone);
  px(c, 8, 9, 1, 2, WALKER.bone);
}

/**
 * Shooter — alto, estreito, ereto, braço erguido. O oposto exato do
 * walker em proporção, que é o que os separa em preto puro.
 */
function drawShooter(c: CanvasRenderingContext2D, f: number): void {
  // manto: cone estreito, base larga
  px(c, 5, 5, 6, 11, SHOOTER.robeMid);
  px(c, 4, 11, 8, 5, SHOOTER.robeLo);
  px(c, 6, 4, 4, 3, SHOOTER.robe);
  px(c, 4, 14, 9, 2, SHOOTER.robeDeep);

  // capuz e o vazio dentro dele
  px(c, 6, 2, 4, 4, SHOOTER.robe);
  px(c, 5, 3, 6, 3, SHOOTER.robeMid);
  px(c, 6, 4, 4, 2, SHOOTER.robeDeep);
  px(c, 7, 4, 1, 1, SHOOTER.eye);
  px(c, 9, 4, 1, 1, SHOOTER.eye);

  // braço erguido: é o que anuncia "este atira" antes de atirar
  px(c, 11, 5, 2, 2, SHOOTER.robeMid);
  px(c, 12, 3, 2, 3, SHOOTER.bone);
  px(c, 13, 2, 1, 2, SHOOTER.bone);

  // dobras verticais do tecido — 3 tons dão volume ao cone
  px(c, 6, 7, 1, 7, SHOOTER.robeLo);
  px(c, 9, 8, 1, 6, SHOOTER.robeLo);
  px(c, 8, 6, 1, 8, SHOOTER.robe);

  // a praga subindo pela barra do manto, seguindo a gravidade ao contrário
  px(c, 5, 13, 2, 1, SHOOTER.rot);
  px(c, 9, 12, 2, 1, SHOOTER.rot);
  px(c, 7, 15, 3, 1, SHOOTER.rot);

  // Barra do manto ondulando: o shooter nao anda, desliza — entao o
  // ciclo dele e o tecido se movendo, nao passo.
  const sway = [0, 1, 0, -1][f % 4]!;
  px(c, 4, 15, 3, 1, SHOOTER.robeDeep);
  px(c, 4 + sway + 3, 15, 3, 1, SHOOTER.robeLo);
  px(c, 10 + sway, 15, 3, 1, SHOOTER.robeDeep);
}

/**
 * Colapso do shooter. Aqui a lore faz o trabalho pesado: o manto cai
 * COMO SE NÃO HOUVESSE NADA DENTRO. Não é um corpo tombando, é tecido
 * perdendo o que o sustentava — e é a coisa mais perturbadora que dá pra
 * fazer com 16px sem apelar pra gore.
 *
 * O frame final é uma poça larga e rasa: 15px de largura por 4 de altura,
 * o extremo oposto do monte compacto do walker.
 */
function drawShooterDeath(c: CanvasRenderingContext2D, f: number): void {
  if (f === 0) {
    // Cede. O braço despenca primeiro, o capuz tomba pra trás, o cone
    // encurta 3px. Os olhos ainda acesos, agora apontando pro nada.
    px(c, 3, 15, 11, 1, SHOOTER.robeDeep);
    px(c, 4, 8, 8, 8, SHOOTER.robe);
    px(c, 3, 12, 10, 4, SHOOTER.robeMid);

    // capuz tombando pra trás, o vazio virado pra cima
    px(c, 7, 5, 5, 4, SHOOTER.robeHi);
    px(c, 8, 6, 4, 3, SHOOTER.robe);
    px(c, 9, 6, 3, 2, SHOOTER.robeDeep);
    px(c, 9, 7, 1, 1, SHOOTER.eye);
    px(c, 11, 6, 1, 1, SHOOTER.eyeDim);

    // braço despencando, mão ainda aberta
    px(c, 12, 9, 2, 2, SHOOTER.robe);
    px(c, 13, 10, 2, 2, SHOOTER.bone);

    // as dobras se soltam: o tecido perde a linha vertical
    px(c, 5, 10, 1, 4, SHOOTER.robeMid);
    px(c, 8, 11, 1, 4, SHOOTER.robeMid);
    px(c, 10, 12, 1, 3, SHOOTER.robeHi);
    px(c, 4, 14, 2, 1, SHOOTER.rot);
    return;
  }

  if (f === 1) {
    // Dobra. O cone colapsa sobre si mesmo — o capuz cai à frente e o
    // tecido se espalha. A mão de osso já se soltou do braço.
    px(c, 2, 15, 13, 1, SHOOTER.robeDeep);
    px(c, 2, 11, 12, 5, SHOOTER.robeMid);
    px(c, 4, 9, 8, 3, SHOOTER.robe);

    // capuz caindo pra frente, vazio de boca pra baixo
    px(c, 8, 8, 5, 4, SHOOTER.robeHi);
    px(c, 9, 9, 3, 3, SHOOTER.robe);
    px(c, 10, 10, 2, 2, SHOOTER.robeDeep);
    px(c, 10, 10, 1, 1, SHOOTER.eyeDim);

    // vincos radiais saindo de onde o corpo estava
    px(c, 4, 12, 1, 4, SHOOTER.robeDeep);
    px(c, 7, 12, 1, 4, SHOOTER.robeDeep);
    px(c, 12, 13, 1, 3, SHOOTER.robeDeep);

    // a mão, solta, dedos pra cima
    px(c, 13, 12, 2, 1, SHOOTER.bone);
    px(c, 14, 11, 1, 1, SHOOTER.bone);

    px(c, 5, 14, 2, 1, SHOOTER.rot);
    px(c, 9, 15, 2, 1, SHOOTER.rot);
    return;
  }

  // Assenta. Pano vazio no chão. Nenhum olho — é isso que se apaga.
  // O capuz continua com forma de capuz, e é a única coisa que denuncia
  // que aquilo já foi alguém.
  px(c, 1, 15, 15, 1, SHOOTER.robeDeep);
  px(c, 1, 13, 15, 3, SHOOTER.robeMid);
  px(c, 2, 12, 12, 1, SHOOTER.robe);

  // vincos radiais — o tecido lembra de onde desabou
  px(c, 4, 13, 1, 3, SHOOTER.robeDeep);
  px(c, 8, 13, 1, 3, SHOOTER.robeDeep);
  px(c, 11, 13, 1, 2, SHOOTER.robeDeep);
  px(c, 6, 13, 1, 2, SHOOTER.robeHi);

  // capuz achatado, ainda em forma de cúpula, com o vazio dentro
  px(c, 9, 11, 5, 2, SHOOTER.robe);
  px(c, 10, 10, 3, 1, SHOOTER.robeHi);
  px(c, 11, 11, 2, 1, SHOOTER.robeDeep);

  // a mão que sobrou, dedos recolhidos
  px(c, 1, 12, 2, 1, SHOOTER.bone);
  px(c, 0, 13, 2, 1, SHOOTER.bone);

  // a praga saindo de baixo do pano — ela não morreu junto
  px(c, 5, 15, 3, 1, SHOOTER.rot);
  px(c, 12, 15, 3, 1, SHOOTER.rot);
}

/**
 * Telégrafo do shooter: recolher, depois soltar.
 *
 * O brilho externo que o TilemapGame já desenha continua válido — mas
 * brilho sozinho é um efeito ao lado da criatura, não uma criatura se
 * preparando. Aqui o corpo participa: [0] o braço puxa pra trás e o manto
 * se retesa em torno de uma coisa que ainda não existe; [1] o braço se
 * lança à frente e o manto é arrastado atrás.
 */
function drawShooterTell(c: CanvasRenderingContext2D, f: number): void {
  if (f === 0) {
    // Recolhido. O capuz AFUNDA entre os ombros e o braço volta pro corpo:
    // a silhueta perde a farpa do braço erguido e fica 2px mais curta que a
    // de repouso. Some o que identifica o shooter — e é justamente essa
    // ausência que avisa. O jogador não precisa saber por quê.
    px(c, 5, 7, 6, 9, SHOOTER.robeMid);
    px(c, 4, 11, 8, 5, SHOOTER.robeLo);
    px(c, 6, 6, 4, 3, SHOOTER.robe);
    px(c, 4, 14, 9, 2, SHOOTER.robeDeep);

    // capuz submerso, ombros subindo em volta dele
    px(c, 6, 4, 4, 4, SHOOTER.robe);
    px(c, 5, 5, 6, 3, SHOOTER.robeMid);
    px(c, 6, 6, 4, 2, SHOOTER.robeDeep);
    px(c, 7, 6, 1, 1, SHOOTER.eye);
    px(c, 9, 6, 1, 1, SHOOTER.eye);
    px(c, 4, 7, 2, 2, SHOOTER.robeMid);
    px(c, 10, 7, 2, 2, SHOOTER.robeMid);

    // braço recolhido junto ao quadril, mão fechada
    px(c, 11, 9, 2, 2, SHOOTER.robeMid);
    px(c, 12, 10, 2, 2, SHOOTER.bone);

    // as dobras se juntam pro mesmo lado — tensão, não repouso
    px(c, 6, 9, 1, 5, SHOOTER.robeLo);
    px(c, 9, 9, 1, 5, SHOOTER.robeLo);
    px(c, 8, 8, 1, 6, SHOOTER.robe);

    px(c, 5, 13, 2, 1, SHOOTER.rot);
    px(c, 9, 12, 2, 1, SHOOTER.rot);
    px(c, 4, 15, 4, 1, SHOOTER.robeDeep);
    px(c, 9, 15, 4, 1, SHOOTER.robeDeep);
    return;
  }

  // Soltou. Estica 2px acima da altura de repouso e o braço vai à frente na
  // horizontal, até a borda do frame. O manto é arrastado atrás, pro lado
  // oposto do lançamento.
  px(c, 5, 5, 6, 11, SHOOTER.robeMid);
  px(c, 4, 11, 8, 5, SHOOTER.robeLo);
  px(c, 6, 4, 4, 3, SHOOTER.robe);
  px(c, 4, 14, 9, 2, SHOOTER.robeDeep);

  px(c, 6, 1, 4, 4, SHOOTER.robe);
  px(c, 5, 2, 6, 3, SHOOTER.robeMid);
  px(c, 6, 3, 4, 2, SHOOTER.robeDeep);
  px(c, 7, 3, 1, 1, SHOOTER.eyeDim);
  px(c, 9, 3, 1, 1, SHOOTER.eyeDim);

  // braço estendido pra frente, mão aberta na ponta
  px(c, 10, 6, 3, 2, SHOOTER.robeMid);
  px(c, 12, 6, 3, 2, SHOOTER.bone);
  px(c, 14, 5, 1, 1, SHOOTER.bone);
  px(c, 14, 8, 1, 1, SHOOTER.bone);

  // o tecido reagindo ao lançamento: dobras puxadas pra trás
  px(c, 6, 7, 1, 7, SHOOTER.robeLo);
  px(c, 9, 8, 1, 6, SHOOTER.robeLo);
  px(c, 8, 6, 1, 8, SHOOTER.robe);
  px(c, 2, 12, 3, 3, SHOOTER.robeLo);
  px(c, 2, 13, 2, 2, SHOOTER.robeDeep);

  px(c, 5, 13, 2, 1, SHOOTER.rot);
  px(c, 9, 12, 2, 1, SHOOTER.rot);
  px(c, 7, 15, 3, 1, SHOOTER.rot);
  px(c, 4, 15, 3, 1, SHOOTER.robeDeep);
  px(c, 11, 15, 2, 1, SHOOTER.robeDeep);
}

/**
 * Rampa de dano: mesma imagem, mesma silhueta, mesma ORDEM de tons — só
 * comprimida no topo da escala. É a troca de paleta de 16 bits, feita
 * como tabela de luminância porque aqui não existe paleta indexada.
 *
 * A curva (expoente < 1) abre o pé da rampa: sem ela os quatro tons
 * escuros do walker colapsariam num só valor e a forma sumiria — que é
 * exatamente o defeito do modo aditivo que isto substitui.
 */
const BLEACH_LO = [150, 158, 148] as const;
const BLEACH_HI = [255, 255, 250] as const;

function bleach(ctx: CanvasRenderingContext2D, x0: number, w: number, h: number): void {
  const img = ctx.getImageData(x0, 0, w, h);
  const d = img.data;

  // Normaliza pela faixa REAL do sprite antes de remapear. Aplicar a curva
  // direto na luminância absoluta foi a primeira tentativa e falhou: o
  // walker inteiro vive entre 0.11 e 0.6 de luminância, então a rampa
  // recebia meia escala e devolvia um borrão branco uniforme — o mesmo
  // defeito do modo aditivo, só que por outro caminho. Normalizando, os
  // quatro tons do corpo ocupam a rampa inteira e o shading sobrevive.
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! <= 8) continue;
    const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
    if (lum < lo) lo = lum;
    if (lum > hi) hi = lum;
  }
  const span = Math.max(1e-3, hi - lo);

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! <= 8) continue;
    const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255;
    const n = (lum - lo) / span;
    // O piso em 0.28 é o que faz "quase-branco": nem o pixel mais escuro
    // do sprite volta pra sombra durante o flash.
    const t = 0.28 + 0.72 * Math.pow(n, 0.65);
    d[i] = Math.round(BLEACH_LO[0] + (BLEACH_HI[0] - BLEACH_LO[0]) * t);
    d[i + 1] = Math.round(BLEACH_LO[1] + (BLEACH_HI[1] - BLEACH_LO[1]) * t);
    d[i + 2] = Math.round(BLEACH_LO[2] + (BLEACH_HI[2] - BLEACH_LO[2]) * t);
  }
  ctx.putImageData(img, x0, 0);
}

interface EnemyArtSet {
  walk: (c: CanvasRenderingContext2D, f: number) => void;
  death: (c: CanvasRenderingContext2D, f: number) => void;
  tell: (c: CanvasRenderingContext2D, f: number) => void;
}

function buildSheet(art: EnemyArtSet): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * TOTAL_FRAMES;
  canvas.height = SIZE;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("EnemyArt: contexto 2d indisponível");
  c.imageSmoothingEnabled = false;

  // Cada frame é montado numa célula isolada de 16x16 e só depois colado
  // na folha. Isso existe por causa do rim light: ele decide o que é
  // borda olhando o alpha dos vizinhos, e numa folha contígua o pixel
  // x=15 de um frame é "vizinho" do x=0 do frame seguinte. Com o ciclo de
  // caminhada isso passava batido (nenhum frame encostava na borda
  // direita); com as poses de morte, que são largas de propósito, os
  // frames se tocariam e o rim sumiria justo na silhueta que mais precisa
  // dele.
  const cell = document.createElement("canvas");
  cell.width = SIZE;
  cell.height = SIZE;
  const cc = cell.getContext("2d");
  if (!cc) throw new Error("EnemyArt: contexto 2d da célula indisponível");
  cc.imageSmoothingEnabled = false;

  const paint = (index: number, drawFn: () => void, rim: RimConfig = SKY_RIM): void => {
    cc.clearRect(0, 0, SIZE, SIZE);
    cc.save();
    drawFn();
    cc.restore();
    // Mesmo rim light do guerreiro: a luz da cena vem do horizonte, e sem
    // ele os inimigos afundam no cenário escuro exatamente como o
    // guerreiro afundava.
    applyRimLight(cc, SIZE, SIZE, rim);
    c.drawImage(cell, index * SIZE, 0);
  };

  for (let f = 0; f < WALK_FRAMES; f++) {
    paint(WALK_OFFSET + f, () => {
      // Bob vertical: sobe 1px nos frames de passagem. Sem isso o ciclo de
      // pernas sozinho ainda le como patinacao.
      cc.translate(0, f % 2 === 0 ? 0 : -1);
      art.walk(cc, f);
    });
  }
  for (let f = 0; f < DEATH_FRAMES; f++) paint(DEATH_OFFSET + f, () => art.death(cc, f), DEATH_RIM);
  for (let f = 0; f < TELL_FRAMES; f++) paint(TELL_OFFSET + f, () => art.tell(cc, f));

  // Os frames de dano são os de caminhada já prontos (rim incluso) com a
  // rampa remapeada. Copiar em vez de redesenhar garante que a silhueta
  // do flash seja IDÊNTICA à do frame que ele substitui — se divergisse
  // um pixel, o flash leria como um sprite diferente piscando.
  c.drawImage(
    canvas,
    WALK_OFFSET * SIZE, 0, WALK_FRAMES * SIZE, SIZE,
    HURT_OFFSET * SIZE, 0, WALK_FRAMES * SIZE, SIZE,
  );
  bleach(c, HURT_OFFSET * SIZE, HURT_FRAMES * SIZE, SIZE);

  return canvas;
}

export function buildWalkerSprite(): HTMLCanvasElement {
  return buildSheet({ walk: drawWalker, death: drawWalkerDeath, tell: drawWalkerTell });
}

export function buildShooterSprite(): HTMLCanvasElement {
  return buildSheet({ walk: drawShooter, death: drawShooterDeath, tell: drawShooterTell });
}

export interface EnemyFrameState {
  alive: boolean;
  /** Fase do ciclo de caminhada, já em [0, WALK_FRAMES). */
  walkPhase: number;
  /** Levou dano agora (Enemy.isHitFlashing). */
  hurt?: boolean;
  /**
   * ms desde a morte. Se vier undefined/NaN, cai direto na pose final —
   * o colapso animado é opcional, a pose de morte não.
   */
  deathMs?: number;
  /**
   * 0..1 — progresso da preparação de ataque. Shooter: `fireCharge`, que
   * já existe. Walker: precisa de estado novo no gameplay (ver relatório).
   * 0 ou undefined = sem telégrafo.
   */
  tell?: number;
}

/**
 * Índice do frame na folha. Existe para que ligar isto no renderer seja
 * uma linha só, e para que a prioridade entre estados fique num lugar só
 * em vez de espalhada em ifs no laço de desenho.
 *
 * Prioridade: morte > dano > telégrafo > caminhada. Dano vence telégrafo
 * porque acertar um inimigo no meio da preparação é exatamente o momento
 * em que o jogador precisa da confirmação de que interrompeu alguma coisa.
 */
export function enemyFrameIndex(state: EnemyFrameState): number {
  if (!state.alive) {
    const t = state.deathMs;
    if (t === undefined || !Number.isFinite(t)) return DEATH_OFFSET + DEATH_FRAMES - 1;
    const i = Math.floor(Math.max(0, t) / DEATH_FRAME_MS);
    return DEATH_OFFSET + Math.min(i, DEATH_FRAMES - 1);
  }

  const phase = ((state.walkPhase % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
  if (state.hurt) return HURT_OFFSET + phase;

  const tell = state.tell ?? 0;
  // O compromisso só entra bem no fim: a antecipação precisa durar mais
  // que o ataque, senão não há o que ler.
  if (tell > 0.02) return TELL_OFFSET + (tell < 0.82 ? 0 : 1);

  return WALK_OFFSET + phase;
}
