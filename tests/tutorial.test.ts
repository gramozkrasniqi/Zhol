import { describe, expect, it } from "vitest";
import { applyAction, findWin } from "../supabase/functions/_shared/games/zhol";
import { lessonGame } from "../src/games/zhol/Tutorial";

describe("övningsrundan", () => {
  it("går att vinna enligt guiden", () => {
    let s = lessonGame();
    s = applyAction(s, 0, { type: "draw", from: "stock" });
    expect(s.hands[0].filter((c) => c.r === 12)).toHaveLength(3);
    const two = s.hands[0].find((c) => c.r === 2)!;
    s = applyAction(s, 0, { type: "discard", cardId: two.id });
    s = applyAction(s, 1, { type: "draw", from: "stock" });
    const eight = s.hands[1].find((c) => c.r === 8 && c.s === 1)!;
    s = applyAction(s, 1, { type: "discard", cardId: eight.id });
    s = applyAction(s, 0, { type: "draw", from: "discard" });
    expect(findWin(s.hands[0], s.taken, true)).toBeTruthy();
    s = applyAction(s, 0, { type: "zhol" });
    expect(s.winner).toBe(0);
  });
});
