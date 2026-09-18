#!/usr/bin/env node
/**
 * Smoke test de JOGABILIDADE, em Node puro.
 *
 *   node 3d/harness/traverse.mjs
 *
 * Roda a física real contra o nível real, sem browser e sem WebGL, porque
 * `game/Player.ts` e `game/Level.ts` não dependem de render. Custa ~50ms,
 * então dá pra rodar a cada mudança — e a lição que veio do projeto 2D é
 * que o teste que não se roda é o teste que não existe.
 *
 * Responde uma pergunta só, e é a que mais importa antes de qualquer
 * arte: **a fase é atravessável?**
 *
 * O "jogador" aqui é burro de propósito: corre pra direita e martela o
 * pulo. Se a fase exige leitura, ele não passa — e aí o número diz onde
 * ele empacou, que é informação de design, não falha do teste.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const tmp = mkdtempSync(join(tmpdir(), "sod3d-"));

// Teclado falso: implementa a mesma interface que o jogo consome.
const shim = `
import { Game } from "${join(repo, "3d/src/game/Game.ts").replace(/\\/g, "/")}";
import { WORLD1_1 } from "${join(repo, "3d/levels/world1.ts").replace(/\\/g, "/")}";
import { setEnabled as setAudioEnabled } from "${join(repo, "3d/src/engine/audio.ts").replace(/\\/g, "/")}";

// Sem audio no teste: nao ha AudioContext em Node, e som nao muda fisica.
setAudioEnabled(false);

class FakeKeys {
  constructor() { this.down = new Set(); this.pressed = new Set(); this.released = new Set(); }
  isDown(c) { return this.down.has(c); }
  justDown(c) { return this.pressed.has(c); }
  justUp(c) { return this.released.has(c); }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  set(codes) {
    for (const c of codes) if (!this.down.has(c)) { this.pressed.add(c); this.down.add(c); }
    for (const c of [...this.down]) if (!codes.includes(c)) { this.down.delete(c); this.released.add(c); }
  }
}

const keys = new FakeKeys();
const game = new Game(WORLD1_1, keys);
const DT = 1000 / 60;
const FRAMES = 3000;

let maxX = -Infinity;
const trail = [];

/**
 * AUTOPILOTO com olhos.
 *
 * A primeira versao pulava em periodo fixo e morria 7 vezes nos telhados:
 * pulo periodico nao acerta vao, entao o teste media sorte e nao se a fase
 * e atravessavel. Um bot que nao sabe QUANDO pular nao responde a pergunta.
 *
 * Agora ele consulta o proprio nivel — olha o chao alguns metros a frente e
 * pula quando ha buraco ou degrau. E o minimo pra que "nao chegou" queira
 * dizer "a fase esta impossivel" em vez de "o bot e cego".
 */
const level = game.level;
let holdJump = 0;

for (let f = 0; f < FRAMES; f++) {
  const s0 = game.state;
  const held = ["ArrowRight"];
  // Golpeia sem parar: o bot nao le inimigo, entao martela o X. Mede se a
  // fase e atravessavel, nao se o combate e bom.
  if (f % 14 < 3) held.push("KeyX");

  if (holdJump > 0) {
    held.push("KeyZ");
    holdJump--;
  } else if (s0.grounded) {
    const hereTop = level.groundBelow(s0.x, s0.y + 0.1);
    // Olha em duas distancias: perto pega degrau, longe pega buraco.
    // UMA distancia curta, nao varias longas. Olhando 4.6u a frente o bot
    // saltava a 39.4 pra um vao que comeca em 44 e aterrissava dentro dele:
    // o alcance e 6.7u, entao pular cedo GASTA o alcance antes da beirada.
    // Plataforma se pula perto da borda, e o bot tambem.
    // Chao dentro de zona de perigo NAO conta como chao.
    // Sem isto o bot descia do telhado direto na poca do Rot, porque pra
    // ele "tem chao ali embaixo" era verdade. Ele morria na TORCAO da fase
    // — o trecho em que a licao "chao = seguro" se inverte — o que prova
    // que a torcao funciona, mas fazia o teste medir leitura de perigo em
    // vez de geometria. Sao duas perguntas diferentes e so uma e desta
    // ferramenta.
    const safeTop = (x) => {
      const t = level.groundBelow(x, s0.y + 0.1);
      if (t === null) return null;
      for (const h of level.data.hazards) {
        if (x >= h.x && x <= h.x + h.w && t <= h.y + h.h + 0.2) return null;
      }
      return t;
    };
    const ahead = 1.3;
    const top = safeTop(s0.x + ahead);
    const need = top === null || (hereTop !== null && top > hereTop + 0.35);
    // 24 quadros = 400ms, e o apice leva 365ms. Esse numero foi errado
    // DUAS vezes: com 5 quadros (83ms) e depois com 13 (217ms), e nas duas
    // o corte de altura variavel disparava antes do apice e encurtava o
    // pulo em silencio. Na segunda, o guerreiro batia na LATERAL do
    // telhado a 13cm do topo e o teste reprovava a fase por um bug do bot.
    // Segurar alem do apice e o que faz o bot medir o pulo inteiro.
    if (need) holdJump = 24;
  }

  if (holdJump > 0) held.push("KeyZ");
  keys.set(held);
  game.update(DT);
  const s = game.state;
  if (s.x > maxX) maxX = s.x;
  if (f % 60 === 0) trail.push({ f, x: +s.x.toFixed(1), y: +s.y.toFixed(1), mortes: s.deaths });
  if (s.reachedGoal) { console.log(JSON.stringify({ chegou: true, frame: f, maxX: +maxX.toFixed(1), mortes: s.deaths, trail })); process.exit(0); }
}
const s = game.state;
console.log(JSON.stringify({ chegou: false, maxX: +maxX.toFixed(1), objetivo: WORLD1_1.goal.x, mortes: s.deaths, trail }));
`;

const entry = join(tmp, "run.ts");
writeFileSync(entry, shim);
const out = join(tmp, "run.mjs");
execFileSync("npx", ["esbuild", entry, "--bundle", "--platform=node", "--format=esm", "--outfile=" + out, "--log-level=warning"], {
  cwd: repo,
  stdio: "inherit",
});
const raw = execFileSync("node", [out], { encoding: "utf8" });
const r = JSON.parse(raw);

console.log(`\n=== travessia: ${WORLD1_1_title(r)} ===`);
console.log(`alcance ${r.maxX} de ${r.objetivo ?? "objetivo"}   mortes ${r.mortes}`);
console.log("\n  frame     x      y   mortes");
for (const t of r.trail) {
  console.log(`  ${String(t.f).padStart(5)}  ${String(t.x).padStart(5)}  ${String(t.y).padStart(5)}  ${String(t.mortes).padStart(4)}`);
}
if (!r.chegou) {
  console.log(`\nNAO chegou ao objetivo. Empacou perto de x=${r.maxX}.`);
  console.log("Isso pode ser design (o trecho exige leitura, e o bot nao le)");
  console.log("ou pode ser vao impossivel. Olhe o mapa naquele x antes de concluir.");
  process.exitCode = 1;
}

function WORLD1_1_title(r) {
  return r.chegou ? "CHEGOU" : "empacou";
}
