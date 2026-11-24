import type { Card } from "../supabase/functions/_shared/games/zhol";
import { CardView } from "./games/zhol/Card";

const c = (r: number, s: number, id: number): Card => ({ id, r, s });
const J: Card = { id: 99, j: 1 };
const Row = ({ cards }: { cards: Card[] }) => <div className="rule-cards">{cards.map((x) => <CardView key={x.id} c={x} />)}</div>;

export function Rules({ onExit, onTutorial }: { onExit: () => void; onTutorial: () => void }) {
  return (
    <div className="rules">
      <header className="bar">
        <button className="ghost" onClick={onExit}>← Lobby</button>
        <button className="primary" onClick={onTutorial}>Öva en runda</button>
      </header>
      <section className="panel">
        <h2>Så spelar du Zhol</h2>
        <p>Zhol är ett albanskt kortspel för 2–8 spelare. Den som först får alla sina kort i grupper och ropar <b>Zhol!</b> vinner rundan.</p>

        <h3>Grupper</h3>
        <div className="rule-grid">
          <div><Row cards={[c(12, 0, 1), c(12, 2, 2), c(12, 3, 3)]} /><p><b>Lika:</b> 3 eller 4 kort med samma valör, i vilka färger som helst (två likadana kort går bra).</p></div>
          <div><Row cards={[c(5, 1, 4), c(6, 1, 5), c(7, 1, 6), c(8, 1, 7)]} /><p><b>Serie:</b> 3 eller fler kort i följd, i samma färg.</p></div>
          <div><Row cards={[c(9, 0, 8), J, c(11, 0, 9)]} /><p><b>Xhol</b> (jokern) kan ersätta vilket kort som helst.</p></div>
          <div><Row cards={[c(12, 2, 10), c(13, 2, 11), c(1, 2, 12)]} /><p><b>Ess</b> kan vara lågt (A-2-3) eller högt (Q-K-A), men inte båda samtidigt.</p></div>
        </div>

        <h3>En tur</h3>
        <ol className="steps">
          <li><b>Ta ett kort</b>, från högen eller det översta kortet i kasthögen.</li>
          <li><b>Kasta ett kort</b> på kasthögen. Kortet du nyss tog från kasthögen får du inte kasta direkt.</li>
          <li>Går alla kort ihop efter att du tagit ett kort trycker du <b>Zhol!</b> och vinner.</li>
        </ol>

        <h3>Två varianter</h3>
        <p><b>Zhol i vogël</b> (lilla): 7 kort, alltid en grupp med 3 och en med 4. <b>Zhol i madh</b> (stora): 10 kort (11 under din tur) och två kortlekar. Alla kort ska ligga i grupper om minst 3. Vid fler än 4 spelare läggs en kortlek till.</p>

        <h3>Tid, Elo och Lek</h3>
        <p>Du har 45 sekunder per tur. Missar du två turer i rad förlorar du rundan. Snabbmatcher är rankade och ger Elo. Lek är låtsasmarker utan värde i pengar.</p>
      </section>
    </div>
  );
}
