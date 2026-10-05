import B from './bubbles.mjs';

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

/* A board from strings of COLS characters, one per row from the top: '.' is
 * empty, a digit a bubble of that colour. The rows left over are empty. */
function parse(rows, shift = 0, top = 0) {
  const cells = Array.from({ length: B.ROWS }, (_, r) => {
    const row = rows[r] || '.'.repeat(B.COLS);
    return row.split('').map((ch) => (ch === '.' ? null : Number(ch)));
  });
  return { cells, shift, top };
}

function cells(list) {
  return list.map(([r, c]) => `${r},${c}`).sort().join(' ');
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i * 7919 + 1);

test('neighbours follow the row offset', () => {
  const board = parse([]);
  eq(cells(B.neighbours(board, 2, 3)), cells([[2, 2], [2, 4], [1, 2], [1, 3], [3, 2], [3, 3]]), 'unshifted row');
  eq(cells(B.neighbours(board, 3, 3)), cells([[3, 2], [3, 4], [2, 3], [2, 4], [4, 3], [4, 4]]), 'shifted row');
  eq(cells(B.neighbours({ ...board, shift: 1 }, 2, 3)), cells([[2, 2], [2, 4], [1, 3], [1, 4], [3, 3], [3, 4]]), 'shift flips it');
  eq(cells(B.neighbours(board, 0, 0)), cells([[0, 1], [1, 0]]), 'top-left corner');
  eq(cells(B.neighbours({ ...board, top: 2 }, 2, 3)), cells([[2, 2], [2, 4], [3, 2], [3, 3]]), 'nothing above the ceiling');
});

test('neighbours are exactly the cells one bubble away', () => {
  for (const shift of [0, 1]) {
    const board = parse([], shift);
    for (let r = 0; r < B.ROWS; r++) {
      for (let c = 0; c < B.COLS; c++) {
        const p = B.centre(board, r, c);
        const near = [];
        for (let r2 = 0; r2 < B.ROWS; r2++) {
          for (let c2 = 0; c2 < B.COLS; c2++) {
            const q = B.centre(board, r2, c2);
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d > 0.01 && d < 1.01) near.push([r2, c2]);
          }
        }
        eq(cells(B.neighbours(board, r, c)), cells(near), `(${r}, ${c}) shift ${shift}`);
      }
    }
  }
});

test('three of a colour pop, two do not', () => {
  const board = parse(['11222333']);
  const two = B.place(board, [1, 0], 0);
  eq(two.popped.length, 0, 'a pair stays');
  eq(two.board.cells[1][0], 0, 'and the bubble sticks');
  const three = B.place(board, [1, 1], 1);
  eq(cells(three.popped), cells([[0, 0], [0, 1], [1, 1]]), 'three pop');
  eq(three.board.cells[0][0], null, 'and are gone');
  eq(board.cells[0][0], 1, 'place leaves the board alone');
});

test('a pop drops what it held up', () => {
  const pop = B.place(parse(['0.111111', '0.......', '3.......', '4.......']), [1, 1], 0);
  eq(cells(pop.popped), cells([[0, 0], [1, 0], [1, 1]]), 'the zeros pop');
  eq(cells(pop.dropped), cells([[2, 0], [3, 0]]), 'what hung from them drops');
  eq(B.occupied(pop.board).length, 6, 'the rest stays');
  eq(B.floating(pop.board).length, 0, 'nothing floats after');
});

test('a shot straight up lands in the right column', () => {
  const board = parse(['11111111']);
  const shot = B.trace(board, Math.PI / 2);
  eq(shot.path.length, 2, 'no bounces');
  eq(shot.cell[0], 1, 'just under the top row');
  const p = B.centre(board, shot.cell[0], shot.cell[1]);
  assert(Math.abs(p.x - B.SHOOTER.x) <= 0.5, `under the shooter, at ${p.x}`);
});

test('a shot into an empty board sticks to the ceiling', () => {
  const shot = B.trace(parse([], 0, 3), Math.PI / 2);
  eq(shot.cell[0], 3, 'the ceiling row');
});

test('a flat shot bounces off the walls and stays inside', () => {
  const board = parse(['11111111']);
  for (const angle of [0.2, 0.5, Math.PI - 0.2, Math.PI - 0.5]) {
    const shot = B.trace(board, angle);
    assert(shot.path.length > 2, `bounces at ${angle}`);
    assert(shot.path.every((p) => p.x >= 0.5 && p.x <= B.WIDTH - 0.5), `inside at ${angle}`);
    eq(board.cells[shot.cell[0]][shot.cell[1]], null, `an empty cell at ${angle}`);
  }
});

test('every shot lands on an empty cell that touches a bubble', () => {
  for (const seed of seeds.slice(0, 30)) {
    const board = B.newBoard(B.rng(seed), 5, 'endless');
    for (let angle = 0.15; angle < Math.PI - 0.15; angle += 0.1) {
      const [r, c] = B.trace(board, angle).cell;
      eq(board.cells[r][c], null, `empty (seed ${seed}, angle ${angle})`);
      assert(r === 0 || B.neighbours(board, r, c).some(([r2, c2]) => board.cells[r2][c2] !== null), `touching (seed ${seed}, angle ${angle})`);
    }
  }
});

