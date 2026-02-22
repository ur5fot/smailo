const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function formatIfDate(val: unknown): unknown {
  if (typeof val !== 'string' || !ISO_RE.test(val)) return val
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return val
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d)
  } catch {
    return val
  }
}
