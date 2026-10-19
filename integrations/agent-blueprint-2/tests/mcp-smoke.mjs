import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = new Client({ name: 'blueprint-integration-check', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')] }));
const listed = await client.listTools();
console.log('Tools:', listed.tools.map(t => t.name).join(', '));
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const data = JSON.parse(result.content[0].text);
  if (result.isError) throw new Error(JSON.stringify(data));
  return data;
}
console.log('Health:', JSON.stringify(await call('blueprint_health')));
if (process.argv.includes('--real')) {
  const existing = process.argv.find(a => a.startsWith('--job='));
  const job = existing ? { id: existing.split('=')[1] } : await call('blueprint_plan', { idea: '做一个个人用的需求整理助手。用户粘贴会议记录，助手提取需求、证据原句和待确认问题，输出本地 Markdown 草稿。只处理当前粘贴文本，不联网、不读其他文件、不发送消息、不修改源文件、不做持久记忆。界面仅需输入和预览，用户自行确认后保存。先做可验证的最小方案，未知事实明确标记待确认。', max_calls: 12, max_tokens: 200000 });
  console.log('REAL_JOB', job.id);
  while (true) {
    const state = await call('blueprint_status', { job_id: job.id });
    console.log(JSON.stringify({ id: job.id, status: state.status, stages: state.stages, usage: state.usage, progress: state.progress, error: state.error }));
    if (state.status !== 'running') {
      console.log('RESULT', JSON.stringify(await call('blueprint_result', { job_id: job.id })));
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 20000));
  }
}
await client.close();
