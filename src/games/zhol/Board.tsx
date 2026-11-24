import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { findWin, type Action, type Card, type LogEntry, type PublicState } from "../../../supabase/functions/_shared/games/zhol";
import type { BoardProps } from "../types";
import { Back, CardView } from "./Card";
import { AvatarFace } from "../../Avatar";
import { analyseHand, smartGroups, sortRank, sortSuit } from "./sortHand";
import { Finale } from "./Finale";
import { cardSound, setSound, soundOn } from "./sound";

/** Where a seat sits around the oval. The player is always at the bottom; the radius lives in CSS. */
function seatPosition(offset: number, total: number): CSSProperties {
  const angle = Math.PI / 2 + (offset * 2 * Math.PI) / total; // 90° = bottom, clockwise
  return { "--c": Math.cos(angle).toFixed(3), "--s": Math.sin(angle).toFixed(3) } as CSSProperties;
}

const botLevel = (skill?: number | null) => ((skill ?? 0.7) < 0.45 ? "Nybörjare" : (skill ?? 0.7) < 0.8 ? "Van" : "Expert");

/** flip: which side shows at the start and end of the flight */
interface Flight { key: number; card?: Card; from: DOMRect; to: DOMRect; face: [boolean, boolean]; endRot: number }
interface Drag { kind: "card" | "stock" | "discard"; id?: number; x0: number; y0: number; x: number; y: number; moved: boolean; card?: Card }
const FLIGHT_MS = 950;
const STEP_MS = 1250; // flight plus a short pause, so every move can be followed
/** Each card rests on the discard pile at its own small angle, like a real pile. */
export const pileTilt = (id: number) => ((id * 37) % 13) - 6;
const pileShift = (id: number) => ((id * 53) % 9) - 4;
const inside = (r: DOMRect | undefined, x: number, y: number, pad = 12) =>
  !!r && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

const SORTS = [
  { id: "smart", label: "Grupper" },
  { id: "rank", label: "Nummer" },
  { id: "suit", label: "Färg" },
] as const;

