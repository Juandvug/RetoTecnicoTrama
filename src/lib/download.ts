/** Descarga un texto como archivo, sin pasar por el servidor. */
export function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(
    new Blob([contenido], { type: `${tipo};charset=utf-8` }),
  );
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Se libera después de que el navegador tomó el enlace.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
