import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import type { SeatInfo } from "./games/types";
import { sb } from "./lib";

export interface ChatMessage { id: number; user_id: string; body: string; created_at: string }
const QUICK = () => ["Lycka till!", "Bra spelat", "Oj!", "Snyggt!", "Så nära!", "Tack för spelet"].map((q) => t(q));

/** Chat for everyone at the table. Messages arrive in realtime; the parent shows them as seat bubbles too. */
export function TableChat({ tableId, uid, seats, onMessage }: {
  tableId: string; uid: string; seats: SeatInfo[]; onMessage: (m: ChatMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    let alive = true;
    sb.from("table_messages").select("id, user_id, body, created_at").eq("table_id", tableId).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (alive) setMsgs((data ?? []).reverse()); });
    const ch = sb.channel(`chat-${tableId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "table_messages", filter: `table_id=eq.${tableId}` }, (p) => {
        const m = p.new as ChatMessage;
        setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list.slice(-99), m]));
        onMessage(m);
        if (!openRef.current && m.user_id !== uid) setUnread((n) => n + 1);
      })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [tableId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, open]);

  async function send(body: string) {
    const b = body.trim();
    if (!b) return;
    setErr("");
    const { error } = await sb.from("table_messages").insert({ table_id: tableId, user_id: uid, body: b.slice(0, 300) });
    if (error) setErr(error.message.includes("snabbt") ? t("Du skriver för snabbt – vänta en stund.") : t("Meddelandet kunde inte skickas."));
    else setText("");
  }

  const who = (id: string) => seats.find((s) => s.user_id === id);

  return (
    <>
      <button className="ghost chat-toggle" onClick={() => { setOpen(!open); setUnread(0); }} aria-expanded={open} aria-controls="table-chat">
        {t("Chatt")}{unread > 0 && <span className="unread" aria-label={t("{n} olästa", { n: unread })}>{unread}</span>}
      </button>
      {open && (
        <aside id="table-chat" className="chat panel" aria-label={t("Chatt vid bordet")}>
          <header className="chat-head">
            <h2>{t("Chatt vid bordet")}</h2>
            <button className="ghost" onClick={() => setOpen(false)} aria-label={t("Stäng chatten")}>{t("Stäng")}</button>
          </header>
          <ol className="chat-list" ref={listRef}>
            {msgs.length === 0 && <li className="muted">{t("Inga meddelanden än. Säg hej till bordet.")}</li>}
            {msgs.map((m) => {
              const s = who(m.user_id);
              const mine = m.user_id === uid;
              return (
                <li key={m.id} className={`msg ${mine ? "mine" : ""}`}>
                  {!mine && <Avatar who={{ username: s?.username ?? "?", avatar: s?.avatar }} size={28} />}
                  <div>
                    {!mine && <span className="msg-name">{s?.username ?? t("Har lämnat bordet")}</span>}
                    <p>{m.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="quick">
            {QUICK().map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input aria-label={t("Skriv ett meddelande")} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder={t("Skriv till bordet…")} />
            <button className="primary" disabled={!text.trim()}>{t("Skicka")}</button>
          </form>
          {err && <p className="err">{err}</p>}
        </aside>
      )}
    </>
  );
}
