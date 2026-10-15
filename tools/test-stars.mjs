import S from './stars.mjs';

const { EMPTY, DOT, STAR, DIFFICULTIES } = S;
const SAMPLES = Number(process.env.SAMPLES || 4);

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

/* Reads regions from rows of digits, one per cell. */
function regionsOf(rows) {
  return rows.join('').split('').map(Number);
}

function puzzleOf(rows) {
  return { size: rows.length, stars: S.STARS, regions: regionsOf(rows), solution: [] };
}

function blank(size) {
  return new Array(size * size).fill(EMPTY);
}

/* How many ways there are to place the stars, up to limit, by brute force
 * row by row. */
function countSolutions(puzzle, limit) {
  const { size, stars, regions } = puzzle;
  const ways = S.fits(size, Array.from({ length: size }, (_, c) => c), stars);
  const cols = new Array(size).fill(0);
  const regs = new Array(size).fill(0);
  let found = 0;
  (function place(r, prev) {
    if (found >= limit) return;
    if (r === size) {
      found++;
      return;
    }
    for (const way of ways) {
      const ok = way.every((c) => cols[c] < stars && prev.every((p) => Math.abs(p - c) > 1));
      const ids = way.map((c) => regions[r * size + c]);
      if (!ok || !ids.every((id) => regs[id] + ids.filter((x) => x === id).length <= stars)) continue;
      way.forEach((c, k) => { cols[c]++; regs[ids[k]]++; });
      place(r + 1, way);
      way.forEach((c, k) => { cols[c]--; regs[ids[k]]--; });
    }
  })(0, []);
  return found;
}

function connected(cells, size) {
  const set = new Set(cells);
  const seen = new Set();
  const todo = [cells[0]];
  while (todo.length) {
    const i = todo.pop();
    if (seen.has(i) || !set.has(i)) continue;
    seen.add(i);
    if (i % size > 0) todo.push(i - 1);
    if (i % size < size - 1) todo.push(i + 1);
    todo.push(i - size, i + size);
  }
  return seen.size === cells.length;
}

const puzzles = [];
for (const size of S.SIZES) {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let k = 0; k < SAMPLES; k++) {
      puzzles.push(S.generate(difficulty, size, S.rng(size * 1000 + k * 17 + difficulty.length)));
    }
  }
}

test('stars are placed one per row and column, never touching', () => {
  for (const size of S.SIZES) {
    for (let seed = 1; seed <= 30; seed++) {
      const solution = S.placeStars(size, S.STARS, S.rng(seed));
      const where = `(size ${size}, seed ${seed})`;
      const starCells = solution.flatMap((v, i) => (v === 1 ? [i] : []));
      eq(starCells.length, size * S.STARS, `stars ${where}`);
      for (let k = 0; k < size; k++) {
        eq(starCells.filter((i) => Math.floor(i / size) === k).length, S.STARS, `row ${k} ${where}`);
        eq(starCells.filter((i) => i % size === k).length, S.STARS, `column ${k} ${where}`);
      }
      assert(starCells.every((a) => starCells.every((b) => !S.touching(size, a, b))), `touching ${where}`);
    }
  }
});

test('regions are connected and each holds its stars', () => {
  for (const size of S.SIZES) {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = S.rng(seed);
      const solution = S.placeStars(size, S.STARS, rand);
      const regions = S.growRegions(size, S.STARS, solution, rand);
      for (let id = 0; id < size; id++) {
        const cells = regions.flatMap((r, i) => (r === id ? [i] : []));
        const where = `(size ${size}, seed ${seed}, region ${id})`;
        assert(cells.length > 0 && connected(cells, size), `connected ${where}`);
        eq(cells.filter((i) => solution[i] === 1).length, S.STARS, `stars ${where}`);
      }
    }
  }
});

test('every puzzle has exactly one answer, its solution', () => {
  for (const p of puzzles) {
    const where = `(${p.difficulty} ${p.size})`;
    eq(countSolutions(p, 2), 1, `solutions ${where}`);
    const stars = p.solution.map((v) => (v === 1 ? STAR : DOT));
    assert(S.isSolved(p, stars), `the solution solves it ${where}`);
  }
});

test('every puzzle can be worked out at its difficulty', () => {
  for (const p of puzzles) {
    const solved = S.solveLogically(p, blank(p.size), DIFFICULTIES[p.difficulty]);
    assert(S.isFull(solved), `(${p.difficulty} ${p.size}) fully worked out`);
    eq(solved.map((v) => (v === STAR ? 1 : 0)).join(''), p.solution.join(''), `(${p.difficulty} ${p.size}) matches`);
  }
});

/* On the smaller grids, counting regions across rows is rarely needed, so
 * hard there is often no harder than medium. */
test('most puzzles above easy need their difficulty', () => {
  const keys = Object.keys(DIFFICULTIES);
  for (const [difficulty, minSize] of [['medium', 5], ['hard', 7]]) {
    const easier = DIFFICULTIES[keys[keys.indexOf(difficulty) - 1]];
    const mine = puzzles.filter((p) => p.difficulty === difficulty && p.size >= minSize);
    const needs = mine.filter((p) => !S.isFull(S.solveLogically(p, blank(p.size), easier))).length;
    assert(needs * 2 >= mine.length, `${difficulty}: ${needs} of ${mine.length}`);
  }
});

