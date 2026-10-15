import F from './flappy.mjs';

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

/* Always picks the middle of the range. */
const middle = () => 0.5;

/* A world with the bird at y and these pipes, falling at vy. */
function world(y, pipes, vy = 0) {
  return { y, vy, pipes: pipes.map((p) => ({ passed: false, ...p })) };
}

/* A pipe far off to the right, out of the way. */
const away = { x: F.FIRST, gap: F.GROUND / 2 };

test('a new world has the bird in the air and one pipe coming in', () => {
  const w = F.newWorld(middle);
  eq(w.y, F.GROUND / 2, 'bird halfway up');
  eq(w.vy, 0, 'not falling yet');
  eq(w.pipes.length, 1, 'one pipe');
  assert(w.pipes[0].x >= F.WIDTH, 'off to the right');
  assert(F.SPACING - F.JITTER > F.PIPE_W + 2, 'room between pipes');
  assert(F.SPACING + F.JITTER < F.WIDTH - F.BIRD_X, 'the next pipe is in view before the bird reaches this one');
});

test('gaps stay inside the field and do not jump too far', () => {
  eq(F.nextGap(F.GAP_HIGH, F.SPACING, () => 1), F.GAP_HIGH, 'not too low');
  eq(F.nextGap(F.GAP_LOW, F.SPACING, () => 0), F.GAP_LOW, 'not too high');
  eq(F.nextGap(6, F.SPACING, middle), 6, 'the middle of the range stays put');
  assert(F.GAP_LOW - F.GAP / 2 > 0, 'room above the top gap');
  assert(F.GAP_HIGH + F.GAP / 2 < F.GROUND, 'room below the bottom gap');
  const rand = F.rng(1);
  let gap = F.GROUND / 2;
  for (let i = 0; i < 1000; i++) {
    const next = F.nextGap(gap, F.nextSpacing(rand), rand);
    assert(Math.abs(next - gap) <= F.SHIFT + 1e-9, 'shift');
    assert(next >= F.GAP_LOW && next <= F.GAP_HIGH, 'range');
    gap = next;
  }
});

test('the bird falls, and flaps back up', () => {
  const w = world(5, [away]);
  const fell = F.advance(w, 0.2, middle).world;
  assert(fell.y > w.y, 'falls');
  assert(fell.vy > 0, 'faster and faster');
  const flapped = F.advance(F.flap(w), 0.1, middle).world;
  assert(flapped.y < w.y, 'flaps up');
});

test('the bird falls no faster than a limit', () => {
  let w = world(F.BIRD_R, [away]);
  for (let i = 0; i < 20; i++) w = F.advance(w, 0.02, middle).world;
  assert(w.vy <= F.MAX_FALL, 'limited');
});

test('the bird bumps its head on the top, but lives', () => {
  const result = F.advance(world(F.BIRD_R + 0.05, [away], F.FLAP), 0.05, middle);
  assert(!result.dead, 'alive');
  eq(result.world.y >= F.BIRD_R, true, 'stays inside');
  assert(result.world.vy >= 0, 'stops rising');
});

test('the bird dies on the ground', () => {
  const result = F.advance(world(F.GROUND - F.BIRD_R - 0.01, [away], 5), 0.05, middle);
  assert(result.dead, 'dead');
  eq(result.world.y, F.GROUND - F.BIRD_R, 'on the ground');
});

test('the bird touches a pipe above or below its gap, but not inside it', () => {
  const pipe = { x: F.BIRD_X - F.PIPE_W / 2, gap: 6 };
  assert(!F.hitsPipe(6, pipe), 'in the middle of the gap');
  assert(F.hitsPipe(6 - F.GAP / 2 + F.BIRD_R - 0.01, pipe), 'top');
  assert(F.hitsPipe(6 + F.GAP / 2 - F.BIRD_R + 0.01, pipe), 'bottom');
  const ahead = { x: F.BIRD_X + F.BIRD_R + 0.01, gap: 6 };
  assert(!F.hitsPipe(1, ahead), 'not before it gets there');
  const corner = { x: F.BIRD_X + F.BIRD_R * 0.9, gap: 6 };
  assert(!F.hitsPipe(6 - F.GAP / 2 + F.BIRD_R * 0.9, corner), 'just past the corner');
});

test('flying into a pipe is the end', () => {
  const pipe = { x: F.BIRD_X + F.BIRD_R + 0.02, gap: 9 };
  assert(F.advance(world(3, [pipe]), 0.05, middle).dead, 'dead');
});

