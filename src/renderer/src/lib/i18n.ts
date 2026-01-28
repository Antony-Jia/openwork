import { create } from "zustand"
import { persist } from "zustand/middleware"

type Language = "en" | "zh"
type Theme = "dark" | "light"

interface AppSettingsState {
  language: Language
  theme: Theme
  setLanguage: (lang: Language) => void
  setTheme: (theme: Theme) => void
  t: (key: string) => string
}

const translations = {
  en: {
    // Settings & Titlebar
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.language.english": "English",
    "settings.language.chinese": "Chinese",
    "settings.theme": "Theme",
    "settings.theme.dark": "Dark",
    "settings.theme.light": "Light",
    "settings.tabs.general": "General",
    "settings.tabs.provider": "Provider",
    "settings.tabs.ralph": "RALPH",
    "settings.tabs.email": "Email",
    "common.cancel": "Cancel",
    "settings.save": "Save",
    "settings.saved": "Saved",
    "settings.ralph.title": "RALPH MODE",
    "settings.ralph.iterations": "Iterations per run",
    "settings.email.title": "EMAIL",
    "settings.email.enabled": "Enable email integration",
    "settings.email.from": "From",
    "settings.email.to": "To (comma or newline)",
    "settings.email.smtp": "SMTP",
    "settings.email.imap": "IMAP",
    "settings.email.secure": "Secure",
    "settings.email.username": "Username",
    "settings.email.password": "Password",
    "settings.general.default_workspace": "Default workspace",
    "settings.general.default_workspace_choose": "Choose folder",
    "settings.general.default_workspace_empty": "No folder selected",
    "app.title": "OPENWORK",
    "titlebar.subagents": "Subagents",
    "titlebar.skills": "Skills",
    "titlebar.tools": "Tools",
    "titlebar.mcp": "MCP",
    "titlebar.container": "Container",

    // Provider Configuration
    "provider.title": "MODEL PROVIDER",
    "provider.ollama": "Ollama (Local)",
    "provider.openai_compatible": "OpenAI Compatible",
    "provider.url": "API URL",
    "provider.model": "Model Name",
    "provider.api_key": "API Key",
    "provider.save": "Save",
    "provider.saved": "Saved",
    "provider.not_configured": "Not configured",
    "provider.url_placeholder_ollama": "http://localhost:11434",
    "provider.url_placeholder_openai": "https://api.openai.com/v1",
    "provider.model_placeholder": "e.g. qwen2.5:7b or gpt-4o",
    "provider.key_placeholder": "sk-...",

    // Window Controls
    "window.minimize": "Minimize",
    "window.maximize": "Maximize",
    "window.close": "Close",

    // Sidebar
    "sidebar.new_thread": "New Thread",
    "sidebar.new_thread.default": "New Thread (Default)",
    "sidebar.new_thread.ralph": "New Ralph Thread",
    "sidebar.new_thread.email": "New Email Thread",
    "sidebar.new_thread.default_desc": "Standard chat mode",
    "sidebar.new_thread.ralph_desc": "Iteration loop with filesystem memory",
    "sidebar.new_thread.email_desc": "Email-backed tasks and summaries",
    "sidebar.no_threads": "No threads yet",
    "sidebar.delete": "Delete",
    "sidebar.rename": "Rename",
    "sidebar.search": "Search threads...",

    // Chat
    "chat.new_thread": "NEW THREAD",
    "chat.start_conversation": "Start a conversation with the agent",
    "chat.select_workspace": "Select a workspace folder",
    "chat.workspace_needed": "The agent needs a workspace to create and modify files",
    "chat.placeholder": "Type a message...",
    "chat.thinking": "Agent is thinking...",
    "chat.error_title": "Agent Error",
    "chat.error_dismiss": "Dismiss error",
    "chat.select_workspace_button": "Select workspace",
    "chat.workspace_picker_title": "Workspace Folder",
    "chat.workspace_picker_desc":
      "Select a folder for the agent to work in. The agent will read and write files directly to this location.",
    "chat.workspace_picker_active_desc": "The agent will read and write files in this folder.",
    "chat.select_folder": "Select Folder",
    "chat.change_folder": "Change Folder",
    "chat.docker_ready": "Docker mode is ready. Send a message to start.",
    "chat.docker_not_running": "Docker container is not running. Open Container settings to start it.",

    // Common
    "common.loading": "Loading...",

    // Panels
    "panel.tasks": "TASKS",
    "panel.files": "FILES",
    "panel.agents": "AGENTS",
    "panel.pending": "PENDING",
    "panel.in_progress": "IN PROGRESS",
    "panel.completed": "COMPLETED",
    "panel.cancelled": "CANCELLED",
    "panel.no_tasks": "No tasks yet",
    "panel.tasks_desc": "Tasks appear when the agent creates them",
    "panel.no_files": "No workspace files",
    "panel.link_folder": "Link",
    "panel.sync_files": "Sync",
    "panel.change_folder": "Change",
    "panel.link_desc": 'Click "Link" to set a sync folder',
    "panel.docker_mounts": "Docker mounts",
    "panel.docker_mounts_desc": "Files are shown from Docker mount paths",
    "panel.mounts": "MOUNTS",
    "panel.mounts_empty": "No mounts",
    "panel.mounts_desc": "Files are shown from container mount paths",

    // Subagents
    "subagents.title": "SUBAGENTS",
    "subagents.add": "New Subagent",
    "subagents.empty": "No custom subagents yet",
    "subagents.name": "Name",
    "subagents.description": "Description",
    "subagents.system_prompt": "System Prompt",
    "subagents.interrupt_on": "Require approval for tools",
    "subagents.model_hint": "Model uses current provider unless overridden",
    "subagents.tools": "Tools",
    "subagents.middleware": "Middleware",
    "subagents.mcp": "MCP",
    "subagents.tools_empty": "No tools available",
    "subagents.middleware_empty": "No middleware available",
    "subagents.mcp_empty": "No MCP servers available",
    "subagents.mcp_not_running": "Not running",
    "subagents.save": "Save",
    "subagents.cancel": "Cancel",
    "subagents.edit": "Edit",
    "subagents.delete": "Delete",
    "subagents.disabled_hint": "Disabled subagents are not injected into agents.",

    // Container
    "container.title": "CONTAINER",
    "container.status": "Docker status",
    "container.available": "Available",
    "container.unavailable": "Unavailable",
    "container.mode": "Docker mode",
    "container.mode_on": "On",
    "container.mode_off": "Off",
    "container.enter": "Enter Docker Mode",
    "container.exit": "Exit Docker Mode",
    "container.restart": "Restart Container",
    "container.running": "Running:",
    "container.image": "Image",
    "container.cpu": "CPU (cores)",
    "container.memory": "Memory (MB)",
    "container.mounts": "Mounts",
    "container.add_mount": "Add mount",
    "container.host_path": "Host path",
    "container.select_path": "Select folder",
    "container.container_path": "Container path",
    "container.read_only": "Read-only",
    "container.ports": "Ports",
    "container.add_port": "Add port",
    "container.port_host": "Host",
    "container.port_container": "Container",
    "container.protocol": "Protocol",
    "container.save": "Save",
    "container.edit_disabled": "Stop the container to edit configuration",

    // Skills
    "skills.title": "SKILLS",
    "skills.add": "Add Skill",
    "skills.create": "Create Skill",
    "skills.install": "Install from Path",
    "skills.empty": "No skills found",
    "skills.name": "Name",
    "skills.name_hint": "lowercase-hyphen format",
    "skills.description": "Description",
    "skills.content": "Content",
    "skills.content_placeholder":
      "Include YAML frontmatter (name/description). Leave empty to auto-generate.",
    "skills.path": "Path",
    "skills.install_path": "Skill Path",
    "skills.install_hint": "Folder containing SKILL.md or the SKILL.md file path",
    "skills.save": "Save",
    "skills.cancel": "Cancel",
    "skills.edit": "Edit",
    "skills.delete": "Delete",
    "skills.disabled_hint": "Disabled skills are not injected into agents.",

    // Tools
    "tools.title": "TOOLS",
    "tools.empty": "No tools available",
    "tools.env_var": "Env",
    "tools.status_configured": "CONFIGURED",
    "tools.status_missing": "MISSING",
    "tools.key": "Key",
    "tools.key_placeholder": "Enter API key",
    "tools.clear": "Clear",
    "tools.save": "Save",
    "tools.enabled": "ENABLED",
    "tools.disabled": "DISABLED",
    "tools.disabled_hint": "Disabled tools are not injected into agents.",
    "tools.load_failed": "Failed to load tools",
    "tools.save_failed": "Failed to save tool key",

    // MCP
    "mcp.title": "MCP",
    "mcp.hint": "Manage MCP servers and tools",
    "mcp.add": "Add MCP",
    "mcp.empty": "No MCP servers yet",
    "mcp.name": "Name",
    "mcp.name_placeholder": "e.g. Local Filesystem",
    "mcp.mode": "Mode",
    "mcp.mode_local": "Local",
    "mcp.mode_remote": "Remote",
    "mcp.command": "Command",
    "mcp.command_placeholder": "mcp-server-filesystem",
    "mcp.args": "Args (one per line)",
    "mcp.args_placeholder": "--root\nC:\\\\workspace",
    "mcp.env": "Env (KEY=VALUE)",
    "mcp.env_placeholder": "ENV_VAR=value",
    "mcp.cwd": "Working Directory",
    "mcp.cwd_placeholder": "C:\\\\path\\\\to\\\\server",
    "mcp.url": "SSE URL",
    "mcp.url_placeholder": "http://localhost:8000/sse",
    "mcp.headers": "Headers (KEY=VALUE)",
    "mcp.headers_placeholder": "Authorization=Bearer ...",
    "mcp.auto_start": "Start with app",
    "mcp.tools_count": "Tools",
    "mcp.start": "Start",
    "mcp.stop": "Stop",
    "mcp.edit": "Edit",
    "mcp.delete": "Delete",
    "mcp.save": "Save",
    "mcp.cancel": "Cancel",
    "mcp.delete_confirm": "Delete this MCP server?",
    "mcp.save_failed": "Failed to save MCP server",
    "mcp.start_failed": "Failed to start MCP server",
    "mcp.stop_failed": "Failed to stop MCP server",
    "mcp.disabled_hint": "Disabled MCP servers are not injected.",

    // General
    "common.progress": "PROGRESS",
    "common.done": "DONE",

    // Ralph Progress
    "ralph.progress.title": "Ralph Progress",
    "ralph.progress.iteration": "Iteration",
    "ralph.progress.phase": "Phase",
    "ralph.progress.more": "more",
    "ralph.progress.empty": "No plan or progress yet",
    "ralph.phase.init": "Initializing",
    "ralph.phase.awaiting_confirm": "Awaiting Confirm",
    "ralph.phase.running": "Running",
    "ralph.phase.done": "Done",
    "ralph.plan.project": "Project",
    "ralph.plan.stories": "User Stories"
  },
  zh: {
    // Settings & Titlebar
    "settings.title": "设置",
    "settings.language": "语言",
    "settings.language.english": "英语",
    "settings.language.chinese": "中文",
    "settings.theme": "主题",
    "settings.theme.dark": "深色",
    "settings.theme.light": "浅色",
    "settings.tabs.general": "常规",
    "settings.tabs.provider": "Provider",
    "settings.tabs.ralph": "RALPH",
    "settings.tabs.email": "邮件",
    "common.cancel": "取消",
    "settings.save": "保存",
    "settings.saved": "已保存",
    "settings.ralph.title": "RALPH 模式",
    "settings.ralph.iterations": "每次迭代次数",
    "settings.email.title": "邮件",
    "settings.email.enabled": "启用邮件集成",
    "settings.email.from": "发件人",
    "settings.email.to": "收件人（逗号或换行）",
    "settings.email.smtp": "SMTP",
    "settings.email.imap": "IMAP",
    "settings.email.secure": "安全连接",
    "settings.email.username": "用户名",
    "settings.email.password": "密码",
    "settings.general.default_workspace": "默认工作目录",
    "settings.general.default_workspace_choose": "选择目录",
    "settings.general.default_workspace_empty": "未选择目录",
    "app.title": "OPENWORK",
    "titlebar.subagents": "智能体",
    "titlebar.skills": "技能",
    "titlebar.tools": "工具",
    "titlebar.mcp": "MCP",
    "titlebar.container": "容器",

    // Provider Configuration
    "provider.title": "模型提供者",
    "provider.ollama": "Ollama（本地）",
    "provider.openai_compatible": "OpenAI 兼容",
    "provider.url": "API 地址",
    "provider.model": "模型名称",
    "provider.api_key": "API 密钥",
    "provider.save": "保存",
    "provider.saved": "已保存",
    "provider.not_configured": "未配置",
    "provider.url_placeholder_ollama": "http://localhost:11434",
    "provider.url_placeholder_openai": "https://api.openai.com/v1",
    "provider.model_placeholder": "如 qwen2.5:7b 或 gpt-4o",
    "provider.key_placeholder": "sk-...",

    // Window Controls
    "window.minimize": "最小化",
    "window.maximize": "最大化",
    "window.close": "关闭",

    // Sidebar
    "sidebar.new_thread": "新建对话",
    "sidebar.new_thread.default": "新建对话（默认）",
    "sidebar.new_thread.ralph": "新建 Ralph 对话",
    "sidebar.new_thread.email": "新建邮件对话",
    "sidebar.new_thread.default_desc": "标准对话模式",
    "sidebar.new_thread.ralph_desc": "文件记忆 + 迭代循环",
    "sidebar.new_thread.email_desc": "邮件任务与结果回传",
    "sidebar.no_threads": "暂无对话",
    "sidebar.delete": "删除",
    "sidebar.rename": "重命名",
    "sidebar.search": "搜索对话...",

    // Chat
    "chat.new_thread": "新对话",
    "chat.start_conversation": "开始与智能体对话",
    "chat.select_workspace": "选择工作目录",
    "chat.workspace_needed": "智能体需要工作目录来读写文件",
    "chat.placeholder": "输入消息...",
    "chat.thinking": "智能体思考中...",
    "chat.error_title": "智能体错误",
    "chat.error_dismiss": "忽略错误",
    "chat.select_workspace_button": "选择目录",
    "chat.workspace_picker_title": "工作目录",
    "chat.workspace_picker_desc":
      "选择一个文件夹作为智能体的工作目录。智能体将直接在此位置读写文件。",
    "chat.workspace_picker_active_desc": "智能体将在此文件夹中读写文件。",
    "chat.select_folder": "选择文件夹",
    "chat.change_folder": "更改文件夹",
    "chat.docker_ready": "Docker模式已就绪，可直接开始对话。",
    "chat.docker_not_running": "Docker 容器未运行，请在容器设置中启动。",

    // Common
    "common.loading": "加载中...",

    // Panels
    "panel.tasks": "任务列表",
    "panel.files": "文件管理",
    "panel.agents": "智能体树",
    "panel.pending": "待处理",
    "panel.in_progress": "进行中",
    "panel.completed": "已完成",
    "panel.cancelled": "已取消",
    "panel.no_tasks": "暂无任务",
    "panel.tasks_desc": "智能体创建的任务将显示在此处",
    "panel.no_files": "暂无文件",
    "panel.link_folder": "关联",
    "panel.sync_files": "同步",
    "panel.change_folder": "切换",
    "panel.link_desc": '点击"关联"设置同步文件夹',
    "panel.docker_mounts": "Docker挂载",
    "panel.docker_mounts_desc": "文件来自Docker挂载路径",
    "panel.mounts": "容器挂载",
    "panel.mounts_empty": "暂无挂载",
    "panel.mounts_desc": "文件来自容器挂载路径",

    // Subagents
    "subagents.title": "智能体管理",
    "subagents.add": "新建智能体",
    "subagents.empty": "暂无自定义智能体",
    "subagents.name": "名称",
    "subagents.description": "描述",
    "subagents.system_prompt": "系统提示词",
    "subagents.interrupt_on": "工具需人工确认",
    "subagents.model_hint": "模型默认使用当前配置",
    "subagents.tools": "工具",
    "subagents.middleware": "中间件",
    "subagents.mcp": "MCP",
    "subagents.tools_empty": "暂无可用工具",
    "subagents.middleware_empty": "暂无可用中间件",
    "subagents.mcp_empty": "暂无可用 MCP 服务",
    "subagents.mcp_not_running": "未运行",
    "subagents.save": "保存",
    "subagents.cancel": "取消",
    "subagents.edit": "编辑",
    "subagents.delete": "删除",
    "subagents.disabled_hint": "已禁用的智能体不会注入到智能体上下文。",

    // Container
    "container.title": "容器",
    "container.status": "Docker状态",
    "container.available": "可用",
    "container.unavailable": "不可用",
    "container.mode": "Docker模式",
    "container.mode_on": "已开启",
    "container.mode_off": "未开启",
    "container.enter": "进入 Docker 模式",
    "container.exit": "退出 Docker 模式",
    "container.restart": "重启容器",
    "container.running": "运行中：",
    "container.image": "镜像",
    "container.cpu": "CPU(核)",
    "container.memory": "内存(MB)",
    "container.mounts": "挂载",
    "container.add_mount": "新增挂载",
    "container.host_path": "宿主路径",
    "container.select_path": "选择文件夹",
    "container.container_path": "容器路径",
    "container.read_only": "只读",
    "container.ports": "端口",
    "container.add_port": "新增端口",
    "container.port_host": "宿主",
    "container.port_container": "容器",
    "container.protocol": "协议",
    "container.save": "保存",
    "container.edit_disabled": "停止容器后可修改配置",

    // Skills
    "skills.title": "技能管理",
    "skills.add": "添加技能",
    "skills.create": "创建技能",
    "skills.install": "路径安装",
    "skills.empty": "暂无技能",
    "skills.name": "名称",
    "skills.name_hint": "小写-连字符",
    "skills.description": "描述",
    "skills.content": "内容",
    "skills.content_placeholder": "请包含 YAML frontmatter（name/description），留空将自动生成。",
    "skills.path": "路径",
    "skills.install_path": "技能路径",
    "skills.install_hint": "包含 SKILL.md 的文件夹或 SKILL.md 文件路径",
    "skills.save": "保存",
    "skills.cancel": "取消",
    "skills.edit": "编辑",
    "skills.delete": "删除",
    "skills.disabled_hint": "已禁用的技能不会注入到智能体。",

    // Tools
    "tools.title": "工具管理",
    "tools.empty": "暂无工具",
    "tools.env_var": "环境变量",
    "tools.status_configured": "已配置",
    "tools.status_missing": "未配置",
    "tools.key": "密钥",
    "tools.key_placeholder": "请输入 API Key",
    "tools.clear": "清空",
    "tools.save": "保存",
    "tools.enabled": "已启用",
    "tools.disabled": "已禁用",
    "tools.disabled_hint": "禁用的工具不会注入到智能体。",
    "tools.load_failed": "工具加载失败",
    "tools.save_failed": "工具保存失败",

    // MCP
    "mcp.title": "MCP",
    "mcp.hint": "管理 MCP 服务器与工具",
    "mcp.add": "添加 MCP",
    "mcp.empty": "暂无 MCP 服务",
    "mcp.name": "名称",
    "mcp.name_placeholder": "例如 本地文件系统",
    "mcp.mode": "模式",
    "mcp.mode_local": "本地",
    "mcp.mode_remote": "远程",
    "mcp.command": "命令",
    "mcp.command_placeholder": "mcp-server-filesystem",
    "mcp.args": "参数（每行一个）",
    "mcp.args_placeholder": "--root\nC:\\\\workspace",
    "mcp.env": "环境变量（KEY=VALUE）",
    "mcp.env_placeholder": "ENV_VAR=value",
    "mcp.cwd": "工作目录",
    "mcp.cwd_placeholder": "C:\\\\path\\\\to\\\\server",
    "mcp.url": "SSE 地址",
    "mcp.url_placeholder": "http://localhost:8000/sse",
    "mcp.headers": "请求头（KEY=VALUE）",
    "mcp.headers_placeholder": "Authorization=Bearer ...",
    "mcp.auto_start": "随应用启动",
    "mcp.tools_count": "工具数量",
    "mcp.start": "启动",
    "mcp.stop": "停止",
    "mcp.edit": "编辑",
    "mcp.delete": "删除",
    "mcp.save": "保存",
    "mcp.cancel": "取消",
    "mcp.delete_confirm": "确认删除该 MCP 服务？",
    "mcp.save_failed": "保存 MCP 服务失败",
    "mcp.start_failed": "启动 MCP 服务失败",
    "mcp.stop_failed": "停止 MCP 服务失败",
    "mcp.disabled_hint": "已禁用的 MCP 不会注入。",

    // General
    "common.progress": "进度",
    "common.done": "完成",

    // Ralph Progress
    "ralph.progress.title": "Ralph 进度",
    "ralph.progress.iteration": "迭代次数",
    "ralph.progress.phase": "阶段",
    "ralph.progress.more": "更多",
    "ralph.progress.empty": "暂无计划或进度",
    "ralph.phase.init": "初始化",
    "ralph.phase.awaiting_confirm": "等待确认",
    "ralph.phase.running": "运行中",
    "ralph.phase.done": "已完成",
    "ralph.plan.project": "项目",
    "ralph.plan.stories": "用户故事"
  }
}

export const useAppSettings = create<AppSettingsState>()(
  persist(
    (set, get) => ({
      language: "en",
      theme: "dark",
      setLanguage: (lang) => set({ language: lang }),
      setTheme: (theme) => {
        set({ theme })
        if (theme === "dark") {
          document.documentElement.classList.add("dark")
          document.documentElement.classList.remove("light")
        } else {
          document.documentElement.classList.add("light")
          document.documentElement.classList.remove("dark")
        }
      },
      t: (key) => {
        const lang = get().language
        return translations[lang][key] || key
      }
    }),
    {
      name: "app-settings",
      onRehydrateStorage: () => (state) => {
        // Apply theme immediately on load
        if (state) {
          const theme = state.theme
          if (theme === "dark") {
            document.documentElement.classList.add("dark")
            document.documentElement.classList.remove("light")
          } else {
            document.documentElement.classList.add("light")
            document.documentElement.classList.remove("dark")
          }
        }
      }
    }
  )
)

// Deprecated export for backward compatibility during refactor
export const useLanguage = useAppSettings
