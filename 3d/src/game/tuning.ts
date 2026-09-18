/**
 * Todos os números de game feel num lugar só.
 *
 * Princípio herdado do projeto (CLAUDE.md): física e combate vêm de
 * presets nomeados, nunca de números mágicos espalhados. O motivo é
 * prático — game feel se ajusta JOGANDO, e ajustar exige que os números
 * estejam onde dá pra achar.
 *
 * Unidades: 1 unidade de mundo = 1 metro aproximado. O guerreiro tem ~1.7.
 */

export const MOVE = {
  /** Aceleração no chão (u/s²). */
  accel: 78,
  /** Desaceleração sem input, no chão. */
  frictionGround: 92,
  /** Desaceleração sem input, no ar. Menor: no ar não há atrito com o solo. */
  frictionAir: 34,
  maxSpeed: 10.6,
  /** Fração da aceleração disponível no ar. */
  airControl: 0.78,

  /**
   * MEDIDO, não derivado: a altura real do pulo é **3.31u**, não os 3.47u
   * que a fórmula analítica dá. A perda de 4.5% é da integração discreta a
   * 60Hz (Euler explícito perde altura contra o contínuo).
   *
   * Isso importa pra desenhar fase: margens dimensionadas na fórmula ficam
   * 4.5% mais apertadas do que se pensa. Use 3.31 — e meça de novo se o
   * passo fixo mudar. `3d/harness/traverse.mjs` é onde isso se confere.
   */
  jumpVelocity: 19,
  /**
   * Gravidade de SUBIDA e de QUEDA, separadas — e a razão entre elas é o
   * número mais importante deste arquivo.
   *
   * Pulo real cai mais rápido do que sobe. Quando a razão fica perto de 1
   * o corpo lê como boneco puxado por barbante, e o jogador descreve isso
   * como "movimentação estranha" sem conseguir nomear. Razão aqui: 1.92.
   * Faixa que se sustenta em plataforma: 1.8 a 2.2.
   */
  gravityUp: 52,
  gravityDown: 100,
  /** Corte ao soltar o pulo ainda subindo — altura variável. */
  jumpCutoff: 0.45,
  /** Velocidade terminal: sem isso a queda longa vira teleporte. */
  maxFallSpeed: 34,

  /** Janela pós-borda em que ainda dá pra pular. */
  coyoteMs: 110,
  /** Janela de pulo apertado ANTES de encostar no chão. */
  jumpBufferMs: 140,
} as const;

