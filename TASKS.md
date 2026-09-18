# TASKS — Push AAA (`AAA_BRIEF.md`)

## ESTADO: 8/8 módulos aprovados — e ainda não é AAA

Ver `shots/reviews/r12_apos_8de8.md`. Os oito passaram na rubrica interna,
o que revelou que **a rubrica tinha um buraco**: ela mede cada superfície
isoladamente e nunca pergunta *qual camada tem que ganhar a atenção*.

**Maior gap agora: o plano de jogo é a parte MENOS legível da imagem.**
O chão e a plataforma são a região mais escura, ruidosa e de menor
contraste do quadro; o fundo lê melhor que o palco. Isso inverte a
hierarquia que um plataforma precisa e é problema de jogabilidade, não de
gosto — beirada, buraco e inimigo no chão competem com textura de entulho
na mesma frequência do personagem.

Parte disso é erro meu de direção: mandei o m1 quebrar a linha contínua
do chão, ele quebrou bem e com medição, mas eu não disse **em qual camada**
a quebra podia acontecer sem custo de leitura.

- [x] **Métrica de hierarquia de camadas construída** —
      `node shots/measure.mjs <png> --layers`. Compara plano de jogo
      contra plano de fundo em contraste interno e frequência de corte.
      Era o buraco do instrumento: tudo antes era global ao frame ou
      local a uma região escolhida à mão, e nada comparava camadas.
- [x] Palco clareado e lobos de superfície alargados (7-15 colunas,
      vigor 22/56/22 em vez de 33/33/33). **Ruído melhorou de +0.093
      para +0.065**; alvo é <0.03.
- [x] Rampas de tile alargadas (a de terra tinha faixa 0.285 contra 0.455
      da de musgo, e terra é a maior parte do corpo) **e grão reduzido**.
      Alargar sozinho piorou o ruído — faixa tonal larga tem que vir em
      BAIXA frequência, com o contraste nas bandas grandes (lábio,
      oclusão, corpo, base) e o grão só como textura sutil.
      **Contraste 0.48 → 0.53, ruído +0.093 → +0.055.** O lábio iluminado
      agora lê com clareza, verificado ampliado.

- [ ] **PAREI de perseguir o limiar de 0.75 — ele está marcado como NÃO
      VALIDADO no próprio `measure.mjs`.** Risco de ser o terceiro alvo
      errado desta sessão pelo mesmo motivo dos dois anteriores: a banda
      de fundo contém céu claro E mata escura, faixa enorme por natureza;
      chão de terra e musgo tem faixa estreita por natureza. Exigir 75%
      pode ser exigir do palco um comportamento que só o fundo tem.
      **Antes de tratar como critério de saída: medir contraste LOCAL na
      aresta do piso**, que é o que de fato governa a leitura de beirada.
      O número segue útil como direção (0.48 → 0.53 acompanhou melhora
      visível), não como aprovação.

## Rodada 16 — o ruído do palco era um BUG, não um balanço

**O contrato de ruído FECHOU: +0.055 → +0.013 (alvo <0.03).** Era a
métrica que a review r12 existia pra denunciar, aberta desde então.

Método que achou: sonda de picos isolados por LINHA
(`isolados/px`, pico de 1px que difere dos dois vizinhos). A `--layers`
dá um número só pra banda inteira e não diz de onde vem o picotado.
Por linha, o defeito ficou impossível de não ver — o fundo inteiro roda
em 0.5-5% de pixels isolados e as linhas **175-186 estavam em 10-34%**,
exatamente a altura das pernas do guerreiro e dos pés dos inimigos.

- [x] **Detalhe de solo do parallax em AGLOMERADO, não em pixel solto.**
      Sorteava por pixel e despejava 1px isolados; agora sorteia em
      células de 7x3 no mundo e desenha corridas horizontais de 3-7px.
      Pedra tem largura — 1px sozinho não lê como objeto, lê como sujeira
      no sensor. A faixa da camada mais próxima também foi cortada a 14px
      abaixo da crista: descia até o rodapé, onde ou fica escondida pelo
      tilemap ou aparece **dentro de um buraco**, e buraco cheio de
      entulho compete com a beirada que o jogador precisa ler.
      Sozinho isso limpou as linhas 187-191 (0.013-0.029 → 0.000-0.010)
      e **não moveu as linhas 175-186** — foi o que denunciou a causa real.

- [x] **BUG de verdade no dither de transição crista→corpo.** A condição
      era `BAYER[dy & 3][x & 3] >= 4 + dy * 4`. Expandindo:
      `dy=0 [0,8,2,10] >= 4` preenche em `x&3 ∈ {1,3}`;
      `dy=1 [12,4,14,6] >= 8` preenche em `x&3 ∈ {0,2}`;
      `dy=2 [3,11,1,9] >= 12` **nunca preenche — linha morta**.
      Em vez da rampa de densidade de 3px que o comentário prometia,
      saíam **duas linhas de pente 50% em fase oposta e uma que não
      desenha nada**. Pente de período 2 é a frequência máxima que a
      grade suporta, e corria sem quebra por 120+px: a sonda mostrou
      `48- 49+ 50- 51+ ...` ininterrupto nas linhas 176 e 185.
      Corrigido: banda **sólida** nas camadas do plano de ação (li>=2) —
      dither ali só disputa leitura com o guerreiro, e a arte de
      referência faz lábio em degrau nítido no chão próximo, não
      pontilhado — e rampa de densidade de verdade nas distantes, onde os
      tons já estão próximos e o padrão não compete com nada.

      Resultado: linhas 175-186 de 10-34% para **0.0-3.7%** de pixels
      isolados; cortes/px do plano de jogo 0.429 → **0.368**.
      Estrutura de valor global intacta (media 0.38, sd 0.19, p99 0.84,
      amplitude entre faixas 0.36) e determinismo byte-idêntico
      reconfirmado em 3 execuções.

**Lição**: eu vinha tratando o ruído do palco como problema de balanço de
arte e rebalanceando parâmetros contra ele (rodadas anteriores levaram
+0.093 → +0.065 → +0.055 no braço). Era código que não fazia o que o
próprio comentário dizia. **Quando uma métrica não cede a ajuste de
parâmetro, ler o que o código faz de verdade antes de ajustar de novo.**

- [x] **Contraste LOCAL na aresta do piso medido** (`--edge`, já existia
      no `measure.mjs` e nunca tinha sido rodado): mediana 0.170,
      pior 10% em 0.023, **30.5% de colunas fracas**. Formalmente FALHA
      contra os limiares escritos (0.18 e 15%). Na hora atribuí boa parte
      disso a artefato do instrumento — colunas ocluídas pelo guerreiro
      (em x=140 a métrica achava a aresta em y=173, que é a perna dele) e
      colunas sobre buraco, onde não existe aresta pra medir.
      **Os dois artefatos eram reais; a conclusão que tirei deles, não.**
      Excluídos de verdade na rodada 17, o número não melhorou — ver a
      correção lá embaixo. Sobrevive o método (desconfiar do instrumento
      antes de aceitar o veredito), não o diagnóstico.

## Rodada 17 — consertar os dois instrumentos de aprovação

