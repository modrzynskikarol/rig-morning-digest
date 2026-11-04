import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { nightCounts } from '../src/digest/counts.js';
import type { NightDigest } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('board links', () => {
  it('links each night to its digest with its counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toMatch(/2026-10-27<\/a>\s*ok 7 · retry 0 · fail 0/);
    expect(html).toMatch(/2026-10-28<\/a>\s*ok 10 · retry 4 · fail 1/);
  });
});

describe('nightCounts', () => {
  it('counts log lines across rows', () => {
    const row = { owner: null, lastStatus: 'ok' as const, lastError: null, firstAt: '', lastAt: '' };
    const digest: NightDigest = {
      night: '2026-01-01',
      badLines: 0,
      rows: [
        { ...row, job: 'a', runs: 5, retries: 1, fails: 1 },
        { ...row, job: 'b', runs: 2, retries: 0, fails: 0 },
      ],
    };
    expect(nightCounts(digest)).toEqual({ ok: 5, retry: 1, fail: 1 });
    expect(nightCounts({ ...digest, rows: [] })).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
