export function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function formatLastSeen(value: string | null) {
  if (!value) return 'Offline'
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = formatTime(value)
  if (sameDay) return `Last seen today at ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`
  return `Last seen ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)}`
}

export function formatBytes(size: number | null) {
  if (!size) return 'Unknown size'
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length)
  return `${(size / 1024 ** exponent).toFixed(size / 1024 ** exponent >= 10 ? 0 : 1)} ${units[exponent - 1]}`
}

export function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}
