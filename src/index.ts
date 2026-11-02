#!/usr/bin/env node
// cuehq-mcp: the cuehq mcp server as a local command. it speaks mcp over stdio
// to the agent that started it and forwards every tools/list and tools/call to
// the remote server at CUEHQ_MCP_URL (default https://www.cuehq.social/mcp)
// with `Authorization: Bearer ${CUEHQ_API_KEY}`. it holds no state and adds no
// tools of its own: the remote server is the authority on every answer.
//
// env:
//   CUEHQ_API_KEY  required. a key made in cuehq settings, agents (cuehq_sk_…).
//   CUEHQ_MCP_URL  optional. another endpoint on www.cuehq.social, or localhost
//                  for testing; anything else exits.

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const VERSION = '0.1.1';
const DEFAULT_URL = 'https://www.cuehq.social/mcp';
const KEY_RE = /^cuehq_sk_[0-9A-Za-z]{32}$/;

// one line on stderr, then exit 1. stdout belongs to the mcp stream.
function fail(line: string): never {
  process.stderr.write(`cuehq-mcp: ${line}\n`);
  process.exit(1);
}

const key = (process.env.CUEHQ_API_KEY ?? '').trim();
if (!key) fail('Set CUEHQ_API_KEY to a key from CueHQ settings, agents.');
if (!KEY_RE.test(key)) fail('CUEHQ_API_KEY is not a CueHQ key. It starts with cuehq_sk_.');

// the key goes to whatever this names, so only cuehq itself (https, the www
// host) or a local server for testing may stand in for the default.
const URL_RULE = 'CUEHQ_MCP_URL must be https://www.cuehq.social/mcp or a localhost URL.';
function allowedUrl(u: URL): boolean {
  if (u.username || u.password) return false;
  if (u.protocol === 'https:' && u.host === 'www.cuehq.social') return true;
  return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

let url: URL;
try {
  url = new URL(process.env.CUEHQ_MCP_URL || DEFAULT_URL);
} catch {
  fail(URL_RULE);
}
if (!allowedUrl(url)) fail(URL_RULE);

const remote = new Client({ name: 'cuehq-mcp', version: VERSION });
try {
  await remote.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
  );
} catch (e) {
  const reason = e instanceof Error ? e.message.split('\n')[0] : 'unknown error';
  fail(`Could not connect to ${url.href} (${reason}). Check the key in CueHQ settings, agents.`);
}

serveStdio(() => {
  const server = new Server(
    { name: 'cuehq', version: VERSION },
    { capabilities: { tools: {} }, instructions: remote.getInstructions() },
  );
  server.setRequestHandler('tools/list', async (request) => remote.listTools(request.params));
  server.setRequestHandler('tools/call', async (request) => remote.callTool(request.params));
  return server;
});
