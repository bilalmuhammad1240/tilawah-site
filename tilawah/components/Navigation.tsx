"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/auth/useUser";
import NotificationBell from "./NotificationBell";

const LINKS = [
  { href: "/dashboard", label: "Início" },
  { href: "/qaris", label: "Qaris" },
  { href: "/history", label: "Histórico" },
  { href: "/profile", label: "Perfil" },
];

export default function Navigation({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  async function logout() { await supabase.auth.signOut(); router.push("/login"); }
  const links = profile.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <nav className="t-nav" aria-label="Navegação principal">
      <Link href="/dashboard" className="t-brand">
        <span className="t-brand-mark">ت</span>
        <span>Tilawah</span>
      </Link>
      <div className="t-nav-actions">
        <NotificationBell userId={profile.id} />
        <button onClick={logout} className="t-logout">Sair</button>
      </div>
      <div className="t-nav-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`t-nav-link ${pathname.startsWith(l.href) ? "is-active" : ""}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
