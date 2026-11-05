import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AuthPrompt, AuthPromptReply } from '@shared/types'
import { emit } from './sessions'

const pending = new Map<string, (r: AuthPromptReply | null) => void>()

ipcMain.on('auth:reply', (_e, id: string, reply: AuthPromptReply | null) => {
  pending.get(id)?.(reply)
  pending.delete(id)
})

/** renderer에 입력 창을 띄우고 사용자의 답을 기다린다 (취소하면 null) */
export function askUser(req: Omit<AuthPrompt, 'id'>): Promise<AuthPromptReply | null> {
  const id = randomUUID()
  return new Promise((resolve) => {
    pending.set(id, resolve)
    emit('auth:prompt', { ...req, id })
  })
}
