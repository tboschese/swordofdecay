import type { Chunk } from "../level/chunk";

const GRID_HEIGHT = 15;

function emptyRow(width: number): string {
  return ".".repeat(width);
}

/** Concatena segmentos [tamanho, caractere] — lança erro se a soma não bater com `width`. */
function segRow(width: number, segments: Array<[number, string]>): string {
  const built = segments.map(([len, ch]) => ch.repeat(len)).join("");
  if (built.length !== width) {
    throw new Error(`chunkLibrary: segRow gerou ${built.length} colunas, esperado ${width} (${JSON.stringify(segments)})`);
  }
  return built;
}

/** Posições isoladas sobre um fundo vazio — usado pra pickups/marcadores (linha de entidades). */
function markRow(width: number, marks: Record<number, string>): string {
  const cols = new Array(width).fill(".");
  for (const [pos, ch] of Object.entries(marks)) {
    cols[Number(pos)] = ch;
  }
  return cols.join("");
}

/** Múltiplos trechos [início, tamanho, caractere] sobre um fundo vazio — usado pra plataformas. */
function spansRow(width: number, spans: Array<[number, number, string]>): string {
  const cols = new Array(width).fill(".");
  for (const [start, len, ch] of spans) {
    for (let i = start; i < start + len; i++) cols[i] = ch;
  }
  return cols.join("");
}

/**
 * Monta as 15 linhas de um chunk a partir de overrides esparsos; linhas não
 * especificadas ficam vazias. Contrato de todo chunk: linha 12 é o piso
 * andável (onde ficam pickups/marcadores), linhas 13-14 são o chão sólido
 * (ver `chunk.ts`) — a primeira e a última coluna de terreno de cada chunk
 * são sempre sólidas, nunca hazard, pra permitir concatenar chunks sem
 * criar um buraco/espinho bem na emenda.
 */
function rows(width: number, overrides: Partial<Record<number, string>>): string[] {
  const out: string[] = [];
  for (let i = 0; i < GRID_HEIGHT; i++) {
    out.push(overrides[i] ?? emptyRow(width));
  }
  return out;
}

