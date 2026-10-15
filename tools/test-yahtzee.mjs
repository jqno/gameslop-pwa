import G from './yahtzee.mjs';

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

/* Dice from a string of faces, such as '11234'. */
function dice(faces) {
  return faces.split('').map(Number);
}

/* A score card from a map of box to points; the rest are open. */
function card(filled = {}) {
  return G.NAMES.map((_, box) => (box in filled ? filled[box] : null));
}

function game(faces, filled = {}, extra = {}) {
  return { ...G.newGame(), dice: dice(faces), rolls: 1, card: card(filled), ...extra };
}

test('upper boxes count their face', () => {
  eq(G.score(dice('11234'), 0, false), 2, 'ones');
  eq(G.score(dice('33363'), 2, false), 12, 'threes');
  eq(G.score(dice('12345'), 5, false), 0, 'sixes');
});

test('of a kind scores the sum of all dice', () => {
  eq(G.score(dice('33345'), G.THREE, false), 18, 'three');
  eq(G.score(dice('33245'), G.THREE, false), 0, 'not three');
  eq(G.score(dice('44441'), G.FOUR, false), 17, 'four');
  eq(G.score(dice('44411'), G.FOUR, false), 0, 'not four');
  eq(G.score(dice('55555'), G.FOUR, false), 25, 'five counts as four');
});

test('full house needs three and two', () => {
  eq(G.score(dice('22333'), G.FULL, false), 25, 'full house');
  eq(G.score(dice('22334'), G.FULL, false), 0, 'two pair');
  eq(G.score(dice('33333'), G.FULL, false), 0, 'a Yahtzee alone');
  eq(G.score(dice('33333'), G.FULL, true), 25, 'a joker');
});

test('straights', () => {
  eq(G.score(dice('12346'), G.SMALL, false), 30, 'small 1-4');
  eq(G.score(dice('63454'), G.SMALL, false), 30, 'small 3-6 unsorted');
  eq(G.score(dice('12456'), G.SMALL, false), 0, 'gap');
  eq(G.score(dice('23456'), G.LARGE, false), 40, 'large');
  eq(G.score(dice('12346'), G.LARGE, false), 0, 'not large');
  eq(G.score(dice('44444'), G.LARGE, true), 40, 'joker');
});

test('Yahtzee and chance', () => {
  eq(G.score(dice('66666'), G.YAHTZEE, false), 50, 'Yahtzee');
  eq(G.score(dice('66665'), G.YAHTZEE, false), 0, 'not Yahtzee');
  eq(G.score(dice('12345'), G.CHANCE, false), 15, 'chance');
});

test('every open box is an option, filled ones are not', () => {
  const choices = G.options(card({ 0: 3, [G.CHANCE]: 20 }), dice('22333'));
  eq(choices[0], null, 'ones taken');
  eq(choices[G.CHANCE], null, 'chance taken');
  eq(choices[G.FULL], 25, 'full house');
  eq(choices[G.YAHTZEE], 0, 'zero allowed');
});

test('a first Yahtzee may go anywhere, with no joker', () => {
  const choices = G.options(card(), dice('44444'));
  assert(choices.every((points) => points !== null), 'all open');
  eq(choices[G.FULL], 0, 'no joker');
});

test('a later Yahtzee must go in its upper box when open', () => {
  const choices = G.options(card({ [G.YAHTZEE]: 50 }), dice('44444'));
  eq(choices.filter((points) => points !== null).length, 1, 'one option');
  eq(choices[3], 20, 'fours');
});

test('then in a lower box as a joker', () => {
  const choices = G.options(card({ [G.YAHTZEE]: 0, 3: 12 }), dice('44444'));
  eq(choices[0], null, 'no upper');
  eq(choices[G.FULL], 25, 'full house');
  eq(choices[G.SMALL], 30, 'small');
  eq(choices[G.LARGE], 40, 'large');
  eq(choices[G.CHANCE], 20, 'chance');
});

test('then in any upper box', () => {
  const filled = { 3: 12 };
  for (let box = G.THREE; box <= G.CHANCE; box++) filled[box] = 0;
  const choices = G.options(card(filled), dice('44444'));
  eq(choices[0], 0, 'ones');
  eq(choices[3], null, 'fours taken');
  eq(choices[G.FULL], null, 'full house taken');
});

