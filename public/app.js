const socket = io();

// Elementos de la UI
const lblRol = document.getElementById('lbl-rol');
const lblIp = document.getElementById('lbl-ip');
const clockTime = document.getElementById('clock-time');
const clockMs = document.getElementById('clock-ms');
const lblOffset = document.getElementById('lbl-offset');
const lblAlgoActivo = document.getElementById('lbl-algo-activo');

// Controles Maestro
const cardMaestroControls = document.getElementById('card-maestro-controls');
const cardSlavesStatus = document.getElementById('card-slaves-status');
const btnEstablecerHora = document.getElementById('btn-establecer-hora');
const selectNodoTime = document.getElementById('select-nodo-time');
const inputTimeValue = document.getElementById('input-time-value');
const slavesListContainer = document.getElementById('slaves-list-container');

// Logs
const logConsoleContainer = document.getElementById('log-console-container');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Editor y Lamport
const codeEditor = document.getElementById('code-editor');
const txtAutor = document.getElementById('txt-autor');
const btnGuardarCodigo = document.getElementById('btn-guardar-codigo');
const commitsContainer = document.getElementById('commits-container');
const switchLamportOrdering = document.getElementById('switch-lamport-ordering');
const cardEditorViewerInfo = document.getElementById('card-editor-viewer-info');
const editorContainerCard = document.getElementById('editor-container-card');

// Quirófano (Cristian)
const eventClinicosContainer = document.getElementById('surgery-events-container');
const surgeryLogsContainer = document.getElementById('surgery-logs-container');
const surgeryComparisonContainer = document.getElementById('surgery-comparison-container');
const eventosInternosContainer = document.getElementById('eventos-internos-container');
const eventosCristianosContainer = document.getElementById('eventos-cristianos-container');
const btnTerminarCirugia = document.getElementById('btn-terminar-cirugia');
const sensorEcgBpm = document.getElementById('sensor-ecg-bpm');
const sensorVentPress = document.getElementById('sensor-vent-press');
const sensorPressVal = document.getElementById('sensor-press-val');
const sensorPumpRate = document.getElementById('sensor-pump-rate');
const sensorPumpLiquid = document.getElementById('sensor-pump-liquid');

// Drones (Berkeley)
const alertColisionIndicator = document.getElementById('alert-colision-indicator');
const canvas = document.getElementById('drones-canvas');
const ctx = canvas.getContext('2d');

// Estado local
let miConfig = null;
let offsetLocal = 0;
let virtualTimeLocal = 0;
let ultimoSyncTiempo = 0;
let esMaestro = false;
let pantallaActiva = 'tab-lamport';

// Configuración de pestañas
const tabLinks = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');

function aplicarPantalla(tabId) {
  pantallaActiva = tabId;

  tabLinks.forEach((link) => {
    const activo = link.getAttribute('data-tab') === tabId;
    link.classList.toggle('active', activo);
  });

  tabContents.forEach((content) => {
    content.classList.toggle('active', content.id === tabId);
  });

  if (tabId === 'tab-lamport') {
    lblAlgoActivo.textContent = 'Relojes de Lamport Activos';
  } else if (tabId === 'tab-cristian') {
    lblAlgoActivo.textContent = 'Algoritmo de Cristian Activo';
  } else if (tabId === 'tab-berkeley') {
    lblAlgoActivo.textContent = 'Algoritmo de Berkeley Activo';
  }
}

tabLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (!esMaestro) return;

    const tabId = link.getAttribute('data-tab');
    if (!tabId || tabId === pantallaActiva) return;

    aplicarPantalla(tabId);
    socket.emit('admin-switch-screen', { screen: tabId });
    agregarLog('Cambio de Pantalla', `El maestro cambió la vista a ${tabId.replace('tab-', '').toUpperCase()}`, 'info');
  });
});

