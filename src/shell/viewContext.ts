// Generaliza el patron AbortController + { signal } que ya usa mentionAutocomplete.ts
// (agregar listeners de document/window sin tener que desengancharlos a mano uno por uno)
// y le suma un canal para lo que un AbortSignal no cubre: canales realtime, setInterval,
// observers. El router crea un ViewContext por vista montada y llama dispose() al desmontar.
export interface ViewContext {
  readonly signal: AbortSignal;
  addCleanup(fn: () => void): void;
  dispose(): void;
}

export function createViewContext(): ViewContext {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  let disposed = false;

  return {
    signal: controller.signal,
    addCleanup(fn) {
      if (disposed) {
        fn();
        return;
      }
      cleanups.push(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      // orden inverso: lo ultimo registrado (mas "interno") se limpia primero
      while (cleanups.length) {
        try {
          cleanups.pop()!();
        } catch {
          // una limpieza rota no debe impedir que se ejecuten las demas
        }
      }
    },
  };
}

/** Azucar para el caso mas comun: un setInterval que hay que limpiar al desmontar la vista. */
export function trackedInterval(ctx: ViewContext, fn: () => void, ms: number): ReturnType<typeof setInterval> {
  const id = setInterval(fn, ms);
  ctx.addCleanup(() => clearInterval(id));
  return id;
}
