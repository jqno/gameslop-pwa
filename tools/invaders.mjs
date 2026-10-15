/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../invaders/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'WIDTH', 'HEIGHT', 'ROWS', 'COLS', 'ALIEN_W', 'ALIEN_H', 'SPACE_X', 'MARGIN', 'DROP', 'LOWEST', 'PLAYER_Y',
  'PLAYER_W', 'PLAYER_H', 'SHIELD_Y', 'BLOCK', 'MAX_BOMBS', 'POINTS', 'rng', 'marchSpeed', 'bombRate', 'startY',
  'clampPlayer', 'alienAt', 'newShields', 'newWorld', 'fire', 'advance', 'isCleared', 'serialize', 'deserialize'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
