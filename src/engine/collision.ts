/**
 * Colisão AABB-vs-tilemap sem Phaser (substitui Arcade Physics). Resolução
 * por eixo separado (horizontal depois vertical), igual à maioria dos
 * engines de plataforma 2D: evita o corner-clipping de resolver os dois
 * eixos juntos. Suporta tile sólido (bloqueia todo lado) e one-way
 * (bloqueia só quando o corpo desce vindo de cima — mesma regra de
 * `tile.setCollision(false, false, true, false)` no TilemapScene antigo).
 */
const EPS = 0.01;

export interface AabbBody {
  /** Centro do corpo, não canto — mesma convenção de Phaser.GameObjects.Rectangle. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MoveResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export function moveAndCollide(
  body: AabbBody,
  vx: number,
  vy: number,
  dt: number,
  terrain: number[][],
  tileSize: number,
  solidGids: ReadonlySet<number>,
  oneWayGids: ReadonlySet<number>,
): MoveResult {
  const heightTiles = terrain.length;

  const gidAt = (col: number, row: number): number => {
    if (row < 0 || row >= heightTiles || col < 0) return 0;
    const rowArr = terrain[row];
    if (!rowArr || col >= rowArr.length) return 0;
    return rowArr[col] ?? 0;
  };

  const halfW = body.width / 2;
  const halfH = body.height / 2;

  let x = body.x;
  const y0 = body.y;
  let grounded = false;

  // --- horizontal: one-way nunca bloqueia de lado, só sólido ---
  let newX = x + vx * dt;
  const topProbe = y0 - halfH + EPS;
  const bottomProbe = y0 + halfH - EPS;
  const rowStart = Math.floor(topProbe / tileSize);
  const rowEnd = Math.floor(bottomProbe / tileSize);

  if (vx > 0) {
    const col = Math.floor((newX + halfW) / tileSize);
    for (let row = rowStart; row <= rowEnd; row++) {
      if (solidGids.has(gidAt(col, row))) {
        newX = col * tileSize - halfW - EPS;
        vx = 0;
        break;
      }
    }
  } else if (vx < 0) {
    const col = Math.floor((newX - halfW) / tileSize);
    for (let row = rowStart; row <= rowEnd; row++) {
      if (solidGids.has(gidAt(col, row))) {
        newX = (col + 1) * tileSize + halfW + EPS;
        vx = 0;
        break;
      }
    }
  }
  x = newX;

  // --- vertical: sólido sempre bloqueia; one-way só bloqueia caindo (vy>0)
  // e vindo de cima do topo do tile ---
  let newY = y0 + vy * dt;
  const leftProbe = x - halfW + EPS;
  const rightProbe = x + halfW - EPS;
  const colStart = Math.floor(leftProbe / tileSize);
  const colEnd = Math.floor(rightProbe / tileSize);

  if (vy > 0) {
    const prevBottom = y0 + halfH;
    const newBottom = newY + halfH;
    const row = Math.floor(newBottom / tileSize);
    for (let col = colStart; col <= colEnd; col++) {
      const gid = gidAt(col, row);
      const tileTop = row * tileSize;
      const solidHere = solidGids.has(gid);
      const oneWayHere = oneWayGids.has(gid) && prevBottom <= tileTop + EPS;
      if (solidHere || oneWayHere) {
        newY = tileTop - halfH - EPS;
        vy = 0;
        grounded = true;
        break;
      }
    }
  } else if (vy < 0) {
    const newTop = newY - halfH;
    const row = Math.floor(newTop / tileSize);
    for (let col = colStart; col <= colEnd; col++) {
      if (solidGids.has(gidAt(col, row))) {
        newY = (row + 1) * tileSize + halfH + EPS;
        vy = 0;
        break;
      }
    }
  }

  return { x, y: newY, vx, vy, grounded };
}
