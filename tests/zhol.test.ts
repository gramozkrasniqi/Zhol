import { describe, expect, it } from "vitest";
import {
  applyAction, findGroups, newGame, publicView, MoveError, type Card,
} from "../supabase/functions/_shared/games/zhol";
import { eloDeltas, forfeitDeltas, leagueOf } from "../supabase/functions/_shared/rating";
import { GAMES } from "../supabase/functions/_shared/games";

let n = 1000;
const C = (r: number, s: number): Card => ({ id: n++, r, s });
const J = (): Card => ({ id: n++, j: 1 });

describe("grupplösare", () => {
  it("set 3 + stege 4 (liten)", () => {
    expect(findGroups([C(5, 0), C(5, 1), C(5, 2), C(9, 3), C(10, 3), C(11, 3), C(12, 3)], true)).not.toBeNull();
  });
  it("xhol fyller luckor, Q-K-A gäller", () => {
    expect(findGroups([C(5, 0), C(5, 1), J(), C(1, 3), C(12, 3), C(13, 3), J()], true)).not.toBeNull();
  });
  it("K-A-2 gäller inte", () => {
    expect(findGroups([C(13, 0), C(1, 0), C(2, 0), C(9, 3), C(10, 3), C(11, 3), C(12, 3)], true)).toBeNull();
  });
  it("samma färg två gånger i ett set gäller (husregel: färgen spelar ingen roll)", () => {
    expect(findGroups([C(5, 0), C(5, 0), C(5, 1), C(9, 3), C(10, 3), C(11, 3), C(12, 3)], true)).not.toBeNull();
  });
  it("bara xhola är ingen grupp", () => {
    expect(findGroups([J(), J(), J()], true)).toBeNull();  });
  it("men xhol får gärna ingå med riktiga kort", () => {
    expect(findGroups([J(), J(), C(5, 0), C(9, 3), C(10, 3), C(11, 3), C(12, 3)], true)).not.toBeNull();
  });
  it("stor: 7+3+4 med lång stege", () => {
    const h = [C(1, 0), C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(6, 0), C(7, 0), C(8, 1), C(8, 2), C(8, 3), C(9, 1), C(10, 1), J(), C(12, 1)];
    expect(findGroups(h, false)).not.toBeNull();
  });
  it("liten tillåter inte stege på 5", () => {
    expect(findGroups([C(1, 0), C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(9, 1), C(9, 2)], true)).toBeNull();
  });
});

describe("drag", () => {
  it("delar ut rätt antal kort", () => {
    const g = newGame("big", 4);
    expect(g.hands.every((h) => h.length === 10)).toBe(true);
    expect(g.stock.length + g.discard.length + 40).toBe(108);
  });
  it("tur, ta, kasta, förbjudet att kasta taget kort", () => {
    let g = newGame("small", 2);
    expect(() => applyAction(g, 1, { type: "draw", from: "stock" })).toThrow(MoveError);
    const top = g.discard[0];
    g = applyAction(g, 0, { type: "draw", from: "discard" });
    expect(() => applyAction(g, 0, { type: "discard", cardId: top.id })).toThrow(MoveError);
    g = applyAction(g, 0, { type: "discard", cardId: g.hands[0][0].id });
    expect(g.turn).toBe(1);
    expect(g.hands[0].length).toBe(7);
  });
  it("falskt zhol avvisas, äkta zhol vinner", () => {
    let g = newGame("small", 2);
    g.hands[0] = [C(5, 0), C(5, 1), C(5, 2), C(9, 3), C(10, 3), C(11, 3), C(2, 1)];
    g.stock.push(C(12, 3));
    expect(() => applyAction(g, 0, { type: "zhol" })).toThrow(MoveError);
    g = applyAction(g, 0, { type: "draw", from: "stock" });
    g = applyAction(g, 0, { type: "zhol" });
    expect(g.winner).toBe(0);
    expect(g.phase).toBe("over");
  });
  it("publik vy läcker inga händer", () => {
    const v = publicView(newGame("small", 2)) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect(v.stock).toBeUndefined();
  });
});

