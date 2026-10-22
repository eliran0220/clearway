// Local runner: npm run data:refresh            (incremental, or full backfill on an empty table)
//               npm run data:refresh -- --since=2023-01
import { refreshTraffic } from './refresh';

const since = process.argv.find((a) => a.startsWith('--since='))?.split('=')[1];
const started = Date.now();

refreshTraffic({ since })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  })
  .catch((err) => {
    console.error('Refresh failed:', err);
    process.exit(1);
  });
