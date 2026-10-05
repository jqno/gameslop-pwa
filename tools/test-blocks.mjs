import B from './blocks.mjs';

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

/* A board from 8 strings of 8 characters, one per row: '.' empty, a digit a block. */
function parse(rows) {
  return rows.join('').split('').map((ch) => {
    if (ch === '.') return 0;
    return Number(ch);
  });
}

function at(row, col) {
  return row * B.SIZE + col;
}

function piece(shape) {
  return B.PIECES[B.SHAPES.indexOf(shape)];
}

test('every piece is connected, starts at the top left, and is listed once', () => {
  eq(new Set(B.SHAPES).size, B.SHAPES.length, 'distinct shapes');
  B.PIECES.forEach((cells, k) => {
    const where = `(${B.SHAPES[k]})`;
    assert(cells.length >= 1 && cells.length <= 9, `size ${where}`);
    eq(Math.min(...cells.map(([r]) => r)), 0, `top row ${where}`);
    eq(Math.min(...cells.map(([, c]) => c)), 0, `left column ${where}`);
    const seen = new Set(['0,' + cells.find(([r]) => r === 0)[1]]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [r, c] of cells) {
        const near = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([nr, nc]) => seen.has(nr + ',' + nc));
        if (!seen.has(r + ',' + c) && near) {
          seen.add(r + ',' + c);
          grew = true;
        }
      }
    }
    eq(seen.size, cells.length, `connected ${where}`);
  });
});

test('extent spans the piece', () => {
  const size = B.extent(piece('xxx/x..'));
  eq(size.rows, 2, 'rows');
  eq(size.cols, 3, 'cols');
});

test('a piece fits only on empty cells inside the board', () => {
  const board = B.emptyBoard();
  board[at(1, 1)] = 3;
  const square = piece('xx/xx');
  assert(B.fits(board, square, 2, 2), 'in the open');
  assert(B.fits(board, square, 6, 6), 'in the corner');
  assert(!B.fits(board, square, 0, 0), 'on a block');
  assert(!B.fits(board, square, 7, 0), 'off the bottom');
  assert(!B.fits(board, square, 0, 7), 'off the right');
  assert(!B.fits(board, square, -1, 3), 'off the top');
});

test('placing without filling a line clears nothing', () => {
  const result = B.play(B.emptyBoard(), piece('xxx'), 4, 2, 5);
  eq(result.lines.length, 0, 'lines');
  eq(result.cleared.length, 0, 'cleared');
  eq(result.board.filter((v) => v === 5).length, 3, 'cells placed');
  eq(result.board[at(4, 4)], 5, 'last cell');
});

test('filling a row clears it', () => {
  const board = parse([
    '........', '........', '........', '1111.111',
    '2.......', '........', '........', '........'
  ]);
  const result = B.play(board, piece('x/x'), 3, 4, 6);
  eq(result.lines.length, 1, 'lines');
  eq(result.cleared.join(), Array.from({ length: 8 }, (_, c) => at(3, c)).join(), 'cleared');
  eq(result.placed[at(4, 4)], 6, 'the lower cell is placed');
  eq(result.board[at(4, 4)], 6, 'and stays');
  eq(result.board[at(4, 0)], 2, 'other blocks stay');
  eq(result.board.filter((v) => v !== 0).length, 2, 'what is left');
});

test('filling a row and a column at once counts their shared cell once', () => {
  const board = parse([
    '......1.', '......1.', '......1.', '111111.1',
    '......1.', '......1.', '......1.', '......1.'
  ]);
  const result = B.play(board, piece('x'), 3, 6, 2);
  eq(result.lines.length, 2, 'a row and a column');
  eq(result.cleared.length, 15, 'cleared cells');
  assert(result.board.every((v) => v === 0), 'board is empty after');
});

test('scoring counts cells, lines and streak', () => {
  eq(B.scoreFor(4, 0, 0), 4, 'no lines');
  eq(B.scoreFor(3, 1, 1), 13, 'one line');
  eq(B.scoreFor(3, 2, 1), 33, 'two lines');
  eq(B.scoreFor(1, 3, 1), 61, 'three lines');
  eq(B.scoreFor(2, 1, 3), 32, 'one line on a streak of three');
});

test('canPlaceAny is false when nothing fits', () => {
  /* A checkerboard leaves only single cells free. */
  const board = B.emptyBoard().map((_, i) => (Math.floor(i / B.SIZE) + i) % 2);
  assert(!B.canPlaceAny(board, [piece('xx'), piece('x/x'), piece('xx/xx')]), 'no room');
  assert(B.canPlaceAny(board, [piece('xx'), piece('x')]), 'a single cell fits');
  assert(!B.canPlaceAny(board, []), 'no pieces left');
});

test('a tray holds TRAY pieces of valid shape and colour', () => {
  const rand = B.rng(42);
  for (let k = 0; k < 200; k++) {
    const tray = B.dealTray(rand);
    eq(tray.length, B.TRAY, 'size');
    tray.forEach((p) => {
      assert(Number.isInteger(p.shape) && p.shape >= 0 && p.shape < B.PIECES.length, `shape ${p.shape}`);
      assert(Number.isInteger(p.colour) && p.colour >= 1 && p.colour <= B.COLOURS, `colour ${p.colour}`);
    });
  }
});

test('progress survives a save, and bad saves are rejected', () => {
  eq(B.deserialize(B.serialize({ best: 1234 })).best, 1234, 'best');
  eq(B.deserialize(B.serialize({ best: 0 })).best, 0, 'no best yet');
  eq(B.deserialize(null), null, 'null');
  eq(B.deserialize('not json'), null, 'garbage');
  eq(B.deserialize(JSON.stringify({ version: 2, best: 5 })), null, 'other version');
  eq(B.deserialize(JSON.stringify({ version: 1, best: 2.5 })), null, 'fractional best');
  eq(B.deserialize(JSON.stringify({ version: 1, best: -1 })), null, 'negative best');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
