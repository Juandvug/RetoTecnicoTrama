"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessGate } from "@/features/access/access-gate";
import { Composer } from "@/features/chat/composer";
import { MessageList } from "@/features/chat/message-list";
import { SpecPanel } from "@/features/spec-panel/spec-panel";

import { InterviewProvider, useInterview } from "./interview-provider";

type Pestana = "chat" | "requerimiento";

const AVISOS = {
  invalida:
    "La entrevista guardada en este navegador estaba dañada y no se pudo recuperar. Empezaste una nueva.",
  version_distinta:
    "La entrevista guardada es de una versión anterior de la app y no se pudo recuperar. Empezaste una nueva.",
} as const;

/** La única isla cliente con la sesión (ADR-0001). */
export function InterviewWorkspace({
  accesoInicial,
}: {
  accesoInicial: boolean;
}) {
  return (
    <InterviewProvider accesoInicial={accesoInicial}>
      <Workspace />
    </InterviewProvider>
  );
}

function Workspace() {
  const {
    accesoRequerido,
    accesoConcedido,
    aviso,
    descartarAviso,
    anuncio,
    novedad,
    marcarNovedadVista,
  } = useInterview();
  const [pestana, setPestana] = useState<Pestana>("chat");

  if (accesoRequerido) return <AccessGate onAcceso={accesoConcedido} />;

  return (
    <>
      {aviso && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b px-6 py-2 text-sm"
        >
          <p>{AVISOS[aviso]}</p>
          <Button size="sm" variant="ghost" onClick={descartarAviso}>
            Entendido
          </Button>
        </div>
      )}
      {/* Fuera de las pestañas: una región oculta con display:none no se anuncia. */}
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>
      {/*
        Por debajo de md, Chat y Requerimiento son pestañas (ARCHITECTURE §8.4).
        Desde md se ven las dos columnas: los paneles se montan siempre y el
        inactivo solo se oculta en pantallas angostas.
      */}
      <Tabs
        value={pestana}
        onValueChange={(valor) => {
          setPestana(valor as Pestana);
          marcarNovedadVista();
        }}
        className="min-h-0 flex-1 gap-0 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:divide-x"
      >
        <TabsList className="mx-6 my-2 w-auto md:hidden">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="requerimiento">
            Requerimiento
            {novedad && pestana === "chat" && (
              <span className="text-xs font-semibold">· nueva versión</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          forceMount
          aria-labelledby="titulo-chat"
          className="flex min-h-0 flex-col bg-sidebar data-[state=inactive]:hidden md:data-[state=inactive]:flex"
        >
          <div className="border-b px-6 py-4">
            <h2 id="titulo-chat" className="text-sm font-semibold">
              Entrevista
            </h2>
          </div>
          <MessageList />
          <Composer />
        </TabsContent>
        <TabsContent
          value="requerimiento"
          forceMount
          aria-labelledby="titulo-panel"
          className="flex min-h-0 flex-col bg-background data-[state=inactive]:hidden md:data-[state=inactive]:flex"
        >
          <SpecPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
