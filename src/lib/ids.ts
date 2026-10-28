/** UUID v4: el turnId que valida el servidor y el id de cada mensaje. */
export const nuevoId = (): string => crypto.randomUUID();

export const ahoraIso = (): string => new Date().toISOString();