- [x] **Máscara de ator construída.** `TilemapGame.debugState()` agora
      declara `actors` (caixas em espaço de TELA) e o `measure.mjs` exclui
      essas colunas. Mora no jogo e não na métrica de propósito: o jogo é
      a autoridade sobre onde desenhou, e recriar a caixa fora dele
      duplicaria `KNIGHT_SIZE_PX`, a origem nos pés e o offset do buffer
      do `KnightRenderer` — cópia que divergiria na primeira mexida na arte.
      **Contrato de ruído agora passa nos 4 cenários**: +0.007 / -0.006 /
      +0.009 / +0.015. O `vista` ficou NEGATIVO, ou seja o palco é mais
      limpo que o fundo, que é exatamente a hierarquia que se queria.
      Máscara custa 57-67 de 384 colunas — não come amostra demais.

- [x] **`--edge` reconstruída: a linha do piso vem do TILEMAP.** Três
      tentativas de inferir do pixel erraram, cada uma diferente, e todas
      viravam limiar novo pra calibrar errado:
      1. "maior descontinuidade da coluna" misturava duas transições reais
         (lábio y=192 e entrada no corpo y=197) numa estatística só —
         medido: y=192 dava 36 fracas/18 boas, y=197 dava 14 fracas/95 boas.
      2. A mesma versão media com 2-3px de folga "pra fugir do antialias"
         e **pulava o lábio de 1px**, comparando escuro contra escuro. Daí
         degrau de 0.01 em coluna de lábio visivelmente claro.
      3. Procurar "superfície clara" a partir de 0.72h achava a faixa de
         névoa entre camadas de mata. O sintoma foi **"0 colunas sem piso"
         numa cena com buraco visível** — quando uma exclusão nunca
         dispara, ela está medindo outra coisa.

      **Regra que vale pros dois consertos: quando o jogo sabe, o jogo
      declara.** Inferir do pixel o que o tilemap já tem escrito é adivinhar
      com passos extras. Agora não há o que calibrar — onde há piso a
      posição é exata, e onde não há é buraco de verdade.
      (Bug pego no caminho: `viewY` é fracionário, então o `floorY` saía
      fracionário e indexava fora da grade — a métrica devolvia mediana
      **NaN** em vez de erro. Arredondado.)

### CORREÇÃO — eu estava errado sobre as colunas fracas

Escrevi na rodada 16 que "boa parte das colunas fracas é artefato do
instrumento". **Não é.** Com ator e buraco excluídos de verdade, o número
não melhorou — piorou de leve e ficou coerente entre cenários:

    run_f080          mediana 0.167   fracas 43.2%   (292 de 384 julgadas)
    vista_f299        mediana 0.177   fracas 29.8%
    roster_f090       mediana 0.177   fracas 36.5%
    hit_walker_f057   mediana 0.175   fracas 36.6%

A consistência entre cenários (mediana 0.167-0.177, sempre 32 colunas de
buraco) é o que faz eu confiar no número agora. **A leitura de beirada é
um problema de arte real e aberto**, não ruído de medição: em cerca de um
terço das colunas o lábio não salta o suficiente do que está atrás.
Próxima rodada de arte tem alvo claro e instrumento em que dá pra confiar.

## Sessão 7 (ROADMAP) — está a um passo, e o passo é peso de asset

Título, vitória e derrota **já existem e estão ligados** (`render/Screens.ts`,
`screen: "title" | "playing" | "victory" | "defeat"` em `TilemapGame`).
O que falta do critério de saída é deploy numa URL e o teste em 3
navegadores/dispositivos.

- [x] **Áudio recodificado: 20MB → 5.9MB.** As quatro faixas estavam em
      ~330-350kbps, e `misterio.ogg` sozinho tinha **14MB** (5min24s a
      352kbps) — para um jogo de 130KB de código. Isso sozinho inviabiliza
      a primeira carga em celular, que é parte do critério de saída.
      Recodificadas em **AAC 96k**, e AAC e não Opus/Vorbis porque é o
      único com suporte parelho nos três navegadores. `libvorbis` nem
      existe no ffmpeg desta máquina.
      `config/music.ts` já aponta pros `.m4a`; build e smoke test limpos.

- [x] **`.ogg` órfãos removidos** (`git rm --cached` + disco). `dist/` caiu
      de **26MB para 6.4MB**. Recuperáveis com
      `git checkout HEAD -- public/assets/audio/music/`.

- [x] **A MÚSICA NÃO TOCAVA. Nenhuma nota, desde a migração.**
      Descoberto indo empacotar o deploy: `config/music.ts` era importado
      por um arquivo só (`levels/level1.ts`) e só pelo *tipo* `Mood`.
      Zero `new Audio`, zero `AudioContext`, zero `.play()` em todo o
      `src/`. O ROADMAP dizia que a faixa tocava "em loop via
      `TilemapScene`" — uma das cenas Phaser **deletadas** na reescrita.
      A trilha morreu junto e o documento continuou descrevendo o mundo
      antigo, então nada denunciava.
      Religado em `src/engine/audio.ts`: `preload` no construtor (enquanto
      o jogador lê o título) e `play()` no Z que sai do título — que é o
      gesto de usuário que o navegador exige pra liberar autoplay.
      `HTMLAudioElement` simples, não Web Audio: não há mixagem nem efeito
      pra justificar a complexidade. Harness chama `setEnabled(false)`.
      Determinismo reconfirmado byte-idêntico.

      **É o mesmo padrão das rodadas 16 e 18, agora em escala de projeto**:
      documento afirmando um comportamento que o código não tem. Duas
      vezes foi comentário mentindo sobre a função ao lado; desta vez foi
      o ROADMAP mentindo sobre uma sessão inteira marcada como
      implementada. **Um critério de saída que ninguém reexecuta depois de
      uma migração não é critério, é lembrança.**

- [ ] **Repassar as outras sessões fechadas contra o código atual.** Se a
      Sessão 6 descrevia fiação que não existe mais, as sessões 1-5 podem
      ter o mesmo buraco — todas foram escritas para o engine Phaser.

- [ ] **Escolher destino do deploy.** O bundle com áudio novo dá ~6MB, o
      que passa no teto de 16MB de um Artifact — mas exigiria inlinar tudo
      em data: URI. GitHub Pages ou Netlify servem os arquivos direto e
      são mais naturais pra um jogo. Decisão do dono; não toquei em conta
      nenhuma.

## Rodada 22 — Fase 0 do push 3D (ThreeJS autorizado pelo dono)

O dono autorizou ThreeJS em 2026-08-14, revertendo a trava de 2026-07-29.
Prompt adaptado em `PUSH_PROMPT.md`; resultados em `3d/PHASE0.md`.

- [x] **A pergunta que podia derrubar o metodo esta respondida: captura
      deterministica EXISTE em WebGL headless.** Cena-sonda representativa
      de proposito (shadow map com PCF, nevoa, materiais PBR, geometria
      instanciada por PRNG, pontos translucidos — um quad chapado poderia
      sair identico e um jogo de verdade nao). **Byte-identico em 3
      execucoes no SwiftShader e em 2 na GPU real (Metal, M2 Pro).**
      Ablacao, comparacao entre rodadas e contratos medidos transferem.
