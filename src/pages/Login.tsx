import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  biometricAvailable, biometricEnabled, biometricOffered, markBiometricOffered,
  enableBiometric, disableBiometric, unlockWithBiometric,
} from '../native/biometric';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [slowMsg, setSlowMsg]   = useState('');
  const [bioOn, setBioOn]       = useState(biometricEnabled());
  // After a password sign-in on a phone with a fingerprint enrolled, offer
  // quick sign-in once. Holds the credentials only until the user answers.
  const [offer, setOffer]       = useState<{ email: string; password: string } | null>(null);
  const autoTried = useRef(false);

  const doLogin = async (em: string, pw: string, viaBio: boolean) => {
    setBusy(true); setError(''); setSlowMsg('');
    // After 5s show a friendly "waking up" note — Render free tier has a ~30s cold-start
    const slowTimer = setTimeout(() => setSlowMsg('Server is starting up, please wait…'), 5000);
    try {
      await login(em, pw);
      if (!viaBio && !biometricEnabled() && !biometricOffered() && await biometricAvailable()) {
        setOffer({ email: em, password: pw });
        return;
      }
      navigate('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      // A stored password that no longer works (changed on desktop) is wiped
      // so the next attempt asks for the new one instead of failing forever.
      if (viaBio && /invalid|incorrect|credential|password|401/i.test(msg)) {
        await disableBiometric(); setBioOn(false);
        setError('Your password has changed. Sign in with the new one to turn fingerprint back on.');
      } else setError(msg);
    }
    finally { clearTimeout(slowTimer); setBusy(false); setSlowMsg(''); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void doLogin(email, password, false); };

  const bioSignIn = async () => {
    setError('');
    try {
      const c = await unlockWithBiometric();
      if (c) await doLogin(c.email, c.password, true);
    } catch {
      await disableBiometric(); setBioOn(false);
      setError('Fingerprint sign-in was reset on this phone. Sign in with your password to turn it on again.');
    }
  };

  // Open the fingerprint prompt straight away when it is set up.
  useEffect(() => {
    if (bioOn && !autoTried.current) { autoTried.current = true; void bioSignIn(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bioOn]);

  const answerOffer = async (yes: boolean) => {
    const o = offer; setOffer(null); markBiometricOffered();
    if (yes && o) {
      try { await enableBiometric(o.email, o.password); setBioOn(true); }
      catch { /* cancelled at the fingerprint prompt — they can sign in normally */ }
    }
    navigate('/');
  };

  if (offer) {
    return (
      <div style={{ minHeight:'100dvh', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:"'Inter',system-ui,sans-serif" }}>
        <div style={{ width:'100%', maxWidth:360, background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, textAlign:'center' }}>
          <FingerIcon size={44} />
          <div style={{ fontSize:17, fontWeight:700, color:'#0f172a', marginTop:12 }}>Sign in with your fingerprint?</div>
          <div style={{ fontSize:13, color:'#64748b', marginTop:6, lineHeight:1.5 }}>
            Next time, touch the sensor instead of typing your password. Your password is stored encrypted on this phone only.
          </div>
          <button onClick={() => answerOffer(true)} style={{ width:'100%', height:46, marginTop:20, border:'none', borderRadius:10, background:'#2563eb', color:'#fff', fontSize:15, fontWeight:700 }}>
            Turn on fingerprint
          </button>
          <button onClick={() => answerOffer(false)} style={{ width:'100%', height:42, marginTop:8, border:'none', borderRadius:10, background:'none', color:'#64748b', fontSize:14, fontWeight:600 }}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:'100dvh', background:'#f8fafc',
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
          <form onSubmit={submit} method="post" action="#" autoComplete="on" style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>
                Email address
              </label>
              <input
                type="email" required autoFocus={!bioOn}
                name="username" id="username" autoComplete="username" inputMode="email"
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
                name="password" id="password" autoComplete="current-password"
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

            {slowMsg && (
              <div style={{
                background:'#eff6ff', border:'1px solid #bfdbfe',
                borderRadius:8, padding:'10px 14px',
                fontSize:12, color:'#1d4ed8', display:'flex', alignItems:'center', gap:8,
              }}>
                <div style={{width:12,height:12,border:'2px solid rgba(29,78,216,.3)',borderTopColor:'#1d4ed8',borderRadius:'50%',animation:'spin .8s linear infinite',flexShrink:0}}/> {slowMsg}
              </div>
            )}
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

          {bioOn && (
            <button type="button" onClick={bioSignIn} disabled={busy}
              style={{ width:'100%', height:46, marginTop:12, border:'1.5px solid #bfdbfe', borderRadius:10, background:'#eff6ff', color:'#1d4ed8', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <FingerIcon size={20} /> Sign in with fingerprint
            </button>
          )}
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#94a3b8' }}>
          iTechArena Inventory ERP · Secure Access
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function FingerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
    </svg>
  );
}
