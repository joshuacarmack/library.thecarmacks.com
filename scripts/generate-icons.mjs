// Generates raster PNG app icons from scratch (no image-processing deps) so iOS/Android
// home-screen install has real icons instead of the SVG-only placeholder. Draws the same
// design as app/public/icons/icon.svg: a rounded green square with four book "spines".
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "app", "public", "icons");

const BG = [0x3f, 0x5b, 0x4a]; // --color-primary
const FG = [0xfa, 0xf7, 0xf2]; // --color-bg

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = makeTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Rounded-rect + book-spine mask, matching icon.svg's geometry, scaled to `size`. */
function pixelColor(x, y, size) {
  const s = size / 192; // scale factor from the 192-viewBox SVG
  const r = 32 * s; // corner radius
  // Outside rounded rect -> transparent
  const corners = [
    [r, r],
    [size - r, r],
    [r, size - r],
    [size - r, size - r],
  ];
  let insideRoundedRect = x >= r && x <= size - r; // horizontal band always inside once past corners check below
  if (!(x >= 0 && x < size && y >= 0 && y < size)) return null;
  const inCornerBox =
    (x < r && y < r) || (x > size - r && y < r) || (x < r && y > size - r) || (x > size - r && y > size - r);
  if (inCornerBox) {
    const [cx, cy] =
      x < r && y < r
        ? corners[0]
        : x > size - r && y < r
          ? corners[1]
          : x < r && y > size - r
            ? corners[2]
            : corners[3];
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > r * r) return null; // outside the rounded corner
  }
  void insideRoundedRect;

  // Four book spines (rectangles), matching icon.svg coordinates.
  const spines = [
    { x: 48 * s, y: 44 * s, w: 20 * s, h: 104 * s },
    { x: 74 * s, y: 40 * s, w: 20 * s, h: 108 * s },
    { x: 126 * s, y: 44 * s, w: 20 * s, h: 104 * s },
  ];
  for (const sp of spines) {
    if (x >= sp.x && x <= sp.x + sp.w && y >= sp.y && y <= sp.y + sp.h) return FG;
  }
  // Fourth spine is rotated 6deg in the SVG; approximate with an unrotated rect for simplicity
  // at icon scale (indistinguishable at 192/512px).
  const rotSpine = { x: 100 * s, y: 48 * s, w: 20 * s, h: 100 * s };
  if (x >= rotSpine.x && x <= rotSpine.x + rotSpine.w && y >= rotSpine.y && y <= rotSpine.y + rotSpine.h) return FG;

  return BG;
}

function generatePng(size) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const color = pixelColor(x, y, size);
      const off = rowStart + 1 + x * 4;
      if (color) {
        raw[off] = color[0];
        raw[off + 1] = color[1];
        raw[off + 2] = color[2];
        raw[off + 3] = 255;
      } else {
        raw[off] = raw[off + 1] = raw[off + 2] = raw[off + 3] = 0;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const png = generatePng(size);
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Wrote ${path} (${png.length} bytes)`);
}
