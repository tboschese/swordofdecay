/**
 * Tileset "forest" — OpenGameArt "Platformer Tileset 16x16" (CC0, ver
 * ASSETS.md), 16x16 nativo, sem redimensionamento. Índices de frame
 * calculados como `row * COLUMNS + col` a partir da grade do spritesheet.
 * Espinho/moeda/chave não existem nesse pack — são texturas geradas por
 * código (ver TilemapScene.createMarkerTextures), não sprites do pack.
 */
export const TILESET_KEY = "forestTiles";
export const TILESET_PATH = "/assets/tiles/forest/tileset.png";
export const TILE_SIZE = 16;
export const TILESET_COLUMNS = 6;

function frame(col: number, row: number): number {
  return row * TILESET_COLUMNS + col;
}

export const TILE_FRAMES = {
  groundTop: frame(0, 0),
  groundFill: frame(0, 1),
  platform: frame(5, 9),
  waterTop: frame(3, 4),
  waterBody: frame(4, 4),
  door: frame(0, 4),
  goalFlag: frame(3, 8),
  checkpointFlag: frame(2, 8),
};

/** GIDs (frame + 1, convenção Phaser Tilemap onde 0 = vazio) que têm colisão sólida total. */
export const SOLID_GIDS = [TILE_FRAMES.groundTop + 1, TILE_FRAMES.groundFill + 1];

/** GIDs de plataforma one-way (colide só por cima). */
export const ONE_WAY_GIDS = [TILE_FRAMES.platform + 1];

/** GIDs de terreno que fazem parte do color cycling (água). */
export const WATER_GIDS = [TILE_FRAMES.waterTop + 1, TILE_FRAMES.waterBody + 1];

/** Paleta de cores cicladas na água — rotação simples ao estilo NES (DESIGN.md §2.2). */
export const WATER_CYCLE_TINTS = [0xffffff, 0xd0e8f5, 0xa8d0ea];
export const WATER_CYCLE_INTERVAL_MS = 260;
