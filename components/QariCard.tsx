import { Headphones, Star, ChevronRight } from "lucide-react";
export type QariListItem = { id: string; name: string; ratePerMinute: number; specialties: string[]; isAvailable: boolean };
function initials(name: string) { return (name || "Q").trim().slice(0, 1).toUpperCase(); }
function fmtMoney(v: number) { return "€" + v.toFixed(2).replace(".", ","); }

export default function QariCard({ qari, onRequest, onCallNow }: { qari: QariListItem; onRequest: (q: QariListItem) => void; onCallNow: (q: QariListItem) => void }) {
  return <div className="flex items-center gap-4 border-b border-[#ece9df] p-4 last:border-0 sm:p-5">
    <div className="relative flex-shrink-0"><div className="avatar-ring flex h-14 w-14 items-center justify-center rounded-full bg-[#e7eee8] text-lg font-semibold text-[#0b5145]">{initials(qari.name)}</div><span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${qari.isAvailable ? "bg-[#79a95d]" : "bg-[#b7bbb4]"}`} /></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate font-semibold text-[#103d34]">{qari.name}</div><Star size={14} className="fill-[#d4aa52] text-[#d4aa52]" /></div><div className="mt-1 text-sm text-[#777f79]">{qari.specialties.length ? qari.specialties.join(" · ") : "Recitação e Tajwid"}</div><div className="mt-1 text-xs text-[#9a9e98]">{fmtMoney(qari.ratePerMinute)}/min</div></div>
    <div className="flex flex-shrink-0 flex-col gap-2"><button className="btn-primary !rounded-xl !px-3 !py-2 text-xs sm:text-sm" disabled={!qari.isAvailable} onClick={() => onCallNow(qari)}><Headphones size={16} />{qari.isAvailable ? "Ligar agora" : "Indisponível"}</button><button className="hidden items-center justify-center gap-1 text-xs font-medium text-[#286256] sm:flex" onClick={() => onRequest(qari)}>Pedir sessão <ChevronRight size={14} /></button></div>
  </div>;
}
