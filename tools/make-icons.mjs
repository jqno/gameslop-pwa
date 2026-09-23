/* Draws the app icons: two dice for the launcher, and a small Suguru board for
 * Suguru. Each icon is a scene over the unit square, supersampled for smooth
 * edges. Everything sits inside the maskable safe zone (radius 0.4). */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [15, 20, 32];
const BLUE = [77, 141, 255];
const ORANGE = [255, 180, 84];
const PAPER = [244, 246, 249];
const LINE = [196, 203, 216];
const INK = [27, 33, 48];
const USER = [35, 88, 200];
const SAMPLES = 4;

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

/* Averages the scene's colour over SAMPLES x SAMPLES points in each pixel. */
function render(size, scene) {
  return (x, y) => {
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const rgb = scene((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size);
        sum[0] += rgb[0];
        sum[1] += rgb[1];
        sum[2] += rgb[2];
      }
    }
    return sum.map((v) => Math.round(v / (SAMPLES * SAMPLES)));
  };
}

function inRoundedBox(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) <= r;
}

function segmentDistance(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/* --- launcher: two dice ------------------------------------------------ */

const PIPS = {
  3: [[-1, -1], [0, 0], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]
};

function die(cx, cy, half, angle, face, colour) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (x, y) => {
    const lx = (x - cx) * cos + (y - cy) * sin;
    const ly = -(x - cx) * sin + (y - cy) * cos;
    if (!inRoundedBox(lx, ly, half, half, half * 0.3)) return null;
    const hitPip = PIPS[face].some(([px, py]) => Math.hypot(lx - px * half * 0.5, ly - py * half * 0.5) <= half * 0.15);
    if (hitPip) return BG;
    return colour;
  };
}

function launcher() {
  const back = die(0.4, 0.4, 0.14, -0.26, 3, BLUE);
  const front = die(0.585, 0.585, 0.15, 0.2, 5, ORANGE);
  const frontShadow = die(0.585, 0.585, 0.172, 0.2, 5, BG);
  return (x, y) => front(x, y) || frontShadow(x, y) || back(x, y) || BG;
}

/* --- suguru: a solved-in-progress 4x4 board ----------------------------- */

const REGIONS = '0011200122032333';
/* A valid solution for REGIONS; 'g' cells are givens, 'u' the player's, '.' empty. */
const DIGITS = '1212434312523413';
const SHOWN = '.g.gguu..gg...g.';

/* Digits as strokes in a box 0.6 wide and 1 tall. */
function arc(cx, cy, r, from, to) {
  return Array.from({ length: 17 }, (_, k) => {
    const t = from + (to - from) * k / 16;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
}

const GLYPHS = {
  1: [[[0.12, 0.2], [0.34, 0.04], [0.34, 0.96]]],
  2: [[...arc(0.3, 0.29, 0.24, -Math.PI, 0.2 * Math.PI), [0.06, 0.96], [0.56, 0.96]]],
  3: [arc(0.29, 0.27, 0.23, -0.85 * Math.PI, 0.5 * Math.PI), arc(0.29, 0.73, 0.23, -0.5 * Math.PI, 0.85 * Math.PI)],
  4: [[[0.44, 0.96], [0.44, 0.04], [0.04, 0.68], [0.58, 0.68]]],
  5: [[[0.54, 0.04], [0.14, 0.04], [0.09, 0.47], ...arc(0.3, 0.66, 0.29, -0.78 * Math.PI, 0.8 * Math.PI)]]
};

function inGlyph(digit, gx, gy, weight) {
  return GLYPHS[digit].some((stroke) =>
    stroke.slice(1).some((point, k) => segmentDistance(gx, gy, stroke[k], point) <= weight));
}

function suguru() {
  const n = 4;
  const board = 0.56;
  const origin = (1 - board) / 2;
  const cell = board / n;
  const thin = cell * 0.025;
  const thick = cell * 0.06;
  const digitHeight = cell * 0.56;
  const region = (r, c) => {
    if (r < 0 || c < 0 || r >= n || c >= n) return -1;
    return REGIONS[r * n + c];
  };
  return (x, y) => {
    const bx = x - origin;
    const by = y - origin;
    if (!inRoundedBox(bx - board / 2, by - board / 2, board / 2 + thick, board / 2 + thick, cell * 0.12)) return BG;
    const c = Math.min(n - 1, Math.max(0, Math.floor(bx / cell)));
    const r = Math.min(n - 1, Math.max(0, Math.floor(by / cell)));
    const fx = bx / cell - c;
    const fy = by / cell - r;
    const own = region(r, c);
    /* The distance to each of the cell's four sides, paired with the neighbour across it. */
    const sides = [[fx * cell, r, c - 1], [(1 - fx) * cell, r, c + 1], [fy * cell, r - 1, c], [(1 - fy) * cell, r + 1, c]];
    for (const [d, nr, nc] of sides) {
      if (d <= thick && region(nr, nc) !== own) return INK;
    }
    if (bx < 0 || by < 0 || bx > board || by > board) return INK;
    for (const [d] of sides) {
      if (d <= thin) return LINE;
    }
    const i = r * n + c;
    if (SHOWN[i] !== '.') {
      const gx = (fx - 0.5) * cell / digitHeight + 0.3;
      const gy = (fy - 0.5) * cell / digitHeight + 0.5;
      if (inGlyph(DIGITS[i], gx, gy, SHOWN[i] === 'g' ? 0.085 : 0.07)) {
        if (SHOWN[i] === 'g') return INK;
        return USER;
      }
    }
    return PAPER;
  };
}

const ICONS = [['', launcher], ['suguru/', suguru]];
for (const [dir, scene] of ICONS) {
  for (const size of [192, 512]) {
    const name = `${dir}icon-${size}.png`;
    writeFileSync(new URL(`../${name}`, import.meta.url), png(size, render(size, scene())));
    console.log(`wrote ${name}`);
  }
}
