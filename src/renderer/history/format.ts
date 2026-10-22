const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDate = (seconds: number): string => dateFormat.format(seconds * 1000)
