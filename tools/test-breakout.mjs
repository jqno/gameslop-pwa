import B from './breakout.mjs';

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

function near(a, b, message) {
  if (Math.abs(a - b) > 1e-9) throw new Error(`${message}: expected ${b}, got ${a}`);
}

/* A world with the given bricks and a ball at x, y moving vx, vy. */
function world(bricks, x, y, vx, vy, paddle = B.WIDTH / 2) {
  return { bricks, paddle, ball: { x, y, vx, vy } };
}

/* The y of the middle of brick row r. */
function rowY(r) {
  return B.TOP + (r + 0.5) * B.BRICK_H;
}

const seeds = Array.from({ length: SEEDS }, (_, i) => i * 7919 + 1);

test('a level is a mirrored pattern of bricks inside the field', () => {
  for (const level of [1, 2, 5, 10, 30]) {
    for (const seed of seeds) {
      const bricks = B.layout(level, B.rng(seed));
      const where = `(level ${level}, seed ${seed})`;
      assert(bricks.length >= B.COLS, `enough bricks ${where}`);
      const at = new Set(bricks.map((b) => `${b.r},${b.c},${b.hits}`));
      eq(at.size, bricks.length, `no two in one spot ${where}`);
      for (const b of bricks) {
        assert(b.c >= 0 && b.c < B.COLS && b.r >= 0 && b.r < B.MAX_ROWS, `inside ${where}`);
        assert(b.hits >= 1 && b.hits <= 3, `hits ${where}`);
        assert(at.has(`${b.r},${B.COLS - 1 - b.c},${b.hits}`), `mirrored ${where}`);
      }
    }
  }
});

test('levels get more rows and tougher bricks', () => {
  const rows = (level) => Math.max(...seeds.map((seed) => Math.max(...B.layout(level, B.rng(seed)).map((b) => b.r)))) + 1;
  const tough = (level) => seeds.some((seed) => B.layout(level, B.rng(seed)).some((b) => b.hits > 1));
  eq(rows(1), 4, 'rows on level 1');
  eq(rows(3), 6, 'rows on level 3');
  eq(rows(30), B.MAX_ROWS, 'rows top out');
  assert(!tough(1), 'level 1 has no tough bricks');
  assert(tough(2), 'level 2 does');
});

test('the ball gets faster each level, up to a limit', () => {
  eq(B.speedFor(1), B.FIRST_SPEED, 'level 1');
  assert(B.speedFor(2) > B.speedFor(1), 'level 2 is faster');
  eq(B.speedFor(100), B.MAX_SPEED, 'and no faster');
});

test('the paddle stays inside the field', () => {
  eq(B.clampPaddle(-5), B.PADDLE_W / 2, 'left');
  eq(B.clampPaddle(50), B.WIDTH - B.PADDLE_W / 2, 'right');
  eq(B.clampPaddle(3), 3, 'in between');
});

test('the paddle sends the ball up, more slanted towards its edges', () => {
  const middle = B.bounce(0, 10);
  near(middle.vx, 0, 'straight up from the middle');
  near(middle.vy, -10, 'at full speed');
  const right = B.bounce(1, 10);
  near(Math.atan2(right.vx, -right.vy), B.MAX_ANGLE, 'the right edge');
  near(Math.hypot(right.vx, right.vy), 10, 'same speed');
  assert(B.bounce(-0.5, 10).vx < 0, 'left of the middle goes left');
  near(B.bounce(5, 10).vx, right.vx, 'no flatter than the edge');
});

test('the ball bounces off the walls and the ceiling', () => {
  const left = B.advance(world([], 0.2, 5, -4, 0), 0.1).world.ball;
  assert(left.vx > 0, 'off the left wall');
  assert(left.x >= B.RADIUS, 'and stays inside');
  const right = B.advance(world([], B.WIDTH - 0.2, 5, 4, 0), 0.1).world.ball;
  assert(right.vx < 0, 'off the right wall');
  assert(right.x <= B.WIDTH - B.RADIUS, 'and stays inside');
  const top = B.advance(world([], 4, 0.2, 0, -4), 0.1).world.ball;
  assert(top.vy > 0, 'off the ceiling');
  assert(top.y >= B.RADIUS, 'and stays inside');
});

