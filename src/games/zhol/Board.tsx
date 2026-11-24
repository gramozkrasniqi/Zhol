import { useEffect, useMemo, useState } from "react";
import { findWin, type Action, type Card, type PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { BoardProps } from "../types";
import { Back, CardView } from "./Card";

export function ZholBoard({ pub, hand, mySeat, seats, busy, act, nextRound, ended }: BoardProps<PublicState, Card[], Action>) {
  const [order, setOrder] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);

  // Keep the player's own arrangement; new cards go to the end
  useEffect(() => {
    setOrder((o) => {
      const ids = new Set(hand.map((c) => c.id));
      const kept = o.filter((id) => ids.has(id));
      return [...kept, ...hand.map((c) => c.id).filter((id) => !kept.includes(id))];
    });
    setSel((s) => (s != null && hand.some((c) => c.id === s) ? s : null));
  }, [hand]);
  const sorted = useMemo(() => order.map((id) => hand.find((c) => c.id === id)!).filter(Boolean), [order, hand]);

  const myTurn = !ended && pub.phase !== "over" && pub.turn === mySeat;
  const canWin = myTurn && pub.phase === "discard" && !!findWin(hand, pub.taken, pub.variant === "small");
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.username ?? "…";
  const drawOpen = myTurn && pub.phase === "draw" && !busy;

  function sortBy(k: "s" | "r") {
    const hi = (r: number) => (r === 1 ? 14 : r);
    const key = (c: Card) => (c.j ? 999 : k === "s" ? c.s! * 20 + hi(c.r!) : hi(c.r!) * 4 + c.s!);
    setOrder([...hand].sort((a, b) => key(a) - key(b)).map((c) => c.id));
  }
  function shift(d: number) {
    const i = order.indexOf(sel!), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
  }
  function tap(c: Card) {
    if (sel === c.id && myTurn && pub.phase === "discard" && c.id !== pub.taken) { act({ type: "discard", cardId: c.id }); setSel(null); }
    else setSel(sel === c.id ? null : c.id);
  }

  const status = ended ? "Partiet är slut." : pub.phase === "over"
    ? pub.winner === -1 ? "Högen tog slut – oavgjort." : pub.winner === mySeat ? "Zhol! Du vann." : `${name(pub.winner!)} gjorde Zhol.`
    : myTurn
      ? pub.phase === "draw" ? "Din tur – ta från högen eller kasthögen." : canWin ? "Du har Zhol! Tryck på knappen." : "Välj ett kort att kasta."
      : `${name(pub.turn)} spelar…`;

  return (
    <section className="table">
      <div className="opps">
        {seats.filter((s) => s.seat !== mySeat).map((s) => (
          <div key={s.seat} className={`opp ${pub.turn === s.seat && pub.phase !== "over" ? "on" : ""}`}>
            <b>{s.username}</b><span className="muted">{s.elo}</span>
            <span className="backs">{Array.from({ length: Math.min(pub.handCounts[s.seat] ?? 0, 8) }, (_, i) => <i key={i} />)}</span>
            <span>{pub.handCounts[s.seat]}</span>
          </div>
        ))}
      </div>
      <div className="mid">
        <button className={`pile ${drawOpen ? "go" : ""}`} disabled={!drawOpen} onClick={() => act({ type: "draw", from: "stock" })}>
          <Back label={pub.stockCount} />Högen
        </button>
        <button className={`pile ${drawOpen && pub.discardTop ? "go" : ""}`} disabled={!drawOpen || !pub.discardTop} onClick={() => act({ type: "draw", from: "discard" })}>
          {pub.discardTop ? <CardView c={pub.discardTop} /> : <span className="empty" />}Kastat
        </button>
      </div>
      <div className="status" aria-live="polite">{status}</div>

      {pub.phase === "over" && pub.winGroups && (
        <div className="groups">{pub.winGroups.map((g, i) => <div key={i}>{g.map((c) => <CardView key={c.id} c={c} />)}</div>)}</div>
      )}

      <div className="hand">
        {sorted.map((c) => (
          <CardView key={c.id} c={c} selected={sel === c.id} fresh={myTurn && pub.phase === "discard" && c.id === sorted[sorted.length - 1]?.id} onClick={() => tap(c)} />
        ))}
      </div>
      <div className="acts">
        <button disabled={sel == null} onClick={() => shift(-1)} aria-label="Flytta vänster">←</button>
        <button disabled={sel == null} onClick={() => shift(1)} aria-label="Flytta höger">→</button>
        <button onClick={() => sortBy("s")}>Sortera färg</button>
        <button onClick={() => sortBy("r")}>Sortera valör</button>
        {pub.phase === "over"
          ? <button className="main" onClick={nextRound}>Ny runda</button>
          : <>
              <button className="main" disabled={!myTurn || pub.phase !== "discard" || sel == null || sel === pub.taken || busy}
                onClick={() => { act({ type: "discard", cardId: sel! }); setSel(null); }}>Kasta</button>
              <button className="zhol" disabled={!canWin || busy} onClick={() => act({ type: "zhol" })}>Zhol!</button>
            </>}
      </div>
    </section>
  );
}
