// Elo and leagues – shared by every game on the platform.
export const K_FACTOR = 32;
/** Elo change for each seat. Multiplayer: winner beat every other player pairwise. */
export function eloDeltas(ratings: number[], winner: number): number[] {
  const d = ratings.map(() => 0);
  if (winner < 0) return d;
  const k = K_FACTOR / Math.max(1, ratings.length - 1);
  for (let i = 0; i < ratings.length; i++) {
    if (i === winner) continue;
    const exp = 1 / (1 + 10 ** ((ratings[i] - ratings[winner]) / 400));
    const ch = Math.round(k * (1 - exp));
    d[winner] += ch;
    d[i] -= ch;
  }
  return d;
}

export const LEAGUES = [
  { name: "Brons", min: 0 },
  { name: "Silver", min: 1100 },
  { name: "Guld", min: 1300 },
  { name: "Platina", min: 1500 },
  { name: "Diamant", min: 1700 },
] as const;
export function leagueOf(elo: number) {
  return [...LEAGUES].reverse().find((l) => elo >= l.min)!.name;
}
