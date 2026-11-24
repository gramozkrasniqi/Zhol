import { describe, expect, it } from "vitest";
import { smartGroups, sortRank, sortSuit } from "../src/games/zhol/sortHand";

const c = (id: number, r: number, s: number) => ({ id, r, s });
describe("sortering av handen", () => {
  it("grupper: färdig serie och färdigt set först, sedan resten", () => {
    const hand = [c(1, 9, 0), c(2, 5, 1), c(3, 7, 0), c(4, 5, 2), c(5, 8, 0), c(6, 5, 3), c(7, 13, 2), c(8, 2, 1)];
    const g = smartGroups(hand, false);
    const firstTwo = g.slice(0, 2).map((x) => x.map((y) => y.id).sort().join());
    expect(firstTwo.sort()).toEqual(["1,3,5", "2,4,6"]);
    expect(g.flat()).toHaveLength(8);
  });
  it("xhol fyller ett nästan färdigt par", () => {
    const g = smartGroups([c(1, 4, 0), c(2, 4, 1), { id: 3, j: 1 as const }, c(4, 11, 2)], true);
    expect(g[0].map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("nummer och färg", () => {
    const hand = [c(1, 1, 3), c(2, 2, 0), c(3, 1, 0), { id: 4, j: 1 as const }];
    expect(sortRank(hand).map((x) => x.id)).toEqual([2, 3, 1, 4]);
    expect(sortSuit(hand).map((x) => x.id)).toEqual([2, 3, 1, 4]);
  });
});
