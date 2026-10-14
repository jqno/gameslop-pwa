import T from './takuzu.mjs';

const { EMPTY, DIFFICULTIES } = T;
const SAMPLES = Number(process.env.SAMPLES || 5);

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

/* Reads a grid from rows of '0', '1' and '.'. */
function grid(rows) {
  return rows.join('').split('').map((ch) => (ch === '.' ? EMPTY : Number(ch)));
}

/* Every full grid that fits the givens, by brute force over valid rows.
 * Only for small grids. */
function bruteForce(size, givens) {
  const rows = T.validLines(size).map((m) => Array.from({ length: size }, (_, k) => (m >> k) & 1));
  const fits = Array.from({ length: size }, (_, r) =>
    rows.filter((row) => row.every((v, c) => givens[r * size + c] === EMPTY || givens[r * size + c] === v)));
  let found = 0;
  (function pick(r, chosen) {
    if (found > 1) return;
    if (r === size) {
      if (T.conflicts(size, chosen.flat()).length === 0) found++;
      return;
    }
    for (const row of fits[r]) {
      const next = chosen.concat([row]);
      const partial = next.flat().concat(new Array((size - r - 1) * size).fill(EMPTY));
      if (T.conflicts(size, partial).length === 0) pick(r + 1, next);
    }
  })(0, []);
  return found;
}

const rand = T.rng(11);
const puzzles = [];
for (const key of Object.keys(DIFFICULTIES)) {
  for (const size of T.SIZES) {
    for (let k = 0; k < SAMPLES; k++) puzzles.push(T.generate(key, size, rand));
  }
}

console.log(`takuzu — ${SAMPLES} puzzles per difficulty and size\n`);

test('valid lines are balanced and never have three in a row', () => {
  eq(T.validLines(4).length, 6, '4 wide');
  eq(T.validLines(6).length, 14, '6 wide');
  eq(T.validLines(8).length, 34, '8 wide');
});

test('three in a row, too many of one value, and copied lines are conflicts', () => {
  eq(T.conflicts(4, grid(['000.', '....', '....', '....'])).join(), '0,1,2', 'three in a row');
  eq(T.conflicts(4, grid(['1.11', '1...', '1...', '....'])).join(), '0,2,3,4,8', 'three 1s in a row and a column');
  eq(T.conflicts(4, grid(['0110', '0110', '....', '....'])).join(), '0,1,2,3,4,5,6,7', 'copied rows');
  eq(T.conflicts(4, grid(['0110', '1001', '0011', '1100'])).length, 0, 'a valid grid');
});

test('three in a row is ruled out on either side and in between', () => {
  const steps = T.allPlacements(6, grid(['00....', '......', '0.0...', '......', '......', '......']), DIFFICULTIES.easy);
  const at = (i) => steps.find((s) => s.idx === i);
  eq(at(2).value, 1, 'after a pair');
  eq(at(13).value, 1, 'in a gap');
  eq(at(12), undefined, 'a lone 0 above a gap says nothing on its own');
});

test('a line with half of one value fills with the other', () => {
  const steps = T.allPlacements(4, grid(['1.1.', '....', '....', '....']), DIFFICULTIES.easy);
  eq(steps.filter((s) => s.idx < 4).map((s) => s.idx + '=' + s.value).join(), '1=0,3=0', 'row filled');
});

test('copied lines are only ruled out where the level allows it', () => {
  /* Row 1 is 1001 or 0011 by itself, and row 0 already took 1001. */
  const values = grid(['1001', '.0.1', '....', '....']);
  const hard = T.allPlacements(4, values, DIFFICULTIES.hard).find((s) => s.idx === 4);
  eq(hard && hard.value, 0, 'hard sees it');
  const medium = T.allPlacements(4, values, DIFFICULTIES.medium).find((s) => s.idx === 4);
  eq(medium, undefined, 'medium does not');
});

