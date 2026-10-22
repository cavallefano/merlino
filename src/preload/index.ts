import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from 'electron'
import { type Api, Channels } from '../shared/ipc'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: Api = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke(Channels.getSettings),
  checkGit: () => ipcRenderer.invoke(Channels.checkGit),
  setGitPath: (path) => ipcRenderer.invoke(Channels.setGitPath, path),
  pickRepoFolder: () => ipcRenderer.invoke(Channels.pickRepoFolder),
  takeInitialPath: () => ipcRenderer.invoke(Channels.takeInitialPath),
  openRepo: (path) => ipcRenderer.invoke(Channels.openRepo, path),
  initRepo: (path) => ipcRenderer.invoke(Channels.initRepo, path),
  closeRepo: (root) => ipcRenderer.invoke(Channels.closeRepo, root),
  setActiveRepo: (root) => ipcRenderer.invoke(Channels.setActiveRepo, root),
  repoInfo: (root) => ipcRenderer.invoke(Channels.repoInfo, root),
  getCommandLog: () => ipcRenderer.invoke(Channels.getCommandLog),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onRepoChanged: (cb) => on(Channels.repoChanged, cb),
  onCommandLogged: (cb) => on(Channels.commandLogged, cb),
  onMenuAction: (cb) => on(Channels.menuAction, cb),
  onOpenPath: (cb) => on(Channels.openPath, cb),
}

contextBridge.exposeInMainWorld('api', api)
