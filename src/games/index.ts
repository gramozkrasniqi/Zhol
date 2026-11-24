import type { GameUI } from "./types";
import { ZholBoard } from "./zhol/Board";

// One entry per game. The rules live in supabase/functions/_shared/games/.
export const BOARDS: Record<string, GameUI> = {
  zhol: { id: "zhol", Board: ZholBoard },
};
