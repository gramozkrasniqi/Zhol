// Edge function "game": the only way to change a table or a game.
// Every move is validated here with the shared engine, so a modified client cannot cheat.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  applyAction, eloDeltas, MoveError, newGame, publicView,
  type Action, type GameState, type Variant,
} from "../_shared/engine.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class UserError extends Error {}
const MATCH_WINDOW = 250; // Elo difference accepted in quick match

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: "Inte inloggad" }, 401);
  const uid = auth.user.id;

  try {
    const body = await req.json();
    switch (body.op) {
      case "set_username": return json(await setUsername(db, uid, String(body.username ?? "")));
      case "create_table": return json(await createTable(db, uid, body.variant, body.seats, false));
      case "join_table": return json(await joinByCode(db, uid, String(body.code ?? "")));
      case "quick_match": return json(await quickMatch(db, uid, body.variant));
      case "leave_table": return json(await leaveTable(db, uid, body.tableId));
      case "next_round": return json(await nextRound(db, uid, body.tableId));
      case "move": return json(await move(db, uid, body.gameId, body.action));
      default: throw new UserError("Okänd åtgärd");
    }
  } catch (e) {
    if (e instanceof UserError || e instanceof MoveError) return json({ error: e.message }, 400);
    if ((e as { code?: string })?.code === "40001") return json({ error: "Någon hann före – försök igen" }, 409);
    console.error(e);
    return json({ error: "Serverfel" }, 500);
  }
});

// Untyped DB rows: the schema lives in the migration, not in generated types (yet)
// deno-lint-ignore no-explicit-any
const ok = (r: { data: unknown; error: unknown }): any => {
  if (r.error) throw r.error;
  return r.data;
};
const checkVariant = (v: unknown): Variant => {
  if (v !== "small" && v !== "big") throw new UserError("Ogiltig variant");
  return v;
};

async function setUsername(db: SupabaseClient, uid: string, name: string) {
  const u = name.trim();
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(u)) throw new UserError("3–20 tecken: bokstäver, siffror, _ . -");
  const r = await db.from("profiles").update({ username: u }).eq("id", uid).select().single();
  if (r.error?.code === "23505") throw new UserError("Namnet är upptaget");
  return ok(r);
}

function code6() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => abc[x % abc.length]).join("");
}

async function createTable(db: SupabaseClient, uid: string, variant: unknown, seats: unknown, ranked: boolean) {
  const v = checkVariant(variant);
  const n = Number(seats);
  if (n !== 2 && n !== 4) throw new UserError("2 eller 4 spelare");
  const t = ok(await db.from("tables").insert({ code: code6(), variant: v, seats: n, ranked, host: uid }).select().single());
  ok(await db.from("table_players").insert({ table_id: t.id, user_id: uid, seat: 0 }));
  return { table: t };
}

async function seatPlayer(db: SupabaseClient, uid: string, table: { id: string; seats: number; status: string }) {
  const players = ok(await db.from("table_players").select("user_id, seat").eq("table_id", table.id)) as { user_id: string; seat: number }[];
  if (players.some((p) => p.user_id === uid)) return { table };
  if (table.status !== "waiting") throw new UserError("Bordet har redan börjat");
  const taken = new Set(players.map((p) => p.seat));
  const seat = [...Array(table.seats).keys()].find((s) => !taken.has(s));
  if (seat === undefined) throw new UserError("Bordet är fullt");
  const ins = await db.from("table_players").insert({ table_id: table.id, user_id: uid, seat });
  if (ins.error?.code === "23505") throw new UserError("Platsen togs precis – försök igen");
  ok(ins);
  if (players.length + 1 === table.seats) await startGame(db, table.id);
  return { table };
}

async function joinByCode(db: SupabaseClient, uid: string, code: string) {
  const t = ok(await db.from("tables").select().eq("code", code.trim().toUpperCase()).maybeSingle());
  if (!t) throw new UserError("Hittar inget bord med den koden");
  return seatPlayer(db, uid, t);
}

async function quickMatch(db: SupabaseClient, uid: string, variant: unknown) {
  const v = checkVariant(variant);
  const me = ok(await db.from("profiles").select("elo").eq("id", uid).single());
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const open = ok(await db.from("tables")
    .select("id, seats, status, host, created_at, profiles!tables_host_fkey(elo)")
    .eq("status", "waiting").eq("ranked", true).eq("variant", v).eq("seats", 2)
    .neq("host", uid).gte("created_at", since).order("created_at")) as
    { id: string; seats: number; status: string; profiles: { elo: number } }[];
  const best = open
    .filter((t) => Math.abs(t.profiles.elo - me.elo) <= MATCH_WINDOW)
    .sort((a, b) => Math.abs(a.profiles.elo - me.elo) - Math.abs(b.profiles.elo - me.elo))[0];
  if (best) {
    try {
      // Close my own waiting ranked table first so I am not matched twice
      ok(await db.from("tables").delete().eq("host", uid).eq("status", "waiting").eq("ranked", true));
      return await seatPlayer(db, uid, best);
    } catch (e) { if (!(e instanceof UserError)) throw e; }
  }
  // Nobody suitable waiting: reuse my own open ranked table, or open one
  const mine = ok(await db.from("tables").select().eq("host", uid).eq("status", "waiting").eq("ranked", true).eq("variant", v).maybeSingle());
  if (mine) return { table: mine, waiting: true };
  return { ...(await createTable(db, uid, v, 2, true)), waiting: true };
}