test('a later Yahtzee earns a bonus only if the first scored 50', () => {
  eq(G.choose(game('22222', { [G.YAHTZEE]: 50 }), 1).bonus, 100, 'bonus');
  eq(G.choose(game('22222', { [G.YAHTZEE]: 0 }), 1).bonus, 0, 'no bonus');
  eq(G.choose(game('22222'), G.YAHTZEE).bonus, 0, 'the first one');
});

test('choosing a box ends the turn', () => {
  const next = G.choose(game('22333', {}, { rolls: 2, held: [true, false, true, false, false] }), G.FULL);
  eq(next.card[G.FULL], 25, 'scored');
  eq(next.rolls, 0, 'rolls');
  assert(next.held.every((h) => !h), 'nothing held');
});

test('rolling keeps held dice and counts the rolls', () => {
  const rand = G.rng(1);
  let g = G.roll(G.newGame(), rand);
  eq(g.rolls, 1, 'first roll');
  assert(g.dice.every((face) => face >= 1 && face <= 6), 'faces in range');
  g = G.hold(g, 0);
  g = G.hold(g, 3);
  const kept = [g.dice[0], g.dice[3]];
  for (let k = 0; k < 2; k++) g = G.roll(g, rand);
  eq(g.rolls, G.ROLLS, 'three rolls');
  eq(g.dice[0], kept[0], 'die 0 held');
  eq(g.dice[3], kept[1], 'die 3 held');
  assert(!G.canRoll(g), 'no fourth roll');
  assert(!G.canHold(g), 'no holding after the last roll');
  assert(!G.canHold(G.newGame()), 'no holding before the first roll');
});

test('every face comes up', () => {
  const rand = G.rng(7);
  const seen = new Set();
  for (let k = 0; k < 200; k++) G.roll(G.newGame(), rand).dice.forEach((face) => seen.add(face));
  eq(seen.size, 6, 'faces');
});

test('the upper bonus kicks in at 63', () => {
  const almost = card({ 0: 3, 1: 6, 2: 9, 3: 12, 4: 15, 5: 17 });
  eq(G.upperTotal(almost), 62, 'total');
  eq(G.upperBonus(almost), 0, 'no bonus');
  const enough = card({ 0: 3, 1: 6, 2: 9, 3: 12, 4: 15, 5: 18 });
  eq(G.upperBonus(enough), 35, 'bonus');
  eq(G.total({ ...G.newGame(), card: enough, bonus: 100 }), 63 + 35 + 100, 'grand total');
});

test('a game is over once every box is filled', () => {
  const rand = G.rng(3);
  let g = G.newGame();
  for (let turn = 0; turn < G.NAMES.length; turn++) {
    assert(!G.isOver(g), `over at turn ${turn}`);
    g = G.roll(g, rand);
    const box = G.options(g.card, g.dice).findIndex((points) => points !== null);
    g = G.choose(g, box);
  }
  assert(G.isOver(g), 'over');
  assert(!G.canRoll(g), 'no rolling');
});

test('progress survives a round trip', () => {
  const g = game('12345', { 0: 1 });
  const progress = { best: 230, game: g, undo: G.newGame() };
  const back = G.deserialize(G.serialize(progress));
  eq(JSON.stringify(back), JSON.stringify(progress), 'same');
  eq(G.deserialize(G.serialize({ ...progress, undo: null })).undo, null, 'no undo');
});

test('broken progress is rejected', () => {
  const good = { version: 1, best: 0, game: G.newGame(), undo: null };
  eq(G.deserialize('not json'), null, 'not json');
  eq(G.deserialize(null), null, 'nothing stored');
  eq(G.deserialize(JSON.stringify({ ...good, version: 2 })), null, 'version');
  eq(G.deserialize(JSON.stringify({ ...good, best: -1 })), null, 'best');
  eq(G.deserialize(JSON.stringify({ ...good, game: { ...good.game, dice: [1, 2, 3, 4, 7] } })), null, 'face');
  eq(G.deserialize(JSON.stringify({ ...good, game: { ...good.game, rolls: 4 } })), null, 'rolls');
  eq(G.deserialize(JSON.stringify({ ...good, game: { ...good.game, card: [] } })), null, 'card');
  eq(G.deserialize(JSON.stringify({ ...good, game: { ...good.game, bonus: 50 } })), null, 'bonus');
  assert(G.deserialize(JSON.stringify(good)) !== null, 'good');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