test('a hit brick breaks and turns the ball back', () => {
  const bricks = [{ r: 0, c: 3, hits: 1 }, { r: 0, c: 5, hits: 1 }];
  const result = B.advance(world(bricks, 3.5, rowY(0) + 0.6, 0, -6), 0.1);
  eq(result.struck.length, 1, 'one hit');
  eq(result.struck[0], bricks[0], 'the brick above');
  eq(result.world.bricks.length, 1, 'gone');
  eq(result.world.bricks[0], bricks[1], 'the other one stays');
  assert(result.world.ball.vy > 0, 'the ball goes back down');
  eq(bricks.length, 2, 'advance leaves the bricks alone');
});

test('a brick hit from the side turns the ball sideways', () => {
  const bricks = [{ r: 2, c: 4, hits: 1 }];
  const result = B.advance(world(bricks, 3.5, rowY(2), 6, 0), 0.1);
  eq(result.struck.length, 1, 'one hit');
  assert(result.world.ball.vx < 0, 'the ball goes back left');
});

test('a tough brick takes a hit for every ring', () => {
  const once = B.strike([{ r: 1, c: 2, hits: 3 }], 0);
  eq(once.length, 1, 'still there');
  eq(once[0].hits, 2, 'a hit less');
  eq(B.strike(B.strike(once, 0), 0).length, 0, 'gone after three');
});

test('the paddle catches the ball and a miss is lost', () => {
  const caught = B.advance(world([], 4.3, B.PADDLE_Y - 0.5, 0, 6), 0.2);
  assert(!caught.lost, 'caught');
  assert(caught.world.ball.vy < 0, 'going up again');
  assert(caught.world.ball.vx > 0, 'to the right, off the right half');
  near(Math.hypot(caught.world.ball.vx, caught.world.ball.vy), 6, 'at the same speed');
  const missed = B.advance(world([], 1, B.PADDLE_Y - 0.5, 0, 6), 0.5);
  assert(missed.lost, 'missed');
});

test('the ball never leaves the field or passes through a brick', () => {
  for (const seed of seeds.slice(0, 50)) {
    const rand = B.rng(seed);
    let w = B.newWorld(5, rand);
    const v = B.bounce(rand() * 2 - 1, B.MAX_SPEED);
    w = { ...w, ball: { ...w.ball, vx: v.vx, vy: v.vy } };
    for (let frame = 0; frame < 2000 && !B.isCleared(w); frame++) {
      /* A perfect player: the paddle is always under the ball. */
      w = { ...w, paddle: B.clampPaddle(w.ball.x) };
      const result = B.advance(w, 0.05);
      assert(!result.lost, `lost (seed ${seed}, frame ${frame})`);
      w = result.world;
      const b = w.ball;
      assert(b.x >= B.RADIUS - 1e-9 && b.x <= B.WIDTH - B.RADIUS + 1e-9 && b.y >= B.RADIUS - 1e-9, `outside (seed ${seed}, frame ${frame})`);
      eq(B.brickAt(w.bricks, b.x, b.y), -1, `inside a brick (seed ${seed}, frame ${frame})`);
      near(Math.hypot(b.vx, b.vy), B.MAX_SPEED, `speed (seed ${seed}, frame ${frame})`);
    }
  }
});

test('a new world serves the ball on the paddle', () => {
  const w = B.newWorld(1, B.rng(1));
  eq(w.ball.x, w.paddle, 'over the paddle');
  eq(w.ball.y, B.PADDLE_Y - B.RADIUS, 'resting on it');
  eq(w.ball.vx, 0, 'not moving');
  assert(!B.isCleared(w), 'with bricks to break');
  assert(B.isCleared({ ...w, bricks: [] }), 'cleared without them');
});

test('progress survives a round trip and bad saves are rejected', () => {
  eq(B.deserialize(B.serialize({ best: 1230 })).best, 1230, 'best');
  const save = (changes) => JSON.stringify({ version: 1, best: 0, ...changes });
  assert(B.deserialize(save({})) !== null, 'a save with no best yet');
  eq(B.deserialize(null), null, 'null');
  eq(B.deserialize('not json'), null, 'garbage');
  eq(B.deserialize(save({ version: 2 })), null, 'another version');
  eq(B.deserialize(save({ best: 2.5 })), null, 'fractional best');
  eq(B.deserialize(save({ best: -10 })), null, 'negative best');
  eq(B.deserialize(save({ best: '10' })), null, 'best as text');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
