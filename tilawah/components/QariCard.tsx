export type QariListItem = {
  id: string;
  name: string;
  ratePerMinute: number;
  specialties: string[];
  isAvailable: boolean;
};

function initials(name: string) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function fmtMoney(v: number) {
  return v.toFixed(2).replace(".", ",") + " MT";
}

export default function QariCard({
  qari,
  onRequest,
  onCallNow,
}: {
  qari: QariListItem;
  onRequest: (qari: QariListItem) => void;
  onCallNow: (qari: QariListItem) => void;
}) {
  return (
    <div className="bg-white p-4 flex items-center justify-between gap-3 border-b border-gold-500/20 last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
            qari.isAvailable ? "bg-okgreen animate-pulse" : "bg-[#c9c4b4]"
          }`}
        />
        <div className="avatar">{initials(qari.name)}</div>
        <div className="min-w-0">
          <div className="text-[0.92rem] font-semibold text-emerald-950 truncate">{qari.name}</div>
          <div className="text-[0.72rem] text-[#8a8a7d] truncate">
            {fmtMoney(qari.ratePerMinute)}/min
            {qari.specialties.length > 0 ? " · " + qari.specialties.join(", ") : ""}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          className="btn btn-gold !w-auto !mt-0 py-2 px-4 text-[0.78rem]"
          disabled={!qari.isAvailable}
          onClick={() => onCallNow(qari)}
        >
          {qari.isAvailable ? "Ligar agora" : "Indisponível"}
        </button>
        <button className="btn btn-ghost !w-auto !mt-0 py-1.5 px-4 text-[0.72rem]" onClick={() => onRequest(qari)}>
          Pedir sessão
        </button>
      </div>
    </div>
  );
}
