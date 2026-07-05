import type { Chunk, ChunkFunction } from "./chunk";
import { CHUNK_LIBRARY } from "../levels/chunkLibrary";

const GRID_HEIGHT = 15;
const ENTITY_ROW = 12;
const PLAYER_SPAWN_COLUMN = 1;
const FUNCTION_ORDER: ChunkFunction[] = ["ki", "sho", "ten", "ketsu"];

export interface AssembledLevel {
  grid: string[];
  twist: string;
}

/**
 * Sequencia chunks da biblioteca respeitando a ordem ki-shō-ten-ketsu
 * (DESIGN.md §1.3/§1.4): zero ou mais `ki`, depois zero ou mais `sho`,
 * depois exatamente um `ten`, depois exatamente um `ketsu` (que precisa
 * ser o último). Concatena os grids coluna a coluna — todo chunk tem 15
 * linhas com o chão ancorado nas mesmas duas linhas de baixo (ver
 * `chunk.ts`), então a emenda nunca cria descontinuidade de altura.
 * Injeta "P" na primeira coluna útil do primeiro chunk e "E" na última
 * coluna do último — chunks da biblioteca nunca definem spawn/goal.
 */
export function assembleLevel(order: string[]): AssembledLevel {
  const chunks = order.map((id) => {
    const chunk = CHUNK_LIBRARY[id];
    if (!chunk) {
      throw new Error(`assembleLevel: chunk desconhecido "${id}"`);
    }
    if (chunk.grid.length !== GRID_HEIGHT) {
      throw new Error(`assembleLevel: chunk "${id}" tem ${chunk.grid.length} linhas, esperado ${GRID_HEIGHT}`);
    }
    return chunk;
  });

  validateSequence(chunks);

  const tenChunk = chunks.find((c) => c.fn === "ten")!;
  if (!tenChunk.twist) {
    throw new Error(`assembleLevel: chunk "ten" "${tenChunk.id}" não declara twist (DESIGN.md §1.3)`);
  }

  const grid: string[] = [];
  for (let row = 0; row < GRID_HEIGHT; row++) {
    grid.push(chunks.map((c) => c.grid[row]).join(""));
  }

  const entityRow = grid[ENTITY_ROW]!.split("");
  entityRow[PLAYER_SPAWN_COLUMN] = "P";
  entityRow[entityRow.length - 1] = "E";
  grid[ENTITY_ROW] = entityRow.join("");

  return { grid, twist: tenChunk.twist };
}

/**
 * Nenhum chunk pode aparecer fora da posição compatível com sua tag de
 * função (critério de saída da Sessão 3, ROADMAP.md) — a sequência de
 * tags precisa ser não-decrescente em ki(0) < sho(1) < ten(2) < ketsu(3),
 * com exatamente um "ten" e exatamente um "ketsu", este último por último.
 */
function validateSequence(chunks: Chunk[]): void {
  let stage = 0;
  let tenCount = 0;
  let ketsuCount = 0;

  for (const chunk of chunks) {
    const idx = FUNCTION_ORDER.indexOf(chunk.fn);
    if (idx < stage) {
      throw new Error(
        `assembleLevel: chunk "${chunk.id}" (${chunk.fn}) aparece fora de ordem — a sequência precisa seguir ki -> sho -> ten -> ketsu`,
      );
    }
    stage = idx;
    if (chunk.fn === "ten") tenCount += 1;
    if (chunk.fn === "ketsu") ketsuCount += 1;
  }

  if (tenCount !== 1) {
    throw new Error(`assembleLevel: esperado exatamente 1 chunk "ten", encontrado ${tenCount}`);
  }
  if (ketsuCount !== 1) {
    throw new Error(`assembleLevel: esperado exatamente 1 chunk "ketsu", encontrado ${ketsuCount}`);
  }
  if (chunks[chunks.length - 1]!.fn !== "ketsu") {
    throw new Error(`assembleLevel: o último chunk da sequência precisa ser "ketsu"`);
  }
}
