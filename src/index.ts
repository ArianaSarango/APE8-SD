import { obtenerConfiguracionNodoActual, NodoConfig, NODOS } from './config';
import relojLocal from './virtualClock';
import { 
  iniciarServidorWeb, 
  eventosUI, 
  enviarLogUI, 
  notificarPantallaUI,
  notificarHistorialUI, 
  actualizarNodosUI 
} from './web/app';
import { 
  inicializarServidorTCP, 
  difundirComandoTCP, 
  alternarAlgoritmo, 
  alternarOrdenacionLamport,
  terminarCirugia,
  iniciarNuevaCirugia,
  establecerPantallaActiva,
  obtenerHistorialesOrdenados, 
  historialCodigo, 
  actualizarEstadoEsclavosUI 
} from './network/tcpServer';
import { cargarHistorialLamport, inicializarLamportDb } from './storage/lamportDb';
import { 
  conectarAlMaestro, 
  algoritmoActivoEsclavo, 
  cirugiaActivaLocal,
  enviarMensajeTCPAlMaestro 
} from './network/tcpClient';
import { 
  inicializarServidorUDP, 
  enviarMensajeUDP, 
  obtenerPuertoUDPMaestro 
} from './network/udpServer';
import { 
  iniciarSincronizacionCristian, 
  detenerSincronizacionCristian 
} from './algorithms/cristian';
import { 
  iniciarBerkeley, 
  detenerBerkeley, 
  registrarTiempoEsclavoBerkeley 
} from './algorithms/berkeley';
import { relojLamportLocal } from './algorithms/lamport';

const configNodo = obtenerConfiguracionNodoActual();

