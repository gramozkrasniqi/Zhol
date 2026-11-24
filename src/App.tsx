import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, sb } from "./lib";
import { Login } from "./Login";
import { Lobby } from "./Lobby";
import { TableView } from "./TableView";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tableId, setTableId] = useState<string | null>(() => {
    try { return localStorage.getItem("zhol.table"); } catch { return null; }
  });

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const open = (id: string | null) => {
    setTableId(id);
    try { id ? localStorage.setItem("zhol.table", id) : localStorage.removeItem("zhol.table"); } catch { /* ignore */ }
  };

  if (!configured) return <main className="wrap"><h1>Zhol</h1><p>Lägg in VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i <code>.env</code> (se README).</p></main>;
  if (!ready) return null;
  if (!session) return <Login />;
  return (
    <main className="wrap">
      {tableId
        ? <TableView uid={session.user.id} tableId={tableId} onLeave={() => open(null)} />
        : <Lobby uid={session.user.id} onOpen={open} />}
    </main>
  );
}
