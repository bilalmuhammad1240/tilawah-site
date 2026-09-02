"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listNotifications, markAllRead, type NotificationRow } from "@/lib/notifications/api";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await listNotifications();
    setItems(data ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-" + userId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + userId },
        (payload) => setItems((cur) => [payload.new as NotificationRow, ...cur])
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unread = items.filter((n) => !n.read);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread.length > 0) {
      await markAllRead(unread.map((n) => n.id));
      setItems((cur) => cur.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={toggle} className="relative text-[0.82rem] text-emerald-900" type="button">
        🔔
        {unread.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-maroon-600 text-white text-[0.6rem] w-4 h-4 rounded-full flex items-center justify-center">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gold-500/30 shadow-lg z-50 max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-[0.8rem] text-[#8a8a7d] text-center">Sem notificações.</div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (n.payload?.sessionId) router.push(`/session/${n.payload.sessionId}`);
                }}
                className="w-full text-left p-3 border-b border-gold-500/15 last:border-b-0 hover:bg-stone-50 block"
              >
                <div className="text-[0.82rem] text-ink-900">{n.payload?.message}</div>
                <div className="text-[0.68rem] text-[#8a8a7d] mt-0.5">{timeAgo(n.created_at)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
