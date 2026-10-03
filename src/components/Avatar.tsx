import { initials } from '../lib/format'

export function Avatar({ name, url, size = 'normal' }: { name: string; url?: string | null; size?: 'small' | 'normal' | 'large' }) {
  return (
    <div className={`avatar avatar--${size}`} aria-label={`${name}'s avatar`}>
      {url ? <img src={url} alt="" /> : initials(name)}
    </div>
  )
}
