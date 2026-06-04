import net from 'net';
import { PUERTO_TCP, NodoConfig, NODOS } from '../config';
import relojLocal from '../virtualClock';
import { enviarLogUI, actualizarNodosUI, notificarHistorialUI, notificarEventosClinicosUI, notificarFinCirugiaUI, notificarNuevaCirugiaUI, notificarLecturasSensorUI, notificarDBUI } from '../web/app';
import { guardarEventoLamport } from '../storage/lamportDb';
import { type EventoBD, relojVectorLocal } from '../algorithms/vectorClock';
import { dbSimuladaLocal } from '../storage/simulatedDb';

// Interfaces internas
export interface EsclavoConectado {
  id: string;
  ip: string;
  socket: net.Socket;
  salud: 'activo' | 'inactivo';
  ultimoPing: number;
}

// Historial del Gestor de Versiones (Lamport)
export interface EventoCodigo {
  id: string;
  author: string;
  content: string;
  virtualTime: number; // Tiempo del reloj virtual del nodo
  logicalTime: number; // Tiempo lógico de Lamport
  nodoId: string;
}

// Registro de eventos clínicos (Cristian)
export interface EventoClinico {
  timestamp: number;   // Reloj local del esclavo (puede estar desfasado)
  serverTime: number;  // Hora del maestro al recibir el evento (referencia sincronizada)
  tipoMaquina: string;
  evento: string;
  nodoId: string;
}

export const esclavosConectados: Map<string, EsclavoConectado> = new Map();
export const historialCodigo: EventoCodigo[] = [];
export const eventosClinicos: EventoClinico[] = [];
export const historialBD: EventoBD[] = [];
export let estadoBDGlobal: Record<string, string> = {};

let pantallaActiva: 'tab-lamport' | 'tab-cristian' | 'tab-berkeley' | 'tab-vectorclock' = 'tab-lamport';

let serverTCP: net.Server | null = null;

// Algoritmo activo global
export let algoritmoActivo: {
  cristian: boolean;
  lamport: boolean;
  berkeley: boolean;
} = {
  cristian: false,
  lamport: false,
  berkeley: false
};

