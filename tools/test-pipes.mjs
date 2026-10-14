import P from './pipes.mjs';

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

function isContinuous(size, path) {
  return path.slice(1).every((cell, k) => P.neighbours(size, path[k]).includes(cell));
}

/* A 3x3 game with two pipes: 0 from cell 0 to 6, 1 from cell 2 to 7.
 *   0 . 1
 *   . . .
 *   0 1 .   */
function small() {
  return P.newGame({ size: 3, ends: [[0, 6], [2, 7]] });
}

function draw(game, k, cells) {
  return cells.reduce((g, cell) => P.extend(g, k, cell), P.pickUp(game, cells[0]).game);
}

/* Every way to connect the pairs, pipes being any non-crossing paths and
 * cells allowed to stay empty, by brute force: returns how many there are,
 * and how many leave a cell empty. Only for small grids. */
function bruteForce(size, ends) {
  const endOf = new Map();
  ends.forEach((pair, k) => pair.forEach((cell) => endOf.set(cell, k)));
  const routes = ends.map(([from, to]) => {
    const out = [];
    const seen = new Set([from]);
    (function walk(cell, path) {
      if (cell === to) {
        out.push(path.slice());
        return;
      }
      for (const n of P.neighbours(size, cell)) {
        if (seen.has(n) || (endOf.has(n) && n !== to)) continue;
        seen.add(n);
        path.push(n);
        walk(n, path);
        path.pop();
        seen.delete(n);
      }
    })(from, [from]);
    return out;
  });
  let ways = 0;
  let holes = 0;
  const used = new Set();
  (function pick(k, filled) {
    if (k === ends.length) {
      ways++;
      if (filled < size * size) holes++;
      return;
    }
    for (const route of routes[k]) {
      if (route.some((cell) => used.has(cell))) continue;
      route.forEach((cell) => used.add(cell));
      pick(k + 1, filled + route.length);
      route.forEach((cell) => used.delete(cell));
    }
  })(0, 0);
  return { ways, holes };
}

test('levels grow by two from 6x6', () => {
  eq(P.LEVELS.map((l) => l.size).join(), '6,8,10', 'sizes');
});

test('neighbours stay on the grid and never go diagonal', () => {
  eq(P.neighbours(3, 4).join(), '1,3,5,7', 'middle');
  eq(P.neighbours(3, 0).join(), '1,3', 'corner');
  eq(P.neighbours(3, 5).join(), '2,4,8', 'edge');
});

test('a tight pipe never touches itself', () => {
  assert(P.isTight(3, [0, 1, 2, 5]), 'L shape');
  assert(!P.isTight(3, [0, 1, 4, 3]), 'U shape: 0 touches 3');
});

test('tiles cover the grid with tight pipes of at least three cells', () => {
  const rand = P.rng(3);
  P.LEVELS.forEach((level) => {
    for (let k = 0; k < 20; k++) {
      const pipes = P.tile(level.size, Math.round(level.size * 1.4), rand);
      if (pipes === null) continue;
      eq(new Set(pipes.flat()).size, level.size * level.size, 'cells covered');
      eq(pipes.flat().length, level.size * level.size, 'no overlap');
      pipes.forEach((pipe) => {
        assert(pipe.length >= P.MIN_PIPE, 'long enough');
        assert(isContinuous(level.size, pipe), 'continuous');
        assert(P.isTight(level.size, pipe), 'tight');
      });
    }
  });
});

test('pairs that can be joined leaving cells empty do not need every cell', () => {
  /* 0 . . .   Pipe 0 can go 11-10-6, leaving 14 and 15 empty,
   * . . 0 1   or the long way round 11-15-14-10-6.
   * 2 . . 0
   * 2 1 . .   */
  assert(!P.needsEveryCell(4, [[11, 6], [7, 13], [12, 0]]), 'holes possible');
});

test('the solver agrees with brute force on small grids', () => {
  const rand = P.rng(99);
  let yes = 0;
  let no = 0;
  for (let k = 0; k < 300; k++) {
    const size = 4 + (k % 2);
    const pipes = P.tile(size, 3 + (k % 4), rand);
    if (pipes === null) continue;
    const ends = pipes.map((p) => [p[0], p[p.length - 1]]);
    /* The same ends with two pipes trading partners: mostly puzzles that
     * can not be solved, or not in only one way. */
    const swapped = [[ends[0][0], ends[1][1]], [ends[1][0], ends[0][1]], ...ends.slice(2)];
    for (const tried of [ends, swapped]) {
      const brute = bruteForce(size, tried);
      const expected = brute.ways === 1 && brute.holes === 0;
      eq(P.needsEveryCell(size, tried), expected, `size ${size}, ends ${JSON.stringify(tried)}`);
      if (expected) {
        yes++;
      } else {
        no++;
      }
    }
  }
  assert(yes > 20 && no > 20, `both kinds tested: ${yes} yes, ${no} no`);
});

