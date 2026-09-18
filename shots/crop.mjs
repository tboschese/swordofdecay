#!/usr/bin/env node
/**
 * Recorta e amplia (vizinho mais próximo) um trecho de uma captura.
 *
 *   node shots/crop.mjs <png> --region 40,150,72,60 --zoom 6 --out out/z.png
 *
 * Julgar arte de pixel a 384x224 na tela inteira é impossível: um detalhe
 * de 3px decide se a superfície lê como metal ou como massa. Esta é a
 * ferramenta equivalente ao `--isolate` do harness da espada.
 *
 * Amplia por inteiro e sem suavização, sempre — qualquer interpolação
 * inventaria tons que não existem na arte e faria você julgar o filtro.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, isAbsolute, resolve } from "node:path";

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("não é png");
  let i = 8;
  const idat = [];
  let w = 0, h = 0, bd = 0, ct = 0;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    i += 12 + len;
  }
  if (bd !== 8) throw new Error("precisa de png 8-bit");
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * nch, out = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride));
    pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= nch ? line[x - nch] : 0, b = prev[x], c = x >= nch ? prev[x - nch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 255;
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, nch, px: out };
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find((a) => !a.startsWith("--") && !argv.includes(a === argv[argv.indexOf(a) - 1]));
const src = argv[0];
if (!src || src.startsWith("--")) { console.error("uso: crop.mjs <png> [--region x,y,w,h] [--zoom 6] [--out out/z.png]"); process.exit(1); }

const { w, h, nch, px } = decodePNG(readFileSync(src));
const [rx, ry, rw, rh] = (arg("region", `0,0,${w},${h}`)).split(",").map(Number);
const zoom = Number(arg("zoom", "6"));
const outArg = arg("out", "out/crop.png");
const out = isAbsolute(outArg) ? outArg : resolve(process.cwd(), outArg);

const ow = rw * zoom, oh = rh * zoom;
const dst = Buffer.alloc(ow * oh * 4);
for (let y = 0; y < oh; y++) {
  const sy = Math.min(h - 1, ry + Math.floor(y / zoom));
  for (let x = 0; x < ow; x++) {
    const sx = Math.min(w - 1, rx + Math.floor(x / zoom));
    const s = (sy * w + sx) * nch;
    const dOff = (y * ow + x) * 4;
    dst[dOff] = px[s];
    dst[dOff + 1] = px[s + (nch > 2 ? 1 : 0)];
    dst[dOff + 2] = px[s + (nch > 2 ? 2 : 0)];
    dst[dOff + 3] = 255;
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePNG(ow, oh, dst));
console.log(`${out}  ${ow}x${oh}  (região ${rx},${ry} ${rw}x${rh} @ ${zoom}x)`);
void file;
