# Game ideas

- [ ] Star Battle
- [ ] Flappy (a clone of Flappy Bird)
- [ ] FreeCell
- [ ] Nonograms (a.k.a. Picross), with real pictures

# Implementation ideas

## Nonograms

Random grids make dull puzzles; the fun is the picture appearing. Get pictures from
emoji instead of drawing them:

- Render an emoji large on an offscreen canvas, downsample to the grid size, and
  threshold on darkness. Show the emoji and its name as the reveal when solved.
- Keep the colours for a colour-nonogram mode.
- Every puzzle must have exactly one solution reachable by logic alone. Use a
  line solver (per row/column: intersect all placements consistent with the clues,
  repeat until stable). Reject the picture if it doesn't solve fully, or flip a few
  pixels until it does.
- Also reject pictures that are too empty, too full, or that don't read as anything.
- Emoji look different per platform, so either run the pipeline on the device, or
  run it once in `tools/` and ship a fixed, curated puzzle list (more predictable).

Keeping the set large:

- Unicode has ~1,400 distinct emoji once skin tones, flags and family
  combinations are dropped. Even if most get rejected, a few hundred should survive.
- Each emoji gives several puzzles: different grid sizes (10×10, 15×15, 20×20),
  mirrored versions, a black-and-white and a colour version. Different sizes are
  different puzzles, not reskins.
- Other glyph sources: dingbats and symbol fonts, and CJK characters (thousands,
  and they make good puzzles, even if they're not pictures of things).
- Never repeat a puzzle until the whole set has been played.
