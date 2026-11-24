import type { GameModule } from "./types.ts";
import { zhol } from "./zhol.ts";

// Register new games here.
// deno-lint-ignore no-explicit-any
export const GAMES: Record<string, GameModule<any, any, any, any>> = {
  zhol,
};

export function getGame(id: string) {
  const g = GAMES[id];
  if (!g) throw new Error(`Okänt spel: ${id}`);
  return g;
}
export { GameError, type GameModule } from "./types.ts";
