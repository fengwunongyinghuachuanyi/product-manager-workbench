# 拆拆 · 个人工作台助手

拆拆已作为「助手 → 拆拆」加入本机产品经理工作台，绑定 Codex CLI、GPT-6.1-Sol 和 chaichai MCP 服务。

模型解释使用本机 Codex 已登录的 ChatGPT 账号，在云端推理；拆拆的文件解析、静态分析和证据保存在本机执行。它是软件分析工具箱，本身不需要另填模型 API Key。

## 在应用里使用

工作台左侧进入「助手」，选择「拆拆」，点击「去对话」，说明软件或安装包的绝对路径，以及想弄清的问题。

示例：

> 用拆拆分析这个 Electron 安装包 /我的目录/app.asar，说明入口、主要组件和通信线索，并给出证据位置。

> 用拆拆看看 /我的目录/软件.app 是用什么技术做的。先做静态分析，不启动它。

> 对照这两个版本的打包文件，找出有证据支持的变化和仍不能确定的地方。

拆拆适合已有软件、安装包与编译产物的证据分析。蓝图 2.0 适合从点子/PRD 推导 Agent 方案，也可对项目做需求与组件差距分析。

## 文件和运行环境

- `engine/`：从用户提供的 chaichai 目录复制的 7703 个常规文件，含原源码、方法文档、工具定义、第三方声明和许可证。原目录保持不变。Git 元数据、缓存及特殊测试夹具链接未复制，清单位于 verification/source-manifest.json。
- `runtime/`：私有 Node 24.18.0、配套 npm 11.16.0、npm 下载缓存及 Swift 编译适配。没有更改系统 Node、npm 或 shell 设置。
- `mcp.json`：应用内导入的 MCP 配置，以本地固定版本启动原拆拆服务，使用 compact 输入 schema。
- `assistant/`：助手恢复配方及方法资料。
- `verification/`：真实 MCP 工具目录、分析请求与返回证据、源码指纹和编译诊断。

Node 官方下载文件已对照其 SHASUMS256.txt 验证 SHA-256。依赖按 package-lock.json 安装，构建命令为 npm run build:cached。没有运行会批量修改其他 AI 工具配置的 setup。

## 本机 Swift 兼容处理

当前 Command Line Tools 同时存在两份定义 SwiftBridging 的 module map，原 xcrun 编译路径会报重复定义。

本模块使用 Swift 自身的 -vfsoverlay，为当前编译调用隐藏重复的旧 module.modulemap；另一份 bridging.modulemap 及其头文件保持原样。文件视图、空映射文件和编译包装器都保存在 runtime 内，通过原拆拆支持的 REA_DARWIN_SWIFTC_PATH、SDKROOT、REA_DARWIN_MODULE_CACHE_PATH 环境变量选择。系统工具链文件没有改动，进程身份检查没有被关闭，原 Swift 辅助程序源码也未改写。

该处理已通过原进程身份辅助程序编译和真实 JavaScript MCP 分析验证。迁移电脑或更新系统工具链后，应按新电脑的编译器/SDK 实际情况重新核验配置路径。

## 验证与能力边界

已通过原构建任务，实际 MCP 服务列出 189 个工具，并成功静态分析工作台自身的 AionUi/out/preload 编译目录，返回可核对的 Evidence 与未知项。这里验证的是 JavaScript 静态分析链路；工具已注册不等于所有外部分析引擎均已安装或验收。原生深度反编译、Android 反编译等能力按本机 Ghidra、IDA、JADX 等实际配置使用。

默认使用静态分析和被动观察。运行目标、附加/注入进程、修改文件或主动抓取等操作需要用户明确指定范围。分析输出会区分事实、推断和未知；静态候选关系与图谱匹配不能证明真实运行行为或产品完全等价。

原源码和许可证保留，界面使用个人助手名称与描述。