test('every step the solver finds agrees with the solution, also part way through', () => {
  for (const p of puzzles) {
    const rand = S.rng(p.size);
    let values = blank(p.size);
    for (let round = 0; round < 50 && !S.isFull(values); round++) {
      for (const step of S.allPlacements(p, values, DIFFICULTIES.hard)) {
        eq(step.value === STAR, p.solution[step.idx] === 1, `(${p.difficulty} ${p.size}) cell ${step.idx}: ${step.technique}`);
      }
      /* Reveal a random cell from the solution, as a player might work it out. */
      const open = values.flatMap((v, i) => (v === EMPTY ? [i] : []));
      const i = open[Math.floor(rand() * open.length)];
      values = values.slice();
      values[i] = p.solution[i] === 1 ? STAR : DOT;
    }
  }
});

test('the cells around a star and the rest of a full row are obvious', () => {
  const p = puzzleOf(['00111', '22111', '23333', '44443', '44443']);
  const values = blank(5);
  values[12] = STAR;
  const known = S.markObvious(p, values);
  for (const i of [6, 7, 8, 11, 13, 16, 17, 18]) eq(known[i], DOT, `around, cell ${i}`);
  for (const i of [10, 14, 2, 22]) eq(known[i], DOT, `row and column, cell ${i}`);
  eq(known[0], EMPTY, 'elsewhere');
});

test('a region inside one row takes that row\'s star', () => {
  const p = puzzleOf(['00111', '22111', '23333', '44443', '44443']);
  const steps = S.allPlacements(p, blank(5), DIFFICULTIES.easy);
  const dots = steps.filter((s) => s.value === DOT).map((s) => s.idx).sort((a, b) => a - b);
  eq(dots.join(), '2,3,4', 'the rest of the row');
  assert(steps[0].technique.includes('fits inside'), steps[0].technique);
});

test('medium sees that a star would leave a region no room', () => {
  const p = puzzleOf(['00111', '22111', '23333', '44443', '44443']);
  const find = (opts) => S.allPlacements(p, blank(5), opts).filter((s) => s.idx === 5 || s.idx === 6);
  eq(find(DIFFICULTIES.easy).length, 0, 'not on easy');
  const medium = find(DIFFICULTIES.medium);
  eq(medium.length, 2, 'on medium');
  assert(medium.every((s) => s.value === DOT && s.technique.includes('no room')), medium.map((s) => s.technique).join());
});

test('touching stars and a second star in a row break the rules', () => {
  const p = puzzleOf(['00111', '22111', '23333', '44443', '44443']);
  const values = blank(5);
  values[0] = STAR;
  values[6] = STAR;
  eq(S.conflicts(p, values).join(), '0,6', 'touching');
  values[6] = EMPTY;
  values[3] = STAR;
  eq(S.conflicts(p, values).join(), '0,3', 'two in a row');
  values[3] = DOT;
  eq(S.conflicts(p, values).length, 0, 'fine');
  assert(!S.isSolved(p, values), 'not solved');
});

test('a tap cycles empty, dot, star', () => {
  eq(S.cycle(EMPTY), DOT, 'empty');
  eq(S.cycle(DOT), STAR, 'dot');
  eq(S.cycle(STAR), EMPTY, 'star');
});

test('a game survives a round trip and bad saves are rejected', () => {
  const p = puzzles[0];
  const state = S.freshState(p);
  state.values[3] = STAR;
  state.values[4] = DOT;
  state.undo.push([{ idx: 3, value: EMPTY }]);
  state.hints.push('cell:7');
  state.elapsed = 1234;
  const back = S.deserialize(S.serialize(p, state));
  eq(back.puzzle.regions.join(), p.regions.join(), 'regions');
  eq(back.puzzle.solution.join(), p.solution.join(), 'solution');
  eq(back.state.values.join(), state.values.join(), 'values');
  eq(back.state.elapsed, 1234, 'elapsed');
  const save = (puzzle, st) => JSON.stringify({ version: 1, puzzle: { ...p, ...puzzle }, state: { ...state, ...st } });
  eq(S.deserialize(null), null, 'null');
  eq(S.deserialize('not json'), null, 'garbage');
  eq(S.deserialize(save({ size: 9 }, {})), null, 'a size that is not offered');
  eq(S.deserialize(save({ stars: 2 }, {})), null, 'more stars');
  eq(S.deserialize(save({ difficulty: 'expert' }, {})), null, 'a difficulty that is not offered');
  eq(S.deserialize(save({ regions: p.regions.map(() => 0) }, {})), null, 'one region');
  eq(S.deserialize(save({}, { values: state.values.map(() => 3) })), null, 'unknown cell values');
  eq(S.deserialize(save({}, { elapsed: -1 })), null, 'negative time');
});

test('bests are checked on load', () => {
  const key = S.bestKey('hard', 8);
  eq(S.deserializeBest(JSON.stringify({ [key]: 60000 }))[key], 60000, 'kept');
  eq(Object.keys(S.deserializeBest(JSON.stringify({ 'hard/9': 1 }))).length, 0, 'a size that is not offered');
  eq(Object.keys(S.deserializeBest('nope')).length, 0, 'garbage');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
