/**
 * Nível e colisão.
 *
 * Representação é lista de BLOCOS (x, y, largura, altura), não grid ASCII.
 * O grid do jogo 2D existia porque tile de 16px é a unidade natural de
 * pixel art; em 3D ele só amarraria o desenho a uma malha que não serve
 * pra nada — e, principalmente, impediria altura livre, que é onde um
 * plataforma 3D ganha a dimensão.
 *
 * Colisão é AABB varrida por eixo (X e depois Y), que é o que dá
 * comportamento previsível em plataforma: resolver os dois eixos juntos
 * produz aqueles casos em que o personagem sobe uma parede ou trava numa
 * junta entre dois blocos alinhados.
 */
import type { Block, LevelData } from "../contracts";

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Level {
  readonly data: LevelData;
  private readonly blocks: Block[];
  /** Blocos ordenados por X, pra varredura poder cortar cedo. */
  private readonly sorted: Block[];

  constructor(data: LevelData) {
    this.data = data;
    this.blocks = data.blocks;
    this.sorted = [...data.blocks].sort((a, b) => a.x - b.x);
  }

  get width(): number {
    return Math.max(...this.blocks.map((b) => b.x + b.w));
  }

  /** Blocos que podem tocar a caixa. Filtro barato antes do teste exato. */
  private near(box: Aabb, pad: number): Block[] {
    const x0 = box.x - pad;
    const x1 = box.x + box.w + pad;
    const out: Block[] = [];
    for (const b of this.sorted) {
      if (b.x > x1) break;
      if (b.x + b.w < x0) continue;
      out.push(b);
    }
    return out;
  }

  private static overlaps(a: Aabb, b: Block): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /**
   * Move a caixa em X e devolve o quanto de fato andou. Colisão em X não
   * gera "chão", só parede.
   */
  moveX(box: Aabb, dx: number): { x: number; hit: boolean } {
    let x = box.x + dx;
    let hit = false;
    const probe: Aabb = { ...box, x };
    for (const b of this.near(probe, Math.abs(dx) + 1)) {
      if (!Level.overlaps(probe, b)) continue;
      hit = true;
      x = dx > 0 ? b.x - box.w : b.x + b.w;
      probe.x = x;
    }
    return { x, hit };
  }

  /**
   * Move a caixa em Y. Devolve se pousou no chão (`grounded`) ou bateu a
   * cabeça — os dois eventos são diferentes e o chamador precisa dos dois:
   * bater a cabeça tem que zerar a velocidade de subida, senão o
   * personagem "gruda" no teto até a gravidade vencer.
   */
  moveY(box: Aabb, dy: number): { y: number; grounded: boolean; ceiling: boolean } {
    let y = box.y + dy;
    let grounded = false;
    let ceiling = false;
    const probe: Aabb = { ...box, y };
    for (const b of this.near(probe, 1)) {
      if (!Level.overlaps(probe, b)) continue;
      if (dy < 0) {
        y = b.y + b.h;
        grounded = true;
      } else {
        y = b.y - box.h;
        ceiling = true;
      }
      probe.y = y;
    }
    return { y, grounded, ceiling };
  }

  /** Há chão logo abaixo? Usado pro coyote time e pra sombra de contato. */
  groundBelow(x: number, y: number, maxDepth = 40): number | null {
    let best: number | null = null;
    for (const b of this.sorted) {
      if (b.x > x || b.x + b.w < x) continue;
      const top = b.y + b.h;
      if (top <= y + 0.001 && (best === null || top > best) && y - top < maxDepth) best = top;
    }
    return best;
  }

  touchesHazard(box: Aabb): boolean {
    for (const h of this.data.hazards) {
      if (box.x < h.x + h.w && box.x + box.w > h.x && box.y < h.y + h.h && box.y + box.h > h.y) return true;
    }
    return false;
  }
}
