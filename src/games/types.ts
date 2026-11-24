import type { ComponentType } from "react";

export interface SeatInfo { user_id: string; seat: number; username: string; elo: number }

/** What the platform hands every game board. */
export interface BoardProps<P = unknown, H = unknown, A = unknown> {
  pub: P;                 // public state (games.public)
  hand: H;                // this player's private part (game_hands.cards)
  mySeat: number;
  seats: SeatInfo[];
  busy: boolean;
  act: (action: A) => void;
  nextRound: () => void;
}

export interface GameUI {
  id: string;
  Board: ComponentType<BoardProps<any, any, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
