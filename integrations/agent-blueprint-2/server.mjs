import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
const root = dirname(fileURLToPath(import.meta.url));
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const job = { job_id: { type: 'string', pattern: '^[a-f0-9]{12}$', description: '任务返回的 ID' } };
const limits = { max_calls: { type: 'integer', minimum: 1, maximum: 32 }, max_tokens: { type: 'integer', minimum: 1000, maximum: 1000000 } };
const definitions = [
  ['health', '检查内置蓝图 Python 引擎、ChatGPT 登录状态和云端模型配置。', {}, []],
  ['plan', '启动真实正向蓝图流程：点子/PRD → 需求拆解、五要素、组件选型、架构设计、审稿。返回任务 ID，需轮询 status。使用已登录 ChatGPT 账号调用云端模型。', { idea: { type: 'string', description: '用户的点子或完整 PRD 文本' }, prd_path: { type: 'string', description: '可选 UTF-8 PRD 文件绝对路径' }, ...limits }, []],
  ['audit', '启动真实逆向蓝图：扫描指定本机项目并云端推理，生成差距报告和应有 PRD。静态扫描不能证明生产可用。返回任务 ID，需轮询 status。', { project_path: { type: 'string', description: '用户明确指定的项目文件夹绝对路径' }, prd_path: { type: 'string' }, ...limits }, ['project_path']],
  ['status', '查看任务阶段、运行状态、错误、调用/token 用量。completed_draft 表示审稿未通过，必须如实说明。', job, ['job_id']],
  ['resume', '断点续跑已中断/失败任务，校验并复用阶段缓存；累计调用与 token 预算不会重置。', job, ['job_id']],
  ['result', '列出成果路径或读取指定成果正文；必须展示真实审稿结果。', { ...job, artifact: { type: 'string', enum: ['方案.md', 'plan.json', '差距报告.md', '本该有的PRD.md', 'audit.json', 'inventory.json'] } }, ['job_id']],
  ['cancel', '取消正在运行的蓝图任务，保留阶段文件。', job, ['job_id']],
];
const server = new Server({ name: 'agent-blueprint-2', version: '1.0.0' }, { capabilities: { tools: {} }, instructions: '真实的 Agent 蓝图 2.0 Python 引擎。任务后台执行；开始后用 status 查询，结束后用 result 读取成果。模型经本机已登录 Codex 在云端运行。' });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions.map(([action, description, properties, required]) => ({ name: `blueprint_${action}`, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint: ['health', 'status', 'result'].includes(action), destructiveHint: false, openWorldHint: ['plan', 'audit', 'resume'].includes(action) } })) }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  const action = params.name.replace(/^blueprint_/, '');
  if (!definitions.some(item => item[0] === action)) throw new Error('Unknown tool');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(join(root, 'runtime/bin/python'), [join(root, 'bridge.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
    child.on('error', reject);
    child.on('close', code => {
      try { resolve({ code, data: JSON.parse(output) }); }
      catch { reject(new Error(error || 'Blueprint bridge returned invalid JSON')); }
    });
    child.stdin.end(JSON.stringify({ action, arguments: params.arguments ?? {} }));
  });
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }], isError: result.code !== 0 };
});
await server.connect(new StdioServerTransport());