export function ZholBoard({ pub, hand, mySeat, seats, busy, act, nextRound, ended, timeLeft, turnSeconds = 45, pot, bubbles = {}, ranked, onLeave }: BoardProps<PublicState, Card[], Action>) {
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

  // Cards that are still on their way to the hand stay hidden until the flight lands
  const [arriving, setArriving] = useState<Set<number>>(new Set());
  const [landed, setLanded] = useState<number | null>(null);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [sound, setSoundState] = useState(soundOn);
  const knownIds = useRef<Set<number> | null>(null);
  const myDrawLandedAt = useRef(0);
  useEffect(() => {
    const ids = new Set(hand.map((c) => c.id));
    if (knownIds.current && Date.now() - myDrawLandedAt.current > 1500) {
      const fresh = hand.filter((c) => !knownIds.current!.has(c.id)).map((c) => c.id);
      if (fresh.length && fresh.length < 3) {
        setArriving((a) => new Set([...a, ...fresh]));
        window.setTimeout(() => setArriving((a) => { const n = new Set(a); fresh.forEach((id) => n.delete(id)); return n; }), 3500);
      }
    }
    knownIds.current = ids;
  }, [hand]);

  // Keep the player's own arrangement; new cards go to the end
  useEffect(() => {
    rememberPositions();
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
  // What the table shows lags behind the server until each flight has landed
  const [pile, setPile] = useState<Card[]>(pub.discardTop ? [pub.discardTop] : []);
  const [stockShown, setStockShown] = useState(pub.stockCount);
  const pubRef = useRef(pub);
  pubRef.current = pub;
  const handNow = useRef(hand);
  handNow.current = hand;
  const arrivingRef = useRef(arriving);
  arrivingRef.current = arriving;
  function syncTable() {
    const p = pubRef.current;
    setStockShown(p.stockCount);
    setPile((cur) => {
      const top = p.discardTop;
      if (!top) return [];
      return cur[cur.length - 1]?.id === top.id ? cur : [...cur.filter((c) => c.id !== top.id), top].slice(-4);
    });
  }
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
  // Declared after the log effect, so a move that is about to be animated is not shown early
  useEffect(() => { if (!playing.current) syncTable(); }, [pub]); // eslint-disable-line react-hooks/exhaustive-deps

  function rectOfSeat(seat: number) {
    if (seat === mySeat) {
      const h = handRef.current?.getBoundingClientRect();
      return h && new DOMRect(h.right - h.width * 0.2, h.top, h.width * 0.15, h.height);
    }
    return seatRefs.current.get(seat)?.querySelector(".avatar")?.getBoundingClientRect();
  }
  function playNext() {
    const e = queue.current.shift();
    if (!e) { playing.current = false; syncTable(); return; }
    playing.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stock = stockRef.current?.querySelector(".back, .card")?.getBoundingClientRect();
    const disc = discardRef.current?.querySelector(".card, .empty")?.getBoundingClientRect() ?? discardRef.current?.getBoundingClientRect();
    const seat = rectOfSeat(e.seat);
    const mine = e.seat === mySeat;
    let from: DOMRect | undefined, to: DOMRect | undefined, card: Card | undefined;
    let face: [boolean, boolean] = [true, true], endRot = 0;
    let onLand = () => {};
    if (e.kind === "draw") {
      from = e.from === "discard" ? disc : stock;
      if (e.from === "discard") {
        card = e.card;
        setPile((p) => p.slice(0, -1)); // the card lifts off the pile
        face = [true, mine];
      } else {
        setStockShown((n) => Math.max(0, n - 1));
        // My own card from the stock turns face up as it reaches the hand
        const newId = mine ? [...arrivingRef.current][0] : undefined;
        card = newId != null ? handNow.current.find((c) => c.id === newId) : undefined;
        face = [false, !!card];
      }
      // Land on the card's own slot in my hand if it is already there
      const slot = mine && card ? cardRefs.current.get(card.id)?.getBoundingClientRect() : undefined;
      to = slot ?? seat;
      if (mine && card) endRot = 0;
      onLand = () => {
        if (mine) {
          myDrawLandedAt.current = Date.now();
          const ids = [...arrivingRef.current];
          setArriving(new Set());
          if (ids[0] != null) { setLanded(ids[0]); window.setTimeout(() => setLanded(null), 500); }
        }
        cardSound("snap");
      };
      cardSound("swish");
    } else {
      from = mine && lastCardRect.current ? lastCardRect.current : seat;
      to = disc;
      card = e.card;
      face = [mine, true];
      endRot = card ? pileTilt(card.id) : 0;
      onLand = () => {
        if (card) setPile((p) => [...p.filter((c) => c.id !== card!.id), card!].slice(-4));
        cardSound("snap");
      };
    }
    if (mine) lastCardRect.current = null;
    if (from && to && !reduced) {
      const key = Date.now() + Math.random();
      setFlights((f) => [...f, { key, card, from: from!, to: to!, face, endRot }]);
      window.setTimeout(() => { setFlights((f) => f.filter((x) => x.key !== key)); onLand(); }, FLIGHT_MS);
      window.setTimeout(playNext, STEP_MS);
    } else {
      onLand();
      window.setTimeout(playNext, reduced ? 250 : 0);
    }
  }

  /* ---------- Smooth reordering of the hand (FLIP) ---------- */
  const before = useRef(new Map<number, DOMRect>());
  function rememberPositions() {
    before.current = new Map([...cardRefs.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
  }
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [id, el] of cardRefs.current) {
      const old = before.current.get(id);
      if (!old) continue;
      const now = el.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    before.current = new Map();
  }, [order, breaks]);

  // Elo before the round, to show the change when it ends
  const eloBefore = useRef(new Map<number, number>());
  useEffect(() => {
    if (pub.phase !== "over") eloBefore.current = new Map(seats.map((x) => [x.seat, x.elo]));
  }, [seats, pub.phase]);

  /* ---------- How close the hand is to Zhol ---------- */
  const small = pub.variant === "small";
  const analysis = useMemo(() => analyseHand(hand, small), [hand, small]);
  const ready = useMemo(() => new Set(analysis.done.flat().map((c) => c.id)), [analysis]);
  const needed = small ? 7 : 14;
  const inGroups = Math.min(needed, ready.size);

  /* ---------- Rules for what the player may do now ---------- */
  const over = ended || pub.phase === "over";
  const myTurn = !over && pub.turn === mySeat;
  const canWin = myTurn && pub.phase === "discard" && !!findWin(hand, pub.taken, pub.variant === "small");
  const name = (seat: number) => (seats.find((s) => s.seat === seat)?.username ?? "…").replace(" (bot)", "");
  const drawOpen = myTurn && pub.phase === "draw" && !busy;
  const canThrow = (id: number) => myTurn && pub.phase === "discard" && !busy && id !== pub.taken;
  const newest = myTurn && pub.phase === "discard" ? sorted[sorted.length - 1]?.id : undefined;

  function throwCard(id: number) {
    lastCardRect.current = cardRefs.current.get(id)?.getBoundingClientRect() ?? null;
    act({ type: "discard", cardId: id });
    setSel(null);
  }
  const [sortIdx, setSortIdx] = useState(-1);
  function cycleSort() {
    const i = (sortIdx + 1) % SORTS.length;
    setSortIdx(i);
    sortBy(SORTS[i].id);
  }
  function sortBy(k: "suit" | "rank" | "smart") {
    rememberPositions();
    if (k === "smart") {
      const groups = smartGroups(hand, pub.variant === "small");
      setOrder(groups.flat().map((c) => c.id));
      setBreaks(new Set(groups.slice(1).map((g) => g[0].id)));
      return;
    }
    setOrder((k === "suit" ? sortSuit(hand) : sortRank(hand)).map((c) => c.id));
    setBreaks(new Set());
  }
  function moveTo(id: number, target: number) {
    rememberPositions();
    const o = order.filter((x) => x !== id);
    o.splice(target, 0, id);
    setOrder(o);
    setBreaks(new Set());
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
            {pub.phase === "over" && pub.winGroups ? null : (
              <div className="piles">
                <button ref={stockRef} className={`pile ${drawOpen ? "go" : ""}`} disabled={!drawOpen} aria-label={`Högen, ${pub.stockCount} kort`}
                  onClick={() => { if (!suppressClick.current) act({ type: "draw", from: "stock" }); }}
                  onPointerDown={(e) => drawOpen && startDrag(e, { kind: "stock" })}>
                  <span className="stack" style={{ "--d": Math.min(5, Math.ceil(stockShown / 8)) } as CSSProperties}><Back label={stockShown} /></span><span className="lbl">Högen</span>
                </button>
                <button ref={discardRef} className={`pile ${drawOpen && pub.discardTop ? "go" : ""} ${dragOverDiscard ? "drop" : ""}`} aria-label="Kasthögen"
                  disabled={!(drawOpen && pub.discardTop) && !(myTurn && pub.phase === "discard")}
                  onClick={() => {
                    if (suppressClick.current) return;
                    if (drawOpen && pub.discardTop) act({ type: "draw", from: "discard" });
                    else if (sel != null && canThrow(sel)) throwCard(sel);
                  }}
                  onPointerDown={(e) => drawOpen && pub.discardTop && startDrag(e, { kind: "discard", card: pub.discardTop })}>
                  <span className="heap">
                    {pile.length ? pile.map((c, i) => (
                      <span key={c.id} className={`lay ${i === pile.length - 1 ? "top" : ""}`}
                        style={{ transform: `translate(${pileShift(c.id)}px, ${pileShift(c.id * 7) / 2}px) rotate(${pileTilt(c.id)}deg)` }}>
                        <CardView c={c} />
                      </span>
                    )) : <span className="empty" />}
                  </span><span className="lbl">Kastat</span>
                </button>
              </div>
            )}
            {canWin && !busy
              ? <button className="zhol-call" onClick={() => act({ type: "zhol" })}>Zhol!</button>
              : <div className={`status ${myTurn ? "mine" : ""}`} aria-live="polite">{status}</div>}
            {pot ? <div className="pot"><i aria-hidden="true" />{pot.toLocaleString("sv-SE")} Lek</div> : null}
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
                <span className="face"><AvatarFace who={s} /></span>
                {active && timeLeft != null && <b className="secs">{timeLeft}</b>}
                {bubbles[s.seat] && <span className={`bubble ${Math.sin(Math.PI / 2 + (offset * 2 * Math.PI) / total) < -0.2 ? "down" : ""}`} role="status">{bubbles[s.seat]}</span>}
              </div>
              <div className="plate">
                <span className="nm">{offset === 0 ? "Du" : label}{isBot && <em>bot</em>}</span>
                <span className="meta">{isBot
                  ? <>{botLevel(s.botSkill)}, </>
                  : <span className="elo">{s.elo} Elo, </span>}{pub.handCounts[s.seat] ?? 0} kort</span>
              </div>
              {offset !== 0 && <span className="minicards" aria-hidden="true">{Array.from({ length: Math.min(pub.handCounts[s.seat] ?? 0, 5) }, (_, i) => <i key={i} />)}</span>}
            </div>
          );
        })}
        {pub.phase === "over" && !ended && (
          <Finale pub={pub} mySeat={mySeat} seats={seats} eloBefore={eloBefore.current.get(mySeat)} pot={pot} ranked={!!ranked} onNext={nextRound} onLeave={onLeave} />
        )}
      </div>

      <div ref={handRef} className={`hand ${dragOverHand ? "drop" : ""}`} style={{ "--n": sorted.length } as CSSProperties}>
        {sorted.map((c) => (
          <span key={c.id} ref={(el) => { if (el) cardRefs.current.set(c.id, el); else cardRefs.current.delete(c.id); }}
            className={`slot ${drag?.moved && drag.id === c.id ? "lifted" : ""} ${arriving.has(c.id) ? "coming" : ""} ${landed === c.id ? "landed" : ""} ${breaks.has(c.id) ? "gap" : ""} ${ready.has(c.id) && !over ? "ready" : ""}`}
            onPointerDown={(e) => startDrag(e, { kind: "card", id: c.id, card: c })}>
            <CardView c={c} selected={sel === c.id} fresh={c.id === newest} onClick={() => tap(c)} />
          </span>
        ))}
      </div>
      <div className="handbar">
        <span className="progress" aria-live="polite">
          <span className="meter" style={{ "--v": inGroups / needed } as CSSProperties}><i /></span>
          {over ? "" : inGroups === 0 ? "Inga färdiga grupper än" : `${inGroups} av ${needed} kort i färdiga grupper`}
        </span>
        <span className="tools">
          <button onClick={cycleSort} aria-label={`Sortera handen, nu: ${sortIdx < 0 ? "egen ordning" : SORTS[sortIdx].label}`}>
            Sortera{sortIdx >= 0 && <em>{SORTS[sortIdx].label}</em>}
          </button>
          <button className="snd" aria-pressed={sound} aria-label={sound ? "Stäng av ljud" : "Sätt på ljud"}
            onClick={() => { setSound(!sound); setSoundState(!sound); }}>{sound ? "🔊" : "🔈"}</button>
        </span>
      </div>
      <p className="hint">{myTurn ? (pub.phase === "draw" ? "Ta ett kort från högen eller kasthögen." : canWin ? "Handen går ihop – tryck på Zhol!" : "Dra ett kort till kasthögen, eller tryck två gånger på det.") : "Dra korten i handen för att ordna dem."}</p>

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

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A card travelling in an arc: it lifts, turns over if needed, and settles at the angle it will rest at. */
function FlyingCard({ f }: { f: Flight }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current, flip = inner.current;
    if (!el || !flip) return;
    const fx = f.from.left + f.from.width / 2, fy = f.from.top + f.from.height / 2;
    const tx = f.to.left + f.to.width / 2, ty = f.to.top + f.to.height / 2;
    const dist = Math.hypot(tx - fx, ty - fy);
    // Bend the path sideways and upwards, like a card thrown by hand
    const cx = (fx + tx) / 2 - (ty - fy) * 0.18, cy = (fy + ty) / 2 - Math.min(120, 40 + dist * 0.25);
    const spin = (tx > fx ? 1 : -1) * 14;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = ease(i / 12), u = 1 - t;
      const x = u * u * fx + 2 * u * t * cx + t * t * tx;
      const y = u * u * fy + 2 * u * t * cy + t * t * ty;
      const lift = Math.sin(Math.PI * t);
      const rot = -spin * u + f.endRot * t + spin * 0.6 * lift;
      frames.push({
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${1 + 0.18 * lift})`,
        filter: `drop-shadow(0 ${4 + 22 * lift}px ${6 + 18 * lift}px rgba(0,0,0,${0.55 - 0.2 * lift}))`,
        offset: i / 12,
      });
    }
    el.animate(frames, { duration: FLIGHT_MS, fill: "forwards" });
    const side = (up: boolean) => `rotateY(${up ? 0 : 180}deg)`;
    flip.animate([{ transform: side(f.face[0]), offset: 0 }, { transform: side(f.face[0]), offset: 0.25 }, { transform: side(f.face[1]), offset: 0.75 }, { transform: side(f.face[1]) }],
      { duration: FLIGHT_MS, easing: "ease-in-out", fill: "forwards" });
  }, [f]);
  return (
    <div ref={ref} className="flying" aria-hidden="true">
      <div ref={inner} className="f3">
        <span className="side front">{f.card ? <CardView c={f.card} /> : <Back />}</span>
        <span className="side rear"><Back /></span>
      </div>
    </div>
  );
}