async function main() {
  console.log(`==================================================`);
  console.log(`  INICIANDO NODO DISTRIBUIDO DE SINCRONIZACION    `);
  console.log(`  ID: ${configNodo.id.toUpperCase()} | Rol: ${configNodo.rol.toUpperCase()} | IP: ${configNodo.ip}`);
  console.log(`==================================================`);

  // 1. Iniciar el Servidor Web (interfaz web local para cada nodo)
  await iniciarServidorWeb();

  if (configNodo.rol === 'maestro') {
    // === NODO MAESTRO ===

    await inicializarLamportDb();

    const historialPersistido = cargarHistorialLamport();
    if (historialPersistido.length > 0) {
      historialCodigo.splice(0, historialCodigo.length, ...historialPersistido);
      notificarHistorialUI(obtenerHistorialesOrdenados());
    }

    const aplicarPantallaActiva = (screen: 'tab-lamport' | 'tab-cristian' | 'tab-berkeley') => {
      establecerPantallaActiva(screen);
      notificarPantallaUI(screen);

      if (screen === 'tab-lamport') {
        detenerBerkeley();
        alternarAlgoritmo('lamport', true);
      } else if (screen === 'tab-cristian') {
        detenerBerkeley();
        iniciarNuevaCirugia();
        alternarAlgoritmo('cristian', true);
      } else if (screen === 'tab-berkeley') {
        alternarAlgoritmo('berkeley', true);
        iniciarBerkeley();
      }

      difundirComandoTCP('CAMBIO_PANTALLA', { screen });
    };

    // Pantalla inicial y algoritmo inicial: Lamport
    establecerPantallaActiva('tab-lamport');
    notificarPantallaUI('tab-lamport');
    alternarAlgoritmo('lamport', true);
    
    // Iniciar servidor TCP (puerto 5000)
    await inicializarServidorTCP();

    // Iniciar servidor UDP (puerto 5500)
    await inicializarServidorUDP(
      // Callback esclavo (no aplica en maestro)
      undefined,
      // Callback maestro: recibe el tiempo de los esclavos para Berkeley
      (esclavoId, virtualTime) => {
        registrarTiempoEsclavoBerkeley(esclavoId, virtualTime);
      },
      // Callback ajuste (no aplica en maestro)
      undefined
    );

    // Conectar eventos del Administrador desde la UI a la lógica de red
    eventosUI.on('ui-admin-desfasar', () => {
      console.log('[Maestro] Solicitando desfasar relojes virtuales...');
      enviarLogUI('Comando Administrador', 'Propagando orden de desfase aleatorio a esclavos...', 'warn');
      
      // Desfasar el propio maestro
      const desfaseMs = relojLocal.desfasarAleatoriamente();
      const min = (desfaseMs / 60000).toFixed(2);
      enviarLogUI('Desfase Reloj', `Desfase Maestro: ${min} minutos (${desfaseMs > 0 ? '+' : ''}${Math.round(desfaseMs / 1000)}s)`, 'warn');
      
      // Desfasar esclavos por TCP
      difundirComandoTCP('DESFASAR_ORDEN', {});
    });

    eventosUI.on('ui-admin-toggle-cristian', (data: { enabled: boolean }) => {
      alternarAlgoritmo('cristian', data.enabled);
    });

    eventosUI.on('ui-admin-toggle-lamport', (data: { enabled: boolean }) => {
      alternarAlgoritmo('lamport', data.enabled);
      if (data.enabled) {
        notificarHistorialUI(obtenerHistorialesOrdenados());
      }
    });

    eventosUI.on('ui-admin-toggle-lamport-ordering', (data: { enabled: boolean }) => {
      alternarOrdenacionLamport(data.enabled);
    });

    eventosUI.on('ui-admin-toggle-berkeley', (data: { enabled: boolean }) => {
      alternarAlgoritmo('berkeley', data.enabled);
      if (data.enabled) {
        iniciarBerkeley();
      } else {
        detenerBerkeley();
      }
    });

    eventosUI.on('ui-admin-switch-screen', (data: { screen: 'tab-lamport' | 'tab-cristian' | 'tab-berkeley' }) => {
      aplicarPantallaActiva(data.screen);
    });

    eventosUI.on('ui-admin-terminar-cirugia', () => {
      terminarCirugia();
    });

    // Ajustar a una hora concreta (desde UI Maestro)
    eventosUI.on('ui-admin-establecer-hora', (data: { nodoTarget: string; targetTime: number }) => {
      const { nodoTarget, targetTime } = data;
      // Si el objetivo es el propio maestro, aplicamos directamente el ajuste
      if (nodoTarget === 'maestro') {
        const ajuste = targetTime - relojLocal.getTime();
        relojLocal.adjust(ajuste);
        enviarLogUI('Ajuste Hora', `Maestro ajustado en ${ajuste > 0 ? '+' : ''}${Math.round(ajuste)}ms.`, 'success');
      } else {
        // Enviamos un comando TCP a los esclavos con el targetId para que solo el destino aplique
        difundirComandoTCP('SET_TIME', { targetId: nodoTarget, targetTime });
        enviarLogUI('Ajuste Hora', `Solicitado ajuste a ${nodoTarget} → ${new Date(targetTime).toLocaleTimeString([], { hour12: false })}`, 'info');
      }
    });

    // Inicializar visualización de salud
    setTimeout(() => {
      actualizarEstadoEsclavosUI();
    }, 1000);

  } else {
    // === NODO ESCLAVO ===

    // Conectar por TCP al Maestro
    conectarAlMaestro();

    // Iniciar servidor UDP (puerto 5500 o puerto local simulado)
    await inicializarServidorUDP(
      // Callback esclavo: cuando recibe un POLL de Berkeley del maestro, responde con su tiempo virtual
      (rinfo) => {
        if (algoritmoActivoEsclavo.berkeley) {
          const maestroIp = NODOS.maestro.ip;
          const targetIp = configNodo.ip === '127.0.0.1' ? '127.0.0.1' : maestroIp;
          const puertoMaestro = obtenerPuertoUDPMaestro();

          console.log(`[UDP Esclavo] Recibido Berkeley POLL. Enviando tiempo virtual: ${relojLocal.getTime()}`);
          
          enviarMensajeUDP(
            {
              type: 'BERKELEY_TIME',
              payload: {
                id: configNodo.id,
                virtualTime: relojLocal.getTime()
              }
            },
            puertoMaestro,
            targetIp
          );
        }
      },
      // Callback maestro (no aplica)
      undefined,
      // Callback ajuste: recibe el ajuste calculado de Berkeley y lo aplica al reloj local
      (adjustment) => {
        if (algoritmoActivoEsclavo.berkeley) {
          relojLocal.adjust(adjustment);
          console.log(`[UDP Esclavo] Berkeley ajuste recibido: ${Math.round(adjustment)}ms. Reloj virtual actualizado.`);
          enviarLogUI(
            'Sincronización Berkeley', 
            `Ajuste de Berkeley recibido vía UDP: ${adjustment > 0 ? '+' : ''}${Math.round(adjustment)}ms. Reloj ajustado.`, 
            'success'
          );
        }
      }
    );

    // Iniciar el polling de Cristian en segundo plano (correrá permanentemente pero solo enviará consultas si Cristian está activo)
    iniciarSincronizacionCristian();

    // Conectar eventos de la UI local del Esclavo
    eventosUI.on('ui-code-save', (data: { author: string; content: string }) => {
      // Registrar cambio con reloj de Lamport
      const logicalTime = relojLamportLocal.increment();
      const virtualTime = relojLocal.getTime();

      console.log(`[Lamport Esclavo] Edición de código por ${data.author}. Tiempo Lamport: ${logicalTime}`);
      enviarLogUI(
        'Edición Código', 
        `Guardando cambio de código localmente. Reloj Lamport: ${logicalTime}`, 
        'info'
      );

      // Enviar evento de código al maestro por TCP
      enviarMensajeTCPAlMaestro({
        type: 'EVENTO_CODIGO',
        payload: {
          author: data.author,
          content: data.content,
          logicalTime,
          virtualTime
        }
      });
    });

    // Simulación del Quirófano Clínico (disparar eventos clínicos)
    // Para hacerlo interactivo, cada esclavo simula un sensor de quirófano que emite lecturas a intervalos aleatorios
    iniciarSimuladorEventosClinicos();
  }
}