// 1. Identidad de red y rol
socket.on('node-info', (data) => {
  miConfig = data;
  esMaestro = data.rol === 'maestro';
  lblRol.textContent = data.rol === 'maestro' ? 'NODO MAESTRO' : `ESCLAVO ${data.id}`;
  lblIp.textContent = data.ip;
  offsetLocal = data.offset;
  virtualTimeLocal = data.virtualTime;
  ultimoSyncTiempo = performance.now();

  const badge = document.getElementById('node-badge');
  if (data.rol === 'maestro') {
    badge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    badge.querySelector('.badge-icon').style.color = 'hsl(355, 85%, 60%)';
    cardMaestroControls.style.display = 'block';
    cardSlavesStatus.style.display = 'block';
    cardEditorViewerInfo.style.display = 'block';
    editorContainerCard.style.display = 'none';
    surgeryLogsContainer.style.display = 'block';
    btnTerminarCirugia.style.display = 'inline-flex';
  } else {
    badge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    badge.querySelector('.badge-icon').style.color = 'hsl(145, 65%, 50%)';
    cardMaestroControls.style.display = 'none';
    cardSlavesStatus.style.display = 'none';
    cardEditorViewerInfo.style.display = 'none';
    editorContainerCard.style.display = 'block';
    surgeryLogsContainer.style.display = 'none';
    btnTerminarCirugia.style.display = 'none';
  }

  tabLinks.forEach((link) => {
    link.style.pointerEvents = esMaestro ? 'auto' : 'none';
    link.style.opacity = esMaestro ? '1' : '0.72';
    link.setAttribute('aria-disabled', esMaestro ? 'false' : 'true');
  });

  aplicarPantalla(data.screen || 'tab-lamport');
  
  agregarLog('Mi Identidad', `Conectado como ${data.rol.toUpperCase()} (IP: ${data.ip})`, 'success');
});

socket.on('screen-state', (data) => {
  if (data && data.screen) {
    aplicarPantalla(data.screen);
  }
});

// 2. Mantener reloj virtual en tiempo real localmente
socket.on('clock-update', (data) => {
  offsetLocal = data.offset;
  virtualTimeLocal = data.virtualTime;
  ultimoSyncTiempo = performance.now();
});

function actualizarRelojVisual() {
  requestAnimationFrame(actualizarRelojVisual);
  
  if (!virtualTimeLocal) return;

  // Calculamos interpolación para un avance fluido de milisegundos
  const transcurrido = performance.now() - ultimoSyncTiempo;
  const tiempoActual = new Date(virtualTimeLocal + transcurrido);
  
  const h = String(tiempoActual.getHours()).padStart(2, '0');
  const m = String(tiempoActual.getMinutes()).padStart(2, '0');
  const s = String(tiempoActual.getSeconds()).padStart(2, '0');
  const ms = String(tiempoActual.getMilliseconds()).padStart(3, '0');

  clockTime.textContent = `${h}:${m}:${s}`;
  clockMs.textContent = `.${ms}`;

  // Actualizar offset en texto
  lblOffset.textContent = `${offsetLocal > 0 ? '+' : ''}${offsetLocal.toLocaleString()} ms`;
  if (offsetLocal === 0) {
    lblOffset.className = 'val offset-neutral';
  } else {
    lblOffset.className = 'val offset-warning';
  }
}
requestAnimationFrame(actualizarRelojVisual);

// 3. Comandos de Administración (Maestro -> UI)
if (btnEstablecerHora) {
  btnEstablecerHora.addEventListener('click', () => {
    const timeVal = inputTimeValue.value;
    if (!timeVal) {
      alert('Por favor selecciona una hora concreta.');
      return;
    }
    
    const [h, m, s] = timeVal.split(':');
    const targetDate = new Date();
    targetDate.setHours(parseInt(h), parseInt(m), parseInt(s || '0'), 0);
    const targetTimestamp = targetDate.getTime();
    const selectVal = selectNodoTime.value;

    socket.emit('admin-establecer-hora', { 
      nodoTarget: selectVal, 
      targetTime: targetTimestamp 
    });
    
    agregarLog('Ajuste Hora', `Solicitado ajustar ${selectVal} a las ${timeVal}`, 'info');
  });

  switchLamportOrdering.addEventListener('change', (e) => {
    socket.emit('admin-toggle-lamport-ordering', { enabled: e.target.checked });
  });
}

// 4. Logs de red en consola
socket.on('log-evento', (data) => {
  agregarLog(data.evento, data.detalles, data.tipo);
});

function agregarLog(evento, detalles, tipo) {
  const line = document.createElement('div');
  line.className = `log-line ${tipo}`;
  
  const time = new Date();
  const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
  
  line.innerHTML = `<span class="time">[${timeStr}]</span> <strong>${evento}:</strong> ${detalles}`;
  logConsoleContainer.appendChild(line);
  logConsoleContainer.scrollTop = logConsoleContainer.scrollHeight;
}

