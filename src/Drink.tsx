import type { Drink } from "./games/types";

export const DRINKS: { id: Drink; label: string }[] = [
  { id: "kafe", label: "Kafe turke" },
  { id: "caj", label: "Çaj" },
];

/** A player's drink; players who never chose (and bots) get one that stays the same for them. */
export function drinkOf(drink: Drink | null | undefined, userId: string): Drink {
  if (drink) return drink;
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h & 1 ? "caj" : "kafe";
}

/** Small drawn drinks for the table: a Turkish coffee cup (filxhan) or a tulip glass of tea. */
export function DrinkIcon({ kind, size = 44, steam = false }: { kind: Drink; size?: number; steam?: boolean }) {
  return kind === "caj" ? <Caj size={size} steam={steam} /> : <Kafe size={size} steam={steam} />;
}

function Steam() {
  return (
    <g className="steam" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round">
      <path d="M26 20c-4-5 4-8 0-14" /><path d="M36 22c-4-5 4-8 0-14" />
    </g>
  );
}

function Kafe({ size, steam }: { size: number; steam: boolean }) {
  return (
    <svg className="drink-svg" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <ellipse cx="32" cy="52" rx="25" ry="8" fill="#000" opacity=".28" />
      {/* saucer */}
      <ellipse cx="32" cy="48" rx="24" ry="8" fill="#e9e1d4" />
      <ellipse cx="32" cy="47" rx="18" ry="5.5" fill="#f8f4ec" />
      <path d="M8 48a24 8 0 0 0 48 0" fill="none" stroke="#b8862c" strokeWidth="1.4" />
      {/* cup */}
      <path d="M17 30h30l-3 14a12 4 0 0 1-24 0z" fill="#fbf8f2" />
      <path d="M18.5 37h27" stroke="#c8102e" strokeWidth="2.2" />
      <path d="M19.4 40.5h25.2" stroke="#b8862c" strokeWidth="1" />
      <path d="M47 33c6 0 6 7 0 7" fill="none" stroke="#efe8dc" strokeWidth="3" />
      <ellipse cx="32" cy="30" rx="15" ry="4.2" fill="#f2ebdf" />
      <ellipse cx="32" cy="30.3" rx="13" ry="3.3" fill="#3a2114" />
      <ellipse cx="30" cy="29.8" rx="7" ry="1.6" fill="#7a4e2c" opacity=".75" />
      {steam && <Steam />}
    </svg>
  );
}

function Caj({ size, steam }: { size: number; steam: boolean }) {
  return (
    <svg className="drink-svg" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <ellipse cx="32" cy="54" rx="22" ry="7" fill="#000" opacity=".28" />
      {/* saucer with a red rim */}
      <ellipse cx="32" cy="51" rx="21" ry="7" fill="#c8102e" />
      <ellipse cx="32" cy="50" rx="17" ry="5" fill="#f6efe2" />
      <rect x="43" y="45" width="6" height="5" rx="1" fill="#fff" stroke="#e5dccd" strokeWidth=".6" />
      {/* tulip glass */}
      <path d="M22 18c0 8 6 10 6 16s-6 8-6 13a10 3.4 0 0 0 20 0c0-5-6-7-6-13s6-8 6-16z" fill="#ffffff2e" stroke="#ffffffb0" strokeWidth="1.2" />
      <path d="M23.4 24c1 5 5.6 6.6 5.6 10.6S23.2 42 23.2 47a8.8 3 0 0 0 17.6 0c0-5-5.8-8.4-5.8-12.4S39.6 29 40.6 24z" fill="#b5321b" />
      <ellipse cx="32" cy="24" rx="8.6" ry="2.3" fill="#d9572e" />
      <path d="M26 27c1.2 3 3.4 4.4 3.4 7" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="32" cy="18" rx="10" ry="2.6" fill="none" stroke="#ffffffc0" strokeWidth="1.2" />
      {steam && <g transform="translate(0 -4)"><Steam /></g>}
    </svg>
  );
}
