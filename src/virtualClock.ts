export class VirtualClock {
  private horaVirtualInicial: number;
  private tiempoMonotonoInicial: number;
  private offset: number; // en milisegundos

  constructor() {
    this.horaVirtualInicial = Date.now();
    // performance.now() provee una marca de tiempo monótona en milisegundos de alta resolución
    this.tiempoMonotonoInicial = performance.now();
    this.offset = 0;
  }

  /**
   * Obtiene la hora actual del reloj virtual en milisegundos
   */
  getTime(): number {
    const tiempoTranscurrido = performance.now() - this.tiempoMonotonoInicial;
    return this.horaVirtualInicial + tiempoTranscurrido + this.offset;
  }

  /**
   * Obtiene un objeto Date que representa la hora virtual
   */
  getDate(): Date {
    return new Date(this.getTime());
  }

  /**
   * Obtiene el offset actual en milisegundos
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Establece un offset específico directamente
   * @param offset en milisegundos
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Ajusta el reloj virtual sumando/restando un delta de milisegundos
   * @param delta en milisegundos (positivo o negativo)
   */
  adjust(delta: number): void {
    this.offset += delta;
  }

  /**
   * Aplica un desfase aleatorio para simular desincronización
   * @param minMinutos Mínimo de minutos de desfase
   * @param maxMinutos Máximo de minutos de desfase
   */
  desfasarAleatoriamente(minMinutos: number = 5, maxMinutos: number = 10): number {
    // Generar un número aleatorio de minutos entre minMinutos y maxMinutos
    const minutos = minMinutos + Math.random() * (maxMinutos - minMinutos);
    // Decidir aleatoriamente si es antes (-) o después (+)
    const signo = Math.random() < 0.5 ? -1 : 1;
    const desfaseMs = signo * minutos * 60 * 1000;
    
    this.adjust(desfaseMs);
    return desfaseMs;
  }

  /**
   * Reinicia el offset a 0
   */
  reset(): void {
    this.offset = 0;
    this.horaVirtualInicial = Date.now();
    this.tiempoMonotonoInicial = performance.now();
  }
}

// Exportamos una instancia única por nodo para que sea compartida en toda la aplicación
export const relojLocal = new VirtualClock();
export default relojLocal;
