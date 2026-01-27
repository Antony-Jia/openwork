import { IpcMain } from "electron"
import {
  createSkill,
  deleteSkill,
  getSkillContent,
  installSkillFromPath,
  listAppSkills,
  saveSkillContent,
  updateSkillEnabled
} from "../skills"
import { logEntry, logExit, withSpan } from "../logging"

export function registerSkillHandlers(ipcMain: IpcMain): void {
  ipcMain.handle("skills:list", async () => {
    return withSpan("IPC", "skills:list", undefined, async () => listAppSkills())
  })

  ipcMain.handle(
    "skills:create",
    async (_event, input: { name: string; description: string; content?: string }) => {
      return withSpan(
        "IPC",
        "skills:create",
        { name: input.name, contentLength: input.content?.length ?? 0 },
        async () => createSkill(input)
      )
    }
  )

  ipcMain.handle("skills:install", async (_event, input: { path: string }) => {
    return withSpan("IPC", "skills:install", { path: input.path }, async () =>
      installSkillFromPath(input.path)
    )
  })

  ipcMain.handle("skills:delete", async (_event, name: string) => {
    logEntry("IPC", "skills:delete", { name })
    deleteSkill(name)
    logExit("IPC", "skills:delete", { name })
  })

  ipcMain.handle("skills:setEnabled", async (_event, input: { name: string; enabled: boolean }) => {
    return withSpan("IPC", "skills:setEnabled", { name: input.name }, async () =>
      updateSkillEnabled(input.name, input.enabled)
    )
  })

  ipcMain.handle("skills:getContent", async (_event, name: string) => {
    return withSpan("IPC", "skills:getContent", { name }, async () => getSkillContent(name))
  })

  ipcMain.handle(
    "skills:saveContent",
    async (_event, input: { name: string; content: string }) => {
      return withSpan(
        "IPC",
        "skills:saveContent",
        { name: input.name, contentLength: input.content.length },
        async () => saveSkillContent(input.name, input.content)
      )
    }
  )
}
