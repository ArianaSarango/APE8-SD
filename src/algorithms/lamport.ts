export interface CambioCodigo {
  id: string;
  author: string;
  content: string;
  virtualTime: number; // Tiempo del reloj virtual local del nodo
  logicalTime: number; // Tiempo del reloj lógico de Lamport
  nodoId: string;
}

class LamportClock {
  private count: number = 0;

  getTime(): number {
    return this.count;
  }

  increment(): number {
    this.count++;
    return this.count;
  }

  sincronizar(tiempoMensaje: number): number {
    this.count = Math.max(this.count, tiempoMensaje) + 1;
    return this.count;
  }

  reset(): void {
    this.count = 0;
  }
}

export const relojLamportLocal = new LamportClock();

/**
 * Ordena los eventos de código por tiempo físico virtual (sujeto a desincronización)
 */
export function ordenarPorTiempoFisico(cambios: CambioCodigo[]): CambioCodigo[] {
  return [...cambios].sort((a, b) => a.virtualTime - b.virtualTime);
}

/**
 * Ordena los eventos de código por el reloj de Lamport
 * Criterio: Menor tiempo lógico primero. A igual tiempo lógico, desempata alfabéticamente por ID de nodo.
 */
export function ordenarPorLamport(cambios: CambioCodigo[]): CambioCodigo[] {
  return [...cambios].sort((a, b) => {
    if (a.logicalTime === b.logicalTime) {
      return a.nodoId.localeCompare(b.nodoId);
    }
    return a.logicalTime - b.logicalTime;
  });
}
