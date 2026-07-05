# ROADMAP.md — Sessões de construção

Cada sessão tem escopo fechado e um critério de saída testável. Não avançar
para a próxima sessão sem o critério anterior atendido — ver DESIGN.md para
as barras de qualidade completas de jogabilidade, gráficos e música.

Status: marcar `[ ]` → `[x]` ao concluir, com data.

**Pivot (2026-07-04)**: o projeto começou como "Tento", um gerador de
jogos por IA — Sessões 1-2 abaixo foram construídas com esse objetivo
(daí porem referências a "arquétipos"/"temas" no plural, pensados pra
variar por jogo gerado). Foi pivotado pra **Sword of Decay**, um jogo
único e fixo: um guerreiro com espada e arco. O engine (movimento,
combate, tilemap, parallax) foi 100% reaproveitado; a Sessão 6 original
("Prompt system", geração via IA) foi descartada. Sessões 3-5 e 7 abaixo
foram reescritas pra fazerem sentido num jogo fixo em vez de um gerador.

**Pivot visual/sonoro (2026-07-05)**: referência de hardware mudou de NES
pra **SNES/Neo Geo** — alvo agora é "32-bit mas 2D" (paletas ricas,
sombreamento em gradiente), não mais o visual chapado de 8 bits nem a
restrição de canais de áudio do NES (ver CLAUDE.md, DESIGN.md §2/§3).
Isso reabre duas pendências de asset dentro da Sessão 6 (ver lá): o
tileset atual e as 4 faixas de música curadas são estilo NES e
provavelmente precisam ser trocados/reavaliados pro novo alvo. Nenhuma
sessão concluída (1-5) muda de escopo por causa disso — é só o padrão de
qualidade visual/sonoro daqui pra frente.

---

## Sessão 1 — Arquétipos de movimento e combate (game feel puro)
`[x]` concluída em 2026-07-04

Escopo: playground hardcoded (retângulos coloridos, sem tileset), 5
arquétipos de movimento implementados (`precise`, `momentum`, `heavy`,
`floaty`, `slippery`), troca em tempo real (teclas 1-5), painel de debug
mostrando parâmetros ativos. Estendido para incluir os 3 tipos de combate
de SPEC.md (`stomp`, `projectile`, `sword`), parametrizados em
`config/combat.ts`, ligáveis/desligáveis independentemente (teclas 6-8,
ataque com X/C) e testáveis contra dois alvos (`Dummy` normal e spiky).

**Critério de saída — movimento** (atendido): os 5 arquétipos são
distinguíveis de olhos fechados (DESIGN.md §1.1). Coyote time, jump
buffer e jump cutoff implementados em todos. Nenhuma "física padrão" sem
tuning.

**Critério de saída — combate** (atendido): os 3 tipos de ataque produzem
efeito claramente diferente contra o dummy normal, e `stomp` não tem
efeito algum contra o dummy spiky (DESIGN.md §1.2). Confirmado em
playtest manual, incluindo a variante carregada (`chargedAttacks`).

---

## Sessão 2 — Tilemap real + parallax
`[x]` concluída em 2026-07-04

Escopo: parser do grid ASCII (legenda do SPEC.md §1), tileset de 1 tema
(ex. forest) da biblioteca curada, mínimo 3 camadas de parallax, color
cycling em pelo menos 1 elemento (água ou luz).

Implementado: `src/level/gridParser.ts` (parser com autotile simples pra
chão/água; plataforma one-way e espinho viram marcador à parte), tileset
"forest" curado (OpenGameArt "Platformer Tileset 16x16", CC0 — ver
`ASSETS.md`), `TilemapScene` com nível de teste real (15×64,
`src/levels/forestDemo.ts`), 3 camadas de parallax desenhadas por código
com paleta amostrada do tileset (`src/config/parallax.ts`), color cycling
na água (tint rotativo, ver `config/tileset.ts`). Tecla **T** alterna
entre `PlaygroundScene` (Sessão 1) e `TilemapScene` pra comparar. Coleta
de moeda/chave, porta trancada e checkpoint funcionais como bônus de teste
(não eram exigidos pelo escopo).

