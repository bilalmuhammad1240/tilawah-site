import { NextResponse } from "next/server";

// Nunca expor XIRSYS_IDENT/XIRSYS_SECRET ao browser — por isso este
// ficheiro vive em app/api (só corre no servidor) e as variáveis não
// têm o prefixo NEXT_PUBLIC_. O cliente só recebe o resultado final
// (lista de iceServers), nunca as credenciais da conta Xirsys.
export const dynamic = "force-dynamic";

const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export async function GET() {
  const ident = process.env.XIRSYS_IDENT;
  const secret = process.env.XIRSYS_SECRET;
  const channel = process.env.XIRSYS_CHANNEL;

  if (!ident || !secret || !channel) {
    // Sem credenciais configuradas: usa o TURN público como reserva em
    // vez de rebentar a chamada — mantém o site a funcionar em dev.
    return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
  }

  try {
    const auth = Buffer.from(`${ident}:${secret}`).toString("base64");
    const res = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ format: "urls" }),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
    }

    const data = await res.json();
    const raw = data?.v?.iceServers;
    if (!raw) {
      return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
    }

    // A Xirsys às vezes devolve um único objeto, às vezes uma lista —
    // normaliza para o formato que RTCPeerConnection espera.
    const iceServers = Array.isArray(raw) ? raw : [raw];

    return NextResponse.json({ iceServers, source: "xirsys" });
  } catch {
    return NextResponse.json({ iceServers: FALLBACK_ICE_SERVERS, source: "fallback" });
  }
}
