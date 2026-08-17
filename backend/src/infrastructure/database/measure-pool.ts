import { Pool } from 'pg';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is required to measure the application pool.');

const poolMax = parseBoundedInteger(process.env['DATABASE_POOL_MAX'], 'DATABASE_POOL_MAX', 1, 100);
const concurrency = parseBoundedInteger(
  process.env['POOL_MEASURE_CONCURRENCY'] ?? '8',
  'POOL_MEASURE_CONCURRENCY',
  2,
  100,
);
const holdMilliseconds = parseBoundedInteger(
  process.env['POOL_MEASURE_HOLD_MS'] ?? '250',
  'POOL_MEASURE_HOLD_MS',
  10,
  5_000,
);
const pool = new Pool({
  connectionString: databaseUrl,
  max: poolMax,
  min: 0,
  connectionTimeoutMillis: 5_000,
});

type Observation = Readonly<{ total: number; idle: number; waiting: number }>;
const observations: Observation[] = [];
const observe = () =>
  observations.push({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });

try {
  observe();
  const work = Array.from({ length: concurrency }, async () => {
    await pool.query('select pg_sleep($1)', [holdMilliseconds / 1_000]);
    observe();
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  observe();
  await Promise.all(work);
  observe();

  const peak = observations.reduce(
    (result, value) => ({
      total: Math.max(result.total, value.total),
      idle: Math.max(result.idle, value.idle),
      waiting: Math.max(result.waiting, value.waiting),
    }),
    { total: 0, idle: 0, waiting: 0 },
  );
  process.stdout.write(
    `${JSON.stringify({ poolMax, concurrency, holdMilliseconds, peak, final: observations.at(-1) })}\n`,
  );
} finally {
  await pool.end();
}

function parseBoundedInteger(
  value: string | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`);
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) throw new Error(`${name} is outside its safe range.`);
  return parsed;
}