test('snap picks the nearest empty cell that sticks', () => {
  const board = parse(['11111111']);
  const p = B.centre(board, 1, 4);
  eq(cells([B.snap(board, p.x, p.y + 0.1)]), cells([[1, 4]]), 'under the row');
  eq(cells([B.snap(board, p.x, p.y + 3)]), cells([[1, 4]]), 'even from far below');
});

test('a pushed row goes on top and keeps every bubble with its neighbours', () => {
  const board = parse(['01234560', '1.......']);
  const pushed = B.pushRow(board, B.rng(1), 4);
  eq(pushed.cells.length, B.ROWS, 'still ROWS rows');
  assert(pushed.cells[0].every((colour) => colour >= 0 && colour < 4), 'a full new row');
  eq(pushed.cells[1].join(), board.cells[0].join(), 'the old top row moved down');
  eq(cells(B.neighbours(pushed, 2, 0).filter(([r, c]) => pushed.cells[r][c] !== null)),
    cells(B.neighbours(board, 1, 0).filter(([r, c]) => board.cells[r][c] !== null).map(([r, c]) => [r + 1, c])),
    'same neighbours as before');
});

test('the ceiling drops a row', () => {
  const board = parse(['01234560']);
  const lowered = B.lowerCeiling(board);
  eq(lowered.top, 1, 'top');
  eq(lowered.cells[1].join(), board.cells[0].join(), 'the bubbles moved down');
  eq(B.floating(lowered).length, 0, 'and still hang from it');
  const twice = B.lowerCeiling(lowered);
  eq(twice.top, 2, 'top again');
  eq(twice.cells[2].join(), board.cells[0].join(), 'moved down again');
});

test('the game is lost once a bubble is in the last row', () => {
  const rows = Array.from({ length: B.ROWS - 1 }, () => '1.......');
  assert(!B.isLost(parse(rows)), 'one row short');
  assert(B.isLost(B.pushRow(parse(rows), B.rng(1), 4)), 'pushed into the last row');
  assert(B.isLost(B.lowerCeiling(parse(rows))), 'lowered into the last row');
  assert(B.isCleared(parse([])), 'an empty board is cleared');
  assert(!B.isCleared(parse(['1'])), 'one bubble is not');
});

test('a new board has full rows of the colours in play and nothing floating', () => {
  for (const mode of B.MODES) {
    for (const colours of B.COLOURS) {
      for (const seed of seeds) {
        const board = B.newBoard(B.rng(seed), colours, mode);
        const where = `(${mode}, ${colours} colours, seed ${seed})`;
        eq(B.occupied(board).length, B.START_ROWS[mode] * B.COLS, `bubbles ${where}`);
        assert(B.occupied(board).every(([r, c]) => board.cells[r][c] >= 0 && board.cells[r][c] < colours), `colours ${where}`);
        eq(B.floating(board).length, 0, `floating ${where}`);
        assert(!B.isLost(board), `lost ${where}`);
      }
    }
  }
});

test('the next colour is one still on the board', () => {
  const board = parse(['2.5.....']);
  eq(B.coloursOn(board).join(), '2,5', 'colours on');
  for (const seed of seeds) {
    const colour = B.nextColour(board, B.rng(seed), 7);
    assert(colour === 2 || colour === 5, `seed ${seed} gave ${colour}`);
  }
  const empty = B.nextColour(parse([]), B.rng(1), 4);
  assert(empty >= 0 && empty < 4, 'any colour when the board is empty');
});

test('dropped bubbles score double', () => {
  eq(B.scoreFor([[0, 0], [0, 1], [0, 2]], []), 3 * B.POINTS, 'three popped');
  eq(B.scoreFor([[0, 0], [0, 1], [0, 2]], [[1, 0]]), 3 * B.POINTS + B.DROP, 'and one dropped');
});

test('progress survives a round trip and bad saves are rejected', () => {
  const key = B.bestKey('puzzle', 6);
  const progress = { best: { [key]: 14 }, mode: 'puzzle', colours: 7 };
  const back = B.deserialize(B.serialize(progress));
  eq(back.best[key], 14, 'best');
  eq(back.mode, 'puzzle', 'mode');
  eq(back.colours, 7, 'colours');
  const save = (changes) => JSON.stringify({ version: 1, best: {}, mode: 'endless', colours: 5, ...changes });
  assert(B.deserialize(save({})) !== null, 'a save with no bests yet');
  eq(B.deserialize(null), null, 'null');
  eq(B.deserialize('not json'), null, 'garbage');
  eq(B.deserialize(save({ version: 2 })), null, 'another version');
  eq(B.deserialize(save({ best: { [key]: 2.5 } })), null, 'fractional best');
  eq(B.deserialize(save({ best: { [key]: 0 } })), null, 'zero best');
  eq(B.deserialize(save({ best: { 'arcade/5': 10 } })), null, 'a mode that is not offered');
  eq(B.deserialize(save({ best: [] })), null, 'bests as a list');
  eq(B.deserialize(save({ mode: 'arcade' })), null, 'picked a mode that is not offered');
  eq(B.deserialize(save({ colours: 3 })), null, 'picked colours that are not offered');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
