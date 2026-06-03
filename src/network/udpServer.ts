import dgram from 'dgram';
import { PUERTO_UDP, obtenerConfiguracionNodoActual, NODOS } from '../config';
import relojLocal from '../virtualClock';
import { enviarLogUI } from '../web/app';

let socketUDP: dgram.Socket | null = null;
const configNodo = obtenerConfiguracionNodoActual();

// Obtiene el puerto de escucha UDP para este nodo (resuelve colisiones en localhost)
export function obtenerPuertoUDPEscucha(): number {
  if (configNodo.ip === '127.0.0.1') {
    if (configNodo.rol === 'maestro') return PUERTO_UDP;
    return PUERTO_UDP + parseInt(configNodo.id);
  }
  return PUERTO_UDP;
}

// Obtiene el puerto UDP del maestro al que los esclavos deben enviar mensajes
export function obtenerPuertoUDPMaestro(): number {
  return PUERTO_UDP;
}

// Obtiene el puerto UDP de un esclavo específico para que el maestro le envíe mensajes
export function obtenerPuertoUDPEsclavo(esclavoId: string): number {
  if (configNodo.ip === '127.0.0.1') {
    return PUERTO_UDP + parseInt(esclavoId);
  }
  return PUERTO_UDP;
}

export function inicializarServidorUDP(
  onBerkeleyPollReceived?: (rinfo: dgram.RemoteInfo) => void,
  onBerkeleyTimeReceived?: (esclavoId: string, virtualTime: number) => void,
  onBerkeleyAdjustReceived?: (adjustment: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    socketUDP = dgram.createSocket('udp4');
    const puerto = obtenerPuertoUDPEscucha();
    
    // Enlazar a la IP local (0.0.0.0 o la IP estática del nodo para escuchar en esa interfaz)
    const host = configNodo.ip === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0';

    socketUDP.on('message', (msg, rinfo) => {
      try {
        const mensaje = JSON.parse(msg.toString());
        
        switch (mensaje.type) {
          case 'BERKELEY_POLL': {
            if (configNodo.rol === 'esclavo' && onBerkeleyPollReceived) {
              onBerkeleyPollReceived(rinfo);
            }
            break;
          }

          case 'BERKELEY_TIME': {
            if (configNodo.rol === 'maestro' && onBerkeleyTimeReceived) {
              const { id, virtualTime } = mensaje.payload;
              onBerkeleyTimeReceived(id, virtualTime);
            }
            break;
          }

          case 'BERKELEY_ADJUST': {
            if (configNodo.rol === 'esclavo' && onBerkeleyAdjustReceived) {
              const { adjustment } = mensaje.payload;
              onBerkeleyAdjustReceived(adjustment);
            }
            break;
          }
        }
      } catch (error) {
        console.error('[UDP] Error parseando mensaje UDP:', error);
      }
    });

    socketUDP.on('listening', () => {
      const address = socketUDP!.address();
      console.log(`[UDP] Servidor UDP escuchando en ${address.address}:${address.port}`);
      resolve();
    });

    socketUDP.on('error', (err) => {
      console.error('[UDP] Error en el socket UDP:', err);
    });

    socketUDP.bind(puerto, host);
  });
}

// Envía un mensaje UDP a una dirección e IP específicas
export function enviarMensajeUDP(
  msg: { type: string; payload: any },
  port: number,
  ip: string
) {
  if (!socketUDP) {
    console.error('[UDP] El socket no está inicializado.');
    return;
  }
  const buffer = Buffer.from(JSON.stringify(msg));
  socketUDP.send(buffer, 0, buffer.length, port, ip, (err) => {
    if (err) {
      console.error(`[UDP] Error al enviar mensaje a ${ip}:${port}:`, err);
    }
  });
}
