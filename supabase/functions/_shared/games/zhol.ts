// Zhol – game engine. Runs both in the Supabase edge function (Deno)
// and in the browser. Pure functions only.
import { GameError, type GameModule } from "./types.ts";

export type Variant = "small" | "big";
export interface Card { id: number; r?: number; s?: number; j?: 1 }
export type Phase = "draw" | "discard" | "over";

export interface GameState {
  variant: Variant;
  seats: number;
  stock: Card[];
  discard: Card[];
  hands: Card[][];
  turn: number;
  phase: Phase;
  taken: number | null; // id of card just taken from the discard pile
  winner: number | null; // seat index, or -1 for a draw
  winGroups: Card[][] | null;
  moves: number;
  log?: LogEntry[];
}

/** One move as everyone at the table may see it (a card drawn from the stock stays hidden). */
export interface LogEntry { n: number; seat: number; kind: "draw" | "discard" | "zhol"; from?: "stock" | "discard"; card?: Card }
const LOG_SIZE = 24;

export type Action =
  | { type: "draw"; from: "stock" | "discard" }
  | { type: "discard"; cardId: number }
  | { type: "zhol" };

export const HAND_SIZE: Record<Variant, number> = { small: 7, big: 10 };

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Decks in play: 1 (vogël) or 2 (madh), plus one more at tables with more than 4 players. */
export const deckCount = (variant: Variant, seats: number) => (variant === "big" ? 2 : 1) + (seats > 4 ? 1 : 0);

export function makeDeck(variant: Variant, rnd?: () => number, decks = deckCount(variant, 2)): Card[] {
  const d: Card[] = [];
  let id = 0;
  for (let k = 0; k < decks; k++) {
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ id: id++, r, s });
    d.push({ id: id++, j: 1 }, { id: id++, j: 1 });
  }
  return shuffle(d, rnd);
}

export function newGame(variant: Variant, seats: number, starter = 0, rnd?: () => number): GameState {
  if (seats < 2 || seats > 8) throw new MoveError("2–8 spelare");
  const stock = makeDeck(variant, rnd, deckCount(variant, seats));
  const hands = Array.from({ length: seats }, () => stock.splice(0, HAND_SIZE[variant]));
  const discard = [stock.pop()!];
  return {
    variant, seats, stock, discard, hands, turn: starter % seats, phase: "draw",
    taken: null, winner: null, winGroups: null, moves: 0, log: [],
  };
}

/* ---------- Group solver ---------- */
// Splits cards into valid groups: sets (3–4 same rank, different suits) or
// runs (3+ same suit in sequence, ace low or high, no wrap). Jokers stand in
// for any card; every group needs at least one real card.
// small = Zhol i vogël: groups of 3–4 only (7 cards ⇒ exactly 3+4).
export function findGroups(cards: Card[], small: boolean): Card[][] | null {
  return solve(cards.filter((c) => !c.j), cards.filter((c) => c.j), small);
}

function solve(real: Card[], J: Card[], small: boolean): Card[][] | null {
  if (!real.length) return J.length ? null : [];
  const c = real[0], rest = real.slice(1), maxRun = small ? 4 : 14;

  // Sets containing c
  const bySuit = new Map<number, Card>();
  for (const x of rest) if (x.r === c.r && x.s !== c.s && !bySuit.has(x.s!)) bySuit.set(x.s!, x);
  const opts = [...bySuit.values()];
  for (let m = 0; m < 1 << opts.length; m++) {
    const pick = opts.filter((_, i) => (m >> i) & 1), n = 1 + pick.length;
    if (n > 4) continue;
    for (let u = 0; u <= J.length && n + u <= 4; u++) {
      if (n + u < 3) continue;
      const ids = new Set(pick.map((p) => p.id));
      const r = solve(rest.filter((x) => !ids.has(x.id)), J.slice(u), small);
      if (r) return [[c, ...pick, ...J.slice(0, u)], ...r];
    }
  }

  // Runs containing c
  const vals = c.r === 1 ? [1, 14] : [c.r!];
  for (const v of vals)
    for (let st = Math.max(1, v - maxRun + 1); st <= v; st++)
      for (let len = 3; len <= maxRun; len++) {
        const en = st + len - 1;
        if (en > 14 || en < v) continue;
        const res = fill(st, en, v, c, rest, J, [], small);
        if (res) return res;
      }
  return null;
}

