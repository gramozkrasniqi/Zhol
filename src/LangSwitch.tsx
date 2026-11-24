import { lang, setLang, t } from "./i18n";

/** Svenska / Shqip. Remembered on this device. */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`seg lang-switch ${compact ? "compact" : ""}`} role="radiogroup" aria-label={t("Språk")}>
      <button role="radio" aria-checked={lang === "sv"} className={lang === "sv" ? "on" : ""} onClick={() => setLang("sv")} lang="sv">
        {compact ? "SV" : "Svenska"}
      </button>
      <button role="radio" aria-checked={lang === "sq"} className={lang === "sq" ? "on" : ""} onClick={() => setLang("sq")} lang="sq">
        {compact ? "SQ" : "Shqip"}
      </button>
    </div>
  );
}