**Critério de saída**: os arquétipos de movimento da Sessão 1 jogados
contra geometria real, sem regressão de game feel — atendido, confirmado
em playtest manual. Parallax de 3+ camadas visível (DESIGN.md §2.2) —
atendido, visual aprovado após troca de tileset (ver Notas de sessão).
Licenças registradas em `ASSETS.md` — atendido.

---

## Sessão 2.5 — Pivot: guerreiro único (Sword of Decay)
`[x]` concluída em 2026-07-04

Escopo: abandonar o conceito de gerador por IA (schema/prompt system).
Fixar um único personagem jogável — guerreiro com espada e arco, sempre
os dois ativos, sem seleção de classe. Renomear o projeto e a pasta.

Implementado: `src/config/character.ts` (`WARRIOR` — arquétipo `heavy`,
`combat: ["sword", "projectile"]`). `CombatController` ganhou
`initialEnabled`/`toggleable=false` pra fixar as armas sem permitir
alternar em jogo de verdade (o toggle 6-8 continua existindo só no
`PlaygroundScene`, ferramenta de dev). Dano ajustado: espada 3 (5
carregada), flecha 1 (3 carregada) — flecha mais fraca mas segura à
distância, espada mais forte mas exige corpo a corpo. `SPEC.md` e
`DESIGN.md` reescritos pra remover a camada de geração por IA, mantendo
só o que ainda é real (formato do grid, arquétipos/combate como
catálogo). Projeto renomeado de "Tento" pra "Sword of Decay" (pasta,
`package.json`, `index.html`, docs).

**Critério de saída**: guerreiro jogável na fase real com as duas armas
funcionando (espada corpo a corpo, flecha à distância, ambas com
segura-e-solta) — atendido, `npx tsc --noEmit` limpo após a migração.

---

## Sessão 3 — Biblioteca de chunks + montador kishōtenketsu
`[x]` concluída em 2026-07-05

Escopo: 15-20 chunks desenhados à mão (não 60-80 — o jogo tem um número
fixo de fases, não geração em lote), taggeados por mecânica/dificuldade/
função, montador que sequencia chunks respeitando ki-shō-ten-ketsu pra
construir as fases reais do jogo.

**Critério de saída**: uma fase montada a partir de chunks tem uma torção
(`twist`) identificável jogando (DESIGN.md §1.3). Nenhum chunk usado fora
da posição compatível com sua tag de função.

---

## Sessão 4 — Validador (QA manual/semi-automático)
`[x]` concluída em 2026-07-05

Escopo: BFS de alcançabilidade, regras de chave/porta, spawn seguro
(SPEC.md §3) — rodado como checagem sobre as fases hand-built/montadas
por chunks, não pra regenerar nada (não há mais geração em lote).

**Critério de saída**: rodar o validador numa fase real do jogo aponta
corretamente se ela é alcançável ponta a ponta e se `K` sempre precede
`D` no caminho — atendido em `LEVEL_1` via `npm run validate`.

---

## Sessão 5 — Inimigos de verdade
`[x]` concluída em 2026-07-05

Escopo: spawns `1`-`5` do grid ganham comportamento real — pelo menos
`walker` (patrulha horizontal) e `shooter` (atira na direção do jogador),
com dano ao guerreiro no contato/projétil.

**Critério de saída**: uma fase com inimigos reais muda o resultado do
playtest — o jogador pode perder vida/morrer, não só decorar o cenário.
Atendido em `LEVEL_1`: spawns `1` e `2` viraram `walker` e `shooter`,
com vida do guerreiro, invulnerabilidade curta e respawn.

---

## Sessão 6 — Música e paleta final
`[ ]` reaberta em 2026-07-05 pelo pivot visual/sonoro NES → SNES/Neo Geo

Escopo original: decidir se a paleta NES de 54 cores é objetivo de
verdade; biblioteca curada de faixas CC0 por mood (DESIGN.md §3.1).
Escopo agora inclui também alinhar tileset e música ao novo alvo
SNES/Neo Geo (ver pivot acima).