- [x] **Mas o backend tem que ser FIXADO.** Entre software e GPU: 1.9-2.3%
      dos pixels diferem, erro medio 0.02-0.03/255, maximo 47 — borda de
      antialias e de sombra, conteudo estrutural identico. Comparar
      capturas de backends diferentes daria falso positivo em 2% do quadro.
      Recomendado SwiftShader no harness (reproduzivel em outra maquina);
      GPU real serve pra medir desempenho, nao pra comparar imagem.
- [x] **Orcamento de frame medido**: mediana 0.20ms, p99 0.70ms, 22 draw
      calls. **Maximo de 19.7ms no quadro 0 = compilacao de shader**, que e
      mais que um quadro inteiro a 60fps e vira engasgo visivel toda vez
      que material novo entra em cena. Precisa de passe de aquecimento no
      plano desde o inicio.
- [ ] Perguntas 3 e 4 da Fase 0 (sistemas ligados / nivel atravessavel)
      nao se aplicam: nao ha jogo 3D ainda. **Voltam a valer no primeiro
      dia de gameplay** — e a experiencia do 2D diz que voltam valendo.
- [ ] Portar a fisica de `src/config/archetypes.ts` (ja retunada e medida)
      antes de inventar fisica nova. Primeiro item de gameplay.
- [ ] Contratos especificos de 3D ainda nao escritos: julgamento de
      profundidade, camera, p99 sob carga real, popping. Escrever a metrica
      DEPOIS de olhar a cena que ela vai julgar.

## Rodada 21 — "movimentação estranha", e ela tinha causa nomeável

Primeiro playtest de verdade do dono, no link publicado. Retorno:
"movimentação estranha, tudo muito tosco ainda".

- [x] **`gravityDown/gravityUp` era 1.17.** Essa é a causa. A queda
      praticamente não acelerava, então subida e descida tinham o mesmo
      ritmo — e pulo que não cai mais rápido do que sobe lê como boneco
      puxado por barbante. Plataforma que se sustenta usa 1.8-2.2.
      Medido, antes → depois:

          razao queda/subida ...... 1.17  ->  1.92
          ar total por pulo ....... 1.00s ->  0.66s
          altura do pulo .......... 4.1   ->  3.6 tiles
          tempo ate vel. maxima ... 0.27s ->  0.14s
          tempo pra parar ......... 0.27s ->  0.12s
          travessia da tela ....... 3.3s  ->  2.6s

      Um segundo inteiro de ar é o dobro do normal; somado a 3.3s de
      travessia e 0.27s de rampa, o controle inteiro ficava mole.
      **Preservado o que é identidade do arquétipo**: gravidade de subida
      ainda baixa (pairada no ápice), controle aéreo alto, e as janelas de
      perdão intactas. "Floaty" é pairar no ápice, não cair devagar o
      caminho todo.

- [x] **Encurtar o pulo era seguro — verificado, não presumido.** Maior vão
      do nível: 3 tiles (48px). Alcance novo: 99px, ainda o dobro. O
      alcance antigo de 115px estava superdimensionado por 2.4x.

- [x] **`RUN_AFTER_SEC` corrigido junto** (0.28 → 0.14). Estava calibrado
      em `accel=420/maxSpeed=115` e virava dessincronia com a aceleração
      nova: `walk` lento com o corpo já na velocidade máxima. Era dívida
      registrada como "trocar agora seria churn" — o retune de física é
      exatamente o momento em que deixa de ser churn.

- [x] **Cenário `traverse`**, o smoke test de jogabilidade que não existia:
      corre e pula do início ao fim, e a sonda diz até onde chegou. A/B
      com a física antiga: **615px antes, 600px depois — as duas empacam
      no mesmo lugar** (a travessia d'água, que exige plataforma e não
      marretada). O retune não tirou jogabilidade de lugar nenhum.

- [ ] **Cenários de arte estão MISTIMED depois do retune.** O `vista` tem
      pulo em quadro fixo (60-78, 130-148) calibrado na física antiga;
      correndo mais rápido o guerreiro chega no vão em outro quadro e cai.
      Isso é fragilidade real do harness: cenário com input em quadro fixo
      mede a física de ontem. Retimar, ou roteirizar por posição em vez de
      por quadro.

- [ ] **"Tudo muito tosco" é mais que movimentação** e continua aberto.
      O que eu apontaria, em ordem: moeda/chave/flecha ainda são primitivos
      vetoriais (ver rodada 20); a fase é uma só e linear; e não há
      feedback sonoro de ação nenhuma — a trilha voltou, mas pulo, golpe,
      dano e moeda são todos MUDOS, o que é provavelmente metade da
      sensação de "tosco".

## Rodada 20 — a mobília do nível, que ninguém nunca julgou

Direção nova do dono: melhorar tudo — pixel art, mapas e jogabilidade.
Antes de opinar, fui capturar o que **nunca apareceu em captura nenhuma**.

- [x] **`startAt` no harness.** O comentário no `capture_entry.ts` já dizia
      "cenários de combate declaram startAt" e o suporte **nunca existiu** —
      só `summon`. Consequência: água, espinho, chave, porta e objetivo
      jamais foram fotografados, e por isso **nenhum dos 8 módulos de arte
      olhou pra eles**. Mesmo tipo de buraco de cobertura que fez os
      cenários de espada golpearem o ar por duas rodadas.
      Três cenários novos: `water`, `spikes`, `goal`, com posição tirada da
      leitura do grid e sempre sobre `#` sólido (teleporte pra coordenada
      arbitrária já falhou duas vezes aqui — buraco dispara respawn).

- [x] **Espinhos reescritos como PIXEL ART.** Eram o único elemento do jogo
      que não era: `beginPath/moveTo/lineTo` com `fill()`+`stroke()`, ou
      seja triângulos VETORIAIS antialiasados, cor única chapada
      (`#8a8a9a`), dois por tile em offset fixo. Três defeitos de uma vez —
      plástico (borda suavizada no meio de arte pixel a pixel), régua
      (idênticos em passo fixo, a periodicidade que duas rodadas tiraram do
      resto) e flutuando (sem soquete nem sombra).
      Agora folha de 6 variantes escolhidas por hash da posição no mundo,
      ferro com face iluminada pelo horizonte, ponta pegando o céu,
      ferrugem escura cravando no chão.

      **Duas correções minhas no caminho, as duas por olhar ampliado:**
      perfil côncavo (`t^1.35`) deixava 1px de largura pela metade de cima
      e a peça lia como VELA — corpo fino, pavio branco, base alaranjada;
      e `PAL.rust` (o acento saturado) numa base de 3 linhas virava um
      objeto laranja separado brigando com a moeda. Corrigido para perfil
      quase reto, base escura de 2 linhas, e **altura 8-10 em vez de 10-13**:
      com 12 de altura para 7 de base a silhueta é de torre, não de espinho.

- [x] **Estandarte reescrito.** Tinha os MESMOS dois defeitos dos espinhos:
      triângulo `beginPath/lineTo/fill` (vetorial, antialiasado) em cor
      chapada, com um `#ffffff33` por cima — alfa translúcido em pixel art
      inventa tom fora da paleta, o que o DESIGN.md §2.1 não quer. E era o
      pior ativo do quadro justamente no ALVO NARRATIVO da fase.
      Agora pano rasgado em 3 tons, borda de fuga mordida por hash, fiapo
      solto, mastro com face iluminada e base alargada.

