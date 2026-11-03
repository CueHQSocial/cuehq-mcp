// run: npm test (builds first). the stdio bridge as an mcp client sees it
// (block 492): without a key, with a malformed key, with a well-formed key
// that cannot connect, and, when CUEHQ_API_KEY is set, with that key against
// the live server. CUEHQ_MCP_TEST_COMMAND runs the same tests through another
// command instead of `node dist/index.js`, for example
//   CUEHQ_MCP_TEST_COMMAND="docker run -i --rm -e CUEHQ_API_KEY -e CUEHQ_MCP_URL cuehq-mcp:test"
// (docker forwards each named variable only when it is set in this process).
// the command is split on whitespace, so no argument may contain a space.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { SNAPSHOT } from '../dist/snapshot.js';

const AGENTS_URL = 'https://www.cuehq.social/agents';
const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const COMMAND = (process.env.CUEHQ_MCP_TEST_COMMAND ?? '').trim();
const LIVE_KEY = (process.env.CUEHQ_API_KEY ?? '').trim();
const SNAPSHOT_NAMES = SNAPSHOT.tools.map((t) => t.name);

// the command and env for one run: the default environment (PATH, HOME and
// the like, never this process's CUEHQ_* variables) plus what the test sets.
function params(env) {
  const base = getDefaultEnvironment();
  delete base.CUEHQ_API_KEY;
  delete base.CUEHQ_MCP_URL;
  const full = { ...base, ...env };
  if (COMMAND) {
    const [command, ...args] = COMMAND.split(/\s+/);
    return { command, args, env: full };
  }
  return { command: process.execPath, args: [DIST], env: full };
}

async function connect(env) {
  const chunks = [];
  const transport = new StdioClientTransport({ ...params(env), stderr: 'pipe' });
  transport.stderr?.on('data', (d) => chunks.push(String(d)));
  const client = new Client({ name: 'cuehq-mcp-test', version: '0.0.0' });
  await client.connect(transport);
  return { client, stderr: () => chunks.join(''), close: () => client.close() };
}

// the paths that exit: the code and stderr of a run that is given no input.
function run(env) {
  return new Promise((resolve) => {
    const p = params(env);
    const child = spawn(p.command, p.args, { env: p.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('close', (code) => resolve({ code, stderr }));
    child.stdin.end();
  });
}

test('the snapshot holds the seven tools', () => {
  assert.equal(SNAPSHOT_NAMES.length, 7);
  assert.deepEqual(SNAPSHOT_NAMES, ['brands', 'list_cues', 'get_cue', 'draft_reply', 'mark_replied', 'skip_cue', 'weekly_report']);
  assert.match(SNAPSHOT.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('without a key: initialize answers, tools/list is the snapshot, every tool call is an error naming the key', async () => {
  const s = await connect({});
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((t) => t.name), SNAPSHOT_NAMES);
  assert.equal(s.client.getInstructions(), SNAPSHOT.instructions || undefined);
  for (const name of ['brands', 'list_cues']) {
    const r = await s.client.callTool({ name, arguments: {} });
    assert.equal(r.isError, true, `${name} is an error`);
    assert.deepEqual(r.content, [{ type: 'text', text: `Set CUEHQ_API_KEY to a key from CueHQ settings, agents. ${AGENTS_URL}` }]);
  }
  await assert.rejects(s.client.callTool({ name: 'no_such_tool', arguments: {} }), /Tool no_such_tool not found/, 'a name outside the snapshot is tool-not-found, not a key problem');
  await s.close();
  assert.match(s.stderr(), /^cuehq-mcp: running without a key\. Set CUEHQ_API_KEY/m);
});

test('a malformed key: the same, with the malformed message', async () => {
  const s = await connect({ CUEHQ_API_KEY: 'not-a-key' });
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((t) => t.name), SNAPSHOT_NAMES);
  const r = await s.client.callTool({ name: 'brands', arguments: {} });
  assert.equal(r.isError, true);
  assert.deepEqual(r.content, [{ type: 'text', text: `CUEHQ_API_KEY is not a CueHQ key. It starts with cuehq_sk_. ${AGENTS_URL}` }]);
  await s.close();
  assert.match(s.stderr(), /running without a key\. CUEHQ_API_KEY is not a CueHQ key/);
});

test('a well-formed key that cannot connect exits 1 with the connect message, as before', async () => {
  const r = await run({ CUEHQ_API_KEY: 'cuehq_sk_' + 'a'.repeat(32), CUEHQ_MCP_URL: 'http://127.0.0.1:9/mcp' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^cuehq-mcp: Could not connect to http:\/\/127\.0\.0\.1:9\/mcp \(.*\)\. Check the key in CueHQ settings, agents\.$/m);
});

test('a bad CUEHQ_MCP_URL exits 1, with or without a key', async () => {
  for (const env of [{ CUEHQ_MCP_URL: 'https://evil.example/mcp' }, { CUEHQ_API_KEY: 'cuehq_sk_' + 'a'.repeat(32), CUEHQ_MCP_URL: 'https://evil.example/mcp' }]) {
    const r = await run(env);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /CUEHQ_MCP_URL must be https:\/\/www\.cuehq\.social\/mcp or a localhost URL\./);
  }
});

test('with the key in CUEHQ_API_KEY: the live tools match the snapshot and brands answers', { skip: LIVE_KEY ? false : 'CUEHQ_API_KEY is not set' }, async () => {
  const s = await connect({ CUEHQ_API_KEY: LIVE_KEY });
  const { tools } = await s.client.listTools();
  assert.deepEqual(tools.map((t) => t.name), SNAPSHOT_NAMES, 'the live server lists the snapshot\'s tools');
  assert.deepEqual(tools, SNAPSHOT.tools, 'the snapshot is exactly what the live server lists; on drift run npm run snapshot');
  assert.equal(s.client.getInstructions(), SNAPSHOT.instructions || undefined, 'the snapshot carries the live instructions; on drift run npm run snapshot');
  const r = await s.client.callTool({ name: 'brands', arguments: {} });
  assert.notEqual(r.isError, true, 'brands is not an error');
  assert.ok(Array.isArray(r.content) && r.content.length > 0, 'brands has content');
  await s.close();
  assert.doesNotMatch(s.stderr(), /running without a key/);
});
