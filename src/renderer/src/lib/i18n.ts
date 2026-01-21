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
        "app.title": "OPENWORK",

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
        "chat.workspace_picker_desc": "Select a folder for the agent to work in. The agent will read and write files directly to this location.",
        "chat.workspace_picker_active_desc": "The agent will read and write files in this folder.",
        "chat.select_folder": "Select Folder",
        "chat.change_folder": "Change Folder",

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
        "panel.link_desc": "Click \"Link\" to set a sync folder",

        // General
        "common.progress": "PROGRESS",
        "common.done": "DONE",
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
        "app.title": "OPENWORK",

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
        "chat.workspace_picker_desc": "选择一个文件夹作为智能体的工作目录。智能体将直接在此位置读写文件。",
        "chat.workspace_picker_active_desc": "智能体将在此文件夹中读写文件。",
        "chat.select_folder": "选择文件夹",
        "chat.change_folder": "更改文件夹",

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
        "panel.link_desc": "点击\"关联\"设置同步文件夹",

        // General
        "common.progress": "进度",
        "common.done": "完成",
    },
}

export const useAppSettings = create<AppSettingsState>()(
    persist(
        (set, get) => ({
            language: "en",
            theme: "dark",
            setLanguage: (lang) => set({ language: lang }),
            setTheme: (theme) => {
                set({ theme })
                if (theme === 'dark') {
                    document.documentElement.classList.add('dark')
                    document.documentElement.classList.remove('light')
                } else {
                    document.documentElement.classList.add('light')
                    document.documentElement.classList.remove('dark')
                }
            },
            t: (key) => {
                const lang = get().language
                return translations[lang][key] || key
            },
        }),
        {
            name: "app-settings",
            onRehydrateStorage: () => (state) => {
                // Apply theme immediately on load
                if (state) {
                    const theme = state.theme
                    if (theme === 'dark') {
                        document.documentElement.classList.add('dark')
                        document.documentElement.classList.remove('light')
                    } else {
                        document.documentElement.classList.add('light')
                        document.documentElement.classList.remove('dark')
                    }
                }
            }
        },
    ),
)

// Deprecated export for backward compatibility during refactor
export const useLanguage = useAppSettings
