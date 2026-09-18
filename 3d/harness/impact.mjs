#!/usr/bin/env node
/**
 * Driver do banco de ensaio do impacto.
 *
 *   node 3d/harness/impact.mjs --out 3d/harness/out/impact --shots 0,6,7,10,14,20,30,45
 *
 * Mesma arquitetura do resto do harness: esbuild → servidor estático →
 * chrome-headless-shell → PNGs. Existe porque o evento de impacto dura ~10
 * quadros e não há como pedir ao jogo que acerte um inimigo num quadro
 * conhecido.
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");

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

const outArg = arg("out", "3d/harness/out/impact");
const outDir = isAbsolute(outArg) ? outArg : resolve(repo, outArg);
const shots = arg("shots", "0,5,6,8,11,14,18,24,34,50").split(",").map(Number);
const frames = Number(arg("frames", "80"));
const width = Number(arg("width", "900"));
const height = Number(arg("height", "506"));
const enemyX = Number(arg("enemy", "24"));

const buildDir = join(here, "build");
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

execFileSync(
  "npx",
  ["esbuild", join(here, "impact_entry.ts"), "--bundle", "--format=esm", "--target=es2022",
    "--outfile=" + join(buildDir, "impact.js"), "--log-level=warning"],
  { stdio: "inherit", cwd: repo },
);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(buildDir, path);
  if (file.startsWith(buildDir) && existsSync(file) && !file.endsWith("/")) {
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(404).end("not found");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const cfg = { shots, frames, width, height, enemyX };
writeFileSync(
  join(buildDir, "impact.html"),
  `<!doctype html><meta charset="utf-8"><title>pending</title>
<style>html,body{margin:0;background:#000}</style>
<body><script>window.__SHOT_CONFIG__=${JSON.stringify(cfg)}</script>
<script type="module" src="/impact.js"></script>`,
);

const child = spawn(CHROME, [
  "--headless", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  "--virtual-time-budget=180000", "--dump-dom",
  `http://127.0.0.1:${port}/impact.html`,
], { stdio: ["ignore", "pipe", "pipe"] });
let dom = "";
child.stdout.on("data", (d) => (dom += d));
child.stderr.on("data", () => {});
await new Promise((r) => child.on("close", r));
server.close();

const title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? "";
if (!title.startsWith("OK:")) {
  console.error(`FALHOU (title="${title.slice(0, 900)}")`);
  process.exit(2);
}

const costBlock = dom.match(/<script type="text\/plain" id="cost">([\s\S]*?)<\/script>/);
if (costBlock) {
  const cost = JSON.parse(costBlock[1]);
  writeFileSync(join(outDir, "cost.json"), JSON.stringify(cost));
  const idle = cost.find((c) => c.frame === 0);
  const peak = cost.reduce((a, c) => (c.tris > a.tris ? c : a), cost[0]);
  console.log(`parado f0: ${idle.calls} draw calls / ${idle.tris} triangulos`);
  console.log(`pico  f${peak.frame}: ${peak.calls} draw calls / ${peak.tris} triangulos`);
}

const block = dom.match(/<script type="text\/plain" id="shots">([\s\S]*?)<\/script>/);
if (!block) {
  console.error("sink de capturas ausente");
  process.exit(2);
}
let n = 0;
for (const line of block[1].trim().split("\n").filter(Boolean)) {
  const sep = line.indexOf("|");
  writeFileSync(join(outDir, `f${String(line.slice(0, sep)).padStart(3, "0")}.png`), Buffer.from(line.slice(sep + 1), "base64"));
  n++;
}
console.log(`${n} capturas em ${outDir}`);