describe("rating", () => {
  it("jämnt möte ger ±16", () => {
    expect(eloDeltas([1200, 1200], 0)).toEqual([16, -16]);
  });
  it("summan är noll i 4-spelare", () => {
    expect(eloDeltas([1200, 1350, 1100, 1500], 2).reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("ligor", () => {
    expect(leagueOf(1200)).toBe("Silver");
    expect(leagueOf(1750)).toBe("Diamant");
  });
});

describe("plattform", () => {
  it("zhol är registrerat och följer kontraktet", () => {
    const g = GAMES.zhol;
    const s = g.newGame("small", 2, 0);
    expect(g.hands(s)).toHaveLength(2);
    expect(g.result(s)).toBeNull();
    expect(() => g.newGame("okänd", 2, 0)).toThrow();
  });
});

describe("tidsgräns och avhopp", () => {
  it("automatiskt drag tar från högen, kastar och lämnar turen", () => {
    const g = GAMES.zhol;
    let s = g.newGame("small", 2, 0);
    const before = s.hands[0].map((c: Card) => c.id).sort();
    for (let i = 0; i < 4 && g.turn(s) === 0; i++) s = g.applyAction(s, 0, g.autoMove(s, 0));
    expect(g.turn(s)).toBe(1);
    expect(s.hands[0].map((c: Card) => c.id).sort()).toEqual(before);
  });
  it("automatiskt drag kastar inte kortet man just tog", () => {
    const g = GAMES.zhol;
    let s = g.newGame("small", 2, 0);
    const top = s.discard[0];
    s = g.applyAction(s, 0, { type: "draw", from: "discard" });
    const a = g.autoMove(s, 0);
    expect(a.cardId).not.toBe(top.id);
    s = g.applyAction(s, 0, a);
    expect(g.turn(s)).toBe(1);
  });
  it("inget automatiskt drag när det inte är ens tur", () => {
    const g = GAMES.zhol;
    expect(g.autoMove(g.newGame("small", 2, 0), 1)).toBeNull();
  });
  it("den som ger upp förlorar mot alla, summan är noll", () => {
    const d = forfeitDeltas([1200, 1200, 1200, 1200], 1);
    expect(d[1]).toBeLessThan(0);
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
    expect(forfeitDeltas([1200, 1200], 0)).toEqual([-16, 16]);
  });
});

describe("större bord och botar", () => {
  it("6 och 8 spelare får en extra kortlek", () => {
    const g = GAMES.zhol;
    for (const [v, n, hand] of [["small", 8, 7], ["big", 8, 10], ["small", 6, 7], ["big", 6, 10]] as const) {
      const s = g.newGame(v, n, 0);
      expect(s.hands).toHaveLength(n);
      expect(s.hands.every((h: Card[]) => h.length === hand)).toBe(true);
      expect(s.stock.length).toBeGreaterThan(5);
    }
  });
  it("botar spelar hela partier till slut utan ogiltiga drag", () => {
    const g = GAMES.zhol;
    for (const [v, n] of [["small", 2], ["small", 8], ["big", 4]] as const) {
      let s = g.newGame(v, n, 0);
      let moves = 0;
      while (!g.result(s) && moves < 4000) {
        const seat = g.turn(s)!;
        s = g.applyAction(s, seat, g.botMove!(s, seat));
        moves++;
      }
      expect(g.result(s)).not.toBeNull();
    }
  });
  it("boten ropar Zhol när handen går ihop", () => {
    const g = GAMES.zhol;
    const s = g.newGame("small", 2, 0);
    s.hands[0] = [C(5, 0), C(5, 1), C(5, 2), C(9, 3), C(10, 3), C(11, 3), C(2, 1), C(12, 3)];
    s.phase = "discard";
    expect(g.botMove!(s, 0)).toEqual({ type: "zhol" });
  });
});

describe("draglogg för animationer", () => {
  it("loggar drag, döljer kort från högen och visar kastade kort", () => {
    let s = newGame("small", 2, 0);
    const top = s.discard[0];
    s = applyAction(s, 0, { type: "draw", from: "discard" });
    s = applyAction(s, 0, { type: "discard", cardId: s.hands[0][0].id });
    s = applyAction(s, 1, { type: "draw", from: "stock" });
    const log = publicView(s).log;
    expect(log.map((e) => [e.n, e.seat, e.kind, e.from])).toEqual([[1, 0, "draw", "discard"], [2, 0, "discard", undefined], [3, 1, "draw", "stock"]]);
    expect(log[0].card?.id).toBe(top.id);
    expect(log[1].card).toBeDefined();
    expect(log[2].card).toBeUndefined();
  });
});

describe("botarnas skicklighet", () => {
  it("expert ropar alltid Zhol, nybörjare missar ibland", () => {
    const s = newGame("small", 2, 0);
    s.hands[0] = [C(5, 0), C(5, 1), C(5, 2), C(9, 3), C(10, 3), C(11, 3), C(2, 1), C(12, 3)];
    s.phase = "discard";
    const expert = Array.from({ length: 200 }, () => GAMES.zhol.botMove!(s, 0, 1).type);
    const beginner = Array.from({ length: 400 }, () => GAMES.zhol.botMove!(s, 0, 0).type);
    expect(expert.every((t) => t === "zhol")).toBe(true);
    expect(beginner.some((t) => t !== "zhol")).toBe(true);
    expect(beginner.filter((t) => t === "zhol").length).toBeGreaterThan(200);
  });
  it("nybörjarbotar spelar ändå bara giltiga drag till slut", () => {
    const g = GAMES.zhol;
    let s = g.newGame("small", 4, 0);
    for (let i = 0; i < 4000 && !g.result(s); i++) {
      const seat = g.turn(s)!;
      s = g.applyAction(s, seat, g.botMove!(s, seat, 0.2));
    }
    expect(g.result(s)).not.toBeNull();
  });
});

/* ---------- Points mode (till 101) ---------- */
import { applyAction as act2, bestLock, cardPoints, forfeit, newGame as ng, zhol as Z, type GameState as GS } from "../supabase/functions/_shared/games/zhol";
const PC = (r: number, s: number, id: number): Card => ({ id, r, s });
describe("poängläge", () => {
  it("kortvärden: 2–10 som skrivet, klädda 10, ess 11, xhol 20", () => {
    expect([2, 7, 10, 11, 12, 13, 1].map((r) => cardPoints(PC(r, 0, r)))).toEqual([2, 7, 10, 10, 10, 10, 11]);
    expect(cardPoints({ id: 99, j: 1 })).toBe(20);
  });
  it("bestLock låser så många poäng som möjligt", () => {
    const hand = [PC(5, 0, 1), PC(6, 0, 2), PC(7, 0, 3), PC(13, 1, 4), PC(13, 2, 5), PC(13, 3, 6), PC(2, 1, 7), PC(9, 2, 8), PC(1, 3, 9), PC(4, 1, 10)];
    const b = bestLock(hand, false);
    expect(b.points).toBe(2 + 9 + 11 + 4);
    expect(b.groups.flat()).toHaveLength(6);
  });
  it("den som stänger får −20, andra får sina lösa kort, 101 åker ut, sista kvar vinner", () => {
    let s: GS = ng("big", 3, 0, undefined, true);
    // Seat 0 holds a closed hand plus one card to throw
    s.hands[0] = [PC(1, 0, 201), PC(2, 0, 202), PC(3, 0, 203), PC(4, 0, 204), PC(5, 0, 205), PC(6, 1, 206), PC(6, 2, 207), PC(6, 3, 208), PC(9, 1, 209), PC(9, 2, 210), PC(9, 3, 211)];
    s.phase = "discard";
    s.points!.scores = [0, 95, 10];
    s.hands[1] = [PC(13, 0, 301), PC(12, 1, 302)];
    s.hands[2] = [PC(2, 1, 401), PC(3, 2, 402)];
    s = act2(s, 0, { type: "zhol" });
    expect(s.phase).toBe("break");
    expect(s.points!.scores).toEqual([-20, 115, 15]);
    expect(s.points!.out).toEqual([false, true, false]);
    expect(s.points!.last!.knockedOut).toEqual([1]);
    // Seat 1 buys in again and gets the highest score still in play
    s = act2(s, 1, { type: "rebuy" });
    expect(s.points!.out[1]).toBe(false);
    expect(s.points!.scores[1]).toBe(15);
    expect(Z.result(s)).toBeNull();
    s = act2(s, 2, { type: "next" });
    expect(s.phase).toBe("draw");
    expect(s.points!.round).toBe(2);
    expect(s.hands.every((h) => h.length === 10)).toBe(true);
    // Two give up: the last one left wins and the buy-in is in the pot
    s = forfeit(s, 0)!;
    s = forfeit(s, 2)!;
    expect(s.phase).toBe("over");
    expect(Z.result(s)).toEqual({ winner: 1, buyIns: 1 });
  });
  it("den som är ute får inte dra kort och kan inte starta nästa runda", () => {
    let s: GS = ng("small", 2, 0, undefined, true);
    s.points!.out[1] = true;
    expect(() => act2(s, 1, { type: "next" })).toThrow();
    s = Z.newGame("small-p", 4, 0);
    expect(s.points).toBeTruthy();
    expect(Z.newGame("big", 2, 0).points).toBeUndefined();
  });
});

describe("triss med två likadana kort", () => {
  it("9♥ 9♥ 9♠ räknas som triss (två kortlekar)", () => {
    const g = findGroups([PC(9, 0, 1), PC(9, 0, 2), PC(9, 1, 3)], false);
    expect(g).not.toBeNull();
    expect(findGroups([PC(6, 0, 4), PC(6, 2, 5), PC(6, 1, 6), PC(6, 0, 7)], false)).not.toBeNull();
  });
  it("handen från skärmdumpen: sexor, ess och nior ger 10 av 10 med ett kort över", () => {
    const hand = [PC(6, 0, 1), PC(6, 2, 2), PC(6, 1, 3), PC(1, 3, 4), PC(1, 1, 5), PC(1, 2, 6), PC(9, 0, 7), PC(9, 0, 8), PC(9, 1, 9), PC(6, 0, 10)];
    expect(findGroups(hand, false)).not.toBeNull();
  });
});
