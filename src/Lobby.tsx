import { t } from "./i18n";
import { LangSwitch } from "./LangSwitch";
import { DRINKS, DrinkIcon } from "./Drink";
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
  const hasPoints = mod.variants.some((v) => v.id.endsWith("-p"));
  const pointsMode = variant.endsWith("-p");
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
      if (error) throw new Error(t("Avataren kunde inte sparas"));
      return true;
    });
    if (r) load();
  }

  async function setDrink(value: "kafe" | "caj") {
    const r = await run(async () => {
      const { error } = await sb.from("profiles").update({ drink: value }).eq("id", uid);
      if (error) throw new Error(t("Drycken kunde inte sparas"));
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
      if (error) throw new Error(t("Bilden kunde inte laddas upp"));
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
          <span className="chip-pill" title={t("Dina Lek")}><i className="chip-ico" aria-hidden="true" />{chips(balance)} Lek</span>
          <details className="profile">
            <summary aria-label={t("Profil och avatar")}>
              <Avatar who={{ username: me?.username ?? "?", avatar: me?.avatar }} size={42} />
            </summary>
            <div className="profile-menu panel col">
              <div className="col">
                <span className="menu-label">{t("Din avatar")}</span>
                <div className="avatar-grid" role="radiogroup" aria-label={t("Välj avatar")}>
                  {PRESETS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={me?.avatar === `preset:${p.id}`} aria-label={t(p.label)}
                      className={`avatar-opt ${me?.avatar === `preset:${p.id}` ? "on" : ""}`} onClick={() => setAvatar(`preset:${p.id}`)}>
                      <Avatar who={{ username: "", avatar: `preset:${p.id}` }} size={40} />
                    </button>
                  ))}
                </div>
                <label className="upload ghost">
                  <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
                  {uploading ? t("Laddar upp…") : t("Ladda upp egen bild")}
                </label>
              </div>
              <div className="col">
                <span className="menu-label">{t("Din dryck vid bordet")}</span>
                <div className="drink-pick" role="radiogroup" aria-label={t("Välj dryck")}>
                  {DRINKS.map((d) => (
                    <button key={d.id} role="radio" aria-checked={(me?.drink ?? "kafe") === d.id}
                      className={(me?.drink ?? "kafe") === d.id ? "on" : ""} onClick={() => setDrink(d.id)}>
                      <DrinkIcon kind={d.id} size={40} /><span>{t(d.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <form className="col" onSubmit={(e) => { e.preventDefault(); run(() => api("set_username", { username: name })).then(load); }}>
                <label htmlFor="un">{t("Ditt namn vid bordet")}</label>
                <input id="un" value={name} onChange={(e) => setName(e.target.value)} />
                <button className="primary" disabled={!me || name === me.username}>{t("Spara namn")}</button>
              </form>
              <LangSwitch />
              <button className="ghost" onClick={() => sb.auth.signOut()}>{t("Logga ut")}</button>
            </div>
          </details>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <h1>{t("Sätt dig vid bordet.")}</h1>
          <div className="standing">
            <span className="badge league" data-league={leagueOf(elo)}>{t(leagueOf(elo))}</span>
            <span><b>{elo}</b> Elo</span>
            <span><b>{rating?.wins ?? 0}</b> {t("vinster av {n}", { n: rating?.games ?? 0 })}</span>
          </div>
          {searching ? (
            <div className="searching">
              <span className="radar" aria-hidden="true" />
              <p>{t("Söker {who} nära {elo} Elo. Botar tar platserna om {s} sekunder.", { who: seats - 1 === 1 ? t("en motståndare") : t("{n} motståndare", { n: seats - 1 }), elo, s: Math.max(0, BOT_FILL_AFTER - waited) })}</p>
              <div className="row">
                <button className="primary" onClick={botsNow}>{t("Spela mot botar nu")}</button>
                <button className="ghost" onClick={cancel}>{t("Avbryt")}</button>
              </div>
            </div>
          ) : (
            <div className="cta">
              <button className="primary big" onClick={quick}>{t("Snabbmatch")}</button>
              <button className="ghost big" onClick={botsNow}>{t("Mot botar")}</button>
            </div>
          )}
          <p className="fine">{t("Snabbmatch är rankad och ger Elo. Mot botar är gratis och orankat.")}</p>
          {newbie
            ? <button className="learn" onClick={onTutorial}><b>{t("Ny på Zhol?")}</b> {t("Lär dig spela på två minuter")}</button>
            : <p className="fine links"><button className="link" onClick={onRules}>{t("Regler")}</button><button className="link" onClick={onTutorial}>{t("Öva en runda")}</button></p>}
        </div>
        <Fan />
      </section>
      <div className="qilim" aria-hidden="true" />

      {dailyReady && (
        <button className="daily" onClick={() => run(() => api("claim_daily")).then(load)}>
          <i className="chip-ico" aria-hidden="true" /> {t("Hämta dagens {n} gratis Lek", { n: chips(DAILY_CHIPS) })}
        </button>
      )}
      {err && <p className="err">{err}</p>}

      <section className="setup panel">
        <h2>{t("Ditt bord")}</h2>
        {ids.length > 1 && (
          <div className="seg" role="radiogroup" aria-label={t("Spel")}>
            {ids.map((id) => <button key={id} role="radio" aria-checked={game === id} className={game === id ? "on" : ""} onClick={() => pickGame(id)}>{GAMES[id].name}</button>)}
          </div>
        )}
        <div className="setup-grid">
          <fieldset>
            <legend>{t("Variant")}</legend>
            <div className="variants" role="radiogroup" aria-label={t("Variant")}>
              {mod.variants.filter((v) => !v.id.endsWith("-p")).map((v) => {
                const [title, sub] = v.label.split(" · ");
                const on = variant.replace(/-p$/, "") === v.id;
                return (
                  <button key={v.id} role="radio" aria-checked={on} className={`variant ${on ? "on" : ""}`} onClick={() => setVariant(v.id + (pointsMode ? "-p" : ""))}>
                    <b>{t(title)}</b><span>{t(sub)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          {hasPoints && (
            <fieldset>
              <legend>{t("Spelsätt")}</legend>
              <div className="variants modes" role="radiogroup" aria-label={t("Spelsätt")}>
                <button role="radio" aria-checked={!pointsMode} className={`variant ${!pointsMode ? "on" : ""}`} onClick={() => setVariant(variant.replace(/-p$/, ""))}>
                  <b>{t("Snabb")}</b><span>{t("En runda, den som gör Zhol vinner")}</span>
                </button>
                <button role="radio" aria-checked={pointsMode} className={`variant ${pointsMode ? "on" : ""}`} onClick={() => setVariant(variant.replace(/-p$/, "") + "-p")}>
                  <b>{t("Till 101")}</b><span>{t("Poäng för lösa kort, sista kvar tar potten")}</span>
                </button>
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend>{t("Spelare")}</legend>
            <div className="seats-pick" role="radiogroup" aria-label={t("Antal spelare")}>
              {mod.seatOptions.map((n) => (
                <button key={n} role="radio" aria-checked={seats === n} className={seats === n ? "on" : ""} onClick={() => setSeats(n)}>
                  <span className="dots" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ "--a": `${(i * 360) / n}deg` } as CSSProperties} />)}</span>
                  <b>{n}</b>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t("Insats per spelare")}</legend>
            <div className="chips" role="radiogroup" aria-label={t("Insats per spelare")}>
              {STAKES.map((n) => (
                <button key={n} role="radio" aria-checked={stake === n} className={`pchip v${n} ${stake === n ? "on" : ""}`} disabled={n > balance} onClick={() => setStake(n)}
                  aria-label={n === 0 ? t("Gratis") : `${chips(n)} Lek`}>
                  <span>{n === 0 ? "0" : n >= 1000 ? `${n / 1000}k` : n}</span>
                </button>
              ))}
            </div>
            <p className="fine">{stake === 0 ? t("Gratis bord.") : `${t("Pott {n} Lek.", { n: chips(stake * seats) })} ${pointsMode ? t("Sista kvar tar allt. Den som köper in sig igen betalar insatsen en gång till.") : t("Vinnaren tar allt.")}`}</p>
          </fieldset>
        </div>
      </section>

      <section className="duo">
        <div className="panel col friends">
          <h2>{t("Spela med vänner")}</h2>
          <p className="muted">{t("Skapa ett privat bord för {n} och dela koden. Tomma platser kan fyllas med botar.", { n: seats })}</p>
          <button className="primary" onClick={() => run(() => api<{ table: Table }>("create_table", { game, variant, seats, stake })).then((r) => r && onOpen(r.table.id))}>
            {t("Skapa privat bord")}
          </button>
        </div>
        <form className="panel col" onSubmit={(e) => { e.preventDefault(); run(() => api<{ table: Table }>("join_table", { code })).then((r) => r && onOpen(r.table.id)); }}>
          <h2>{t("Har du fått en kod?")}</h2>
          <input className="code-input" aria-label={t("Bordskod")} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7P2QX" maxLength={6} />
          <button className="primary" disabled={code.length !== 6}>{t("Gå med i bordet")}</button>
        </form>
      </section>

      <section className="panel leaders">
        <h2>{t("Bästa spelarna i {g}", { g: mod.name })}</h2>
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
                <thead><tr><th>{t("Plats")}</th><th>{t("Spelare")}</th><th>{t("Liga")}</th><th className="num">Elo</th></tr></thead>
                <tbody>{rest.map((p, i) => (
                  <tr key={p.user_id} className={p.user_id === uid ? "mine" : ""}><td>{i + 4}</td><td>{p.profiles.username}</td><td>{t(leagueOf(p.elo))}</td><td className="num">{p.elo}</td></tr>
                ))}</tbody>
              </table>
            )}
          </>
        ) : <p className="muted">{t("Ingen har spelat en rankad match än. Vinn en snabbmatch så hamnar du först här.")}</p>}
      </section>
      <p className="fine center">{t("Lek i Zhol är spelpengar, inte riktiga albanska lek. De har inget värde och kan inte växlas in eller föras över.")}</p>
    </div>
  );
}