export const CAMERA = {
  /**
   * ENQUADRAMENTO DINÂMICO. A distância não é mais um número só: a câmera
   * respira entre `distanceNear` (parado, combate, andando devagar) e
   * `distanceFar` (correndo a toda, ou no ar).
   *
   * Por que deixou de ser fixa. Medido numa captura de 900×506 com
   * `#play@30`: o guerreiro ocupava 62px, 12% da altura da tela, e o
   * quadro gastava **8.57u abaixo dos pés contra 5.81u acima** — a maior
   * parte da imagem era a FACE DA PAREDE em que ele estava em pé, que não
   * carrega nenhuma informação de jogo. O assunto do quadro era a parede.
   *
   * Mas fechar o quadro de vez custa campo de visão, e campo de visão é o
   * que deixa o jogador ler o próximo salto (alcance 6.7u, altura 3.31u —
   * ver MOVE). Daí a respiração: quem está parado não precisa enxergar
   * longe, e quem está a toda não precisa admirar a armadura.
   */
  distanceNear: 14.0,
  distanceFar: 18.0,
  /**
   * Suavização da distância, por segundo. BEM mais lenta que
   * `followLambda` de propósito (constante de tempo ~0.6s): o zoom tem que
   * ser um fundo respirando, não uma reação. Zoom rápido é a forma mais
   * fácil de trocar legibilidade por enjoo — o mesmo erro que a folga
   * vertical existe pra evitar, só que no outro eixo.
   */
  zoomLambda: 1.6,
  /**
   * Quanto o quadro abre quando o guerreiro está NO AR, como fração do
   * caminho até `distanceFar`, independente da velocidade horizontal.
   *
   * Existe por um caso concreto: pulo máximo PARADO. Sem isso o quadro
   * fechado só tem 5.9u acima dos pés contra os 5.0u que corpo (1.7) mais
   * altura de pulo (3.31) exigem — margem de 0.9u, apertada demais. Com
   * `zoomLambda` de 1.6 um pulinho de 0.4s mal move a distância (~8% de
   * escala); uma queda longa abre o quadro inteiro. É exatamente a
   * resposta certa: o quadro abre na proporção do tempo que se passa no ar.
   */
  airborneZoom: 0.55,
  /** Altura do olho acima dos pés do guerreiro. */
  height: 2.6,
  /**
   * 34, não 44. Mesma coisa por dois motivos independentes.
   *
   * 1. ESCALA. O que define o tamanho do guerreiro na tela é o produto
   *    `distance * tan(fov/2)`, não a distância sozinha. Baixar a fov de
   *    44 pra 34 mantendo a distância em 18 dá um guerreiro 23% maior sem
   *    aproximar a câmera um centímetro — ou seja, sem custo nenhum de
   *    campo de visão em relação ao palco.
   * 2. DISTORÇÃO NA BORDA. Com fov 44 e 16:9 o meio-ângulo horizontal é
   *    36°, e o que está na borda do quadro estica 1/cos(36°) = 1.24. Com
   *    34 o meio-ângulo cai pra 28.5° e o esticão pra 1.14. Importa porque
   *    o `lookAhead` joga o guerreiro pra fora do centro de propósito: com
   *    lente larga, quanto mais rápido ele corre, mais deformado fica —
   *    exatamente na hora em que a silhueta precisa estar legível.
   *
   * O que se perde: a razão de escala entre a frente e o fundo do palco
   * (`WORLD.stageDepth` = 4u) cai de 1.27 pra 1.23. Achatamento de 3%; a
   * profundidade continua legível.
   */
  fov: 34,
  /**
   * Inclinação pra baixo, como TANGENTE — o tilt em unidades é
   * `distance * pitchTan`. Guardar o ângulo e não a distância é o que
   * mantém a inclinação CONSTANTE enquanto o zoom respira: pitch que
   * oscila é a forma mais nauseante de movimento de câmera que existe, e
   * ela some por construção se o ângulo for o parâmetro.
   *
   * 0.075 (~4.3°), não os 0.2 (~11.3°) de antes. O tilt de 11° foi
   * escolhido pra "devolver espaço pro palco", mas a captura mostra o que
   * ele devolveu de fato: 8.57u de face de parede abaixo dos pés contra
   * 5.81u acima. Com 0.075 os pés caem a 60-68% da altura da tela (contra
   * 44% antes) — a linha do chão vai pro lugar onde plataforma sempre a
   * pôs, e o que sobra de quadro fica ACIMA, que é por onde o jogo anda.
   *
   * Ainda restam 4.4u abaixo dos pés no quadro aberto: mais que a altura
   * de um pulo, então plataforma um salto abaixo continua visível.
   */
  pitchTan: 0.075,
  /** Suavização por segundo: maior = mais grudada. */
  followLambda: 6.5,
  /** Olhar à frente na direção do movimento (u). Antecipa o que vem. */
  lookAhead: 3.2,
  /**
   * Antecipação MÍNIMA, na direção pra onde ele olha, mesmo parado.
   *
   * Com o quadro fechado a meia-largura cai pra 7.8u e o alcance do pulo é
   * 6.7u: parado na beirada, a margem pra ler o pouso seria de 1.1u. Este
   * viés a leva pra 2.2u sem custar nada — e de quebra tira o guerreiro do
   * centro exato do quadro, que é onde ele parece um alvo de mira e não um
   * personagem indo pra algum lugar.
   */
  lookAheadIdle: 1.1,
  lookAheadLambda: 2.6,
  /**
   * A câmera sobe junto no pulo, mas AMORTECIDA e com teto. Seguir o eixo
   * Y cru faz a tela balançar a cada pulo e embrulha o estômago; ignorar
   * Y faz o jogador sair do quadro na queda longa.
   */
  verticalLambda: 3.2,
  verticalSlack: 2.2,
  /**
   * Reassentamento no chão. Bem mais lento que `verticalLambda`, que é pra
   * QUEDA — perder o jogador do quadro é pior que uma câmera preguiçosa.
   * Medido: separar os dois derrubou o pico de aceleração vertical.
   */
  settleLambda: 1.5,
} as const;

export const WORLD = {
  /** Profundidade visual do palco. Jogabilidade é no plano XY (2.5D). */
  stageDepth: 4,
  /** Y abaixo do qual o guerreiro morreu de queda. */
  killPlaneY: -14,
  gravityScaleWhenDead: 0.4,
} as const;
