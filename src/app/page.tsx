import { AppHeader } from "@/components/app-header";

// Esqueleto con contenido de relleno: el chat y el panel reales llegan en F7.
export default function Home() {
  return (
    <>
      <AppHeader />
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:divide-x">
        <section
          aria-labelledby="titulo-chat"
          className="flex min-h-0 flex-col bg-sidebar"
        >
          <div className="border-b px-6 py-4">
            <h2 id="titulo-chat" className="text-sm font-semibold">
              Entrevista
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="rounded-md border bg-muted p-2 text-sm">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Agente
              </p>
              Contame qué decisión querés tomar y con qué datos contás.
            </div>
          </div>
        </section>
        <section
          aria-labelledby="titulo-panel"
          className="flex min-h-0 flex-col bg-background"
        >
          <div className="border-b px-6 py-4">
            <h2 id="titulo-panel" className="text-sm font-semibold">
              Requerimiento
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
              Todavía no hay requerimiento
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