test('getting past a pipe is a point, once', () => {
  const pipe = { x: F.BIRD_X - F.BIRD_R - F.PIPE_W + 0.02, gap: 5 };
  const first = F.advance(world(5, [pipe]), 0.05, middle);
  assert(!first.dead, 'alive');
  eq(first.passed, 1, 'one point');
  eq(F.advance(first.world, 0.05, middle).passed, 0, 'not again');
});

test('the spacing between pipes varies, within limits, and close pipes shift less', () => {
  eq(F.nextSpacing(() => 0), F.SPACING - F.JITTER, 'closest');
  eq(F.nextSpacing(() => 1), F.SPACING + F.JITTER, 'furthest');
  const up = (spacing) => F.GAP_HIGH - F.nextGap(F.GAP_HIGH, spacing, () => 0);
  eq(up(F.SPACING), F.SHIFT, 'a full shift at the usual spacing');
  eq(up(F.SPACING + F.JITTER), F.SHIFT, 'and no more further apart');
  assert(up(F.SPACING - F.JITTER) < F.SHIFT, 'less when closer');
});

test('pipes scroll off to the left and new ones come in off screen, spaced apart', () => {
  const rand = F.rng(7);
  let w = F.newWorld(rand);
  for (let i = 0; i < 400; i++) {
    /* Keep the bird in the middle of the gap ahead, so it never crashes. */
    const ahead = w.pipes.find((p) => p.x + F.PIPE_W > F.BIRD_X - F.BIRD_R);
    w = { ...w, y: ahead.gap, vy: 0 };
    const before = w.pipes[w.pipes.length - 1];
    const result = F.advance(w, 0.05, rand);
    assert(!result.dead, `crashed at frame ${i}`);
    w = result.world;
    const after = w.pipes[w.pipes.length - 1];
    if (after.x > before.x) assert(after.x > F.WIDTH, 'new pipes appear off screen');
    for (const p of w.pipes) assert(p.x + F.PIPE_W > 0, 'gone once off screen');
    w.pipes.slice(1).forEach((p, k) => {
      const d = p.x - w.pipes[k].x;
      assert(d >= F.SPACING - F.JITTER - 1e-9 && d <= F.SPACING + F.JITTER + 1e-9, 'spacing');
    });
  }
});

test('a game scores as many points as pipes it got past', () => {
  for (let s = 0; s < SEEDS; s++) {
    const rand = F.rng(s * 7919 + 1);
    let w = F.newWorld(rand);
    let score = 0;
    /* Each pipe by where it started, which stays put as everything scrolls. */
    let flown = 0;
    const behind = new Set();
    for (let frame = 0; frame < 2000; frame++) {
      /* Flap whenever below the middle of the gap ahead. */
      const ahead = w.pipes.find((p) => p.x + F.PIPE_W > F.BIRD_X - F.BIRD_R);
      if (w.y > ahead.gap + 0.6 && w.vy > 0) w = F.flap(w);
      const result = F.advance(w, 1 / 60, rand);
      w = result.world;
      score += result.passed;
      if (result.dead) break;
      flown += F.SPEED / 60;
      w.pipes
        .filter((p) => p.x + F.PIPE_W < F.BIRD_X - F.BIRD_R)
        .forEach((p) => behind.add((p.x + flown).toFixed(3)));
      const where = `(seed ${s}, frame ${frame})`;
      assert(w.y >= F.BIRD_R && w.y + F.BIRD_R <= F.GROUND, `bird outside ${where}`);
    }
    eq(score, behind.size, `score (seed ${s})`);
    assert(score > 0, `got somewhere (seed ${s})`);
  }
});

test('progress survives a round trip and bad saves are rejected', () => {
  eq(F.deserialize(F.serialize({ best: 42 })).best, 42, 'best');
  const save = (changes) => JSON.stringify({ version: 1, best: 0, ...changes });
  assert(F.deserialize(save({})) !== null, 'a save with no best yet');
  eq(F.deserialize(null), null, 'null');
  eq(F.deserialize('not json'), null, 'garbage');
  eq(F.deserialize(save({ version: 2 })), null, 'another version');
  eq(F.deserialize(save({ best: 2.5 })), null, 'fractional best');
  eq(F.deserialize(save({ best: -10 })), null, 'negative best');
  eq(F.deserialize(save({ best: '10' })), null, 'best as text');
});

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures ? 1 : 0);
