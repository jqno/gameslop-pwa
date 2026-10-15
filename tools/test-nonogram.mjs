import T from './nonogram.mjs';

const { EMPTY, FILL, CROSS, UNKNOWN } = T;

let failures = 0;
let count = 0;

function test(name, fn) {
  count++;
  try {
    fn();
    process.stdout.write(`  ok   ${name}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`  FAIL ${name}\n       ${e.message}\n`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function eq(a, b, message) {
  if (a !== b) throw new Error(`${message}: expected ${b}, got ${a}`);
}

/* Reads a line or grid from '#' for filled, '.' for empty and '?' for not known. */
function cells(text) {
  return text.split('').map((ch) => {
    if (ch === '#') return 1;
    if (ch === '.') return 0;
    return EMPTY;
  });
}

function show(values) {
  return values.map((v) => {
    if (v === 1) return '#';
    if (v === 0) return '.';
    return '?';
  }).join('');
}

/* What every way to fill a line with the clue agrees on, by trying all 2^n. */
function bruteLine(clue, known) {
  const n = known.length;
  const ways = [];
  for (let m = 0; m < (1 << n); m++) {
    const line = Array.from({ length: n }, (_, k) => (m >> k) & 1);
    if (line.some((v, k) => known[k] !== EMPTY && known[k] !== v)) continue;
    if (T.runs(line).join() === clue.join()) ways.push(line);
  }
  if (ways.length === 0) return null;
  return known.map((_, k) => {
    if (ways.every((w) => w[k] === 1)) return 1;
    if (ways.every((w) => w[k] === 0)) return 0;
    return EMPTY;
  });
}

/* Smoothed noise, which thresholds into blobs much like a picture does. */
function blobs(size, rand) {
  let levels = Array.from({ length: size * size }, () => rand());
  for (let pass = 0; pass < 3; pass++) {
    levels = levels.map((_, i) => {
      const r = Math.floor(i / size);
      const c = i % size;
      let sum = 0;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (r + dr < 0 || r + dr >= size || c + dc < 0 || c + dc >= size) continue;
          sum += levels[(r + dr) * size + c + dc];
          n++;
        }
      }
      return sum / n;
    });
  }
  return levels;
}

/* An RGBA image of width x height, black where inside(x, y), else clear. */
function image(width, height, inside) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside(x, y)) rgba[(y * width + x) * 4 + 3] = 255;
    }
  }
  return rgba;
}

const rand = T.rng(5);

console.log('nonogram\n');

test('the emoji list is there, each with a name', () => {
  assert(T.EMOJI.length > 1000, `${T.EMOJI.length} emoji`);
  assert(T.EMOJI.every((e) => e.char.length > 0 && e.name.length > 0), 'char and name');
  assert(T.EMOJI.some((e) => e.name === 'mouse face'), 'mouse face');
});

test('clues are the runs of filled cells', () => {
  eq(T.runs(cells('##.#..###')).join(), '2,1,3', 'runs');
  eq(T.runs(cells('.....')).length, 0, 'empty line');
  const clues = T.cluesOf(3, cells('##.' + '..#' + '#.#'));
  eq(clues.map((c) => c.join('+')).join(' '), '2 1 1+1 1+1 1 2', 'rows then columns');
});

test('a line is solved to what every placement agrees on', () => {
  eq(show(T.solveLine([3], cells('?????'))), '??#??', 'overlap');
  eq(show(T.solveLine([2, 1], cells('????'))), '##.#', 'exact fit');
  eq(show(T.solveLine([], cells('???'))), '...', 'no runs');
  eq(show(T.solveLine([1], cells('?#??'))), '.#..', 'run found');
  eq(T.solveLine([2], cells('#.#')), null, 'no way to fit');
});

test('the line solver agrees with brute force', () => {
  for (let t = 0; t < 3000; t++) {
    const n = 1 + Math.floor(rand() * 9);
    const truth = Array.from({ length: n }, () => (rand() < 0.5 ? 1 : 0));
    const clue = rand() < 0.2 ? [Math.ceil(rand() * n)] : T.runs(truth);
    const known = truth.map((v) => (rand() < 0.3 ? v : EMPTY));
    const want = bruteLine(clue, known);
    const got = T.solveLine(clue, known);
    eq(got && show(got), want && show(want), `${clue} on ${show(known)}`);
  }
});

test('a grid solves line by line, or ends in a contradiction', () => {
  const plus = cells('.#.' + '###' + '.#.');
  eq(show(T.solve(3, T.cluesOf(3, plus))), show(plus), 'plus');
  const diagonal = cells('#.' + '.#');
  assert(!T.isFull(T.solve(2, T.cluesOf(2, diagonal))), 'two solutions stay unknown');
  eq(T.solve(2, [[2], [], [2], []]), null, 'clues that contradict');
});

test('levels crop to what is drawn and centre it in a square', () => {
  /* A 10 x 20 black bar in the middle of a 40 x 40 image. */
  const levels = T.levelsOf(image(40, 40, (x, y) => x >= 15 && x < 25 && y >= 10 && y < 30), 40, 4);
  eq(levels.map((v) => (v > 0.5 ? '#' : '.')).join(''), '.##.'.repeat(4), 'tall bar');
  eq(T.levelsOf(image(8, 8, () => false), 8, 4), null, 'nothing drawn');
});

test('a flat image gives flat levels, whatever the cells divide into', () => {
  const levels = T.levelsOf(image(37, 37, () => true), 37, 10);
  assert(levels.every((v) => Math.abs(v - 1) < 1e-9), levels.join());
});

test('the cutoff fills the darkest share of the cells', () => {
  const levels = Array.from({ length: 100 }, (_, i) => i / 100);
  const solution = T.thresholdAt(levels, T.cutoffAt(levels, 0.4));
  eq(solution.filter((v) => v === 1).length, 40, 'filled');
  eq(solution[99], 1, 'darkest');
  eq(solution[0], 0, 'lightest');
});

test('the natural cutoff keeps a flat shape whole, however much it covers', () => {
  /* A shape on 60% of the cells, with slight shading, on a blank background. */
  const shape = Array.from({ length: 100 }, (_, i) => (i < 60 ? 1 : 0));
  const levels = shape.map((v, i) => (v ? 0.5 + 0.02 * Math.sin(i) : 0.01 * (i % 3)));
  eq(T.thresholdAt(levels, T.naturalCutoff(levels)).join(''), shape.join(''), 'shape');
});

test('mirroring flips left to right', () => {
  eq(T.mirror([1, 2, 3, 4, 5, 6, 7, 8, 9], 3).join(), '3,2,1,6,5,4,9,8,7', 'mirrored');
});

test('pictures that are too empty, too full or too noisy do not read', () => {
  const checker = Array.from({ length: 100 }, (_, i) => (Math.floor(i / 10) + i) % 2);
  assert(!T.readsWell(10, checker), 'checkerboard');
  assert(!T.readsWell(10, new Array(100).fill(1)), 'full');
  assert(!T.readsWell(10, new Array(100).fill(0)), 'empty');
  const half = Array.from({ length: 100 }, (_, i) => (i % 10 < 5 ? 1 : 0));
  assert(T.readsWell(10, half), 'half');
});

test('repaired pictures solve by logic alone, with only a few cells flipped', () => {
  let repaired = 0;
  for (const size of T.SIZES) {
    for (let k = 0; k < 4; k++) {
      const levels = blobs(size, rand);
      const cutoff = T.cutoffAt(levels, 0.5);
      const before = T.thresholdAt(levels, cutoff);
      const after = T.repair(size, before, levels, cutoff);
      if (after === null) continue;
      repaired++;
      assert(T.isFull(T.solve(size, T.cluesOf(size, after))), 'solves');
      const flips = after.filter((v, i) => v !== before[i]).length;
      assert(flips <= T.MAX_FLIPS * size * size, `${flips} flips on ${size}x${size}`);
    }
  }
  assert(repaired >= 8, `${repaired}/12 repaired`);
});

test('a solution from levels solves by logic and reads as a picture', () => {
  for (const size of T.SIZES) {
    const solution = T.solutionOf(blobs(size, rand), size);
    if (solution === null) continue;
    assert(T.readsWell(size, solution), 'reads');
    assert(T.isFull(T.solve(size, T.cluesOf(size, solution))), 'solves');
  }
});

test('the deck deals every puzzle once before any comes back', () => {
  const levelsFor = () => blobs(10, T.rng(1));
  const seen = new Set();
  let deck = [];
  const total = T.EMOJI.length * 2;
  for (let k = 0; k < 40; k++) {
    const next = T.nextPuzzle(deck, 10, levelsFor, rand);
    deck = next.deck;
    const key = next.puzzle.char + next.puzzle.mirrored;
    assert(!seen.has(key), `repeated ${key}`);
    seen.add(key);
  }
  eq(deck.length, total - 40, 'deck left');
});

test('emoji that do not make a picture are skipped, and none at all gives up', () => {
  const only = T.EMOJI[7].char;
  const levelsFor = (char) => (char === only ? blobs(10, T.rng(1)) : null);
  const next = T.nextPuzzle([], 10, levelsFor, rand);
  eq(next.puzzle.char, only, 'found the one that draws');
  eq(T.nextPuzzle([], 10, () => null, rand).puzzle, null, 'gave up');
});

test('a mirrored puzzle is the picture flipped', () => {
  const levels = blobs(10, T.rng(2));
  const levelsFor = () => levels;
  const [plain, flipped] = [0, 1].map((m) => T.nextPuzzle([m], 10, levelsFor, rand).puzzle);
  eq(plain.mirrored, false, 'plain');
  eq(flipped.mirrored, true, 'flipped');
  eq(show(T.solutionOf(T.mirror(levels, 10), 10)), show(flipped.solution), 'mirrored solution');
});

test('hints only settle cells that match the solution', () => {
  const size = 15;
  const solution = T.solutionOf(blobs(size, T.rng(3)), size);
  const clues = T.cluesOf(size, solution);
  const marks = new Array(size * size).fill(UNKNOWN);
  for (let steps = 0; ; steps++) {
    const step = T.nextStep(size, clues, marks);
    if (step === null) break;
    step.cells.forEach((i) => { marks[i] = solution[i] === 1 ? FILL : CROSS; });
    assert(steps < size * size, 'hints run out');
  }
  assert(T.isSolved(solution, marks), 'hints alone solve it');
});

test('broken and done lines are found from the marks', () => {
  const solution = cells('##.' + '...' + '#..');
  const clues = T.cluesOf(3, solution);
  const marks = [FILL, FILL, UNKNOWN, FILL, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN];
  const broken = T.brokenLines(3, clues, marks).map((l) => l.kind + l.k);
  eq(broken.join(), 'row1,column0', 'a fill in an empty row, and so a run too long');
  const done = T.doneLines(3, clues, marks).map((l) => l.kind + l.k);
  eq(done.join(), 'row0,column1,column2', 'done');
});

test('solved means the fills match; crosses do not matter', () => {
  const solution = cells('#.' + '.#');
  assert(T.isSolved(solution, [FILL, UNKNOWN, CROSS, FILL]), 'solved');
  assert(!T.isSolved(solution, [FILL, FILL, UNKNOWN, FILL]), 'one too many');
});

test('a game survives a save, and bad saves are rejected', () => {
  const p = { size: 10, char: '🐭', name: 'mouse face', mirrored: true, solution: new Array(100).fill(0) };
  const state = T.freshState(p);
  state.marks[3] = FILL;
  state.marks[4] = CROSS;
  state.hints = ['line:row1:3'];
  state.elapsed = 1234;
  const back = T.deserialize(T.serialize(p, state));
  eq(JSON.stringify(back.puzzle), JSON.stringify(p), 'puzzle');
  eq(back.state.marks.join(), state.marks.join(), 'marks');
  eq(back.state.elapsed, 1234, 'elapsed');
  eq(T.deserialize(null), null, 'null');
  eq(T.deserialize('not json'), null, 'garbage');
  const changed = JSON.parse(T.serialize(p, state));
  changed.state.marks[0] = 7;
  eq(T.deserialize(JSON.stringify(changed)), null, 'a bad mark');
  changed.puzzle.size = 12;
  eq(T.deserialize(JSON.stringify(changed)), null, 'size not offered');
});

test('decks are kept per size, without puzzles that do not exist', () => {
  const decks = T.deserializeDecks(JSON.stringify({ 10: [1, 2, -1, 1e9, 'x'], 12: [1] }));
  eq(decks[10].join(), '1,2', 'kept');
  eq(decks[12], undefined, 'unknown size');
  eq(Object.keys(T.deserializeDecks('nope')).length, 0, 'garbage');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
