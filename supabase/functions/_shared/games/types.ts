// The contract every game on the platform implements.
// Add a game: write a module like zhol.ts, register it in games/index.ts,
// and add its board component under src/games/<id>/.

export interface GameModule<S = unknown, A = unknown, P = unknown, H = unknown> {
  id: string;                                   // stored in tables.game
  name: string;
  variants: { id: string; label: string }[];
  seatOptions: number[];                        // allowed player counts
  newGame(variant: string, seats: number, starter: number): S;
  /** Must throw MoveError-like errors (with a user-facing message) on illegal moves. */
  applyAction(state: S, seat: number, action: A): S;
  publicView(state: S): P;                      // safe for every player to see
  hands(state: S): H[];                         // private part per seat
  /** null while running; winner = seat index, or -1 for a draw */
  result(state: S): { winner: number } | null;
  /** Whose turn it is, or null when the game is over. Drives the turn timer. */
  turn(state: S): number | null;
  /** One move the server plays for `seat` when its turn timer runs out (repeated until the turn passes). */
  autoMove(state: S, seat: number): A | null;
}

/** Throw this (or a subclass) for an illegal move; its message is shown to the player. */
export class GameError extends Error {}
