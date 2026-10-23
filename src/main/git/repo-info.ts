import { basename, resolve } from 'node:path'
import type { RepoInfo } from '../../shared/types'
import type { GitRunner } from './runner'

export async function readRepoInfo(runner: GitRunner): Promise<RepoInfo> {
  // resolve(): su Windows git restituisce C:/x/y, noi usiamo C:\x\y
  const root = resolve((await runner.run(['rev-parse', '--show-toplevel'])).stdout.trim())
  // exit 1 = HEAD staccato / repo senza commit: casi normali, non errori
  const [branch, sha] = await Promise.all([
    runner.run(['symbolic-ref', '--short', '-q', 'HEAD'], { okCodes: [0, 1] }),
    runner.run(['rev-parse', '--verify', '-q', 'HEAD'], { okCodes: [0, 1] }),
  ])
  return {
    root,
    name: basename(root),
    branch: branch.stdout.trim() || null,
    headSha: sha.stdout.trim() || null,
  }
}
