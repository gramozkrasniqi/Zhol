import { useCallback, useEffect, useState } from "react";
import { GAMES } from "../supabase/functions/_shared/games";
import { BOARDS } from "./games";
import type { SeatInfo } from "./games/types";
import { api, sb, START_ELO, type Table } from "./lib";

/** Platform shell around any game: waiting room, header, realtime sync, moves. */
export function TableView({ uid, tableId, onLeave }: { uid: string; tableId: string; onLeave: () => void }) {
  const [table, setTable] = useState<Table | null>(null);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [game, setGame] = useState<{ id: string; public: unknown } | null>(null);
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
        sb.from("games").select("id, public").eq("id", t.game_id).single(),
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
        <p className="muted">{variant}</p>
        {!table.ranked && <>
          <p>Skicka koden till dina vänner:</p>
          <button className="code" onClick={() => navigator.clipboard?.writeText(table.code).catch(() => {})}>{table.code}</button>
        </>}
        <p>{seats.length} av {table.seats} spelare: {seats.map((s) => s.username).join(", ")}</p>
        <p className="pulse">Väntar på spelare…</p>
        <button className="ghost" onClick={leave}>Lämna bordet</button>
      </section>
    );
  }

  const mySeat = seats.find((s) => s.user_id === uid)?.seat ?? -1;
  return (
    <>
      <header className="bar">
        <button className="ghost" onClick={leave}>← Lobby</button>
        <span className="muted">{mod?.name} · {variant} · {table.ranked ? "rankad" : `bord ${table.code}`} · runda {table.round}</span>
      </header>
      {Board ? <Board pub={game.public} hand={hand ?? []} mySeat={mySeat} seats={seats} busy={busy} act={act} nextRound={nextRound} />
        : <p className="panel">Den här appversionen kan inte visa spelet. Ladda om sidan.</p>}
      {err && <p className="err">{err}</p>}
    </>
  );
}
