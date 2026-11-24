// Zhol – game engine. Runs both in the Supabase edge function (Deno)
// and in the browser. Pure functions only.
import { GameError, type GameModule } from "./types.ts";

export type Variant = "small" | "big";
export interface Card { id: number; r?: number; s?: number; j?: 1 }
/** "break": points mode only – between two rounds, while scores are shown and players may buy in again. */
export type Phase = "draw" | "discard" | "break" | "over";

/* ---------- Points mode ("till 101") ----------
 * Several rounds. When someone closes, everyone else scores the cards that are not in a group
 * of at least three. Whoever reaches LIMIT is out; the last player left takes the pot.
 * A player who is out may buy in again between rounds and starts on the highest score still in play. */
export const LIMIT = 101;
export const CLOSE_BONUS = -20;       // the player who closes
export const CLOSE_JOKER_BONUS = -40; // ...by throwing a xhol as the last card
export const JOKER_POINTS = 20;
/** Card value when it is left outside a group: 2–10 as written, J/Q/K 10, A 11, xhol 20. */
export const cardPoints = (c: Card) => (c.j ? JOKER_POINTS : c.r === 1 ? 11 : Math.min(10, c.r!));

export interface RoundResult {
  round: number;
  closer: number;            // seat, or -1 if the stock ran out
  delta: number[];           // points this round per seat (0 for players already out)
  groups: Card[][][];        // per seat: the groups that were locked
  loose: Card[][];           // per seat: the cards that counted
  knockedOut: number[];      // seats that reached LIMIT this round
}
export interface PointsState {
  scores: number[];
  out: boolean[];
  quit: boolean[];           // gave up or timed out: may not buy in again
  rebuys: number[];
  round: number;
  starter: number;
  last: RoundResult | null;
}

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
  points?: PointsState;
}

/** One move as everyone at the table may see it (a card drawn from the stock stays hidden). */
export interface LogEntry { n: number; seat: number; kind: "draw" | "discard" | "zhol"; from?: "stock" | "discard"; card?: Card }
const LOG_SIZE = 24;

export type Action =
  | { type: "draw"; from: "stock" | "discard" }
  | { type: "discard"; cardId: number }
  | { type: "zhol" }
  | { type: "next" }   // points mode: start the next round
  | { type: "rebuy" }; // points mode: buy in again after being knocked out

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

export function newGame(variant: Variant, seats: number, starter = 0, rnd?: () => number, points = false): GameState {
  if (seats < 2 || seats > 8) throw new MoveError("2–8 spelare");
  const s: GameState = {
    variant, seats, stock: [], discard: [], hands: [], turn: starter % seats, phase: "draw",
    taken: null, winner: null, winGroups: null, moves: 0, log: [],
  };
  if (points) {
    const z = () => Array.from({ length: seats }, () => 0);
    s.points = { scores: z(), out: z().map(() => false), quit: z().map(() => false), rebuys: z(), round: 1, starter: starter % seats, last: null };
  }
  deal(s, rnd);
  return s;
}

/** Shuffles and deals a new round to every player still in. */
function deal(s: GameState, rnd?: () => number) {
  const inPlay = (i: number) => !s.points?.out[i];
  s.stock = makeDeck(s.variant, rnd, deckCount(s.variant, s.seats));
  s.hands = Array.from({ length: s.seats }, (_, i) => (inPlay(i) ? s.stock.splice(0, HAND_SIZE[s.variant]) : []));
  s.discard = [s.stock.pop()!];
  s.turn = s.points ? s.points.starter : s.turn;
  s.phase = "draw";
  s.taken = null;
  s.winGroups = null;
}

