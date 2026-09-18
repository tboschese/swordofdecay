#!/usr/bin/env node
/** Empacota o jogo 3D num HTML unico auto-contido (CSP estrito no destino). */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
mkdirSync(join(here, "build"), { recursive: true });
const js = join(here, "build", "game.js");
execFileSync("npx", ["esbuild", join(here, "src/main.ts"), "--bundle", "--format=esm",
  "--target=es2022", "--minify", "--outfile=" + js, "--log-level=warning"], { cwd: repo, stdio: "inherit" });
const code = readFileSync(js, "utf8").replaceAll("</script", "<\\/script");
const html = `<title>Sword of Decay</title>
<style>
  :root { --ground:#0e120c; --ink:#c9d2bb; --muted:#7d8a72; --rot:#8fae3a; }
  html,body { margin:0; padding:0; background:var(--ground); color:var(--ink); overflow:hidden; }
  canvas { display:block; }
</style>
<div id="game-root"></div>
<script type="module">
${code}
</script>
`;
const out = join(here, "build", "sword-of-decay-3d.html");
writeFileSync(out, html);
console.log(`${out}  ${(Buffer.byteLength(html)/1048576).toFixed(2)} MB`);
