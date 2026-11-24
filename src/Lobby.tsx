import { tutorialDone } from "./games/zhol/Tutorial";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { GAMES } from "../supabase/functions/_shared/games";
import { leagueOf } from "../supabase/functions/_shared/rating";
import { api, chips, DAILY_CHIPS, sb, STAKES, START_ELO, swedishToday, type Profile, type Rating, type Table, type Wallet } from "./lib";
import { Fan } from "./Login";
import { Avatar, PRESETS, squareWebp } from "./Avatar";

type Row = Rating & { profiles: { username: string; avatar: string | null } };
const BOT_FILL_AFTER = 20; // seconds of quick-match search before bots fill the table

export function Lobby({ uid, onOpen, onTutorial, onRules }: { uid: string; onOpen: (id: string) => void; onTutorial: () => void; onRules: () => void }) {
  const newbie = !tutorialDone();
  const ids = Object.keys(GAMES);
  const [game, setGame] = useState(ids[0]);
  const mod = GAMES[game];
  const [variant, setVariant] = useState(mod.variants[0].id);
  const [seats, setSeats] = useState(mod.seatOptions[0]);
  const [me, setMe] = useState<Profile | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [stake, setStake] = useState(0);
  const [top, setTop] = useState<Row[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const [waitingTable, setWaitingTable] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const poll = useRef<number>();

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }, { data: t }, { data: w }] = await Promise.all([
      sb.from("profiles").select().eq("id", uid).single(),
      sb.from("ratings").select().eq("user_id", uid).eq("game", game).maybeSingle(),
      sb.from("ratings").select("*, profiles(username, avatar)").eq("game", game).order("elo", { ascending: false }).limit(20),
      sb.from("wallets").select().eq("user_id", uid).maybeSingle(),
    ]);
    setWallet(w);
    if (p) { setMe(p); setName(p.username); }
    setRating(r);
    setTop((t ?? []) as Row[]);
  }, [uid, game]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => window.clearInterval(poll.current), []);

  function pickGame(id: string) {
    setGame(id);
    setVariant(GAMES[id].variants[0].id);
    setSeats(GAMES[id].seatOptions[0]);
  }

  async function run<T>(f: () => Promise<T>) {
    setErr("");
    try { return await f(); } catch (e) { setErr((e as Error).message); }
  }

  async function quick() {
    const r = await run(() => api<{ table: Table; waiting?: boolean }>("quick_match", { game, variant, stake, seats }));
    if (!r) return;
    if (!r.waiting) return onOpen(r.table.id);
    // We opened a table: wait for someone to sit down, and keep looking for others meanwhile
    setSearching(true);
    const myTable = r.table.id;
    setWaitingTable(myTable);
    setWaited(0);
    const started = Date.now();
    window.clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const secs = Math.round((Date.now() - started) / 1000);
      setWaited(secs);
      // Nobody came: fill the table with bots so there is always a game
      if (secs >= BOT_FILL_AFTER) {
        window.clearInterval(poll.current);
        const f = await run(() => api<{ table: Table }>("fill_bots", { tableId: myTable }));
        if (f) onOpen(myTable);
        return;
      }
      const { data } = await sb.from("tables").select("status").eq("id", myTable).maybeSingle();
      if (data?.status === "playing") { window.clearInterval(poll.current); return onOpen(myTable); }
      try {
        const again = await api<{ table: Table; waiting?: boolean }>("quick_match", { game, variant, stake, seats });
        if (!again.waiting) { window.clearInterval(poll.current); onOpen(again.table.id); }
      } catch { /* keep waiting */ }
    }, 4000);
  }

  async function botsNow() {
    window.clearInterval(poll.current);
    setSearching(false);
    const r = waitingTable
      ? await run(() => api<{ table: Table }>("fill_bots", { tableId: waitingTable }))
      : await run(() => api<{ table: Table }>("play_bots", { game, variant, seats }));
    if (r) onOpen(r.table.id);
  }

  async function cancel() {
    window.clearInterval(poll.current);
    setSearching(false);
    setWaitingTable(null);
    const { data } = await sb.from("tables").select("id").eq("host", uid).eq("status", "waiting").eq("ranked", true);
    for (const t of data ?? []) await run(() => api("leave_table", { tableId: t.id }));
  }

  async function setAvatar(value: string) {
    const r = await run(async () => {
      const { error } = await sb.from("profiles").update({ avatar: value }).eq("id", uid);
      if (error) throw new Error("Avataren kunde inte sparas");
      return true;
    });
    if (r) load();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    await run(async () => {
      const blob = await squareWebp(file);
      const path = `${uid}/avatar.webp`;
      const { error } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (error) throw new Error("Bilden kunde inte laddas upp");
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      await setAvatar(`${url}?v=${Date.now()}`);
    });
    setUploading(false);
  }

  const elo = rating?.elo ?? START_ELO;
  const balance = wallet?.balance ?? 0;
  const dailyReady = wallet !== null && wallet.last_daily !== swedishToday();
  const podium = top.slice(0, 3);
  const rest = top.slice(3);

  return (
    <div className="lobby">
      <header className="topbar">
        <span className="wordmark">Zhol</span>
        <div className="topbar-right">
          <span className="chip-pill" title="Dina Lek"><i className="chip-ico" aria-hidden="true" />{chips(balance)} Lek</span>
          <details className="profile">
            <summary aria-label="Profil och avatar">
              <Avatar who={{ username: me?.username ?? "?", avatar: me?.avatar }} size={42} />
            </summary>
            <div className="profile-menu panel col">
              <div className="col">
                <span className="menu-label">Din avatar</span>
                <div className="avatar-grid" role="radiogroup" aria-label="Välj avatar">
                  {PRESETS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={me?.avatar === `preset:${p.id}`} aria-label={p.label}
                      className={`avatar-opt ${me?.avatar === `preset:${p.id}` ? "on" : ""}`} onClick={() => setAvatar(`preset:${p.id}`)}>
                      <Avatar who={{ username: "", avatar: `preset:${p.id}` }} size={40} />
                    </button>
                  ))}
                </div>
                <label className="upload ghost">
                  <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
                  {uploading ? "Laddar upp…" : "Ladda upp egen bild"}
                </label>
              </div>
              <form className="col" onSubmit={(e) => { e.preventDefault(); run(() => api("set_username", { username: name })).then(load); }}>
                <label htmlFor="un">Ditt namn vid bordet</label>
                <input id="un" value={name} onChange={(e) => setName(e.target.value)} />
                <button className="primary" disabled={!me || name === me.username}>Spara namn</button>
              </form>
              <button className="ghost" onClick={() => sb.auth.signOut()}>Logga ut</button>
            </div>
          </details>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <h1>Sätt dig vid bordet.</h1>
          <div className="standing">
            <span className="badge league" data-league={leagueOf(elo)}>{leagueOf(elo)}</span>
            <span><b>{elo}</b> Elo</span>
            <span><b>{rating?.wins ?? 0}</b> vinster av {rating?.games ?? 0}</span>
          </div>
          {searching ? (
            <div className="searching">
              <span className="radar" aria-hidden="true" />
              <p>Söker {seats - 1 === 1 ? "en motståndare" : `${seats - 1} motståndare`} nära {elo} Elo. Botar tar platserna om {Math.max(0, BOT_FILL_AFTER - waited)} sekunder.</p>
              <div className="row">
                <button className="primary" onClick={botsNow}>Spela mot botar nu</button>
                <button className="ghost" onClick={cancel}>Avbryt</button>
              </div>
            </div>
          ) : (
            <div className="cta">
              <button className="primary big" onClick={quick}>Snabbmatch</button>
              <button className="ghost big" onClick={botsNow}>Mot botar</button>
            </div>
          )}
          <p className="fine">Snabbmatch är rankad och ger Elo. Mot botar är gratis och orankat.</p>
          {newbie
            ? <button className="learn" onClick={onTutorial}><b>Ny på Zhol?</b> Lär dig spela på två minuter</button>
            : <p className="fine links"><button className="link" onClick={onRules}>Regler</button><button className="link" onClick={onTutorial}>Öva en runda</button></p>}
        </div>
        <Fan />
      </section>
      <div className="qilim" aria-hidden="true" />

      {dailyReady && (
        <button className="daily" onClick={() => run(() => api("claim_daily")).then(load)}>
          <i className="chip-ico" aria-hidden="true" /> Hämta dagens {chips(DAILY_CHIPS)} gratis Lek
        </button>
      )}
      {err && <p className="err">{err}</p>}

      <section className="setup panel">
        <h2>Ditt bord</h2>
        {ids.length > 1 && (
          <div className="seg" role="radiogroup" aria-label="Spel">
            {ids.map((id) => <button key={id} role="radio" aria-checked={game === id} className={game === id ? "on" : ""} onClick={() => pickGame(id)}>{GAMES[id].name}</button>)}
          </div>
        )}
        <div className="setup-grid">
          <fieldset>
            <legend>Variant</legend>
            <div className="variants" role="radiogroup" aria-label="Variant">
              {mod.variants.map((v) => {
                const [title, sub] = v.label.split(" · ");
                return (
                  <button key={v.id} role="radio" aria-checked={variant === v.id} className={`variant ${variant === v.id ? "on" : ""}`} onClick={() => setVariant(v.id)}>
                    <b>{title}</b><span>{sub}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend>Spelare</legend>
            <div className="seats-pick" role="radiogroup" aria-label="Antal spelare">
              {mod.seatOptions.map((n) => (
                <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? "on" : ""} onClick={() => setSeats(n)}>
                  <span className="dots" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ "--a": `${(i * 360) / n}deg` } as CSSProperties} />)}</span>
                  <b>{n}</b>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Insats per spelare</legend>
            <div className="chips" role="radiogroup" aria-label="Insats per spelare">
              {STAKES.map((n) => (
                <button key={n} role="radio" aria-checked={stake === n} className={`pchip v${n} ${stake === n ? "on" : ""}`} disabled={n > balance} onClick={() => setStake(n)}
                  aria-label={n === 0 ? "Gratis" : `${chips(n)} Lek`}>
                  <span>{n === 0 ? "0" : n >= 1000 ? `${n / 1000}k` : n}</span>
                </button>
              ))}
            </div>
            <p className="fine">{stake === 0 ? "Gratis bord." : `Pott ${chips(stake * seats)} Lek. Vinnaren tar allt.`}</p>
          </fieldset>
        </div>
      </section>

      <section className="duo">
        <div className="panel col friends">
          <h2>Spela med vänner</h2>
          <p className="muted">Skapa ett privat bord för {seats} och dela koden. Tomma platser kan fyllas med botar.</p>
          <button className="primary" onClick={() => run(() => api<{ table: Table }>("create_table", { game, variant, seats, stake })).then((r) => r && onOpen(r.table.id))}>
            Skapa privat bord
          </button>
        </div>
        <form className="panel col" onSubmit={(e) => { e.preventDefault(); run(() => api<{ table: Table }>("join_table", { code })).then((r) => r && onOpen(r.table.id)); }}>
          <h2>Har du fått en kod?</h2>
          <input className="code-input" aria-label="Bordskod" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7P2QX" maxLength={6} />
          <button className="primary" disabled={code.length !== 6}>Gå med i bordet</button>
        </form>
      </section>

      <section className="panel leaders">
        <h2>Bästa spelarna i {mod.name}</h2>
        {top.length ? (
          <>
            <ol className="podium">
              {podium.map((p, i) => (
                <li key={p.user_id} className={`place p${i + 1} ${p.user_id === uid ? "mine" : ""}`}>
                  <Avatar who={p.profiles} size={i === 0 ? 56 : 46} />
                  <b className="nm">{p.profiles.username}</b>
                  <span className="elo-n">{p.elo}</span>
                  <span className="step" aria-hidden="true">{i + 1}</span>
                </li>
              ))}
            </ol>
            {rest.length > 0 && (
              <table className="board">
                <thead><tr><th>Plats</th><th>Spelare</th><th>Liga</th><th className="num">Elo</th></tr></thead>
                <tbody>{rest.map((p, i) => (
                  <tr key={p.user_id} className={p.user_id === uid ? "mine" : ""}><td>{i + 4}</td><td>{p.profiles.username}</td><td>{leagueOf(p.elo)}</td><td className="num">{p.elo}</td></tr>
                ))}</tbody>
              </table>
            )}
          </>
        ) : <p className="muted">Ingen har spelat en rankad match än. Vinn en snabbmatch så hamnar du först här.</p>}
      </section>
      <p className="fine center">Lek i Zhol är spelpengar, inte riktiga albanska lek. De har inget värde och kan inte växlas in eller föras över.</p>
    </div>
  );
}
