export type ChunkFunction = "ki" | "sho" | "ten" | "ketsu";

/**
 * Bloco de fase desenhado à mão (DESIGN.md §1.4). Larguras de 8-16 colunas,
 * sempre 15 linhas (SPEC.md §1) com o chão ancorado nas mesmas duas linhas
 * de baixo (linha 13 = piso andável, linha 14 = preenchimento) — é esse
 * contrato de altura fixa que permite ao montador (`chunkAssembler.ts`)
 * concatenar chunks lado a lado sem descontinuidade. Nunca contém "P"/"E":
 * quem injeta spawn/goal é o montador, no nível já remontado.
 */
export interface Chunk {
  id: string;
  fn: ChunkFunction;
  /** Tags livres de mecânica exigida, ex.: "gap-jump", "one-way-platform", "spike". */
  mechanics: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * Checklist manual de que o chunk foi desenhado/testado contra os limites
   * de pulo do arquétipo oficial do guerreiro (DESIGN.md §1.4) — `floaty`
   * hoje, ver `config/character.ts`. Sempre `true`: um chunk que ainda
   * não passou por essa checagem não entra na biblioteca.
   */
  movementVerified: true;
  /** 15 linhas, 8-16 colunas, legenda de SPEC.md §1 (sem "P"/"E"). */
  grid: string[];
  /** Obrigatório em chunks "ten" — a torção em uma frase (DESIGN.md §1.3). */
  twist?: string;
}
