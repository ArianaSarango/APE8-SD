import { NODOS, obtenerConfiguracionNodoActual } from '../config';
import { enviarMensajeUDP, obtenerPuertoUDPEsclavo } from '../network/udpServer';
import relojLocal from '../virtualClock';
import { enviarLogUI, notificarDronesUI } from '../web/app';

let berkeleyInterval: NodeJS.Timeout | null = null;
const INTERVALO_BERKELEY_MS = 6000; // Sincronización Berkeley cada 6 segundos

// Estructura para registrar las respuestas recibidas en el ciclo actual
interface BerkeleyResponse {
  nodoId: string;
  ip: string;
  virtualTime: number;
}

let respuestasRecibidas: BerkeleyResponse[] = [];
let cicloActivo = false;
const configNodo = obtenerConfiguracionNodoActual();

// Simulación de la posición y estado de drones en el aire (coordinación temporal)
export interface DronStatus {
  id: string;
  x: number;
  y: number;
  ip: string;
  fase: number; // Fase de la órbita/patrón de escaneo del dron
  alertaColision: boolean;
  virtualTime: number;
  offset: number; // Desfase del reloj del dron respecto al maestro (se actualiza en cada ciclo Berkeley)
}

export const estadoDrones: Map<string, DronStatus> = new Map([
  ['1', { id: '1', x: 200, y: 150, ip: NODOS['1'].ip, fase: 0, alertaColision: false, virtualTime: 0, offset: 0 }],
  ['2', { id: '2', x: 400, y: 150, ip: NODOS['2'].ip, fase: 90, alertaColision: false, virtualTime: 0, offset: 0 }],
  ['3', { id: '3', x: 200, y: 350, ip: NODOS['3'].ip, fase: 180, alertaColision: false, virtualTime: 0, offset: 0 }],
  ['4', { id: '4', x: 400, y: 350, ip: NODOS['4'].ip, fase: 270, alertaColision: false, virtualTime: 0, offset: 0 }],
]);

/**
 * Inicia el proceso de Berkeley periódico (solo en el Maestro)
 */
export function iniciarBerkeley() {
  if (berkeleyInterval) return;

  console.log('[Berkeley] Iniciando servicio periódico de Berkeley (Maestro)');
  enviarLogUI('Servicio Berkeley', 'Iniciando sincronización de Berkeley periódica', 'info');

  berkeleyInterval = setInterval(() => {
    iniciarCicloSincronizacionBerkeley();
  }, INTERVALO_BERKELEY_MS);
}

/**
 * Detiene el proceso de Berkeley
 */
export function detenerBerkeley() {
  if (berkeleyInterval) {
    clearInterval(berkeleyInterval);
    berkeleyInterval = null;
    console.log('[Berkeley] Servicio de Berkeley detenido.');
  }
}

/**
 * Inicia un ciclo individual de solicitud de tiempo Berkeley
 */
function iniciarCicloSincronizacionBerkeley() {
  if (cicloActivo) return;
  
  cicloActivo = true;
  respuestasRecibidas = [];

  console.log('[Berkeley] Solicitando tiempos a todos los esclavos por UDP...');
  enviarLogUI('Algoritmo Berkeley', 'Iniciando ciclo: Consultando relojes virtuales a los esclavos', 'info');

  // Enviar BERKELEY_POLL a todos los esclavos
  Object.values(NODOS).forEach((nodo) => {
    if (nodo.rol === 'esclavo') {
      const port = obtenerPuertoUDPEsclavo(nodo.id);
      const targetIp = configNodo.ip === '127.0.0.1' ? '127.0.0.1' : nodo.ip;
      
      enviarMensajeUDP(
        { type: 'BERKELEY_POLL', payload: {} },
        port,
        targetIp
      );
    }
  });

  // Ventana de recolección de respuestas (1.5 segundos)
  setTimeout(() => {
    calcularYDistribuirAjustesBerkeley();
  }, 1500);
}

/**
 * Registra la respuesta de tiempo enviada por un esclavo
 */
export function registrarTiempoEsclavoBerkeley(esclavoId: string, virtualTime: number) {
  if (!cicloActivo) return;

  // Evitar duplicados del mismo esclavo en el mismo ciclo
  if (respuestasRecibidas.some((r) => r.nodoId === esclavoId)) return;

  const nodoConfig = NODOS[esclavoId];
  if (nodoConfig) {
    respuestasRecibidas.push({
      nodoId: esclavoId,
      ip: nodoConfig.ip,
      virtualTime
    });

    // Calcular y almacenar el offset del dron respecto al maestro
    const tMaestro = relojLocal.getTime();
    const dron = estadoDrones.get(esclavoId);
    if (dron) {
      dron.virtualTime = virtualTime;
      dron.offset = virtualTime - tMaestro;
    }
  }
}

/**
 * Procesa los tiempos recibidos, descarta atípicos, calcula el promedio y envía las correcciones
 */
