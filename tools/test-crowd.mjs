import C from './crowd.mjs';

const SEEDS = Number(process.env.SEEDS || 600);

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

/* The page seeds each road at random; these are samples across levels 1..30,
 * each with its seed and level. */
const courses = Array.from({ length: SEEDS }, (_, i) => {
  const seed = i * 7919 + 1;
  const level = 1 + (i % 30);
  return { seed, level, ...C.generateCourse(seed, level) };
});

/* A run steered by choose(n, gate pair) -> side, fighting every enemy,
 * ignoring obstacles and passing every pickup by. A crowd that runs out stays
 * out. Returns how many beat the boss. */
function play(course, choose) {
  return course.items.reduce((n, item) => {
    if (n === 0) return 0;
    if (item.kind === 'gates') return C.applyGate(n, choose(n, item));
    if (item.kind === 'enemy' || item.kind === 'boss') return C.fight(n, item.count, false).you;
    return n;
  }, C.START);
}

/* The strong run, played through applyItem at the spots bestMove picks, past
 * every pickup. Returns the final run and the count at the boss. */
function playBest(course) {
  let run = C.newRun(C.START_SPEED);
  let atBoss = null;
  for (const item of course.items) {
    if (item.kind === 'boss') run = C.sightBoss(run, item);
    if (item.kind === 'pickup') continue;
    if (item.kind === 'boss') atBoss = run.n;
    const move = C.bestMove(run.n, item);
    if (move.x !== null) run = { ...run, x: move.x };
    const result = C.applyItem({ ...run, z: item.z }, item);
    run = result.run;
    if (run.n === 0) break;
  }
  return { run, atBoss };
}

function worse(n, item) {
  if (C.applyGate(n, item.left) < C.applyGate(n, item.right)) return item.left;
  return item.right;
}

console.log(`crowd run — ${SEEDS} roads\n`);

test('gates add, subtract, multiply and divide, floored and never below 0', () => {
  eq(C.applyGate(5, { op: '+', k: 10 }), 15, '+');
  eq(C.applyGate(5, { op: '-', k: 3 }), 2, '-');
  eq(C.applyGate(5, { op: '-', k: 9 }), 0, '- clamps at 0');
  eq(C.applyGate(5, { op: 'x', k: 3 }), 15, 'x');
  eq(C.applyGate(7, { op: '/', k: 2 }), 3, '/ floors');
  eq(C.applyGate(1, { op: '/', k: 3 }), 0, '/ reaches 0');
  eq(C.gateLabel({ op: 'x', k: 2 }), '×2', 'label');
});

test('no gate or pickup takes a crowd past MAX_CROWD', () => {
  eq(C.applyGate(C.MAX_CROWD - 1, { op: '+', k: 50 }), C.MAX_CROWD, '+');
  eq(C.applyGate(600, { op: 'x', k: 2 }), C.MAX_CROWD, '×');
  const recruits = { z: 1, kind: 'pickup', x: 0, type: 'recruits', count: 40 };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 980 }, recruits).run.n, C.MAX_CROWD, 'recruits');
  const pair = { z: 2, kind: 'gates', left: { op: 'x', k: 2 }, right: { op: 'x', k: 2 } };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 300, double: true }, pair).run.n, C.MAX_CROWD, 'a doubled gate');
  const multipliers = courses.flatMap((c) => c.items.filter((item) => item.kind === 'gates'))
    .flatMap((pair) => [pair.left, pair.right]).filter((gate) => gate.op === 'x');
  assert(multipliers.every((gate) => gate.k === 2), 'a multiplier other than ×2');
});

test('a fight costs both sides the smaller count, and the loser ends at 0', () => {
  for (const [a, b] of [[10, 4], [4, 10], [7, 7], [1, 0]]) {
    const one = C.fight(a, b, false);
    const two = C.fight(b, a, false);
    eq(one.you, two.them, `${a} v ${b} is symmetric`);
    eq(one.them, two.you, `${b} v ${a} is symmetric`);
    eq(one.you, a - Math.min(a, b), `${a} v ${b} survivors`);
    eq(one.them, b - Math.min(a, b), `${a} v ${b} enemy survivors`);
  }
});

