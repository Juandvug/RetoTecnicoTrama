# ADR-0008 · Estrategia de tests

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0002, ADR-0004, ADR-0005, ADR-0007

## Contexto

Tests vale 15 % y se pide que "prueben comportamiento, corran sin red y cubran los casos de error". El enunciado nombra cuatro casos mínimos: tool call válida, tool call inválida, ajuste después de una propuesta y confirmación. Un e2e del flujo feliz suma puntos.

## Decisión

| Nivel | Herramienta | Qué cubre | Red |
|---|---|---|---|
| Unidad (dominio) | Vitest | Esquema Zod, invariantes, cobertura, completitud efectiva, proyección al contrato base, diff de versiones, `derivarFase`, reducer, guarda de cifras | No |
| Engine | Vitest con `FakeLlmClient` | El turno completo: los cuatro casos del enunciado, reparación, respuesta truncada, timeouts, cuota agotada, guarda de cifras y fase forzada | No |
| Contrato del puerto | Vitest | La misma suite contra `FakeLlmClient` y contra `OpenAiLlmClient`, este último con `fetch` inyectado y respuestas grabadas | No |
| Handler HTTP | Vitest, invocando la función del handler con dependencias falsas | Seguridad perimetral, mapeo de errores y que la key no aparezca en ninguna respuesta | No |
| Componentes | Vitest con Testing Library (jsdom) | Panel: estados marcados por borde y texto, y Confirmar habilitado solo con suficiencia. Chat: Enter y Shift+Enter, y mensaje fallido con Reintentar y Editar | No |
| E2E | Playwright contra `next build && next start`, con `LLM_PROVIDER=fake` y un guion | Flujo feliz (necesidad → preguntas → propuesta → ajuste a v2 → confirmar), modo oscuro, y error con reintento | No |
| Evaluaciones del prompt (fuera de la CI) | Script `pnpm eval` con el modelo real | Conversaciones guionadas en tres dominios que comprueban invariantes de comportamiento: como máximo 2 preguntas por turno, propuesta en 3 turnos o menos, requerimiento válido y ningún porcentaje | Sí, se ejecutan a mano |

### Principios

- **Comportamiento, no implementación.** Los tests del engine afirman sobre lo observable (la propuesta producida, el texto devuelto, las requests que recibió el modelo), no sobre funciones internas.
- **Un solo fake, programable.** `FakeLlmClient` recibe un guion (una lista de respuestas o una función de la request) y registra cada request. Los guiones del e2e viven en `tests/fixtures/scenarios/*.json` y se cargan con `FAKE_LLM_SCENARIO`, así que `src/` no contiene datos de ningún dominio.
- **Fixtures de tres dominios** (rotación de personal, cuellos de botella en un proceso, inconsistencias de inventario) para esquema, invariantes y engine. Son datos de prueba. Una guarda de agnosticismo comprueba que el vocabulario de esos fixtures no aparece ni en el prompt ni en `src/`.
- **Tiempo controlado.** Reintentos y plazos se prueban con los timers simulados de Vitest. Ningún test espera tiempo real.
- **Snapshot del prompt.** Se fotografían el contenido del prompt y `PROMPT_VERSION`. Si el prompt cambia sin que cambie la versión, el test falla.

### Gates de la CI

En GitHub Actions, en cada push y cada PR:

- `typecheck` y `lint`;
- `test`, con cobertura mínima del 80 % de líneas en `src/domain` y `src/server`;
- `build`;
- escaneo de secretos (`gitleaks` y bundle);
- e2e.

## Alternativas descartadas

- **MSW para interceptar el HTTP de OpenAI.** Funcionaría, pero el SDK ya acepta un `fetch` inyectado. MSW sumaría una capa sin cubrir nada más.
- **Grabar y reproducir llamadas reales (estilo VCR) en los tests del engine.** Se rompe con cualquier cambio del prompt y cuesta mantenerlo. Las grabaciones se limitan a la suite de contrato del adaptador.
- **Jest.** Vitest corre TypeScript y ESM sin transformaciones extra, arranca más rápido y ofrece timers simulados equivalentes.
- **Evaluaciones con el modelo real en la CI.** No son deterministas, cuestan dinero y obligarían a poner la key en la CI.

## Consecuencias

- Ningún test determinista mide la calidad conversacional real, por ejemplo si las preguntas son pertinentes. Eso lo cubren las evaluaciones manuales y las tres transcripciones.
- Hay que mantener los guiones del fake cada vez que cambia el protocolo de la tool.

## Verificación

La propia CI. El PLAN.md incluye la tabla que relaciona cada caso con su test y los criterios de aceptación de cada fase.
