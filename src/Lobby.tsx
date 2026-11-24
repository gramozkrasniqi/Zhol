import { useCallback, useEffect, useRef, useState } from "react";
import { leagueOf, type Variant } from "../supabase/functions/_shared/engine";
import { api, sb, type Profile, type Table } from "./lib";

export function Lobby({ uid, onOpen }: { uid: string; onOpen: (id: string) => void }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [top, setTop] = useState<Profile[]>([]);
  const [variant, setVariant] = useState<Variant>("small");
  const [seats, setSeats] = useState(2);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const poll = useRef<number>();

  const load = useCallback(async () => {
    const [{ data: p }, { data: t }] = await Promise.all([
      sb.from("profiles").select().eq("id", uid).single(),
      sb.from("profiles").select().gt("games", 0).order("elo", { ascending: false }).limit(20),
    ]);
    if (p) { setMe(p); setName(p.username); }
    setTop(t ?? []);
  }, [uid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => window.clearInterval(poll.current), []);

  async function run<T>(f: () => Promise<T>) {
    setErr("");
    try { return await f(); } catch (e) { setErr((e as Error).message); }
  }

  async function quick() {
    const r = await run(() => api<{ table: Table; waiting?: boolean }>("quick_match", { variant }));
    if (!r) return;
    if (!r.waiting) return onOpen(r.table.id);
    // We opened a table: wait until someone sits down, and keep looking for others meanwhile
    setSearching(true);
    const myTable = r.table.id;
    window.clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const { data } = await sb.from("tables").select("status").eq("id", myTable).maybeSingle();
      if (data?.status === "playing") { window.clearInterval(poll.current); return onOpen(myTable); }
      try {
        const again = await api<{ table: Table; waiting?: boolean }>("quick_match", { variant });
        if (!again.waiting) { window.clearInterval(poll.current); onOpen(again.table.id); }
      } catch { /* keep waiting */ }
    }, 4000);
  }

  async function cancel() {
    window.clearInterval(poll.current);
    setSearching(false);
    const { data } = await sb.from("tables").select("id").eq("host", uid).eq("status", "waiting").eq("ranked", true);
    for (const t of data ?? []) await run(() => api("leave_table", { tableId: t.id }));
  }

  return (
    <>
      <header className="bar">
        <h1 className="logo">Zhol</h1>
        <button className="ghost" onClick={() => sb.auth.signOut()}>Logga ut</button>
      </header>

      {me && (
        <section className="panel me">
          <div>
            <div className="muted">Spelare</div>
            <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api("set_username", { username: name })).then(load); }}>
              <input aria-label="Användarnamn" value={name} onChange={(e) => setName(e.target.value)} />
              {name !== me.username && <button className="ghost">Spara</button>}
            </form>
          </div>
          <div className="stat"><b>{me.elo}</b><span>{leagueOf(me.elo)}</span></div>
          <div className="stat"><b>{me.wins}/{me.games}</b><span>vinster</span></div>
        </section>
      )}

      <section className="panel col">
        <h2>Spela</h2>
        <div className="seg" role="radiogroup" aria-label="Variant">
          {(["small", "big"] as const).map((v) => (
            <button key={v} role="radio" aria-checked={variant === v} className={variant === v ? "on" : ""} onClick={() => setVariant(v)}>
              {v === "small" ? "Zhol i vogël · 7" : "Zhol i madh · 14"}
            </button>
          ))}
        </div>
        {searching ? (
          <div className="row"><span className="pulse">Söker motståndare nära {me?.elo}…</span><button className="ghost" onClick={cancel}>Avbryt</button></div>
        ) : (
          <button className="primary big" onClick={quick}>Snabbmatch – rankad, 1 mot 1</button>
        )}
      </section>

      <section className="grid2">
        <div className="panel col">
          <h2>Med vänner</h2>
          <div className="seg">
            {[2, 4].map((n) => <button key={n} className={seats === n ? "on" : ""} onClick={() => setSeats(n)}>{n} spelare</button>)}
          </div>
          <button className="primary" onClick={() => run(() => api<{ table: Table }>("create_table", { variant, seats })).then((r) => r && onOpen(r.table.id))}>
            Skapa privat bord
          </button>
        </div>
        <form className="panel col" onSubmit={(e) => { e.preventDefault(); run(() => api<{ table: Table }>("join_table", { code })).then((r) => r && onOpen(r.table.id)); }}>
          <h2>Har du en kod?</h2>
          <input aria-label="Bordskod" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7P2QX" maxLength={6} />
          <button className="primary" disabled={code.length !== 6}>Gå med</button>
        </form>
      </section>
      {err && <p className="err">{err}</p>}

      <section className="panel">
        <h2>Topplista</h2>
        {top.length ? (
          <table className="board">
            <thead><tr><th>#</th><th>Spelare</th><th>Liga</th><th className="num">Elo</th></tr></thead>
            <tbody>{top.map((p, i) => (
              <tr key={p.id} className={p.id === uid ? "mine" : ""}><td>{i + 1}</td><td>{p.username}</td><td>{leagueOf(p.elo)}</td><td className="num">{p.elo}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted">Ingen har spelat än. Bli först på listan.</p>}
      </section>
    </>
  );
}
