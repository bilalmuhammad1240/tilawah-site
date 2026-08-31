"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/auth/useUser";
import NotificationBell from "./NotificationBell";
import { Home, History, UserCircle, WalletCards, Headphones, Menu } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "Início", icon: Home },
  { href: "/history", label: "Histórico", icon: History },
  { href: "/qaris", label: "Recitar", icon: Headphones },
  { href: "/profile", label: "Perfil", icon: UserCircle },
];

export default function Navigation({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const links = profile.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin", icon: Menu }] : LINKS;

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      <header className="relative z-10 flex items-center justify-between py-5">
        <button className="h-11 w-11 rounded-xl bg-white/10 flex items-center justify-center" aria-label="Menu">
          <Menu size={25} strokeWidth={2} />
        </button>
        <Link href="/dashboard" className="text-center leading-none">
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl gold">✥</span>
            <span className="font-[var(--font-newsreader)] text-[2.1rem] tracking-tight">Tilawah</span>
          </div>
          <div className="mt-1 text-[.58rem] uppercase tracking-[.24em] text-[#e7c975]">Ser ouvido. Melhorar sempre.</div>
        </Link>
        <NotificationBell userId={profile.id} />
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#06463c] text-white bottom-nav md:static md:mt-8 md:rounded-2xl md:bg-transparent md:text-white md:shadow-none">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2 md:py-0">
          {links.slice(0, 4).map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link key={l.href} href={l.href} className={`flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[.7rem] transition ${active ? "text-[#f1c964]" : "text-white/80"}`}>
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