- [x] **Porta reescrita.** Era retângulo marrom com ripas HORIZONTAIS —
      o oposto de como porta se constrói. Tábua de porta é vertical; o que
      atravessa na horizontal são as barras de ferro, que não existiam.
      Lia como caixote. Agora: batente de pedra, vão recuado, três tábuas
      verticais de larguras irregulares com veio, duas barras de ferro
      enferrujado e argola.

- [ ] **O problema é SISTÊMICO, não eram três peças soltas.** Varrendo
      `beginPath` depois de consertar os espinhos, o que sobrou em
      `TilemapGame`: **moeda** (`arc()` de raio 6 em `#f8d800` chapado mais
      um brilho `arc()` de 1.5), **chave**, e **flecha** — todos primitivos
      vetoriais antialiasados. Ou seja: **a mobília e os projéteis inteiros
      do jogo nunca foram pixel art**, enquanto terreno, mata, guerreiro e
      inimigos são desenhados pixel a pixel. É por isso que essas peças
      leem como "forma limpa moderna" no meio de arte trabalhada à mão.
      (O halo de carga do shooter pode continuar vetorial — é luz, não
      objeto.)

- [ ] **Mapas e jogabilidade** — pedido do dono, ainda não começado. É
      conversa de design, não de pixel: hoje existe UMA fase montada de 8
      chunks, e o `chunkLibrary` é a alavanca.

## Rodada 18 — o lábio, e o critério de aresta que estava errado

- [x] **Segundo caso de comentário mentindo sobre o código.** O bloco em
      `TileArt.ts` afirmava "O TOPO nunca escurece junto com o corpo" e
      dizia ter sido escrito justamente pra consertar a leitura de aresta —
      mas `toneAt` aplicava `shiftOf(vigor)` em TODOS os passos, inclusive
      no 0. No tufo morto o topo descia dois tons igual ao corpo. Primeiro
      caso foi o dither de transição do parallax, na rodada 16.
      **Quando uma métrica não cede, ler o que o código FAZ, não o que o
      comentário diz que ele faz** — vale duas vezes agora.

      Achado com a `--edge` já confiável: das 292 colunas julgadas em
      `run_f080`, 126 eram fracas, e a diferença estava **toda no lábio** —
      fracas com 0.242, fortes com 0.419, e o fundo atrás praticamente
      igual nas duas (0.184 contra 0.215). As fracas vinham em corridas de
      ~16px, ou seja **por tile**, não por posição dentro do tile.

      Deslocamento do topo limitado a 1 em vez de zerado: o entalhe escuro
      do lobo morto é o que interrompe a régua clara a 1x, e zerar
      devolveria a fileira contínua que duas rodadas trabalharam pra
      quebrar. Mediana 0.167-0.177 → **0.181-0.190, passa nos 4 cenários**;
      fracas 30-43% → 23-25%. Contrato de ruído, estrutura de valor e
      determinismo sem regressão; verificado ampliado que a régua não voltou.

- [x] **Critério de aresta trocado: CORRIDA CEGA, não porcentagem.**
      Sobraram 23-25% de colunas fracas contra um limite de 15%, e a
      pergunta certa era se isso é defeito ou é a variação que a arte
      precisa ter. Medindo o que de fato governa a leitura — quantas
      colunas SEGUIDAS ficam sem lábio — a resposta ficou clara: **pior
      corrida de 4-6px nos quatro cenários**, contra ~27px de largura do
      guerreiro. São entalhes espalhados, nunca um trecho onde o jogador
      perde a linha do chão.
      Julgar pela porcentagem teria reprovado a arte por ter exatamente a
      textura que se pediu a ela. Limite novo: 12px, menos da metade da
      largura do guerreiro, então um vão cego nunca cabe um ponto de pouso.

- [x] **Critério VALIDADO por ablação, não aceito de palavra.** Um critério
      que não reprova nada não vale nada. Revertendo só o conserto do topo
      e recapturando, a pior corrida vai pra **13-20px e reprova**; com o
      conserto, 4-6px e passa. Ele discrimina.

- [ ] **O MESMO furo existia na `--layers`, e o `roster` provou.** Dos 4
      cenários medidos, 3 passam o contrato de ruído (+0.017 / +0.009 /
      +0.017) e o `roster` fica em +0.033 — melhorou muito (era +0.071)
      mas segue fora. Medindo o `roster` com as colunas separadas:

          faixa de jogo, colunas dos 3 atores ... 0.442 cortes/px
          faixa de jogo, só cenário ............. 0.357
          fundo (referência) .................... 0.348

      O cenário do palco está em +0.009 contra o fundo, ou seja **passa
      folgado**; a falha inteira é o guerreiro e os dois inimigos, que
      devem MESMO ser a coisa mais detalhada do plano de jogo. A métrica
      conta o ator como ruído de cenário.
      **Mesma correção pros dois instrumentos**: uma máscara de atores
      (o harness já tem a sonda de estado com as posições) excluindo
      essas colunas. Sem isso, cena com muito inimigo sempre vai reprovar
      por estar cheia de inimigo.

### Erro que cometi DUAS vezes — não repetir

Escrevi um alvo antes de entender a geometria da cena, e das duas vezes
o alvo é que estava errado:

1. `ROT_TARGET.shadowMassMin = 0.30`, extrapolado antes de existir cena.
2. A primeira versão de `--layers` exigia que o palco fosse **mais claro
   que o fundo** — impossível, porque a banda de fundo contém o céu, a
   coisa mais clara de qualquer plataforma. Nem Metal Slug satisfaz.
   Corrigido para razão de contraste interno, que é o que de fato governa
   a leitura de beirada.

A mesma versão também media a franja de primeiro plano (quase preta **de
propósito**) como se fosse palco, o que falseava tudo pra baixo. Banda
corrigida para 0.78–0.92 da altura.

**Regra**: alvo numérico só depois de olhar a cena que ele vai julgar.

- [ ] **Âncora de cor — medido, e a medição corrige o diagnóstico.**
      "Tudo verde-acinzentado" não é bem o caso: o quadro tem 4.6-5.0% de
      pixels com s>=0.40. O problema é *onde* essa saturação mora —
      **~85% dela é o azul do céu** (3.9% do quadro), um campo grande e
      passivo, não uma âncora. O acento quente que de fato ancora o olho
      (moeda, penacho, brasa) soma **0.6-1.0%** e quase todo ele está no
      HUD ou em item, não na arte do mundo.
      Reformulando o gap: falta acento saturado **em contraste de MATIZ
      com o campo dominante, colocado no plano de ação**. As moedas
      provam que o mecanismo funciona — o olho vai nelas na hora.

      Matiz escolhido pelo dono: **ferrugem / sangue seco** (`PAL.rust`,
      `#a34426`). Complementar do campo verde-acinzentado, não colide com
      o amarelo puro da moeda nem com o azul do céu, e vai em matéria
      estática — acento de cenário que parece coletável é o erro que o
      projétil magenta já custou uma rodada.

