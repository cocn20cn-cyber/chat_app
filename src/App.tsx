import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ChatPage } from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { updateLastSeen } from './services/chat'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await updateLastSeen()
    await supabase.auth.signOut()
  }

  if (loading) return <main className="center-screen"><span className="spinner" /> Restoring your session…</main>
  return session ? <ChatPage user={session.user} onLogout={logout} /> : <LoginPage />
}
