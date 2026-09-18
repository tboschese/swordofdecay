#!/usr/bin/env node
/**
 * Hierarquia de camadas: o plano de AÇÃO está ganhando a atenção?
 *
 *   node 3d/harness/layers.mjs 126
 *
 * Num plataforma o palco tem que ser mais legível que o cenário. Quando
 * inverte, o jogador não distingue plataforma de fundo — foi o maior gap
 * do projeto 2D e voltou aqui.
 *
 * A máscara não é chutada por banda de altura (erro cometido três vezes no
 * 2D). Renderiza-se a cena DUAS vezes, com e sem o fundo; os pixels que
 * mudam são o fundo, por construção. O renderizador é a autoridade sobre o
 * que ele desenhou.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const at = process.argv[2] ?? "126";
const tmp = mkdtempSync(join(tmpdir(), "sodlayers-"));

const CHROME = [
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
].find(existsSync);

execFileSync("node", [join(repo, "3d/pack.mjs")], { cwd: repo, stdio: "ignore" });
const page = `file://${join(repo, "3d/build/sword-of-decay-3d.html")}`;
for (const [name, hash] of [["com", `#play@${at}`], ["sem", `#play@${at}&nobg`]]) {
  execFileSync(CHROME, ["--headless", "--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader", "--window-size=1200,675", "--virtual-time-budget=7000",
    `--screenshot=${join(tmp, name + ".png")}`, page + hash], { stdio: "ignore" });
}

function dec(buf) {
  let i = 8; const idat = []; let w = 0, h = 0, ct = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i); const t = buf.toString("ascii", i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    else if (t === "IDAT") idat.push(d); else if (t === "IEND") break;
    i += 12 + len;
  }
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const st = w * nch, out = Buffer.alloc(h * st);
  let pos = 0, prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++]; const L = Buffer.from(raw.subarray(pos, pos + st)); pos += st;
    for (let x = 0; x < st; x++) {
      const a = x >= nch ? L[x - nch] : 0, b = prev[x], c = x >= nch ? prev[x - nch] : 0;
      let v = L[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      L[x] = v & 255;
    }
    L.copy(out, y * st); prev = L;
  }
  return { w, h, nch, px: out };
}

const A = dec(readFileSync(join(tmp, "com.png")));
const B = dec(readFileSync(join(tmp, "sem.png")));
const lum = (I, k) => (0.2126 * I.px[k * I.nch] + 0.7152 * I.px[k * I.nch + 1] + 0.0722 * I.px[k * I.nch + 2]) / 255;

// Fundo = mudou ao remover o backdrop. Palco = não mudou E não é céu.
const isBg = new Uint8Array(A.w * A.h);
for (let k = 0; k < A.w * A.h; k++) {
  let diff = 0;
  for (let c = 0; c < 3; c++) diff += Math.abs(A.px[k * A.nch + c] - B.px[k * B.nch + c]);
  isBg[k] = diff > 12 ? 1 : 0;
}

function stats(pred) {
  let n = 0, sum = 0; const vals = [];
  for (let k = 0; k < A.w * A.h; k++) if (pred(k)) { const v = lum(A, k); sum += v; vals.push(v); n++; }
  const mean = sum / n;
  let vs = 0; for (const v of vals) vs += (v - mean) ** 2;
  // "cortes": frequencia de mudanca de degrau na horizontal — mede o quanto
  // a camada e picotada, que e o que compete com a leitura do personagem.
  let cuts = 0, cmp = 0;
  for (let y = 0; y < A.h; y++) {
    let prev = null;
    for (let x = 0; x < A.w; x++) {
      const k = y * A.w + x;
      if (!pred(k)) { prev = null; continue; }
      const q = Math.round(lum(A, k) * 24);
      if (prev !== null) { if (q !== prev) cuts++; cmp++; }
      prev = q;
    }
  }
  return { n, mean, sd: Math.sqrt(vs / n), cut: cmp ? cuts / cmp : 0 };
}

// Ceu: pixels claros no topo que nao mudaram — nao sao palco nem fundo.
const skyish = (k) => !isBg[k] && lum(A, k) > 0.62 && Math.floor(k / A.w) < A.h * 0.45;
const bg = stats((k) => isBg[k] === 1);
const stage = stats((k) => !isBg[k] && !skyish(k));

const f3 = (v) => v.toFixed(3);
console.log(`\n=== hierarquia de camadas  (x=${at}) ===`);
console.log(`fundo   ${(bg.n / (A.w * A.h) * 100).toFixed(1).padStart(5)}% da tela   media ${f3(bg.mean)}  sd ${f3(bg.sd)}  cortes ${f3(bg.cut)}`);
console.log(`palco   ${(stage.n / (A.w * A.h) * 100).toFixed(1).padStart(5)}% da tela   media ${f3(stage.mean)}  sd ${f3(stage.sd)}  cortes ${f3(stage.cut)}`);
const ratio = stage.sd / bg.sd;
console.log(`\nrazao de contraste (palco/fundo)  ${ratio.toFixed(2)}   ${ratio >= 1.3 ? "OK" : "FALHA"}`);
console.log("O palco precisa de MAIS contraste interno que o cenario — e nele que");
console.log("o jogador le beirada e buraco. Limiar 1.3 calibrado nesta cena, nao");
console.log("validado contra jogo publicado: use como direcao entre rodadas.");