- [x] **Cantoneira de ferro da plataforma enferrujada**, 2px de largura.
      Faz dois trabalhos: é o acento no plano de ação e **marca onde a
      plataforma acaba** — beirada por matiz, não só por degrau de valor,
      que é exatamente o que a `--edge` mostra fraco no pior 10%.
      A primeira versão tinha 1px e **sumia a 1x** (existia ampliada, não
      existia jogando): um pixel de acento é cintilação, não âncora.
- [x] **Madeira morta do parallax puxada pra ferrugem**, com a mistura
      subindo com a proximidade (a névoa come saturação com a distância,
      então tingir camada longe leria como erro de perspectiva). As
      árvores VIVAS ficam no verde de propósito — o contraste entre as
      duas é que conta a história de The Rot; tingir tudo mataria a
      distinção. Verificado ampliado: lê como madeira manchada, não como
      pintura.

- [x] **Dose corrigida autorando ACIMA do destino.** A primeira versão
      foi autorada em s≈0.60 — a saturação que eu queria ver — e chegava
      na tela abaixo de 0.40, sem força nenhuma. O pipeline cobra duas
      vezes no caminho: grade dessatura por 0.68 e a névoa baixa soma até
      ~15% de pálido justamente na altura em que a ferrugem mora.
      Reautorada em s≈0.70-0.79. **Regra**: autorar cor de acento no valor
      de destino é autorar pro pixel antes do pipeline, não pro que o
      jogador vê. Vale pra qualquer acento futuro.

- [x] **Métrica `--color` construída** (`node shots/measure.mjs <png>
      --color`). Separa por FAMÍLIA DE MATIZ em vez de dar um número só
      de saturação — foi a separação que corrigiu o diagnóstico da r12.
      **Deliberadamente SEM limiar de aprovação**: área não é saliência,
      e um limiar de área aqui seria o quarto alvo mal-calibrado da
      sessão. A moeda ancora com fração de 1% porque é brilhante,
      saturada e repetida.

- [x] **FECHADO — a madeira morta volta pro escuro, a ferrugem fica só na
      cantoneira.** Decidido pelo dono vendo `z18_COM_ferrugem_3x.png`
      contra `z18_SEM_ferrugem_3x.png`, e o motivo técnico bate com a
      escolha: a mistura era `0.12 + near * 0.58`, forte no plano próximo,
      mas a camada próxima tem base quase preta (`0x121711`) e ferrugem em
      quase-preto vira lama. A cor aparecia mesmo nas camadas do MEIO, de
      base clara, onde lia como campo difuso de hastes quentes e empurrava
      contra a perspectiva atmosférica.
      Sobra a cantoneira de 2px, que é pequena e faz trabalho de leitura
      (marca onde a plataforma acaba). **O quadro não tem âncora de cor
      forte além da moeda, e isso é uma escolha registrada, não pendência.**

      **Custo desta decisão: rodadas demais gastas numa questão cosmética
      que eu deveria ter resolvido sozinho.** Fica como regra: decisão de
      dose cosmética eu tomo e mostro o resultado; só levo ao dono o que
      muda direção, não o que muda 0.02% do quadro.
- [x] **Telégrafo de investida do walker fechado.** Era a última tarefa
      registrada como dependente de gameplay. `lungeCharge` +
      `lungeActive` em `core/Enemy.ts`: o walker quase para por 620ms e
      depois avança a 2.1x. **A pausa é o que faz o avanço ler como
      investida em vez de andar mais rápido** — medido, 2.5px em 30
      frames no recuo contra 35px em 40 frames no avanço.
      A folha do m2 já tinha o par recolher→soltar pronto pros dois tipos;
      faltava só a metade de gameplay, que o agente descreveu em vez de
      inventar. **Agora os dois inimigos avisam antes de atacar.**

Estado durável do trabalho. **A conversa não é o estado — este arquivo é.**
Riscar conforme conclui, não só no fim da sessão. Ao deixar algo pela
metade, registrar em "Premissas não validadas" abaixo: foi a ausência
disso que custou três rodadas no push da espada (ver commit 72ce4df).

---

## Rodada 0 — harness de captura determinística

Sem isso nenhuma rodada fecha: "ficou bom" não é evidência, e duas
capturas do mesmo frame precisam ser byte-idênticas pra comparação entre
rodadas significar alguma coisa.

- [x] `src/engine/rng.ts` — PRNG semeável (mulberry32)
- [x] Trocar `Math.random()` por `rng.random()` nos 8 call sites
      (`render/Particles.ts` 4, `render/KnightRenderer.ts` 2,
      `game/TilemapGame.ts` 2)
- [x] `shots/scenes.mjs` — 8 cenários nomeados com input roteirizado
- [x] `shots/capture_entry.ts` — entry do browser: passo fixo, sem rAF,
      render todo frame (o screenshake consome RNG no `render()`)
- [x] `shots/capture.mjs` — driver node: esbuild → servidor estático →
      chrome-headless-shell → grava os PNGs
- [x] Verificar determinismo: **confirmado**, mesma seed duas vezes dá
      PNG byte-idêntico (sha256 conferido em 2 execuções separadas)
- [x] Baseline rodada 0: 26 PNGs em 3s (`shots/out/r0/`)
- [x] Decidir canvas 2D vs Pixi.js — **medido**: grade completo
      (bloom + curva tonal + vinheta) custa 0.62ms a 384×224, 3.7% do
      frame. Não migrar. Ver `PIXI.md`.
- [x] Dashboard HTML — `node shots/dashboard.mjs [--open]` gera snapshot;
      `--watch` sobe em <http://127.0.0.1:4599> e **atualiza sozinho**
      (observa `progress.json` + `shots/out/`, página recarrega). Marca
      como "sem sinal" quem passou 15min sem heartbeat.
- [x] `shots/measure.mjs` — chapado%, tons por matiz, estrutura de valor,
      faixas de profundidade. Aceita `--region x,y,w,h` e `--brief`.
- [x] Review do baseline — `shots/reviews/r0_baseline.md`
- [ ] Captura de sequência (legibilidade em movimento, rubrica §1)
- [ ] Commitar a rodada 0

## Rodada 1 — valor primeiro (m8 grade + m5 atmosfera)

Maior gap da review: estrutura de valor em oposição à lore. Atacado
antes de qualquer arte, porque é global e todo o resto é julgado dentro
dele.

- [x] `src/config/grade.ts` — preset `GRADE_ROT` + `ROT_TARGET` mensurável
- [x] `src/render/Grade.ts` — curva em S, dessaturação, split tone
      (frio na sombra / quente na luz), vinheta, bloom, grão
- [x] Ligado ao pipeline; `renderVignette` antigo removido (virou m8)
- [x] Medido: media 0.58→0.41, sombra 7.5%→25.9%, altas 36.5%→2.0%,
      p99 0.93. Dentro do `ROT_TARGET` exceto sombra (alvo 30-45%).
- [x] m4 fundo — `src/render/Parallax.ts` + config reescrito. Silhueta por
      3 senoides de períodos incomensuráveis + copas por hash (mata a
      periodicidade), 4 camadas com perspectiva atmosférica, névoa baixa.
