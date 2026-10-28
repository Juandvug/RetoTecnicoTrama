import { z } from "zod";

// Contrato de POST /api/access (ARCHITECTURE §7.2): 204 con Set-Cookie si el
// código es correcto, 401 si no, 429 si se superaron los intentos.
export const AccesoRequestSchema = z.strictObject({
  codigo: z.string().min(1).max(200),
});

export type AccesoRequest = z.infer<typeof AccesoRequestSchema>;
