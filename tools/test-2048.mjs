import G from './2048.mjs';

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

/* A board from SIZE rows of SIZE numbers each, 0 for empty. */
function parse(rows) {
  return rows.flat();
}

function show(board) {
  return Array.from({ length: G.SIZE }, (_, r) => board.slice(r * G.SIZE, (r + 1) * G.SIZE).join(' ')).join(' / ');
}

/* The first row after moving a board whose first row is row and is otherwise empty. */
function slideRow(row, direction = 'left') {
  const board = parse([row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const result = G.move(board, direction);
  return { row: result.board.slice(0, G.SIZE).join(' '), result };
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i * 7919 + 1);

test('tiles slide as far as they go', () => {
  eq(slideRow([0, 0, 0, 2]).row, '2 0 0 0', 'one tile');
  eq(slideRow([0, 2, 0, 4]).row, '2 4 0 0', 'two different tiles');
  eq(slideRow([2, 0, 4, 0], 'right').row, '0 0 2 4', 'to the right');
});

test('equal tiles that meet merge, once per move', () => {
  eq(slideRow([2, 0, 0, 2]).row, '4 0 0 0', 'across a gap');
  eq(slideRow([2, 2, 2, 2]).row, '4 4 0 0', 'two pairs');
  eq(slideRow([4, 4, 8, 0]).row, '8 8 0 0', 'a merged tile does not merge again');
  eq(slideRow([2, 2, 2, 0]).row, '4 2 0 0', 'the pair nearest the edge merges');
  eq(slideRow([2, 2, 2, 0], 'right').row, '0 0 2 4', 'and from the other side');
  eq(slideRow([2, 4, 2, 4]).row, '2 4 2 4', 'nothing to merge');
});

test('a merge scores the new tile', () => {
  eq(slideRow([2, 2, 4, 4]).result.score, 12, '4 + 8');
  eq(slideRow([2, 4, 8, 16]).result.score, 0, 'no merge');
});

test('a move reports where every tile went and what merged', () => {
  const { result } = slideRow([0, 2, 2, 4]);
  eq(result.slides.map((s) => `${s.from}>${s.to}`).join(' '), '1>0 2>0 3>1', 'slides');
  eq(result.merged.join(), '0', 'merged');
  assert(result.moved, 'moved');
  assert(!slideRow([2, 4, 0, 0]).result.moved, 'nothing moves when packed against the edge');
  assert(slideRow([2, 4, 0, 0], 'right').result.moved, 'but does the other way');
});

test('up and down move columns', () => {
  const board = parse([[2, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0]]);
  eq(show(G.move(board, 'up').board), show(parse([[4, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])), 'up');
  eq(show(G.move(board, 'down').board), show(parse([[0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]])), 'down');
  eq(board[0], 2, 'move leaves the board alone');
});

test('every move keeps the total and the tiles inside', () => {
  for (const seed of seeds) {
    const rand = G.rng(seed);
    let board = G.newBoard(rand);
    for (let turn = 0; turn < 200 && G.canMove(board); turn++) {
      const direction = G.DIRECTIONS[Math.floor(rand() * 4)];
      const result = G.move(board, direction);
      const sum = (b) => b.reduce((a, v) => a + v, 0);
      eq(sum(result.board), sum(board), `total (seed ${seed}, turn ${turn})`);
      eq(result.slides.length, board.filter((v) => v > 0).length, `a slide per tile (seed ${seed}, turn ${turn})`);
      if (result.moved) board = G.spawn(result.board, rand).board;
    }
  }
});

test('a new tile lands on an empty cell, mostly a 2', () => {
  const board = parse([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 0, 4], [4, 2, 4, 2]]);
  let fours = 0;
  for (const seed of seeds) {
    const added = G.spawn(board, G.rng(seed));
    eq(added.cell, 10, `the empty cell (seed ${seed})`);
    assert(added.board[10] === 2 || added.board[10] === 4, `a 2 or 4 (seed ${seed})`);
    if (added.board[10] === 4) fours++;
  }
  assert(fours > 0 && fours < seeds.length / 4, `some fours, not many: ${fours}`);
  eq(G.spawn(G.spawn(board, G.rng(1)).board, G.rng(1)).cell, -1, 'nowhere when full');
});

test('a new board has two tiles', () => {
  for (const seed of seeds) {
    const board = G.newBoard(G.rng(seed));
    eq(board.filter((v) => v > 0).length, 2, `seed ${seed}`);
  }
});

test('the game ends when nothing can move, and is won at WIN', () => {
  assert(!G.canMove(parse([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])), 'full, nothing to merge');
  assert(G.canMove(parse([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]])), 'full, one pair');
  assert(G.canMove(parse([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]])), 'one empty cell');
  assert(!G.hasWon(parse([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])), 'not yet');
  assert(G.hasWon(G.move(parse([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left').board), 'won');
});

test('progress survives a round trip and bad saves are rejected', () => {
  const game = { board: parse([[2, 0, 0, 0], [0, 4, 0, 0], [0, 0, 2048, 0], [0, 0, 0, 8]]), score: 20480, won: true };
  const back = G.deserialize(G.serialize({ best: 30000, game }));
  eq(back.best, 30000, 'best');
  eq(show(back.game.board), show(game.board), 'board');
  eq(back.game.score, 20480, 'score');
  eq(back.game.won, true, 'won');
  eq(G.deserialize(G.serialize({ best: 0, game: null })).game, null, 'no game under way');
  const save = (changes) => JSON.stringify({ version: 1, best: 0, game: { ...game, ...changes } });
  eq(G.deserialize(null), null, 'null');
  eq(G.deserialize('not json'), null, 'garbage');
  eq(G.deserialize(JSON.stringify({ version: 2, best: 0, game: null })), null, 'another version');
  eq(G.deserialize(JSON.stringify({ version: 1, best: -1, game: null })), null, 'negative best');
  eq(G.deserialize(save({ board: [2, 4] })), null, 'too few cells');
  eq(G.deserialize(save({ board: game.board.map((v, i) => (i === 0 ? 3 : v)) })), null, 'not a power of two');
  eq(G.deserialize(save({ board: game.board.map((v, i) => (i === 0 ? 1 : v)) })), null, 'a 1');
  eq(G.deserialize(save({ score: 1.5 })), null, 'fractional score');
  eq(G.deserialize(save({ won: 'yes' })), null, 'won as text');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
