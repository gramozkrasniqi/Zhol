import { t } from "../../i18n";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { SeatInfo } from "../types";
import { CardView } from "./Card";
import { cardSound } from "./sound";

const CONFETTI = ["#e6b55c", "#fbf3e4", "#d21c3a", "#f6d58e", "#8f1233"];

/** End of a round: the winning hand is laid out group by group, the pot goes to the winner. */
export function Finale({ pub, mySeat, seats, pot, ranked, eloBefore, onNext, onLeave }: {
  pub: PublicState; mySeat: number; seats: SeatInfo[]; pot?: number; ranked: boolean; eloBefore?: number;
  onNext: () => void; onLeave?: () => void;
}) {
  // Wait for the last card to land before the show starts
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setShown(true), 1000); return () => window.clearTimeout(t); }, []);
  const winner = pub.winner ?? -1;
  const iWon = winner === mySeat;
  const name = (seat: number) => (seats.find((s) => s.seat === seat)?.username ?? "…").replace(" (bot)", "");
  const myElo = seats.find((s) => s.seat === mySeat)?.elo;
  const delta = ranked && eloBefore != null && myElo != null ? myElo - eloBefore : null;
  useEffect(() => { if (shown && winner >= 0) cardSound("snap"); }, [shown, winner]);

  const total = pub.seats;
  const offset = (winner - mySeat + total) % total;
  const angle = Math.PI / 2 + (offset * 2 * Math.PI) / total;
  const toWinner = { "--c": Math.cos(angle).toFixed(3), "--s": Math.sin(angle).toFixed(3) } as CSSProperties;
  const confetti = useMemo(() => Array.from({ length: iWon ? 46 : 0 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, delay: `${(i % 12) * 0.09}s`, color: CONFETTI[i % CONFETTI.length],
    dur: `${1.8 + ((i * 13) % 10) / 10}s`, rot: `${(i * 47) % 360}deg`,
  })), [iWon]);
  if (!shown) return null;

  let k = 0; // running card index, so the cards are dealt one after another
  return (
    <div className="finale" role="dialog" aria-label={t("Rundan är slut")}>
      {confetti.map((c, i) => (
        <i key={i} className="confetti" style={{ left: c.left, background: c.color, animationDelay: c.delay, animationDuration: c.dur, rotate: c.rot }} />
      ))}
      {pot && winner >= 0 ? Array.from({ length: 8 }, (_, i) => (
        <i key={i} className="paychip" style={{ ...toWinner, animationDelay: `${0.9 + i * 0.07}s` }} />
      )) : null}
      <div className="finale-card">
        <h3>{winner < 0 ? t("Oavgjort") : pub.points ? (iWon ? t("Du är sist kvar – du vann!") : t("{name} är sist kvar och vinner", { name: name(winner) })) : iWon ? t("Zhol! Du vann") : t("{name} gjorde Zhol", { name: name(winner) })}</h3>
        {winner < 0 && <p className="muted">{t("Högen tog slut innan någon fick ihop handen.")}</p>}
        {pub.winGroups && (!pub.points || pub.points.last?.closer === winner) && (
          <div className="win-groups">
            {pub.winGroups.map((g, gi) => (
              <div key={gi} className="wg">
                {g.map((c) => <span key={c.id} className="deal" style={{ animationDelay: `${0.15 + k++ * 0.09}s` }}><CardView c={c} /></span>)}
              </div>
            ))}
          </div>
        )}
        <p className="gains">
          {pot && winner >= 0 && <span className="gold">{iWon ? `+${pot.toLocaleString("sv-SE")} Lek` : t("{name} tar {n} Lek", { name: name(winner), n: pot.toLocaleString("sv-SE") })}</span>}
          {delta != null && delta !== 0 && <span className={delta > 0 ? "up" : "down"}>{delta > 0 ? `+${delta}` : delta} Elo</span>}
        </p>
        <div className="row">
          <button className="primary" onClick={onNext}>{t("Ny runda")}</button>
          {onLeave && <button className="ghost" onClick={onLeave}>{t("Till lobbyn")}</button>}
        </div>
      </div>
    </div>
  );
}