- [x] m7 HUD — `src/render/Hud.ts`. Pips de vida com 3 tons, contador de
      moedas, chave só quando existe, barra de carga. Debug atrás de flag.
- [x] m1 terreno — `src/render/TileArt.ts`. Tileset desenhado em código
      (lábio → oclusão → corpo → base), 4 variantes escolhidas por hash da
      posição no mundo. PNG legado do OpenGameArt não é mais lido.
- [x] Tronco morto do Phaser removido (`src/scenes/`, `src/entities/`) e
      `phaser` tirado do package.json — estava quebrando o build ao
      consumir o config antigo de parallax.
- [ ] **ALTAS EM 0.1%** — a cena não tem specular nenhum. Corrigi "claro
      demais" e passei do ponto. Rubrica §2 quer preto real + massa média
      + specular quente pequeno; só os dois primeiros existem.
- [ ] Nenhuma camada de primeiro plano ocluindo o jogador — profundidade
      ainda é só por escala, nunca por sobreposição.
- [ ] Sessão 7 do ROADMAP não fecha só com o HUD: falta tela de título e
      vitória/derrota.

## Rodada 1 — agentes em paralelo

Estado ao vivo em <http://127.0.0.1:4599> (`node shots/dashboard.mjs --watch`).
Cada um escreve só o seu `shots/status/<id>.json`.

**Os três agentes morreram por limite de sessão em 2026-07-29 ~19:45**
(reset 23:30). Mesma falha registrada no commit 72ce4df do push da espada.
**Nada foi perdido**: os três morreram na fase de leitura/medição, antes
de editar qualquer arquivo — verificado por mtime e `tsc -b` limpo.

- [ ] m2 inimigos — não começou. `render/sprites.ts` intacto.
- [ ] m3 guerreiro — não começou a editar. Último passo do agente foi
      medir a posição dos pés contra o chão, pra sombra de contato.
      **Assumi este módulo eu mesmo** (ver abaixo).
- [ ] m6 impacto — não começou. `render/Particles.ts` intacto.

**Lição pro próximo disparo**: agentes gastam boa parte do orçamento só
lendo AAA_BRIEF.md + review + DESIGN.md antes de produzir qualquer coisa.
Considerar um brief por módulo, curto, com o contexto já destilado — ou
disparar menos agentes por vez.

**Bug corrigido no dashboard**: o heartbeat vinha do campo que o agente
escrevia, mas agentes não têm relógio confiável — um gravou meia-noite,
outros marcaram 3h no passado, e os três apareceriam como mortos tendo
acabado de começar. Agora vem do **mtime do arquivo**.

## Feito depois da morte dos agentes (assumi o m3)

- [x] `src/render/ContactShadow.ts` — sombra de contato do jogador.
      Projetada no chão (não colada nos pés, senão sobe junto no pulo),
      encolhe e desbota com a altura, núcleo + penumbra. A primeira
      versão usava raio 7.5px, **menor que as botas**, então o próprio
      guerreiro escondia a sombra inteira — alargado pra 12px.
- [x] `shots/crop.mjs` — recorte ampliado por vizinho mais próximo, com
      encoder PNG próprio. Equivalente ao `--isolate` do harness da
      espada; sem isso é impossível julgar detalhe de 3px.

- [x] `src/render/RimLight.ts` — rim light por detecção de borda no alpha.
      Genérico: opera no buffer, não no desenho, então serve pros inimigos
      também. É a única coisa segurando as altas em 3%; sem ele a cena
      volta a 0.1% e perde o specular inteiro.
- [x] Primeiro plano em `Parallax.renderForeground` — desenhado depois do
      jogador, ocluindo. Deu profundidade por sobreposição e os pretos
      reais (p01 0.09 → 0.02). Primeira versão tinha 26px + talos de 32px
      e **escondia o chão onde o jogador anda** — reduzido a franja.
- [x] Descoberto medindo: a **vinheta estava comendo as altas**. O rim saía
      da curva em 0.84 e a vinheta o derrubava pra 0.69. O teto do p99 era
      a vinheta, não a curva. Suavizada 0.44→0.30, raio interno 0.38→0.52.
- [x] Review da rodada 1 — `shots/reviews/r1.md`

## Alvo que provavelmente está errado (não maquiar)

`ROT_TARGET.shadowMassMin = 0.30` foi escrito por extrapolação **antes de
existir cena montada**. A rodada 1 fecha em 21.7%, e chegar a 30% exigiria
escurecer as faixas de parallax — o que já reintroduziu uma vez a massa
uniforme sem separação de profundidade (sd caiu pra 0.12, amplitude entre
faixas pra 0.14). Uma vista externa de dia encoberto não tem 35% de
sombra; caverna ou noite teria.

**Proposta**: tornar o alvo dependente do tipo de cena. Não mudei sozinho
porque isso altera o critério de aprovação de outros módulos.

## Rodada 2 — forma, não só silhueta

Crítica recebida e correta: a rodada 1 bateu as métricas de valor mas
cada camada de parallax continuava sendo **preenchimento sólido de uma
cor só**. Passar na métrica não é a arte estar boa.

- [x] Árvores como FORMA — copa de lóbulos sobrepostos + tronco, com
      espaçamento irregular. Perfil senoidal em passo fixo lê como duna
      por mais que se varie a altura; custou duas tentativas descobrir.
- [x] Árvores MORTAS entre as vivas — tronco nu com galhos. Não é
      decoração: mata "corrompida" desenhada só com copa saudável se
      contradiz com a lore.
- [x] Ruínas no horizonte (torre quebrada, muro caído) — a lore fala de
      civilização que perdeu, e o cenário estava sem nada construído.
- [x] Dither **só na banda de transição** crista→corpo. A primeira
      tentativa usou dither como textura global e virou sopa de ruído —
      dither é técnica de banda estreita entre dois tons.
- [x] Gradiente vertical dentro de cada massa (luz em cima, sombra
      embaixo) em vez de fill sólido.
- [x] Detalhe de solo (tufos, pedrinhas) na faixa exposta de cada camada
- [x] Separação de valor entre camadas aumentada
- [x] m2 inimigos — `src/render/EnemyArt.ts`. Walker baixo-e-largo com
      corcova assimétrica; shooter alto-e-estreito com braço erguido.
      Silhuetas opostas de propósito (rubrica §6). Rótulo de HP em texto
      branco removido — era debug vazando pro jogo.
- [x] `sprites.ts` e `pixelSprite.ts` removidos (mortos)

Resultado medido: p99 0.76 → **0.84**, altas 3.0% → 3.6%, amplitude entre
faixas 0.23 → **0.38**.

- [ ] Copas ainda leem circulares demais — falta "mastigar" a borda
- [ ] **Color cycling não existe** e o DESIGN.md §2.2 torna obrigatório
      em pelo menos 1 elemento por fase
- [ ] Silhueta walker vs shooter não testada reduzida a 16px em preto
- [ ] Tileset de chão ainda é uma faixa repetida com pouca variedade

## Rodada 3 — o harness estava mentindo

