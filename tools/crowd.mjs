/* Loads the game logic straight out of index.html, so the app stays a
 * single self-contained file with no build step. */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../crowd/index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!match) throw new Error('could not find <script id="app"> in index.html');

const EXPORTS = [
  'START', 'START_SPEED', 'SPEEDUP', 'speedFor', 'difficulty', 'bossShare', 'PAIRS', 'CLEAR', 'SPACING', 'CAP', 'MAX_RADIUS', 'MAX_CROWD', 'BOSS_FLOOR', 'BOSS_SIGHT', 'APPROACH', 'sightBoss', 'RAGE_TIME', 'PICKUP_R', 'PICKUPS', 'rng', 'applyGate', 'harmful', 'gateLabel',
  'fight', 'crowdRadius', 'crowdLayout', 'generateCourse', 'bestOutcome', 'newRun', 'applyItem',
  'serialize', 'deserialize', 'overlap', 'shaveLoss', 'bestX', 'bestMove'
];

const factory = new Function(`${match[1]}\nreturn { ${EXPORTS.join(', ')} };`);
export default factory();
