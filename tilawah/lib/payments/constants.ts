export const PAYMENT_ACCOUNTS = [
  { method: "emola" as const, label: "eMola", number: "+258 879 197 409", holder: "Bilar João Pindula Saene" },
  { method: "mpesa" as const, label: "M-Pesa", number: "+258 850 548 895", holder: "Abu Huraira" },
];

export const DURATION_OPTIONS_MIN = [10, 20, 30, 45, 60];

export function estimateAmount(ratePerMinute: number, minutes: number) {
  return Math.round(ratePerMinute * minutes * 100) / 100;
}

export function fmtMoney(v: number) {
  return v.toFixed(2).replace(".", ",") + " MT";
}
