import { t } from "./i18n";
import { LangSwitch } from "./LangSwitch";
import { useState, type CSSProperties, type FormEvent } from "react";
import { CardView } from "./games/zhol/Card";
import { sb } from "./lib";

const FAN = [
  { id: 1, r: 1, s: 1 }, { id: 2, r: 13, s: 0 }, { id: 3, j: 1 as const }, { id: 4, r: 12, s: 2 }, { id: 5, r: 11, s: 3 },
];

export function Fan({ small }: { small?: boolean }) {
  return (
    <div className={`fan ${small ? "small" : ""}`} aria-hidden="true">
      {FAN.map((c, i) => <div key={c.id} className="fan-card" style={{ "--i": i - 2 } as CSSProperties}><CardView c={c} /></div>)}
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
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
    if (error) setErr(t("Gästinloggning är inte påslagen. Logga in med e-post i stället."));
  }

  return (
    <main className="login">
      <div className="login-art">
        <Fan />
        <h1 className="wordmark big">Zhol</h1>
        <p className="lead">{t("Loja shqiptare me letra. Spela med vänner, mot folk på din nivå eller mot botar – när som helst.")}</p>
        <LangSwitch />
      </div>
      <div className="qilim" aria-hidden="true" />
      {sent ? (
        <p className="panel login-box">{t("Kolla din e-post. Inloggningslänken är skickad till")} <b>{email}</b>.</p>
      ) : (
        <form className="panel login-box col" onSubmit={send}>
          <button type="button" className="primary big" disabled={busy} onClick={guest}>{t("Spela direkt som gäst")}</button>
          <div className="or"><span>{t("eller spara ditt konto")}</span></div>
          <label htmlFor="em">{t("E-post")}</label>
          <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("du@exempel.se")} />
          <button className="ghost" disabled={busy}>{t("Skicka inloggningslänk")}</button>
          {err && <p className="err">{err}</p>}
        </form>
      )}
    </main>
  );
}
