# Prompt de push — Sword of Decay 3D (ThreeJS)

Versão do prompt "fan out sub-agents e /loop até ficar AAA" adaptada a
**este** projeto, agora em 3D.

O dono autorizou ThreeJS em 2026-08-14, revertendo a decisão de 2026-07-29
que travava o projeto em 2D. Tratar como decisão nova, não relitigar.

**Isto não é um ajuste no jogo atual — é uma segunda encarnação.** O render
inteiro do jogo 2D (pixel art desenhada em código) não transfere. O que
transfere está na seção "O que sobrevive", e é mais valioso do que parece.

Para disparar: cole a seção **PROMPT** inteira.

---

## PROMPT

Construa **Sword of Decay 3D** — plataforma 3D em ThreeJS. Mesma
identidade do jogo 2D existente: um guerreiro de espada e arco atravessando
um mundo corroído por uma praga chamada The Rot (`Lore/lore.md`,
`DESIGN.md` §4). Mesma gramática de nível kishōtenketsu. Nova dimensão.

Trabalhe em `3d/` — diretório novo, ou branch própria. **Não sobrescreva
`src/`.** O jogo 2D é 21 rodadas de trabalho medido e continua sendo a
referência viva de disciplina; se o 3D não vingar, ele não pode ter levado
o outro junto.

### A barra, dita com honestidade

O prompt de origem pedia "nível dos Call of Duty mais recentes". Isso não
é o alvo aqui e vale dizer por quê, uma vez, pra ninguém perseguir a coisa
errada por dez rodadas: fotorrealismo de CoD é orçamento de centenas de
pessoas e engine nativa, e um plataforma 3D não quer fotorrealismo nem
quando pode pagar — ele quer **legibilidade**, porque o jogador precisa
julgar distância de pulo em movimento.

A barra que serve, e é alta: **plataforma 3D estilizado de primeira
linha** — leitura de silhueta impecável, iluminação com intenção, 60fps
estáveis, câmera que nunca atrapalha. Julgue por essa régua, e por ela
seja implacável.

### Restrições

- **ThreeJS, WebGL.** 60fps a 1080p é contrato, não aspiração.
- **Nada de geração de arte por modelo de imagem**, PixelLab incluso
  (`DESIGN.md` §2.3). Geometria e material em código ou por asset CC0
  curado, com licença registrada em `ASSETS.md`.
- **Determinismo é contrato** — mas leia a Fase 0 antes de assumir que ele
  é de graça aqui, porque provavelmente não é.

### O que sobrevive do jogo 2D — comece por aqui, não do zero

1. **A física do movimento, já retunada e medida.**
   `src/config/archetypes.ts`, arquétipo `floaty`. Os valores são
   dimensão-agnósticos e custaram um playtest pra acertar:

       razao gravidade queda/subida .. 1.92   (era 1.17, e era ISSO que
                                               fazia a movimentacao ler
                                               como boneco de barbante)
       ar total por pulo ............. 0.66s
       tempo ate velocidade maxima ... 0.14s
       coyote time ................... 120ms
       jump buffer ................... 150ms
       jump cutoff (altura variavel) . 0.5

   Porte isso primeiro e sinta antes de inventar física nova. Gravidade
   assimétrica, coyote time e jump buffer são o que separa plataforma que
   responde de plataforma que briga com você — e valem igual em 3D.

2. **A sombra de contato projetada no chão.** `src/render/ContactShadow.ts`
   existe porque sem ela não dá pra saber onde o guerreiro vai pousar. Ela
   é **projetada no chão, não colada nos pés** — senão sobe junto no pulo e
   não informa nada. Em 3D esse mesmo problema é o problema central do
   gênero. Não é detalhe de polimento: é o instrumento de leitura.

3. **A gramática de nível.** `src/levels/chunkLibrary.ts` e o montador
   kishōtenketsu (ki/shō/ten/ketsu). A ideia de que uma fase ensina, testa
   e depois **torce** a lição é independente de dimensão.

