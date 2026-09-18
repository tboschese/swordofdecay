#!/usr/bin/env node
// Renders the sword to a PNG via chrome-headless-shell (SwiftShader WebGL2).
//
//   node hero/render.mjs --out out/foo.png [--w 720] [--h 900] [--ss 2]
//                        [--mode 0|1|2] [--isolate 0..4] [--tile 128]
//
// modes:   0 beauty   1 clay (form only)   2 silhouette
// isolate: 0 all      1 blade  2 guard  3 grip  4 pommel
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));

const CHROME_CANDIDATES = [
  join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME = CHROME_CANDIDATES.find(existsSync);
if (!CHROME) { console.error('no chrome binary found'); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

const w   = arg('w', '720');
const h   = arg('h', '900');
const ss  = arg('ss', '2');
const mode= arg('mode', '0');
const iso = arg('isolate', '0');
const tile= arg('tile', '128');
const outArg = arg('out', 'out/render.png');
const out = isAbsolute(outArg) ? outArg : resolve(here, outArg);

// --src lets a parallel agent render from its own private copy of hero/src.
// --bundle keeps each agent's compiled shader bundle separate.
const srcDir = arg('src', '');
const bundle = arg('bundle', 'shaders');

mkdirSync(dirname(out), { recursive: true });

const env = { ...process.env, HERO_BUNDLE: bundle };
if (srcDir) env.HERO_SRC = resolve(srcDir);

// 1. rebuild the shader bundle
execFileSync(process.execPath, [join(here, 'build.mjs')], { stdio: 'inherit', env });

const q = `w=${w}&h=${h}&ss=${ss}&mode=${mode}&isolate=${iso}&tile=${tile}&bundle=${bundle}`;
const url = `file://${join(here, 'index.html')}?${q}`;

// 2. compile-check + capture any shader error, cheaply, before the real render
const dom = execFileSync(CHROME, [
  '--headless', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--disable-lcd-text', '--hide-scrollbars',
  '--virtual-time-budget=4000', '--dump-dom',
  `file://${join(here, 'index.html')}?w=32&h=32&ss=1&mode=${mode}&isolate=${iso}&tile=64&bundle=${bundle}`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

const errBlock = dom.match(/data-shader-error="([\s\S]*?)"><\/body>|data-shader-error="([\s\S]*?)">/);
if (errBlock) {
  const raw = errBlock[1] ?? errBlock[2] ?? '';
  console.error('\n=== SHADER COMPILE ERROR ===\n' + raw
    .replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  process.exit(2);
}
const title = (dom.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
if (title.startsWith('FAIL:')) { console.error('render failed: ' + title); process.exit(2); }

// 3. full render
const px = Number(w) * Number(h) * Number(ss) * Number(ss);
const budgetMs = Math.max(60000, Math.round(px / 1200));
const t0 = Date.now();
execFileSync(CHROME, [
  '--headless', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--disable-lcd-text', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${w},${h}`,
  `--virtual-time-budget=${budgetMs}`,
  `--screenshot=${out}`,
  url,
], { stdio: ['ignore', 'ignore', 'ignore'] });

if (!existsSync(out)) { console.error('no png produced'); process.exit(3); }
const kb = Math.round(statSync(out).size / 1024);
console.log(`${out}  ${w}x${h} ss${ss} mode${mode} iso${iso}  ${kb}KB  ${Math.round((Date.now() - t0) / 1000)}s`);
