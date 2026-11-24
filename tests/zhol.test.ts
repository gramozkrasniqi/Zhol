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
  it("samma färg två gånger i ett set gäller inte", () => {
    expect(findGroups([C(5, 0), C(5, 0), C(5, 1), C(9, 3), C(10, 3), C(11, 3), C(12, 3)], true)).toBeNull();
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
    expect(g.hands.every((h) => h.length === 14)).toBe(true);
    expect(g.stock.length + g.discard.length + 56).toBe(108);
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
    for (const [v, n, hand] of [["small", 8, 7], ["big", 8, 14], ["small", 6, 7], ["big", 6, 14]] as const) {
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
