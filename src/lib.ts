import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configured = Boolean(url && key);
export const sb = createClient(url || "http://localhost", key || "missing");

export interface Profile { id: string; username: string }
export interface Rating { user_id: string; game: string; elo: number; games: number; wins: number }
export const START_ELO = 1200;
export interface Table {
  id: string; code: string; game: string; variant: string; seats: number; ranked: boolean;
  status: "waiting" | "playing" | "finished"; host: string; game_id: string | null; round: number;
}

/** Calls the edge function. Throws Error with a Swedish message on failure. */
export async function api<T = Record<string, unknown>>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.functions.invoke("game", { body: { op, ...args } });
  if (error) {
    let msg = "Något gick fel";
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}
