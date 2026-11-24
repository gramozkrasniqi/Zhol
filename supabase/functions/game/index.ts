// Edge function "game": the only way to change a table or a game, for every game
// on the platform. Each move is validated here by the game's own module, so a
// modified client cannot cheat or see other players' cards.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { GameError, getGame } from "../_shared/games/index.ts";
import { eloDeltas, forfeitDeltas } from "../_shared/rating.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class UserError extends Error {}
const MATCH_WINDOW = 250; // accepted Elo difference in quick match
const START_ELO = 1200;
const TURN_SECONDS = 30;   // time per turn
const GRACE_MS = 1500;     // slack for clock drift before a timeout may be claimed
const MAX_STRIKES = 2;     // missed turns in a row before a player forfeits
const STAKES = [0, 100, 500, 1000]; // allowed buy-ins per player (play chips, no cash value)
const DAILY_CHIPS = 500;
const deadlineFromNow = () => new Date(Date.now() + TURN_SECONDS * 1000).toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json({ error: "Inte inloggad" }, 401);
  const uid = auth.user.id;

  try {
    const b = await req.json();
    switch (b.op) {
      case "set_username": return json(await setUsername(db, uid, String(b.username ?? "")));
      case "create_table": return json(await createTable(db, uid, b.game ?? "zhol", b.variant, b.seats, false, b.stake));
      case "join_table": return json(await joinByCode(db, uid, String(b.code ?? "")));
      case "quick_match": return json(await quickMatch(db, uid, b.game ?? "zhol", b.variant, b.stake));
      case "claim_daily": return json({ balance: ok(await db.rpc("claim_daily", { p_user: uid, p_amount: DAILY_CHIPS })) });
      case "leave_table": return json(await leaveTable(db, uid, b.tableId));
      case "next_round": return json(await nextRound(db, uid, b.tableId));
      case "move": return json(await move(db, uid, b.gameId, b.action));
      case "claim_timeout": return json(await claimTimeout(db, uid, b.gameId));
      case "resign": return json(await resign(db, uid, b.gameId));
      default: throw new UserError("Okänd åtgärd");
    }
  } catch (e) {
    if (e instanceof UserError || e instanceof GameError) return json({ error: e.message }, 400);
    if ((e as { code?: string })?.code === "P0001") return json({ error: (e as Error).message }, 400);
    if ((e as { code?: string })?.code === "40001") return json({ error: "Någon hann före – försök igen" }, 409);
    console.error(e);
    return json({ error: "Serverfel" }, 500);
  }
});

// Untyped DB rows: the schema lives in the migrations, not in generated types (yet)
// deno-lint-ignore no-explicit-any
const ok = (r: { data: unknown; error: unknown }): any => {
  if (r.error) throw r.error;
  return r.data;
};

function moduleFor(game: string) {
  try { return getGame(game); } catch { throw new UserError("Okänt spel"); }
}

async function setUsername(db: SupabaseClient, uid: string, name: string) {
  const u = name.trim();
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(u)) throw new UserError("3–20 tecken: bokstäver, siffror, _ . -");
  const r = await db.from("profiles").update({ username: u }).eq("id", uid).select().single();
  if (r.error?.code === "23505") throw new UserError("Namnet är upptaget");
  return ok(r);
}

function code6() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(6))].map((x) => abc[x % abc.length]).join("");
}

async function eloOf(db: SupabaseClient, uids: string[], game: string): Promise<Map<string, number>> {
  const rows = ok(await db.from("ratings").select("user_id, elo").eq("game", game).in("user_id", uids)) as { user_id: string; elo: number }[];
  const m = new Map(uids.map((u) => [u, START_ELO]));
  for (const r of rows) m.set(r.user_id, r.elo);
  return m;
}

async function balanceOf(db: SupabaseClient, uid: string): Promise<number> {
  const w = ok(await db.from("wallets").select("balance").eq("user_id", uid).maybeSingle());
  return w?.balance ?? 0;
}

function checkStake(stake: unknown): number {
  const n = Number(stake ?? 0);
  if (!STAKES.includes(n)) throw new UserError("Ogiltig insats");
  return n;
}

