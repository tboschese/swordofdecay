import { validateLevel, formatReport } from "../src/level/validator";
import { LEVEL_1_GRID, LEVEL_1_TWIST } from "../src/levels/level1";

/**
 * QA manual/semi-automático (ROADMAP.md Sessão 4) — `npm run validate`.
 * Roda o validador sobre a(s) fase(s) real(is) do jogo e imprime o
 * relatório; sai com código != 0 se algo falhar, pra dar pra plugar num
 * hook/CI depois se fizer sentido.
 */
const levels: Array<{ name: string; grid: string[] }> = [{ name: `LEVEL_1 (twist: ${LEVEL_1_TWIST})`, grid: LEVEL_1_GRID }];

let failed = false;

for (const level of levels) {
  const report = validateLevel(level.grid);
  console.log(`\n${level.name}`);
  console.log(formatReport(report));
  if (!report.reachableToGoal || report.keyBeforeDoor === false || !report.spawnSafe) {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