function fill(p: number, en: number, v: number, c: Card, pool: Card[], J: Card[], grp: Card[], small: boolean): Card[][] | null {
  if (p > en) {
    const r = solve(pool, J, small);
    return r ? [grp, ...r] : null;
  }
  if (p === v) return fill(p + 1, en, v, c, pool, J, [...grp, c], small);
  const rk = p === 14 ? 1 : p;
  const k = pool.findIndex((x) => x.s === c.s && x.r === rk);
  if (k >= 0) {
    const r = fill(p + 1, en, v, c, pool.filter((_, i) => i !== k), J, [...grp, pool[k]], small);
    if (r) return r;
  }
  if (J.length) {
    const r = fill(p + 1, en, v, c, pool, J.slice(1), [...grp, J[0]], small);
    if (r) return r;
  }
  return null;
}

/** With a hand of HAND_SIZE+1 cards: which discard (if any) completes the hand? */
export function findWin(hand: Card[], taken: number | null, small: boolean): { discard: Card; groups: Card[][] } | null {
  for (let i = hand.length - 1; i >= 0; i--) {
    if (hand[i].id === taken) continue;
    const g = findGroups(hand.filter((_, k) => k !== i), small);
    if (g) return { discard: hand[i], groups: g };
  }
  return null;
}

/* ---------- Moves ---------- */
export class MoveError extends GameError {}

/** Applies a move for `seat`. Returns a new state; throws MoveError if illegal. */
export function applyAction(prev: GameState, seat: number, a: Action, rnd?: () => number): GameState {
  const s: GameState = structuredClone(prev);
  if (s.phase === "over") throw new MoveError("Spelet är slut");
  if (s.turn !== seat) throw new MoveError("Inte din tur");
  const hand = s.hands[seat];
  const log = (e: Omit<LogEntry, "n" | "seat">) => {
    s.log = [...(s.log ?? []), { n: s.moves + 1, seat, ...e }].slice(-LOG_SIZE);
  };

  if (a.type === "draw") {
    if (s.phase !== "draw") throw new MoveError("Du har redan tagit ett kort");
    let c: Card | undefined;
    if (a.from === "discard") {
      c = s.discard.pop();
      if (!c) throw new MoveError("Kasthögen är tom");
      s.taken = c.id;
    } else {
      if (!s.stock.length) {
        const top = s.discard.pop();
        s.stock = shuffle(s.discard, rnd);
        s.discard = top ? [top] : [];
      }
      c = s.stock.pop();
      if (!c) { s.phase = "over"; s.winner = -1; return s; }
      s.taken = null;
    }
    hand.push(c);
    s.phase = "discard";
    log({ kind: "draw", from: a.from, card: a.from === "discard" ? c : undefined });
  } else if (a.type === "discard") {
    if (s.phase !== "discard") throw new MoveError("Ta ett kort först");
    if (a.cardId === s.taken) throw new MoveError("Kortet du just tog får inte kastas direkt");
    const i = hand.findIndex((c) => c.id === a.cardId);
    if (i < 0) throw new MoveError("Kortet finns inte i din hand");
    const thrown = hand.splice(i, 1)[0];
    s.discard.push(thrown);
    log({ kind: "discard", card: thrown });
    s.turn = (s.turn + 1) % s.seats;
    s.phase = "draw";
    s.taken = null;
  } else if (a.type === "zhol") {
    if (s.phase !== "discard") throw new MoveError("Ta ett kort först");
    const w = findWin(hand, s.taken, s.variant === "small");
    if (!w) throw new MoveError("Handen går inte ihop än");
    hand.splice(hand.indexOf(w.discard), 1);
    s.discard.push(w.discard);
    s.phase = "over";
    s.winner = seat;
    s.winGroups = w.groups;
    log({ kind: "zhol", card: w.discard });
  } else throw new MoveError("Okänt drag");

  s.moves++;
  return s;
}