async function createTable(db: SupabaseClient, uid: string, game: string, variant: unknown, seats: unknown, ranked: boolean, stake: unknown = 0) {
  const st = checkStake(stake);
  if (st > 0 && (await balanceOf(db, uid)) < st) throw new UserError("Du har inte tillräckligt med marker");
  const g = moduleFor(game);
  const v = String(variant ?? g.variants[0].id);
  if (!g.variants.some((x) => x.id === v)) throw new UserError("Ogiltig variant");
  const n = Number(seats ?? g.seatOptions[0]);
  if (!g.seatOptions.includes(n)) throw new UserError(`Antal spelare: ${g.seatOptions.join(" eller ")}`);
  const t = ok(await db.from("tables").insert({ code: code6(), game, variant: v, seats: n, ranked, host: uid, stake: st }).select().single());
  ok(await db.from("table_players").insert({ table_id: t.id, user_id: uid, seat: 0 }));
  return { table: t };
}

async function seatPlayer(db: SupabaseClient, uid: string, table: { id: string; seats: number; status: string; stake: number }) {
  const players = ok(await db.from("table_players").select("user_id, seat").eq("table_id", table.id)) as { user_id: string; seat: number }[];
  if (players.some((p) => p.user_id === uid)) return { table };
  if (table.status !== "waiting") throw new UserError("Bordet har redan börjat");
  const taken = new Set(players.map((p) => p.seat));
  const seat = [...Array(table.seats).keys()].find((s) => !taken.has(s));
  if (seat === undefined) throw new UserError("Bordet är fullt");
  if (table.stake > 0 && (await balanceOf(db, uid)) < table.stake) throw new UserError(`Insatsen är ${table.stake} marker – du har inte tillräckligt`);
  const ins = await db.from("table_players").insert({ table_id: table.id, user_id: uid, seat });
  if (ins.error?.code === "23505") throw new UserError("Platsen togs precis – försök igen");
  ok(ins);
  if (players.length + 1 === table.seats) {
    try { await startGame(db, table.id); } catch (e) {
      // Someone could not pay the stake: give the seat back so the table is not stuck
      ok(await db.from("table_players").delete().eq("table_id", table.id).eq("user_id", uid));
      throw e;
    }
  }
  return { table };
}

async function joinByCode(db: SupabaseClient, uid: string, code: string) {
  const t = ok(await db.from("tables").select().eq("code", code.trim().toUpperCase()).maybeSingle());
  if (!t) throw new UserError("Hittar inget bord med den koden");
  return seatPlayer(db, uid, t);
}

async function quickMatch(db: SupabaseClient, uid: string, game: string, variant: unknown, stake: unknown) {
  const g = moduleFor(game);
  const st = checkStake(stake);
  const v = String(variant ?? g.variants[0].id);
  const seats = g.seatOptions[0];
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const open = ok(await db.from("tables").select()
    .eq("status", "waiting").eq("ranked", true).eq("game", game).eq("variant", v).eq("seats", seats).eq("stake", st)
    .neq("host", uid).gte("created_at", since).order("created_at")) as { id: string; seats: number; status: string; host: string; stake: number }[];
  if (open.length) {
    const elo = await eloOf(db, [uid, ...open.map((t) => t.host)], game);
    const mine = elo.get(uid)!;
    const best = open
      .filter((t) => Math.abs(elo.get(t.host)! - mine) <= MATCH_WINDOW)
      .sort((a, b) => Math.abs(elo.get(a.host)! - mine) - Math.abs(elo.get(b.host)! - mine))[0];
    if (best) {
      try {
        // Close my own waiting ranked table first so I am not matched twice
        ok(await db.from("tables").delete().eq("host", uid).eq("status", "waiting").eq("ranked", true));
        return await seatPlayer(db, uid, best);
      } catch (e) { if (!(e instanceof UserError)) throw e; }
    }
  }
  const mine = ok(await db.from("tables").select().eq("host", uid).eq("status", "waiting").eq("ranked", true)
    .eq("game", game).eq("variant", v).eq("stake", st).maybeSingle());
  if (mine) return { table: mine, waiting: true };
  ok(await db.from("tables").delete().eq("host", uid).eq("status", "waiting").eq("ranked", true));
  return { ...(await createTable(db, uid, game, v, seats, true, st)), waiting: true };
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
  const g = moduleFor(t.game);
  const players = ok(await db.from("table_players").select("user_id, seat").eq("table_id", tableId).order("seat")) as { user_id: string; seat: number }[];
  const state = g.newGame(t.variant, t.seats, t.round % t.seats);
  const hands = g.hands(state);
  const gameId = crypto.randomUUID();
  // Take everyone's stake first (all or nothing); a failure means nothing has been created yet
  try {
    ok(await db.rpc("charge_stakes", { p_game: gameId, p_users: players.map((p) => p.user_id), p_stake: t.stake }));
  } catch (e) {
    if ((e as { code?: string })?.code === "P0001") throw new UserError(`Någon vid bordet har inte ${t.stake} marker`);
    throw e;
  }
  const row = ok(await db.from("games").insert({
    id: gameId, table_id: tableId, public: g.publicView(state), rated: t.ranked, turn_deadline: deadlineFromNow(),
  }).select().single());
  ok(await db.from("game_secrets").insert({ game_id: row.id, state }));
  ok(await db.from("game_hands").insert(players.map((p) => ({ game_id: row.id, user_id: p.user_id, seat: p.seat, cards: hands[p.seat] }))));
  ok(await db.from("tables").update({ status: "playing", game_id: row.id, round: t.round + 1 }).eq("id", tableId));
  return row;
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
  if (claimed.length) {
    try { await startGame(db, tableId); } catch (e) {
      ok(await db.from("tables").update({ status: "finished" }).eq("id", tableId));
      throw e;
    }
  }
  return { table: t };
}