export function inicializarServidorTCP(): Promise<void> {
  return new Promise((resolve) => {
    serverTCP = net.createServer((socket) => {
      let esclavoId: string | null = null;
      const remoteAddress = socket.remoteAddress?.replace('::ffff:', '') || '';

      console.log(`[TCP] Nueva conexión establecida desde ${remoteAddress}`);

      socket.on('data', (data) => {
        try {
          // El protocolo puede mandar múltiples JSON en un buffer si hay congestión.
          // Separamos por llaves o por saltos de línea si implementamos delimitadores.
          // Usaremos un delimitador estándar como \n para separar los mensajes.
          const mensajes = data.toString().split('\n').filter(msg => msg.trim());

          for (const rawMsg of mensajes) {
            const mensaje = JSON.parse(rawMsg);
            
            switch (mensaje.type) {
              case 'REGISTRO_ESCLAVO': {
                esclavoId = mensaje.payload.id;
                if (esclavoId) {
                  esclavosConectados.set(esclavoId, {
                    id: esclavoId,
                    ip: remoteAddress,
                    socket: socket,
                    salud: 'activo',
                    ultimoPing: Date.now()
                  });
                  console.log(`[TCP] Esclavo ${esclavoId} registrado exitosamente con IP ${remoteAddress}`);
                  enviarLogUI('Conexión Esclavo', `Esclavo ${esclavoId} se ha conectado desde la IP ${remoteAddress}`, 'success');
                  actualizarEstadoEsclavosUI();
                  
                  // Notificarle el algoritmo activo actual al conectarse
                  enviarMensajeTCP(socket, {
                    type: 'CAMBIO_ALGORITMO',
                    payload: algoritmoActivo
                  });

                  enviarMensajeTCP(socket, {
                    type: 'CAMBIO_PANTALLA',
                    payload: { screen: pantallaActiva }
                  });

                  enviarMensajeTCP(socket, {
                    type: 'ACTUALIZAR_HISTORIAL',
                    payload: obtenerHistorialesOrdenados()
                  });
                }
                break;
              }

              case 'CRISTIAN_REQ': {
                // Cristian requiere devolver la hora actual del servidor inmediatamente
                const tServer = relojLocal.getTime();
                enviarMensajeTCP(socket, {
                  type: 'CRISTIAN_RES',
                  payload: {
                    tServer,
                    tCliente: mensaje.payload.clientTime
                  }
                });
                break;
              }

              case 'EVENTO_CODIGO': {
                const { author, content, logicalTime, virtualTime } = mensaje.payload;
                const nuevoEvento: EventoCodigo = {
                  id: Math.random().toString(36).substr(2, 9),
                  author,
                  content,
                  virtualTime,
                  logicalTime,
                  nodoId: esclavoId || 'desconocido'
                };
                historialCodigo.push(nuevoEvento);
                guardarEventoLamport(nuevoEvento);
                console.log(`[Lamport] Nuevo cambio de código recibido del nodo ${esclavoId}: L=${logicalTime}`);
                enviarLogUI(
                  'Cambio Código (Lamport)', 
                  `Esclavo ${esclavoId} editó el archivo. Tiempo virtual: ${new Date(virtualTime).toLocaleTimeString([], { hour12: false })}, Tiempo Lamport: ${logicalTime}`,
                  'info'
                );
                
                // Propagar historial actualizado a la UI y a todos los esclavos para sincronizar la vista del editor
                notificarHistorialUI(obtenerHistorialesOrdenados());
                propagarHistorialAEsclavos();
                break;
              }

              case 'EVENTO_CLINICO': {
                const { tipoMaquina, evento, timestamp } = mensaje.payload;
                const nuevoEvento: EventoClinico = {
                  timestamp,
                  serverTime: relojLocal.getTime(),
                  tipoMaquina,
                  evento,
                  nodoId: esclavoId || 'desconocido'
                };
                eventosClinicos.push(nuevoEvento);
                console.log(`[Cristian] Evento clínico de ${tipoMaquina} (Esclavo ${esclavoId}): T=${new Date(timestamp).toLocaleTimeString([], { hour12: false })}, Svr=${new Date(nuevoEvento.serverTime).toLocaleTimeString([], { hour12: false })}`);
                enviarLogUI(
                  'Evento Quirófano',
                  `Máquina ${tipoMaquina} (Nodo ${esclavoId}) registró: "${evento}". Tiempo local: ${new Date(timestamp).toLocaleTimeString([], { hour12: false })}, Maestro: ${new Date(nuevoEvento.serverTime).toLocaleTimeString([], { hour12: false })}`,
                  'info'
                );
                
                if (cirugiaActiva) {
                  const eventosOrdenados = [...eventosClinicos].sort((a, b) => a.timestamp - b.timestamp);
                  notificarEventosClinicosUI(eventosOrdenados);
                }
                break;
              }

              case 'SENSOR_READING': {
                notificarLecturasSensorUI({
                  nodoId: mensaje.payload.nodoId,
                  bpm: mensaje.payload.bpm,
                  presion: mensaje.payload.presion,
                  sistole: mensaje.payload.sistole,
                  diastole: mensaje.payload.diastole,
                  tasa: mensaje.payload.tasa,
                  nivelLiquido: mensaje.payload.nivelLiquido
                });
                break;
              }

              case 'DB_WRITE': {
                const { clave, valor, virtualTime, vectorClock: vcOrigen } = mensaje.payload;
                const nodoOrigen = esclavoId || 'desconocido';

                // Sincronizar VC del maestro con el del esclavo
                relojVectorLocal.sincronizar(vcOrigen);

                // Registrar el evento (incrementa VC del maestro y guarda en historial)
                const timestampMaestro = relojLocal.getTime();
                dbSimuladaLocal.set(clave, valor);
                estadoBDGlobal = dbSimuladaLocal.getAll();
                const eventoMaestro = dbSimuladaLocal.registrarEvento('escritura', clave, valor, 'maestro', timestampMaestro);
                historialBD.push(eventoMaestro);

                // El evento propagado usa el VC ORIGINAL del esclavo (directo entre esclavos)
                const eventoRelay: EventoBD = {
                  id: Math.random().toString(36).substr(2, 9),
                  tipo: 'escritura',
                  clave,
                  valor,
                  nodoOrigen,
                  virtualTime,
                  vectorClock: { ...vcOrigen }
                };

                console.log(`[VectorClock] Escritura BD de ${nodoOrigen}: ${clave}=${valor}`);
                enviarLogUI('BD Escritura', `Nodo ${nodoOrigen} escribió ${clave}=${valor}. VC maestro: ${JSON.stringify(eventoMaestro.vectorClock)}`, 'info');

                difundirComandoTCP('DB_WRITE_RELAY', {
                  evento: eventoRelay,
                  estadoDB: estadoBDGlobal
                });

                notificarDBUI({
                  estado: estadoBDGlobal,
                  historial: obtenerHistorialesBD()
                });
                break;
              }

              case 'DB_READ_REQ': {
                const { clave: claveRead } = mensaje.payload;
                const valorRead = dbSimuladaLocal.get(claveRead) ?? null;
                enviarMensajeTCP(socket, {
                  type: 'DB_READ_RES',
                  payload: { clave: claveRead, valor: valorRead }
                });
                break;
              }

              case 'PONG': {
                if (esclavoId) {
                  const esclavo = esclavosConectados.get(esclavoId);
                  if (esclavo) {
                    esclavo.salud = 'activo';
                    esclavo.ultimoPing = Date.now();
                    actualizarEstadoEsclavosUI();
                  }
                }
                break;
              }
            }
          }
        } catch (error) {
          console.error('[TCP] Error parseando datos del esclavo:', error);
        }
      });

      socket.on('close', () => {
        if (esclavoId) {
          esclavosConectados.delete(esclavoId);
          console.log(`[TCP] Esclavo ${esclavoId} desconectado`);
          enviarLogUI('Desconexión Esclavo', `Esclavo ${esclavoId} se ha desconectado`, 'warn');
          actualizarEstadoEsclavosUI();
        }
      });

      socket.on('error', (err) => {
        console.error(`[TCP] Error en socket del esclavo ${esclavoId}:`, err.message);
      });
    });

    serverTCP.listen(PUERTO_TCP, () => {
      console.log(`[TCP] Servidor de coordinación Maestro escuchando en puerto ${PUERTO_TCP}`);
      resolve();
    });
  });
}