if (btnClearLogs) {
  btnClearLogs.addEventListener('click', () => {
    logConsoleContainer.innerHTML = '';
  });
}

// 5. Salud de los nodos (Dashboard Maestro)
socket.on('nodes-status-update', (nodos) => {
  if (!slavesListContainer) return;
  
  slavesListContainer.innerHTML = '';
  nodos.forEach((nodo) => {
    const item = document.createElement('div');
    item.className = 'slave-item';
    
    item.innerHTML = `
      <div class="slave-name ${nodo.estado === 'activo' ? 'active' : ''}">
        <i class="fa-solid fa-server"></i>
        <div>
          <span>Esclavo ${nodo.id}</span>
          <span class="slave-ip">${nodo.ip}</span>
        </div>
      </div>
      <div class="slave-meta">
        <span class="status ${nodo.estado}">${nodo.estado}</span>
        <span class="ping">Ping: ${nodo.ultimoContacto}</span>
      </div>
    `;
    slavesListContainer.appendChild(item);
  });
});

// 6. Módulo de Código (Lamport)
btnGuardarCodigo.addEventListener('click', enviarGuardadoCodigo);

codeEditor.addEventListener('keydown', (e) => {
  // Ctrl + S
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    enviarGuardadoCodigo();
  }
});

function enviarGuardadoCodigo() {
  const content = codeEditor.value;
  const author = txtAutor.value.trim() || 'Anónimo';
  if (!content) return;
  
  socket.emit('code-save', { author, content });
  agregarLog('Guardando Archivo', 'Confirmación generada, enviando al maestro con sello Lamport...', 'info');
}

socket.on('historial-update', (data) => {
  const { eventos, ordenacion } = data;
  const usandoLamport = ordenacion === 'logico';

  // Sincronizar editor con la última escritura
  if (eventos && eventos.length > 0) {
    const ultimoCambio = eventos[eventos.length - 1];
    if (miConfig && ultimoCambio.nodoId !== miConfig.id && document.activeElement !== codeEditor) {
      codeEditor.value = ultimoCambio.content;
    }
  }

  // Sincronizar estado del toggle con el servidor
  if (switchLamportOrdering) {
    switchLamportOrdering.checked = usandoLamport;
  }

  // Rellenar lista única
  commitsContainer.innerHTML = '';
  if (eventos.length === 0) {
    commitsContainer.innerHTML = '<div class="no-commits">Sin confirmaciones registradas aún.</div>';
  } else {
    eventos.forEach((c) => {
      const timeStr = new Date(c.virtualTime).toLocaleTimeString([], { hour12: false });
      const idCorto = c.id.length > 8 ? c.id.substring(0, 8) : c.id;
      const item = document.createElement('div');
      item.className = 'commit-item';
      item.innerHTML = `
        <div class="commit-header">
          <span>
            <span class="commit-author"><i class="fa-solid fa-user"></i> ${c.author} (Nodo ${c.nodoId})</span>
            <span class="commit-id-tag"><i class="fa-regular fa-key"></i> ${idCorto}</span>
          </span>
          <span class="commit-time-tag"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
        </div>
        <div class="commit-content">${c.content}</div>
        <div class="commit-meta">
          <span><i class="fa-solid fa-microchip"></i> Tiempo Virtual: ${new Date(c.virtualTime).toLocaleTimeString([], { hour12: false })}</span>
          <span class="commit-lamport-tag"><i class="fa-solid fa-tag"></i> L: ${c.logicalTime}</span>
        </div>
      `;
      commitsContainer.appendChild(item);
    });
  }
});

// 7. Módulo de Quirófano (Cristian)
socket.on('clinicos-update', (eventos) => {
  if (!eventClinicosContainer) return;
  eventClinicosContainer.innerHTML = '';

  if (eventos.length === 0) {
    eventClinicosContainer.innerHTML = '<div class="no-events">Esperando registros médicos de los sensores...</div>';
    return;
  }

  eventos.forEach((e) => {
    const item = document.createElement('div');
    item.className = 'surgery-event-item';
    // Formatear hora con milisegundos
    const date = new Date(e.timestamp);
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
    
    item.innerHTML = `
      <span class="time-meta"><i class="fa-solid fa-stopwatch"></i> ${timeStr}</span>
      <span class="msg"><strong>${e.tipoMaquina}</strong>: ${e.evento}</span>
      <span class="node-meta">Nodo: ${e.nodoId}</span>
    `;
    eventClinicosContainer.appendChild(item);
  });
  eventClinicosContainer.scrollTop = eventClinicosContainer.scrollHeight;
});