test('Rage halves what a fight costs you', () => {
  eq(C.fight(10, 8, true).you, 6, 'loses 4 instead of 8');
  eq(C.fight(5, 8, true).you, 1, 'wins a fight it would lose without rage');
  eq(C.fight(3, 8, true).you, 0, 'still loses when outnumbered more than two to one');
  eq(C.fight(3, 8, true).them, 2, 'having taken 6 with it');
});

test('a road is the same every time for the same seed', () => {
  eq(JSON.stringify(C.generateCourse(99, 5)), JSON.stringify(C.generateCourse(99, 5)), 'same seed');
  assert(JSON.stringify(C.generateCourse(99, 5)) !== JSON.stringify(C.generateCourse(100, 5)), 'another seed differs');
});

test('items are in order along the road, inside it, with the boss last', () => {
  for (const course of courses) {
    const zs = course.items.map((item) => item.z);
    for (let i = 1; i < zs.length; i++) assert(zs[i] > zs[i - 1], `items out of order at ${i}`);
    assert(zs[0] > 0, 'an item at the start line');
    assert(zs[zs.length - 1] < course.length, 'an item past the end');
    eq(course.items.filter((item) => item.kind === 'boss').length, 1, 'boss count');
  }
});

test('every gate pair has a side that does not shrink the crowd, and the first has two', () => {
  for (const course of courses) {
    const pairs = course.items.filter((item) => item.kind === 'gates');
    assert(!C.harmful(pairs[0].left) && !C.harmful(pairs[0].right), 'first pair has a bad side');
    for (const pair of pairs) assert(!C.harmful(pair.left) || !C.harmful(pair.right), 'a pair with two bad sides');
  }
});

test('pickups stand in a lane, and a crowd of any size can pass one by', () => {
  for (const course of courses) {
    for (const item of course.items.filter((i) => i.kind === 'pickup')) {
      eq(Math.abs(item.x), 0.5, 'pickup lane');
      assert(C.PICKUPS.includes(item.type), `pickup type ${item.type}`);
    }
  }
  for (const n of [1, 10, 100, 100000]) {
    const r = C.crowdRadius(n);
    assert(Math.abs(-(1 - r) - 0.5) >= r + C.PICKUP_R, `a crowd of ${n} cannot pass a pickup`);
  }
});

test('the strong run can be played, survives everything and beats the boss', () => {
  for (const course of courses) {
    const best = C.bestOutcome(course);
    const { run, atBoss } = playBest(course);
    eq(atBoss, best, `seed ${course.seed}: count at the boss`);
    assert(run.n > 0, `seed ${course.seed}: ${best} lost to the boss`);
  }
});

test('the boss comes into sight after the last gate, and nothing lies between', () => {
  for (const course of courses) {
    const boss = course.items[course.items.length - 1];
    const last = course.items[course.items.length - 2];
    assert(boss.z - C.BOSS_SIGHT > last.z, `seed ${course.seed}: the boss is in sight before the last item`);
  }
});

test('the boss is sized once, on sight, and any crowd beats a boss sized by BOSS_FLOOR', () => {
  const boss = { z: 100, kind: 'boss', count: 40 };
  eq(C.sightBoss({ ...C.newRun(C.START_SPEED), n: 50 }, boss).bossCount, 40, 'a crowd near the strong run meets the boss as generated');
  const swollen = C.sightBoss({ ...C.newRun(C.START_SPEED), n: 900 }, boss);
  eq(swollen.bossCount, Math.floor(900 * C.BOSS_FLOOR), 'a swollen crowd meets a bigger boss');
  eq(C.sightBoss({ ...swollen, n: 5 }, boss).bossCount, swollen.bossCount, 'the size never changes after sighting');
  eq(C.applyItem(swollen, boss).run.n, 900 - swollen.bossCount, 'the fight uses the sighted size');
  /* A boss of 1 against a crowd of 1 is a draw, so this starts at 2. */
  const weak = { ...boss, count: 1 };
  for (const n of [2, 7, 100, C.MAX_CROWD]) {
    const run = C.sightBoss({ ...C.newRun(C.START_SPEED), n }, weak);
    assert(C.applyItem(run, weak).run.n > 0, `${n} lost to a boss sized by BOSS_FLOOR`);
  }
});

