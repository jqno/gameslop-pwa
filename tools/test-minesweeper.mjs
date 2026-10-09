import M from './minesweeper.mjs';

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

/* A game from strings, one per row: '*' a mine, '.' none. */
function parse(rows) {
  const level = { cols: rows[0].length, rows: rows.length, mines: 0 };
  const mines = rows.join('').split('').map((ch) => ch === '*');
  level.mines = mines.filter(Boolean).length;
  return { level, game: M.withMines(M.newGame(level), mines) };
}

test('neighbours stay on the field', () => {
  eq(M.neighbours(3, 3, 4).length, 8, 'middle');
  eq(M.neighbours(3, 3, 0).join(), '1,3,4', 'corner');
  eq(M.neighbours(3, 3, 5).join(), '1,2,4,7,8', 'edge');
});

test('every level fits its mines around a safe start', () => {
  M.LEVELS.forEach((level) => {
    assert(level.cols * level.rows - 9 >= level.mines, level.name);
  });
});

test('mines are laid in the right number, never on or around the first cell', () => {
  const rand = M.rng(42);
  M.LEVELS.forEach((level) => {
    for (let k = 0; k < 50; k++) {
      const safe = Math.floor(rand() * level.cols * level.rows);
      const mines = M.layMines(level.cols, level.rows, level.mines, safe, rand);
      eq(mines.length, level.cols * level.rows, 'size');
      eq(mines.filter(Boolean).length, level.mines, 'mines');
      [safe, ...M.neighbours(level.cols, level.rows, safe)].forEach((i) => assert(!mines[i], `mine at ${i}`));
    }
  });
});

test('counts are the mines around each cell', () => {
  const { game } = parse(['*..', '.*.', '...']);
  eq(game.counts.join(''), '121211111', 'counts');
});

test('opening a 0 spreads until the numbers', () => {
  const { game } = parse(['....', '....', '....', '...*']);
  const after = M.reveal(game, [0]);
  eq(after.open.filter(Boolean).length, 15, 'all but the mine');
  assert(!after.open[15], 'mine stays shut');
  assert(!M.isLost(after), 'not lost');
  assert(M.isWon(after), 'won');
});

test('a spread stops at flags', () => {
  const { game } = parse(['....', '....', '....', '...*']);
  const after = M.reveal(M.toggleFlag(game, 1), [0]);
  assert(!after.open[1], 'flagged cell stays shut');
  assert(!M.isWon(after), 'not won with a cell shut');
});

test('opening a number opens only it', () => {
  const { game } = parse(['*..', '...', '...']);
  const after = M.reveal(game, [1]);
  eq(after.open.filter(Boolean).length, 1, 'one cell');
});

test('opening a mine loses', () => {
  const { game } = parse(['*..', '...', '...']);
  assert(M.isLost(M.reveal(game, [0])), 'lost');
});

test('a tap opens a shut cell, but not a flagged one', () => {
  const { game } = parse(['*..', '...', '...']);
  eq(M.toOpen(game, 4).join(), '4', 'shut');
  eq(M.toOpen(M.toggleFlag(game, 4), 4).join(), '', 'flagged');
});

test('a tap on a number with its mines flagged opens the cells around it', () => {
  let { game } = parse(['*..', '...', '...']);
  game = M.reveal(game, [4]);
  eq(M.toOpen(game, 4).join(), '', 'without flags');
  game = M.toggleFlag(game, 0);
  eq(M.toOpen(game, 4).join(), '1,2,3,5,6,7,8', 'with the flag');
  game = M.toggleFlag(game, 1);
  eq(M.toOpen(game, 4).join(), '', 'too many flags');
});

test('flags go on shut cells only, and count down the mines left', () => {
  let { level, game } = parse(['*..', '...', '...']);
  game = M.reveal(game, [4]);
  eq(M.toggleFlag(game, 4), game, 'open cell');
  game = M.toggleFlag(game, 0);
  eq(M.minesLeft(game, level), 0, 'one flag');
  game = M.toggleFlag(game, 0);
  eq(M.minesLeft(game, level), 1, 'flag removed');
});

test('a fresh game is neither won nor lost', () => {
  const game = M.newGame(M.LEVELS[0]);
  assert(!M.isWon(game), 'won');
  assert(!M.isLost(game), 'lost');
});

test('times show as m:ss', () => {
  eq(M.formatTime(0), '0:00', 'zero');
  eq(M.formatTime(75), '1:15', 'minute');
  eq(M.formatTime(3600), '60:00', 'hour');
});

test('progress survives a save, and bad saves are rejected', () => {
  eq(M.deserialize(M.serialize({ best: { Easy: 42 } })).best.Easy, 42, 'best');
  eq(Object.keys(M.deserialize(M.serialize({ best: {} })).best).length, 0, 'no best yet');
  eq(M.deserialize(null), null, 'null');
  eq(M.deserialize('not json'), null, 'garbage');
  eq(M.deserialize(JSON.stringify({ version: 2, best: {} })), null, 'other version');
  eq(M.deserialize(JSON.stringify({ version: 1, best: { Easy: 2.5 } })), null, 'fractional best');
  eq(M.deserialize(JSON.stringify({ version: 1, best: { Huge: 5 } })), null, 'unknown level');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
