import { useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { Icon } from '../components/Icon'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isSupabaseConfigured) return
    setLoading(true)
    setError(null)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) setError('That email or password is not correct. Please try again.')
    setLoading(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark"><Icon name="lock" size={21} /></div>
        <p className="eyebrow">ALYAS SOFTWARE</p>
        <h1>A conversation for two.</h1>
        <p className="auth-copy">Sign in to continue your private conversation.</p>
        {!isSupabaseConfigured ? (
          <p className="form-notice">Add your Supabase URL and anon key to a local <code>.env</code> file, then restart the app.</p>
        ) : (
          <form onSubmit={submit} className="login-form">
            <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={loading} /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={loading}>{loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
