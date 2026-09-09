import S from './suguru.mjs';

const { CELLS, MAXD, DIFFICULTIES, SINGLES_ONLY, KING, ORTH, bit } = S;
const SAMPLES = Number(process.env.SAMPLES || 20);

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

function connected(cells) {
  const set = new Set(cells);
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    for (const j of ORTH[queue.pop()]) {
      if (set.has(j) && !seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

const puzzles = {};
for (const key of Object.keys(DIFFICULTIES)) {
  puzzles[key] = Array.from({ length: SAMPLES }, () => S.generate(key));
}
const every = Object.entries(puzzles).flatMap(([key, list]) => list.map((p) => [key, p]));

console.log(`suguru — ${SAMPLES} puzzles per difficulty\n`);

test('every cell belongs to a region of 1..5 orthogonally connected cells', () => {
  for (const [, p] of every) {
    const layout = S.buildLayout(p.regions);
    eq(layout.regionCells.flat().length, CELLS, 'cells covered');
    for (const cells of layout.regionCells) {
      assert(cells.length >= 1 && cells.length <= MAXD, `region size ${cells.length}`);
      assert(connected(cells), `region ${cells} is not connected`);
    }
  }
});

test('each solution holds 1..n per region and no touching duplicates', () => {
  for (const [, p] of every) {
    const layout = S.buildLayout(p.regions);
    layout.regionCells.forEach((cells, rid) => {
      const digits = cells.map((i) => p.solution[i]).sort();
      const wanted = cells.map((_, k) => k + 1);
      eq(digits.join(''), wanted.join(''), `region ${rid} digits`);
    });
    for (let i = 0; i < CELLS; i++) {
      for (const j of KING[i]) {
        assert(p.solution[i] !== p.solution[j], `touching duplicate at ${i}/${j}`);
      }
    }
    eq(S.conflicts(layout, p.solution).length, 0, 'conflicts in solution');
  }
});

test('givens are a subset of the solution', () => {
  for (const [, p] of every) {
    for (let i = 0; i < CELLS; i++) {
      assert(p.givens[i] === 0 || p.givens[i] === p.solution[i], `given ${i} disagrees`);
    }
    assert(p.givens.some((v) => v === 0), 'puzzle has no empty cells');
  }
});

test('each puzzle is solvable by its own technique set, reaching the solution', () => {
  for (const [key, p] of every) {
    const layout = S.buildLayout(p.regions);
    const result = S.solveLogically(layout, p.givens, DIFFICULTIES[key]);
    assert(result.solved, `${key} puzzle not solvable by logic`);
    eq(result.values.join(''), p.solution.join(''), `${key} logic solution`);
  }
});

test('each puzzle has exactly one solution', () => {
  for (const [key, p] of every) {
    const layout = S.buildLayout(p.regions);
    eq(S.searchSolutions(layout, p.givens, 2).length, 1, `${key} solution count`);
  }
});

test('hard puzzles cannot be finished with singles alone', () => {
  for (const p of puzzles.hard) {
    const layout = S.buildLayout(p.regions);
    assert(!S.solveLogically(layout, p.givens, SINGLES_ONLY).solved, 'hard puzzle was singles-only');
  }
});

test('easy puzzles keep their clue floor', () => {
  for (const p of puzzles.easy) {
    assert(p.givens.filter((v) => v).length >= DIFFICULTIES.easy.minGivens, 'too few givens');
  }
});

test('every hint along a full solve names a cell whose digit is the solution', () => {
  for (const [key, p] of every) {
    const layout = S.buildLayout(p.regions);
    const board = p.givens.slice();
    let steps = 0;
    while (board.some((v) => !v)) {
      const step = S.nextPlacement(layout, board, DIFFICULTIES[key]);
      assert(step, `${key} ran out of hints with ${board.filter((v) => !v).length} cells left`);
      eq(step.digit, p.solution[step.idx], `hint at cell ${step.idx}`);
      assert(!board[step.idx], 'hint pointed at a filled cell');
      board[step.idx] = step.digit;
      steps++;
    }
    assert(steps > 0, 'no hints needed');
  }
});

test('hints stay sound when the player has filled cells out of order', () => {
  for (const [key, p] of every) {
    const layout = S.buildLayout(p.regions);
    for (let trial = 0; trial < 5; trial++) {
      const board = p.givens.slice();
      for (let i = 0; i < CELLS; i++) {
        if (!board[i] && Math.random() < 0.4) board[i] = p.solution[i];
      }
      if (!board.some((v) => !v)) continue;
      const step = S.nextPlacement(layout, board, DIFFICULTIES[key]);
      if (!step) continue;
      eq(step.digit, p.solution[step.idx], `hint at cell ${step.idx}`);
    }
  }
});

test('a digit press cycles value -> black note -> red note -> value -> empty', () => {
  const red = S.redBit;
  let cell = { value: 0, notes: 0 };
  cell = S.applyDigit(cell, 4);
  eq(cell.value, 4, 'press 1 fills the cell');
  eq(cell.notes, 0, 'press 1 leaves no note');
  cell = S.applyDigit(cell, 4);
  eq(cell.value, 0, 'press 2 empties the value');
  eq(cell.notes, bit(4), 'press 2 leaves a black note');
  cell = S.applyDigit(cell, 4);
  eq(cell.value, 0, 'press 3 keeps the cell empty');
  eq(cell.notes, bit(4) | red(4), 'press 3 turns the note red');
  cell = S.applyDigit(cell, 4);
  eq(cell.value, 4, 'press 4 fills the cell again');
  cell = S.applyDigit(cell, 4);
  eq(cell.value, 0, 'press 5 clears the cell');
  eq(cell.notes, 0, 'press 5 takes the note with it');

  /* Once a cell is in note mode, further digits note themselves on one press. */
  cell = { value: 0, notes: 0 };
  cell = S.applyDigit(cell, 2);
  cell = S.applyDigit(cell, 2);
  eq(cell.notes, bit(2), 'two presses open the notes');
  cell = S.applyDigit(cell, 3);
  eq(cell.value, 0, 'a further digit does not fill the cell');
  eq(cell.notes, bit(2) | bit(3), 'a further digit notes itself at once, in black');

  /* Reddening a note among others would leave the cell two-coloured, so a
   * black note pressed among others promotes instead. */
  cell = S.applyDigit(cell, 2);
  eq(cell.value, 2, 'a black note among others promotes rather than reddening');
  eq(cell.notes, bit(2) | bit(3), 'the notes are untouched underneath');
  cell = S.applyDigit(cell, 2);
  eq(cell.value, 0, 'pressing it again clears that digit');
  eq(cell.notes, bit(3), 'and the rest come back in the colour they had');

  /* Red is reached through a lone note, and the rest inherit it. */
  cell = { value: 0, notes: bit(3) };
  cell = S.applyDigit(cell, 3);
  eq(cell.notes, bit(3) | red(3), 'a lone black note still turns red');
  cell = S.applyDigit(cell, 5);
  eq(cell.notes, bit(3) | red(3) | bit(5) | red(5), 'a note added to a red cell is red');
  cell = S.applyDigit(cell, 3);
  eq(cell.value, 3, 'a red note among others promotes too');
  cell = S.applyDigit(cell, 3);
  eq(cell.value, 0, 'and clears on the press after that');
  eq(cell.notes, bit(5) | red(5), 'leaving the rest red, as they were');

  cell = { value: 4, notes: 0 };
  cell = S.applyDigit(cell, 3);
  eq(cell.value, 3, 'a filled cell takes a new digit as its value');
});

test('a cell never ends up holding notes of two colours', () => {
  let cell = { value: 0, notes: 0 };
  for (let press = 0; press < 20000; press++) {
    cell = S.applyDigit(cell, 1 + Math.floor(Math.random() * MAXD));
    let black = 0;
    let scarlet = 0;
    for (let d = 1; d <= MAXD; d++) {
      if (!(cell.notes & bit(d))) continue;
      if (cell.notes & S.redBit(d)) scarlet++;
      else black++;
    }
    assert(black === 0 || scarlet === 0, `mixed notes after ${press} presses: ${cell.notes}`);
  }
});

test('conflicts flag both region and touching duplicates', () => {
  const p = puzzles.medium[0];
  const layout = S.buildLayout(p.regions);
  eq(S.conflicts(layout, p.solution).length, 0, 'clean solution');

  const region = layout.regionCells.find((cells) => cells.length >= 2);
  const board = p.solution.slice();
  board[region[1]] = p.solution[region[0]];
  const bad = S.conflicts(layout, board);
  assert(bad.includes(region[0]) && bad.includes(region[1]), 'duplicate in region not flagged');

  const board2 = p.solution.slice();
  let i = -1;
  let j = -1;
  for (let c = 0; c < CELLS && j < 0; c++) {
    const other = KING[c].find((x) => layout.regions[x] !== layout.regions[c]);
    if (other !== undefined) {
      i = c;
      j = other;
    }
  }
  board2[j] = board2[i];
  const touching = S.conflicts(layout, board2);
  assert(touching.includes(i) && touching.includes(j), 'touching duplicate not flagged');
});

test('state survives a save/load round trip', () => {
  const p = puzzles.easy[0];
  const state = S.freshState(p);
  eq(state.values.join(''), p.givens.join(''), 'fresh board starts from the givens');
  const free = state.values.indexOf(0);
  state.values[free] = 3;
  state.notes[free] = bit(1) | bit(5) | S.redBit(5);
  state.selected = free;
  state.undo.push([{ idx: free, value: 0, notes: 0 }]);

  const back = S.deserialize(S.serialize(p, state));
  assert(back, 'round trip returned null');
  eq(back.puzzle.regions.join(''), p.regions.join(''), 'regions');
  eq(back.puzzle.solution.join(''), p.solution.join(''), 'solution');
  eq(back.state.values.join(''), state.values.join(''), 'values');
  eq(back.state.notes.join(''), state.notes.join(''), 'notes');
  eq(back.state.selected, free, 'selection');
  eq(JSON.stringify(back.state.undo), JSON.stringify(state.undo), 'undo stack');
});

test('corrupt or foreign saved state is rejected rather than loaded', () => {
  const p = puzzles.easy[0];
  const good = S.serialize(p, S.freshState(p));
  eq(S.deserialize(null), null, 'null');
  eq(S.deserialize('not json'), null, 'garbage');
  eq(S.deserialize(JSON.stringify({ version: 2, puzzle: p, state: S.freshState(p) })), null, 'other version');

  const short = JSON.parse(good);
  short.state.values.pop();
  eq(S.deserialize(JSON.stringify(short)), null, 'wrong length');

  const tampered = JSON.parse(good);
  const givenIdx = p.givens.findIndex((v) => v > 0);
  tampered.state.values[givenIdx] = 0;
  eq(S.deserialize(JSON.stringify(tampered)), null, 'state that erased a given');

  const outOfRange = JSON.parse(good);
  outOfRange.state.values[p.givens.indexOf(0)] = 9;
  eq(S.deserialize(JSON.stringify(outOfRange)), null, 'digit out of range');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
