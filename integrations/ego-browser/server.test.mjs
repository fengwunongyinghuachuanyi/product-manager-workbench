import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEgo } from './runtime.mjs';
const sdk = new URL('../../AionUi/node_modules/@modelcontextprotocol/sdk/dist/esm/', import.meta.url);
const { Client } = await import(new URL('client/index.js', sdk));
const { StdioClientTransport } = await import(new URL('client/stdio.js', sdk));
const dir = await mkdtemp(join(tmpdir(), 'ego-adapter-test-'));
after(() => rm(dir, { recursive: true, force: true }));
async function fixture(name, body) {
  const path = join(dir, name);
  await writeFile(path, `#!/usr/local/bin/node\n${body}\n`, { mode: 0o700 });
  return path;
}
test('missing Ego executable fails without browser fallback', async () => {
  await assert.rejects(runEgo('', { executable: join(dir, 'missing') }), /ENOENT/);
});
test('stdout and diagnostics are kept separate', async () => {
  const executable = await fixture('success', 'process.stdin.resume(); process.stdin.on("end",()=>{console.log("OK"); console.error("notice")});');
  assert.deepEqual(await runEgo('hello', { executable }), { stdout: 'OK\n', stderr: 'notice\n' });
});
test('nonzero Ego exit returns real diagnostics', async () => {
  const executable = await fixture('failure', 'console.error("user took control"); process.exit(4);');
  await assert.rejects(runEgo('', { executable }), /user took control/);
});
test('timeout terminates a stuck child and reports possible partial effects', async () => {
  const executable = await fixture('timeout', 'setInterval(()=>{},1000);');
  await assert.rejects(runEgo('', { executable, timeout: 150 }), /部分操作生效/);
});
test('oversized output fails instead of silently losing operation state', async () => {
  const executable = await fixture('limit', 'console.log("x".repeat(10000)); setInterval(()=>{},1000);');
  await assert.rejects(runEgo('', { executable, maxBytes: 1024 }), /输出过大/);
});
test('MCP handshake, official help, invalid requests and image arguments', async () => {
  const transport = new StdioClientTransport({ command: '/usr/local/bin/node', args: [fileURLToPath(new URL('./server.mjs', import.meta.url))], stderr: 'pipe' });
  const client = new Client({ name: 'ego-adapter-test', version: '1' });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    assert.equal(catalog.tools.length, 3);
    const help = await client.callTool({ name: 'ego_browser_help', arguments: {} });
    assert.match(help.content[0].text, /exactly one TaskSpace/);
    for (const request of [
      { name: 'ego_browser_run', arguments: { script: '' } },
      { name: 'ego_browser_screenshot', arguments: { spaceId: -1, page: '../secret' } },
      { name: 'not-a-tool', arguments: {} },
    ]) assert.equal((await client.callTool(request)).isError, true);
  } finally { await client.close(); }
});