type Outcome = { winner: number } | { forfeit: number; reason: "timeout" | "resign" };

// deno-lint-ignore no-explicit-any
async function loadGame(db: SupabaseClient, uid: string, gameId: string): Promise<any> {
  const hand = ok(await db.from("game_hands").select("seat").eq("game_id", gameId).eq("user_id", uid).maybeSingle());
  if (!hand) throw new UserError("Du är inte med i det här spelet");
  const row = ok(await db.from("games")
    .select("version, table_id, rated, finished_at, turn_deadline, strikes, tables(game, seats, stake)").eq("id", gameId).single());
  const sec = ok(await db.from("game_secrets").select("state").eq("game_id", gameId).single());
  return { seat: hand.seat, row, g: moduleFor(row.tables.game), state: sec.state };
}

// deno-lint-ignore no-explicit-any
async function persist(db: SupabaseClient, gameId: string, ctx: any, next: unknown, strikes: Record<string, number>, outcome: Outcome | null) {
  const { row, g, state } = ctx;
  const res = outcome ?? g.result(next);
  const over = !!res;
  const turnChanged = g.turn(next) !== g.turn(state);
  const deadline = over ? null : turnChanged || !row.turn_deadline ? deadlineFromNow() : row.turn_deadline;
  ok(await db.rpc("save_game", {
    p_game: gameId, p_version: row.version, p_public: g.publicView(next), p_state: next,
    p_hands: g.hands(next).map((cards: unknown, seat: number) => ({ seat, cards })),
    p_deadline: deadline, p_strikes: strikes,
    p_outcome: outcome && "forfeit" in outcome ? { type: "forfeit", seat: outcome.forfeit, reason: outcome.reason } : null,
    p_over: over,
  }));
  if (res) {
    ok(await db.from("tables").update({ status: "finished" }).eq("id", row.table_id));
    await settle(db, gameId, row.table_id, row.tables.game, row.rated, res, row.tables.stake ?? 0);
  }
}

async function move(db: SupabaseClient, uid: string, gameId: string, action: unknown) {
  const ctx = await loadGame(db, uid, gameId);
  if (ctx.row.finished_at) throw new UserError("Partiet är slut");
  const next = ctx.g.applyAction(ctx.state, ctx.seat, action);
  await persist(db, gameId, ctx, next, { ...ctx.row.strikes, [ctx.seat]: 0 }, null);
  return { ok: true };
}

