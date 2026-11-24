import { useCallback, useEffect, useRef, useState } from "react";
import { GAMES } from "../supabase/functions/_shared/games";
import { BOARDS } from "./games";
import type { SeatInfo } from "./games/types";
import { api, chips, sb, START_ELO, type Table } from "./lib";

interface GameRow {
  id: string; public: { turn?: number }; turn_deadline: string | null; finished_at: string | null;
  outcome: { type: "forfeit"; seat: number; reason: "timeout" | "resign" } | null;
}
const CLAIM_AFTER_MS = 2000;
const TURN_SECONDS = 45;   // must match the server // a little more than the server's grace, so claims are not rejected

/** Platform shell around any game: waiting room, header, realtime sync, moves. */
export function TableView({ uid, tableId, onLeave }: { uid: string; tableId: string; onLeave: () => void }) {
  const [table, setTable] = useState<Table | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmResign, setConfirmResign] = useState(false);
  const [hand, setHand] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data: t } = await sb.from("tables").select().eq("id", tableId).maybeSingle();
    if (!t) return onLeave();
    setTable(t);
    const { data: p } = await sb.from("table_players").select("user_id, seat, profiles(username)").eq("table_id", tableId).order("seat");
    const players = (p ?? []) as unknown as { user_id: string; seat: number; profiles: { username: string } }[];
    const { data: r } = await sb.from("ratings").select("user_id, elo").eq("game", t.game).in("user_id", players.map((x) => x.user_id));
    const elo = new Map((r ?? []).map((x) => [x.user_id, x.elo as number]));
    setSeats(players.map((x) => ({ user_id: x.user_id, seat: x.seat, username: x.profiles.username, elo: elo.get(x.user_id) ?? START_ELO })));
    if (t.game_id) {
      const [{ data: g }, { data: h }] = await Promise.all([
        sb.from("games").select("id, public, turn_deadline, finished_at, outcome").eq("id", t.game_id).single(),
        sb.from("game_hands").select("cards").eq("game_id", t.game_id).eq("user_id", uid).maybeSingle(),
      ]);
      setGame(g);
      setHand(h?.cards ?? null);
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

  // Clock for the countdown; when the current player's time is up, any client asks the server to move on
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const claiming = useRef(false);
  useEffect(() => {
    if (!game?.turn_deadline || game.finished_at || claiming.current) return;
    if (now < new Date(game.turn_deadline).getTime() + CLAIM_AFTER_MS) return;
    claiming.current = true;
    api("claim_timeout", { gameId: game.id }).catch(() => {}).finally(() => { claiming.current = false; load(); });
  }, [now, game, load]);

  async function resign() {
    if (!game) return;
    setConfirmResign(false);
    try { await api("resign", { gameId: game.id }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  async function act(action: unknown) {
    if (!game || busy) return;
    setBusy(true); setErr("");
    try { await api("move", { gameId: game.id, action }); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function nextRound() {
    setErr("");
    try { await api("next_round", { tableId }); await load(); } catch (e) { setErr((e as Error).message); }
  }
  async function leave() {
    if (table?.status !== "playing") { try { await api("leave_table", { tableId }); } catch { /* already gone */ } }
    onLeave();
  }

  if (!table) return null;
  const mod = GAMES[table.game];
  const variant = mod?.variants.find((v) => v.id === table.variant)?.label ?? table.variant;
  const Board = BOARDS[table.game]?.Board;

  if (table.status === "waiting" || !game) {
    return (
      <section className="panel col center">
        <h2>{mod?.name ?? table.game} · {table.ranked ? "rankad match" : "privat bord"}</h2>
        <p className="muted">{variant}{table.stake > 0 && ` · insats ${chips(table.stake)} marker, pott ${chips(table.stake * table.seats)}`}</p>
        {!table.ranked && <>
          <p>Skicka koden till dina vänner:</p>
          <button className="code" onClick={() => navigator.clipboard?.writeText(table.code).catch(() => {})}>{table.code}</button>
        </>}
        <p>{seats.length} av {table.seats} spelare: {seats.map((s) => s.username).join(", ")}</p>
        <p className="pulse">Väntar på spelare…</p>
        <div className="row">
          <button className="primary" onClick={() => api("fill_bots", { tableId }).then(load).catch((e) => setErr(e.message))}>Fyll lediga platser med botar</button>
          <button className="ghost" onClick={leave}>Lämna bordet</button>
        </div>
        {err && <p className="err">{err}</p>}
      </section>
    );
  }

  const mySeat = seats.find((s) => s.user_id === uid)?.seat ?? -1;
  const nameOf = (seat: number) => (seat === mySeat ? "Du" : seats.find((s) => s.seat === seat)?.username ?? "…");
  const running = !game.finished_at;
  const left = game.turn_deadline ? Math.max(0, Math.ceil((new Date(game.turn_deadline).getTime() - now) / 1000)) : null;
  const forfeit = game.outcome?.type === "forfeit" ? game.outcome : null;

  return (
    <>
      <header className="bar">
        <button className="ghost" onClick={leave}>← Lobby</button>
        <span className="muted">{mod?.name} · {variant} · {table.ranked ? "rankad" : `bord ${table.code}`} · runda {table.round}{table.stake > 0 && ` · pott ${chips(table.stake * table.seats)}`}</span>
        {running && (confirmResign
          ? <span className="row"><button className="primary" onClick={resign}>Ja, ge upp</button><button className="ghost" onClick={() => setConfirmResign(false)}>Avbryt</button></span>
          : <button className="ghost" onClick={() => setConfirmResign(true)}>Ge upp</button>)}
      </header>
      {forfeit && (
        <div className="panel row banner">
          <span>
            {forfeit.reason === "resign" ? `${nameOf(forfeit.seat)} gav upp.` : `${nameOf(forfeit.seat)} missade två turer i rad och förlorar.`}
            {seats.length === 2 && ` ${nameOf(seats.find((s) => s.seat !== forfeit.seat)!.seat)} vinner.`}
          </span>
          <button className="primary" onClick={nextRound}>Ny runda</button>
        </div>
      )}
      {Board ? <Board pub={game.public} hand={hand ?? []} mySeat={mySeat} seats={seats} busy={busy || !running} act={act} nextRound={nextRound} ended={!!forfeit}
          timeLeft={running ? left : null} turnSeconds={TURN_SECONDS} pot={table.stake > 0 ? table.stake * table.seats : undefined} />
        : <p className="panel">Den här appversionen kan inte visa spelet. Ladda om sidan.</p>}
      {err && <p className="err">{err}</p>}
    </>
  );
}
