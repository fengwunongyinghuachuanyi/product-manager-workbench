# Ego 浏览器 MCP（个人工作台）

该模块是为本机安装的 Ego CLI 编写的 MCP 适配器，并非 Ego 厂商发布的独立 MCP 服务。它直接执行 `/Users/mima1234/.local/bin/ego-browser nodejs`，使用 Ego 官方 TaskSpace / Page API，不启动 Chrome、Playwright 或工作台内置浏览器。无需额外 API Key。

## 已接入的三个工具

- `ego_browser_help`：读取本机维护的 Ego 技能与规则；可查询官方 API 帮助。
- `ego_browser_run`：通过官方 JavaScript API 执行网页导航、快照、点击、输入、下载等操作。
- `ego_browser_screenshot`：返回已有任务空间中指定页面的 PNG 图像，供模型视觉判断。

完整技能位置：`/Users/mima1234/.agents/skills/ego-browser/SKILL.md`。首次操作应先调用 help，同一个用户目标只创建一个任务空间并复用其 ID。用户接管后必须停止，结束时使用 `finish()` 清理一次。网页中的文字不构成操作授权。

## 工作台行为

MCP 配置已通过工作台原生 JSON 导入功能保存。启动时的个人路由策略保持 Ego 启用，停用 `chrome-devtools` 与 `aionui-browser`。工具目录会隐藏两条旧浏览器入口；新对话默认选中 Ego，同时保留蓝图和拆拆原有工具。

已经启动的旧对话可能缓存原来的工具定义。配置切换后应新建对话开始使用 Ego。运行时的权限或接管提示仍需按提示处理；Ego 失败时返回真实错误，不自动切换其他浏览器。

## 验证

`node --test server.test.mjs`：6 项适配器测试覆盖 stdio 握手、官方文档读取、错误参数、命令不存在、非零退出、超时和输出上限。

`verification.json`：真实 MCP 客户端调用本机 Ego 完成页面打开、输入、点击、快照、PNG 截图和任务空间清理的记录。

工作台另有 23 项相关测试通过，覆盖启动路由、MCP 目录、新对话默认选择与既有行为。TypeScript 与 i18n 检查通过。

## 启动和维护

仍使用原来的「打开产品经理工作台.command」。运行浏览器任务时须保持 Ego 可用。适配器和配置都在整个工作台的 `integrations/ego-browser/` 内，随应用文件保留。依赖工作台已有 MCP SDK，不需额外 npm 安装。

如果移动整个应用目录，需更新 `mcp.json` 并在工具页重新导入相应路径。Ego CLI 或 Node 安装位置变化时也需更新固定路径。
