import { NextRequest, NextResponse } from "next/server";
import { RtcTokenBuilder, RtcRole } from "agora-token";

// O App Certificate só é lido aqui (servidor). O browser recebe apenas
// o token já assinado, válido só para o canal e o uid pedidos, por
// tempo limitado.
export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 60 * 60; // 1h chega de sobra para uma sessão de recitação

export async function POST(req: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_AGORA_APP_ID ou AGORA_APP_CERTIFICATE não configurados no servidor." },
      { status: 500 }
    );
  }

  const { channelName, uid } = await req.json();
  if (!channelName || uid === undefined) {
    return NextResponse.json({ error: "channelName e uid são obrigatórios." }, { status: 400 });
  }

  try {
    // Confirmado na documentação oficial da Agora: tokenExpire e
    // privilegeExpire são DURAÇÕES em segundos a partir de agora
    // (ex.: 3600 = "expira daqui a 1 hora"), não timestamps absolutos.
    // Usar os dois com o mesmo valor é a prática recomendada quando não
    // há necessidade de os separar (o nosso caso).
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );
    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: "Falha ao gerar token Agora: " + e.message }, { status: 500 });
  }
}
