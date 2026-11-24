import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { findWin, type Action, type Card, type LogEntry, type PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { BoardProps } from "../types";
import { Back, CardView } from "./Card";

/** Where a seat sits around the oval. The player is always at the bottom; the radius lives in CSS. */
function seatPosition(offset: number, total: number): CSSProperties {
  const angle = Math.PI / 2 + (offset * 2 * Math.PI) / total; // 90° = bottom, clockwise
  return { "--c": Math.cos(angle).toFixed(3), "--s": Math.sin(angle).toFixed(3) } as CSSProperties;
}

interface Flight { key: number; card?: Card; from: DOMRect; to: DOMRect }
interface Drag { kind: "card" | "stock" | "discard"; id?: number; x0: number; y0: number; x: number; y: number; moved: boolean; card?: Card }
const FLIGHT_MS = 420;
const STEP_MS = 520; // pause between animated moves, so bot turns can be followed
const inside = (r: DOMRect | undefined, x: number, y: number, pad = 12) =>
  !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

export function ZholBoard({ pub, hand, mySeat, seats, busy, act, nextRound, ended, timeLeft, turnSeconds = 45, pot }: BoardProps<PublicState, Card[], Action>) {
  const [order, setOrder] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [drag, setDragState] = useState<Drag | null>(null);
  // The live drag is kept in a ref so fast pointer events never see a stale value
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const stockRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef(new Map<number, HTMLDivElement>());
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const suppressClick = useRef(false);

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

  /* ---------- Animate every move since the last one we showed ---------- */
  const seen = useRef<number | null>(null);
  const queue = useRef<LogEntry[]>([]);
  const playing = useRef(false);
  const lastCardRect = useRef<DOMRect | null>(null); // where my discarded card was, for my own throws

  useEffect(() => {
    const log = pub.log ?? [];
    const top = log.length ? log[log.length - 1].n : 0;
    if (seen.current === null || top < seen.current) { seen.current = top; return; } // first load or new round: no replay
    const fresh = log.filter((e) => e.n > seen.current!);
    seen.current = top;
    if (!fresh.length) return;
    queue.current.push(...fresh);
    if (!playing.current) playNext();
  }, [pub.log]); // eslint-disable-line react-hooks/exhaustive-deps

  function rectOfSeat(seat: number) {
    if (seat === mySeat) return handRef.current?.getBoundingClientRect();
    return seatRefs.current.get(seat)?.querySelector(".avatar")?.getBoundingClientRect();
  }
  function playNext() {
    const e = queue.current.shift();
    if (!e) { playing.current = false; return; }
    playing.current = true;
    const stock = stockRef.current?.querySelector(".back, .card")?.getBoundingClientRect();
    const disc = discardRef.current?.getBoundingClientRect();
    const seat = rectOfSeat(e.seat);
    let from: DOMRect | undefined, to: DOMRect | undefined, card: Card | undefined;
    if (e.kind === "draw") { from = e.from === "discard" ? disc : stock; to = seat; card = e.from === "discard" ? e.card : undefined; }
    else { from = e.seat === mySeat && lastCardRect.current ? lastCardRect.current : seat; to = disc; card = e.card; }
    if (e.seat === mySeat) lastCardRect.current = null;
    if (from && to && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const key = Date.now() + Math.random();
      setFlights((f) => [...f, { key, card, from: from!, to: to! }]);
      window.setTimeout(() => setFlights((f) => f.filter((x) => x.key !== key)), FLIGHT_MS + 40);
    }
    window.setTimeout(playNext, STEP_MS);
  }

  /* ---------- Rules for what the player may do now ---------- */
  const over = ended || pub.phase === "over";
  const myTurn = !over && pub.turn === mySeat;
  const canWin = myTurn && pub.phase === "discard" && !!findWin(hand, pub.taken, pub.variant === "small");
  const name = (seat: number) => seats.find((s) => s.seat === seat)?.username ?? "…";
  const drawOpen = myTurn && pub.phase === "draw" && !busy;
  const canThrow = (id: number) => myTurn && pub.phase === "discard" && !busy && id !== pub.taken;
  const newest = myTurn && pub.phase === "discard" ? sorted[sorted.length - 1]?.id : undefined;

  function throwCard(id: number) {
    lastCardRect.current = cardRefs.current.get(id)?.getBoundingClientRect() ?? null;
    act({ type: "discard", cardId: id });
    setSel(null);
  }
  function sortBy(k: "s" | "r") {
    const hi = (r: number) => (r === 1 ? 14 : r);
    const key = (c: Card) => (c.j ? 999 : k === "s" ? c.s! * 20 + hi(c.r!) : hi(c.r!) * 4 + c.s!);
    setOrder([...hand].sort((a, b) => key(a) - key(b)).map((c) => c.id));
  }
  function moveTo(id: number, target: number) {
    const o = order.filter((x) => x !== id);
    o.splice(target, 0, id);
    setOrder(o);
  }
  function shift(d: number) {
    const i = order.indexOf(sel!);
    if (i < 0 || i + d < 0 || i + d >= order.length) return;
    moveTo(sel!, i + d);
  }
  function tap(c: Card) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (sel === c.id && canThrow(c.id)) throwCard(c.id);
    else setSel(sel === c.id ? null : c.id);
  }

  /* ---------- Drag and drop: piles → hand, card → discard pile or new place in hand ---------- */
  function startDrag(e: RPointerEvent, d: Omit<Drag, "x0" | "y0" | "x" | "y" | "moved">) {
    if (e.button !== 0) return;
    setDrag({ ...d, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  }
  function moveDrag(e: RPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8;
    setDrag({ ...d, x: e.clientX, y: e.clientY, moved });
  }
  function endDrag(e: RPointerEvent) {
    const d0 = dragRef.current;
    setDrag(null);
    if (!d0) return;
    // A quick flick may end before any move event arrived: judge by where it ended
    const d = { ...d0, moved: d0.moved || Math.hypot(e.clientX - d0.x0, e.clientY - d0.y0) > 8 };
    if (!d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const { clientX: x, clientY: y } = e;
    if (d.kind !== "card") {
      if (drawOpen && inside(handRef.current?.getBoundingClientRect(), x, y, 30)) act({ type: "draw", from: d.kind });
      return;
    }
    if (inside(discardRef.current?.getBoundingClientRect(), x, y, 24) && canThrow(d.id!)) { throwCard(d.id!); return; }
    // Dropped on the hand: put the card where it was released
    if (inside(handRef.current?.getBoundingClientRect(), x, y, 30)) {
      const others = sorted.filter((c) => c.id !== d.id);
      let at = others.length;
      for (let i = 0; i < others.length; i++) {
        const r = cardRefs.current.get(others[i].id)?.getBoundingClientRect();
        if (r && x < r.left + r.width / 2) { at = i; break; }
      }
      moveTo(d.id!, at);
    }
  }
  const dragOverDiscard = !!drag?.moved && drag.kind === "card" && canThrow(drag.id!) && inside(discardRef.current?.getBoundingClientRect(), drag.x, drag.y, 24);
  const dragOverHand = !!drag?.moved && drag.kind !== "card" && inside(handRef.current?.getBoundingClientRect(), drag.x, drag.y, 30);

  const status = ended ? "Partiet är slut."
    : pub.phase === "over"
      ? pub.winner === -1 ? "Högen tog slut – oavgjort." : pub.winner === mySeat ? "Zhol! Du vann." : `${name(pub.winner!)} gjorde Zhol.`
      : myTurn
        ? pub.phase === "draw" ? "Din tur – ta ett kort" : canWin ? "Du har Zhol!" : "Kasta ett kort"
        : `${name(pub.turn)} spelar…`;

  const total = pub.seats;
  const ring = (seat: number): CSSProperties | undefined =>
    !over && pub.turn === seat && timeLeft != null
      ? ({ "--p": `${Math.max(0, Math.min(1, timeLeft / turnSeconds)) * 360}deg` } as CSSProperties)
      : undefined;

  return (
    <section className="room" data-seats={total} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
      <div className="poker">
        <div className="rail"><div className="felt">
          <div className="center">
            {pub.phase === "over" && pub.winGroups ? (
              <div className="groups">{pub.winGroups.map((g, i) => <div key={i}>{g.map((c) => <CardView key={c.id} c={c} />)}</div>)}</div>
            ) : (
              <div className="piles">
                <button ref={stockRef} className={`pile ${drawOpen ? "go" : ""}`} disabled={!drawOpen} aria-label={`Högen, ${pub.stockCount} kort`}
                  onClick={() => { if (!suppressClick.current) act({ type: "draw", from: "stock" }); }}
                  onPointerDown={(e) => drawOpen && startDrag(e, { kind: "stock" })}>
                  <Back label={pub.stockCount} /><span className="lbl">Högen</span>
                </button>
                <button ref={discardRef} className={`pile ${drawOpen && pub.discardTop ? "go" : ""} ${dragOverDiscard ? "drop" : ""}`} aria-label="Kasthögen"
                  disabled={!(drawOpen && pub.discardTop) && !(myTurn && pub.phase === "discard")}
                  onClick={() => {
                    if (suppressClick.current) return;
                    if (drawOpen && pub.discardTop) act({ type: "draw", from: "discard" });
                    else if (sel != null && canThrow(sel)) throwCard(sel);
                  }}
                  onPointerDown={(e) => drawOpen && pub.discardTop && startDrag(e, { kind: "discard", card: pub.discardTop })}>
                  {pub.discardTop ? <CardView c={pub.discardTop} /> : <span className="empty" />}<span className="lbl">Kastat</span>
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
            <div key={s.seat} ref={(el) => { if (el) seatRefs.current.set(s.seat, el); else seatRefs.current.delete(s.seat); }}
              className={`seat ${offset === 0 ? "me" : ""} ${active ? "active" : ""} ${won ? "won" : ""}`} style={seatPosition(offset, total)}>
              <div className="avatar" style={ring(s.seat)}>
                <span>{label.slice(0, 1).toUpperCase()}</span>
                {active && timeLeft != null && <b className="secs">{timeLeft}</b>}
              </div>
              <div className="plate">
                <span className="nm">{offset === 0 ? "Du" : label}{isBot && <em>BOT</em>}</span>
                <span className="meta"><span className="elo">{s.elo} · </span>{pub.handCounts[s.seat] ?? 0} kort</span>
              </div>
              {offset !== 0 && <span className="minicards" aria-hidden="true">{Array.from({ length: Math.min(pub.handCounts[s.seat] ?? 0, 5) }, (_, i) => <i key={i} />)}</span>}
            </div>
          );
        })}
      </div>

      <div ref={handRef} className={`hand ${dragOverHand ? "drop" : ""}`} style={{ "--n": sorted.length } as CSSProperties}>
        {sorted.map((c) => (
          <span key={c.id} ref={(el) => { if (el) cardRefs.current.set(c.id, el); else cardRefs.current.delete(c.id); }}
            className={`slot ${drag?.moved && drag.id === c.id ? "lifted" : ""}`}
            onPointerDown={(e) => startDrag(e, { kind: "card", id: c.id, card: c })}>
            <CardView c={c} selected={sel === c.id} fresh={c.id === newest} onClick={() => tap(c)} />
          </span>
        ))}
      </div>
      <p className="hint">{myTurn ? (pub.phase === "draw" ? "Dra ett kort från högen eller kasthögen till din hand – eller tryck på högen." : "Dra ett kort till kasthögen för att kasta – eller tryck två gånger på kortet.") : "Dra korten i handen för att sortera dem."}</p>
      <div className="acts">
        <button disabled={sel == null} onClick={() => shift(-1)} aria-label="Flytta vänster">←</button>
        <button disabled={sel == null} onClick={() => shift(1)} aria-label="Flytta höger">→</button>
        <button onClick={() => sortBy("s")}>Färg</button>
        <button onClick={() => sortBy("r")}>Valör</button>
        {pub.phase === "over" && !ended
          ? <button className="main" onClick={nextRound}>Ny runda</button>
          : <>
              <button className="main" disabled={sel == null || !canThrow(sel)} onClick={() => sel != null && throwCard(sel)}>Kasta</button>
              <button className="zhol" disabled={!canWin || busy} onClick={() => act({ type: "zhol" })}>Zhol!</button>
            </>}
      </div>

      {/* Card that follows the finger while dragging */}
      {drag?.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.kind === "stock" ? <Back /> : <CardView c={drag.card!} />}
        </div>
      )}
      {/* Cards in flight between piles and players */}
      {flights.map((f) => <FlyingCard key={f.key} f={f} />)}
    </section>
  );
}

function FlyingCard({ f }: { f: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fx = f.from.left + f.from.width / 2, fy = f.from.top + f.from.height / 2;
    const tx = f.to.left + f.to.width / 2, ty = f.to.top + f.to.height / 2;
    el.animate(
      [
        { transform: `translate(${fx}px, ${fy}px) translate(-50%, -50%) scale(1) rotate(-8deg)`, opacity: 1 },
        { transform: `translate(${(fx + tx) / 2}px, ${(fy + ty) / 2 - 30}px) translate(-50%, -50%) scale(1.08) rotate(4deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(.85) rotate(0deg)`, opacity: 0.2 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" },
    );
  }, [f]);
  return <div ref={ref} className="flying" aria-hidden="true">{f.card ? <CardView c={f.card} /> : <Back />}</div>;
}
