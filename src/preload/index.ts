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
  updatePreferences: (patch) => ipcRenderer.invoke(Channels.updatePreferences, patch),
  gitGlobalConfig: () => ipcRenderer.invoke(Channels.gitGlobalConfig),
  setGitGlobalConfig: (key, value) => ipcRenderer.invoke(Channels.setGitGlobalConfig, key, value),
  checkGit: () => ipcRenderer.invoke(Channels.checkGit),
  setGitPath: (path) => ipcRenderer.invoke(Channels.setGitPath, path),
  pickRepoFolder: (defaultPath) => ipcRenderer.invoke(Channels.pickRepoFolder, defaultPath),
  takeInitialPath: () => ipcRenderer.invoke(Channels.takeInitialPath),
  openRepo: (path) => ipcRenderer.invoke(Channels.openRepo, path),
  initRepo: (path) => ipcRenderer.invoke(Channels.initRepo, path),
  closeRepo: (root) => ipcRenderer.invoke(Channels.closeRepo, root),
  setActiveRepo: (root) => ipcRenderer.invoke(Channels.setActiveRepo, root),
  repoInfo: (root) => ipcRenderer.invoke(Channels.repoInfo, root),
  getCommandLog: () => ipcRenderer.invoke(Channels.getCommandLog),
  historyLoad: (root, query) => ipcRenderer.invoke(Channels.historyLoad, root, query),
  historyPage: (root, start, count) => ipcRenderer.invoke(Channels.historyPage, root, start, count),
  historyFileCounts: (root, start, count) => ipcRenderer.invoke(Channels.historyFileCounts, root, start, count),
  commitDetail: (root, sha) => ipcRenderer.invoke(Channels.commitDetail, root, sha),
  commitFileDiff: (root, sha, file, options) => ipcRenderer.invoke(Channels.commitFileDiff, root, sha, file, options),
  workingStatus: (root) => ipcRenderer.invoke(Channels.workingStatus, root),
  workingDiff: (root, file, area, options) => ipcRenderer.invoke(Channels.workingDiff, root, file, area, options),
  stage: (root, paths) => ipcRenderer.invoke(Channels.stage, root, paths),
  unstage: (root, files) => ipcRenderer.invoke(Channels.unstage, root, files),
  discard: (root, files) => ipcRenderer.invoke(Channels.discard, root, files),
  stageAll: (root) => ipcRenderer.invoke(Channels.stageAll, root),
  unstageAll: (root) => ipcRenderer.invoke(Channels.unstageAll, root),
  applyPatch: (root, patch, mode) => ipcRenderer.invoke(Channels.applyPatch, root, patch, mode),
  commit: (root, message, amend) => ipcRenderer.invoke(Channels.commit, root, message, amend),
  lastCommitMessage: (root) => ipcRenderer.invoke(Channels.lastCommitMessage, root),
  stashList: (root) => ipcRenderer.invoke(Channels.stashList, root),
  stashPush: (root, message, untracked) => ipcRenderer.invoke(Channels.stashPush, root, message, untracked),
  stashAction: (root, action, ref) => ipcRenderer.invoke(Channels.stashAction, root, action, ref),
  ignorePath: (root, path) => ipcRenderer.invoke(Channels.ignorePath, root, path),
  refs: (root) => ipcRenderer.invoke(Channels.refs, root),
  git: (root, command) => ipcRenderer.invoke(Channels.command, root, command),
  rebaseRange: (root, sha) => ipcRenderer.invoke(Channels.rebaseRange, root, sha),
  clone: (url, parent) => ipcRenderer.invoke(Channels.clone, url, parent),
  openInEditor: (root, path) => ipcRenderer.invoke(Channels.openInEditor, root, path),
  contextMenu: (items) => ipcRenderer.invoke(Channels.contextMenu, items),
  pickApp: () => ipcRenderer.invoke(Channels.pickApp),
  startDrag: (root, item) => ipcRenderer.sendSync(Channels.startDrag, root, item),
  saveCommitTemplates: (templates) => ipcRenderer.invoke(Channels.saveCommitTemplates, templates),
  setDefaultTemplate: (root, id) => ipcRenderer.invoke(Channels.setDefaultTemplate, root, id),
  gitCommitTemplate: (root) => ipcRenderer.invoke(Channels.gitCommitTemplate, root),
  openInTerminal: (root) => ipcRenderer.invoke(Channels.openInTerminal, root),
  onProgress: (cb) => on(Channels.progress, cb),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onRepoChanged: (cb) => on(Channels.repoChanged, cb),
  onCommandLogged: (cb) => on(Channels.commandLogged, cb),
  onMenuAction: (cb) => on(Channels.menuAction, cb),
  onOpenPath: (cb) => on(Channels.openPath, cb),
}

contextBridge.exposeInMainWorld('api', api)
