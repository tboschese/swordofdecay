# DESIGN.md — Decisões criativas e barras de qualidade

Este documento existe para uma razão específica: "jogo interessante" e
"gráficos bonitos" são frases vagas demais para guiar geração ou revisão.
Cada seção abaixo termina com um **critério testável** — se não bate o
critério, a sessão não está concluída, mesmo que "funcione".

---

## 1. Jogabilidade

### 1.1 Arquétipos de movimento (a alma do jogo)

O game feel nunca é genérico — todo jogo usa um dos arquétipos abaixo,
tunado à mão, nunca "física padrão":

| Arquétipo | Sensação | Onde usar |
|---|---|---|
| `precise` | para instantâneo, pulo seco, controle aéreo total | ninja, ação, precisão |
| `momentum` | acelera e derrapa, pulo varia com velocidade | aventura, velocidade, fluxo |
| `heavy` | pulo comprometido, sem controle aéreo pós-salto | tensão, survival, peso |
| `floaty` | queda lenta, hangtime generoso | espaço, sonho, fofo |
| `slippery` | fricção baixíssima como identidade central | gelo, caos controlado |

Cada arquétipo carrega parâmetros finos e obrigatórios: **coyote time**
(~80-120ms), **jump buffer** (~100-150ms), **jump cutoff** (soltar o botão
corta a subida), e gravidade de subida ≠ gravidade de descida (queda mais
rápida que subida = pulo responsivo). Um pulo sem essas quatro coisas é
sempre pior, independente do arquétipo.

**Critério testável**: jogando de olhos fechados (só pelo som/timing), o
usuário distingue os 5 arquétipos entre si. Nenhum arquétipo pode ser
"a física padrão do Phaser com um multiplicador". O guerreiro de Sword of
Decay usa `floaty` (`src/config/character.ts`) — os outros 4 continuam
implementados e testáveis no `PlaygroundScene` (tecla T), como catálogo
de referência pro engine.

### 1.2 Arquétipos de combate

Combate não é um switch estético — cada tipo (`stomp`, `projectile`,
`sword`) implica um primitivo de engine próprio, não uma reskin do mesmo
ataque:

| Valor | Alcance | Interação com `spiky` |
|---|---|---|
| `stomp` | vertical, só de cima | não funciona (por isso `spiky` existe) |
| `projectile` | à distância, direção horizontal | funciona |
| `sword` | curto alcance, corpo a corpo | funciona |

O guerreiro de Sword of Decay usa os dois à distância/corpo a corpo
sempre ativos e simultâneos — espada (`sword`) e flecha (`projectile`,
ver `config/character.ts`), sem seleção de classe nem exclusividade.
`stomp` continua implementado no engine (testável no `PlaygroundScene`)
mas não é usado pelo guerreiro por ora.

**Critério testável**: existe pelo menos 1 situação na fase (inimigo ou
obstáculo) que só é resolvida por cada uma das duas armas — nenhuma é
redundante. (Vale pra quando a montagem de fases (Sessão 3+) começar a
colocar `spiky`/`flyer` de propósito.)

`chargedAttacks` (booleano, ver `config/character.ts`) decide se
`projectile`/`sword` usam segura-e-solta. Quando `true`: soltar o botão
antes do limiar de carga dá o ataque normal (rápido, fraco); segurar até
o limiar e soltar dá o ataque carregado (mais dano/alcance/velocidade,
cooldown maior). O guerreiro usa `true` nos dois: espada 3 de dano normal
/ 5 carregada, flecha 1 normal / 3 carregada — a espada machuca mais mas
é corpo a corpo, a flecha é mais segura mas mais fraca.

**Critério testável**: segurando o botão além do limiar, o ataque
resultante é perceptivelmente mais forte (visual maior/diferente e mais
dano) que o toque rápido — sem confundir os dois no calor do jogo.

### 1.3 Estrutura de fase: kishōtenketsu

Toda fase segue a estrutura de 4 atos:

- **Ki** (apresenta): mecânica nova, contexto seguro, erro não pune
- **Shō** (desenvolve): mesma mecânica, risco real
- **Ten** (torce): subversão — combinação inesperada ou inversão da regra
- **Ketsu** (conclui): teste final antes da saída

Toda fase declara seu `twist` em uma frase (comentário/nota na definição
da fase — não é mais um campo de schema validado por IA, mas a disciplina
de exigir a frase continua). Se ninguém no time consegue articular a
torção em uma frase clara, a fase não tem identidade e deve ser
redesenhada — este é o teste mais importante de qualidade estrutural do
jogo inteiro.

**Critério testável**: cada fase tem um `twist` que um jogador consegue
apontar depois de jogar ("ah, é a fase onde as tochas apagam"). Fase onde
a resposta é "não sei, só tem mais inimigos" = reprovada.

