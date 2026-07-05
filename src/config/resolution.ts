export type ResolutionId = "classic" | "wide" | "square";

export interface ResolutionPreset {
  id: ResolutionId;
  label: string;
  width: number;
  height: number;
}

/**
 * Presets de resolução lógica mantidos como catálogo/dev reference. O jogo
 * principal usa `DEFAULT_RESOLUTION_ID` (`wide`) sempre; HD/Full HD/4K são
 * atingidos por zoom inteiro sobre essa resolução lógica, preservando o
 * pixel art chunky.
 */
export const RESOLUTIONS: Record<ResolutionId, ResolutionPreset> = {
  classic: { id: "classic", label: "CLASSIC 256x240 (4:3, legado)", width: 256, height: 240 },
  wide: { id: "wide", label: "WIDE 384x224 (16:9, padrao)", width: 384, height: 224 },
  square: { id: "square", label: "SQUARE 240x240 (1:1)", width: 240, height: 240 },
};

// Preencher monitores grandes (Full HD, 4K) é papel do zoom inteiro em
// main.ts (integerZoomForViewport), não da resolução lógica — subir a
// resolução lógica faz o sprite de 16x16 ficar relativamente menor na
// tela, o oposto do visual 8-bit chunky que o projeto quer. Um preset
// "high"/"highWide" que dobrava classic/wide pra esse fim foi removido
// (ver ROADMAP.md, Notas de sessão).
export const DEFAULT_RESOLUTION_ID: ResolutionId = "wide";
export const RESOLUTION_ORDER: ResolutionId[] = ["classic", "wide", "square"];
