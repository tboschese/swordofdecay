import { TILE_SIZE } from "../config/tileset";
import { WARRIOR } from "../config/character";

const SOLID = "#";
const PLATFORM = "=";
const SPIKE = "^";
const WATER = "~";
const PLAYER_SPAWN = "P";
const GOAL = "E";
const KEY = "K";
const DOOR = "D";

interface GridCell {
  row: number;
  col: number;
}

interface JumpEnvelope {
  maxRiseTiles: number;
  maxForwardTiles: number;
}

interface ReachabilityOptions {
  blockedCells?: Set<string>;
}

export interface ValidationReport {
  reachableToGoal: boolean;
  /** null quando a fase não tem porta ("D") — a regra não se aplica. */
  keyBeforeDoor: boolean | null;
  spawnSafe: boolean;
  issues: string[];
}

/**
 * Validador de QA manual/semi-automático (ROADMAP.md Sessão 4, SPEC.md
 * §3): roda sobre uma fase real (hand-built ou montada por chunks) e
 * aponta se ela é alcançável ponta a ponta e se a chave sempre precede a
 * porta. Não substitui o playtest manual — é um heurístico rápido pra
 * pegar erro grosseiro (gap maior que o guerreiro consegue pular, chave
 * isolada) antes de chegar no browser.
 */
export function validateLevel(grid: string[]): ValidationReport {
  const issues: string[] = [];
  const spawn = findChar(grid, PLAYER_SPAWN);
  const goal = findChar(grid, GOAL);

  if (!spawn) {
    issues.push('nenhum spawn "P" encontrado no grid');
    return { reachableToGoal: false, keyBeforeDoor: null, spawnSafe: false, issues };
  }

  const spawnSafe = isSpawnSafe(grid, spawn);
  if (!spawnSafe) {
    issues.push('spawn "P" tem hazard ("^"/"~") numa célula adjacente (SPEC.md §3.3)');
  }

  const envelope = jumpEnvelope();
  const reachable = reachableFrom(grid, spawn, envelope);

  let reachableToGoal = false;
  if (!goal) {
    issues.push('nenhum objetivo "E" encontrado no grid');
  } else {
    reachableToGoal = reachable.has(cellKey(goal));
    if (!reachableToGoal) {
      issues.push(
        `"E" (linha ${goal.row}, coluna ${goal.col}) não é alcançável a partir de "P" com o alcance do arquétipo ` +
          `"${WARRIOR.archetype.id}" (${envelope.maxForwardTiles} tiles horizontal, ${envelope.maxRiseTiles} tiles de subida)`,
      );
    }
  }

  const key = findChar(grid, KEY);
  const door = findChar(grid, DOOR);
  let keyBeforeDoor: boolean | null = null;
  if (door) {
    if (!key) {
      keyBeforeDoor = false;
      issues.push('existe "D" mas nenhuma "K" no grid (SPEC.md §3.2)');
    } else {
      const reachableBeforeDoor = reachableFrom(grid, spawn, envelope, { blockedCells: new Set([cellKey(door)]) });
      const keyReachable = reachableBeforeDoor.has(cellKey(key));
      keyBeforeDoor = keyReachable;
      if (!keyReachable) {
        issues.push(
          `"K" (linha ${key.row}, coluna ${key.col}) não é alcançável a partir de "P" antes de passar por "D" ` +
            `(linha ${door.row}, coluna ${door.col}) — SPEC.md §3.2 exige chave antes da porta no caminho`,
        );
      }
    }
  }

  return { reachableToGoal, keyBeforeDoor, spawnSafe, issues };
}

export function formatReport(report: ValidationReport): string {
  const lines = [
    `alcançável P -> E: ${report.reachableToGoal ? "sim" : "NAO"}`,
    `spawn seguro: ${report.spawnSafe ? "sim" : "NAO"}`,
    `chave antes da porta: ${
      report.keyBeforeDoor === null ? "n/a (sem porta)" : report.keyBeforeDoor ? "sim" : "NAO"
    }`,
  ];
  if (report.issues.length > 0) {
    lines.push("issues:");
    for (const issue of report.issues) lines.push(`  - ${issue}`);
  }
  return lines.join("\n");
}

/**
 * Estima o alcance de pulo do arquétipo ativo a partir dos mesmos
 * parâmetros de física do `PlayerController` (mesma conta usada pra
 * dimensionar os chunks na Sessão 3, ver notas em ROADMAP.md): altura
 * máxima de subida e distância horizontal na velocidade máxima durante o
 * tempo total no ar. Não simula a parábola do pulo — é um limite de
 * alcance pro BFS, conservador o bastante pra pegar gap/altura óbvios.
 */
