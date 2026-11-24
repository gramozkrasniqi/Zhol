import type { ComponentType } from "react";

export interface SeatInfo { user_id: string; seat: number; username: string; elo: number; avatar?: string | null; botSkill?: number | null }

/** What the platform hands every game board. */
export interface BoardProps<P = unknown, H = unknown, A = unknown> {
  pub: P;                 // public state (games.public)
  hand: H;                // this player's private part (game_hands.cards)
  mySeat: number;
  seats: SeatInfo[];
  busy: boolean;
  act: (action: A) => void;
  nextRound: () => void;
  /** True when the platform ended the game (someone gave up or timed out); the board just shows it. */
  ended?: boolean;
  /** Seconds left for the player whose turn it is, and the full turn length. */
  timeLeft?: number | null;
  turnSeconds?: number;
  /** Lek in the pot, if the table has a stake. */
  pot?: number;
  /** Latest chat line per seat, shown as a speech bubble for a few seconds. */
  bubbles?: Record<number, string>;
}

export interface GameUI {
  id: string;
  Board: ComponentType<BoardProps<any, any, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
