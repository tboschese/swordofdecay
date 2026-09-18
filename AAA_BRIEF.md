# Sword of Decay — Push AAA. Brief compartilhado.

Leia isto inteiro antes de tocar em qualquer coisa. Você é um de vários
agentes trabalhando no mesmo jogo, cada um dono de exatamente um módulo.

## O objetivo

Levar **Sword of Decay** — plataforma medieval 2D em pixel art, engine
canvas própria, guerreiro amaldiçoado atravessando um mundo corroído por
uma praga chamada The Rot — ao nível de acabamento de um jogo comercial
publicado. Perfeito em cada superfície: terreno, inimigos, iluminação,
atmosfera, efeitos de combate, HUD, feedback de impacto.

Não é "melhorar um pouco". É: alguém que abre um vídeo do jogo não
consegue dizer que foi feito por uma pessoa em sessões de fim de semana.

## A barra

**Metal Slug (Neo Geo) e Castlevania: Symphony of the Night (Saturn/PS1).**
Essa já é a referência declarada do projeto — `DESIGN.md` §2.1, decidida
em 2026-07-05. "32-bit mas 2D": paletas ricas por sprite, sombreamento em
gradiente dentro do próprio pixel art, não blocos chapados de 8-bit.

**Restrição honesta — leia com atenção.** Não temos como exibir capturas
reais desses jogos aqui: é arte proprietária, sem acesso a imagem. Então
a barra é imposta pela **rubrica concreta abaixo mais as ferramentas de
medição**, não por diff de pixel contra um screenshot real.

Não invente que comparou. Não escreva "comparei lado a lado com a
referência" — você não comparou. Julgue contra a rubrica, contra o
critério testável do `DESIGN.md`, e contra o que você sabe que arte de
jogo publicado parece. E seja duro.

Este projeto já pagou por essa lição: no push anterior (`hero/`, o render
da espada) os agentes escreviam comparações que não fizeram, e a
`hero/CRITIC.md` precisou de uma regra proibindo a frase. Não repita.

### A rubrica

1. **Legibilidade em movimento.** O jogo é jogado a 60fps numa janela de
   384×224 lógicos. Detalhe que só aparece em frame parado e vira ruído em
   movimento é detalhe mal gasto. Julgue em captura de frame *e* em
   sequência.
2. **Profundidade por valor, não por quantidade de coisas.** Fundo, meio e
   frente separados por valor e temperatura, não por lotar a tela de
   objetos. Um tile com 4 tons da mesma cor vale mais que três camadas de
   entulho.
3. **Hierarquia de material.** Pedra, madeira, metal, carne corrompida e
   vegetação morta precisam ser distinguíveis **com a cor removida** — por
   textura e comportamento de luz. Converta pra cinza e confira.
4. **A corrosão é crescida, não pintada.** The Rot segue frestas,
   gravidade e pontos de contato. Come a silhueta. Tem zona de transição
   entre limpo e consumido — não é overlay de ruído uniforme.
5. **Impacto tem peso.** Acerto de espada, flecha cravando, inimigo
   morrendo: cada um tem hitstop, deslocamento, partícula e som que
   concordam entre si. Um golpe que não sacode nada lê como protótipo.
6. **Silhueta de inimigo legível a 16px.** Preenchido de preto e reduzido,
   cada inimigo continua identificável e distinto dos outros. Se dois
   inimigos viram a mesma mancha, um dos dois está errado.
7. **Um ponto focal por tela.** O guerreiro e a ameaça imediata dominam. O
   cenário sustenta, não compete.
8. **A imagem lê como arte de produto, não como viewport de dev.** Vinheta
   deliberada, riqueza cromática nas sombras, grão que fica embaixo do
   detalhe e não por cima.

## A lore não é decoração — ela decide a arte

`Lore/lore.md` e `DESIGN.md` §4. Resumo operacional:

**The Rot** é uma praga que corrói três coisas: **carne, pedra e
memória**. Isso é literal e é a regra de arte mais útil do projeto. Toda
superfície do jogo deve responder a pelo menos uma delas:

- **carne** — inimigos deformados, crescimento errado, assimetria, coisas
  que continuaram vivas depois que deviam ter parado;
- **pedra** — arquitetura cedendo, tile rachando, estrutura que perdeu a
  intenção de quem construiu;
- **memória** — o mais difícil e o mais valioso: detalhe que *se apaga*.
  Inscrição ilegível, brasão que não dá mais pra identificar, caminho que
  não leva mais a lugar nenhum. Onde couber, prefira isto ao gore óbvio.

O guerreiro **também está em decay, e talvez seja a origem**. Ele não é o
elemento limpo contra um mundo sujo. Não o renderize como herói polido
sobre fundo podre.

**Curva de tom em 10 regiões** (`DESIGN.md` §4): da negação/estranhamento
(Região 1, Ruína Silenciosa) até quase-redenção (Região 9) e confronto
final consigo mesmo (Região 10, Trono da Decadência). Toda fase real tem
que ser localizável em algum ponto dessa curva, e o tom não pode
contradizer onde ela cairia. Uma fase inicial não pode soar "mundo
quebrando, fim de tudo". Se seu módulo empurra o tom pra fora do ponto da
curva onde a fase está, ele está errado por mais bonito que esteja.

## Como o trabalho é dividido

Um dono por módulo. **Você edita apenas o(s) arquivo(s) do seu módulo** —
outro agente está editando todos os outros ao mesmo tempo.

| módulo | dono de | superfície |
|---|---|---|
| m1 terreno | tileset + `config/tileset.ts` | chão, parede, plataforma |
| m2 inimigos | `render/sprites.ts` + render de `core/Enemy.ts` | walker, shooter, futuros |
| m3 guerreiro | `render/KnightRenderer.ts`, `core/PlayerAnimator.ts` | pose, animação, leitura |
| m4 fundo | `config/parallax.ts` + camadas | mínimo 3 camadas (`DESIGN.md` §2.2) |
| m5 atmosfera | iluminação, neblina, clima, color cycling | o ar entre câmera e cenário |
| m6 impacto | `render/Particles.ts`, hitstop, screenshake | feedback de combate |
| m7 HUD | UI de produto (ROADMAP Sessão 7) | vida, munição, telas |
| m8 grade | pós-processamento final, vinheta, grão | a passada que amarra tudo |

Os arquivos de engine (`engine/`, `core/Player.ts`, `core/Combat.ts`,
`level/`) **não são de ninguém neste push** — são gameplay já assentado e
validado em playtest. Não mexa. Se o seu módulo precisa de um hook que
não existe, peça; não edite.

## Como se mede

**Este é o problema técnico central deste push e ele ainda não está
resolvido.** O push anterior media uma imagem estática. Um jogo em
movimento não se mede assim, e sem instrumento os agentes avaliam por
achismo e a rodada nunca fecha.

**Rodada 0 é construir o instrumento, antes de qualquer trabalho de arte.**
No mínimo:

- **Captura determinística de frame.** Seed fixa, estado de jogo fixo,
  N frames específicos de situações nomeadas (parado, correndo, no ar,
  golpe conectando, morrendo). Mesma entrada tem que dar o mesmo PNG
  sempre — senão nenhuma comparação entre rodadas significa nada.
- **Captura de sequência** pro critério de legibilidade em movimento.
- **Métricas objetivas** por frame: histograma de luminância, separação de
  valor entre camadas de profundidade, saturação do sujeito contra fundo,
  teste de cinza (converte pra luminância e confere que a hierarquia de
  material sobrevive), silhueta de inimigo reduzida a 16px.

Sem isso, "ficou bom" não é evidência e a rodada não fecha.

## Protocolo de rodadas

O push anterior rodou 8 rodadas com as 8 peças ainda em `fail` e perdeu
trabalho quando as sessões acabaram no meio da calibração. Por isso:

1. **Orçamento explícito por rodada.** Cada agente sabe quanto tem antes
   de começar e para dentro do orçamento.