4. **A disciplina de harness.** Vale mais que o código: captura
   determinística, sonda de estado, ablação como validação, alvo numérico
   só depois de olhar a cena. Ver `shots/`.

### Fase 0 — antes de qualquer polimento

**Não comece polindo.** Neste projeto, todo defeito grande foi uma coisa
que ninguém tinha olhado, não uma coisa mal feita: a música não tocava
havia semanas; água, espinho, chave, porta e objetivo nunca tinham
aparecido em captura nenhuma; dois cenários de combate golpeavam o ar por
duas rodadas. Em 3D há mais lugares pra algo silenciosamente não existir,
não menos.

Responda com evidência, não de memória:

1. **Dá pra capturar determinístico em WebGL headless?** Esta é a pergunta
   que pode derrubar todo o método e precisa ser a primeira. Toda a
   disciplina do projeto 2D se apoia em "duas capturas da mesma seed dão
   PNG byte-idêntico". Em WebGL isso passa por GPU, driver e ANGLE, e pode
   simplesmente não valer. Teste de verdade: mesma seed, duas execuções,
   compare hash.
   **Se não for byte-idêntico, pare e redesenhe a base de comparação**
   (diff perceptual com tolerância medida, e o limiar dessa tolerância
   validado por ablação). Não siga fingindo que é determinístico.
2. **Qual o orçamento de frame, medido no browser?** Não em Node, não
   estimado. O projeto 2D já registrou essa lição em `PIXI.md`: o custo do
   passe de grade foi medido isolado em Node e o ida-e-volta real no
   browser nunca foi medido. Em 3D o orçamento é o que mata o projeto —
   meça draw calls, triângulos e custo de sombra desde a rodada 0.
3. **Todo sistema declarado está de fato ligado?** Para cada coisa que a
   documentação afirma existir, ache o call site. Se `grep` não acha quem
   chama, ele não existe por mais que o documento diga que sim.
4. **O nível é atravessável do início ao fim?** Porte o cenário `traverse`
   (`shots/scenes.mjs`) — corre e pula do começo ao fim e a sonda diz até
   onde chegou. É o smoke test de jogabilidade.

### Os contratos de 3D que o 2D não tinha

Escreva-os como métrica antes de precisar deles:

- **Julgamento de profundidade.** O jogador consegue dizer onde vai pousar,
  em movimento? É o defeito nº1 do gênero. Instrumentos: sombra projetada
  sob o personagem, contraste entre topo e lateral das plataformas, borda
  de plataforma marcada. Métrica: taxa de queda em pulos que o jogador
  claramente pretendia acertar.
- **Câmera.** Em plataforma 3D a câmera é metade do game feel e não existe
  no 2D. Colisão com parede, ocultação do alvo, velocidade de acompanhamento
  e o que ela faz na queda são todos decisões, não defaults.
- **Frame time, com percentil.** Média mente. Meça p99 — travadinha de 40ms
  a cada dois segundos destrói a sensação sem mover a média.
- **Legibilidade de silhueta**, que transfere direto da rubrica 2D
  (`AAA_BRIEF.md` §6): personagem e inimigo em preto sólido, reduzidos,
  continuam distinguíveis?

### Fan-out

Um agente por módulo, dono único do arquivo. Regras que vieram de agentes
mortos aqui:

- **Brief curto por módulo, com o problema JÁ MEDIDO.** Três agentes
  morreram por limite de sessão gastando quase todo o orçamento só lendo
  contexto antes de produzir qualquer coisa.
- **Descreva o problema medido, não a solução presumida.** Dos que
  sobreviveram, dois corrigiram o brief que receberam — um recusou a
  técnica mandada, com razão técnica. O dono do módulo tem contexto que
  você não tem.
- **Poucos agentes por vez.** Disparar oito e perder oito não é paralelismo.

### Dois críticos, não um

**Crítico A — o olho.** Julga imagem ampliada contra a rubrica, aponta UM
gap por vez, mede antes de opinar. **Nunca escreva que comparou lado a
lado com jogo comercial** — não há acesso a esses assets, e este
repositório já pagou por essa mentira: `hero/CRITIC.md` precisou de regra
explícita proibindo a frase.

