import { NextResponse } from "next/server";

// A API key da Daily só é lida aqui (servidor). O browser nunca a vê —
// só recebe o URL da sala já criada.
export const dynamic = "force-dynamic";

export async function POST() {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DAILY_API_KEY não configurada no servidor." }, { status: 500 });
  }

  // Sala de curta duração (1h) e só para 2 pessoas — chamadas de
  // recitação são 1:1. Sem partilha de ecrã/chat, que não fazem
  // sentido aqui e só aumentam a superfície de coisas a correrem mal.
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

  try {
    const res = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          exp: expiresAt,
          max_participants: 2,
          enable_screenshare: false,
          enable_chat: false,
          start_video_off: true,
          start_audio_off: false,
          eject_at_room_exp: true,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Falha ao criar sala Daily: " + detail }, { status: 502 });
    }

    const room = await res.json();
    return NextResponse.json({ url: room.url, name: room.name });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede a contactar a Daily: " + e.message }, { status: 502 });
  }
}