const alive = (s: GameState) => [...Array(s.seats).keys()].filter((i) => !s.points?.out[i]);
/** The next seat after `seat` that is still in the game. */
function nextIn(s: GameState, seat: number): number {
  for (let k = 1; k <= s.seats; k++) {
    const i = (seat + k) % s.seats;
    if (!s.points?.out[i]) return i;
  }
  return seat;
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

/** The best way to lock a hand: as many card points as possible in groups of at least three.
 *  Returns the groups and the loose cards, whose points the player scores. */
export function bestLock(hand: Card[], small: boolean): { groups: Card[][]; loose: Card[]; points: number } {
  const n = hand.length;
  const masks = [...Array(1 << n).keys()]
    .map((m) => ({ m, v: hand.reduce((t, c, i) => ((m >> i) & 1 ? t + cardPoints(c) : t), 0), k: popcount(m) }))
    .filter((x) => x.k >= 3 || x.m === 0)
    .sort((a, b) => b.v - a.v || b.k - a.k);
  for (const { m } of masks) {
    const inside = hand.filter((_, i) => (m >> i) & 1);
    const g = m === 0 ? [] : findGroups(inside, small);
    if (g) {
      const loose = hand.filter((_, i) => !((m >> i) & 1));
      return { groups: g, loose, points: loose.reduce((t, c) => t + cardPoints(c), 0) };
    }
  }
  return { groups: [], loose: hand, points: hand.reduce((t, c) => t + cardPoints(c), 0) };
}
function popcount(m: number) { let k = 0; for (; m; m &= m - 1) k++; return k; }

/** Scores a finished round (closer = -1 when the stock ran out) and decides who is out. */
function scoreRound(s: GameState, closer: number, closedWithJoker: boolean) {
  const P = s.points!;
  const small = s.variant === "small";
  const res: RoundResult = {
    round: P.round, closer,
    delta: P.scores.map(() => 0), groups: P.scores.map(() => []), loose: P.scores.map(() => []), knockedOut: [],
  };
  if (closer >= 0) {
    for (const i of alive(s)) {
      if (i === closer) {
        res.delta[i] = closedWithJoker ? CLOSE_JOKER_BONUS : CLOSE_BONUS;
        res.groups[i] = s.winGroups ?? [];
        continue;
      }
      const b = bestLock(s.hands[i], small);
      res.delta[i] = b.points;
      res.groups[i] = b.groups;
      res.loose[i] = b.loose;
    }
    for (const i of alive(s)) {
      P.scores[i] += res.delta[i];
      if (P.scores[i] >= LIMIT) { P.out[i] = true; res.knockedOut.push(i); }
    }
  }
  P.last = res;
  const left = alive(s);
  if (left.length <= 1) {
    s.phase = "over";
    s.winner = left[0] ?? closer;
  } else {
    s.phase = "break";
    s.turn = nextIn(s, P.starter); // only drives the break timer
  }
}

/** Points mode: a player who gives up or runs out of time is out, and the others play on. */
export function forfeit(prev: GameState, seat: number): GameState | null {
  if (!prev.points) return null;
  const s: GameState = structuredClone(prev);
  const P = s.points!;
  if (P.out[seat]) { P.quit[seat] = true; return s; }
  P.out[seat] = true;
  P.quit[seat] = true;
  P.scores[seat] = Math.max(P.scores[seat], LIMIT);
  s.stock.unshift(...s.hands[seat]); // the cards go back under the stock
  s.hands[seat] = [];
  const left = alive(s);
  if (left.length <= 1) { s.phase = "over"; s.winner = left[0] ?? -1; return s; }
  if (s.phase !== "break" && s.turn === seat) { s.turn = nextIn(s, seat); s.phase = "draw"; s.taken = null; }
  if (s.phase === "break") s.turn = nextIn(s, P.starter);
  s.moves++;
  return s;
}

/* ---------- Moves ---------- */
export class MoveError extends GameError {}

/** Applies a move for `seat`. Returns a new state; throws MoveError if illegal. */
export function applyAction(prev: GameState, seat: number, a: Action, rnd?: () => number): GameState {
  const s: GameState = structuredClone(prev);
  if (s.phase === "over") throw new MoveError("Spelet är slut");
  if (s.phase === "break") return betweenRounds(s, seat, a, rnd);
  if (a.type === "next" || a.type === "rebuy") throw new MoveError("Rundan pågår");
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
      if (!c) {
        if (s.points) { scoreRound(s, -1, false); s.moves++; return s; }
        s.phase = "over"; s.winner = -1; return s;
      }
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
    s.turn = s.points ? nextIn(s, s.turn) : (s.turn + 1) % s.seats;
    s.phase = "draw";
    s.taken = null;
  } else if (a.type === "zhol") {
    if (s.phase !== "discard") throw new MoveError("Ta ett kort först");
    const w = findWin(hand, s.taken, s.variant === "small");
    if (!w) throw new MoveError("Handen går inte ihop än");
    hand.splice(hand.indexOf(w.discard), 1);
    s.discard.push(w.discard);
    s.winGroups = w.groups;
    log({ kind: "zhol", card: w.discard });
    if (s.points) scoreRound(s, seat, !!w.discard.j);
    else { s.phase = "over"; s.winner = seat; }
  } else throw new MoveError("Okänt drag");

  s.moves++;
  return s;
}

