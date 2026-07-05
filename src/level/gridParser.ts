import { TILE_FRAMES, TILE_SIZE } from "../config/tileset";

export interface PixelPoint {
  x: number;
  y: number;
}

export interface EnemySpawn extends PixelPoint {
  index: number;
}

export interface ParsedLevel {
  widthTiles: number;
  heightTiles: number;
  /** Grid de GIDs (frame+1, 0 = vazio) pronta pro Phaser Tilemap. */
  terrain: number[][];
  playerSpawn: PixelPoint | null;
  goal: PixelPoint | null;
  checkpoint: PixelPoint | null;
  key: PixelPoint | null;
  door: PixelPoint | null;
  coins: PixelPoint[];
  spikes: PixelPoint[];
  enemySpawns: EnemySpawn[];
  /** Retângulos de hazard (spike/água) em coordenadas de pixel, pra overlap manual. */
  hazards: { x: number; y: number; width: number; height: number }[];
}

function toCenterPixel(col: number, row: number): PixelPoint {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

/**
 * Converte o grid ASCII (legenda em SPEC.md §1) numa estrutura pronta pro
 * engine: uma camada de terreno numérica (Phaser Tilemap) + listas de
 * entidades (spawns/pickups/hazards). Autotile simples: `#` vira grama no
 * topo (nada sólido acima) ou terra por dentro; `~` vira superfície ou
 * corpo d'água pela mesma regra. `^` não vira tile de terreno — é hazard
 * puro, renderizado como marcador à parte.
 */
export function parseGrid(grid: string[]): ParsedLevel {
  const heightTiles = grid.length;
  const widthTiles = Math.max(...grid.map((row) => row.length));
  const terrain: number[][] = Array.from({ length: heightTiles }, () => new Array(widthTiles).fill(0));

  const result: ParsedLevel = {
    widthTiles,
    heightTiles,
    terrain,
    playerSpawn: null,
    goal: null,
    checkpoint: null,
    key: null,
    door: null,
    coins: [],
    spikes: [],
    enemySpawns: [],
    hazards: [],
  };

  const charAt = (row: number, col: number): string => grid[row]?.[col] ?? ".";

  for (let row = 0; row < heightTiles; row++) {
    for (let col = 0; col < widthTiles; col++) {
      const ch = charAt(row, col);
      const pixel = toCenterPixel(col, row);

      switch (ch) {
        case "#": {
          const exposed = charAt(row - 1, col) !== "#";
          const frameGid = (exposed ? TILE_FRAMES.groundTop : TILE_FRAMES.groundFill) + 1;
          terrain[row]![col] = frameGid;
          break;
        }
        case "~": {
          const isSurface = charAt(row - 1, col) !== "~";
          const frameGid = (isSurface ? TILE_FRAMES.waterTop : TILE_FRAMES.waterBody) + 1;
          terrain[row]![col] = frameGid;
          result.hazards.push({ x: col * TILE_SIZE, y: row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE });
          break;
        }
        case "^": {
          // sem tile de espinho no pack atual — vira marcador renderizado à
          // parte (textura gerada por código, ver TilemapScene) mais hazard.
          result.spikes.push(pixel);
          result.hazards.push({ x: col * TILE_SIZE, y: row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE });
          break;
        }
        case "=": {
          terrain[row]![col] = TILE_FRAMES.platform + 1;
          break;
        }
        case "P":
          result.playerSpawn = pixel;
          break;
        case "E":
          result.goal = pixel;
          break;
        case "S":
          result.checkpoint = pixel;
          break;
        case "K":
          result.key = pixel;
          break;
        case "D":
          result.door = pixel;
          break;
        case "C":
          result.coins.push(pixel);
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
          result.enemySpawns.push({ ...pixel, index: Number(ch) });
          break;
        default:
          break;
      }
    }
  }

  return result;
}
