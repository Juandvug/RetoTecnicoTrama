# Enunciado del reto (extracto de trabajo)

> Extracto de "Reto técnico Trama" con lo que el código y los tests necesitan como referencia: tokens de estilo, tabla de estilos, contrato base y reglas. La fuente original es la página del reto; si difiere de este documento, manda la original.

## Alcance

Chat de entrada de Trama, desplegado en Vercel con una key de OpenAI compartida que solo vive en el servidor. Conduce una entrevista guiada, propone un modelo y especifica qué información necesita el motor de inferencia. Solo entran los pasos 1 (plantear la necesidad) y 2 (determinar los datos), más el panel de confirmación. Quedan fuera: autenticación de usuarios, carga y lectura de archivos, ETL, grafo RDF, motor de inferencia, dashboard y propuestas.

## Reglas innegociables

- **Ninguna cifra sale del LLM.** El agente pide datos y propone reglas, pero nunca afirma resultados, porcentajes ni hallazgos.
- **Salida tipada, no texto libre.** El requerimiento sale de function calling o Structured Outputs y se valida en el servidor antes de mostrarse.
- **La key se queda en el servidor.** Si aparece en el bundle del cliente, en el repo o en los logs, la entrega no se evalúa.
- **Agnóstico al dominio.** Sin listas fijas de datos ni de clases por caso de uso.

## Contrato base `RequerimientoMotor`

```json
{
  "necesidad": "Explicar el aumento de renuncias en operaciones (últimos 8 meses)",
  "decision_objetivo": "Decidir entre cambiar esquema de turnos o de supervisión",
  "alcance": { "periodo": "2026-02 / 2026-10", "unidades": ["Operaciones"] },
  "esquema": {
    "clases": ["Empleado", "Turno", "Supervisor", "Salida"],
    "relaciones": [
      { "sujeto": "Empleado", "predicado": "asignadoA", "objeto": "Turno" },
      { "sujeto": "Empleado", "predicado": "reportaA", "objeto": "Supervisor" },
      { "sujeto": "Empleado", "predicado": "registra", "objeto": "Salida" }
    ]
  },
  "reglas_candidatas": [
    {
      "id": "R1",
      "enunciado": "Si un Empleado cambió de Turno rotativo en los 60 días previos a su Salida, la Salida se asocia a rotación"
    }
  ],
  "fuentes_requeridas": [
    {
      "nombre": "Nómina",
      "tipo": "excel",
      "columnas_minimas": ["empleado_id", "area", "fecha_ingreso", "fecha_salida", "motivo_salida"],
      "justifica": ["Salida", "R1"]
    }
  ],
  "preguntas_abiertas": ["¿El motivo de salida se registra con categorías fijas o es texto libre?"],
  "completitud": "suficiente_para_confirmar"
}
```

- `completitud`: `suficiente_para_confirmar` o `faltan_datos`.
- `tipo` de fuente: `excel`, `csv`, `pdf` o `crm-export`.
- Toda fuente y toda columna pedida se justifica con al menos una clase, relación o regla. Si no se puede justificar, no se pide.
- La forma base se puede extender si se justifica (ADR-0006).

## Estilos de la app

Next.js, Tailwind v4 y shadcn/ui (estilo `radix-nova`, base `neutral`), Geist y una paleta monocromática en oklch. Los tokens se copian tal cual:

```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);        --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);              --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);          --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);        --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);          --sidebar: oklch(0.985 0 0);
  --destructive: oklch(0.577 0.245 27.325);
}
.dark {
  --background: oklch(0.145 0 0);    --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);          --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);         --muted-foreground: oklch(0.708 0 0);
  --border: oklch(1 0 0 / 10%);      --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);          --sidebar: oklch(0.205 0 0);
  --destructive: oklch(0.704 0.191 22.216);
}
```

| Elemento | Cómo se ve en la app |
|---|---|
| Header | `h-14 border-b px-6`, "Trama" en `text-sm font-semibold` y una etiqueta en mayúsculas `text-xs tracking-wide`. |
| Layout | Columnas separadas por `divide-x`: chat sobre `bg-sidebar`, panel de artefacto sobre `bg-background` con encabezado `border-b px-6 py-4`. |
| Mensajes | Ancho completo, alineados a la izquierda, `rounded-md border p-2 text-sm`. Agente: `bg-muted`. Usuario: `border-foreground/20`. Etiqueta "Agente" o "Vos" en `text-xs font-medium text-muted-foreground`. |
| Composer | Textarea de shadcn `min-h-16 rounded-lg` y botón "Enviar" a la derecha. Enter envía, Shift+Enter hace salto de línea. |
| Cards | `rounded-xl ring-1 ring-foreground/10`, padding de 16px, sin sombras. |
| Estados | Nunca por color. Se marcan con grosor de borde, borde punteado o sólido, `bg-foreground/5` vs `bg-muted` y peso de fuente. |

## Evaluación

| Criterio | Qué se mira | Peso |
|---|---|---|
| Calidad de la entrevista | Preguntas pocas y pertinentes; requerimiento mínimo, justificado y útil en tres dominios | 30 % |
| Arquitectura | Lógica de la entrevista independiente de OpenAI; límites claros entre prompt, tool, validación y UI | 25 % |
| Robustez | Tool calls inválidas, timeouts y errores de API sin perder el mensaje; key protegida y con límite de uso | 20 % |
| Tests | Prueban comportamiento, corren sin red y cubren los casos de error | 15 % |
| UI | Fiel a los estilos de Trama; estado legible de un vistazo; modo claro y oscuro | 10 % |

## Entrega

- URL del despliegue en Vercel.
- Repo de GitHub con commits convencionales y pequeños.
- `DESIGN.md` de la entrevista.
- Tres transcripciones con su requerimiento resultante.
- Video corto o GIF del flujo completo.
- README con las decisiones y alternativas descartadas, los próximos pasos para conectar el requerimiento con la carga de datos y el motor, y las limitaciones conocidas.
