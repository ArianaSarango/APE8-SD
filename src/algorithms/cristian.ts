import { enviarMensajeTCPAlMaestro, algoritmoActivoEsclavo } from '../network/tcpClient';
import relojLocal from '../virtualClock';

let cristianInterval: NodeJS.Timeout | null = null;
const INTERVALO_SINC_MS = 5000; // Sincronizar cada 5 segundos

/**
 * Inicia el temporizador de sincronización periódica de Cristian (ejecutado por los esclavos)
 */
export function iniciarSincronizacionCristian() {
  if (cristianInterval) return;

  console.log('[Cristian] Iniciando servicio periódico de sincronización Cristian');
  
  cristianInterval = setInterval(() => {
    // Solo enviamos peticiones si el algoritmo de Cristian está activo
    if (algoritmoActivoEsclavo.cristian) {
      const clientTime = relojLocal.getTime();
      console.log('[Cristian] Enviando petición de tiempo al maestro...');
      enviarMensajeTCPAlMaestro({
        type: 'CRISTIAN_REQ',
        payload: { clientTime }
      });
    }
  }, INTERVALO_SINC_MS);
}

/**
 * Detiene el servicio de Cristian
 */
export function detenerSincronizacionCristian() {
  if (cristianInterval) {
    clearInterval(cristianInterval);
    cristianInterval = null;
    console.log('[Cristian] Servicio de Cristian detenido.');
  }
}
