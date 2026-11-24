import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { findWin, type Action, type Card, type PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { BoardProps } from "../types";
import { Back, CardView } from "./Card";

/** Where a seat sits around the oval, in % of the table. The player is always at the bottom. */
function seatPosition(offset: number, total: number): CSSProperties {
  const angle = Math.PI / 2 + (offset * 2 * Math.PI) / total; // 90° = bottom, clockwise
  // The radius lives in CSS (--rx/--ry) so it can shrink on narrow screens
  return { "--c": Math.cos(angle).toFixed(3), "--s": Math.sin(angle).toFixed(3) } as CSSProperties;
}

export function ZholBoard({ pub, hand, mySeat, seats, busy, act, nextRound, ended, timeLeft, turnSeconds = 45, pot }: BoardProps<PublicState, Card[], Action>) {
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

  const over = ended || pub.phase === "over";
  const myTurn = !over && pub.turn === mySeat;
  const canWin = myTurn && pub.phase === "discard" && !!findWin(hand, pub.taken, pub.variant === "small");
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.username ?? "…";
  const drawOpen = myTurn && pub.phase === "draw" && !busy;
  const newest = myTurn && pub.phase === "discard" ? sorted[sorted.length - 1]?.id : undefined;

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

  const status = ended ? "Partiet är slut."
    : pub.phase === "over"
      ? pub.winner === -1 ? "Högen tog slut – oavgjort." : pub.winner === mySeat ? "Zhol! Du vann." : `${name(pub.winner!)} gjorde Zhol.`
      : myTurn
        ? pub.phase === "draw" ? "Din tur – ta ett kort" : canWin ? "Du har Zhol!" : "Välj ett kort att kasta"
        : `${name(pub.turn)} spelar…`;

  const total = pub.seats;
  const ring = (seat: number): CSSProperties | undefined =>
    !over && pub.turn === seat && timeLeft != null
      ? ({ "--p": `${Math.max(0, Math.min(1, timeLeft / turnSeconds)) * 360}deg` } as CSSProperties)
      : undefined;

  return (
    <section className="room" data-seats={total}>
      <div className="poker">
        <div className="rail"><div className="felt">
          <div className="center">
            {pub.phase === "over" && pub.winGroups ? (
              <div className="groups">{pub.winGroups.map((g, i) => <div key={i}>{g.map((c) => <CardView key={c.id} c={c} />)}</div>)}</div>
            ) : (
              <div className="piles">
                <button className={`pile ${drawOpen ? "go" : ""}`} disabled={!drawOpen} onClick={() => act({ type: "draw", from: "stock" })} aria-label={`Högen, ${pub.stockCount} kort`}>
                  <Back label={pub.stockCount} /><span>Högen</span>
                </button>
                <button className={`pile ${drawOpen && pub.discardTop ? "go" : ""}`} disabled={!drawOpen || !pub.discardTop} onClick={() => act({ type: "draw", from: "discard" })} aria-label="Kasthögen">
                  {pub.discardTop ? <CardView c={pub.discardTop} /> : <span className="empty" />}<span>Kastat</span>
                </button>
              </div>
            )}
            <div className={`status ${myTurn ? "mine" : ""}`} aria-live="polite">{status}</div>
            {pot ? <div className="pot"><i aria-hidden="true" />{pot.toLocaleString("sv-SE")}</div> : null}
          </div>
        </div></div>

        {seats.map((s) => {
          const offset = (s.seat - mySeat + total) % total;
          const active = !over && pub.turn === s.seat;
          const won = pub.phase === "over" && pub.winner === s.seat;
          const isBot = s.username.endsWith("(bot)");
          const label = isBot ? s.username.replace(" (bot)", "") : s.username;
          return (
            <div key={s.seat} className={`seat ${offset === 0 ? "me" : ""} ${active ? "active" : ""} ${won ? "won" : ""}`} style={seatPosition(offset, total)}>
              <div className="avatar" style={ring(s.seat)}>
                <span>{label.slice(0, 1).toUpperCase()}</span>
                {active && timeLeft != null && <b className="secs">{timeLeft}</b>}
              </div>
              <div className="plate">
                <span className="nm">{offset === 0 ? "Du" : label}{isBot && <em>BOT</em>}</span>
                <span className="meta">{s.elo} · {pub.handCounts[s.seat] ?? 0} kort</span>
              </div>
              {offset !== 0 && <span className="minicards" aria-hidden="true">{Array.from({ length: Math.min(pub.handCounts[s.seat] ?? 0, 5) }, (_, i) => <i key={i} />)}</span>}
            </div>
          );
        })}
      </div>

      <div className="hand" style={{ "--n": sorted.length } as CSSProperties}>
        {sorted.map((c) => (
          <CardView key={c.id} c={c} selected={sel === c.id} fresh={c.id === newest} onClick={() => tap(c)} />
        ))}
      </div>
      <div className="acts">
        <button disabled={sel == null} onClick={() => shift(-1)} aria-label="Flytta vänster">←</button>
        <button disabled={sel == null} onClick={() => shift(1)} aria-label="Flytta höger">→</button>
        <button onClick={() => sortBy("s")}>Färg</button>
        <button onClick={() => sortBy("r")}>Valör</button>
        {pub.phase === "over" && !ended
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
