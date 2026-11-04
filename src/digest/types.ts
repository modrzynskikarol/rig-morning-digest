export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Owner on the job's last line. */
  owner: string | null;
  /** All valid lines for the job. */
  runs: number;
  /** Lines with status retry. */
  retries: number;
  /** Lines with status fail; a job can fail earlier and end ok. */
  fails: number;
  lastStatus: DigestStatus;
  /** Most recent `error` seen for the job, even if a later line succeeded. */
  lastError: string | null;
  /** Raw string from the log, offset kept, never converted. */
  firstAt: string;
  /** Raw string from the log, offset kept, never converted. */
  lastAt: string;
};

export type NightDigest = {
  night: string;
  /** Sorted by job. */
  rows: DigestRow[];
  badLines: number;
};

/**
 * readNight(runsDir, night)
 * Returns null when there is no such file, or `night` is not `YYYY-MM-DD`.
 * An empty file gives `rows: []`.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
