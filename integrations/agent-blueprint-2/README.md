# Agent 蓝图 2.0

从点子 / PRD 推导 Agent 方案，也可对已有项目进行静态扫描并生成差距报告。保留原 Python 引擎、17 个组件、方法资料，以及个人工作台使用的 ChatGPT / Codex CLI 适配器。

## 能做什么

- 正向推导：需求拆解 → 五要素建模 → 组件选型 → 架构设计 → 审稿。
- 逆向审计：扫描明确指定的项目，生成差距报告与应有 PRD。
- 过程管理：阶段缓存、断点续跑、取消、累计调用与 token 预算。
- MCP：health、plan、audit、status、resume、result、cancel 七个工具。

## 启动 MCP

需要 Node.js 22+、Python 3.10+、已安装并登录的 Codex CLI。当前适配器使用 ChatGPT 登录进行云端推理；会消耗账号额度。

```sh
npm install
python3 -m venv runtime
# 编辑 config.json：codex 可用命令或绝对路径、可用的模型名称、可选代理。
node server.mjs
```

将 `mcp.json` 中的 `/ABSOLUTE/PATH/agent-blueprint-2.0/server.mjs` 改成实际路径，再导入 MCP 客户端。stdio 服务启动后等待客户端请求，不会显示网页。

## 引擎与验证

`engine/` 是完整引擎源码及其许可。`engine/启动引擎.command` / `setup.sh` 保留原接口启动方式，与本仓库的 ChatGPT 适配入口不同。引擎文档见 [engine/README.md](engine/README.md)，适配说明见 [INTEGRATION-NOTES.md](INTEGRATION-NOTES.md)。

```sh
runtime/bin/python -B -m unittest discover -s tests -v
node tests/mcp-smoke.mjs
```

第一条使用离线测试；第二条检查 MCP 和本机登录状态。带 `--real` 会请求云端模型。模型审稿通过不等于业务正确；结果应人工确认。仓库不包含任务数据、账号凭据和虚拟环境。

配套项目：[产品经理工作台](https://github.com/fengwunongyinghuachuanyi/product-manager-workbench) · [拆拆](https://github.com/fengwunongyinghuachuanyi/chaichai)。原许可证及权利声明保留。
