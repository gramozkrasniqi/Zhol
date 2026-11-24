import { tServer } from "./i18n";
import { createClient } from "@supabase/supabase-js";

// The publishable key is meant to be public; access is enforced by RLS and the edge function.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || "https://cbyljdubmeizwzinqtrd.supabase.co";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "sb_publishable_kpNg3bBBtp2-n_mW1odRlA_ZwA-T38P";
export const configured = Boolean(url && key);
export const sb = createClient(url || "http://localhost", key || "missing");

export interface Profile { id: string; username: string; avatar?: string | null; drink?: "kafe" | "caj" | null }
export interface Rating { user_id: string; game: string; elo: number; games: number; wins: number }
export const START_ELO = 1200;
export const STAKES = [0, 100, 500, 1000];
export const DAILY_CHIPS = 500;
export interface Wallet { user_id: string; balance: number; last_daily: string | null }
/** Today's date in Sweden as YYYY-MM-DD, the same day boundary the server uses for daily chips. */
export const swedishToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
export const chips = (n: number) => n.toLocaleString("sv-SE");
export interface Table {
  id: string; code: string; game: string; variant: string; seats: number; ranked: boolean; stake: number;
  status: "waiting" | "playing" | "finished"; host: string; game_id: string | null; round: number;
}

/** Calls the edge function. Throws Error with a Swedish message on failure. */
export async function api<T = Record<string, unknown>>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.functions.invoke("game", { body: { op, ...args } });
  if (error) {
    let msg = "Något gick fel"; // translated below
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* ignore */ }
    throw new Error(tServer(msg));
  }
  return data as T;
}