test('filled grids keep every rule', () => {
  for (const size of T.SIZES) {
    const values = T.fillGrid(size, rand);
    assert(T.isFull(values), 'full');
    eq(T.conflicts(size, values).length, 0, `${size}x${size} conflicts`);
  }
});

test('every puzzle keeps its solution, and its level\'s solver finds it', () => {
  for (const p of puzzles) {
    p.givens.forEach((g, i) => assert(g === EMPTY || g === p.solution[i], 'given matches solution'));
    const solved = T.solveLogically(p.size, p.givens, DIFFICULTIES[p.difficulty]);
    eq(solved.join(''), p.solution.join(''), `${p.difficulty} ${p.size}x${p.size}`);
  }
});

test('6x6 puzzles have exactly one solution', () => {
  for (const p of puzzles.filter((q) => q.size === 6)) {
    eq(bruteForce(6, p.givens), 1, `${p.difficulty} solutions`);
  }
});

test('hard puzzles mostly need more than medium reasoning', () => {
  const mine = puzzles.filter((p) => p.difficulty === 'hard' && p.size >= 8);
  const needs = mine.filter((p) => !T.isFull(T.solveLogically(p.size, p.givens, DIFFICULTIES.medium)));
  assert(needs.length * 2 > mine.length, `${needs.length}/${mine.length} need it`);
});

test('easy gives away at least its share of cells', () => {
  for (const p of puzzles.filter((q) => q.difficulty === 'easy')) {
    const given = p.givens.filter((g) => g !== EMPTY).length;
    assert(given >= Math.round(DIFFICULTIES.easy.minGivenShare * p.size * p.size), `${given} given on ${p.size}x${p.size}`);
  }
});

test('harder levels give fewer cells away', () => {
  const share = (key) => {
    const mine = puzzles.filter((p) => p.difficulty === key);
    const given = mine.reduce((sum, p) => sum + p.givens.filter((g) => g !== EMPTY).length, 0);
    const cells = mine.reduce((sum, p) => sum + p.size * p.size, 0);
    return given / cells;
  };
  console.log(`       given share: easy ${share('easy').toFixed(2)}, medium ${share('medium').toFixed(2)}, hard ${share('hard').toFixed(2)}`);
  assert(share('easy') > share('medium') && share('medium') > share('hard'), 'shares fall');
});

test('a tap cycles empty, 0, 1', () => {
  eq(T.cycle(EMPTY), 0, 'empty');
  eq(T.cycle(0), 1, '0');
  eq(T.cycle(1), EMPTY, '1');
});

test('a game survives a save, and bad saves are rejected', () => {
  const p = puzzles[0];
  const state = T.freshState(p);
  state.values[p.givens.indexOf(EMPTY)] = 1;
  state.hints = ['cell:3'];
  state.elapsed = 1234;
  const back = T.deserialize(T.serialize(p, state));
  eq(JSON.stringify(back.puzzle), JSON.stringify(p), 'puzzle');
  eq(back.state.values.join(), state.values.join(), 'values');
  eq(back.state.elapsed, 1234, 'elapsed');
  eq(T.deserialize(null), null, 'null');
  eq(T.deserialize('not json'), null, 'garbage');
  const changed = JSON.parse(T.serialize(p, state));
  changed.state.values[p.givens.findIndex((g) => g !== EMPTY)] = EMPTY;
  eq(T.deserialize(JSON.stringify(changed)), null, 'a given erased');
  changed.puzzle.size = 7;
  eq(T.deserialize(JSON.stringify(changed)), null, 'size not offered');
});

test('bests are kept per difficulty and size', () => {
  const key = T.bestKey('hard', 10);
  eq(T.deserializeBest(JSON.stringify({ [key]: 5000 }))[key], 5000, 'kept');
  eq(Object.keys(T.deserializeBest(JSON.stringify({ 'hard/7': 5000 }))).length, 0, 'unknown size');
  eq(Object.keys(T.deserializeBest('nope')).length, 0, 'garbage');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