function betweenRounds(s: GameState, seat: number, a: Action, rnd?: () => number): GameState {
  const P = s.points!;
  if (a.type === "rebuy") {
    if (!P.out[seat]) throw new MoveError("Du är redan med");
    if (P.quit[seat]) throw new MoveError("Du har lämnat partiet");
    const scores = alive(s).map((i) => P.scores[i]);
    P.out[seat] = false;
    P.scores[seat] = Math.max(...scores); // same score as the highest player still in
    P.rebuys[seat]++;
  } else if (a.type === "next") {
    if (P.out[seat]) throw new MoveError("Du är ute – köp in dig igen eller titta på");
    P.round++;
    P.starter = nextIn(s, P.starter);
    s.log = [];
    deal(s, rnd);
  } else throw new MoveError("Väntar på nästa runda");
  s.moves++;
  return s;
}

/** Most chips a table ever holds: the stakes plus every buy-in. */
export const buyIns = (s: GameState) => (s.points ? s.points.rebuys.reduce((t, n) => t + n, 0) : 0);

/* ---------- What each player may see ---------- */
export interface PublicState {
  variant: Variant; seats: number; turn: number; phase: Phase;
  discardTop: Card | null; discardCount: number; stockCount: number;
  handCounts: number[]; taken: number | null; winner: number | null;
  winGroups: Card[][] | null; moves: number; log: LogEntry[];
  points?: PointsState;
}
export function publicView(s: GameState): PublicState {
  return {
    variant: s.variant, seats: s.seats, turn: s.turn, phase: s.phase,
    discardTop: s.discard[s.discard.length - 1] ?? null, discardCount: s.discard.length,
    stockCount: s.stock.length, handCounts: s.hands.map((h) => h.length),
    taken: s.taken, winner: s.winner, winGroups: s.winGroups, moves: s.moves, log: s.log ?? [],
    ...(s.points ? { points: s.points } : {}),
  };
}

/* ---------- Plugin for the platform ---------- */
export const zhol: GameModule<GameState, Action, PublicState, Card[]> = {
  id: "zhol",
  name: "Zhol",
  variants: [
    { id: "small", label: "Zhol i vogël · 7 kort" },
    { id: "big", label: "Zhol i madh · 10 kort" },
    { id: "small-p", label: "Zhol i vogël · till 101" },
    { id: "big-p", label: "Zhol i madh · till 101" },
  ],
  seatOptions: [2, 4, 6, 8],
  newGame: (variant, seats, starter) => {
    const [base, mode] = variant.split("-");
    if ((base !== "small" && base !== "big") || (mode && mode !== "p")) throw new MoveError("Ogiltig variant");
    return newGame(base, seats, starter, undefined, mode === "p");
  },
  applyAction,
  publicView,
  hands: (s) => s.hands,
  result: (s) => (s.phase === "over" ? { winner: s.winner ?? -1, buyIns: buyIns(s) } : null),
  forfeit,
  intermission: (s) => s.phase === "break",
  turn: (s) => (s.phase === "over" ? null : s.turn),
  autoMove: (s, seat) => {
    if (s.phase === "over") return null;
    if (s.phase === "break") return { type: "next" }; // the break is over: deal the next round
    if (s.turn !== seat) return null;
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
  if (s.phase === "over" || s.phase === "break" || s.turn !== seat) return null; // bots let the humans start the next round
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
