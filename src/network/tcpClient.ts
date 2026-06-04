import net from 'net';
import { NODOS, PUERTO_TCP, obtenerConfiguracionNodoActual } from '../config';
import relojLocal from '../virtualClock';
import { enviarLogUI, notificarHistorialUI, notificarPantallaUI } from '../web/app';

let clienteSocket: net.Socket | null = null;
let reconectarInterval: NodeJS.Timeout | null = null;
const configNodo = obtenerConfiguracionNodoActual();

// Estado del algoritmo en el esclavo
export let pantallaActivaEsclavo: 'tab-lamport' | 'tab-cristian' | 'tab-berkeley' = 'tab-lamport';
export let algoritmoActivoEsclavo = {
  cristian: false,
  lamport: false,
  berkeley: false
};

// Estado de la cirugía en el esclavo
export let cirugiaActivaLocal: boolean = true;

// Reloj lógico de Lamport local
export let relojLamport = 0;

export function incrementarRelojLamport() {
  relojLamport++;
  return relojLamport;
}

export function sincronizarRelojLamport(tiempoMensaje: number) {
  relojLamport = Math.max(relojLamport, tiempoMensaje) + 1;
  return relojLamport;
}

export function conectarAlMaestro() {
  if (clienteSocket) {
    clienteSocket.destroy();
  }

  const maestroIp = NODOS.maestro.ip;
  console.log(`[TCP Cliente] Conectando al Maestro en ${maestroIp}:${PUERTO_TCP}...`);

  // Si estamos en localhost simulado, conectamos a 127.0.0.1
  const targetIp = configNodo.ip === '127.0.0.1' ? '127.0.0.1' : maestroIp;

  clienteSocket = net.connect({ host: targetIp, port: PUERTO_TCP }, () => {
    console.log('[TCP Cliente] Conectado exitosamente al Maestro');
    enviarLogUI('Conexión Red', 'Conexión establecida con el nodo Maestro', 'success');

    if (reconectarInterval) {
      clearInterval(reconectarInterval);
      reconectarInterval = null;
    }

    // Registrarse inmediatamente
    enviarMensajeTCPAlMaestro({
      type: 'REGISTRO_ESCLAVO',
      payload: { id: configNodo.id }
    });
  });

  clienteSocket.on('data', (data) => {
    try {
      const mensajes = data.toString().split('\n').filter(msg => msg.trim());

      for (const rawMsg of mensajes) {
        const mensaje = JSON.parse(rawMsg);
        
        switch (mensaje.type) {
          case 'PING': {
            enviarMensajeTCPAlMaestro({ type: 'PONG', payload: {} });
            break;
          }

          case 'DESFASAR_ORDEN': {
            const desfaseMs = relojLocal.desfasarAleatoriamente();
            const min = (desfaseMs / 60000).toFixed(2);
            enviarLogUI(
              'Desfase Reloj', 
              `Desfase aleatorio aplicado: ${min} minutos (${desfaseMs > 0 ? '+' : ''}${Math.round(desfaseMs / 1000)}s)`, 
              'warn'
            );
            break;
          }

          case 'CAMBIO_ALGORITMO': {
            algoritmoActivoEsclavo = mensaje.payload;
            console.log(`[TCP Cliente] Algoritmo cambiado: Cristian=${algoritmoActivoEsclavo.cristian}, Lamport=${algoritmoActivoEsclavo.lamport}, Berkeley=${algoritmoActivoEsclavo.berkeley}`);
            enviarLogUI(
              'Algoritmo Activo', 
              `El maestro configuró los algoritmos: Cristian=${algoritmoActivoEsclavo.cristian}, Lamport=${algoritmoActivoEsclavo.lamport}, Berkeley=${algoritmoActivoEsclavo.berkeley}`, 
              'info'
            );
            break;
          }

          case 'CRISTIAN_RES': {
            // Recibido del maestro para sincronizar reloj
            const tServer = mensaje.payload.tServer;
            const tClienteReq = mensaje.payload.tCliente;
            const tClienteRes = relojLocal.getTime();
            
            // RTT = tiempo de recepción - tiempo de envío
            const RTT = tClienteRes - tClienteReq;
            // Hora sincronizada = hora de servidor + RTT / 2
            const horaSincronizada = tServer + (RTT / 2);
            // Ajuste a aplicar = hora sincronizada - hora local actual
            const ajuste = horaSincronizada - relojLocal.getTime();
            
            relojLocal.adjust(ajuste);
            console.log(`[Cristian] Sincronización exitosa. RTT = ${RTT}ms, Ajuste = ${Math.round(ajuste)}ms`);
            enviarLogUI(
              'Sincronización Cristian', 
              `Sincronizado con Maestro. RTT: ${RTT}ms. Ajuste: ${ajuste > 0 ? '+' : ''}${Math.round(ajuste)}ms. Reloj virtual ajustado.`, 
              'success'
            );
            break;
          }

          case 'SET_TIME': {
            try {
              const { targetTime, targetId } = mensaje.payload || {};
              // Si el mensaje tiene targetId y no es para este nodo, ignoramos
              if (targetId && targetId !== 'todos' && targetId !== configNodo.id) break;

              if (typeof targetTime === 'number') {
                const ajuste = targetTime - relojLocal.getTime();
                relojLocal.adjust(ajuste);
                enviarLogUI(
                  'Ajuste Hora',
                  `Ajuste aplicado: ${ajuste > 0 ? '+' : ''}${Math.round(ajuste)}ms`,
                  'success'
                );
              }
            } catch (err) {
              console.error('[TCP Cliente] Error procesando SET_TIME:', err);
            }
            break;
          }

          case 'CAMBIO_PANTALLA': {
            const screen = mensaje.payload?.screen;
            if (screen === 'tab-lamport' || screen === 'tab-cristian' || screen === 'tab-berkeley') {
              pantallaActivaEsclavo = screen;
              notificarPantallaUI(screen);
            }
            break;
          }

          case 'ACTUALIZAR_HISTORIAL': {
            // El maestro propaga el historial del editor de código
            notificarHistorialUI(mensaje.payload);
            break;
          }

          case 'TERMINAR_CIRUGIA': {
            cirugiaActivaLocal = false;
            enviarLogUI('Cirugía', 'El maestro ha finalizado la cirugía. Deteniendo generación de eventos.', 'warn');
            break;
          }

          case 'INICIAR_CIRUGIA': {
            cirugiaActivaLocal = true;
            enviarLogUI('Cirugía', 'Nueva cirugía iniciada por el maestro.', 'info');
            break;
          }
        }
      }
    } catch (error) {
      console.error('[TCP Cliente] Error procesando mensaje del maestro:', error);
    }
  });

  clienteSocket.on('close', () => {
    console.warn('[TCP Cliente] Conexión cerrada con el Maestro. Iniciando reconexión...');
    enviarLogUI('Conexión Red', 'Conexión perdida con el nodo Maestro. Intentando reconectar...', 'error');
    iniciarReconexion();
  });

  clienteSocket.on('error', (err) => {
    console.error('[TCP Cliente] Error en socket:', err.message);
  });
}

function iniciarReconexion() {
  if (reconectarInterval) return;
  reconectarInterval = setInterval(() => {
    conectarAlMaestro();
  }, 3000);
}

export function enviarMensajeTCPAlMaestro(msg: { type: string; payload: any }) {
  if (clienteSocket && !clienteSocket.destroyed) {
    clienteSocket.write(JSON.stringify(msg) + '\n');
  }
}
