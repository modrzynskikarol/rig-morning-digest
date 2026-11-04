import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

type ApiDigest = { night: string; rows: DigestRow[]; badLines: number };

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-routes-'));
  const write = (night: string, lines: string[]) =>
    fs.writeFileSync(path.join(dir, `${night}.jsonl`), lines.length ? lines.join('\n') + '\n' : '');

  write(NORMAL, [
    line('2026-01-09T23:50:00+01:00', 'alpha/three-retries', 'retry', 'rook', 'timeout'),
    line('2026-01-09T23:55:00+01:00', 'alpha/three-retries', 'retry', 'rook', 'timeout'),
    line('2026-01-10T00:05:00+01:00', 'alpha/three-retries', 'retry', 'rook', 'timeout'),
    line('2026-01-10T00:10:00+01:00', 'alpha/three-retries', 'ok', 'rook'),
    line('2026-01-09T23:58:00+01:00', 'bravo/fail-then-ok', 'fail', 'lane-07', 'disk full'),
    line('2026-01-10T00:20:00+01:00', 'bravo/fail-then-ok', 'ok', 'lane-07'),
    line('2026-01-10T00:30:00+01:00', 'charlie/one-retry', 'retry', 'rook', 'blip'),
    line('2026-01-10T00:31:00+01:00', 'charlie/one-retry', 'ok', 'rook'),
    line('2026-01-10T01:00:00+01:00', 'delta/no-owner', 'ok', null),
  ]);
  write(EMPTY, []);
  write(BAD, [
    line('2026-01-12T01:00:00+01:00', 'echo/good', 'ok', 'rook'),
    '{"at":"2026-01-12T01:05:00+01:00","job":"echo/trunc","sta',
    JSON.stringify({ hello: 'world' }),
    line('2026-01-12T02:00:00+01:00', 'foxtrot/good', 'ok', 'rook'),
  ]);

  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** The opening <tr ...> tag of the row that holds `job`. */
function rowTag(html: string, job: string): string {
  const at = html.indexOf(job);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<tr', at);
  return html.slice(start, html.indexOf('>', start) + 1);
}

describe('GET /digest/:night', () => {
  it('answers 200 HTML for a normal night', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('alpha/three-retries');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no such night');
  });

  it.each(['abc', '..%2F..%2Fpackage'])('answers 404 for the malformed night %s', async (night) => {
    const res = await app.request(`/digest/${night}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no such night');
  });

  it('shows nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 0');
  });

  it('counts bad lines and keeps the valid rows', async () => {
    const res = await app.request(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('bad lines: 2');
    expect(html).toContain('echo/good');
    expect(html).toContain('foxtrot/good');
  });

  it('marks the 3-retry job and the fail-then-ok job, not the 1-retry job', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(rowTag(html, 'alpha/three-retries')).toContain('class="warn"');
    expect(rowTag(html, 'bravo/fail-then-ok')).toContain('class="warn"');
    expect(rowTag(html, 'charlie/one-retry')).not.toContain('class="warn"');
    expect(rowTag(html, 'delta/no-owner')).not.toContain('class="warn"');
  });

  it('renders a dash for a null owner', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const start = html.indexOf('delta/no-owner');
    const end = html.indexOf('</tr>', start);
    expect(html.slice(start, end)).toContain('—');
  });

  it('keeps the offset on times', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('2026-01-09T23:50:00+01:00');
    expect(html).toContain('2026-01-10T00:10:00+01:00');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 JSON for a normal night', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiDigest;
    expect(body.night).toBe(NORMAL);
    expect(body.rows).toHaveLength(4);
    expect(body.badLines).toBe(0);
  });

  it('answers 404 JSON for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it.each(['abc', '..%2F..%2Fpackage'])('answers 404 JSON for the malformed night %s', async (night) => {
    const res = await app.request(`/api/digest/${night}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('gives no rows and no bad lines for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts bad lines and keeps the valid rows', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiDigest;
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['echo/good', 'foxtrot/good']);
  });

  it('reports the counts and raw times that the page marks', async () => {
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as ApiDigest;
    const alpha = body.rows.find((r) => r.job === 'alpha/three-retries');
    const delta = body.rows.find((r) => r.job === 'delta/no-owner');
    expect(alpha?.retries).toBe(3);
    expect(alpha?.lastStatus).toBe('ok');
    expect(alpha?.firstAt).toBe('2026-01-09T23:50:00+01:00');
    expect(delta?.owner).toBeNull();
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as ApiDigest;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
