/** Id del template che viene dal commit.template di git (non sta nella libreria). */
export const GIT_TEMPLATE_ID = 'git'

/** Toglie le righe di commento (#), come fa git quando il messaggio passa dall'editor. */
export function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
}

/** Oggetto (prima riga non vuota, così com'è) e corpo (con trim) di un messaggio, senza commenti. */
export function splitMessage(text: string): { subject: string; body: string } {
  const lines = stripComments(text.replace(/\r\n/g, '\n')).split('\n')
  const first = lines.findIndex((l) => l.trim() !== '')
  if (first === -1) return { subject: '', body: '' }
  return { subject: lines[first] ?? '', body: lines.slice(first + 1).join('\n').trim() }
}

/** feature/7hq2xk4mp-login → 7hq2xk4mp; vuoto se il branch non contiene "/" (main, develop) o se HEAD è staccato. */
export function ticketFromBranch(branch: string | null): string {
  if (!branch?.includes('/')) return ''
  return (branch.split('/').pop() ?? '').split('-')[0] ?? ''
}

/** Il template pronto per il composer: {branch} e {ticket} sostituiti, commenti tolti. */
export function expandTemplate(t: { subject: string; body: string }, branch: string | null): { subject: string; body: string } {
  const fill = (s: string) => stripComments(s).replaceAll('{branch}', branch ?? '').replaceAll('{ticket}', ticketFromBranch(branch))
  return { subject: fill(t.subject).replace(/\n/g, ' ').trimStart(), body: fill(t.body).trim() }
}
