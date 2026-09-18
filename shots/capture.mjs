#!/usr/bin/env node
/**
 * Captura determinística de frames do jogo.
 *
 *   node shots/capture.mjs                    # todos os cenários
 *   node shots/capture.mjs --scene run        # um cenário
 *   node shots/capture.mjs --out out/r1       # destino
 *   node shots/capture.mjs --seed 12345
 *
 * Roda o jogo em passo fixo dentro do chrome-headless-shell, com input
 * roteirizado (shots/scenes.mjs), e grava um PNG por frame nomeado.
 * Mesma seed + mesmo cenário = PNG byte-idêntico; é isso que torna uma
 * rodada comparável com a anterior.
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { SCENES, sceneByName } from "./scenes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");

const CHROME = [
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!CHROME) {
  console.error("nenhum binário do chrome encontrado");
  process.exit(1);
}

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 ? argv[i + 1] : d;
};

const seed = Number(arg("seed", "1337"));
const only = arg("scene", "");
const outArg = arg("out", "out/latest");
const outDir = isAbsolute(outArg) ? outArg : resolve(here, outArg);

const buildDir = join(here, "build");
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

// 1. empacotar o entry (shots/ está fora do tsconfig do jogo de propósito —
//    o harness não deve poder quebrar o build do jogo)
execFileSync(
  "npx",
  [
    "esbuild",
    join(here, "capture_entry.ts"),
    "--bundle",
    "--format=esm",
    "--target=es2022",
    "--outfile=" + join(buildDir, "capture.js"),
    "--log-level=warning",
  ],
  { stdio: "inherit", cwd: repo },
);

// 2. servidor estático: "/" resolve em public/ (o jogo pede
//    /assets/tiles/... absoluto) e cai pra shots/build/ pro harness
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
};
const roots = [join(repo, "public"), buildDir];
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const root of roots) {
    const file = join(root, path);
    if (!file.startsWith(root)) continue;
    if (existsSync(file) && !file.endsWith("/")) {
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
      return;
    }
  }
  res.writeHead(404).end("not found");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

/**
 * Chrome tem que rodar ASSÍNCRONO. O servidor estático acima vive neste
 * mesmo processo, então qualquer variante síncrona (execFileSync/spawnSync)
 * trava o event loop, o servidor nunca responde ao pedido de /capture.js,
 * e o Chrome espera para sempre. Custou um smoke test travado pra achar.
 */
function runChrome(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", rejectRun);
    child.on("close", () => resolveRun(out));
    setTimeout(() => child.kill("SIGKILL"), 120000).unref();
  });
}

const scenes = only ? [sceneByName(only)] : SCENES;
let total = 0;
const t0 = Date.now();

for (const scene of scenes) {
  const cfg = { scene: scene.name, seed, shots: scene.shots, frames: scene.frames };
  writeFileSync(
    join(buildDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>pending</title>
<style>html,body{margin:0;background:#000}canvas{image-rendering:pixelated}</style>
<body><script>window.__SHOT_CONFIG__=${JSON.stringify(cfg)}</script>
<script type="module" src="/capture.js"></script>`,
  );

  const budget = Math.max(20000, scene.frames * 120);
  const dom = await runChrome([
    "--headless",
    "--disable-lcd-text",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--disable-gpu",
    `--virtual-time-budget=${budget}`,
    "--dump-dom",
    `http://127.0.0.1:${port}/index.html`,
  ]);

  const title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? "";
  if (title.startsWith("FAIL:")) {
    console.error(`\n=== ${scene.name} FALHOU ===\n${title.slice(5)}`);
    server.close();
    process.exit(2);
  }
  if (!title.startsWith("OK:")) {
    console.error(`\n=== ${scene.name}: página não terminou (title="${title}") ===`);
    console.error("provável: virtual-time-budget curto, ou erro antes do main()");
    server.close();
    process.exit(2);
  }

  const probeBlock = dom.match(/<script type="text\/plain" id="probe">([\s\S]*?)<\/script>/);
  if (probeBlock) writeFileSync(join(outDir, scene.name + "_state.json"), probeBlock[1]);

  const block = dom.match(/<script type="text\/plain" id="shots">([\s\S]*?)<\/script>/);
  if (!block) {
    console.error(`${scene.name}: sink de capturas ausente`);
    server.close();
    process.exit(2);
  }

  const lines = block[1].trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const sep = line.indexOf("|");
    const frame = line.slice(0, sep);
    const b64 = line.slice(sep + 1);
    const file = join(outDir, `${scene.name}_f${String(frame).padStart(3, "0")}.png`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    total++;
  }
  console.log(`  ${scene.name.padEnd(16)} ${lines.length} frames  ${scene.why}`);
}

server.close();
console.log(`\n${total} PNGs -> ${outDir}   seed ${seed}   ${Math.round((Date.now() - t0) / 1000)}s`);
