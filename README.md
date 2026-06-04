# APE8-SD — Sistema Distribuido de Sincronización de Relojes

Simulador de sincronización de relojes en sistemas distribuidos con 5 nodos (1 maestro + 4 esclavos) implementado en Node.js + TypeScript. Implementa tres algoritmos clásicos de sincronización.

## Características

### Algoritmos de sincronización

| Algoritmo | Descripción | Escenario |
|---|---|---|
| **Lamport** | Relojes lógicos para ordenamiento de eventos | Sistema colaborativo de control de versiones (edición de archivos con marcas de tiempo lógicas) |
| **Cristian** | Sincronización con servidor de tiempo mediante RTT | Sala de operaciones con sensores clínicos (ECG, ventilador, presión sanguínea, bomba de infusión) |
| **Berkeley** | Promedio distribuido sin maestro absoluto | Enjambre de drones en órbita con detección de colisiones por deriva de reloj |

### Infraestructura

- **Red TCP** (puerto 5000): Comunicación fiable maestro-esclavo (registro, eventos, Cristian, health checks PING/PONG)
- **Red UDP** (puerto 5500): Polling ligero para el algoritmo Berkeley
- **Servidor web** (Express + Socket.io, puerto 3000): UI en tiempo real con tres paneles (Lamport, Cristian, Berkeley)
- **Reloj virtual**: Reloj ajustable basado en `performance.now()` con deriva aleatoria configurable
- **Detección automática de nodo**: Por IP de red o variable de entorno `NODE_ID`

### Interfaz web

- Display de reloj en tiempo real (60fps con `requestAnimationFrame`)
- Navegación por pestañas controlada por el nodo maestro
- **Lamport**: Editor de código con historial de versiones y ordenamiento lógico/físico
- **Cristian**: Dashboard de quirófano con sensores simulados, log de eventos y vista comparativa post-cirugía
- **Berkeley**: Simulación orbital de drones en canvas 2D con telemetría y detección de colisiones
- Controles de administración solo para el nodo maestro (ajustar reloj, desincronizar, alternar algoritmos)
- Consola de eventos con códigos de color
- Endpoint REST: `GET /api/status`

## Requisitos

- Node.js >= 18.x
- npm

## Instalación

```bash
npm install
npm run build
```

## Ejecución

### Nodo único (maestro en localhost)

```bash
npm start
```

Acceder a http://localhost:3000

### Múltiples nodos (simulación local)

Abrir 5 terminales:

```bash
# Terminal 1 — Maestro
NODE_ID= maestro npm start

# Terminal 2 — Esclavo 1
NODE_ID=1 npm start

# Terminal 3 — Esclavo 2
NODE_ID=2 npm start

# Terminal 4 — Esclavo 3
NODE_ID=3 npm start

# Terminal 5 — Esclavo 4
NODE_ID=4 npm start
```

### Desarrollo (con recarga automática)

```bash
npm run dev

# Con nodo específico:
NODE_ID=1 npm run dev
```

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `NODE_ID` | Identidad del nodo (`maestro`, `1`, `2`, `3`, `4`) | `maestro` |

## Estructura del proyecto

```
APE8-SD/
├── data/                    # Base de datos SQLite
├── dist/                    # Código compilado
├── public/                  # UI web (HTML, CSS, JS)
├── src/
│   ├── index.ts             # Punto de entrada
│   ├── config.ts            # Configuración de red
│   ├── virtualClock.ts      # Reloj virtual ajustable
│   ├── algorithms/          # Algoritmos de sincronización
│   │   ├── lamport.ts
│   │   ├── cristian.ts
│   │   └── berkeley.ts
│   ├── network/             # Capa de red (TCP/UDP)
│   │   ├── tcpServer.ts
│   │   ├── tcpClient.ts
│   │   └── udpServer.ts
│   ├── storage/             # Almacenamiento en memoria
│   │   └── simulatedDb.ts
│   ├── types/               # Declaraciones TypeScript
│   └── web/                 # Servidor web
│       └── app.ts
└── package.json
```
