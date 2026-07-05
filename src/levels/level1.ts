import { assembleLevel } from "../level/chunkAssembler";
import type { Mood } from "../config/music";

/**
 * Primeira fase real montada a partir da biblioteca de chunks (Sessão 3,
 * ver ROADMAP.md). Sequência ki-shō-ten-ketsu: dois `ki` (corrida reta,
 * gap simples) e três `sho` (água+plataforma, gap+espinho, plataforma
 * sob espinho) desenvolvem as mecânicas; `ten-spike-on-platform` torce a
 * lição "plataforma = seguro" ensinada em `sho-spike-under-platform`;
 * `ketsu-final-combo` fecha com o teste combinado (gap+espinho+chave sem
 * porta funcional de verdade, ver SPEC.md §3) antes do objetivo.
 */
const ASSEMBLED = assembleLevel([
  "ki-flat-run",
  "ki-gap-basic",
  "ki-platform-basic",
  "sho-water-crossing",
  "sho-gap-spike",
  "sho-spike-under-platform",
  "ten-spike-on-platform",
  "ketsu-final-combo",
]);

export const LEVEL_1_GRID: string[] = ASSEMBLED.grid;
export const LEVEL_1_TWIST: string = ASSEMBLED.twist;

/**
 * Mood da fase (DESIGN.md §3.3, §4) — LEVEL_1 corresponde ao início da
 * Região 1 do lore (Ruína Silenciosa: "algo está errado, mas ninguém
 * entende o quê"), tom ainda de exploração, não de perigo/desespero.
 */
export const LEVEL_1_MOOD: Mood = "aventura";
