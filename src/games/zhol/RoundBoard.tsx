import { LIMIT, type PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { SeatInfo } from "../types";
import { CardView } from "./Card";

/** Points mode: the scores after a round, shown between rounds. Lets the next round start and
 *  lets a player who is out buy in again. */
export function RoundBoard({ pub, mySeat, seats, timeLeft, busy, onNext, onRebuy, stakeNote }: {
  pub: PublicState; mySeat: number; seats: SeatInfo[]; timeLeft?: number | null; busy: boolean;
  onNext: () => void; onRebuy: () => void; stakeNote?: string;
}) {
  const P = pub.points!;
  const last = P.last;
  const name = (seat: number) => (seat === mySeat ? "Du" : (seats.find((s) => s.seat === seat)?.username ?? "…").replace(" (bot)", ""));
  const rows = [...Array(pub.seats).keys()].sort((a, b) => Number(P.out[a]) - Number(P.out[b]) || P.scores[a] - P.scores[b]);
  const meOut = P.out[mySeat];
  const highest = Math.max(...[...Array(pub.seats).keys()].filter((i) => !P.out[i]).map((i) => P.scores[i]));
  return (
    <div className="roundboard" role="dialog" aria-label={`Ställningen efter runda ${last?.round ?? P.round}`}>
      <h3>Runda {last?.round ?? P.round}</h3>
      <p className="sub">
        {!last || last.closer < 0 ? "Högen tog slut – ingen fick poäng." : `${name(last.closer)} stängde.`} Den som når {LIMIT} åker ut.
      </p>
      <ol className="scores">
        {rows.map((i) => {
          const d = last?.delta[i] ?? 0;
          const knocked = last?.knockedOut.includes(i);
          return (
            <li key={i} className={`${P.out[i] ? "out" : ""} ${i === mySeat ? "me" : ""} ${last?.closer === i ? "closer" : ""}`}>
              <span className="who">{name(i)}{knocked && <em>ute</em>}{P.out[i] && !knocked && <em>ute</em>}{P.rebuys[i] > 0 && <em className="re">köpt in {P.rebuys[i]}×</em>}</span>
              <span className="loose" aria-label={last?.loose[i]?.length ? `${last.loose[i].length} lösa kort` : undefined}>
                {last?.loose[i]?.map((c) => <span key={c.id} className="mini"><CardView c={c} /></span>)}
              </span>
              <span className={`d ${d < 0 ? "neg" : d > 0 ? "pos" : ""}`}>{d > 0 ? `+${d}` : d < 0 ? d : "±0"}</span>
              <b className="tot">{P.scores[i]}</b>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, P.scores[i] / LIMIT)) * 100}%` }} /></span>
            </li>
          );
        })}
      </ol>
      <div className="row">
        {meOut ? (
          !P.quit[mySeat] && (
            <button className="primary" disabled={busy} onClick={onRebuy}>
              Köp in dig igen på {highest} poäng{stakeNote ? ` (${stakeNote})` : ""}
            </button>
          )
        ) : (
          <button className="primary" disabled={busy} onClick={onNext}>Nästa runda</button>
        )}
      </div>
      {timeLeft != null && <p className="fine">Nästa runda delas ut om {timeLeft} s.</p>}
    </div>
  );
}