async function leaveTable(db: SupabaseClient, uid: string, tableId: string) {
  const t = ok(await db.from("tables").select().eq("id", tableId).single());
  if (t.status === "playing") throw new UserError("Spelet pågår – spela klart först");
  ok(await db.from("table_players").delete().eq("table_id", tableId).eq("user_id", uid));
  const left = ok(await db.from("table_players").select("user_id").eq("table_id", tableId)) as unknown[];
  if (!left.length) ok(await db.from("tables").delete().eq("id", tableId));
  return { left: true };
}

async function startGame(db: SupabaseClient, tableId: string) {
  const t = ok(await db.from("tables").select().eq("id", tableId).single());
  const players = ok(await db.from("table_players").select("user_id, seat").eq("table_id", tableId).order("seat")) as { user_id: string; seat: number }[];
  const state = newGame(t.variant, t.seats, t.round % t.seats);
  const g = ok(await db.from("games").insert({ table_id: tableId, public: publicView(state), rated: t.ranked }).select().single());
  ok(await db.from("game_secrets").insert({ game_id: g.id, state }));
  ok(await db.from("game_hands").insert(players.map((p) => ({ game_id: g.id, user_id: p.user_id, seat: p.seat, cards: state.hands[p.seat] }))));
  ok(await db.from("tables").update({ status: "playing", game_id: g.id, round: t.round + 1 }).eq("id", tableId));
  return g;
}

async function nextRound(db: SupabaseClient, uid: string, tableId: string) {
  const t = ok(await db.from("tables").select().eq("id", tableId).single());
  const member = ok(await db.from("table_players").select("seat").eq("table_id", tableId).eq("user_id", uid).maybeSingle());
  if (!member) throw new UserError("Du sitter inte vid bordet");
  if (t.status !== "finished") return { table: t };
  const players = ok(await db.from("table_players").select("user_id").eq("table_id", tableId)) as unknown[];
  if (players.length < t.seats) throw new UserError("Någon har lämnat bordet");
  // Claim the restart so two clicks do not start two games
  const claimed = ok(await db.from("tables").update({ status: "waiting" }).eq("id", tableId).eq("status", "finished").select()) as unknown[];
  if (claimed.length) await startGame(db, tableId);
  return { table: t };
}

async function move(db: SupabaseClient, uid: string, gameId: string, action: Action) {
  const hand = ok(await db.from("game_hands").select("seat").eq("game_id", gameId).eq("user_id", uid).maybeSingle());
  if (!hand) throw new UserError("Du är inte med i det här spelet");
  const g = ok(await db.from("games").select("version, table_id, rated").eq("id", gameId).single());
  const sec = ok(await db.from("game_secrets").select("state").eq("game_id", gameId).single());
  const next: GameState = applyAction(sec.state as GameState, hand.seat, action);

  ok(await db.rpc("save_game", {
    p_game: gameId, p_version: g.version, p_public: publicView(next), p_state: next,
    p_hands: next.hands.map((cards, seat) => ({ seat, cards })),
  }));

  if (next.phase === "over") {
    ok(await db.from("tables").update({ status: "finished" }).eq("id", g.table_id));
    await settle(db, gameId, g.table_id, g.rated, next.winner ?? -1);
  }
  return { ok: true };
}

async function settle(db: SupabaseClient, gameId: string, tableId: string, rated: boolean, winner: number) {
  const players = ok(await db.from("table_players").select("user_id, seat, profiles(elo, games, wins)").eq("table_id", tableId).order("seat")) as
    { user_id: string; seat: number; profiles: { elo: number; games: number; wins: number } }[];
  const deltas = rated ? eloDeltas(players.map((p) => p.profiles.elo), winner) : players.map(() => 0);
  for (const [i, p] of players.entries()) {
    const after = p.profiles.elo + deltas[i];
    ok(await db.from("profiles").update({
      elo: after, games: p.profiles.games + 1, wins: p.profiles.wins + (p.seat === winner ? 1 : 0),
    }).eq("id", p.user_id));
    if (rated) ok(await db.from("elo_history").insert({ user_id: p.user_id, game_id: gameId, elo_before: p.profiles.elo, elo_after: after }));
  }
}
