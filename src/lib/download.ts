/**
 * Guardar un archivo (que ya tenemos como Blob en memoria) en el dispositivo del usuario.
 *
 * En móvil -- sobre todo iOS, donde <a download> históricamente no baja nada y termina
 * abriendo la imagen en otra pestaña -- se intenta primero el panel nativo de compartir con
 * el archivo adjunto (navigator.share), que ofrece "Guardar en Fotos" / "Guardar en Archivos".
 * Es lo que la gente espera de "descargar una foto" en el teléfono. Si el navegador no
 * soporta compartir archivos (la mayoría de los de escritorio), o el usuario cierra el panel,
 * se cae al <a download> de siempre con un object URL.
 *
 * Devuelve true si se disparó una descarga/compartir, false si el usuario canceló el panel
 * nativo (para no mostrarle un "listo" que no pasó).
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      // AbortError = cerró el panel a propósito; no caemos al <a download> en ese caso.
      if ((err as Error)?.name === "AbortError") return false;
      // Cualquier otro error (NotAllowedError, etc.): seguimos con el fallback de abajo.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar enseguida corta la descarga en algunos navegadores; se le da margen.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Extensión de archivo para una imagen según su MIME type (jpg por defecto). */
export function imageExtForType(type: string | undefined): "png" | "webp" | "jpg" {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}
