import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); navigate('/'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Login failed'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      minHeight:'100vh', background:'#f8fafc',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Inter',system-ui,sans-serif", padding:'24px',
    }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{
            width:48, height:48, background:'#2563eb',
            borderRadius:12, display:'flex', alignItems:'center',
            justifyContent:'center', margin:'0 auto 14px',
            color:'white', fontSize:18, fontWeight:800,
            boxShadow:'0 4px 12px rgba(37,99,235,.3)',
          }}>iT</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#0f172a', letterSpacing:'-.3px' }}>
            iTechArena ERP
          </div>
          <div style={{ fontSize:13, color:'#94a3b8', marginTop:4 }}>Sign in to your account</div>
        </div>

        {/* Card */}
        <div style={{
          background:'#ffffff', border:'1px solid #e2e8f0',
          borderRadius:16, padding:'28px 28px 24px',
          boxShadow:'0 4px 6px -1px rgba(0,0,0,.07),0 2px 4px -1px rgba(0,0,0,.04)',
        }}>
          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>
                Email address
              </label>
              <input
                type="email" required autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="harbans22@gmail.com"
                style={{
                  width:'100%', height:44, padding:'0 14px', boxSizing:'border-box',
                  background:'#f1f5f9', border:'1.5px solid #e2e8f0',
                  borderRadius:10, fontSize:14, color:'#0f172a',
                  outline:'none', transition:'border-color .15s, box-shadow .15s',
                }}
                onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,.12)';e.target.style.background='#fff';}}
                onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none';e.target.style.background='#f1f5f9';}}
              />
            </div>

            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>
                Password
              </label>
              <input
                type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width:'100%', height:44, padding:'0 14px', boxSizing:'border-box',
                  background:'#f1f5f9', border:'1.5px solid #e2e8f0',
                  borderRadius:10, fontSize:14, color:'#0f172a',
                  outline:'none', transition:'border-color .15s, box-shadow .15s',
                }}
                onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.boxShadow='0 0 0 3px rgba(37,99,235,.12)';e.target.style.background='#fff';}}
                onBlur={e=>{e.target.style.borderColor='#e2e8f0';e.target.style.boxShadow='none';e.target.style.background='#f1f5f9';}}
              />
            </div>

            {error && (
              <div style={{
                background:'#fef2f2', border:'1px solid #fecaca',
                borderRadius:8, padding:'10px 14px',
                fontSize:13, color:'#dc2626', display:'flex', alignItems:'center', gap:8,
              }}>
                <span style={{fontSize:15}}>⚠</span> {error}
              </div>
            )}

            {/* SIGN IN BUTTON — fully inline styled, no CSS class dependencies */}
            <button
              type="submit"
              disabled={busy}
              style={{
                width:'100%', height:46, marginTop:4,
                background: busy ? '#93c5fd' : '#2563eb',
                color:'#ffffff',
                border:'none', borderRadius:10,
                fontSize:15, fontWeight:700,
                cursor: busy ? 'not-allowed' : 'pointer',
                letterSpacing:'.01em',
                boxShadow: busy ? 'none' : '0 2px 8px rgba(37,99,235,.4)',
                transition:'background .15s, box-shadow .15s',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}
              onMouseEnter={e=>{ if(!busy)(e.target as HTMLButtonElement).style.background='#1d4ed8'; }}
              onMouseLeave={e=>{ if(!busy)(e.target as HTMLButtonElement).style.background='#2563eb'; }}
            >
              {busy ? (
                <>
                  <div style={{width:16,height:16,border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .6s linear infinite'}}/>
                  Signing in…
                </>
              ) : 'Sign in →'}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#94a3b8' }}>
          iTechArena Inventory ERP · Secure Access
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
