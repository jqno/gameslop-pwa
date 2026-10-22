import G from './freecell.mjs';

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

/* A card from its usual name, such as 'TD' for the ten of diamonds. */
function card(name) {
  return 'A23456789TJQK'.indexOf(name[0]) * 4 + 'CDHS'.indexOf(name[1]);
}

function name(c) {
  return 'A23456789TJQK'[G.rankOf(c) - 1] + 'CDHS'[G.suitOf(c)];
}

/* A state from cascades as space-separated card names, the free cells (null
 * for empty) and the foundations, by suit. It need not hold the whole deck. */
function state(cascades, cells = [], home = [0, 0, 0, 0]) {
  const full = cascades.concat(Array(8 - cascades.length).fill('')).map((s) => s.split(' ').filter(Boolean).map(card));
  const filled = cells.concat(Array(4 - cells.length).fill(null)).map((c) => (c === null ? null : card(c)));
  return { cascades: full, cells: filled, home };
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i * 7919 + 1);

test('deal #1 matches the Microsoft deal', () => {
  const rows = [
    'JD 2D 9H JC 5D 7H 7C 5H',
    'KD KC 9S 5S AD QC KH 3H',
    '2S KS 9D QD JS AS AH 3C',
    '4C 5C TS QH 4H AC 4D 7S',
    '3S TD 4S TH 8H 2C JH 7D',
    '6D 8S 8D QS 6C 3D 8C TC',
    '6S 9C 2H 6H'
  ];
  const dealt = G.deal(1);
  rows.forEach((row, r) => {
    eq(row.split(' ').map((_, c) => name(dealt.cascades[c][r])).join(' '), row, `row ${r + 1}`);
  });
  eq(dealt.cascades.map((cards) => cards.length).join(), '7,7,7,7,6,6,6,6', 'cascade lengths');
});

test('every deal holds the whole deck', () => {
  seeds.forEach((seed) => {
    const number = (seed % G.DEALS) + 1;
    assert(G.isState(G.deal(number)), `deal ${number}`);
  });
});

test('random deals stay in range and skip the unsolvable one', () => {
  const rand = G.rng(5);
  for (let i = 0; i < 2000; i++) {
    const number = G.randomDeal(rand);
    assert(number >= 1 && number <= G.DEALS && number !== G.UNSOLVABLE, `deal ${number}`);
  }
  eq(G.randomDeal(() => 0), 1, 'lowest');
  eq(G.randomDeal(() => 0.99999999), G.DEALS, 'highest');
});

test('cards stack going down in alternating colours', () => {
  assert(G.fits(card('9H'), card('TS')), 'red on black');
  assert(G.fits(card('9C'), card('TD')), 'black on red');
  assert(!G.fits(card('9D'), card('TH')), 'red on red');
  assert(!G.fits(card('8S'), card('TH')), 'skipping a rank');
  assert(!G.fits(card('JS'), card('TH')), 'going up');
  assert(G.isRun([card('TS'), card('9H'), card('8C')]), 'a run');
  assert(!G.isRun([card('TS'), card('9H'), card('7C')]), 'a broken run');
});

test('a card goes to an empty free cell', () => {
  const s = state(['KS QH'], ['AC']);
  assert(G.canMove(s, 0, G.CELL + 1, 1), 'empty cell');
  assert(!G.canMove(s, 0, G.CELL, 1), 'taken cell');
  assert(!G.canMove(s, 0, G.CELL + 1, 2), 'two cards');
  const next = G.move(s, 0, G.CELL + 1, 1);
  eq(next.cells[1], card('QH'), 'in the cell');
  eq(next.cascades[0].length, 1, 'off the cascade');
  eq(s.cascades[0].length, 2, 'move leaves the old state alone');
});