**Paleta (decisão de 2026-07-04 superada em 2026-07-05)**: primeiro
decidido que não valia recolorizar pro subconjunto NES; depois o alvo
inteiro mudou pra SNES/Neo Geo (mais cor, sombreamento em gradiente) —
ver DESIGN.md §2.1. **Pendente**: tileset atual (`public/assets/tiles/forest`)
é estilo NES chapado, não bate com o novo alvo — precisa ser substituído.

**Música (implementado em 2026-07-05, precisa reavaliar pro novo alvo)**:
4 faixas CC0 de Juhani Junkala curadas por mood (`aventura`, `perigo`,
`misterio`, `final` — ver `src/config/music.ts`, ASSETS.md). `LEVEL_1`
usa mood `aventura` (`src/levels/level1.ts`), tocando em loop via
`TilemapScene`. Só a faixa do mood ativo é carregada, não a biblioteca
inteira. **Pendente**: as 4 faixas são "chiptune" de nome/textura — podem
não bater com o alvo mais rico de SNES/Neo Geo (DESIGN.md §3.1).

**Critério de saída**: tileset final do jogo com sombreamento em
gradiente (não chapado), consistente com o alvo SNES/Neo Geo (DESIGN.md
§2.1) — **pendente**, tileset ainda não trocado. Faixas de música soando
mais como trilha instrumentada de 16/32-bit do que chiptune puro
(DESIGN.md §3.1) — **pendente**, falta playtest/re-curação.

---

## Sessão 7 — UI de produto
`[ ]`

Escopo: tela de título com o nome do jogo, HUD final (vida, moedas),
tela de vitória/derrota, deploy pra alguma URL acessível fora do
localhost.

**Critério de saída**: fluxo completo título → fase → vitória/derrota
funciona sem erro em pelo menos 3 navegadores/dispositivos testados
manualmente.

---

## Notas de sessão

(Registrar aqui decisões importantes tomadas durante cada sessão — valores
de parâmetros finais escolhidos, chunks que não funcionaram, ajustes de
critério.)

**Sessão 1 (2026-07-04)**: playground em `PlaygroundScene` com os 5
arquétipos definidos em `src/config/archetypes.ts`, integrados via
`PlayerController` (coyote time, jump buffer, jump cutoff, gravidade
assimétrica). Testado no browser trocando entre os 5 com as teclas 1-5:
confirmados como distinguíveis entre si sem ajuste adicional de parâmetros.
Critério de saída atendido de primeira, sem necessidade de retuning.

**Extensão de combate (2026-07-04)**: escopo da Sessão 1 ampliado para
incluir os 3 tipos de combate de `combat` (SPEC.md, agora array — ver
DESIGN.md §1.2). Implementados `config/combat.ts`, `CombatController` e
`Dummy` (alvo normal + spiky) no playground; toggles independentes nas
teclas 6-8, ataque em X (espada) e C (tiro). Falta playtest manual pra
confirmar o critério de saída de combate antes de fechar a sessão.

**Golpes carregados (2026-07-04)**: feedback de playtest — faltava
variação de intensidade no ataque. Espada e projétil agora usam
segura-e-solta (limiar de carga em `chargeThresholdMs`), com versão
carregada mais forte e cooldown maior (ver DESIGN.md §1.2). Gauge visual
acima do jogador mostra o progresso da carga.

**Correção de tela cortada (2026-07-04)**: `main.ts` usava zoom fixo 3x
(768×720px) sem se adaptar à janela. Agora calcula o maior zoom inteiro
que cabe no viewport no load e no resize (`integerZoomForViewport`),
mantendo upscale integer sem cortar em telas menores.

**`chargedAttacks` virou campo de schema (2026-07-04)**: segura-e-solta
não é comportamento fixo do engine — é `mechanics.chargedAttacks: boolean`
em SPEC.md (default `false`), decisão por jogo que a IA faz (ver §5 e
DESIGN.md §1.2). Playground ganhou tecla 9 pra alternar o modo ao vivo e
comparar toque-simples vs. segura-e-solta no mesmo teste.