- [x] **Sonda de estado** no harness (`*_state.json`): posição do jogador
      e dos inimigos a cada 10 frames. Revelou que os cenários
      `sword`/`sword_charged` **golpeavam o ar** — o jogador chega a
      x=187 em 150 frames e o primeiro inimigo está em x=903. Duas
      rodadas de trabalho de impacto foram feitas sem que ninguém
      pudesse julgá-las. Um agente descobriu ao tentar avaliar o próprio
      trabalho; eu não tinha notado.
- [x] `debugSummonEnemy` + cenário `hit_walker` — traz o inimigo até o
      spawn do jogador. Teleportar o jogador até o inimigo falhou duas
      vezes: posições arbitrárias no nível caem em buraco e disparam
      respawn. O spawn é chão comprovadamente sólido.
- [x] Verificado: o golpe conecta e o walker morre entre f52 e f57.
- [x] Trabalho dos agentes verificado — build limpo, sem `Math.random`,
      **determinismo intacto** (hashes idênticos entre execuções).
      KnightRenderer 48KB→62KB, Particles 1.6KB→27.8KB.

### O que os agentes entregaram antes de morrer

- **m3**: olhos brilhando no elmo. Comunica que o guerreiro também está
  em decay sem cair no monstruoso — exatamente a sutileza que a Região 1
  pede. Morreu ajustando contraste da pose de corrida.
- **m6**: impacto com peso real — clarão e faíscas radiais, visível em
  `shots/out/combat/hit_walker_f057.png`. **Gap**: o clarão é branco
  demais; a lore pede matéria em decomposição, esporo e pó, e branco lê
  como magia, não como criatura corroída.

## Rodada 4 — fechando o que estava mentindo ou faltando

- [x] `sword` e `sword_charged` receberam `summon` — **agora acertam**.
      Verificado pela sonda: walker morre entre f52 e f57.
- [x] Cenário `roster` (os dois inimigos lado a lado) e **validada** a
      premissa da rodada 2: walker e shooter se distinguem em silhueta
      (baixo-e-largo vs alto-e-ereto). Era afirmação minha sem teste.
- [x] O cenário `roster` revelou um bug feio: o projétil do shooter era
      um `fillRect` **magenta chapado** fora de paleta, o elemento mais
      quebrado da tela. Redesenhado como bolo de praga com núcleo, halo
      e rastro.
- [x] **Color cycling da água** — 4 fases por tempo no tilesheet, que é
      exatamente como hardware de 16 bits fazia (girava a paleta, não
      animava sprite). Requisito formal do `DESIGN.md` §2.2, estava
      aberto desde a Sessão 6. **Provado**: frames diferentes do mesmo
      ponto do mundo diferem.
- [x] Suporte a múltiplos `summon` por cenário no harness.

- [x] **Animação de caminhada dos inimigos** — 4 frames (contato /
      passagem / contato / passagem) com bob vertical de 1px. Inimigo que
      desliza sem ciclo de passo é dos tells mais rápidos de amadorismo.
      A fase é defasada pela posição do indivíduo, senão dois inimigos na
      tela pisam em sincronia e lê como marionete. Determinismo mantido
      (hashes idênticos verificados depois da mudança).

## Rodada 5 — validações pendentes fechadas

- [x] **Golpe carregado validado** escalando contra o normal — faíscas
      radiais longas, área muito maior. Estava sem teste desde a morte
      do agente; agora tem frame provando.
- [x] **Impacto rebalanceado.** As rampas `spark` e `flash` começavam em
      quase-branco e o golpe lia como raio elétrico. Tirei o branco puro,
      reduzi a contagem de faísca e **aumentei a matéria corroída**
      (`rotChunk`/`rotFleck`/`spores`) — o desenho do agente já tinha as
      rampas certas, era só balanço. Agora o clarão de aço é acento e a
      matéria é o evento, que é o que a lore pede.
- [x] **Telégrafo de tiro do shooter.** Ele acende no último terço da
      recarga. Inimigo à distância que atira sem aviso não dá ao jogador
      nada pra reagir, e dano lido como injusto é falha de design, não
      dificuldade. **Verificado por sonda**: a carga chega a 0.86.
- [x] Determinismo reconfirmado após todas as mudanças (byte-idêntico).

## Rodada 6 — m4 PASSOU (primeiro módulo aprovado)

- [x] **Copas mastigadas.** Os lóbulos deixaram de ser o que se desenha e
      viraram só o campo que define a massa; a silhueta é rasterizada
      coluna a coluna e mordida em duas escalas (grossa em pares de
      coluna, fina ±1px), com buracos de céu, tufos destacados e
      proporção por indivíduo.
      **Verificado por mim, não aceito de palavra**: média 0.38, p99
      0.83, chapado 0.10%, determinismo byte-idêntico, zero `rng`,
      build limpo.

Duas coisas do agente que valem como precedente:

- **Recusou uma instrução do meu brief, com razão.** Eu mandei usar
  `destination-out` pros buracos de céu; ele apontou que o canvas é opaco
  e compartilhado com o céu e as camadas já desenhadas, então apagar
  abriria furo até o fundo da página. Partiu o run vertical da coluna em
  dois. **Briefs meus podem estar errados — o dono do módulo tem contexto
  que eu não tenho.**
- **Apagou código próprio depois de medir.** Escreveu um passe anti-fresta,
  neutralizou, viu que o md5 ficava idêntico (não podia disparar por
  construção) e removeu, deixando comentário no lugar. Código morto
  alegando conserto que nunca fez é pior que ausência.

Restou honestamente registrado: frestas de 1px entre árvores vizinhas
(um passe por árvore não enxerga), troncos sem afinamento, árvores mortas
intocadas.

### m6 PASSOU — hitstop

- [x] **Hitstop implementado e ligado.** O agente construiu em
      `Particles.ts` + `config/combat.ts` (autorado em FRAMES, não ms) e
      deixou o hook pra eu conectar em `TilemapGame.update()`, sem tocar
      no arquivo de outro dono. **Medido no relógio do mundo**: golpe
      normal congela 4 frames e rampa de volta (6.67 → 11.67 → 16.67ms);
      carregado congela um intervalo inteiro de 10 frames. Determinismo
      intacto.
- [x] Knockback visual de 3px/6px que resolve **depois** da pausa, e é só
      de desenho — não encosta em hitbox.
- [x] Detalhe que o agente descobriu testando os dois caminhos: **não
      chamar `keyboard.endFrame()` no caminho congelado**. O frame parado
      come a borda de `justUp` e o golpe carregado nunca dispara. Pular o
      `endFrame` bufferiza a entrada através da pausa.

**Bug real encontrado por ele, e é a origem de um gap meu:**
`WALKER.color` é `0xd82800`, **byte-idêntico** à cor da rota legada
`playerHurt` em `Particles.ts`. Toda morte de walker emitia as brasas de
dano do *jogador* em vez da emissão de morte. Era isso que eu tinha
registrado na rodada 3 como "clarão branco demais" — o diagnóstico estava
errado, não era balanço de cor, era a emissão errada disparando.

### m3 PASSOU — guerreiro

