import type { ReactNode } from 'react'

export type IconName = 'attach' | 'bell' | 'bellOff' | 'check' | 'checkDouble' | 'close' | 'file' | 'lock' | 'mic' | 'micOff' | 'phone' | 'send' | 'settings' | 'stop' | 'video'

interface Props {
  name: IconName
  size?: number
  stroke?: number
}

export function Icon({ name, size = 20, stroke = 1.9 }: Props) {
  const paths: Record<IconName, ReactNode> = {
    attach: <path d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.3-9.3a3.5 3.5 0 1 1 5 5l-9.3 9.3a2 2 0 0 1-2.8-2.8l8.6-8.6" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    bellOff: <><path d="m3 3 18 18" /><path d="M18 8a6 6 0 0 0-8.5-5.5M6.3 6.3C6 8.4 6 11 6 11c0 4.7-2.1 5.6-2.8 6h12.5M13.7 21a2 2 0 0 1-3.4 0" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    checkDouble: <><path d="m2.5 12 3.8 3.8L14 8.2" /><path d="m8.5 12 3.8 3.8L21.5 6.2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    lock: <><rect width="14" height="11" x="5" y="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    mic: <><rect width="8" height="13" x="8" y="3" rx="4" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" /></>,
    micOff: <><path d="m3 3 18 18" /><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 10.5V7a3 3 0 0 0-5.4-1.8M19 10v2a7 7 0 0 1-1.2 3.9M5 10v2a7 7 0 0 0 12 4.8M12 19v3M8 22h8" /></>,
    phone: <path d="M21 15.5v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 1.1 2.7 2 2 0 0 1 3.1.5h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7 8.4a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.8 2.2Z" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4.3v-3.4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L8 5.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3.4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.4 1Z" /></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
    video: <><rect width="15" height="14" x="3" y="5" rx="2" /><path d="m18 10 3.5-2v8L18 14" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