**Resolução lógica reaberta pra teste (2026-07-04)**: causa raiz do corte
de tela não era só o zoom da janela — o painel de debug tinha linhas
longas demais pra caber em 256px de largura mesmo bem escalado. Em vez de
só mover o HUD pra fora do canvas, decidiu-se reabrir a decisão
"inegociável" de CLAUDE.md sobre 256×240 pra comparar alternativas.
Adicionado `config/resolution.ts` com 3 presets (todos múltiplos de 16):
`classic` 256×240 (4:3, original), `wide` 384×224 (16:9), `square`
240×240. Tecla **R** no playground recria o jogo no próximo preset.
HUD agora usa `wordWrap` e se ajusta à resolução ativa dinamicamente.
**Resolvido em 2026-07-05**: o preset definitivo do jogo é `wide`.
`classic`/`square` continuam no código como referência/dev, mas não são
mais o fluxo normal do jogo.

Tentativa de presets `high` 512×480 e `highWide` 768×448 (dobrando
classic/wide) revertida: aumentar a resolução lógica só deixa o sprite de
16×16 relativamente menor na tela, o oposto do visual 8-bit chunky — não
é isso que "preencher monitor Full HD/4K" pede. Preencher tela grande já
é papel do zoom inteiro em `main.ts` (sem teto, escala sozinho: classic
já vira ~4x em 1920×1080 e ~9x em 3840×2160). Resolução lógica de volta a
3 presets: `classic`, `wide`, `square`. Zoom manual (+/-) adicionado por
cima do automático, pra ajuste fino independente da janela.

**Sessão 1 fechada (2026-07-04)**: movimento e combate confirmados em
playtest manual — os 5 arquétipos são distinguíveis, os 3 tipos de ataque
(stomp/projectile/sword) têm efeito diferenciado no dummy normal, stomp
não afeta o spiky, e a variante carregada (`chargedAttacks`) se sente
perceptivelmente mais forte que o toque simples.

**Sessão 2 fechada (2026-07-04)**: primeira versão usou tileset Kenney
"Pixel Platformer" redimensionado de 18x18 pra 16x16 — feedback foi que
ficou "básico e feio" (nível vazio, cores destoando, o próprio tileset).
Trocado pro OpenGameArt "Platformer Tileset 16x16" (CC0, 16x16 nativo,
cores mais vivas). Parallax deixou de usar imagem e passou a ser
desenhado por código (`TilemapScene.createParallax`) com cores amostradas
do próprio tileset, pra garantir combinação de paleta. Espinho/moeda/chave
não existem nesse pack — viraram texturas geradas por
`Graphics.generateTexture` em vez de mexer com um terceiro asset pack só
por 3 ícones pequenos. Lição: pra escolha de asset visual, vale gerar uma
comparação lado a lado (Artifact) antes de integrar, em vez de decidir
sozinho e só descobrir o feedback depois de já ter implementado.

**Sessão 3 fechada (2026-07-04, confirmada em playtest 2026-07-05)**: biblioteca
de 16 chunks em `src/levels/chunkLibrary.ts` (4 `ki`, 5 `sho`, 3 `ten`, 4
`ketsu`), tipo `Chunk` em `src/level/chunk.ts` e montador em
`src/level/chunkAssembler.ts`. Contrato de junção: todo chunk tem 15
linhas com o chão ancorado nas mesmas duas linhas de baixo (linha 12 =
piso andável, 13-14 = terreno) e a primeira/última coluna de terreno
sempre sólida — isso permite concatenar chunks lado a lado sem
descontinuidade, e nenhum chunk define `P`/`E` (o montador injeta os
dois no resultado final). `assembleLevel` valida em runtime que a
sequência de tags segue ki→shō→ten→ketsu (zero ou mais ki/shō, exatamente
um ten, exatamente um ketsu por último) — lança erro descritivo se um
chunk aparecer fora de posição, que é a aplicação em código do critério
de saída desta sessão. `src/levels/level1.ts` monta a primeira fase real
(2 ki + 3 sho + 1 ten + 1 ketsu, 100 colunas) substituindo
`forestDemo.ts` (removido — só era scaffolding da Sessão 2). O `ten`
escolhido (`ten-spike-on-platform`) torce a lição do `sho` anterior
(`sho-spike-under-platform`): a plataforma que antes era o escape seguro
do espinho embaixo agora tem um espinho dela mesma no meio.

