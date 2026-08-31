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

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const links = profile.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <div className="flex items-center justify-between mb-6 w-full">
      <div className="flex gap-4">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-[0.82rem] font-semibold ${
              pathname.startsWith(l.href) ? "text-emerald-950" : "text-[#8a8a7d]"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell userId={profile.id} />
        <button onClick={logout} className="text-[0.78rem] text-[#8a8a7d] underline">
          Sair
        </button>
      </div>
    </div>
  );
}
