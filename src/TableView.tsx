import { useCallback, useEffect, useMemo, useState } from "react";
import { findWin, type Action, type Card, type PublicState } from "../supabase/functions/_shared/engine";
import { Back, CardView } from "./Card";
import { api, sb, type Table } from "./lib";

interface Seat { user_id: string; seat: number; profiles: { username: string; elo: number } }

export function TableView({ uid, tableId, onLeave }: { uid: string; tableId: string; onLeave: () => void }) {
  const [table, setTable] = useState<Table | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [game, setGame] = useState<{ id: string; public: PublicState } | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data: t } = await sb.from("tables").select().eq("id", tableId).maybeSingle();
    if (!t) return onLeave();
    setTable(t);
    const { data: p } = await sb.from("table_players").select("user_id, seat, profiles(username, elo)").eq("table_id", tableId).order("seat");
    setSeats((p ?? []) as unknown as Seat[]);
    if (t.game_id) {
      const [{ data: g }, { data: h }] = await Promise.all([
        sb.from("games").select("id, public").eq("id", t.game_id).single(),
        sb.from("game_hands").select("cards").eq("game_id", t.game_id).eq("user_id", uid).maybeSingle(),
      ]);
      setGame(g);
      setHand((h?.cards as Card[]) ?? []);
    }
  }, [tableId, uid, onLeave]);

  useEffect(() => {
    load();
    const ch = sb.channel(`table-${tableId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `id=eq.${tableId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_players", filter: `table_id=eq.${tableId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `table_id=eq.${tableId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_hands", filter: `user_id=eq.${uid}` }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [tableId, uid, load]);

  // Keep the player's own arrangement; new cards go to the end
  useEffect(() => {
    setOrder((o) => {
      const ids = new Set(hand.map((c) => c.id));
      const kept = o.filter((id) => ids.has(id));
      return [...kept, ...hand.map((c) => c.id).filter((id) => !kept.includes(id))];
    });
  }, [hand]);
  const sorted = useMemo(() => order.map((id) => hand.find((c) => c.id === id)!).filter(Boolean), [order, hand]);

  const mySeat = seats.find((s) => s.user_id === uid)?.seat ?? -1;
  const pub = game?.public;
  const myTurn = !!pub && pub.phase !== "over" && pub.turn === mySeat;
  const canWin = myTurn && pub!.phase === "discard" && !!findWin(hand, pub!.taken, pub!.variant === "small");
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.profiles.username ?? "…";

  async function act(a: Action) {
    if (!game || busy) return;
    setBusy(true); setErr("");
    try { await api("move", { gameId: game.id, action: a }); setSel(null); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  function sortBy(k: "s" | "r") {
    const hi = (r: number) => (r === 1 ? 14 : r);
    const key = (c: Card) => (c.j ? 999 : k === "s" ? c.s! * 20 + hi(c.r!) : hi(c.r!) * 4 + c.s!);
    setOrder([...hand].sort((a, b) => key(a) - key(b)).map((c) => c.id));
  }
  function shift(d: number) {
    const i = order.indexOf(sel!), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
  }
  async function leave() {
    if (table?.status !== "playing") { try { await api("leave_table", { tableId }); } catch { /* already gone */ } }
    onLeave();
  }

  if (!table) return null;

  if (table.status === "waiting" || !pub) {
    return (
      <section className="panel col center">
        <h2>{table.ranked ? "Rankad match" : "Privat bord"} · {table.variant === "small" ? "Zhol i vogël" : "Zhol i madh"}</h2>
        {!table.ranked && <>
          <p className="muted">Skicka koden till dina vänner:</p>
          <button className="code" onClick={() => navigator.clipboard?.writeText(table.code).catch(() => {})}>{table.code}</button>
        </>}
        <p>{seats.length} av {table.seats} spelare: {seats.map((s) => s.profiles.username).join(", ")}</p>
        <p className="pulse">Väntar på spelare…</p>
        <button className="ghost" onClick={leave}>Lämna bordet</button>
      </section>
    );
  }

  const others = seats.filter((s) => s.seat !== mySeat);
  const status = pub.phase === "over"
    ? pub.winner === -1 ? "Högen tog slut – oavgjort." : pub.winner === mySeat ? "Zhol! Du vann." : `${name(pub.winner!)} gjorde Zhol.`
    : myTurn
      ? pub.phase === "draw" ? "Din tur – ta från högen eller kasthögen." : canWin ? "Du har Zhol! Tryck på knappen." : "Välj ett kort att kasta."
      : `${name(pub.turn)} spelar…`;

  return (
    <>
      <header className="bar">
        <button className="ghost" onClick={leave}>← Lobby</button>
        <span className="muted">{table.ranked ? "Rankad" : `Bord ${table.code}`} · runda {table.round}</span>
      </header>
      <section className="table">
        <div className="opps">
          {others.map((s) => (
            <div key={s.seat} className={`opp ${pub.turn === s.seat && pub.phase !== "over" ? "on" : ""}`}>
              <b>{s.profiles.username}</b><span className="muted">{s.profiles.elo}</span>
              <span className="backs">{Array.from({ length: Math.min(pub.handCounts[s.seat], 8) }, (_, i) => <i key={i} />)}</span>
              <span>{pub.handCounts[s.seat]}</span>
            </div>
          ))}
        </div>
        <div className="mid">
          <button className={`pile ${myTurn && pub.phase === "draw" ? "go" : ""}`} disabled={!myTurn || pub.phase !== "draw" || busy} onClick={() => act({ type: "draw", from: "stock" })}>
            <Back label={pub.stockCount} />Högen
          </button>
          <button className={`pile ${myTurn && pub.phase === "draw" && pub.discardTop ? "go" : ""}`} disabled={!myTurn || pub.phase !== "draw" || !pub.discardTop || busy} onClick={() => act({ type: "draw", from: "discard" })}>
            {pub.discardTop ? <CardView c={pub.discardTop} /> : <span className="empty" />}Kastat
          </button>
        </div>
        <div className="status" aria-live="polite">{status}</div>

        {pub.phase === "over" && pub.winGroups && (
          <div className="groups">{pub.winGroups.map((g, i) => <div key={i}>{g.map((c) => <CardView key={c.id} c={c} />)}</div>)}</div>
        )}

        <div className="hand">
          {sorted.map((c) => (
            <CardView key={c.id} c={c} selected={sel === c.id} fresh={myTurn && pub.phase === "discard" && c.id === sorted[sorted.length - 1]?.id}
              onClick={() => (sel === c.id && myTurn && pub.phase === "discard" && c.id !== pub.taken ? act({ type: "discard", cardId: c.id }) : setSel(sel === c.id ? null : c.id))} />
          ))}
        </div>
        <div className="acts">
          <button disabled={sel == null} onClick={() => shift(-1)} aria-label="Flytta vänster">←</button>
          <button disabled={sel == null} onClick={() => shift(1)} aria-label="Flytta höger">→</button>
          <button onClick={() => sortBy("s")}>Sortera färg</button>
          <button onClick={() => sortBy("r")}>Sortera valör</button>
          {pub.phase === "over"
            ? <button className="main" onClick={() => api("next_round", { tableId }).then(load).catch((e) => setErr(e.message))}>Ny runda</button>
            : <>
                <button className="main" disabled={!myTurn || pub.phase !== "discard" || sel == null || sel === pub.taken || busy} onClick={() => act({ type: "discard", cardId: sel! })}>Kasta</button>
                <button className="zhol" disabled={!canWin || busy} onClick={() => act({ type: "zhol" })}>Zhol!</button>
              </>}
        </div>
        {err && <p className="err light">{err}</p>}
      </section>
    </>
  );
}
