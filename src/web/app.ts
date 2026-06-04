import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { PUERTO_WEB, obtenerConfiguracionNodoActual } from '../config';
import relojLocal from '../virtualClock';

import { EventEmitter } from 'events';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
  }
});

export const eventosUI = new EventEmitter();

const configNodo = obtenerConfiguracionNodoActual();
export type PantallaActiva = 'tab-lamport' | 'tab-cristian' | 'tab-berkeley';

let pantallaActiva: PantallaActiva = 'tab-lamport';
let ultimoHistorial: { eventos: any[]; fisicos: any[]; logicos: any[] } = {
  eventos: [],
  fisicos: [],
  logicos: []
};

// Servir la carpeta public con la interfaz web
app.use(express.static(path.join(__dirname, '../../public')));

// Ruta principal para servir la UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Endpoint de API básica para obtener estado rápido del nodo si se necesita
app.get('/api/status', (req, res) => {
  res.json({
    id: configNodo.id,
    rol: configNodo.rol,
    ip: configNodo.ip,
    virtualTime: relojLocal.getTime(),
    virtualDate: relojLocal.getDate().toISOString(),
    offset: relojLocal.getOffset()
  });
});

// Configuración de WebSockets para actualizar en tiempo real la interfaz gráfica local
io.on('connection', (socket) => {
  // Al conectarse, enviamos la información de identidad del nodo
  socket.emit('node-info', {
    id: configNodo.id,
    rol: configNodo.rol,
    ip: configNodo.ip,
    virtualTime: relojLocal.getTime(),
    offset: relojLocal.getOffset(),
    screen: pantallaActiva
  });

  socket.emit('historial-update', ultimoHistorial);

  // Escuchar cuando el usuario en la UI presiona Ctrl+S para enviar cambio de código (Lamport)
  socket.on('code-save', (data: { author: string; content: string }) => {
    // Esto se propagará al manejador del módulo de Lamport
    eventosUI.emit('ui-code-save', data);
  });

  // Escuchar comandos del Administrador desde la UI del Maestro
  socket.on('admin-establecer-hora', (data: { nodoTarget: string; targetTime: number }) => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-establecer-hora', data);
  });

  socket.on('admin-switch-screen', (data: { screen: PantallaActiva }) => {
    if (configNodo.rol !== 'maestro') return;
    pantallaActiva = data.screen;
    io.emit('screen-state', { screen: pantallaActiva });
    eventosUI.emit('ui-admin-switch-screen', data);
  });

  socket.on('admin-toggle-cristian', (data: { enabled: boolean }) => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-toggle-cristian', data);
  });

  socket.on('admin-toggle-lamport', (data: { enabled: boolean }) => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-toggle-lamport', data);
  });

  socket.on('admin-toggle-lamport-ordering', (data: { enabled: boolean }) => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-toggle-lamport-ordering', data);
  });

  socket.on('admin-toggle-berkeley', (data: { enabled: boolean }) => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-toggle-berkeley', data);
  });

  socket.on('admin-terminar-cirugia', () => {
    if (configNodo.rol !== 'maestro') return;
    eventosUI.emit('ui-admin-terminar-cirugia');
  });

  // Auto-ajuste del reloj local por el propio esclavo
  socket.on('slave-establecer-hora', (data: { targetTime: number }) => {
    eventosUI.emit('slave-ui-establecer-hora', data);
  });

  socket.on('slave-desfazar-reloj', () => {
    eventosUI.emit('slave-ui-desfazar-reloj');
  });
});

// Transmitir periódicamente el tiempo virtual al frontend para que esté sincronizado visualmente
setInterval(() => {
  io.emit('clock-update', {
    virtualTime: relojLocal.getTime(),
    offset: relojLocal.getOffset()
  });
}, 100);

export function enviarLogUI(evento: string, detalles: string, tipo: 'info' | 'success' | 'warn' | 'error' = 'info') {
  io.emit('log-evento', {
    timestamp: relojLocal.getTime(),
    evento,
    detalles,
    tipo
  });
}

export function actualizarNodosUI(nodosInfo: any) {
  io.emit('nodes-status-update', nodosInfo);
}

export function notificarHistorialUI(historial: any) {
  ultimoHistorial = historial;
  io.emit('historial-update', historial);
}

export function notificarDronesUI(datosDrones: any) {
  io.emit('drones-update', datosDrones);
}

export function notificarEventosClinicosUI(eventos: any) {
  io.emit('clinicos-update', eventos);
}

export function notificarFinCirugiaUI(ordenados: { internos: any[]; cristianos: any[] }) {
  io.emit('cirugia-terminada', ordenados);
}

export function notificarNuevaCirugiaUI() {
  io.emit('nueva-cirugia');
}

let ultimasLecturasSensor: any = {};

export function notificarLecturasSensorUI(data: any) {
  if (!data || Object.keys(data).length === 0) {
    ultimasLecturasSensor = {};
  } else {
    ultimasLecturasSensor[data.nodoId] = data;
  }
  io.emit('sensor-readings-update', { ...ultimasLecturasSensor });
}

export function notificarPantallaUI(screen: PantallaActiva) {
  pantallaActiva = screen;
  io.emit('screen-state', { screen: pantallaActiva });
}

export function iniciarServidorWeb(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(PUERTO_WEB, () => {
      console.log(`[Web] Servidor de UI iniciado en http://localhost:${PUERTO_WEB}`);
      resolve();
    });
  });
}

export { app, io };
