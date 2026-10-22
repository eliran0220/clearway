// Import official files into Postgres. Run from the repo root:
//   npm run data:import -- airports
//   npm run data:import -- t100 data/raw/t100-2025/T_T100_SEGMENT_ALL_CARRIER.csv data/raw/t100-2026/T_T100_SEGMENT_ALL_CARRIER.csv
//   npm run data:import -- delays data/raw/delays/Airline_Delay_Cause.csv
import { createDb } from '@clearway/db';
import { importAirports, importDelays, importT100 } from './importers';

const [command, ...args] = process.argv.slice(2);
const usage = `Usage:
  npm run data:import -- airports [path/to/airports.csv]
  npm run data:import -- t100 <T_T100_SEGMENT_ALL_CARRIER.csv> [more files...]
  npm run data:import -- delays <Airline_Delay_Cause.csv>`;

async function main() {
  const db = createDb();
  const started = Date.now();
  let result: unknown;
  switch (command) {
    case 'airports':
      result = await importAirports(db, { file: args[0] });
      break;
    case 't100':
      result = await importT100(db, args);
      break;
    case 'delays':
      if (!args[0]) throw new Error(usage);
      result = await importDelays(db, args[0]);
      break;
    default:
      throw new Error(usage);
  }
  console.log(JSON.stringify(result, null, 2));
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
