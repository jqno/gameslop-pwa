import I from './invaders.mjs';

const SEEDS = Number(process.env.SEEDS || 100);

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

/* Never drops a bomb. */
const calm = () => 0.999;

/* A level 1 world with these changes. */
function world(changes) {
  return { ...I.newWorld(1), ...changes };
}

/* The middle of an invader. */
function middle(w, a) {
  const at = I.alienAt(a, w.fx, w.fy);
  return { x: at.x + I.ALIEN_W / 2, y: at.y + I.ALIEN_H / 2 };
}

test('a new world has a full formation, centred, above the shields', () => {
  const w = I.newWorld(1);
  eq(w.aliens.length, I.ROWS * I.COLS, 'invaders');
  const left = w.fx;
  const right = w.fx + (I.COLS - 1) * I.SPACE_X + I.ALIEN_W;
  assert(Math.abs(left - (I.WIDTH - right)) < 1e-9, 'centred');
  assert(left >= I.MARGIN, 'inside the field');
  assert(w.fy + I.ROWS * 0.75 < I.SHIELD_Y, 'above the shields');
  eq(w.player, I.WIDTH / 2, 'cannon in the middle');
  eq(w.shot, null, 'no shot');
  eq(w.bombs.length, 0, 'no bombs');
  assert(!I.isCleared(w), 'not cleared');
  assert(I.isCleared({ ...w, aliens: [] }), 'cleared without invaders');
});

test('the shields are four of the same, inside the field', () => {
  const blocks = I.newShields();
  eq(blocks.length % 4, 0, 'four alike');
  for (const b of blocks) {
    assert(b.x >= 0 && b.x + I.BLOCK <= I.WIDTH, 'inside');
    assert(b.y >= I.SHIELD_Y && b.y + I.BLOCK <= I.PLAYER_Y, 'between the invaders and the cannon');
  }
});

test('later levels start lower, down to a limit', () => {
  assert(I.startY(2) > I.startY(1), 'level 2 is lower');
  eq(I.startY(100), I.LOWEST, 'and no lower');
});

test('the invaders speed up as they are shot down and on later levels', () => {
  const full = I.ROWS * I.COLS;
  assert(I.marchSpeed(1, 1) > I.marchSpeed(1, full / 2), 'fewer is faster');
  assert(I.marchSpeed(1, full / 2) > I.marchSpeed(1, full), 'half is faster than all');
  assert(I.marchSpeed(3, full) > I.marchSpeed(1, full), 'later levels are faster');
  assert(I.bombRate(3) > I.bombRate(1), 'and drop more bombs');
});

test('the cannon stays inside the field', () => {
  eq(I.clampPlayer(-5), I.PLAYER_W / 2, 'left');
  eq(I.clampPlayer(50), I.WIDTH - I.PLAYER_W / 2, 'right');
  eq(I.clampPlayer(3), 3, 'in between');
});

test('the cannon has one shot at a time', () => {
  const once = I.fire(world({ player: 3 }));
  eq(once.shot.x, 3, 'from the cannon');
  eq(once.shot.y, I.PLAYER_Y, 'at its top');
  eq(I.fire({ ...once, player: 7 }).shot, once.shot, 'not again while it flies');
});

test('the formation turns and steps down at the side', () => {
  const w = I.newWorld(1);
  const right = I.WIDTH - I.MARGIN - (I.COLS - 1) * I.SPACE_X - I.ALIEN_W;
  const result = I.advance({ ...w, fx: right - 0.001 }, 0.05, 1, calm).world;
  eq(result.dir, -1, 'turned');
  assert(Math.abs(result.fy - w.fy - I.DROP) < 1e-9, 'stepped down once');
  const moved = I.advance(w, 0.1, 1, calm).world;
  assert(moved.fx > w.fx, 'moves right to begin with');
  eq(moved.fy, w.fy, 'without stepping down');
});

test('a shot downs the invader it hits, worth its row', () => {
  const w = world({});
  const target = w.aliens.find((a) => a.r === 4 && a.c === 2);
  const at = middle(w, target);
  const result = I.advance({ ...w, shot: { x: at.x, y: at.y + 0.3 } }, 0.05, 1, calm);
  eq(result.killed.length, 1, 'one down');
  eq(result.killed[0].r, 4, 'the one hit');
  eq(result.killed[0].c, 2, 'the one hit');
  eq(result.world.aliens.length, w.aliens.length - 1, 'gone');
  eq(result.world.shot, null, 'the shot is spent');
  eq(I.POINTS[0], 30, 'the top row is worth most');
  eq(I.POINTS[I.ROWS - 1], 10, 'the bottom row least');
});

