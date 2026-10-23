import { execFile } from 'node:child_process'
import type { GitCheck } from '../../shared/types'
import { t } from '../i18n'

export const MIN_GIT = [2, 35, 0] as const

export function parseGitVersion(out: string): [number, number, number] | null {
  const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(out)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null
}

export function isAtLeast(v: readonly number[], min: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i] !== min[i]) return (v[i] ?? 0) > (min[i] ?? 0)
  }
  return true
}

export function checkGit(gitPath: string): Promise<GitCheck> {
  return new Promise((resolve) => {
    execFile(gitPath, ['--version'], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, path: gitPath, version: null, error: t('error.gitNotFound', { path: gitPath, detail: err.message }) })
        return
      }
      const v = parseGitVersion(stdout)
      if (!v) {
        resolve({ ok: false, path: gitPath, version: null, error: t('error.gitUnexpected', { path: gitPath, output: stdout.trim() }) })
        return
      }
      const version = v.join('.')
      if (!isAtLeast(v, MIN_GIT)) {
        resolve({ ok: false, path: gitPath, version, error: t('error.gitTooOld', { min: MIN_GIT.join('.'), version }) })
        return
      }
      resolve({ ok: true, path: gitPath, version, error: null })
    })
  })
}
