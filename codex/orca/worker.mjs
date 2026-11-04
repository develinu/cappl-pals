import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
let connection;
async function connect() {
  if (!connection) {
    const { stdout } = await run(process.env.CAPPL_PALS_NODE || 'node', [cli, 'url']);
    const url = new URL(stdout.trim());
    if (url.hostname !== '127.0.0.1') throw Error('Expected local companion');
    connection = { origin: url.origin, token: url.searchParams.get('token') || new URLSearchParams(url.hash.slice(1)).get('token') };
  }
  return connection;
}
export default function activate(orca) {
  orca.panels.handle('cappl.api', async ({ path, body, session }, { signal }) => {
    if (!['/view', '/press', '/command', '/language'].includes(path)) throw Error('Unknown companion action');
    const { origin, token } = await connect();
    const url = new URL(path, origin);
    if (session) url.searchParams.set('session', session);
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify({ ...body, session: session || undefined }) : undefined,
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)])
      });
      const result = await response.json();
      if (!response.ok) throw Error(result?.error || `Companion request failed (${response.status})`);
      return result;
    } catch (error) { connection = undefined; throw error; }
  });
}
