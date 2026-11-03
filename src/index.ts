#!/usr/bin/env node
// cuehq-mcp: the cuehq mcp server as a local command. it speaks mcp over stdio
// to the agent that started it and forwards every tools/list and tools/call to
// the remote server at CUEHQ_MCP_URL (default https://www.cuehq.social/mcp)
// with `Authorization: Bearer ${CUEHQ_API_KEY}`. it holds no state and adds no
// tools of its own: with a working key the remote server is the authority on
// every answer.
//
// without a usable key (block 492: none, or one not in cuehq_sk_ form) the
// command still starts, so a directory can introspect it: initialize is
// answered, tools/list comes from src/snapshot.ts (the live server's tools and
// instructions, refreshed with `npm run snapshot`), and every tools/call of a
// snapshot tool is an isError result naming the key problem and where a key
// comes from (a name not in the snapshot is the usual tool-not-found error).
// one stderr line says the command runs without a key. a well-formed key that
// cannot connect, or gets no answer in CONNECT_TIMEOUT_MS, still exits with
// the message it always had.
//
// env:
//   CUEHQ_API_KEY  a key made in cuehq settings, agents (cuehq_sk_…). without
//                  one, see above: nothing can be called.
//   CUEHQ_MCP_URL  optional. another endpoint on www.cuehq.social, or localhost
//                  for testing; anything else exits (src/url-rule.ts).

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ProtocolError, ProtocolErrorCode, Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SNAPSHOT } from './snapshot.js';
import { endpointFromEnv, URL_RULE } from './url-rule.js';

const VERSION = '0.1.1';
const KEY_RE = /^cuehq_sk_[0-9A-Za-z]{32}$/;
const AGENTS_URL = 'https://www.cuehq.social/agents';
const KEY_MISSING = 'Set CUEHQ_API_KEY to a key from CueHQ settings, agents.';
const KEY_MALFORMED = 'CUEHQ_API_KEY is not a CueHQ key. It starts with cuehq_sk_.';
const CONNECT_TIMEOUT_MS = 20_000;

// one line on stderr, then exit 1. stdout belongs to the mcp stream.
function fail(line: string): never {
  process.stderr.write(`cuehq-mcp: ${line}\n`);
  process.exit(1);
}

const key = (process.env.CUEHQ_API_KEY ?? '').trim();
// why there is no usable key, or null. the text every tool call gets back.
const keyProblem = !key ? KEY_MISSING : !KEY_RE.test(key) ? KEY_MALFORMED : null;

const url = endpointFromEnv(process.env.CUEHQ_MCP_URL);
if (!url) fail(URL_RULE);

if (keyProblem !== null) {
  process.stderr.write(
    `cuehq-mcp: running without a key. ${keyProblem} tools/list is a snapshot from ${SNAPSHOT.generatedAt.slice(0, 10)} and every tool call fails until a key is set. ${AGENTS_URL}\n`,
  );
  serveStdio(() => {
    const server = new Server(
      { name: 'cuehq', version: VERSION },
      { capabilities: { tools: {} }, instructions: SNAPSHOT.instructions || undefined },
    );
    server.setRequestHandler('tools/list', async () => ({ tools: SNAPSHOT.tools }));
    server.setRequestHandler('tools/call', async (request) => {
      const name = request.params.name;
      if (!SNAPSHOT.tools.some((t) => t.name === name)) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${name} not found`);
      }
      return { content: [{ type: 'text' as const, text: `${keyProblem} ${AGENTS_URL}` }], isError: true };
    });
    return server;
  });
} else {
  const remote = new Client({ name: 'cuehq-mcp', version: VERSION });
  // a connect that never settles (a dropped packet, a stalled lookup) would
  // leave the agent waiting with no line on stderr; the timer turns it into
  // the same exit as a refused connection.
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      remote.connect(
        new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${CONNECT_TIMEOUT_MS / 1000}s`)), CONNECT_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    const reason = e instanceof Error ? e.message.split('\n')[0] : 'unknown error';
    fail(`Could not connect to ${url.href} (${reason}). Check the key in CueHQ settings, agents.`);
  } finally {
    clearTimeout(timer);
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
}
