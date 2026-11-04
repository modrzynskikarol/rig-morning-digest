import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// Returns null for anything that is not a well-formed run line.
function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (!isNonEmptyString(at) || !isNonEmptyString(job) || !isStatus(status)) return null;
  if (typeof owner !== 'string' && owner !== null) return null;
  if (error === undefined) return { at, job, status, owner };
  if (typeof error !== 'string') return null;
  return { at, job, status, owner, error };
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function addToRow(row: DigestRow | undefined, line: RunLine): DigestRow {
  const previous: DigestRow = row ?? {
    job: line.job,
    owner: line.owner,
    runs: 0,
    retries: 0,
    fails: 0,
    lastStatus: line.status,
    lastError: null,
    firstAt: line.at,
    lastAt: line.at,
  };
  return {
    ...previous,
    owner: line.owner,
    runs: previous.runs + 1,
    retries: previous.retries + (line.status === 'retry' ? 1 : 0),
    fails: previous.fails + (line.status === 'fail' ? 1 : 0),
    lastStatus: line.status,
    lastError: line.error ?? previous.lastError,
    lastAt: line.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;

  const log = readLog(join(runsDir, `${night}.jsonl`));
  if (log === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const text of log.split(/\r?\n/)) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line === null) {
      badLines += 1;
      continue;
    }
    rows.set(line.job, addToRow(rows.get(line.job), line));
  }

  return {
    night,
    // Plain code-unit order: deterministic, and the page and the JSON share it.
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)),
    badLines,
  };
};
