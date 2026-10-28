import { cookies } from "next/headers";

import { AppHeader } from "@/components/app-header";
import { InterviewWorkspace } from "@/features/workspace/interview-workspace";
import { sesionVigente } from "@/server/composition";

// El shell es un Server Component; la entrevista vive en una sola isla cliente
// (ADR-0001). La página ya se renderiza por request por el nonce de la CSP, así
// que mirar la cookie acá no cuesta nada y evita mostrar la pantalla de acceso
// a quien ya tiene sesión.
export default async function Home() {
  const conAcceso = sesionVigente(await cookies());

  return (
    <>
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col">
        <InterviewWorkspace accesoInicial={conAcceso} />
      </main>
    </>
  );
}
