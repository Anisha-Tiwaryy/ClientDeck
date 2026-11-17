import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveSession } from '../api.js';
import { Btn, ErrorLine, inputCls } from '../ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('asha@clientdeck.demo');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const nav = useNavigate();
  async function submit(e) {
    e.preventDefault(); setError('');
    try { saveSession(await api('/api/auth/login', { method: 'POST', body: { email, password } })); nav('/today'); }
    catch (err) { setError(err.message); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-3 rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-blue-800">ClientDeck</h1>
        <p className="text-sm text-slate-500">Sales CRM: leads, follow-ups, demos and invoices.</p>
        <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
        <ErrorLine error={error} />
        <Btn className="w-full">Log in</Btn>
        <p className="text-xs text-slate-400">Demo: asha@clientdeck.demo or manager@clientdeck.demo, password123</p>
      </form>
    </div>
  );
}