### 1.4 Biblioteca de chunks (não grid solto)

Fases são montadas a partir de chunks de 8-16 colunas desenhados à mão,
taggeados por: mecânica exigida, dificuldade (1-5), função
(ki/shō/ten/ketsu), compatibilidade com o arquétipo `floaty` do guerreiro.
Um montador sequencia e parametriza os chunks respeitando a ordem
ki-shō-ten-ketsu; ninguém desenha tile a tile do zero pra cada fase nova.

**Critério testável**: todo chunk usado numa fase tem uma tag de função
compatível com a posição onde foi usado (nenhum chunk "ten" no meio de
uma seção "ki").

### 1.5 Playtester automático (validação de "interessante")

Um bot roda cada fase (mesmo solver de alcançabilidade + ruído) e mede:
tempo parado, variedade de inputs usados, mecânicas realmente exigidas
(vs. apenas presentes no grid), mortes por seção. Como o jogo agora tem
um número fixo e pequeno de fases (não geração em lote), isso é mais uma
ferramenta de QA opcional do que um gate obrigatório — mas o critério de
"não tediosa" continua valendo pro design manual.

**Critério testável**: fase completável só segurando "direita" + pulo
ocasional (baixa entropia de input) é sinalizada como tediosa, não só
verificada por bug estrutural.

---

## 2. Gráficos

### 2.1 Paleta como identidade, não decoração

O plano original era travar nas 54 cores do hardware NES com um gerador
de paletas por seed (pra jogos diferentes não se confundirem visualmente
entre si). Isso não se aplica mais — Sword of Decay é um jogo só, com uma
paleta fixa. Em 2026-07-05 (Sessão 6) foi decidido primeiro que recolorizar
pro subconjunto de 54 cores do NES não valia o retrabalho; na sequência a
referência de hardware inteira mudou de NES pra **SNES/Neo Geo** — o
alvo visual agora é "32-bit mas 2D" (pense Metal Slug, Castlevania:
Symphony of the Night): paletas muito mais ricas por sprite (SNES: até
256 cores em tela a partir de paleta de 32.768; Neo Geo: até 4096 em tela
a partir de 65.536), sombreamento em gradiente dentro do próprio pixel
art, não só blocos de cor sólida como no visual NES anterior.

Isso muda o padrão de qualidade de asset: um tile/sprite bom agora usa
várias tonalidades da mesma cor pra sugerir volume/luz (SNES/Neo Geo de
verdade fazem isso), não 1-2 tons chapados por elemento. **Pendência
real**: o tileset atual (OpenGameArt "Platformer Tileset 16x16", ver
ASSETS.md) é estilo NES simples/chapado — não bate com esse alvo mais
rico. Precisa ser trocado por um tileset com mais profundidade de cor e
sombreamento antes de fechar a barra de qualidade visual desta seção.

**Critério testável**: um tile de chão/parede do jogo, olhado de perto,
mostra pelo menos 3-4 tons da mesma cor (não só contorno + preenchimento
sólido) — hoje o tileset atual não bate nesse critério, então a
pendência continua aberta.

### 2.2 Truques de hardware como geradores de variedade

- **Color cycling**: rotação de paleta para água, lava, luzes piscando —
  obrigatório em pelo menos 1 elemento por fase temática relevante.
- **Camada de decoração separada da colisão**: vocabulário decorativo
  (ruínas, vegetação, ossadas, maquinário) varia independente da geometria.
- **Clima/hora**: neblina, chuva, entardecer como modificadores visuais
  ortogonais ao tema — mesmo tema, atmosferas diferentes.
- **Parallax de múltiplas camadas** (mínimo 3 camadas de fundo) — sem
  isso o jogo parece flat/protótipo, não com a profundidade esperada de
  um visual estilo SNES/Neo Geo.

**Critério testável**: toda fase tem parallax de no mínimo 3 camadas e
pelo menos um efeito de color cycling visível nos primeiros 10 segundos.

### 2.3 Assets: curadoria > geração

Sprites e tiles vêm de biblioteca curada (CC0), nunca gerados por modelo
de imagem — seleção e (quando fizer sentido) recoloração via paleta são
decisão manual, com comparação visual lado a lado antes de integrar (ver
ROADMAP.md, lição da Sessão 2).

**Critério testável**: nenhum asset visual é gerado por modelo de imagem;
todos vêm de biblioteca curada com licença registrada em `ASSETS.md`.

---

## 3. Música

### 3.1 Biblioteca curada por mood

Faixas CC0 escolhidas manualmente por mood (aventura, perigo, mistério,
final) pra cada fase — implementado na Sessão 6 (`src/config/music.ts`,
`Mood`, licenças em `ASSETS.md`), com a referência de hardware ainda em
NES (2 pulse + 1 triangle + 1 noise, faixas "chiptune" de Juhani Junkala).

