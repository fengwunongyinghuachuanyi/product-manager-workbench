# 拆拆 · 软件分析助手

分析软件安装包、Electron / JavaScript 编译产物及其他受支持目标，提取证据并解释结构、功能和差异。保留原 CLI / MCP 引擎与个人工作台助手配置。

## 能做什么

- 软件包和编译产物结构分析；JavaScript / Electron 入口及通信线索分析。
- 通过 Evidence 定位结论，区分观察事实、推断、未知和扫描覆盖范围。
- 对比不同版本，向 AI 客户端提供 MCP 工具。
- 原生 / Android 等深度分析按实际安装的 Ghidra、IDA、JADX 等工具提供能力。

189 个工具是本机集成时的注册数量，不代表所有外部分析器均已配置。工具本身本地执行；接入工作台后由所选模型解释证据。

## 安装与启动

先使用 `engine/.nvmrc` 与 `engine/package.json#packageManager` 指定的 Node / npm 版本，再执行：

```sh
cd engine
npm ci
npm run build:cached
node scripts/rea.mjs mcp
```

把根目录 `mcp.json` 的绝对路径改为本机实际位置，再导入客户端。完整入口及分析器准备要求见 [引擎说明](engine/README.md)。`assistant/` 保留助手规则与恢复配方；模型和 MCP 需在新客户端内配置，不包含账号登录状态。

## 边界

默认静态分析和被动观察。运行目标、附加进程或修改文件应由用户明确指定范围。静态关联不能证明运行行为。Swift SDK 兼容配置依赖本机工具链，需按新环境核验；源码快照不附带旧机器的编译缓存或 SDK 补丁路径。

配套项目：[产品经理工作台](https://github.com/fengwunongyinghuachuanyi/product-manager-workbench) · [Agent 蓝图 2.0](https://github.com/fengwunongyinghuachuanyi/agent-blueprint-2.0)。保留 [MIT 许可](LICENSE) 和各依赖声明。