// Función auxiliar para enviar un mensaje JSON delimitado por salto de línea
export function enviarMensajeTCP(socket: net.Socket, msg: { type: string; payload: any }) {
  if (socket && !socket.destroyed) {
    socket.write(JSON.stringify(msg) + '\n');
  }
}

// Envía una orden a todos los esclavos activos
export function difundirComandoTCP(type: string, payload: any) {
  esclavosConectados.forEach((esclavo) => {
    enviarMensajeTCP(esclavo.socket, { type, payload });
  });
}

export function establecerPantallaActiva(screen: 'tab-lamport' | 'tab-cristian' | 'tab-berkeley' | 'tab-vectorclock') {
  pantallaActiva = screen;
}

export function obtenerPantallaActiva() {
  return pantallaActiva;
}

// Estado de la cirugía (Cristian)
export let cirugiaActiva: boolean = true;

export function obtenerEventosClinicosOrdenados() {
  const internos = [...eventosClinicos].sort((a, b) => a.timestamp - b.timestamp);
  const cristianos = [...eventosClinicos].sort((a, b) => a.serverTime - b.serverTime);
  return { internos, cristianos };
}

export function terminarCirugia() {
  cirugiaActiva = false;
  difundirComandoTCP('TERMINAR_CIRUGIA', {});
  const ordenados = obtenerEventosClinicosOrdenados();
  notificarFinCirugiaUI(ordenados);
  enviarLogUI('Cirugía', 'Cirugía finalizada. Mostrando orden comparativo de eventos.', 'warn');
}

