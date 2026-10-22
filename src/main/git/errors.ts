const CASES: [RegExp, string][] = [
  [
    /could not read Username|Authentication failed|terminal prompts disabled|Permission denied \(publickey/i,
    'Autenticazione non riuscita: configura le credenziali di git (credential helper o chiave SSH caricata in ssh-agent).',
  ],
  [/\[rejected\]|fetch first|non-fast-forward/, 'Push rifiutato: sul remote ci sono commit che non hai. Fai pull e riprova.'],
  [/index\.lock/, "Un'altra operazione git è in corso (index.lock). Se nessun git è attivo, elimina .git/index.lock."],
  [/divergent branches/, 'Il branch locale e quello remoto sono divergenti: usa "Pull (rebase)" o "Pull (merge)".'],
  [/^CONFLICT/m, 'Ci sono conflitti: risolvili, segnali come risolti e continua.'],
]

export function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
}

/** Messaggio per l'utente: dedicato per i casi noti, altrimenti la prima riga utile (git a volte scrive l'errore su stdout). */
export function explain(stderr: string, stdout = ''): string | undefined {
  const all = `${stderr}\n${stdout}`
  for (const [pattern, message] of CASES) if (pattern.test(all)) return message
  return firstLine(stderr) ?? firstLine(stdout)
}