// Botón Terminar Cirugía
btnTerminarCirugia.addEventListener('click', () => {
  socket.emit('admin-terminar-cirugia');
  btnTerminarCirugia.disabled = true;
  btnTerminarCirugia.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Finalizando...';
  agregarLog('Cirugía', 'Solicitando finalización de la cirugía al maestro...', 'warn');
});

// Comparativa post-cirugía (Cristian)
socket.on('cirugia-terminada', (data) => {
  const { internos, cristianos } = data;

  surgeryLogsContainer.style.display = 'none';
  surgeryComparisonContainer.style.display = 'grid';
  btnTerminarCirugia.style.display = 'none';

  // Rellenar eventos internos (desfasados)
  eventosInternosContainer.innerHTML = '';
  if (internos.length === 0) {
    eventosInternosContainer.innerHTML = '<div class="no-commits">Sin eventos registrados.</div>';
  } else {
    internos.forEach((e) => {
      const dateInterno = new Date(e.timestamp);
      const timeInterno = `${String(dateInterno.getHours()).padStart(2, '0')}:${String(dateInterno.getMinutes()).padStart(2, '0')}:${String(dateInterno.getSeconds()).padStart(2, '0')}.${String(dateInterno.getMilliseconds()).padStart(3, '0')}`;
      const item = document.createElement('div');
      item.className = 'clinical-event-item';
      item.innerHTML = `
        <div class="clinical-event-header">
          <span class="clinical-event-machine"><i class="fa-solid fa-microscope"></i> ${e.tipoMaquina}</span>
          <span class="clinical-event-node">Nodo ${e.nodoId}</span>
        </div>
        <div class="clinical-event-msg">${e.evento}</div>
        <div class="clinical-event-times">
          <span class="time-internal"><i class="fa-regular fa-clock"></i> Interno: <span class="time-tag">${timeInterno}</span></span>
        </div>
      `;
      eventosInternosContainer.appendChild(item);
    });
  }

  // Rellenar eventos ordenados por Cristian
  eventosCristianosContainer.innerHTML = '';
  if (cristianos.length === 0) {
    eventosCristianosContainer.innerHTML = '<div class="no-commits">Sin eventos registrados.</div>';
  } else {
    cristianos.forEach((e) => {
      const dateInterno = new Date(e.timestamp);
      const timeInterno = `${String(dateInterno.getHours()).padStart(2, '0')}:${String(dateInterno.getMinutes()).padStart(2, '0')}:${String(dateInterno.getSeconds()).padStart(2, '0')}.${String(dateInterno.getMilliseconds()).padStart(3, '0')}`;
      const dateServer = new Date(e.serverTime);
      const timeServer = `${String(dateServer.getHours()).padStart(2, '0')}:${String(dateServer.getMinutes()).padStart(2, '0')}:${String(dateServer.getSeconds()).padStart(2, '0')}.${String(dateServer.getMilliseconds()).padStart(3, '0')}`;
      const item = document.createElement('div');
      item.className = 'clinical-event-item';
      item.innerHTML = `
        <div class="clinical-event-header">
          <span class="clinical-event-machine"><i class="fa-solid fa-microscope"></i> ${e.tipoMaquina}</span>
          <span class="clinical-event-node">Nodo ${e.nodoId}</span>
        </div>
        <div class="clinical-event-msg">${e.evento}</div>
        <div class="clinical-event-times">
          <span class="time-internal"><i class="fa-regular fa-clock"></i> Interno: <span class="time-tag">${timeInterno}</span></span>
          <span class="time-cristian"><i class="fa-solid fa-microchip"></i> Cristian: <span class="time-tag">${timeServer}</span></span>
        </div>
      `;
      eventosCristianosContainer.appendChild(item);
    });
  }
});

// Resetear UI al iniciar nueva cirugía
socket.on('nueva-cirugia', () => {
  surgeryComparisonContainer.style.display = 'none';
  surgeryLogsContainer.style.display = 'block';
  eventClinicosContainer.innerHTML = '<div class="no-events">Esperando registros médicos de los sensores...</div>';
  btnTerminarCirugia.disabled = false;
  btnTerminarCirugia.innerHTML = '<i class="fa-solid fa-square"></i> Terminar Cirugía';
  btnTerminarCirugia.style.display = '';
  if (sensorEcgBpm) sensorEcgBpm.textContent = '—';
  if (sensorVentPress) sensorVentPress.textContent = '—';
  if (sensorPressVal) sensorPressVal.textContent = '—';
  if (sensorPumpRate) sensorPumpRate.textContent = '—';
  if (sensorPumpLiquid) sensorPumpLiquid.style.height = '0%';
});

