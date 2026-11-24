import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hasAlbanian, tServer } from "../src/i18n";
import { zhol } from "../supabase/functions/_shared/games/zhol";
import { LEAGUES } from "../supabase/functions/_shared/rating";
import { PRESETS } from "../src/Avatar";

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
});

describe("albanska", () => {
  it("varje text i appen har en albansk rad", () => {
    const keys = new Set<string>();
    for (const f of files("src").filter((f) => !f.endsWith("i18n.ts"))) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
      for (const m of src.matchAll(/<T (?:as="\w+" )?k="([^"]*)"/g)) keys.add(m[1]);
      for (const m of src.matchAll(/t\(\s*(?:[^()"]*\?\s*)?"([^"]+)"\s*:\s*[^"]*"([^"]+)"(?:\s*:\s*"([^"]+)")?/g)) [m[1], m[2], m[3]].forEach((k) => k && keys.add(k));
    }
    for (const v of zhol.variants) v.label.split(" · ").forEach((k) => keys.add(k));
    for (const l of LEAGUES) keys.add(l.name);
    for (const p of PRESETS) keys.add(p.label);
    ["Grupper", "Nummer", "Färg", "Nybörjare", "Van", "Expert", "Kafe turke", "Çaj",
      "Lycka till!", "Bra spelat", "Oj!", "Snyggt!", "Så nära!", "Tack för spelet"].forEach((k) => keys.add(k));
    const missing = [...keys].filter((k) => !hasAlbanian(k));
    expect(missing).toEqual([]);
  });

  it("serverns meddelanden har albanska rader", () => {
    const msgs = new Set<string>();
    for (const f of files("supabase/functions")) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/new (?:MoveError|UserError)\(\s*"([^"]+)"/g)) msgs.add(m[1]);
      for (const m of src.matchAll(/json\(\{ error: "([^"]+)"/g)) msgs.add(m[1]);
    }
    expect(msgs.size).toBeGreaterThan(20);
    expect([...msgs].filter((k) => !hasAlbanian(k))).toEqual([]);
    expect(tServer("Insatsen är 500 Lek – du har inte tillräckligt")).toBe("Insatsen är 500 Lek – du har inte tillräckligt"); // svenska är förvalt i testerna
  });
});
