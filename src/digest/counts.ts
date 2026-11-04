import type { NightDigest } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Log lines across all rows, not jobs.
export function nightCounts(digest: NightDigest): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) {
    counts.retry += row.retries;
    counts.fail += row.fails;
    counts.ok += row.runs - row.retries - row.fails;
  }
  return counts;
}
