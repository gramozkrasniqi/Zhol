import { useState } from "react";
import { sb } from "./lib";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    setBusy(false);
    error ? setErr(error.message) : setSent(true);
  }

  async function guest() {
    setBusy(true); setErr("");
    const { error } = await sb.auth.signInAnonymously();
    setBusy(false);
    if (error) setErr("Gästinloggning är inte aktiverad i Supabase.");
  }

  return (
    <main className="wrap login">
      <h1 className="logo">Zhol</h1>
      <p className="lead">Loja shqiptare me letra – spela med vänner eller mot folk på din nivå.</p>
      {sent ? <p className="panel">Kolla din e-post – vi har skickat en inloggningslänk till <b>{email}</b>.</p> : (
        <form className="panel col" onSubmit={send}>
          <label htmlFor="em">E-post</label>
          <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@exempel.se" />
          <button className="primary" disabled={busy}>Skicka inloggningslänk</button>
          <button type="button" className="ghost" disabled={busy} onClick={guest}>Spela som gäst</button>
          {err && <p className="err">{err}</p>}
        </form>
      )}
    </main>
  );
}
