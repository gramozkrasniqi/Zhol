import type { Card } from "../../../supabase/functions/_shared/games/zhol";

const hi = (r: number) => (r === 1 ? 14 : r);
const bySuit = (a: Card, b: Card) => (a.s! - b.s!) || (hi(a.r!) - hi(b.r!));

/** Suit first, then rank: shows the runs ("ordning"). */
export const sortSuit = (h: Card[]) => [...h].sort((a, b) => (a.j ? 1 : 0) - (b.j ? 1 : 0) || (a.j ? 0 : bySuit(a, b)));
/** Rank first: same numbers side by side. */
export const sortRank = (h: Card[]) =>
  [...h].sort((a, b) => (a.j ? 1 : 0) - (b.j ? 1 : 0) || (a.j ? 0 : hi(a.r!) - hi(b.r!) || a.s! - b.s!));

/** Longest set (same rank, any suits) or run (same suit in sequence) among `cards`. */
function bestMeld(cards: Card[], min: number, maxRun: number): Card[] | null {
  let best: Card[] | null = null;
  const take = (g: Card[]) => { if (g.length >= min && (!best || g.length > best.length)) best = g; };
  // Sets
  const ranks = new Map<number, Card[]>();
  for (const c of cards) ranks.set(c.r!, [...(ranks.get(c.r!) ?? []), c]);
  for (const m of ranks.values()) take(m.slice(0, 4));
  // Runs (ace can be low or high)
  for (let s = 0; s < 4; s++) {
    const at = new Map<number, Card>();
    for (const c of cards) if (c.s === s) { at.set(c.r!, c); if (c.r === 1) at.set(14, c); }
    let run: Card[] = [];
    for (let v = 1; v <= 15; v++) {
      const c = at.get(v);
      if (c && !run.includes(c) && run.length < maxRun) run.push(c);
      else { take(run); run = c ? [c] : []; }
    }
  }
  return best;
}

/** A pair, or two cards of one suit with one card missing between them. */
function bestPartial(cards: Card[]): Card[] | null {
  for (let i = 0; i < cards.length; i++)
    for (let k = i + 1; k < cards.length; k++) {
      const a = cards[i], b = cards[k];
      if (a.r === b.r) return [a, b];
      if (a.s === b.s) {
        const d = Math.min(Math.abs(a.r! - b.r!), Math.abs(hi(a.r!) - hi(b.r!)));
        if (d >= 1 && d <= 2) return [a, b].sort(bySuit);
      }
    }
  return null;
}

export interface HandAnalysis { done: Card[][]; near: Card[][]; loose: Card[] }

/** Groups the hand the way a player would: finished groups first, then near-groups, then the rest. */
export function smartGroups(hand: Card[], small: boolean): Card[][] {
  const { done, near, loose } = analyseHand(hand, small);
  return [...done, ...near, ...(loose.length ? [loose] : [])];
}

/** Finished groups (3+ cards), near-groups (2 cards) and the loose cards of a hand. */
export function analyseHand(hand: Card[], small: boolean): HandAnalysis {
  const jokers = hand.filter((c) => c.j);
  let rest = hand.filter((c) => !c.j);
  const out = (g: Card[]) => { rest = rest.filter((c) => !g.includes(c)); };
  const done: Card[][] = [];
  for (let m = bestMeld(rest, 3, small ? 4 : 14); m; m = bestMeld(rest, 3, small ? 4 : 14)) { done.push(m); out(m); }
  const near: Card[][] = [];
  for (let p = bestPartial(rest); p; p = bestPartial(rest)) { near.push(p); out(p); }
  // Jokers complete a near-group first, otherwise join the first finished group
  for (const j of jokers) {
    const n = near.shift();
    if (n) done.push([...n, j]);
    else if (done.length && (!small || done[0].length < 4)) done[0].push(j);
    else rest.push(j);
  }
  return { done, near, loose: sortSuit(rest) };
}
