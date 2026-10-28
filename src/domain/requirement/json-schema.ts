import { z } from "zod";

import { RequerimientoMotorSchema } from "./schema";

// JSON Schema de los parámetros de registrar_requerimiento. Sale del mismo
// esquema Zod que valida en el servidor, así que lo que se le pide al modelo y
// lo que se valida no pueden divergir (ADR-0001). Cada adaptador lo lleva al
// dialecto estricto de su proveedor (ADR-0002).

export type JsonSchema = Record<string, unknown>;

export function esquemaJsonDelRequerimiento(): JsonSchema {
  return z.toJSONSchema(RequerimientoMotorSchema) as JsonSchema;
}