test('every generated puzzle is solved by its solution, and needs every cell', () => {
  const rand = P.rng(7);
  P.LEVELS.forEach((level) => {
    for (let k = 0; k < 20; k++) {
      const puzzle = P.generate(level, rand);
      const n = level.size;
      assert(puzzle.ends.length <= P.COLOURS.length, 'enough colours');
      assert(P.needsEveryCell(n, puzzle.ends), 'needs every cell');
      puzzle.solution.forEach((pipe, i) => {
        eq(pipe[0], puzzle.ends[i][0], 'starts at an end');
        eq(pipe[pipe.length - 1], puzzle.ends[i][1], 'stops at the other');
      });
      const solved = puzzle.solution.reduce((g, pipe, i) => draw(g, i, pipe), P.newGame(puzzle));
      assert(P.isSolved(solved), `${level.name} solvable by drawing`);
    }
  });
});

test('towards steps along the longer way', () => {
  eq(P.towards(5, 0, 24), 5, 'tie goes down');
  eq(P.towards(5, 0, 3), 1, 'right');
  eq(P.towards(5, 12, 2), 7, 'up');
});

test('a pipe is drawn from its end through neighbouring cells', () => {
  let game = draw(small(), 0, [0, 3]);
  eq(game.paths[0].join(), '0,3', 'path');
  eq(P.extend(game, 0, 5), game, 'not beside the last cell');
  game = P.extend(game, 0, 6);
  assert(P.isConnected(game, 0), 'connected');
  eq(P.extend(game, 0, 7), game, 'stops at its other end');
});

test('a pipe may not run onto another pipe\'s end', () => {
  const game = draw(small(), 0, [0, 1]);
  eq(P.extend(game, 0, 2), game, 'other end');
});

test('going back over a pipe cuts it back', () => {
  const game = draw(small(), 0, [0, 3, 4, 5]);
  eq(P.extend(game, 0, 3).paths[0].join(), '0,3', 'back to 3');
});

test('running into another pipe cuts that one short', () => {
  let game = draw(small(), 1, [2, 5, 4, 3]);
  game = P.extend(P.pickUp(game, 0).game, 0, 1);
  game = P.extend(game, 0, 4);
  eq(game.paths[0].join(), '0,1,4', 'drawn');
  eq(game.paths[1].join(), '2,5', 'cut');
});

test('picking up a pipe in the middle cuts it there, and an end starts afresh', () => {
  const game = draw(small(), 0, [0, 3, 4]);
  eq(P.pickUp(game, 3).game.paths[0].join(), '0,3', 'middle');
  eq(P.pickUp(game, 6).game.paths[0].join(), '6', 'other end');
  eq(P.pickUp(game, 8), null, 'empty cell');
});

test('a swipe that skips cells draws through them', () => {
  const game = P.drawTo(P.pickUp(small(), 0).game, 0, 6);
  eq(game.paths[0].join(), '0,3,6', 'drawn');
  const blocked = P.drawTo(P.pickUp(small(), 2).game, 1, 0);
  eq(blocked.paths[1].join(), '2,1', 'stops before the other end');
});

test('connected pipes are not enough: every cell must be filled', () => {
  let game = draw(small(), 0, [0, 3, 6]);
  game = draw(game, 1, [2, 5, 8, 7]);
  eq(P.connectedCount(game), 2, 'both connected');
  assert(!P.isSolved(game), 'cells 1 and 4 empty');
  game = draw(game, 0, [0, 1, 4, 3, 6]);
  assert(P.isSolved(game), 'solved');
  eq(P.filled(game), 9, 'filled');
});

test('the level survives a save, and bad saves are rejected', () => {
  eq(P.deserialize(P.serialize(P.LEVELS[2])), P.LEVELS[2], 'level');
  eq(P.deserialize(null), null, 'null');
  eq(P.deserialize('not json'), null, 'garbage');
  eq(P.deserialize(JSON.stringify({ version: 2, level: 'Easy' })), null, 'other version');
  eq(P.deserialize(JSON.stringify({ version: 1, level: 'Huge' })), null, 'unknown level');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
