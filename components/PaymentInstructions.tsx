"use client";

import { useState } from "react";
import { PAYMENT_ACCOUNTS, DURATION_OPTIONS_MIN, estimateAmount, fmtMoney } from "@/lib/payments/constants";

export type PaymentChoice = {
  method: "emola" | "mpesa";
  estimatedMinutes: number;
  estimatedAmount: number;
};

export default function PaymentInstructions({
  ratePerMinute,
  submitting,
  onConfirm,
  onBack,
}: {
  ratePerMinute: number;
  submitting: boolean;
  onConfirm: (choice: PaymentChoice) => void;
  onBack: () => void;
}) {
  const [minutes, setMinutes] = useState(20);
  const [method, setMethod] = useState<"emola" | "mpesa">("emola");
  const [confirmed, setConfirmed] = useState(false);

  const amount = estimateAmount(ratePerMinute, minutes);
  const account = PAYMENT_ACCOUNTS.find((a) => a.method === method)!;

  return (
    <div className="card">
      <div className="eyebrow">
        <span className="dot" /> Pagamento
      </div>
      <h2 className="mb-2">Pague antes da chamada</h2>
      <p className="text-[#54544a] text-[0.9rem] mb-4">
        A Tilawah ainda não tem cobrança automática — o pagamento é feito por transferência direta, e o Qari
        confirma que recebeu antes de atender.
      </p>

      <label className="field-label !mt-0">Duração estimada</label>
      <div className="flex gap-2 flex-wrap">
        {DURATION_OPTIONS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            className={`py-2 px-3 text-[0.82rem] border ${
              minutes === m ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"
            }`}
            onClick={() => setMinutes(m)}
          >
            {m} min
          </button>
        ))}
      </div>

      <div className="mt-4 mb-2 flex justify-between items-baseline">
        <span className="text-[0.85rem] text-[#54544a]">Valor estimado</span>
        <span className="font-mono text-[1.3rem] text-emerald-950">{fmtMoney(amount)}</span>
      </div>
      <p className="hint !mt-0 mb-4">
        Isto é só uma estimativa para saber quanto transferir. O custo real depende da duração efetiva da chamada.
      </p>

      <label className="field-label">Método de pagamento</label>
      <div className="flex gap-2 mb-3">
        {PAYMENT_ACCOUNTS.map((a) => (
          <button
            key={a.method}
            type="button"
            className={`flex-1 py-2.5 text-[0.85rem] border ${
              method === a.method ? "bg-emerald-950 text-stone-50 border-emerald-950" : "border-gold-500/30 text-emerald-900"
            }`}
            onClick={() => setMethod(a.method)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="border border-gold-500/30 bg-stone-50 p-3.5 mb-4">
        <div className="text-[0.72rem] uppercase tracking-wide text-[#8a8a7d] mb-1">Transferir para</div>
        <div className="font-mono text-[1.05rem] text-emerald-950">{account.number}</div>
        <div className="text-[0.8rem] text-[#54544a]">Titular: {account.holder}</div>
      </div>

      <label className="flex items-start gap-2.5 mb-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="text-[0.85rem] text-ink-900">
          Confirmo que já efetuei a transferência de {fmtMoney(amount)} para este número.
        </span>
      </label>
      <p className="hint !mt-0">
        Esta confirmação não é verificada automaticamente. O Qari pode confirmar o recebimento antes de atender.
      </p>

      <button
        className="btn btn-gold"
        disabled={!confirmed || submitting}
        onClick={() => onConfirm({ method, estimatedMinutes: minutes, estimatedAmount: amount })}
      >
        {submitting ? "A enviar…" : "Confirmar e continuar"}
      </button>
      <button className="btn btn-ghost" onClick={onBack} type="button">
        Voltar
      </button>
    </div>
  );
}