// Lecturas de sensores desde los esclavos vía TCP
socket.on('sensor-readings-update', (data) => {
  if (data['1']) {
    if (sensorEcgBpm) sensorEcgBpm.textContent = data['1'].bpm;
  }
  if (data['2']) {
    if (sensorVentPress) sensorVentPress.textContent = data['2'].presion;
  }
  if (data['3']) {
    if (sensorPressVal) sensorPressVal.textContent = `${data['3'].sistole}/${data['3'].diastole}`;
  }
  if (data['4']) {
    if (sensorPumpRate) sensorPumpRate.textContent = data['4'].tasa;
    if (sensorPumpLiquid) sensorPumpLiquid.style.height = `${data['4'].nivelLiquido}%`;
  }
});

// 8. Módulo de Drones (Berkeley)
let dronesData = [];

socket.on('drones-update', (drones) => {
  dronesData = drones;

  // Actualizar cartelera de alerta
  const hayColision = drones.some(d => d.alertaColision);
  alertColisionIndicator.style.display = hayColision ? 'block' : 'none';

  // Actualizar telemetría de texto
  drones.forEach((d) => {
    const telItem = document.getElementById(`telemetry-drone-${d.id}`);
    if (telItem) {
      if (d.alertaColision) {
        telItem.className = 'drone-telemetry-item alert-danger';
      } else {
        telItem.className = 'drone-telemetry-item';
      }
      
      const pos = telItem.querySelector('.pos');
      const time = telItem.querySelector('.time');
      
      pos.textContent = `X: ${d.x}, Y: ${d.y}`;
      const date = new Date(d.relojVirtual);
      time.textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    }
  });
});

// Bucle de dibujado del canvas de drones (Berkeley)
function drawSimulation() {
  requestAnimationFrame(drawSimulation);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Dibujar Centro de Control (Radar)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let r = 50; r <= 250; r += 50) {
    ctx.beginPath();
    ctx.arc(300, 250, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ejes radar
  ctx.beginPath();
  ctx.moveTo(300, 20);
  ctx.lineTo(300, 480);
  ctx.moveTo(50, 250);
  ctx.lineTo(550, 250);
  ctx.stroke();

  // Estación Base Central
  ctx.fillStyle = 'hsl(255, 70%, 65%)';
  ctx.beginPath();
  ctx.arc(300, 250, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(138, 92, 246, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(300, 250, 16, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Trayectoria orbital de drones
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(300, 250, 100, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Dibujar los Drones
  if (dronesData.length === 0) {
    // Si no hay datos distribuidos activos, dibujamos drones estáticos
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '12px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('Esperando datos de drones del nodo maestro...', 300, 220);
    return;
  }

  const coloresDrones = {
    '1': 'hsl(190, 70%, 55%)',  // Celeste
    '2': 'hsl(145, 65%, 50%)',  // Verde menta
    '3': 'hsl(38, 90%, 55%)',   // Naranja
    '4': 'hsl(255, 70%, 65%)'   // Violeta
  };

  dronesData.forEach((d) => {
    const color = coloresDrones[d.id] || '#fff';

    // Línea radial de órbita hacia la base
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(300, 250);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();

    // Dibujar aureola de colisión si aplica
    if (d.alertaColision) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 25, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Dibujar Dron
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 10, 0, Math.PI * 2);
    ctx.fill();

    // Bordes dron
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 10, 0, Math.PI * 2);
    ctx.stroke();

    // Texto de Dron ID
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.id, d.x, d.y);

    // Etiqueta de IP/Rol flotante
    ctx.fillStyle = 'rgba(15, 22, 36, 0.7)';
    ctx.fillRect(d.x - 24, d.y - 25, 48, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(d.x - 24, d.y - 25, 48, 12);
    
    ctx.fillStyle = 'hsl(210, 10%, 80%)';
    ctx.font = '8px Outfit';
    ctx.fillText(`DRON ${d.id}`, d.x, d.y - 19);
  });
}
requestAnimationFrame(drawSimulation);