/* ---------- What each player may see ---------- */
export interface PublicState {
  variant: Variant; seats: number; turn: number; phase: Phase;
  discardTop: Card | null; discardCount: number; stockCount: number;
  handCounts: number[]; taken: number | null; winner: number | null;
  winGroups: Card[][] | null; moves: number; log: LogEntry[];
}
export function publicView(s: GameState): PublicState {
  return {
    variant: s.variant, seats: s.seats, turn: s.turn, phase: s.phase,
    discardTop: s.discard[s.discard.length - 1] ?? null, discardCount: s.discard.length,
    stockCount: s.stock.length, handCounts: s.hands.map((h) => h.length),
    taken: s.taken, winner: s.winner, winGroups: s.winGroups, moves: s.moves, log: s.log ?? [],
  };
}

/* ---------- Plugin for the platform ---------- */
export const zhol: GameModule<GameState, Action, PublicState, Card[]> = {
  id: "zhol",
  name: "Zhol",
  variants: [
    { id: "small", label: "Zhol i vogël · 7 kort" },
    { id: "big", label: "Zhol i madh · 10 kort" },
  ],
  seatOptions: [2, 4, 6, 8],
  newGame: (variant, seats, starter) => {
    if (variant !== "small" && variant !== "big") throw new MoveError("Ogiltig variant");
    return newGame(variant, seats, starter);
  },
  applyAction,
  publicView,
  hands: (s) => s.hands,
  result: (s) => (s.phase === "over" ? { winner: s.winner ?? -1 } : null),
  turn: (s) => (s.phase === "over" ? null : s.turn),
  autoMove: (s, seat) => {
    if (s.phase === "over" || s.turn !== seat) return null;
    // Timed out: take from the stock, then throw back the newest card that may be thrown
    if (s.phase === "draw") return { type: "draw", from: "stock" };
    const pick = [...s.hands[seat]].reverse().find((c) => c.id !== s.taken)!;
    return { type: "discard", cardId: pick.id };
  },
  botMove,
};

/* ---------- Computer player ---------- */
const hi = (r: number) => (r === 1 ? 14 : r);
/** How much a card helps the rest of the hand: pairs, neighbours in suit, jokers. */
function usefulness(c: Card, hand: Card[]): number {
  if (c.j) return 99;
  let u = 0;
  for (const o of hand) {
    if (o === c || o.j) continue;
    if (o.r === c.r && o.s !== c.s) u += 3;
    if (o.s === c.s && o.r !== c.r) {
      const d = Math.min(Math.abs(o.r! - c.r!), Math.abs(hi(o.r!) - hi(c.r!)));
      if (d === 1) u += 3;
      else if (d === 2) u += 1.5;
    }
  }
  return u;
}

/** skill 0–1: an expert (1) always plays the best move it sees; a beginner (0) often misses things. */
export function botMove(s: GameState, seat: number, skill = 1, rnd: () => number = Math.random): Action | null {
  if (s.phase === "over" || s.turn !== seat) return null;
  const hand = s.hands[seat];
  const small = s.variant === "small";
  const slip = (p: number) => rnd() < p * (1 - Math.max(0, Math.min(1, skill)));
  if (s.phase === "draw") {
    const top = s.discard[s.discard.length - 1];
    // Take the open card if it completes the hand or clearly fits – unless the bot overlooks it
    const good = top && (top.j || findWin([...hand, top], top.id, small) || usefulness(top, [...hand, top]) >= 3);
    if (good && !slip(0.6)) return { type: "draw", from: "discard" };
    return { type: "draw", from: "stock" };
  }
  if (findWin(hand, s.taken, small) && !slip(0.35)) return { type: "zhol" };
  const options = hand.filter((c) => c.id !== s.taken);
  // A careless bot sometimes throws a random card (never a joker)
  if (slip(0.5)) {
    const plain = options.filter((c) => !c.j);
    if (plain.length) return { type: "discard", cardId: plain[Math.floor(rnd() * plain.length)].id };
  }
  let worst: Card | null = null, low = Infinity;
  for (const c of options) {
    const u = usefulness(c, hand);
    if (u < low) { low = u; worst = c; }
  }
  return { type: "discard", cardId: worst!.id };
}
