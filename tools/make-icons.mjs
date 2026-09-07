/* Draws the app icons: a five-cell region, the shape a Suguru is built from. */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [15, 20, 32];
const ACCENT = [77, 141, 255];
const LIGHT = [231, 235, 243];
const SHAPE = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]];
const HIGHLIGHT = '1,1';

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0;
    for (let x = 0; x < size; x++) {
      const rgb = pixel(x, y);
      raw[at++] = rgb[0];
      raw[at++] = rgb[1];
      raw[at++] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function inRoundedRect(x, y, x0, y0, w, h, r) {
  const dx = Math.max(x0 - x, 0, x - (x0 + w));
  const dy = Math.max(y0 - y, 0, y - (y0 + h));
  if (dx === 0 && dy === 0) {
    const insetX = Math.min(x - x0, x0 + w - x);
    const insetY = Math.min(y - y0, y0 + h - y);
    if (insetX >= r || insetY >= r) return true;
    return (r - insetX) ** 2 + (r - insetY) ** 2 <= r * r;
  }
  return false;
}

function draw(size) {
  const cell = size * 0.22;
  const gap = cell * 0.12;
  const originX = (size - 2 * cell) / 2;
  const originY = (size - 3 * cell) / 2;
  return (x, y) => {
    for (const [col, row] of SHAPE) {
      const x0 = originX + col * cell + gap / 2;
      const y0 = originY + row * cell + gap / 2;
      if (inRoundedRect(x + 0.5, y + 0.5, x0, y0, cell - gap, cell - gap, cell * 0.2)) {
        return `${col},${row}` === HIGHLIGHT ? LIGHT : ACCENT;
      }
    }
    return BG;
  };
}

for (const size of [192, 512]) {
  const file = new URL(`../icon-${size}.png`, import.meta.url);
  writeFileSync(file, png(size, draw(size)));
  console.log(`wrote icon-${size}.png`);
}