- [x] **Leitura interior da corrida — root-causada por medição, não por
      chute.** O agente mediu a luma antes de tocar em qualquer coisa e
      descobriu que o diagnóstico do brief (meu) estava incompleto: as
      **duas** pernas estavam abaixo do fundo (perto ~40, longe ~32,
      fundo ~45). Não era baixo contraste, era um buraco. Corrigido com
      sel-out mais suave no interior (o de 30% é certo na silhueta
      externa e errado entre peças do mesmo membro) e rampa de 4 valores
      nos membros próximos. Agora: perto ~86 (pico 134), longe ~34.
- [x] Estado `land` (compressão → recuperação → overshoot) e o ciclo
      `jump` parou de repetir no ar — ele re-agachava a cada 1.25s.
- [x] Verificado por mim: build limpo, zero `Math.random`, determinismo
      byte-idêntico.

- [x] **Buraco de cobertura do harness fechado (meu).** O squash de
      aterrissagem existia e **nenhuma captura o mostrava** — os shots do
      cenário `air` eram todos no ar. Estendi o cenário e usei a sonda pra
      achar a janela exata (`land` dispara em f88–f90, entre `jump` e
      `run`). Agora há frame pra julgar.

**Nota de método**: dos três agentes, dois corrigiram o brief que eu
escrevi. O m4 recusou a técnica que eu mandei usar (com razão técnica) e
o m3 mostrou que meu diagnóstico do problema estava incompleto. Vale
escrever briefs com o problema medido, não com a solução presumida.

- [x] **Rota frágil eliminada.** Os 4 call sites de `TilemapGame` migraram
      de `burst(cor, contagem)` para `emit(nome)`. A tabela de compatibilidade
      por cor — que precisava desempatar `#d82800` por contagem de
      partículas — não é mais consultada por ninguém. A morte do walker
      agora dispara `enemyDeath` (massa colapsando + esporo + poeira) em
      vez das brasas de dano do jogador. Verificado em `sword_f057`:
      esporo pálido se espalhando, não brasa alaranjada. Determinismo OK.

## Rodada 8 — dois agentes morreram cedo

m5 (atmosfera) e m2 (inimigos) foram lançados e mortos por limite de
sessão quase imediatamente (reset 11h). **Nada perdido, nada quebrado** —
verificado por `tsc -b` e mtime: o m5 só confirmou o baseline e o m2
estava lendo; `Atmosphere.ts` nunca chegou a ser criado.

### m5 PASSOU — atmosfera (criado do zero)

- [x] `src/render/Atmosphere.ts` + `src/config/atmosphere.ts`: 4 camadas
      de partícula de ar com parallax próprio, feixes de luz, e 4 presets
      de clima (`overcast`/`drizzle`/`deepFog`/`dusk`) — o modificador
      ortogonal que o `DESIGN.md` §2.2 exigia e que estava aberto.
      Todos medidos dentro de 0.32–0.42 de média e p99 > 0.75.
      Custo **0.024ms/frame** contra 0.6 do grade.
- [x] Ligado por mim na ordem que o agente especificou: `renderBack`
      antes do tilemap (a poeira distante tem que ser **ocluída pelo
      mundo**, senão a ilusão morre) e `renderFront` antes da grade
      (atmosfera acima da grade lê como overlay de interface).

Duas descobertas dele que vieram de olhar a imagem, não o código:

- **Feixe com pico no topo não existe visualmente.** A primeira versão
  gastava a intensidade sobre o céu, que já está em 0.87 de valor —
  pálido sobre pálido, e a métrica não se moveu um décimo. Moveu o pico
  pra onde o feixe cruza as copas escuras.
- **Grão parado não tem profundidade.** Num frame estático, poeira longe
  e poeira colada na lente são o mesmo quadradinho. Adicionou rastro de
  movimento nas camadas próximas, que as torna reconhecíveis pela forma.

- [x] **Risco que ele apontou e eu corrigi**: o construtor sorteava ~1100
      valores do `rng` **global**, o que deslocaria o fluxo compartilhado
      e tornaria toda captura anterior incomparável — determinística
      ainda, mas com conteúdo mudado por efeito colateral de
      inicialização de outro módulo. Trocado por PRNG local com semente
      fixa. Determinismo reconfirmado.

- [ ] Presets de clima nunca testados em cena de combate
- [ ] m2: telégrafo de investida do walker, pose de morte (hoje só some
      com alpha 0.2), estado de dano (o `lighter` atual estoura a silhueta)
- [ ] `PlayerAnimator` infere velocidade por tempo de movimento contínuo
      em vez de receber `|vx|/maxSpeed`. Funciona e está calibrado
      (0.28s ≈ accel 420 / maxSpeed 115); trocar agora seria churn.
- [ ] Deslocamento de 3px/6px nunca foi julgado em movimento por um humano
- [ ] Walker não telegrafa investida
- [ ] Copas ainda leem circulares — falta irregularizar a borda
- [ ] Chão com pouca variedade de forma (só 4 variantes por tipo)

## Correção de julgamento

Eu descrevi o guerreiro como "mancha escura pequena" na review r0.
Inspecionado de perto com `crop.mjs`, **o desenho é bom** — elmo com
viseira, penacho, armadura em vários tons, espada legível. O gap real não
é o desenho: é que ele lê pequeno e escuro contra chão escuro no frame
inteiro. A correção certa é rim light separando por valor, não redesenhar.

## Rodadas 1+ — os 8 módulos

Ninguém começa antes da rodada 0 fechar. Divisão e donos em
`AAA_BRIEF.md`.

- [ ] m1 terreno · [ ] m2 inimigos · [ ] m3 guerreiro · [ ] m4 fundo
- [ ] m5 atmosfera · [ ] m6 impacto · [ ] m7 HUD · [ ] m8 grade

## Dívida encontrada no caminho (não é escopo deste push)

- [ ] Duas árvores coexistem: `src/scenes|entities` (Phaser) está morto
      mas ainda compila e o `phaser` continua em `package.json`. O
      `ROADMAP.md` não registra a migração em lugar nenhum.
- [ ] `hero/` parou num checkpoint incompleto — 8 peças em `fail`,
      punho queimado. Ver `hero/progress.json`.

---

## Métricas que já foram burladas

Registrar aqui toda vez que uma métrica deixar de medir o que promete —
o `hero/BRIEF.md` policy #3 avisa que isso acontece e já aconteceu duas
vezes lá. Passar na métrica não é passar.

- **`chapado%` morreu quando o grão entrou.** Media pixels cujo entorno
  3x3 tem cor exatamente idêntica; o grão do grade altera todo pixel,
  então o número foi de 41.6% pra **0.00%** sem que uma única superfície
  chapada tivesse sido sombreada. Para julgar arte de tile, medir com
  `grain: 0` (use `GRADE_OFF`) ou a métrica mente.

## Premissas não validadas

- **m8 (grade)**: o custo de 0.62ms/frame do passe de pós-processamento
  foi medido em Node/V8, isolado. O ida-e-volta `getImageData` /
  `putImageData` no browser **não foi medido** e é custo adicional.
  Estimativa de +0.5–1ms, o que ainda deixaria o passe abaixo de 10% do
  frame — mas quem pegar o m8 deve medir de verdade antes de assumir.
  A decisão de não migrar pro Pixi (`PIXI.md`) não depende disso: a
  margem é grande demais pra virar, mas o número exato não está provado.
