# openwork

[![npm][npm-badge]][npm-url] [![License: MIT][license-badge]][license-url]

[npm-badge]: https://img.shields.io/npm/v/openwork.svg
[npm-url]: https://www.npmjs.com/package/openwork
[license-badge]: https://img.shields.io/badge/License-MIT-yellow.svg
[license-url]: https://opensource.org/licenses/MIT

openwork 是 [deepagentsjs](https://github.com/langchain-ai/deepagentsjs) 的桌面工作台，面向“深度代理（Deep Agent）”工作流，集成了配置中心、技能与子智能体管理、MCP 工具接入、Docker 隔离模式、RALPH 迭代模式、邮件模式等完整能力。

![openwork screenshot](docs/screenshot.png)

> [!CAUTION]
> openwork 会让 AI 代理直接访问本地文件系统并执行命令。请只在可信工作区运行，并审慎审批工具调用。

## 本次大规模功能更新（重点）

- **设置中心升级**：新增 Provider 简化配置（Ollama / OpenAI-Compatible）、RALPH 迭代次数、邮件 SMTP/IMAP 与 IMAP 拉取间隔等设置项，统一保存至本地配置文件。@src/main/settings.ts#1-90 @src/main/storage.ts#1-153 @src/renderer/src/components/titlebar/SettingsMenu.tsx#17-158
- **Skills 技能管理**：支持在 `.openwork/skills` 下创建、导入、编辑技能包（SKILL.md），并提供 UI 管理。@src/main/skills.ts#1-201 @src/renderer/src/components/titlebar/SkillsManager.tsx#1-258
- **MCP 集成**：支持本地/远程 MCP Server，自动发现工具并注入到 Agent 与 Subagent 中，提供启动、停止与自动启动配置。@src/main/mcp/service.ts#1-356 @src/renderer/src/components/titlebar/McpManager.tsx#1-427
- **Subagent 子智能体体系**：可配置 System Prompt、工具集合、MCP 工具、Middleware，并支持执行前打断（interruptOn）。@src/main/subagents.ts#1-123 @src/renderer/src/components/titlebar/SubagentManager.tsx#1-472
- **Tools 工具中心**：统一管理工具的启用状态与密钥，支持环境变量回退；内置 `internet_search`（Tavily）。@src/main/tools/service.ts#1-89 @src/main/tools/internet-search.ts#1-76 @src/renderer/src/components/titlebar/ToolsManager.tsx#1-225
- **Docker 模式**：为单线程配置容器镜像、挂载、资源与端口，提供容器执行与文件工具；仅 Windows 可用。@src/main/tools/docker-tools.ts#1-289 @src/renderer/src/components/titlebar/ContainerManager.tsx#1-338
- **RALPH 模式**：基于 `ralph_plan.json` 的迭代执行流，/confirm 触发迭代，自动维护 progress.txt 与 `.ralph_done`。@src/main/ipc/agent.ts#105-372
- **邮件模式**：SMTP 发件 + IMAP 任务拉取，仅回传最终摘要并标记已读；按 `<OpenworkTask>` 标签筛选。@src/main/ipc/agent.ts#410-497 @src/main/email/service.ts#1-164

## 快速开始

```bash
# 直接运行
npx openwork

# 或全局安装
npm install -g openwork
openwork
```

需要 Node.js 18+。

### 从源码运行

```bash
git clone https://github.com/langchain-ai/openwork.git
cd openwork
npm install
npm run dev
```

## 核心使用指南

### 1) 设置中心（模型与系统配置）

- **Provider 配置**：支持 Ollama 和 OpenAI-Compatible API（如 DeepSeek / OpenAI 兼容端点）。@src/renderer/src/components/titlebar/SettingsMenu.tsx#17-158
- **RALPH 迭代次数**：控制每次执行的最大迭代轮次。@src/main/settings.ts#8-29
- **邮件配置**：SMTP + IMAP、发件人与收件人列表、IMAP 拉取间隔。@src/main/types.ts#193-220

### 2) Skills（技能包）

- 在 `.openwork/skills` 目录中管理技能（SKILL.md）。
- 支持 **创建 / 导入 / 编辑 / 删除**。
- 技能描述取自 SKILL.md Frontmatter。@src/main/skills.ts#118-154

### 3) MCP（Model Context Protocol）

- **本地模式**：配置 command / args / env / cwd。
- **远程模式**：配置 URL / Headers。
- 自动发现 MCP 工具并注入，工具名格式：`mcp.<serverId>.<toolName>`。
- 支持自动启动与状态监控。@src/main/mcp/service.ts#199-356

### 4) Subagent（子智能体）

- 自定义子智能体：名称、描述、System Prompt。
- 可选择工具、MCP 工具、Middleware，并可启用执行前打断。
- 子智能体配置会持久化到 `subagents.json`。@src/main/subagents.ts#1-123

### 5) Tools（工具中心）

- 启用/禁用工具、配置密钥（支持环境变量回退）。
- 当前内置工具：`internet_search`（Tavily）。@src/main/tools/internet-search.ts#8-74

### 6) Docker 模式（线程级容器）

- 每个线程可独立配置镜像、挂载、资源与端口。
- 启用后，Agent 会优先使用容器工具执行命令与文件操作。
- Windows 专用。@src/renderer/src/components/titlebar/ContainerManager.tsx#29-329

### 7) RALPH 模式

1. 新建 Ralph 线程。
2. Agent 根据用户需求生成 `ralph_plan.json`。
3. 用户回复 `/confirm` 开启迭代执行。
4. 每轮执行都会读写 `progress.txt`，完成后写入 `.ralph_done`。

### 8) 邮件模式

- 新建邮件线程后，Agent 会：
  - 选择工作目录后发送一封 Workspace Linked 邮件（包含 Work ID）。
  - 处理后发送摘要邮件。
  - 通过 IMAP 拉取 `<OpenworkTask>` 主题邮件，处理后回传并标记已读。

## 应用数据目录（.openwork）

openwork 会在用户目录下创建 `.openwork`，保存如下数据：

- `provider-config.json`：模型 Provider 配置。
- `settings.json`：RALPH / 邮件配置。
- `tools.json`：工具启用与密钥。
- `subagents.json`：子智能体配置。
- `mcp.json`：MCP Server 配置。
- `skills/`：自定义技能包。

## 贡献与反馈

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

问题反馈请提交 [GitHub Issues](https://github.com/langchain-ai/openwork/issues)。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
