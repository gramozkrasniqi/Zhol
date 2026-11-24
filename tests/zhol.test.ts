import { describe, expect, it } from "vitest";
import {
  applyAction, findGroups, newGame, publicView, MoveError, type Card,
} from "../supabase/functions/_shared/games/zhol";
import { eloDeltas, leagueOf } from "../supabase/functions/_shared/rating";
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
