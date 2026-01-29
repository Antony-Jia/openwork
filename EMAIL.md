# 邮件任务使用说明

本系统支持通过邮件创建/推进 Openwork 任务。下面是邮件格式与收发规则。

## 前置设置
- 在 **Settings → Email** 配置 SMTP/IMAP、启用邮件集成。
- 在 **Settings → Email** 设置 IMAP 拉取间隔（秒）。
- 在 **Settings → General** 设置“默认工作目录”。  
  没有默认工作目录时，`startwork` 邮件会返回错误提示。

## 新建任务（StartWork）
**主题格式：**
```
<OpenworkTask> startwork
```
- `startwork` **大小写不敏感**，可包含 `Re:` / `Fwd:` 等前缀。
- 主题必须包含 `<OpenworkTask>` 标记，否则不会被处理。

**正文：**
- 直接写清楚任务需求即可（会作为任务输入内容）。

**示例：**
```
<OpenworkTask> startwork
```
正文：
```
请帮我把 README 里的安装说明补充一下，并生成一个简短的使用示例。
```

系统收到后会：
1) 自动创建一个 **Email Thread**  
2) 立即执行任务并回传 **完成邮件（主题包含 Work ID）**

如果你在应用内新建 **邮件对话** 并选择了工作目录，系统会发送一封 **Workspace Linked** 邮件（包含 Work ID）。

## 继续任务（回复邮件）
**方式：** 直接回复系统发出的“完成邮件”  
系统会从主题中解析 Work ID，并把回复正文作为新的任务输入。

**系统发送的主题格式：**
```
<OpenworkTask> [WORK_ID] Workspace Linked
<OpenworkTask> [WORK_ID] Completed - ...
<OpenworkTask> [WORK_ID] Error - ...
```

**正确回复示例：**
```
Re: <OpenworkTask> [3b2d...-...] Completed - StartWork
```
正文：
```
请再把变更点整理成三条 bullet。
```

## 收发规则摘要
- **仅处理包含 `<OpenworkTask>` 的邮件。**
- `startwork` 必须与 `<OpenworkTask>` 同时出现（主题中）。
- 回复邮件需保留主题中的 **[WORK_ID]**，系统才能关联到任务。
- 收件人固定为 **Settings → Email → To** 中的地址列表。

## 常见错误
- **未配置默认工作目录**：会收到 `Error - Missing default workspace` 邮件。
- **Work ID 不存在**：会收到 `Error - Failed to process task` 邮件。
- **SMTP/IMAP 未正确配置**：不会自动收发邮件。
