export interface EventoBD {
  id: string;
  tipo: 'lectura' | 'escritura';
  clave: string;
  valor: string | null;
  nodoOrigen: string;
  virtualTime: number;
  vectorClock: Record<string, number>;
}

export type ComparacionVC = 'before' | 'after' | 'concurrent' | 'equal';

class VectorClock {
  private clock: Record<string, number> = {};

  getClock(): Record<string, number> {
    return { ...this.clock };
  }

  increment(nodeId: string): void {
    this.clock[nodeId] = (this.clock[nodeId] || 0) + 1;
  }

  sincronizar(otherClock: Record<string, number>): void {
    const todasLasClaves = new Set([...Object.keys(this.clock), ...Object.keys(otherClock)]);
    for (const key of todasLasClaves) {
      this.clock[key] = Math.max(this.clock[key] || 0, otherClock[key] || 0);
    }
  }

  reset(): void {
    this.clock = {};
  }

  static comparar(a: Record<string, number>, b: Record<string, number>): ComparacionVC {
    let aMenorOIgual = true;
    let bMenorOIgual = true;

    const todasLasClaves = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const key of todasLasClaves) {
      const aVal = a[key] || 0;
      const bVal = b[key] || 0;
      if (aVal > bVal) bMenorOIgual = false;
      if (bVal > aVal) aMenorOIgual = false;
    }

    if (aMenorOIgual && bMenorOIgual) return 'equal';
    if (aMenorOIgual) return 'before';
    if (bMenorOIgual) return 'after';
    return 'concurrent';
  }

  static ordenarPorVectorClock(eventos: EventoBD[]): EventoBD[] {
    return [...eventos].sort((a, b) => {
      const cmp = VectorClock.comparar(a.vectorClock, b.vectorClock);
      if (cmp === 'before') return -1;
      if (cmp === 'after') return 1;
      const sumaA = Object.values(a.vectorClock).reduce((s, v) => s + v, 0);
      const sumaB = Object.values(b.vectorClock).reduce((s, v) => s + v, 0);
      if (sumaA !== sumaB) return sumaA - sumaB;
      return a.nodoOrigen.localeCompare(b.nodoOrigen);
    });
  }

  static ordenarPorTiempoFisico(eventos: EventoBD[]): EventoBD[] {
    return [...eventos].sort((a, b) => a.virtualTime - b.virtualTime);
  }

  static relojAString(clock: Record<string, number>): string {
    const claves = Object.keys(clock).sort();
    return `(${claves.map(k => `${k}:${clock[k]}`).join(', ')})`;
  }
}

export const relojVectorLocal = new VectorClock();

export default VectorClock;
