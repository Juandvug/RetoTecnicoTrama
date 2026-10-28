# Registro de decisiones de arquitectura (ADR)

Cada ADR registra una decisión que condiciona la implementación del chat de entrada de Trama. Incluye el contexto que la motivó, la decisión tomada, las alternativas descartadas, sus consecuencias y cómo se comprueba que se sigue cumpliendo. La sección "Decisiones y alternativas descartadas" del README resume este registro.

La vista del sistema resultante (módulos, contratos, flujos de estado y salvaguardas) está en [ARCHITECTURE.md](../ARCHITECTURE.md).

| N.º | Decisión | Estado |
|---|---|---|
| [0001](0001-stack-y-plataforma.md) | Stack y plataforma: Next.js App Router, Tailwind v4, shadcn/ui, Vercel | Aceptada |
| [0002](0002-abstraccion-del-proveedor-llm.md) | Puerto `LlmClient` propio con adaptadores; OpenAI solo dentro del adaptador | Aceptada |
| [0003](0003-estado-y-flujo-de-datos.md) | El cliente es dueño de la sesión; el servidor no guarda estado y es la autoridad de validación | Aceptada |
| [0004](0004-validacion-y-reintentos.md) | Validación en tres capas, ciclo de reparación acotado y reintentos de transporte | Aceptada |
| [0005](0005-proteccion-contra-abuso.md) | Código de acceso, rate limiting en capas, límites de tamaño y cabeceras de seguridad | Aceptada |
| [0006](0006-extensiones-del-contrato.md) | Extensiones mínimas de `RequerimientoMotor` para justificar cada columna y medir cobertura | Aceptada |
| [0007](0007-control-de-fases.md) | La fase se deriva de forma determinista; el LLM decide dentro de cada fase | Aceptada |
| [0008](0008-estrategia-de-tests.md) | Tests sin red con cliente LLM simulado, suite de contrato del puerto y e2e | Aceptada |

## Estados

- **Propuesta**: en revisión. Todavía no guía la implementación.
- **Aceptada**: vigente. La implementación debe cumplirla.
- **Reemplazada por NNNN**: se conserva como historia y enlaza a la que la reemplaza.

## Plantilla

```markdown
# ADR-NNNN · Título

- **Estado:** Propuesta | Aceptada | Reemplazada por ADR-NNNN
- **Fecha:** AAAA-MM-DD
- **Relacionadas:** ADR-…

## Contexto
Qué fuerza la decisión: requisitos del enunciado, criterios de evaluación, restricciones técnicas.

## Decisión
Qué se hace, en términos verificables.

## Alternativas descartadas
Cada alternativa con el motivo concreto del descarte.

## Consecuencias
Lo que se gana, lo que se paga y los riesgos que quedan.

## Verificación
Tests, reglas de lint o chequeos de CI que detectan si la decisión se rompe.
```
