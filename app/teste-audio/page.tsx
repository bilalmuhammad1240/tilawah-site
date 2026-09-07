"use client";

import dynamic from "next/dynamic";

// O SDK da Agora acede a `window` assim que é importado — se este
// componente fosse importado normalmente, o Next.js tentaria carregá-lo
// também no servidor (para inspecionar a página durante o build) e
// rebentava com "window is not defined". `next/dynamic` com
// `ssr: false` garante que só é carregado no browser, nunca no
// processo de build/servidor.
const TesteAudioClient = dynamic(() => import("@/components/TesteAudioClient"), {
  ssr: false,
  loading: () => <div className="card text-center text-[#8a8a7d]">A carregar…</div>,
});

export default function TesteAudioPage() {
  return <TesteAudioClient />;
}
