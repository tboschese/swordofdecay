# ASSETS.md — Licenças de assets visuais e sonoros

Registro obrigatório por DESIGN.md §2.3 ("curadoria > geração no MVP") e
critério de saída da Sessão 2 (ROADMAP.md). A partir da Sessão 6 também
cobre a biblioteca de música (DESIGN.md §3.1).

---

## Tileset "forest" — OpenGameArt "Platformer Tileset 16x16"

- **Fonte**: https://opengameart.org/content/platformer-tileset-16x16
- **Licença**: CC0 1.0 Universal (domínio público — uso livre, comercial
  incluído, atribuição não obrigatória)
- **Arquivo original**: `PlatformerTileset.png` (96×176px, grid 16×16
  nativo, 6 colunas × 11 linhas) — usado sem redimensionar.
- **Local no projeto**: `public/assets/tiles/forest/tileset.png`
- **Tiles usados** (índice = `row * 6 + col`, ver `src/config/tileset.ts`):
  chão com grama (col0,row0), chão de terra (col0,row1), plataforma
  one-way (col5,row9), água superfície/corpo (col3-4,row4), porta
  (col0,row4, bloco roxo usado como marcador de porta trancada), bandeira
  de saída (col3,row8) e de checkpoint (col2,row8).
- **Trocado em 2026-07-04**: versão anterior usava Kenney "Pixel
  Platformer" (também CC0) — trocado por feedback de que o resultado
  visual estava "básico" demais; este pack tem cores mais vivas e
  contrastantes, mais parecido com o visual clássico de plataforma 8-bit.

## Espinho, moeda e chave — geradas por código, não são asset

O pack acima não inclui esses ícones. Em vez de misturar outro pack de
terceiros só por 3 ícones pequenos, `TilemapScene.createMarkerTextures()`
desenha as 3 texturas via `Phaser.GameObjects.Graphics` (16×16, formas
geométricas simples). Nenhuma licença aplicável — é código do projeto.

## Parallax "forest" — desenhado por código, não é asset

3 camadas (céu sólido, colinas em zigue-zague, silhueta de árvores) são
desenhadas via `Phaser.GameObjects.Graphics`/`Rectangle` em
`TilemapScene.createParallax()`, com cores derivadas por amostragem direta
da paleta do tileset acima (`src/config/parallax.ts`) — garante que as
cores do fundo combinem com o terreno em vez de depender de outro asset
pack. Nenhuma licença aplicável.

---

## Música por mood — Juhani Junkala (OpenGameArt, CC0)

Todas as 4 faixas são de Juhani Junkala (subspaceaudio), autor com múltiplos
packs de chiptune CC0 no OpenGameArt, cada um com `INFO.txt` reafirmando
"released under CC0 creative commons license. You can do anything you want
with these tunes." Registro por faixa (ver `src/config/music.ts`,
`Mood`):

| Mood | Faixa | Pack de origem | Arquivo local |
|---|---|---|---|
| `aventura` | "Stage 1" | [Chiptune Adventures](https://opengameart.org/content/4-chiptunes-adventure) | `public/assets/audio/music/aventura.ogg` |
| `perigo` | "Boss Fight" | [Chiptune Adventures](https://opengameart.org/content/4-chiptunes-adventure) | `public/assets/audio/music/perigo.ogg` |
| `misterio` | "Post Apocalyptic Wastelands" | [Horror Atmosphere](https://opengameart.org/content/horror-atmosphere) | `public/assets/audio/music/misterio.ogg` |
| `final` | "Ending" | [Retro Game Music Pack / 5 Chiptunes Action](https://opengameart.org/content/5-chiptunes-action) | `public/assets/audio/music/final.m4a` (convertido de WAV pra AAC via `afconvert`, só pra reduzir tamanho — sem mudar o áudio) |

**Licença**: CC0 1.0 Universal em todos os 4 casos (domínio público).

**Pendência de verificação, atualizada em 2026-07-05** (DESIGN.md §3.1):
o alvo de hardware mudou de NES pra SNES/Neo Geo depois dessas 4 faixas
terem sido escolhidas. Elas são explicitamente "chiptune" (nome do pack:
"Chiptune Adventures") — prováveis candidatas a re-curação, já que o novo
alvo pede som mais rico/instrumentado, não onda quadrada pura. Fica
pendente de confirmação por ouvido durante playtest (mesmo método de
"game feel se ajusta jogando" do CLAUDE.md); se não servir, a biblioteca
de música precisa ser refeita com faixas de estilo 16/32-bit.

Só a faixa da fase ativa é carregada em runtime (`TilemapScene.preload`),
não a biblioteca inteira — evita carregar ~20MB de áudio de uma vez só
pra uma fase que usa 1 mood.

---

## Pendências

- Nenhum asset de personagem/inimigo usado ainda: guerreiro e inimigos
  são retângulos coloridos gerados por código (`PlayerController`,
  `Enemy`). Nenhuma licença aplicável.
- **Tileset "forest" não bate mais com o alvo visual** (decisão de
  2026-07-05, DESIGN.md §2.1): o alvo mudou de NES pra SNES/Neo Geo
  ("32-bit mas 2D", paletas ricas, sombreamento em gradiente). O pack
  atual é estilo NES chapado — precisa ser substituído por um tileset CC0
  com mais profundidade de cor antes de fechar a barra de qualidade
  visual. Ainda não substituído.
