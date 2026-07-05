# CLAUDE.md

## O que é este projeto

**Sword of Decay** — jogo de plataforma 8-bit medieval. Um guerreiro com
espada e arco atravessa fases num engine Phaser 3 próprio, orientado a
dados, com estética e regras de hardware da era NES.

Histórico: o projeto começou como "Tento", um gerador de jogos de
plataforma por IA (prompt → JSON → jogo). Pivotado em 2026-07-04 pra um
jogo único e fixo — o engine (arquétipos de movimento, combate, tilemap,
parallax) foi reaproveitado; a camada de geração por IA foi descartada.

## Princípio arquitetural

O engine continua orientado a dados — não porque uma IA gera JSON em
runtime (isso foi removido), mas porque facilita ajustar game feel sem
mexer em lógica espalhada: física, combate e níveis vêm de objetos de
configuração nomeados em `src/config/*.ts`, nunca de números mágicos no
meio do código.

## O guerreiro

Único personagem jogável — sem seleção de classe. Ver `src/config/character.ts`.

| | |
|---|---|
| Arquétipo de movimento | `floaty` (queda lenta, hangtime generoso, pulo mais confortável) |
| Espada (`X`, segurar carrega) | corpo a corpo, 3 de dano (5 carregada) |
| Arco/flecha (`C`, segurar carrega) | à distância, 1 de dano (3 carregada) |

## Stack e convenções

- Vite + Phaser 3 + TypeScript strict.
- Tudo orientado a dados: física, combate e níveis vêm de presets
  nomeados (`src/config/`). Nada de números mágicos espalhados no código.
- Resolução lógica oficial: `wide` 384×224 (`src/config/resolution.ts`).
  `classic`/`square` continuam guardadas no código como referência/dev,
  mas o jogo abre sempre em `wide`; HD/Full HD/4K vêm do zoom inteiro.
- Sprites e tiles 16×16, upscale integer, pixelArt true.
- Paleta do tileset atual **não** é a paleta NES de 54 cores, e por
  decisão de produto (2026-07-05) não vai ser — ver DESIGN.md §2.1.
- Áudio: ainda não implementado (ver ROADMAP.md Sessão 6).

## Escopo atual

Fluxo jogável direto: `TilemapScene` carrega a fase com o guerreiro fixo,
sem tela de seleção. Teste local via terminal/localhost (`npm run dev`).
`PlaygroundScene` continua como ferramenta de dev pra comparar arquétipos
e tipos de combate fora do nível real — tecla **T** alterna entre as duas.
Mesmo no playground, o spawn inicial usa `floaty`; os demais arquétipos
ficam guardados nas teclas 1-5 para comparação.

## Documentos de referência

- `SPEC.md` — formato do grid ASCII de nível e convenções de tile.
- `DESIGN.md` — decisões criativas: arquétipos de movimento/combate,
  kishōtenketsu, biblioteca de chunks, sistema visual, moldura narrativa
  (ver §4). Cada seção tem um critério testável de qualidade — não é
  opcional.
- `ROADMAP.md` — ordem das sessões e critério de saída de cada uma.
- `ASSETS.md` — licenças dos assets visuais usados.
- `Lore/lore.md` — lore completo (The Rot, 10 regiões temáticas, roteiro
  fase a fase). É moldura narrativa/tom, não backlog de conteúdo — ver
  DESIGN.md §4 pra como isso se aplica ao escopo real do jogo.

## Método de trabalho

- Trabalhamos em sessões com escopo fechado e critério de saída explícito
  (ver ROADMAP.md). Não avançar para a próxima sessão sem o critério
  atendido.
- Game feel se ajusta JOGANDO, não teorizando: o usuário testa no browser
  e dá feedback em linguagem de sensação; traduza isso em parâmetros.
- Ao final de cada sessão, atualizar o status em `ROADMAP.md`.
- Qualidade estrutural sobre quantidade: uma fase com torção clara vale
  mais que três fases genéricas.
