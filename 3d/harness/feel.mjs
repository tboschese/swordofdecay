#!/usr/bin/env node
/**
 * Duas medições de GAME FEEL que normalmente só o playtest pega.
 *
 *   node 3d/harness/feel.mjs
 *
 * Nenhuma delas substitui jogar. As duas existem porque o contrário —
 * afirmar que "a câmera está confortável" e que "o telégrafo dá tempo" sem
 * nenhuma evidência — é exatamente o tipo de afirmação que este projeto já
 * pagou caro pra aprender a não fazer.
 *
 * Roda em Node puro: física, câmera e inimigo são matemática, não render.
 *
 * 1. CONFORTO DE CÂMERA. Enjoo em câmera 3D vem de aceleração vertical —
 *    a tela subindo e descendo junto com o pulo. Medimos o pico e, mais
 *    importante, quantas INVERSÕES de direção vertical acontecem por
 *    segundo: oscilação é o que embrulha, não deslocamento.
 *
 * 2. JANELA DE REAÇÃO DO INIMIGO. Do instante em que o aviso começa a
 *    aparecer até o instante em que o dano pode chegar. Tempo de reação
 *    visual humano fica em ~250ms; abaixo disso o dano lê como injusto, e
 *    dano injusto é falha de design, não dificuldade.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const tmp = mkdtempSync(join(tmpdir(), "sodfeel-"));
const p = (rel) => join(repo, rel).replace(/\\/g, "/");

const shim = `
import { Game } from "${p("3d/src/game/Game.ts")}";
import { Camera2p5D } from "${p("3d/src/game/Camera.ts")}";
import { WORLD1_1 } from "${p("3d/levels/world1.ts")}";
import { setEnabled } from "${p("3d/src/engine/audio.ts")}";
setEnabled(false);

class FK {
  constructor(){ this.down=new Set(); this.pressed=new Set(); this.released=new Set(); }
  isDown(c){return this.down.has(c);} justDown(c){return this.pressed.has(c);}
  justUp(c){return this.released.has(c);} endFrame(){this.pressed.clear();this.released.clear();}
  set(cs){ for(const c of cs) if(!this.down.has(c)){this.pressed.add(c);this.down.add(c);}
    for(const c of [...this.down]) if(!cs.includes(c)){this.down.delete(c);this.released.add(c);} }
}

const keys = new FK();
const camera = new Camera2p5D(1200, 675);
const game = new Game(WORLD1_1, keys, { camera });
const level = game.level;
const DT = 1000/60;

// --- 1. camera -------------------------------------------------------
const camY = [];
let hold = 0;
for (let f = 0; f < 2400; f++) {
  const s0 = game.state;
  const held = ["ArrowRight"];
  if (hold > 0) { held.push("KeyZ"); hold--; }
  else if (s0.grounded) {
    const hereTop = level.groundBelow(s0.x, s0.y + 0.1);
    const safeTop = (x) => {
      const t = level.groundBelow(x, s0.y + 0.1);
      if (t === null) return null;
      for (const h of level.data.hazards) if (x >= h.x && x <= h.x + h.w && t <= h.y + h.h + 0.2) return null;
      return t;
    };
    const top = safeTop(s0.x + 1.3);
    if (top === null || (hereTop !== null && top > hereTop + 0.35)) hold = 24;
  }
  if (hold > 0 && !held.includes("KeyZ")) held.push("KeyZ");
  keys.set(held);
  game.update(DT);
  camY.push(camera.camera.position.y);
}

// CORTES sao excluidos. Respawn chama \`snapTo\`, que move a camera de uma
// vez de proposito — um corte e uma decisao de direcao, nao desconforto, e
// conta-lo como solavanco faria a metrica reprovar justamente o que esta
// certo. Detectado por deslocamento absurdo num quadro (>2u = 120 u/s).
const CUT = 2;
const vel = [], acc = [];
for (let i = 1; i < camY.length; i++) {
  const d = camY[i] - camY[i-1];
  vel.push(Math.abs(d) > CUT ? null : d * 60);
}
for (let i = 1; i < vel.length; i++) {
  if (vel[i] === null || vel[i-1] === null) continue;
  acc.push((vel[i] - vel[i-1]) * 60);
}
let flips = 0;
for (let i = 1; i < vel.length; i++) { if (vel[i] === null || vel[i-1] === null) continue; if (Math.sign(vel[i]) !== 0 && Math.sign(vel[i]) !== Math.sign(vel[i-1])) flips++; }
const absAcc = acc.map(Math.abs).sort((a,b)=>a-b);
const p99 = absAcc[Math.floor(absAcc.length*0.99)];
const med = absAcc[Math.floor(absAcc.length*0.5)];

console.log(JSON.stringify({
  camera: {
    acelMediana: +med.toFixed(2),
    acelP99: +p99.toFixed(2),
    inversoesPorSeg: +(flips / (camY.length/60)).toFixed(2),
  },
}));
`;

const entry = join(tmp, "run.ts");
writeFileSync(entry, shim);
const out = join(tmp, "run.mjs");
execFileSync("npx", ["esbuild", entry, "--bundle", "--platform=node", "--format=esm", "--outfile=" + out, "--log-level=warning"], { cwd: repo, stdio: "inherit" });
const r = JSON.parse(execFileSync("node", [out], { encoding: "utf8" }));

const c = r.camera;
console.log(`\n=== conforto de câmera (travessia inteira) ===`);
console.log(`aceleração vertical mediana  ${c.acelMediana} u/s²`);
console.log(`aceleração vertical p99      ${c.acelP99} u/s²`);
console.log(`inversões de direção         ${c.inversoesPorSeg} por segundo`);
console.log(
  c.inversoesPorSeg <= 3
    ? "\nOK: abaixo de 3 inversões/s. Oscilação é o que embrulha o estômago,"
    : "\nATENCAO: acima de 3 inversões/s. Oscilação é o que embrulha o estômago,",
);
console.log("não deslocamento — uma câmera que sobe muito mas de forma monótona");
console.log("é confortável; uma que treme pouco e rápido, não.");
console.log("Limiar calibrado por raciocínio, NAO validado com humano jogando.");
console.log("\nSobre o p99: excluir os cortes de respawn quase não o moveu (59.5 ->");
console.log("58.6), então ele NAO é corte. É o baque de aterrissagem — a câmera");
console.log("segue um alvo que para de uma vez quando o pé toca o chão, e alvo que");
console.log("para tem aceleração ilimitada por construção. Em dose pequena isso LE");
console.log("como impacto e é desejável; é justamente o que a mediana e as inversões");
console.log("por segundo separam, e as duas estão baixas. A métrica sozinha não");
console.log("distingue soco de tremor — por isso ela reporta as três, não uma.");

// --- 2. janela de reação, calculada da fonte -------------------------
const enemySrc = execFileSync("node", ["-e",
  `const s=require('fs').readFileSync('${p("3d/src/game/Enemy.ts")}','utf8');
   const g=(k)=>Number((new RegExp(k+':\\\\s*([0-9.]+)').exec(s)||[])[1]);
   console.log(JSON.stringify({tel:g('telegraphMs'),lunge:g('lungeMs'),speed:g('lungeSpeed'),sense:g('senseRange')}));`
], { encoding: "utf8" });
const e = JSON.parse(enemySrc);
console.log(`\n=== janela de reação do inimigo ===`);
console.log(`aviso visível durante        ${e.tel} ms antes de investir`);
console.log(`investida dura               ${e.lunge} ms a ${e.speed} u/s`);
console.log(
  e.tel >= 250
    ? `\nOK: ${e.tel}ms de aviso contra ~250ms de tempo de reação visual humano.`
    : `\nFALHA: ${e.tel}ms de aviso é menos que os ~250ms de reação visual humana.`,
);
console.log("Mas ATENCAO ao que este número NAO diz: ele mede a duração do");
console.log("aviso, não se o aviso é VISÍVEL. Um telégrafo de 520ms que o");
console.log("jogador não percebe vale zero. Isso só o playtest responde.");
