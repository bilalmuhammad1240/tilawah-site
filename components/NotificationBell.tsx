"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listNotifications, markAllRead, type NotificationRow } from "@/lib/notifications/api";
import { Bell } from "lucide-react";

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (mins < 1440) return `há ${Math.floor(mins / 60)}h`;
  return `há ${Math.floor(mins / 1440)}d`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read);

  async function load() { const { data } = await listNotifications(); setItems(data ?? []); }
  useEffect(() => {
    load();
    const channel = supabase.channel("notifications-" + userId).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + userId }, (payload) => setItems((cur) => [payload.new as NotificationRow, ...cur])).subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useEffect(() => { const fn = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, []);

  async function toggle() {
    const next = !open; setOpen(next);
    if (next && unread.length) { await markAllRead(unread.map((n) => n.id)); setItems((cur) => cur.map((n) => ({ ...n, read: true }))); }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={toggle} className="relative h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center" type="button" aria-label="Notificações">
        <Bell size={23} />
        {unread.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e6bd61] px-1 text-[.62rem] font-bold text-[#16372f]">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>
      {open && <div className="absolute right-0 top-14 z-50 w-80 overflow-hidden rounded-2xl border border-[#e8e3d5] bg-white shadow-2xl text-left">
        <div className="border-b border-[#eeeae0] px-4 py-3 font-semibold text-[#103c33]">Notificações</div>
        {items.length === 0 ? <div className="p-6 text-center text-sm text-[#858b85]">Sem notificações.</div> : items.map((n) => <button key={n.id} type="button" onClick={() => { setOpen(false); if (n.payload?.sessionId) router.push(`/session/${n.payload.sessionId}`); }} className="block w-full border-b border-[#f0eee8] p-4 text-left hover:bg-[#faf9f4]"><div className="text-sm text-[#173c34]">{n.payload?.message}</div><div className="mt-1 text-xs text-[#8a8f89]">{timeAgo(n.created_at)}</div></button>)}
      </div>}
    </div>
  );
}