export function iniciarNuevaCirugia() {
  eventosClinicos.length = 0;
  cirugiaActiva = true;
  difundirComandoTCP('INICIAR_CIRUGIA', {});
  notificarEventosClinicosUI([]);
  notificarNuevaCirugiaUI();
  notificarLecturasSensorUI({});
  enviarLogUI('Cirugía', 'Nueva cirugía iniciada. Limpiando eventos anteriores.', 'info');
}

// Alternar algoritmos de sincronización desde el Maestro
export function alternarAlgoritmo(tipo: 'cristian' | 'lamport' | 'berkeley', habilitado: boolean) {
  if (tipo === 'cristian') {
    algoritmoActivo.cristian = habilitado;
    if (habilitado) {
      algoritmoActivo.lamport = false;
      algoritmoActivo.berkeley = false;
    }
  } else if (tipo === 'lamport') {
    algoritmoActivo.lamport = habilitado;
    if (habilitado) {
      algoritmoActivo.cristian = false;
      algoritmoActivo.berkeley = false;
    }
  } else if (tipo === 'berkeley') {
    algoritmoActivo.berkeley = habilitado;
    if (habilitado) {
      algoritmoActivo.cristian = false;
      algoritmoActivo.lamport = false;
    }
  }

  // Notificar a todos los esclavos el cambio de algoritmo
  difundirComandoTCP('CAMBIO_ALGORITMO', algoritmoActivo);
  enviarLogUI('Configuración Algoritmo', `Algoritmo configurado: Cristian=${algoritmoActivo.cristian}, Lamport=${algoritmoActivo.lamport}, Berkeley=${algoritmoActivo.berkeley}`, 'warn');
}

// Devuelve los historiales de código ordenados por tiempo físico (sin Lamport)
// y por tiempo lógico (con Lamport aplicado). El campo `eventos` mantiene la
// lista lógica por retrocompatibilidad con consumidores que solo esperan una lista.
export function obtenerHistorialesOrdenados() {
  const fisicos = [...historialCodigo].sort((a, b) => a.virtualTime - b.virtualTime);
  const logicos = [...historialCodigo].sort((a, b) => {
    if (a.logicalTime === b.logicalTime) {
      return a.nodoId.localeCompare(b.nodoId);
    }
    return a.logicalTime - b.logicalTime;
  });

  return {
    eventos: logicos,
    fisicos,
    logicos
  };
}

function propagarHistorialAEsclavos() {
  const data = obtenerHistorialesOrdenados();
  difundirComandoTCP('ACTUALIZAR_HISTORIAL', data);
}

export function obtenerHistorialesBD() {
  const fisicos = dbSimuladaLocal.getHistorialFisico();
  const logicos = dbSimuladaLocal.getHistorialVectorClock();
  return { eventos: logicos, fisicos, logicos };
}

// Enviar estado de salud de los nodos a la UI del maestro
export function actualizarEstadoEsclavosUI() {
  const listaEsclavos = Object.values(NODOS)
    .filter(nodo => nodo.rol === 'esclavo')
    .map(nodo => {
      const conn = esclavosConectados.get(nodo.id);
      return {
        id: nodo.id,
        ip: nodo.ip,
        estado: conn ? conn.salud : 'inactivo',
        ultimoContacto: conn ? new Date(conn.ultimoPing).toLocaleTimeString([], { hour12: false }) : 'N/A'
      };
    });
  actualizarNodosUI(listaEsclavos);
}

// Monitoreo de salud (Keep-Alive) cada 3 segundos
setInterval(() => {
  if (!serverTCP) return;
  
  esclavosConectados.forEach((esclavo, id) => {
    // Si no ha respondido en 7 segundos, lo marcamos como inactivo
    if (Date.now() - esclavo.ultimoPing > 7000) {
      esclavo.salud = 'inactivo';
      actualizarEstadoEsclavosUI();
    }
    
    // Mandar PING
    try {
      enviarMensajeTCP(esclavo.socket, { type: 'PING', payload: {} });
    } catch {
      esclavosConectados.delete(id);
      actualizarEstadoEsclavosUI();
    }
  });
}, 3000);
