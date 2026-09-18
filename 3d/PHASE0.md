# Fase 0 — Sword of Decay 3D

Respostas com evidência às perguntas do `PUSH_PROMPT.md`, antes de qualquer
arte. Reproduzir com `node 3d/probe/capture.mjs --out <dir> --gl <backend>`.

## 1. Dá pra capturar determinístico em WebGL headless? **SIM.**

Era a pergunta que podia derrubar o método inteiro: toda a disciplina do
jogo 2D se apoia em "mesma seed, PNG byte-idêntico", e em WebGL isso passa
por GPU, driver e ANGLE.

A cena-sonda (`3d/probe/scene.ts`) é **representativa de propósito** — um
quad chapado pode sair idêntico e um jogo de verdade não. Ela exercita os
caminhos onde o não-determinismo costuma morar: shadow map com PCF, névoa
exponencial, materiais PBR com normais interpoladas, geometria instanciada
por PRNG semeado, e pontos translúcidos (blending é sensível a ordem de
sorting).

    SwiftShader (software) .. byte-IDENTICO em 3 execucoes independentes
    Metal / Apple M2 Pro .... byte-IDENTICO em 2 execucoes independentes

**O método do projeto 2D transfere para 3D.** Ablação, comparação entre
rodadas e contratos medidos continuam valendo como estão.

## 2. Mas o backend tem que ser FIXADO. Não é intercambiável.

Mesma cena, mesma seed, backends diferentes:

    pixels diferentes ... 1.9-2.3%
    erro medio .......... 0.02-0.03 / 255
    erro maximo ......... 27-49

O conteúdo estrutural é idêntico; a diferença mora em borda de antialias e
de sombra. Duas consequências práticas:

- **O harness declara o backend e não muda.** Comparar captura de GPU com
  captura de software produz diff em 2% dos pixels que não é regressão
  nenhuma — e seria exatamente o tipo de falso positivo que faz perder uma
  rodada.
- Se um dia for preciso comparar entre backends, use diff perceptual com
  tolerância, e **valide a tolerância por ablação** antes de tratá-la como
  portão. (Quatro limiares mal calibrados seguidos no projeto 2D.)

Recomendação: **SwiftShader como backend do harness**. Tira GPU e driver
da conta, então a captura continua reproduzível em outra máquina — que é o
ponto de ter captura determinística. A GPU real serve pra medir
desempenho, não pra comparar imagem.

## 3. Orçamento de frame — medido, não estimado

GPU real (Metal, M2 Pro), 640×360, cena-sonda:

    mediana ......... 0.20ms
    p99 ............. 0.70ms
    MAXIMO .......... 19.7ms   <- quadro 0
    draw calls ...... 22
    triangulos ...... 552

**O pico de 19.7ms no primeiro quadro é compilação de shader**, e é achado
de verdade, não ruído: 19.7ms é mais que um quadro inteiro a 60fps. Num
jogo com vários materiais isso vira engasgo visível toda vez que algo novo
entra em cena. A correção é conhecida — passe de aquecimento que compila e
renderiza cada material fora da tela antes do jogo começar — e precisa
estar no plano desde o início, não depois.

Nota de método herdada do 2D (`PIXI.md`): custo medido isolado mente. O
número acima é headless com GPU real, o que é uma boa aproximação, mas o
definitivo é medir num browser normal.

## 4. Sistemas ligados / nível atravessável — **não se aplica ainda**

As perguntas 3 e 4 do `PUSH_PROMPT.md` existem pra pegar coisa que a
documentação afirma e o código não faz. Não há jogo 3D ainda, então não há
o que verificar. **Elas voltam a valer no primeiro dia em que houver
gameplay** — e a experiência do 2D diz que voltam valendo muito: a trilha
sonora ficou semanas sem tocar com o ROADMAP descrevendo a fiação de uma
cena deletada.

## O que isso libera

Fan-out pode começar. A base de medição existe e está provada:

- `3d/probe/capture.mjs` — captura determinística, backend parametrizado
- `3d/probe/scene.ts` — cena representativa, útil como caso de regressão
- métricas do 2D (`shots/measure.mjs`) continuam aplicáveis no que é
  fundamento de render: separação de valor entre planos, legibilidade de
  silhueta, âncora de cor

## O que ainda NÃO existe e não deve ser presumido

- Nenhum contrato específico de 3D foi escrito ainda: julgamento de
  profundidade, câmera, p99 de frame time sob carga real, popping de LOD.
  Escrever a métrica **depois** de olhar a cena que ela vai julgar — regra
  escrita com sangue no projeto 2D.
- A física do jogo 2D (`src/config/archetypes.ts`, já retunada e medida)
  ainda não foi portada. É o primeiro item de gameplay, e o prompt manda
  começar por ela em vez de inventar física nova.