Com a mudança de alvo visual pra SNES/Neo Geo em 2026-07-05, a restrição
de canais do NES deixou de fazer sentido como critério — SNES usa síntese
por amostra (SPC700, 8 canais ADPCM) e Neo Geo usa FM real (YM2610),
ambos soando mais próximos de instrumento de verdade do que onda
quadrada pura. **Pendência real**: as 4 faixas atuais são explicitamente
"chiptune"/8-bit no nome e na textura sonora (pack "Chiptune Adventures")
— provavelmente simples demais pro novo alvo. Precisa reavaliar se
continuam servindo (ao menos como mood temporário) ou se a biblioteca
também precisa ser re-curada com faixas de estilo 16/32-bit
(instrumentação mais rica, menos "bipe" puro).

**Critério testável**: ouvindo a faixa sem ver o nome do arquivo, ela
soa mais parecida com trilha de SNES/Neo Geo (instrumentos reconhecíveis,
camadas de som) do que com um jingle de 8 bits puro. Ainda não avaliado
— falta playtest manual (ver ROADMAP.md Sessão 6).

### 3.2 Composição própria (opcional, futuro)

Se fizer sentido depois, compor trilha própria via Tone.js a partir de
uma partitura simples: melodia, harmonia, baixo, percussão — sem a
limitação de canais do NES (o modelo pulse/pulse/triangle/noise não vale
mais pro alvo SNES/Neo Geo), mas ainda com poucas vozes simultâneas pra
manter leve. Estrutura obrigatória: A-B-A ou A-A-B-A (forma reconhecível,
nunca stream aleatório de notas).

**Critério testável**: uma pessoa consegue cantarolar o tema principal
depois de ouvir uma vez — ou seja, existe motivo melódico repetido, não
só textura de fundo.

### 3.3 Coerência entre música e nível

O mood da faixa de cada fase deve casar com o `twist` e a densidade de
perigo — uma fase com torção assustadora não pode ter trilha "aventura"
genérica.

**Critério testável**: revisão cruzada manual antes de cada release de
faixa nova na biblioteca — mood da tag bate com a sensação real ao ouvir.

---

## 4. Narrativa (moldura temática)

O lore completo vive em `Lore/lore.md` (The Rot, 10 regiões temáticas,
roteiro fase a fase até a fase 120). **Decisão de escopo**: esse lore é
moldura temática — tom, paleta emocional, motivo de boss — e não um
backlog de conteúdo. O jogo continua construindo um número pequeno de
fases hand-built (ver ROADMAP.md; "qualidade estrutural sobre
quantidade", CLAUDE.md). Nenhuma sessão nova é criada só para bater 120
fases, nem para implementar diálogo de NPC, degradação visual do
guerreiro ou quebra progressiva de arma — essas ideias ficam no mesmo
status de "futuro opcional" que §3.2 (composição própria), disponíveis se
alguma sessão futura decidir puxá-las, mas não bloqueiam nada do
ROADMAP.md atual.

O que a moldura dá de verdade pro jogo hoje:

- **Tema central**: uma praga (**The Rot**) corrói carne, pedra e
  memória; o guerreiro descobre — cedo ou tarde, dependendo de quanto do
  lore for exposto — que ele também está em decay, e talvez seja a
  origem. Isso é o "porquê" atrás de qualquer escurecimento de paleta,
  inimigo corrompido ou boss na estrutura kishōtenketsu (§1.3).
- **Progressão emocional em 10 regiões**: da negação/estranhamento
  (Região 1, Ruína Silenciosa) até quase-redenção (Região 9) e confronto
  final consigo mesmo (Região 10, Trono da Decadência). Cada fase real
  construída deve ser localizável em algum ponto dessa curva de tom —
  não precisa existir fisicamente a região inteira, mas o tom não pode
  contradizer onde ela cairia na curva (ex.: nada com clima de
  "quase-redenção" logo na primeira fase do jogo).
- **Bosses como motivo, não obrigação de conteúdo**: os nomes/temas de
  boss por região (Cavaleiro Caído, Guardião Raiz, etc., ver
  `Lore/lore.md`) são referência pronta pra quando uma fase precisar de
  um boss — não uma lista de 10 bosses a entregar.

**Critério testável**: pra qualquer fase real do jogo, alguém consegue
apontar em qual trecho da curva de 10 regiões ela se encaixaria em tom
(sem precisar que a região exista de fato), e essa resposta não
contradiz a progressão descrita em `Lore/lore.md` (ex.: uma fase inicial
não pode soar "mundo quebrando, fim de tudo").

---

## 5. Regra geral de qualidade

Nenhuma dessas barras é negociável por prazo. Se uma sessão do roadmap
não consegue atingir o critério testável da área que está tocando, o
escopo da sessão diminui (menos fases, menos chunks) — a barra de
qualidade não desce.
