import type { DigestRow, NightDigest } from '../digest/types.js';

const DASH = '—';

function isMarked(row: DigestRow): boolean {
  return row.retries >= 3 || row.fails > 0;
}

function Row(props: { row: DigestRow }) {
  const r = props.row;
  const marked = isMarked(r);
  return (
    <tr class={marked ? 'warn' : undefined}>
      <td>{r.job}</td>
      <td>{r.owner ?? DASH}</td>
      <td>{r.runs}</td>
      <td>{r.retries}</td>
      <td>{r.fails}</td>
      <td>{r.lastStatus}</td>
      <td>{r.lastError ?? DASH}</td>
      <td>{r.firstAt}</td>
      <td>{r.lastAt}</td>
      <td>{marked ? (r.fails > 0 ? 'fail' : 'retries') : DASH}</td>
    </tr>
  );
}

export function DigestPage(props: { digest: NightDigest }) {
  const { night, rows, badLines } = props.digest;
  return (
    <>
      <h1>digest {night}</h1>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
      {badLines > 0 ? <p class="warn">bad lines: {badLines}</p> : <p class="mute">bad lines: 0</p>}
    </>
  );
}
