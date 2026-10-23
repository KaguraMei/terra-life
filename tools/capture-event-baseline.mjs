// Captures current behaviour of events that are about to submit declared effects
// instead of writing state directly. Run once before the migration and commit the
// JSON; tests then prove the rewrite is behaviour-preserving.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {simulation} from './sim-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || 'tests/fixtures/event-effects-baseline.json';
const ids = process.argv.slice(3);
if (!ids.length) throw new Error('usage: node tools/capture-event-baseline.mjs <out.json> <eventId...>');

const {TL} = simulation({log() {}, warn() {}, error() {}});
const cases = [];
for (const [index, id] of ids.entries()) {
  const state = TL.newLife({seed: 5150 + index, nation: 'URS', race: 'ursus', bornYear: 1070});
  Object.assign(state, {
    age: 10, year: 1080, job: 'child', eduLevel: 0,
    flags: {}, evCount: {}, log: [], recent: []
  });
  TL.seedRng(900 + index);
  const definition = TL.EVMAP[id];
  if (!definition) throw new Error(`unknown event ${id}`);
  try {
    const text = definition.run(state, undefined);
    cases.push({
      id,
      text: typeof text === 'string' ? {t: text} : text,
      state: JSON.parse(JSON.stringify(state)),
      rngTail: Array.from({length: 8}, () => TL.rnd())
    });
  } catch (error) {
    // An event that cannot run on a generic state is not a mechanical migration
    // candidate; record it so the fixture stays a complete statement of intent.
    cases.push({id, skipped: String(error && error.message ? error.message : error)});
  }
}
fs.writeFileSync(path.resolve(root, out), `${JSON.stringify({ids, cases}, null, 2)}\n`, 'utf8');
const skipped = cases.filter(row => row.skipped).length;
console.log(`captured ${cases.length} cases (${skipped} skipped) -> ${out}`);
for (const row of cases) if (row.skipped) console.log(`  skipped ${row.id}: ${row.skipped}`);