/* What a road holds, counted: the cards its decks dealt. */
function contents(course) {
  const pairs = course.items.filter((item) => item.kind === 'gates');
  const obstacles = course.items.filter((item) => item.kind === 'obstacle');
  return {
    bad: pairs.filter((pair) => C.harmful(pair.left) || C.harmful(pair.right)).length,
    obstacles: obstacles.length,
    walls: obstacles.filter((item) => item.type === 'wall').length,
    hidden: pairs.filter((pair) => pair.hidden).length,
    pickups: course.items.filter((item) => item.kind === 'pickup').length,
  };
}

test('every road of a level holds the same deck, and later levels hold harder ones', () => {
  const byLevel = new Map();
  for (const course of courses) {
    const text = JSON.stringify(contents(course));
    if (!byLevel.has(course.level)) byLevel.set(course.level, text);
    eq(text, byLevel.get(course.level), `level ${course.level}, seed ${course.seed}`);
  }
  const first = contents(C.generateCourse(1, 1));
  const later = contents(C.generateCourse(1, 21));
  assert(later.bad > first.bad, 'no more bad pairs at level 21');
  assert(later.obstacles > first.obstacles, 'no more obstacles at level 21');
  assert(later.hidden > first.hidden, 'no more hidden gates at level 21');
});

test('the boss is the level\'s share of the strong run, tighter on later levels', () => {
  for (const course of courses) {
    const boss = course.items[course.items.length - 1];
    eq(boss.count, Math.max(1, Math.floor(C.bossShare(course.level) * C.bestOutcome(course))), `seed ${course.seed}: boss size`);
  }
  assert(C.bossShare(21) > C.bossShare(1), 'the boss is no tighter at level 21');
  assert(C.bossShare(1000) < 1, 'the boss can be as big as a strong run');
});

test('the road starts easier than it ends', () => {
  let early = 0;
  let late = 0;
  for (const course of courses) {
    const pairs = course.items.filter((item) => item.kind === 'gates');
    const third = Math.floor(pairs.length / 3);
    early += pairs.slice(0, third).filter((pair) => C.harmful(pair.left) || C.harmful(pair.right)).length;
    late += pairs.slice(-third).filter((pair) => C.harmful(pair.left) || C.harmful(pair.right)).length;
  }
  assert(late > early * 2, `bad pairs early ${early}, late ${late}`);
});

test('the road alternates gate pairs and enemies, then the boss', () => {
  for (const course of courses) {
    const kinds = course.items.filter((item) => item.kind !== 'pickup' && item.kind !== 'obstacle').map((item) => item.kind);
    const pattern = kinds.map((kind, i) => {
      if (i === kinds.length - 1) return kind === 'boss';
      if (i % 2 === 0) return kind === 'gates';
      return kind === 'enemy';
    });
    assert(pattern.every(Boolean), `seed ${course.seed}: ${kinds.join(' ')}`);
    assert(kinds.length % 2 === 0, `seed ${course.seed} does not end with a pair before the boss`);
  }
});

test('the two sides of every pair give the strong run a different count', () => {
  for (const course of courses) {
    course.items.reduce((n, item) => {
      if (item.kind === 'gates') {
        const left = C.applyGate(n, item.left);
        const right = C.applyGate(n, item.right);
        assert(left !== right || left === C.MAX_CROWD, `seed ${course.seed}: ${C.gateLabel(item.left)} | ${C.gateLabel(item.right)} at ${n}`);
      }
      return C.bestMove(n, item).n;
    }, C.START);
  }
});

test('roads have obstacles and hidden gates, hiding one side at most', () => {
  const all = courses.flatMap((c) => c.items);
  assert(all.some((item) => item.kind === 'obstacle' && item.type === 'wall'), 'no walls');
  assert(all.some((item) => item.kind === 'obstacle' && item.type === 'saw'), 'no saws');
  assert(all.some((item) => item.hidden), 'no hidden gates');
  for (const item of courses.flatMap((c) => c.items)) {
    if (item.hidden) assert(item.kind === 'gates' && ['left', 'right'].includes(item.hidden), 'bad hidden');
  }
});

test('every obstacle keeps CLEAR from any gate', () => {
  for (const course of courses) {
    const gates = course.items.filter((item) => item.kind === 'gates');
    for (const block of course.items.filter((item) => item.kind === 'obstacle')) {
      for (const pair of gates) {
        assert(Math.abs(pair.z - block.z) >= C.CLEAR, `seed ${course.seed}: obstacle at ${block.z}, gate at ${pair.z}`);
      }
    }
  }
});