function calcularYDistribuirAjustesBerkeley() {
  cicloActivo = false;
  const tMaestro = relojLocal.getTime();
  
  // Agregar el tiempo del maestro como referencia (desfase = 0)
  const tiemposParaSinc = [{ nodoId: 'maestro', virtualTime: tMaestro, desfase: 0 }];
  
  // Calcular desfases de los esclavos respecto al maestro
  respuestasRecibidas.forEach((resp) => {
    const desfase = resp.virtualTime - tMaestro;
    tiemposParaSinc.push({
      nodoId: resp.nodoId,
      virtualTime: resp.virtualTime,
      desfase
    });
  });

  console.log('[Berkeley] Tiempos recibidos:', tiemposParaSinc.map(t => `${t.nodoId}: desfase=${t.desfase}ms`));

  // Berkeley clásico: Descartar tiempos cuya diferencia con los demás sea excesiva
  // En nuestro caso, al ser 5 nodos, filtramos si un desfase difiere drásticamente del promedio preliminar.
  // Filtraremos desfases mayores a 30 minutos (1,800,000 ms) como outliers.
  const desfasesValidos = tiemposParaSinc.filter(t => Math.abs(t.desfase) < 1800000);

  if (desfasesValidos.length === 0) {
    console.warn('[Berkeley] No se obtuvieron desfases válidos para sincronizar.');
    return;
  }

  // Calcular el promedio aritmético de los desfases válidos
  const sumaDesfases = desfasesValidos.reduce((acc, t) => acc + t.desfase, 0);
  const promedioDesfase = sumaDesfases / desfasesValidos.length;

  console.log(`[Berkeley] Promedio de desfase calculado: ${Math.round(promedioDesfase)}ms`);
  enviarLogUI(
    'Algoritmo Berkeley', 
    `Respuestas recibidas: ${desfasesValidos.length - 1} esclavos. Promedio de desfase con respecto al Maestro: ${Math.round(promedioDesfase)}ms`, 
    'info'
  );

  // Aplicar ajuste al propio Maestro
  relojLocal.adjust(promedioDesfase);
  enviarLogUI(
    'Sincronización Berkeley',
    `Maestro ajustado en ${promedioDesfase > 0 ? '+' : ''}${Math.round(promedioDesfase)}ms por Berkeley.`,
    'success'
  );

  // Enviar correcciones individuales a los esclavos
  desfasesValidos.forEach((t) => {
    if (t.nodoId === 'maestro') return;

    // Corrección para el esclavo = Promedio - Desfase del esclavo
    const correccion = promedioDesfase - t.desfase;
    const esclavoConfig = NODOS[t.nodoId];

    if (esclavoConfig) {
      const port = obtenerPuertoUDPEsclavo(t.nodoId);
      const targetIp = configNodo.ip === '127.0.0.1' ? '127.0.0.1' : esclavoConfig.ip;
      
      console.log(`[Berkeley] Enviando ajuste a esclavo ${t.nodoId}: ${Math.round(correccion)}ms a ${targetIp}:${port}`);
      enviarMensajeUDP(
        {
          type: 'BERKELEY_ADJUST',
          payload: { adjustment: correccion }
        },
        port,
        targetIp
      );
    }
  });

  enviarLogUI(
    'Sincronización Berkeley',
    `Correcciones de Berkeley enviadas a todos los esclavos activos vía UDP.`,
    'success'
  );

  actualizarSimulacionDronesUI();
}

/**
 * Lógica para simular el movimiento orbital 2D de los drones y detectar colisiones temporales
 */
export function actualizarSimulacionDronesUI() {
  const centroX = 300;
  const centroY = 250;
  const radio = 100;
  const dronesList: any[] = [];
  const tiempoActual = Date.now();

  estadoDrones.forEach((dron) => {
    // Usar el tiempo continuo del maestro + el offset conocido del dron (actualizado en cada ciclo Berkeley).
    // Si el dron aún no tiene offset (no ha respondido), se usa un desfase sintético basado en su ID.
    const relojUsar = relojLocal.getTime() + (dron.offset !== 0 ? dron.offset : (parseInt(dron.id) * 300000));

    // La velocidad angular depende del tiempo de referencia de cada dron
    // Si están desfasados, la fase angular calculada será distinta,
    // lo que simulará que sus trayectorias se desfasan en el tiempo real
    const velocidadAngular = 0.0002; // radianes por milisegundo
    const angulo = (dron.fase * Math.PI / 180) + (relojUsar * velocidadAngular);

    // Calcular posición en órbita circular
    dron.x = Math.round(centroX + radio * Math.cos(angulo));
    dron.y = Math.round(centroY + radio * Math.sin(angulo));

    dronesList.push({
      id: dron.id,
      x: dron.x,
      y: dron.y,
      relojVirtual: relojUsar,
      alertaColision: false
    });
  });

  // Detección de colisiones (si dos drones están muy cerca en coordenadas reales del espacio físico)
  // Pero debido a la desincronización, la estación de control (maestro) evalúa las coordenadas 
  // reportadas basadas en tiempos desfasados. O en tiempo real físico, si sus relojes de sincronización 
  // de maniobra están desalineados, realizarán las maniobras en momentos inadecuados chocando.
  for (let i = 0; i < dronesList.length; i++) {
    for (let j = i + 1; j < dronesList.length; j++) {
      const dx = dronesList[i].x - dronesList[j].x;
      const dy = dronesList[i].y - dronesList[j].y;
      const distancia = Math.sqrt(dx * dx + dy * dy);

      // Si la distancia es menor a 40 píxeles, se enciende la alarma de colisión
      if (distancia < 50) {
        dronesList[i].alertaColision = true;
        dronesList[j].alertaColision = true;
      }
    }
  }

  // Notificar al dashboard web del maestro
  notificarDronesUI(dronesList);
}

// Bucle continuo para simular movimiento de drones y refrescar UI del maestro (30 fps aprox)
setInterval(() => {
  // Solo el maestro actualiza y dibuja los drones
  if (configNodo.rol === 'maestro') {
    // Si Berkeley no está activo, actualizamos con el tiempo local + desfase estático de simulación para que se vea desfasado
    actualizarSimulacionDronesUI();
  }
}, 100);
