import { t } from "./i18n";
import type { Card } from "../supabase/functions/_shared/games/zhol";
import { CardView } from "./games/zhol/Card";

const c = (r: number, s: number, id: number): Card => ({ id, r, s });
const J: Card = { id: 99, j: 1 };
const Row = ({ cards }: { cards: Card[] }) => <div className="rule-cards">{cards.map((x) => <CardView key={x.id} c={x} />)}</div>;

/** A line of rule text with simple <b> markup, in the chosen language. */
const T = ({ k, as: Tag = "p" }: { k: string; as?: "p" | "li" | "span" }) => <Tag dangerouslySetInnerHTML={{ __html: t(k) }} />;

export function Rules({ onExit, onTutorial }: { onExit: () => void; onTutorial: () => void }) {
  return (
    <div className="rules">
      <header className="bar">
        <button className="ghost" onClick={onExit}>{t("← Lobby")}</button>
        <button className="primary" onClick={onTutorial}>{t("Öva en runda")}</button>
      </header>
      <section className="panel">
        <h2>{t("Så spelar du Zhol")}</h2>
        <T k="Zhol är ett albanskt kortspel för 2–8 spelare. Den som först får alla sina kort i grupper och ropar <b>Zhol!</b> vinner rundan." />

        <h3>{t("Grupper")}</h3>
        <div className="rule-grid">
          <div><Row cards={[c(12, 0, 1), c(12, 2, 2), c(12, 3, 3)]} /><T k="<b>Lika:</b> 3 eller 4 kort med samma valör, alla i olika färger." /></div>
          <div><Row cards={[c(5, 1, 4), c(6, 1, 5), c(7, 1, 6), c(8, 1, 7)]} /><T k="<b>Serie:</b> 3 eller fler kort i följd, i samma färg." /></div>
          <div><Row cards={[c(9, 0, 8), J, c(11, 0, 9)]} /><T k="<b>Xhol</b> (jokern) kan ersätta vilket kort som helst." /></div>
          <div><Row cards={[c(12, 2, 10), c(13, 2, 11), c(1, 2, 12)]} /><T k="<b>Ess</b> kan vara lågt (A-2-3) eller högt (Q-K-A), men inte båda samtidigt." /></div>
        </div>

        <h3>{t("En tur")}</h3>
        <ol className="steps">
          <T as="li" k="<b>Ta ett kort</b>, från högen eller det översta kortet i kasthögen." />
          <T as="li" k="<b>Kasta ett kort</b> på kasthögen. Kortet du nyss tog från kasthögen får du inte kasta direkt." />
          <T as="li" k="Går alla kort ihop efter att du tagit ett kort trycker du <b>Zhol!</b> och vinner." />
        </ol>

        <h3>{t("Två varianter")}</h3>
        <T k="<b>Zhol i vogël</b> (lilla): 7 kort, alltid en grupp med 3 och en med 4. <b>Zhol i madh</b> (stora): 10 kort (11 under din tur) och två kortlekar. Alla kort ska ligga i grupper om minst 3. Vid fler än 4 spelare läggs en kortlek till." />

        <h3>{t("Till 101 (poäng)")}</h3>
        <T k="När någon gör Zhol får de andra poäng för korten som inte ligger i en grupp: 2–10 som skrivet, ess och klädda kort 10, xhol 20. Den som stänger får −20 (−40 med en xhol som sista kort). Den som når 101 åker ut, och den som är sist kvar tar potten. Den som är ute kan köpa in sig igen och får då samma poäng som den som har högst." />

        <h3>{t("Tid, Elo och Lek")}</h3>
        <T k="Du har 45 sekunder per tur. Missar du två turer i rad förlorar du rundan. Snabbmatcher är rankade och ger Elo. Lek är låtsasmarker utan värde i pengar." />
      </section>
    </div>
  );
}