**Crítico B — o leitor de código.** Compara o que o código FAZ com o que o
comentário e o documento DIZEM que ele faz. Os três maiores defeitos do
jogo 2D saíram daí, e **nenhum era achável olhando um PNG**:

- um dither que prometia rampa de 3px e produzia pente na frequência
  máxima da grade, bem na altura das pernas do personagem;
- um comentário afirmando "o topo nunca escurece junto com o corpo"
  enquanto a função aplicava o escurecimento em todos os passos;
- a trilha sonora que não tocava havia semanas, com o ROADMAP descrevendo
  a fiação de uma cena deletada.

Quando uma métrica não cede a ajuste de parâmetro, **pare de ajustar e vá
ler o código.** Três rodadas foram gastas empurrando um número no braço
contra um bug.

### O /loop, e quando ele para

`/loop` por item, com condição de parada explícita. "Até estar perfeito" e
"até o crítico ficar impressionado" **não servem** — o crítico já ficou
impressionado com uma versão que não tinha som nenhum, tinha espinhos
vetoriais e um pulo cuja queda não acelerava.

Um item fecha quando os quatro valem:

1. **Os contratos medidos passam em todos os cenários**, não em um.
2. **O critério foi validado por ablação**: remova o conserto, recapture,
   confirme que a métrica REPROVA. Critério que não reprova nada não vale
   nada — este projeto teve quatro limiares mal calibrados seguidos antes
   de adotar essa regra.
3. **Determinismo (ou a base de comparação da Fase 0) intacto**, verificado.
4. **Um humano jogou.** Game feel se ajusta jogando (`CLAUDE.md`), e foi
   um playtest de trinta segundos que achou o defeito de movimentação que
   nenhuma métrica tinha pegado.

### Alvo numérico só depois de olhar a cena que ele vai julgar

Regra escrita com sangue no projeto 2D. Alvos escritos antes e errados:
`shadowMassMin = 0.30`, extrapolado antes de existir cena; a primeira
métrica de camadas, que exigia o palco mais claro que o fundo — impossível,
a banda de fundo contém o céu; um limiar de contraste de 0.75; e "% de
colunas fracas", que reprovava a arte por ter a variação que se pediu a
ela. O que salvou a última foi **trocar a pergunta**: não "quantas colunas
são fracas" mas "qual a maior corrida seguida sem beirada legível".

Quando um alvo não cede, considere que o alvo é que está errado.

### Registro

`TASKS.md` é o estado durável — a conversa não é o estado. Risque conforme
conclui, não no fim. Registre o que ficou pela metade e o que você presumiu
sem validar: foi a ausência disso que custou três rodadas.

---

## O que muda em relação ao prompt de origem

**"Nível dos Call of Duty mais recentes" → plataforma 3D estilizado de
primeira linha.** Fotorrealismo não é o alvo de um plataforma, que precisa
de legibilidade pra o jogador julgar distância de pulo. Perseguir a régua
errada por dez rodadas é o risco real.

**"Compare lado a lado às cegas com o jogo real" → ablação.** Não há
acesso aos assets de jogo comercial no ambiente, e agente instruído a
comparar *escreve* que comparou — já aconteceu aqui. A ablação é
comparação cega de verdade contra evidência que existe: tire o conserto,
recapture, confirme que a métrica detecta a piora. Foi ela que validou o
critério de aresta do jogo 2D.

**"Até o crítico ficar impressionado" → condição de parada em quatro
itens.** Um crítico visual impressionado é compatível com um jogo mudo e
com pulo quebrado.

**Fan-out mantido, com Fase 0 na frente.** Subagentes funcionam aqui — três
entregaram bem e dois corrigiram o brief recebido. O que não funciona é
fanar out direto pro polimento: polir oito superfícies em paralelo
enquanto a captura determinística nem foi provada é gastar oito agentes
antes de saber se dá pra medir alguma coisa.