test('a crowd loses the share of it that runs into an obstacle', () => {
  eq(C.overlap(0, 0.3, []), 0, 'nothing in the way');
  eq(C.overlap(0, 0.3, [[-1, 1]]), 1, 'everything in the way');
  assert(Math.abs(C.overlap(0, 0.3, [[0, 1]]) - 0.5) < 1e-9, 'half in the way');
  assert(Math.abs(C.overlap(0.1, 0.3, [[0.2, 1]]) - C.overlap(-0.1, 0.3, [[-1, -0.2]])) < 1e-9, 'symmetric');
  assert(C.overlap(0, 0.3, [[0.1, 1]]) < C.overlap(0, 0.3, [[0, 1]]), 'more in the way costs more');

  const wall = { z: 5, kind: 'obstacle', type: 'wall', blocks: [[-1, -0.25], [0.25, 1]] };
  const small = C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, x: 0 }, wall);
  eq(small.run.n, 10, 'a small crowd fits through the gap');
  assert(!small.hit, 'a clean pass counts as a hit');
  const big = C.applyItem({ ...C.newRun(C.START_SPEED), n: 200, x: 0 }, wall);
  assert(big.run.n < 200 && big.run.n > 100, `a big crowd loses its edges, not more: ${big.run.n}`);
  const shielded = C.applyItem({ ...C.newRun(C.START_SPEED), n: 200, x: 0, shield: true }, wall);
  eq(shielded.run.n, 200, 'shield absorbs the obstacle');
  assert(!shielded.run.shield, 'and is used up');
});

test('bestX finds the spot with the smallest loss', () => {
  const saw = [[-0.2, 0.5]];
  const spot = C.bestX(80, saw, -1, 1);
  for (let x = -0.6; x <= 0.6; x += 0.05) {
    assert(spot.lost <= C.shaveLoss(80, x, saw), `x = ${x} loses less than bestX`);
  }
});

test('each level runs a little faster than the one before', () => {
  eq(C.speedFor(1), C.START_SPEED, 'level 1');
  for (let level = 1; level < 40; level++) {
    const step = C.speedFor(level + 1) - C.speedFor(level);
    assert(step > 0 && step <= 0.25, `level ${level} to ${level + 1} speeds up by ${step}`);
  }
});

test('always taking the worse gate loses', () => {
  const lost = courses.filter((c) => play(c, worse) === 0).length;
  eq(lost, courses.length, 'roads lost by the worse play');
});

test('the crowd reaches the gate side its centre is in', () => {
  const pair = { z: 10, kind: 'gates', left: { op: '+', k: 5 }, right: { op: 'x', k: 3 } };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 4, x: -0.3 }, pair).run.n, 9, 'left');
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 4, x: 0.3 }, pair).run.n, 12, 'right');
});

test('an enemy is fought wherever the crowd is', () => {
  const enemy = { z: 10, kind: 'enemy', count: 6 };
  for (const x of [-0.6, 0, 0.6]) {
    const result = C.applyItem({ ...C.newRun(C.START_SPEED), n: 20, x }, enemy);
    assert(result.hit, `dodged from x = ${x}`);
    eq(result.run.n, 14, `fight survivors from x = ${x}`);
    eq(result.foe, 6, 'the enemy it met');
    eq(result.them, 0, 'what is left of the enemy');
  }
});

test('Recruits join the crowd', () => {
  const item = { z: 10, kind: 'pickup', x: 0.5, type: 'recruits', count: 7 };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 3, x: 0.5 }, item).run.n, 10, 'recruited');
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 3, x: -0.5 }, item).run.n, 3, 'passed by');
});

test('Shield absorbs exactly one harmful hit and ignores good gates', () => {
  const good = { z: 1, kind: 'gates', left: { op: '+', k: 5 }, right: { op: '+', k: 5 } };
  const bad = { z: 2, kind: 'gates', left: { op: '-', k: 5 }, right: { op: '-', k: 5 } };
  let run = { ...C.newRun(C.START_SPEED), n: 10, shield: true };
  run = C.applyItem(run, good).run;
  eq(run.n, 15, 'good gate applies');
  assert(run.shield, 'a good gate used up the shield');
  run = C.applyItem(run, bad).run;
  eq(run.n, 15, 'bad gate blocked');
  assert(!run.shield, 'shield survived a block');
  run = C.applyItem(run, bad).run;
  eq(run.n, 10, 'second bad gate applies');

  const enemy = { z: 3, kind: 'enemy', count: 4 };
  const blocked = C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, shield: true }, enemy);
  assert(blocked.hit, 'the enemy is still taken off the road');
  eq(blocked.run.n, 10, 'enemy blocked');
  assert(!blocked.run.shield, 'shield survived an enemy');

  const boss = { z: 4, kind: 'boss', count: 8 };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, shield: true }, boss).run.n, 2, 'shield does not stop the boss');
});

