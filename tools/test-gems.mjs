import G from './gems.mjs';

const SEEDS = Number(process.env.SEEDS || 300);

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

/* A board from 8 strings of 8 digits, one per row. */
function parse(rows) {
  return rows.join('').split('').map(Number);
}

/* A board with no lines on it: colours in a pattern that never repeats three times. */
const QUIET = parse([
  '01230123', '12301230', '23012301', '30123012',
  '01230123', '12301230', '23012301', '30123012'
]);

function at(row, col) {
  return row * G.SIZE + col;
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i * 7919 + 1);

test('a quiet board has no lines and no move', () => {
  eq(G.findMatches(QUIET).length, 0, 'matches');
  assert(!G.hasMove(QUIET), 'should have no move');
});

test('a new board has no lines and a move to make, in each number of colours', () => {
  for (const colours of G.COLOURS) {
    for (const seed of seeds) {
      const board = G.newBoard(G.rng(seed), colours);
      const where = `(${colours} colours, seed ${seed})`;
      eq(board.length, G.SIZE * G.SIZE, `size ${where}`);
      eq(G.findMatches(board).length, 0, `matches ${where}`);
      assert(G.hasMove(board), `no move ${where}`);
      assert(G.findMoves(board).every(([a, b]) => G.isValidMove(board, a, b)), `every hint is a valid move ${where}`);
      assert(board.every((gem) => Number.isInteger(gem) && gem >= 0 && gem < colours), `colours ${where}`);
    }
  }
});

test('lines are found across and down', () => {
  const row = QUIET.slice();
  [0, 1, 2].forEach((c) => { row[at(3, c)] = 5; });
  eq(G.findMatches(row).join(), [at(3, 0), at(3, 1), at(3, 2)].join(), 'a row of three');
  const col = QUIET.slice();
  [5, 6, 7].forEach((r) => { col[at(r, 7)] = 5; });
  eq(G.findMatches(col).join(), [at(5, 7), at(6, 7), at(7, 7)].join(), 'a column of three at the edge');
  const five = QUIET.slice();
  [2, 3, 4, 5, 6].forEach((c) => { five[at(0, c)] = 4; });
  eq(G.findMatches(five).length, 5, 'a row of five');
});

test('a cell in two lines counts once', () => {
  const board = QUIET.slice();
  [[2, 2], [2, 3], [2, 4], [3, 2], [4, 2]].forEach(([r, c]) => { board[at(r, c)] = 5; });
  eq(G.findMatches(board).length, 5, 'an L');
  eq(G.findLines(board).length, 2, 'is two lines');
});

test('a wave scores its gems and line bonuses, times its number', () => {
  const wave = (rows) => {
    const board = QUIET.slice();
    rows.forEach((cells) => cells.forEach(([r, c]) => { board[at(r, c)] = 5; }));
    return { lines: G.findLines(board), cleared: G.findMatches(board) };
  };
  const row = (r, length) => Array.from({ length }, (_, c) => [r, c]);
  eq(G.waveScore(wave([row(0, 3)]), 1), 3 * G.POINTS, 'a line of three');
  eq(G.waveScore(wave([row(0, 4)]), 1), 4 * G.POINTS + G.BONUS[4], 'a line of four');
  eq(G.waveScore(wave([row(0, 5)]), 1), 5 * G.POINTS + G.BONUS[5], 'a line of five');
  eq(G.waveScore(wave([row(0, 6)]), 1), 6 * G.POINTS + G.BONUS[5], 'a line of six');
  eq(G.waveScore(wave([row(0, 3), row(4, 4)]), 1), 7 * G.POINTS + G.BONUS[4], 'two lines at once');
  eq(G.waveScore(wave([row(0, 4)]), 3), 3 * (4 * G.POINTS + G.BONUS[4]), 'in the third wave');
});

test('only neighbours are adjacent', () => {
  assert(G.isAdjacent(at(0, 0), at(0, 1)), 'right');
  assert(G.isAdjacent(at(3, 3), at(4, 3)), 'down');
  assert(!G.isAdjacent(at(0, 7), at(1, 0)), 'wrapping round a row');
  assert(!G.isAdjacent(at(0, 0), at(1, 1)), 'diagonal');
  assert(!G.isAdjacent(at(0, 0), at(0, 2)), 'two apart');
});

test('a move is valid only when it makes a line', () => {
  const board = QUIET.slice();
  board[at(0, 0)] = 5;
  board[at(0, 1)] = 5;
  board[at(1, 2)] = 5;
  assert(G.isValidMove(board, at(0, 2), at(1, 2)), 'swapping the 5 up finishes the row');
  assert(G.hasMove(board), 'the board has a move');
  eq(JSON.stringify(G.findMoves(board)), JSON.stringify([[at(0, 2), at(1, 2)]]), 'the only hint is that move');
  eq(G.findMoves(QUIET).length, 0, 'no hints on a board without moves');
  assert(!G.isValidMove(board, at(4, 4), at(4, 5)), 'a swap that makes nothing');
  assert(!G.isValidMove(board, at(0, 2), at(2, 2)), 'not neighbours');
  eq(G.swap(board, at(0, 2), at(1, 2))[at(0, 2)], 5, 'swap moves the gem');
  eq(board[at(0, 2)], QUIET[at(0, 2)], 'swap leaves the board alone');
});

