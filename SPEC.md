# SPEC.md — Formato de nível

Histórico: este documento definia o contrato JSON entre um gerador por
IA e o engine (schema Zod completo — `meta`/`physics`/`mechanics`/
`levels`/`boss`, com tema/paleta/arquétipo variando por prompt). Esse
gerador foi descartado no pivot pra "Sword of Decay" (jogo único,
guerreiro fixo — ver CLAUDE.md). O que sobra e continua valendo é só o
formato do grid ASCII, que `src/level/gridParser.ts` consome pra montar
os níveis reais do jogo.

---

## 1. Grid ASCII

Cada fase é um array de strings, uma por linha. Cada caractere = 1 tile
de 16×16. Legenda fixa:

| Char | Significado |
|---|---|
| `.` | vazio |
| `#` | bloco sólido |
| `=` | plataforma one-way (colide só por cima) |
| `^` | espinho (hazard — respawn no contato) |
| `~` | água (hazard — respawn no contato) |
| `P` | spawn do jogador |
| `E` | saída/goal |
| `C` | moeda |
| `K` | chave |
| `D` | porta trancada (bloqueia até coletar `K`) |
| `S` | checkpoint |
| `1`-`5` | spawn de inimigo (índice mapeado em `config/enemies.ts`) |

Dimensão de produção: 15 linhas × 64-128 colunas (a fase atual,
`src/levels/level1.ts`, usa 15×100).

## 2. Autotile

`gridParser.ts` decide a variante visual de `#`/`~` olhando a célula
acima na mesma coluna: exposta (nada sólido/água acima) vira topo
(grama/superfície da água), senão vira preenchimento (terra/corpo
d'água). `^` não tem tile de terreno — é hazard puro, renderizado como
marcador à parte (`TilemapScene.createMarkerTextures`), já que o tileset
atual não tem sprite de espinho (ver ASSETS.md).

## 3. Regras de nível

O validador automático (`npm run validate`) checa alcançabilidade,
spawn seguro e chave antes da porta sobre as fases reais montadas por
chunks. Ele não substitui playtest manual, mas pega erro grosseiro antes
de abrir o browser.

1. **Alcançabilidade**: todo `P` tem caminho até `E` dado o arquétipo
   `floaty` do guerreiro (ver DESIGN.md §1.1 pros limites de pulo/queda).
2. **Chave antes da porta**: se existe `D`, deve existir `K` alcançável
   sem passar por `D`. O validador roda o BFS também com a célula `D`
   bloqueada para conferir essa regra.
3. **Spawn seguro**: nenhuma célula adjacente a `P` pode ser `^` ou `~`.
4. **Torção obrigatória**: toda fase declara um `twist` (frase curta, em
   comentário/nota da fase) — ver DESIGN.md §1.3, kishōtenketsu.
5. **Spawns de inimigo (`1`-`5`)**: viram entidades reais. Hoje `1`/`3`/`5`
   usam `walker` (patrulha horizontal, dano no contato) e `2`/`4` usam
   `shooter` (projétil horizontal quando o jogador entra em alcance).

---

## 4. Restrições de hardware (aplicadas pelo engine)

- Resolução lógica 384×224 (`wide`, `src/config/resolution.ts`),
  upscale integer para caber em HD/Full HD/4K sem mudar o tamanho lógico.
- Sprites e tiles 16×16.
- Paleta: ainda não travada nas 54 cores do NES — pendência registrada em
  DESIGN.md §2.1.
