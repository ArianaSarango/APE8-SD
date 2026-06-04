import VectorClock, { type EventoBD, relojVectorLocal } from '../algorithms/vectorClock';

class SimulatedDB {
  private store: Map<string, string> = new Map();
  private historial: EventoBD[] = [];

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }

  getKeys(): string[] {
    return Array.from(this.store.keys());
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }

  registrarEvento(tipo: 'lectura' | 'escritura', clave: string, valor: string | null, nodoId: string, virtualTime: number): EventoBD {
    relojVectorLocal.increment(nodoId);
    const evento: EventoBD = {
      id: Math.random().toString(36).substr(2, 9),
      tipo,
      clave,
      valor,
      nodoOrigen: nodoId,
      virtualTime,
      vectorClock: relojVectorLocal.getClock()
    };
    this.historial.push(evento);
    return evento;
  }

  aplicarEventoRemoto(evento: EventoBD, nodoId: string): void {
    relojVectorLocal.sincronizar(evento.vectorClock);
    relojVectorLocal.increment(nodoId);
    if (evento.tipo === 'escritura' && evento.valor !== null) {
      this.store.set(evento.clave, evento.valor);
    }
    this.historial.push({ ...evento, vectorClock: relojVectorLocal.getClock() });
  }

  getHistorial(): EventoBD[] {
    return [...this.historial];
  }

  getHistorialFisico(): EventoBD[] {
    return VectorClock.ordenarPorTiempoFisico(this.historial);
  }

  getHistorialVectorClock(): EventoBD[] {
    return VectorClock.ordenarPorVectorClock(this.historial);
  }

  reset(): void {
    this.store.clear();
    this.historial = [];
  }
}

export const dbSimuladaLocal = new SimulatedDB();

export default SimulatedDB;
