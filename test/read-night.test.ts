import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const NIGHT = '2026-01-01';

describe('readNight on the real night', () => {
  const digest = readNight('runs', '2026-10-28');
  const row = (job: string) => digest?.rows.find((r) => r.job === job);

  it('finds 5 jobs and 1 bad line, sorted by job', () => {
    expect(digest?.night).toBe('2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('counts retries and keeps the last error after a later ok', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
  });

  it('counts fails', () => {
    expect(row('notes/backup')?.fails).toBe(1);
  });

  it('keeps the raw times and offset across midnight', () => {
    expect(row('lane/sync')).toMatchObject({
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight on temp files', () => {
  let dir: string;
  const line = (fields: object) => JSON.stringify(fields);
  const valid = { at: 'T1', job: 'a/job', status: 'ok', owner: 'rook' };
  const read = (content: string) => {
    writeFileSync(join(dir, `${NIGHT}.jsonl`), content);
    return readNight(dir, NIGHT);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'read-night-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives no rows and no bad lines for an empty file', () => {
    expect(read('')).toEqual({ night: NIGHT, rows: [], badLines: 0 });
  });

  it('does not count blank or whitespace-only lines as bad', () => {
    const digest = read(`${line(valid)}\n\n   \t\n`);
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows).toHaveLength(1);
  });

  it('tolerates CRLF', () => {
    const digest = read(`${line(valid)}\r\n${line(valid)}\r\n`);
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows[0]?.runs).toBe(2);
  });

  it.each([
    ['truncated JSON', '{"at":"T1","job":"a/jo'],
    ['a bad status', line({ ...valid, status: 'done' })],
    ['a missing owner', line({ at: 'T1', job: 'a/job', status: 'ok' })],
    ['a non-string owner', line({ ...valid, owner: 7 })],
    ['an empty at', line({ ...valid, at: '' })],
    ['an empty job', line({ ...valid, job: '' })],
    ['a non-string error', line({ ...valid, error: 503 })],
    ['a JSON array', '[1,2]'],
    ['a JSON number', '42'],
    ['JSON null', 'null'],
  ])('counts %s as one bad line', (_name, bad) => {
    expect(read(`${bad}\n`)).toEqual({ night: NIGHT, rows: [], badLines: 1 });
  });

  it('keeps fails and ends ok for a job that fails then succeeds', () => {
    const digest = read(
      [
        line({ ...valid, at: 'T1', status: 'fail', error: 'boom' }),
        line({ ...valid, at: 'T2', status: 'ok', owner: null }),
      ].join('\n'),
    );
    expect(digest?.rows).toEqual([
      {
        job: 'a/job',
        owner: null,
        runs: 2,
        retries: 0,
        fails: 1,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: 'T1',
        lastAt: 'T2',
      },
    ]);
  });

  it('sorts by code unit, not locale', () => {
    const digest = read(['b', 'a', 'Z'].map((job) => line({ ...valid, job })).join('\n'));
    expect(digest?.rows.map((r) => r.job)).toEqual(['Z', 'a', 'b']);
  });

  it('gives null for a missing file', () => {
    expect(readNight(dir, NIGHT)).toBeNull();
  });

  it('propagates read errors other than a missing file', () => {
    mkdirSync(join(dir, `${NIGHT}.jsonl`));
    expect(() => readNight(dir, NIGHT)).toThrow();
  });

  // Each target file exists, so a null can only come from the night check.
  it.each([
    ['../x', '../x.jsonl'],
    ['2026-10-28.jsonl', '2026-10-28.jsonl.jsonl'],
    ['abc', 'abc.jsonl'],
  ])('gives null for the night %s without reading it', (night, file) => {
    const runsDir = join(dir, 'runs');
    mkdirSync(runsDir);
    writeFileSync(join(runsDir, file), `${line(valid)}\n`);
    expect(readNight(runsDir, night)).toBeNull();
  });
});