test('a shot that misses flies off the top', () => {
  const w = world({ aliens: [{ r: 4, c: 0 }], shot: { x: 9, y: 1 } });
  eq(I.advance(w, 0.1, 1, calm).world.shot, null, 'gone');
});

test('shots and bombs wear the shields away', () => {
  const w = world({});
  const b = w.shields[0];
  const x = b.x + I.BLOCK / 2;
  const up = I.advance({ ...w, shot: { x, y: b.y + I.BLOCK * 6 } }, 0.05, 1, calm).world;
  assert(up.shields.length < w.shields.length, 'a shot takes blocks out');
  eq(up.shot, null, 'and is spent');
  const down = I.advance({ ...w, bombs: [{ x, y: b.y - 0.1 }] }, 0.05, 1, calm).world;
  assert(down.shields.length < w.shields.length, 'a bomb takes blocks out');
  eq(down.bombs.length, 0, 'and is spent');
});

test('a bomb on the cannon costs a life, and a miss falls off the bottom', () => {
  const w = world({ player: 5 });
  const hit = I.advance({ ...w, bombs: [{ x: 5, y: I.PLAYER_Y - 0.05 }] }, 0.05, 1, calm);
  assert(hit.hit, 'hit');
  const miss = I.advance({ ...w, bombs: [{ x: 1, y: I.HEIGHT - 0.05 }] }, 0.05, 1, calm);
  assert(!miss.hit, 'missed');
  eq(miss.world.bombs.length, 0, 'gone');
});

test('the invaders drop bombs from the bottom of a column, up to a limit', () => {
  const w = world({});
  const result = I.advance(w, 0.05, 1, () => 0);
  eq(result.world.bombs.length, 1, 'one dropped');
  const bottom = w.fy + (I.ROWS - 1) * 0.75 + I.ALIEN_H;
  assert(result.world.bombs[0].y > bottom, 'below the formation');
  const full = Array.from({ length: I.MAX_BOMBS }, (_, i) => ({ x: i + 1, y: 6 }));
  eq(I.advance({ ...w, bombs: full }, 0.05, 1, () => 0).world.bombs.length, I.MAX_BOMBS, 'no more than the limit');
});

test('invaders that reach the cannon have landed, and wipe out shields on the way', () => {
  const w = world({ aliens: [{ r: 0, c: 0 }] });
  const low = I.advance({ ...w, fy: I.SHIELD_Y }, 0.01, 1, calm);
  assert(!low.landed, 'not yet');
  assert(low.world.shields.length < w.shields.length, 'shields under them are gone');
  assert(I.advance({ ...w, fy: I.PLAYER_Y }, 0.01, 1, calm).landed, 'landed');
});

test('everything stays inside the field', () => {
  for (let s = 0; s < SEEDS; s++) {
    const rand = I.rng(s * 7919 + 1);
    let w = I.newWorld(1 + (s % 5));
    for (let frame = 0; frame < 3000 && !I.isCleared(w); frame++) {
      w = I.fire({ ...w, player: I.clampPlayer(rand() * I.WIDTH) });
      const result = I.advance(w, 0.05, 1 + (s % 5), rand);
      w = result.world;
      const where = `(seed ${s}, frame ${frame})`;
      if (result.landed) break;
      if (result.hit) w = { ...w, bombs: [] };
      for (const a of w.aliens) {
        const at = I.alienAt(a, w.fx, w.fy);
        assert(at.x >= I.MARGIN - 1e-9 && at.x + I.ALIEN_W <= I.WIDTH - I.MARGIN + 1e-9, `invader outside ${where}`);
      }
      assert(w.bombs.length <= I.MAX_BOMBS, `too many bombs ${where}`);
      for (const b of w.bombs) assert(b.y < I.HEIGHT, `bomb outside ${where}`);
      if (w.shot !== null) assert(w.shot.y >= 0, `shot outside ${where}`);
    }
  }
});

test('progress survives a round trip and bad saves are rejected', () => {
  eq(I.deserialize(I.serialize({ best: 1230 })).best, 1230, 'best');
  const save = (changes) => JSON.stringify({ version: 1, best: 0, ...changes });
  assert(I.deserialize(save({})) !== null, 'a save with no best yet');
  eq(I.deserialize(null), null, 'null');
  eq(I.deserialize('not json'), null, 'garbage');
  eq(I.deserialize(save({ version: 2 })), null, 'another version');
  eq(I.deserialize(save({ best: 2.5 })), null, 'fractional best');
  eq(I.deserialize(save({ best: -10 })), null, 'negative best');
  eq(I.deserialize(save({ best: '10' })), null, 'best as text');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