Achado colateral: `TilemapScene` não tinha checagem de "caiu fora do
mapa" — como o corpo do jogador usa `collideWorldBounds(false)`, um gap
sem chão embaixo (mecânica central de vários chunks novos) deixava o
jogador cair pra sempre em vez de respawnar. Corrigido reaproveitando o
mesmo mecanismo de respawn dos outros hazards (`TilemapScene.updateHazards`).

Dimensionamento dos gaps/plataformas partiu dos parâmetros do arquétipo
`heavy` (`src/config/archetypes.ts`): altura máxima de pulo ~3.8 tiles,
distância horizontal máxima ~4 tiles correndo na velocidade máxima antes
de pular (zero controle aéreo). Gaps padrão em 2-3 tiles, 4 tiles só nos
chunks `sho`/`ten` mais difíceis — validado por `npx tsc --noEmit` e por
um script standalone que monta todos os chunks e a fase sem erro, e
confirmado em playtest manual: o twist de `ten-spike-on-platform` se
sente jogando e nenhum gap/altura ficou injogável pro arquétipo `heavy`
— critério de saída atendido. Em 2026-07-05 o padrão do guerreiro mudou
para `floaty`, mais permissivo que `heavy` nesses gaps; os chunks foram
mantidos e o validador passou com o novo arquétipo.

**Sessão 4 fechada (2026-07-05)**: validador em
`src/level/validator.ts` com relatório formatado e CLI em
`scripts/validateLevel.ts` (`npm run validate`). A alcançabilidade usa um
BFS heurístico sobre células pisáveis, dimensionado pelo envelope de pulo
do `WARRIOR` atual (agora `floaty`, altura máxima e alcance horizontal
derivados dos mesmos parâmetros de `PlayerController`). A regra de
chave/porta não é só ordem de coluna: o BFS roda também com a célula `D`
bloqueada, garantindo que `K` seja alcançável antes de passar pela porta.
`LEVEL_1` validado com sucesso: P→E alcançável, spawn seguro e chave
antes da porta.

**Sessão 5 fechada (2026-07-05)**: spawns de inimigo deixaram de ser
marcadores visuais. `src/config/enemies.ts` mapeia `1`/`3`/`5` para
`walker` e `2`/`4` para `shooter`; `src/entities/Enemy.ts` implementa
vida, flash de dano, respawn, patrulha em borda, tiro horizontal e
projéteis destruídos em parede. `CombatController` agora recebe alvos
genéricos (`CombatTarget`), então espada/flecha acertam tanto os dummies
do playground quanto inimigos reais. `TilemapScene` ganhou vida do
guerreiro, invulnerabilidade curta após dano e respawn por contato,
projétil, hazard ou morte. `LEVEL_1` usa `1` em `sho-gap-spike` e `2` em
`ketsu-final-combo`; `npm run validate` e `npm run build` passaram. A
checagem visual interna não rodou porque o Browser integrado não estava
disponível nesta sessão (`agent.browsers.list()` retornou vazio), mas o
servidor Vite foi iniciado para playtest manual em localhost.

**Padrões fixados (2026-07-05)**: por decisão de produto, o jogo oficial
agora usa sempre resolução lógica `wide` 384×224 e arquétipo de movimento
`floaty`. Os outros presets de resolução (`classic`/`square`) e
arquétipos (`precise`/`momentum`/`heavy`/`slippery`) continuam guardados
no código como referência e comparação de dev, mas não são mais o padrão
do jogo real.

**Lore integrado como moldura temática (2026-07-05)**: `Lore/lore.md`
(The Rot, 10 regiões, roteiro até a fase 120) foi adicionado como
documento de referência (ver CLAUDE.md, DESIGN.md §4). Decisão de escopo:
não vira backlog de 120 fases nem sessão nova pra diálogo de NPC/
degradação visual/quebra de arma — é moldura de tom e paleta emocional
sobre o número pequeno de fases hand-built que o roadmap já prevê.
Nenhuma sessão abaixo muda de escopo por causa disso.