test('a card goes home in order, by suit', () => {
  const s = state(['KS AH', '2H', '3H'], [], [0, 0, 0, 0]);
  assert(G.canMove(s, 0, G.HOME + 2, 1), 'ace');
  assert(!G.canMove(s, 0, G.HOME + 1, 1), 'wrong suit');
  assert(!G.canMove(s, 1, G.HOME + 2, 1), 'two before ace');
  const next = G.move(s, 0, G.HOME + 2, 1);
  eq(next.home[2], 1, 'ace home');
  assert(G.canMove(next, 1, G.HOME + 2, 1), 'then the two');
  assert(!G.canMove(next, G.HOME + 2, 0, 1), 'never back from home');
});

test('runs move as far as the free cells and empty cascades allow', () => {
  eq(G.capacity(state(['KS', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD']), 0), 5, 'four free cells');
  eq(G.capacity(state(['KS', '', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD'], ['AC', 'AD']), 0), 6, 'two cells and a cascade');
  eq(G.capacity(state(['KS', '', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD'], ['AC', 'AD']), 1), 3, 'to the empty cascade');
  const s = state(['TS 9H 8C 7D', 'JD', '9D', 'KD', 'QS', 'QH', 'QC', 'QD'], ['AC', 'AD', 'AH']);
  assert(G.canMove(s, 0, 2, 2), 'two with one free cell');
  assert(!G.canMove(s, 0, 1, 4), 'not four');
  const free = state(['TS 9H 8C 7D', 'JD', 'KC', 'KD', 'QS', 'QH', 'QC', 'QD']);
  assert(G.canMove(free, 0, 1, 4), 'four with four free cells');
  eq(G.move(free, 0, 1, 4).cascades[1].map(name).join(' '), 'JD TS 9H 8C 7D', 'moved in order');
  assert(!G.canMove(free, 0, 2, 1), 'must fit');
  assert(!G.canMove(state(['TS 9H 9C']), 0, 1, 3), 'must be a run');
});

test('a run moves one card at a time, through the free cells and empty cascades', () => {
  const s = state(['TS 9H 8C 7D', 'JD', '', 'KD', 'QS', 'QH', 'QC', 'QD'], ['AC', 'AD', 'AH']);
  const list = G.steps(s, 0, 1, 4);
  eq(list.length, 9, 'moves');
  let t = s;
  list.forEach(({ from, to }) => {
    assert(G.canMove(t, from, to, 1), `${from} to ${to}`);
    t = G.move(t, from, to, 1);
  });
  eq(JSON.stringify(t), JSON.stringify(G.move(s, 0, 1, 4)), 'ends where the move does');
  assert(list.some(({ to }) => to === 2), 'through the empty cascade');
});

test('a tap sends a card home, onto a card, to an empty cascade, then a cell', () => {
  eq(G.bestMove(state(['KS AH', 'TC']), 0, 1), G.HOME + 2, 'home');
  eq(G.bestMove(state(['KS 9H', 'TC']), 0, 1), 1, 'onto a card');
  eq(G.bestMove(state(['KS 9H', 'JC']), 0, 1), 2, 'an empty cascade');
  const full = state(['KS 9H', 'JC', 'KH', 'KC', 'KD', 'QS', 'QH', 'QC']);
  eq(G.bestMove(full, 0, 1), G.CELL, 'a free cell');
  eq(G.bestMove(state(['TC 9H'], ['8S']), G.CELL, 1), 0, 'out of a cell');
  eq(G.bestMove(state(['TC'], ['8S']), G.CELL, 1), 1, 'out of a cell to an empty cascade');
  eq(G.bestMove(state(['KS', 'JC'], ['8S', '8C', '8D', '8H']), 0, 1), -1, 'not a whole cascade to an empty one');
  eq(G.bestMove(state(['KS', 'KC', 'KD', 'KH', 'QS', 'QH', 'QC', 'QD'], ['8S', '8C', '8D', '8H']), 0, 1), -1, 'nowhere');
});

test('cards go home on their own only when nothing needs them', () => {
  assert(G.isSafe(state([]), card('2H')), 'twos');
  const s = state(['KS 3H'], [], [1, 0, 2, 1]);
  assert(!G.isSafe(s, card('3H')), 'the black twos might need it');
  eq(G.homeMove(s, true), null, 'so it stays');
  eq(G.homeMove(s, false).from, 0, 'unless asked');
  const t = state(['KS 3H'], [], [2, 0, 2, 2]);
  eq(G.homeMove(t, true).to, G.HOME + 2, 'safe once they are home');
});

test('a game finishes once every card can go home', () => {
  const sorted = state(['KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S AS', 'KH QH JH TH 9H 8H 7H 6H 5H 4H 3H 2H AH'], [], [13, 13, 0, 0]);
  assert(G.canFinish(sorted), 'sorted');
  assert(!G.canFinish(state(['AS KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S'], [], [13, 13, 13, 0])), 'ace buried');
  assert(G.isWon({ cascades: [[], [], [], [], [], [], [], []], cells: [null, null, null, null], home: [13, 13, 13, 13] }), 'won');
});

test('a game is stuck with no legal move, and loops when moves lead nowhere', () => {
  const full = ['2S 9S', '2C 9C', '2H 9H', '2D 9D', '3S KS', '3C KC', '3H KH', '3D KD'];
  eq(G.outlook(state(full, ['JS', 'JC', 'JH', 'JD'])), 'stuck', 'cells full');
  eq(G.outlook(state(full, ['JS', 'JC', 'JH'])), 'loop', 'one cell to shuffle through');
  eq(G.outlook(state(full, ['JS', 'JC', 'JH'], [1, 1, 1, 1])), 'open', 'a two can go home after a shuffle');
  eq(G.outlook(G.deal(1)), 'open', 'a fresh deal');
});

test('random play keeps every card in the game', () => {
  seeds.forEach((seed) => {
    const rand = G.rng(seed);
    let s = G.deal(G.randomDeal(rand));
    for (let step = 0; step < 200; step++) {
      const options = [];
      for (let from = 0; from < G.HOME; from++) {
        for (let to = 0; to < G.HOME + 4; to++) {
          for (let n = 1; n <= G.cardsOf(s, from).length; n++) {
            if (G.canMove(s, from, to, n)) options.push([from, to, n]);
          }
        }
      }
      if (options.length === 0) break;
      const [from, to, n] = options[Math.floor(rand() * options.length)];
      let t = s;
      G.steps(s, from, to, n).forEach((m) => {
        assert(G.canMove(t, m.from, m.to, 1), `seed ${seed} step ${step}: one card ${m.from} to ${m.to}`);
        t = G.move(t, m.from, m.to, 1);
      });
      s = G.move(s, from, to, n);
      eq(JSON.stringify(t), JSON.stringify(s), `seed ${seed} step ${step}: one at a time`);
      assert(G.isState(s), `seed ${seed} step ${step}`);
    }
  });
});

test('serialize round-trips, and junk is rejected', () => {
  const game = { number: 7, state: G.deal(7), history: [G.deal(6)] };
  const back = G.deserialize(G.serialize({ game }));
  eq(JSON.stringify(back.game), JSON.stringify(game), 'game');
  eq(G.deserialize(G.serialize({ game: null })).game, null, 'no game under way');
  const save = (changes, stats = {}) => JSON.stringify({ version: 1, ...stats, game: { ...game, ...changes } });
  eq(G.deserialize(null), null, 'null');
  eq(G.deserialize('not json'), null, 'garbage');
  eq(G.deserialize(save({}, { version: 2 })), null, 'another version');
  eq(G.deserialize(save({ number: 0 })), null, 'no such deal');
  const missing = G.deal(7);
  missing.cascades[0].pop();
  eq(G.deserialize(save({ state: missing })), null, 'a card missing');
  const twice = G.deal(7);
  twice.cells[0] = twice.cascades[0][0];
  eq(G.deserialize(save({ history: [twice] })), null, 'a card twice in the history');
});

test('an older save that counted games played and won still loads, without the counts', () => {
  const game = { number: 7, state: G.deal(7), history: [] };
  const back = G.deserialize(JSON.stringify({ version: 1, played: 3, won: 1, game: { ...game, started: true } }));
  eq(JSON.stringify(back), JSON.stringify({ game }), 'loaded');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
