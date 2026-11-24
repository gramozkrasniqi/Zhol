import { t } from "../../i18n";
import type { Card } from "../../../supabase/functions/_shared/games/zhol";

const SU = ["♠︎", "♥︎", "♦︎", "♣︎"];
const NAMES = () => [t("spader"), t("hjärter"), t("ruter"), t("klöver")];
export const rankLabel = (r: number) => ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[r] ?? String(r);

export function CardView({ c, selected, fresh, onClick }: { c: Card; selected?: boolean; fresh?: boolean; onClick?: () => void }) {
  const cls = ["card", c.j ? "jk" : c.s === 1 || c.s === 2 ? "red" : "", selected ? "sel" : "", fresh ? "new" : ""].join(" ");
  const label = c.j ? "Xhol" : `${rankLabel(c.r!)} ${NAMES()[c.s!]}`;
  const inner = c.j
    ? <><span className="tl">Xhol</span><span className="c">★</span></>
    : <><span className="tl">{rankLabel(c.r!)}<b>{SU[c.s!]}</b></span><span className="c">{SU[c.s!]}</span><span className="br" aria-hidden="true">{rankLabel(c.r!)}<b>{SU[c.s!]}</b></span></>;
  return onClick
    ? <button className={cls} aria-label={label} aria-pressed={selected} onClick={onClick}>{inner}</button>
    : <span className={cls} aria-label={label}>{inner}</span>;
}

/** Card back with the qilim (Albanian woven rug) pattern. */
export function Back({ label }: { label?: string | number }) {
  return <span className="back">{label !== undefined && <b>{label}</b>}</span>;
}