export const CHUNK_LIBRARY: Record<string, Chunk> = {
  // ---- ki: apresenta a mecânica, contexto seguro (DESIGN.md §1.3) ----

  "ki-flat-run": {
    id: "ki-flat-run",
    fn: "ki",
    mechanics: ["flat-run"],
    difficulty: 1,
    movementVerified: true,
    grid: rows(10, {
      12: markRow(10, { 2: "C", 5: "C", 8: "C" }),
      13: segRow(10, [[10, "#"]]),
      14: segRow(10, [[10, "#"]]),
    }),
  },

  "ki-gap-basic": {
    id: "ki-gap-basic",
    fn: "ki",
    mechanics: ["gap-jump"],
    difficulty: 1,
    movementVerified: true,
    grid: rows(10, {
      12: markRow(10, { 7: "C" }),
      13: segRow(10, [[4, "#"], [2, "."], [4, "#"]]),
      14: segRow(10, [[4, "#"], [2, "."], [4, "#"]]),
    }),
  },

  "ki-platform-basic": {
    id: "ki-platform-basic",
    fn: "ki",
    mechanics: ["one-way-platform"],
    difficulty: 1,
    movementVerified: true,
    grid: rows(12, {
      9: markRow(12, { 5: "C", 6: "C" }),
      10: spansRow(12, [[4, 4, "="]]),
      12: markRow(12, { 1: "C", 9: "C" }),
      13: segRow(12, [[12, "#"]]),
      14: segRow(12, [[12, "#"]]),
    }),
  },

  "ki-spike-basic": {
    id: "ki-spike-basic",
    fn: "ki",
    mechanics: ["spike"],
    difficulty: 2,
    movementVerified: true,
    grid: rows(10, {
      12: markRow(10, { 7: "C" }),
      13: segRow(10, [[5, "#"], [1, "^"], [4, "#"]]),
      14: segRow(10, [[10, "#"]]),
    }),
  },

  // ---- sho: mesma mecânica, risco real (DESIGN.md §1.3) ----

  "sho-gap-spike": {
    id: "sho-gap-spike",
    fn: "sho",
    mechanics: ["gap-jump", "spike"],
    difficulty: 3,
    movementVerified: true,
    grid: rows(14, {
      12: markRow(14, { 6: "C", 10: "1" }),
      13: segRow(14, [[3, "#"], [2, "."], [3, "#"], [1, "^"], [2, "#"], [2, "."], [1, "#"]]),
      14: segRow(14, [[3, "#"], [2, "."], [3, "#"], [1, "#"], [2, "#"], [2, "."], [1, "#"]]),
    }),
  },

  "sho-water-crossing": {
    id: "sho-water-crossing",
    fn: "sho",
    mechanics: ["water", "one-way-platform"],
    difficulty: 2,
    movementVerified: true,
    grid: rows(14, {
      10: spansRow(14, [[4, 2, "="], [8, 2, "="]]),
      12: markRow(14, { 12: "C" }),
      13: segRow(14, [[4, "#"], [6, "~"], [4, "#"]]),
      14: segRow(14, [[4, "#"], [6, "~"], [4, "#"]]),
    }),
  },

  "sho-platform-run": {
    id: "sho-platform-run",
    fn: "sho",
    mechanics: ["one-way-platform", "gap-jump"],
    difficulty: 3,
    movementVerified: true,
    grid: rows(16, {
      10: spansRow(16, [[4, 2, "="], [7, 2, "="], [10, 2, "="]]),
      12: markRow(16, { 14: "C" }),
      13: segRow(16, [[3, "#"], [10, "."], [3, "#"]]),
      14: segRow(16, [[3, "#"], [10, "."], [3, "#"]]),
    }),
  },

  "sho-tight-gaps": {
    id: "sho-tight-gaps",
    fn: "sho",
    mechanics: ["gap-jump"],
    difficulty: 4,
    movementVerified: true,
    grid: rows(14, {
      13: segRow(14, [[2, "#"], [3, "."], [2, "#"], [3, "."], [2, "#"], [2, "#"]]),
      14: segRow(14, [[2, "#"], [3, "."], [2, "#"], [3, "."], [2, "#"], [2, "#"]]),
    }),
  },

  "sho-spike-under-platform": {
    id: "sho-spike-under-platform",
    fn: "sho",
    mechanics: ["one-way-platform", "spike"],
    difficulty: 3,
    movementVerified: true,
    grid: rows(12, {
      10: spansRow(12, [[3, 6, "="]]),
      13: segRow(12, [[3, "#"], [6, "^"], [3, "#"]]),
      14: segRow(12, [[12, "#"]]),
    }),
  },

  // ---- ten: torce — subversão de uma regra já ensinada (DESIGN.md §1.3) ----

  "ten-narrow-platform-gap": {
    id: "ten-narrow-platform-gap",
    fn: "ten",
    mechanics: ["gap-jump", "one-way-platform", "spike"],
    difficulty: 4,
    movementVerified: true,
    twist:
      "o pouso no meio do buraco largo é uma plataforma de 1 tile só, não o chão generoso do chunk anterior — e tem espinho embaixo dos dois lados, então errar por pouco ainda mata.",
    grid: rows(14, {
      10: spansRow(14, [[7, 1, "="]]),
      13: segRow(14, [[3, "#"], [8, "^"], [3, "#"]]),
      14: segRow(14, [[14, "#"]]),
    }),
  },

  "ten-spike-on-platform": {
    id: "ten-spike-on-platform",
    fn: "ten",
    mechanics: ["one-way-platform", "spike"],
    difficulty: 4,
    movementVerified: true,
    twist:
      "a mesma plataforma que servia de escape do espinho embaixo (chunk anterior) agora tem um espinho dela mesma bem no meio — atravessar sem pular por cima machuca igual.",
    grid: rows(12, {
      10: segRow(12, [[3, "."], [2, "="], [1, "^"], [3, "="], [3, "."]]),
      13: segRow(12, [[3, "#"], [6, "^"], [3, "#"]]),
      14: segRow(12, [[12, "#"]]),
    }),
  },

  "ten-water-platform-timing": {
    id: "ten-water-platform-timing",
    fn: "ten",
    mechanics: ["water", "one-way-platform"],
    difficulty: 4,
    movementVerified: true,
    twist:
      "a travessia de água que antes tinha plataformas largas de 2 tiles virou pedras isoladas de 1 tile só, com água nos dois lados o tempo inteiro — sem margem pra pouso impreciso.",
    grid: rows(14, {
      10: spansRow(14, [[4, 1, "="], [7, 1, "="], [9, 1, "="]]),
      13: segRow(14, [[3, "#"], [8, "~"], [3, "#"]]),
      14: segRow(14, [[3, "#"], [8, "~"], [3, "#"]]),
    }),
  },

  // ---- ketsu: teste final antes da saída (DESIGN.md §1.3) ----

  "ketsu-final-combo": {
    id: "ketsu-final-combo",
    fn: "ketsu",
    mechanics: ["gap-jump", "spike", "door"],
    difficulty: 5,
    movementVerified: true,
    grid: rows(16, {
      12: markRow(16, { 0: "S", 5: "C", 8: "K", 13: "D", 14: "2" }),
      13: segRow(16, [[2, "#"], [2, "."], [2, "#"], [1, "^"], [2, "#"], [3, "."], [4, "#"]]),
      14: segRow(16, [[2, "#"], [2, "."], [2, "#"], [1, "#"], [2, "#"], [3, "."], [4, "#"]]),
    }),
  },

  "ketsu-door-close": {
    id: "ketsu-door-close",
    fn: "ketsu",
    mechanics: ["door"],
    difficulty: 2,
    movementVerified: true,
    grid: rows(10, {
      12: markRow(10, { 6: "D" }),
      13: segRow(10, [[10, "#"]]),
      14: segRow(10, [[10, "#"]]),
    }),
  },

  "ketsu-goal-stretch": {
    id: "ketsu-goal-stretch",
    fn: "ketsu",
    mechanics: ["flat-run"],
    difficulty: 1,
    movementVerified: true,
    grid: rows(10, {
      12: markRow(10, { 2: "C", 5: "C", 8: "C" }),
      13: segRow(10, [[10, "#"]]),
      14: segRow(10, [[10, "#"]]),
    }),
  },

  "ketsu-platform-finale": {
    id: "ketsu-platform-finale",
    fn: "ketsu",
    mechanics: ["one-way-platform", "gap-jump"],
    difficulty: 4,
    movementVerified: true,
    grid: rows(14, {
      10: spansRow(14, [[3, 2, "="]]),
      13: segRow(14, [[3, "#"], [3, "."], [2, "#"], [3, "."], [3, "#"]]),
      14: segRow(14, [[3, "#"], [3, "."], [2, "#"], [3, "."], [3, "#"]]),
    }),
  },
};