/** Any player at the table may call this once the current player's time is up. */
async function claimTimeout(db: SupabaseClient, uid: string, gameId: string) {
  const ctx = await loadGame(db, uid, gameId);
  const { row, g } = ctx;
  if (row.finished_at) return { ok: true };
  if (!row.turn_deadline || Date.now() < new Date(row.turn_deadline).getTime() + GRACE_MS) throw new UserError("Tiden är inte slut än");
  const seat = g.turn(ctx.state);
  if (seat === null) return { ok: true };
  const strikes = { ...row.strikes, [seat]: (row.strikes?.[seat] ?? 0) + 1 };
  if (strikes[seat] >= MAX_STRIKES) {
    await persist(db, gameId, ctx, ctx.state, strikes, { forfeit: seat, reason: "timeout" });
    return { forfeit: seat };
  }
  let next = ctx.state;
  for (let i = 0; i < 6 && g.turn(next) === seat; i++) {
    const a = g.autoMove(next, seat);
    if (!a) break;
    next = g.applyAction(next, seat, a);
  }
  await persist(db, gameId, ctx, next, strikes, null);
  return { auto: seat };
}

async function resign(db: SupabaseClient, uid: string, gameId: string) {
  const ctx = await loadGame(db, uid, gameId);
  if (ctx.row.finished_at) return { ok: true };
  await persist(db, gameId, ctx, ctx.state, ctx.row.strikes, { forfeit: ctx.seat, reason: "resign" });
  return { ok: true };
}

async function settle(db: SupabaseClient, gameId: string, tableId: string, game: string, rated: boolean, res: Outcome, stake: number) {
  const players = ok(await db.from("table_players").select("user_id, seat").eq("table_id", tableId).order("seat")) as { user_id: string; seat: number }[];
  const uids = players.map((p) => p.user_id);
  const rows = ok(await db.from("ratings").select().eq("game", game).in("user_id", uids)) as { user_id: string; elo: number; games: number; wins: number }[];
  const cur = new Map(rows.map((r) => [r.user_id, r]));
  const before = players.map((p) => cur.get(p.user_id)?.elo ?? START_ELO);
  // Two players: a forfeit is simply a win for the other one
  let winner = "winner" in res ? res.winner : players.length === 2 ? players.find((p) => p.seat !== res.forfeit)!.seat : -1;
  const idx = (seat: number) => players.findIndex((p) => p.seat === seat);
  let deltas = players.map(() => 0);
  if (rated) {
    if (winner >= 0) deltas = eloDeltas(before, idx(winner));
    else if ("forfeit" in res) deltas = forfeitDeltas(before, idx(res.forfeit));
  }
  if (winner >= 0 && idx(winner) < 0) winner = -1;
  const upserts = players.map((p, i) => ({
    user_id: p.user_id, game, elo: before[i] + deltas[i],
    games: (cur.get(p.user_id)?.games ?? 0) + 1,
    wins: (cur.get(p.user_id)?.wins ?? 0) + (p.seat === winner ? 1 : 0),
    updated_at: new Date().toISOString(),
  }));
  ok(await db.from("ratings").upsert(upserts));

  // Chips: the winner takes the pot; a draw refunds; a multi-player forfeit splits the pot among the rest
  if (stake > 0) {
    const pot = stake * players.length;
    const pay = async (user: string, amount: number, reason: "payout" | "refund") => {
      if (amount <= 0) return;
      const r = await db.rpc("chip_move", { p_user: user, p_delta: amount, p_reason: reason, p_ref: gameId });
      if (r.error && r.error.code !== "23505") throw r.error; // 23505 = already paid
    };
    if (winner >= 0) await pay(players[idx(winner)].user_id, pot, "payout");
    else if ("forfeit" in res) {
      const rest = players.filter((p) => p.seat !== res.forfeit);
      const share = Math.floor(pot / rest.length);
      for (const [i, p] of rest.entries()) await pay(p.user_id, share + (i === 0 ? pot - share * rest.length : 0), "payout");
    } else for (const p of players) await pay(p.user_id, stake, "refund");
  }
  if (rated) {
    ok(await db.from("elo_history").insert(players.map((p, i) => ({
      user_id: p.user_id, game_id: gameId, game, elo_before: before[i], elo_after: before[i] + deltas[i],
    }))));
  }
}