function jumpEnvelope(): JumpEnvelope {
  const a = WARRIOR.archetype;
  const apexHeightPx = (a.jumpForce * a.jumpForce) / (2 * a.gravityUp);
  const risingTimeSec = a.jumpForce / a.gravityUp;
  const fallingTimeSec = Math.sqrt((2 * apexHeightPx) / a.gravityDown);
  const forwardPx = a.maxSpeed * (risingTimeSec + fallingTimeSec);

  return {
    maxRiseTiles: Math.floor(apexHeightPx / TILE_SIZE),
    maxForwardTiles: Math.floor(forwardPx / TILE_SIZE),
  };
}

function charAt(grid: string[], row: number, col: number): string {
  return grid[row]?.[col] ?? ".";
}

function blocksMovement(ch: string): boolean {
  return ch === SOLID;
}

function isHazard(ch: string): boolean {
  return ch === SPIKE || ch === WATER;
}

function isSupport(ch: string): boolean {
  return ch === SOLID || ch === PLATFORM;
}

function isStandable(grid: string[], row: number, col: number, options: ReachabilityOptions = {}): boolean {
  if (options.blockedCells?.has(cellKey({ row, col }))) return false;
  const here = charAt(grid, row, col);
  if (blocksMovement(here) || isHazard(here)) return false;
  return isSupport(charAt(grid, row + 1, col));
}

function isSpawnSafe(grid: string[], spawn: GridCell): boolean {
  const neighbors: Array<[number, number]> = [
    [spawn.row - 1, spawn.col],
    [spawn.row + 1, spawn.col],
    [spawn.row, spawn.col - 1],
    [spawn.row, spawn.col + 1],
  ];
  return neighbors.every(([row, col]) => !isHazard(charAt(grid, row, col)));
}

function findChar(grid: string[], ch: string): GridCell | null {
  for (let row = 0; row < grid.length; row++) {
    const col = grid[row]!.indexOf(ch);
    if (col !== -1) return { row, col };
  }
  return null;
}

function cellKey(cell: GridCell): string {
  return `${cell.row},${cell.col}`;
}

function collectStandableCells(grid: string[], options: ReachabilityOptions = {}): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row]!.length; col++) {
      if (isStandable(grid, row, col, options)) cells.push({ row, col });
    }
  }
  return cells;
}

/** Bresenham entre duas células, checando se algo sólido/hazard bloqueia o trajeto (exclui os extremos). */
function hasClearPath(grid: string[], from: GridCell, to: GridCell, options: ReachabilityOptions = {}): boolean {
  const dCol = to.col - from.col;
  const dRow = to.row - from.row;
  const steps = Math.max(Math.abs(dCol), Math.abs(dRow));
  for (let i = 1; i < steps; i++) {
    const col = Math.round(from.col + (dCol * i) / steps);
    const row = Math.round(from.row + (dRow * i) / steps);
    if (options.blockedCells?.has(cellKey({ row, col }))) return false;
    const ch = charAt(grid, row, col);
    if (blocksMovement(ch) || isHazard(ch)) return false;
  }
  return true;
}

/**
 * BFS sobre as células "de pé" (piso ou topo de plataforma) do grid,
 * partindo do spawn. Uma célula alcança outra se a subida não excede
 * `maxRiseTiles` (descer não tem limite — é só cair), a distância
 * horizontal não excede `maxForwardTiles`, e o trajeto reto entre as
 * duas não atravessa parede sólida nem hazard.
 */
function reachableFrom(
  grid: string[],
  start: GridCell,
  envelope: JumpEnvelope,
  options: ReachabilityOptions = {},
): Set<string> {
  const cells = collectStandableCells(grid, options);
  const visited = new Set<string>([cellKey(start)]);
  const queue: GridCell[] = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of cells) {
      const key = cellKey(next);
      if (visited.has(key)) continue;

      const rise = current.row - next.row; // positivo = subindo
      const forward = Math.abs(next.col - current.col);
      if (forward > envelope.maxForwardTiles) continue;
      if (rise > envelope.maxRiseTiles) continue;
      if (!hasClearPath(grid, current, next, options)) continue;

      visited.add(key);
      queue.push(next);
    }
  }

  return visited;
}
