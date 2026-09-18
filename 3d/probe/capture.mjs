#!/usr/bin/env node
/**
 * Driver da sonda de determinismo (Fase 0 do PUSH_PROMPT.md).
 *
 *   node 3d/probe/capture.mjs --out 3d/probe/out/a
 *   node 3d/probe/capture.mjs --out 3d/probe/out/b --gl swiftshader
 *
 * Mesma arquitetura do harness 2D (`shots/capture.mjs`): esbuild →
 * servidor estático → chrome-headless-shell → PNGs. A diferença é que aqui
 * o backend gráfico É a variável em teste, então ele é parâmetro.
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

const seed = Number(arg("seed", "1337"));
const gl = arg("gl", "swiftshader");
const outArg = arg("out", "out/a");
// Resolvido contra a RAIZ do repo, não contra este diretório: passar
// `--out 3d/probe/out/a` de dentro do repo produzia `3d/probe/3d/probe/...`.
const outDir = isAbsolute(outArg) ? outArg : resolve(repo, outArg);
const buildDir = join(here, "build");
mkdirSync(buildDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

execFileSync(
  "npx",
  [
    "esbuild",
    join(here, "entry.ts"),
    "--bundle",
    "--format=esm",
    "--target=es2022",
    "--outfile=" + join(buildDir, "probe.js"),
    "--log-level=warning",
  ],
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

const cfg = { seed, shots: [0, 45, 90], frames: 120, width: 640, height: 360 };
writeFileSync(
  join(buildDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>pending</title>
<style>html,body{margin:0;background:#000}</style>
<body><script>window.__SHOT_CONFIG__=${JSON.stringify(cfg)}</script>
<script type="module" src="/probe.js"></script>`,
);

// Backends possíveis. `swiftshader` é rasterização por SOFTWARE: é a
// aposta mais forte pra determinismo, porque tira GPU e driver da conta.
// `angle` usa a GPU real via Metal nesta máquina.
const GL_FLAGS = {
  swiftshader: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  angle: ["--use-gl=angle", "--use-angle=metal"],
  default: [],
};

function runChrome(args) {
  return new Promise((res, rej) => {
    const child = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", rej);
    child.on("close", () => res({ out, err }));
    setTimeout(() => child.kill("SIGKILL"), 180000).unref();
  });
}

const { out: dom } = await runChrome([
  "--headless",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  ...(GL_FLAGS[gl] ?? GL_FLAGS.default),
  "--virtual-time-budget=60000",
  "--dump-dom",
  `http://127.0.0.1:${port}/index.html`,
]);
server.close();

const title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? "";
if (!title.startsWith("OK:")) {
  console.error(`FALHOU (title="${title}")`);
  console.error("provável: WebGL indisponível no headless com estes flags");
  process.exit(2);
}

const metaBlock = dom.match(/<script type="text\/plain" id="meta">([\s\S]*?)<\/script>/);
const meta = metaBlock ? JSON.parse(metaBlock[1]) : {};
writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

const block = dom.match(/<script type="text\/plain" id="shots">([\s\S]*?)<\/script>/);
if (!block) {
  console.error("sink de capturas ausente");
  process.exit(2);
}
let n = 0;
for (const line of block[1].trim().split("\n").filter(Boolean)) {
  const sep = line.indexOf("|");
  writeFileSync(
    join(outDir, `f${String(line.slice(0, sep)).padStart(3, "0")}.png`),
    Buffer.from(line.slice(sep + 1), "base64"),
  );
  n++;
}
console.log(`${n} PNGs -> ${outDir}   gl=${gl}   backend="${meta.renderer}"   three r${meta.version}`);