test('Double applies the next gate twice, then is used up', () => {
  const pair = { z: 1, kind: 'gates', left: { op: 'x', k: 2 }, right: { op: 'x', k: 2 } };
  let run = { ...C.newRun(C.START_SPEED), n: 3, double: true };
  run = C.applyItem(run, pair).run;
  eq(run.n, 12, 'doubled');
  assert(!run.double, 'double survived a gate');
  eq(C.applyItem(run, pair).run.n, 24, 'next gate applies once');

  const bad = { z: 1, kind: 'gates', left: { op: '-', k: 2 }, right: { op: '-', k: 2 } };
  eq(C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, double: true }, bad).run.n, 6, 'a bad gate doubles too');
  const both = C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, double: true, shield: true }, bad).run;
  eq(both.n, 10, 'a shield blocks a doubled bad gate');
  assert(!both.double && !both.shield, 'and both are used up');
});

test('Rage lasts RAGE_TIME seconds at any speed and halves fight losses, the boss included', () => {
  const token = { z: 5, kind: 'pickup', x: 0, type: 'rage' };
  const run = C.applyItem({ ...C.newRun(C.START_SPEED), n: 10, z: 5 }, token).run;
  eq(run.rageUntil, 5 + C.RAGE_TIME * C.START_SPEED, 'rage end');
  const fast = C.applyItem({ ...C.newRun(12), n: 10, z: 5 }, token).run;
  eq(fast.rageUntil, 5 + C.RAGE_TIME * 12, 'rage end at a faster pace');
  const enemy = { z: 6, kind: 'enemy', count: 8 };
  eq(C.applyItem({ ...run, z: 6 }, enemy).run.n, 6, 'raging');
  eq(C.applyItem({ ...run, z: run.rageUntil }, enemy).run.n, 2, 'rage has worn off');
  eq(C.applyItem({ ...run, z: 6 }, { z: 6, kind: 'boss', count: 8 }).run.n, 6, 'raging at the boss');
});

test('a crowd draws at most CAP figures, all within its radius', () => {
  for (const n of [0, 1, 2, 50, C.CAP, C.CAP + 1, 5000]) {
    const points = C.crowdLayout(n);
    eq(points.length, Math.min(n, C.CAP), `figures for ${n}`);
    const r = C.crowdRadius(n);
    for (const p of points) assert(Math.hypot(p.x, p.z) <= r, `figure outside radius for ${n}`);
  }
});

test('a crowd keeps growing wider past 120, up to MAX_RADIUS', () => {
  const sizes = [1, 50, 120, 121, 240, 1000, 2000];
  for (let i = 1; i < sizes.length; i++) {
    assert(C.crowdRadius(sizes[i]) > C.crowdRadius(sizes[i - 1]), `${sizes[i]} is no wider than ${sizes[i - 1]}`);
  }
  assert(C.crowdRadius(121) - C.crowdRadius(120) < 0.01, 'a jump in width at 120');
  assert(C.crowdRadius(2333) > 0.6, 'a crowd of 2333 still fits in half the road');
  eq(C.crowdRadius(1e9), C.MAX_RADIUS, 'the widest crowd');
});

test('progress survives a round trip and bad saves are rejected', () => {
  eq(C.deserialize(C.serialize({ best: 312 })).best, 312, 'best');
  eq(C.deserialize(null), null, 'null');
  eq(C.deserialize('not json'), null, 'garbage');
  eq(C.deserialize(JSON.stringify({ version: 1, level: 3, best: 12 })), null, 'a save from when there were levels');
  eq(C.deserialize(JSON.stringify({ version: 2, best: 140 })), null, 'a save that counted survivors, not levels');
  eq(C.deserialize(JSON.stringify({ version: 3, best: 2.5 })), null, 'fractional best');
  eq(C.deserialize(JSON.stringify({ version: 3, best: -1 })), null, 'negative best');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