2. **Checkpoint obrigatório.** Ao fim da rodada — ou ao sentir que está
   acabando — o agente grava em `progress.json` o estado do seu módulo:
   o que mudou, o que ficou pela metade, e **qual premissa ele assumiu que
   ainda não foi validada**. Trabalho não registrado é trabalho perdido.
3. **Estado meio-calibrado é declarado, não escondido.** No push anterior
   três agentes deixaram superfícies calibradas assumindo que outra coisa
   ia cobri-las; não cobriu, e o resultado ficou queimado por três
   rodadas. Se você calibrou contra uma premissa, escreva a premissa.
4. **Só avança quem passou.** Módulo em `fail` não vira base pro próximo.

## O crítico

Um agente separado, que não construiu nada e não deve nada a ninguém.
Protocolo em `hero/CRITIC.md` — vale igual aqui, com uma adição: além do
frame, ele julga a **sequência**, porque metade das falhas deste jogo só
aparecem em movimento.

Regras que não se negociam:

- **Abre a imagem.** Review escrita lendo código-fonte é descartada.
- **Mede antes de opinar** e cita os números.
- **Não afirma comparação que não fez.**
- **Nomeia UM gap.** Não uma lista. Se apontar cinco coisas, o construtor
  faz as cinco mal.
- **Passa ou falha, explicitamente.** Passar coisa mediana desperdiça
  rodada. Reprovar coisa boa por rigor de fachada desperdiça igual.

## Restrições duras

- **Não trocar de engine.** Canvas 2D próprio, `src/engine/` + `src/game/`.
  Nada de ThreeJS, nada de 3D, nada de voltar pro Phaser.
- **Tile e sprite continuam 16×16**, upscale inteiro, `pixelArt`. A
  estética SNES/Neo Geo muda riqueza de cor e sombreamento, **não** o
  tamanho do tile nem o grid de colisão (`CLAUDE.md`, `DESIGN.md` §2.1).
- **Resolução lógica 384×224** (`wide`). Não mexer.
- **Nada de número mágico.** Física, combate e nível vêm de preset nomeado
  em `src/config/`. Se você precisou de uma constante, ela vira config.
- **Game feel não se ajusta por teoria.** Os arquétipos de movimento e o
  combate foram fechados em playtest. Este push é de apresentação; se
  você acha que o game feel precisa mudar, escreva isso no `progress.json`
  e siga — não altere.
- **A barra não desce por prazo** (`DESIGN.md` §5). Se a rodada não bate o
  critério, o escopo da rodada diminui — a barra fica onde está.

### Origem dos assets — DECIDIDO, não relitigar

`DESIGN.md` §2.3 vale como está escrito: sprite e tile vêm de **biblioteca
curada CC0, nunca gerados por modelo de imagem**, com licença registrada
em `ASSETS.md`. O critério testável continua sendo "nenhum asset visual é
gerado por modelo de imagem".

**Confirmado pelo dono do projeto em 2026-07-29.** Existe um gerador de
pixel art conectado ao ambiente (PixelLab MCP, 40+ ferramentas de sprite,
tileset e animação). **Ele está fora deste push.** Não chame essas
ferramentas. Não sugira chamá-las. A proibição é decisão consciente, não
esquecimento.

Você tem exatamente dois caminhos para produzir arte:

1. **Curadoria CC0** — escolher asset de biblioteca livre, recolorir pra
   paleta do jogo quando fizer sentido, e registrar a licença em
   `ASSETS.md`. Comparação visual lado a lado antes de integrar (lição da
   Sessão 2, `ROADMAP.md`).
2. **Arte procedural em código** — o caminho do `render/KnightRenderer.ts`
   (48KB de cavaleiro desenhado em código) e do `render/sprites.ts`.
   Este é um terceiro caminho que o §2.3 não previu quando foi escrito,
   e é legítimo: não é asset gerado por modelo, é arte autoral em código.

Para inimigos e efeitos, o caminho 2 é provavelmente o certo — já existe
infraestrutura. Para o tileset, o caminho 1 resolve a pendência aberta do
`DESIGN.md` §2.1 mais rápido.
