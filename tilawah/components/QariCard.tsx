export type QariListItem = {
  id: string;
  name: string;
  ratePerMinute: number;
  specialties: string[];
  isAvailable: boolean;
};

function initials(name: string) { return (name || "?").trim().slice(0, 1).toUpperCase(); }
function fmtMoney(v: number) { return v.toFixed(2).replace(".", ",") + " MT"; }

export default function QariCard({ qari, onRequest, onCallNow }: {
  qari: QariListItem;
  onRequest: (qari: QariListItem) => void;
  onCallNow: (qari: QariListItem) => void;
}) {
  return (
    <article className="qari-item">
      <div className="qari-top">
        <span className={`qari-status ${qari.isAvailable ? "online" : "offline"}`} aria-label={qari.isAvailable ? "Disponível" : "Indisponível"} />
        <div className="avatar">{initials(qari.name)}</div>
        <div className="min-w-0">
          <div className="qari-name truncate">{qari.name}</div>
          <div className="qari-meta">{fmtMoney(qari.ratePerMinute)} / minuto</div>
        </div>
      </div>
      <div className="qari-specialties">
        {qari.specialties.length ? qari.specialties.join(" · ") : "Recitação e acompanhamento"}
      </div>
      <div className="qari-actions">
        <button className="btn btn-gold" disabled={!qari.isAvailable} onClick={() => onCallNow(qari)}>
          {qari.isAvailable ? "Ligar agora" : "Indisponível"}
        </button>
        <button className="btn btn-ghost" onClick={() => onRequest(qari)}>Pedir sessão</button>
      </div>
    </article>
  );
}