test('collapse drops survivors in order and fills from the top', () => {
  const board = QUIET.slice();
  const cleared = [at(5, 2), at(6, 2), at(7, 2)];
  const column = (b) => Array.from({ length: G.SIZE }, (_, r) => b[at(r, 2)]);
  const { board: next, falls } = G.collapse(board, cleared, G.rng(1), 6);
  eq(column(next).slice(3).join(), column(board).slice(0, 5).join(), 'survivors fall three rows');
  assert(next.every((gem) => gem >= 0 && gem < 6), 'no holes');
  eq(falls.filter((f) => f.from < 0).length, 3, 'three new gems');
  eq(falls.filter((f) => f.from >= 0).length, 5, 'five gems fall');
  assert(falls.every((f) => f.col === 2 && f.to - f.from === 3), 'everything moves three rows down column 2');
  [0, 1, 3, 4, 5, 6, 7].forEach((c) => {
    for (let r = 0; r < G.SIZE; r++) eq(next[at(r, c)], board[at(r, c)], `other columns untouched (${r}, ${c})`);
  });
});

test('resolve clears every wave and leaves no lines', () => {
  for (const colours of G.COLOURS) {
    for (const seed of seeds) {
      const rand = G.rng(seed);
      const board = G.newBoard(rand, colours);
      const [a, b] = G.findMoves(board)[0];
      const waves = G.resolve(G.swap(board, a, b), rand, colours);
      const where = `(${colours} colours, seed ${seed})`;
      assert(waves.length >= 1, `at least one wave ${where}`);
      waves.forEach((wave) => {
        assert(wave.cleared.length >= 3, `a wave clears three or more ${where}`);
        assert(wave.lines.length >= 1, `a wave has its lines ${where}`);
      });
      const last = waves[waves.length - 1].board;
      eq(G.findMatches(last).length, 0, `matches after ${where}`);
      assert(last.every((gem) => gem >= 0 && gem < colours), `colours after ${where}`);
    }
  }
});

test('a reshuffle keeps the gems, has no lines and has a move', () => {
  const counts = (board) => board.reduce((acc, gem) => {
    acc[gem] = (acc[gem] || 0) + 1;
    return acc;
  }, {});
  const next = G.reshuffle(QUIET, G.rng(42), 6);
  eq(G.findMatches(next).length, 0, 'matches');
  assert(G.hasMove(next), 'no move');
  eq(JSON.stringify(counts(next)), JSON.stringify(counts(QUIET)), 'colour counts');
  for (const colours of G.COLOURS) {
    for (const seed of seeds) {
      const rand = G.rng(seed);
      const board = G.newBoard(rand, colours);
      const shuffled = G.reshuffle(board, rand, colours);
      const where = `(${colours} colours, seed ${seed})`;
      eq(G.findMatches(shuffled).length, 0, `no lines to clear after a reshuffle ${where}`);
      assert(G.hasMove(shuffled), `a move after a reshuffle ${where}`);
    }
  }
});

test('progress survives a round trip and bad saves are rejected', () => {
  const key = G.bestKey(1000, 6);
  const progress = { best: { [key]: 14 }, target: 2000, colours: 7 };
  const back = G.deserialize(G.serialize(progress));
  eq(back.best[key], 14, 'best');
  eq(back.target, 2000, 'target');
  eq(back.colours, 7, 'colours');
  const save = (changes) => JSON.stringify({ version: 3, best: {}, target: 1000, colours: 6, ...changes });
  assert(G.deserialize(save({})) !== null, 'a save with no bests yet');
  eq(G.deserialize(null), null, 'null');
  eq(G.deserialize('not json'), null, 'garbage');
  eq(G.deserialize(JSON.stringify({ version: 2, best: 87 })), null, 'a save that counted moves until stuck');
  eq(G.deserialize(save({ best: { [key]: 2.5 } })), null, 'fractional best');
  eq(G.deserialize(save({ best: { [key]: 0 } })), null, 'zero best');
  eq(G.deserialize(save({ best: { '1234/6': 10 } })), null, 'a target that is not offered');
  eq(G.deserialize(save({ best: [] })), null, 'bests as a list');
  eq(G.deserialize(save({ target: 1234 })), null, 'picked a target that is not offered');
  eq(G.deserialize(save({ colours: 4 })), null, 'picked colours that are not offered');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