// Emisor de eventos clínicos y lecturas de sensores para los esclavos (Módulo 2 - Cristian)
function iniciarSimuladorEventosClinicos() {
  const maquinasEsclavo: { [key: string]: { tipo: string; eventos: string[] } } = {
    '1': { 
      tipo: 'Electrocardiograma (ECG)', 
      eventos: ['Pulsación normal detectada', 'Pico R en onda QRS registrado', 'Arritmia leve detectada', 'Pulsación normal detectada'] 
    },
    '2': { 
      tipo: 'Ventilador Mecánico', 
      eventos: ['Presión inspiratoria dentro de rango', 'Ciclo de exhalación completado', 'Alarma de volumen bajo', 'Suministro de O2 al 98%'] 
    },
    '3': { 
      tipo: 'Monitor de Presión Arterial', 
      eventos: ['Sístole medida: 120 mmHg', 'Diástole medida: 80 mmHg', 'Frecuencia de pulso: 72 lpm', 'Presión arterial media estable'] 
    },
    '4': { 
      tipo: 'Bomba de Infusión', 
      eventos: ['Infusión de anestésico activa', 'Dosis de 5ml administrada', 'Alerta de burbuja de aire descartada', 'Bolo infundido con éxito'] 
    }
  };

  const infoMaquina = maquinasEsclavo[configNodo.id];
  if (!infoMaquina) return;

  // Eventos clínicos cada ~15s (solo si la cirugía está activa)
  setInterval(() => {
    if (!cirugiaActivaLocal) return;

    const eventoAleatorio = infoMaquina.eventos[Math.floor(Math.random() * infoMaquina.eventos.length)];
    const timestamp = relojLocal.getTime();

    console.log(`[Quirófano Sim] Emitiendo evento clínico: ${eventoAleatorio}`);

    enviarMensajeTCPAlMaestro({
      type: 'EVENTO_CLINICO',
      payload: {
        tipoMaquina: infoMaquina.tipo,
        evento: eventoAleatorio,
        timestamp
      }
    });
  }, 15000);

  // Lecturas de sensores cada ~3.5s (solo si la cirugía está activa)
  setInterval(() => {
    if (!cirugiaActivaLocal) return;

    const payloads: Record<string, any> = {
      '1': { bpm: 60 + Math.round(Math.random() * 30) },
      '2': { presion: 10 + Math.round(Math.random() * 20) },
      '3': { sistole: 110 + Math.round(Math.random() * 20), diastole: 70 + Math.round(Math.random() * 15) },
      '4': { tasa: parseFloat((3 + Math.random() * 4).toFixed(1)), nivelLiquido: Math.round(20 + Math.random() * 75) }
    };

    const payload = payloads[configNodo.id];
    if (payload) {
      enviarMensajeTCPAlMaestro({
        type: 'SENSOR_READING',
        payload: {
          nodoId: configNodo.id,
          ...payload
        }
      });
    }
  }, 3500);
}

main().catch((err) => {
  console.error('[Index] Error fatal al arrancar el nodo:', err);
});
