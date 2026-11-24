import { t, tServer } from "../../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyAction, botMove, findWin, makeDeck, publicView, shuffle,
  type Action, type Card, type GameState,
} from "../../../supabase/functions/_shared/games/zhol";
import type { SeatInfo } from "../types";
import { ZholBoard } from "./Board";

const DONE_KEY = "zhol.tutorial.done";
export const tutorialDone = () => { try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return false; } };
const markDone = () => { try { localStorage.setItem(DONE_KEY, "1"); } catch { /* private mode */ } };

// ♠ = 0, ♥ = 1, ♦ = 2, ♣ = 3
type RS = [number, number];
const ME: RS[] = [[5, 1], [6, 1], [7, 1], [12, 0], [12, 2], [2, 3], [9, 0]];
const BOT: RS[] = [[8, 1], [1, 0], [3, 2], [11, 3], [4, 0], [10, 2], [13, 3]];
const OPEN: RS = [5, 3];
const NEXT_STOCK: RS[] = [[2, 2], [12, 3]]; // drawn from the end: first the queen of clubs for me, then a card for the bot

/** A rigged two-player round that runs only in the browser, so the lesson always works out. */
export function lessonGame(): GameState {
  const deck = makeDeck("small", Math.random, 1);
  const take = ([r, s]: RS) => {
    const i = deck.findIndex((c) => c.r === r && c.s === s);
    return deck.splice(i, 1)[0];
  };
  const hands = [ME.map(take), BOT.map(take)];
  const discard = [take(OPEN)];
  const tail = NEXT_STOCK.map(take);
  const stock = [...shuffle(deck), ...tail];
  return { variant: "small", seats: 2, stock, discard, hands, turn: 0, phase: "draw", taken: null, winner: null, winGroups: null, moves: 0, log: [] };
}

const SEATS: SeatInfo[] = [
  { user_id: "me", seat: 0, username: t("Du"), elo: 1200 },
  { user_id: "bot", seat: 1, username: "Drita (bot)", elo: 1200, botSkill: 0.5 },
];

const label = (c: Card) => c.j ? "Xhol" : `${({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[c.r!] ?? c.r}${["♠", "♥", "♦", "♣"][c.s!]}`;

export function Tutorial({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<GameState>(lessonGame);
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState("");
  const stateRef = useRef(state);
  stateRef.current = state;
  const scripted = useRef(true); // the bot's first turn is scripted: it throws the 8 of hearts

  function act(a: Action) {
    setErr("");
    try { setState(applyAction(stateRef.current, 0, a)); }
    catch (e) { setErr(tServer((e as Error).message)); }
  }

  // The bot plays one move at a time with a little thinking time
  useEffect(() => {
    if (state.phase === "over" || state.turn !== 1) return;
    const t = window.setTimeout(() => {
      const s = stateRef.current;
      let a: Action | null;
      if (scripted.current && s.phase === "draw") a = { type: "draw", from: "stock" };
      else if (scripted.current) {
        const eight = s.hands[1].find((c) => c.r === 8 && c.s === 1);
        a = eight ? { type: "discard", cardId: eight.id } : botMove(s, 1, 0.5);
        scripted.current = false;
      } else a = botMove(s, 1, 0.5);
      if (a) setState(applyAction(s, 1, a));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => { if (state.phase === "over" && state.winner === 0) markDone(); }, [state.phase, state.winner]);

  const pub = useMemo(() => publicView(state), [state]);
  const hand = state.hands[0];
  const top = state.discard[state.discard.length - 1];
  const canWin = state.turn === 0 && state.phase === "discard" && !!findWin(hand, state.taken, true);

  // What the coach says depends on where the player is, not on a fixed script
  let step = "free", text: string;
  if (!started) { step = "intro"; text = ""; }
  else if (state.phase === "over") { step = "over"; text = t(state.winner === 0 ? "Så går det till. Nu är du redo för riktiga bord." : "Drita hann före den här gången. Försök igen!"); }
  else if (state.turn === 1) { step = "wait"; text = t("Nu är det Dritas tur. Titta på vad hon kastar – det kan vara ett kort du behöver."); }
  else if (canWin) { step = "zhol"; text = t("Alla dina kort sitter nu i grupper. Tryck på Zhol! för att vinna."); }
  else if (state.phase === "draw" && top?.r === 8 && top.s === 1 && hand.some((c) => c.r === 7 && c.s === 1)) {
    step = "take"; text = t("Drita kastade 8♥. Den passar efter din 5♥ 6♥ 7♥. Tryck på kasthögen för att ta den.");
  } else if (state.phase === "draw" && state.moves === 0) { step = "draw"; text = t("Din tur börjar alltid med att du tar ett kort. Tryck på högen."); }
  else if (state.phase === "draw") { step = "free"; text = t("Ta ett kort – från högen, eller från kasthögen om det öppna kortet passar dig."); }
  else {
    const loose = hand.filter((c) => !c.j && !(c.r === 12) && !(c.s === 1 && c.r! >= 5 && c.r! <= 8));
    step = "discard";
    text = state.moves === 1
      ? t("Damerna blev en färdig grupp – se guldramen. Nu kastar du ett kort du inte behöver, till exempel {cards}: dra det till kasthögen eller tryck två gånger på det.", { cards: loose.map(label).join(t(" eller ")) })
      : t("Kasta ett kort du inte behöver. Behåll korten med guldram.");
  }

  return (
    <div className="tut" data-step={step}>
      <header className="bar">
        <button className="ghost" onClick={onExit}>{t("← Lobby")}</button>
        <span className="tags"><span className="tag gold">{t("Lär dig spela")}</span><span className="tag">{t("Zhol i vogël, 7 kort")}</span></span>
        <button className="ghost" onClick={() => { setState(lessonGame()); scripted.current = true; setErr(""); }}>{t("Börja om")}</button>
      </header>

      {step === "intro" ? (
        <section className="panel coach-intro">
          <h2>{t("Zhol på två minuter")}</h2>
          <ol className="steps">
            <li dangerouslySetInnerHTML={{ __html: t("<b>Målet:</b> få alla dina 7 kort i grupper.") }} />
            <li dangerouslySetInnerHTML={{ __html: t("<b>Grupper:</b> tre eller fyra lika (Q♠ Q♦ Q♣) eller en serie i samma färg (5♥ 6♥ 7♥).") }} />
            <li dangerouslySetInnerHTML={{ __html: t("<b>Varje tur:</b> ta ett kort, kasta ett kort.") }} />
            <li dangerouslySetInnerHTML={{ __html: t("<b>Vinst:</b> när allt går ihop trycker du Zhol!") }} />
          </ol>
          <p className="muted">{t("Du spelar en övningsrunda mot Drita. Inget räknas och inga Lek står på spel.")}</p>
          <div className="row"><button className="primary big" onClick={() => setStarted(true)}>{t("Börja")}</button></div>
        </section>
      ) : (
        <>
          {text && <div className="coach" role="status" aria-live="polite"><span className="coach-ico" aria-hidden="true">★</span>{text}</div>}
          {err && <p className="err">{err}</p>}
          <ZholBoard pub={pub} hand={hand} mySeat={0} seats={SEATS} busy={state.turn !== 0} act={act}
            nextRound={() => { setState(lessonGame()); scripted.current = true; }} onLeave={onExit} />
        </>
      )}
    </div>
  );
}
