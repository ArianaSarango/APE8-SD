import os from 'os';

export interface NodoConfig {
  id: string; // 'maestro' | '1' | '2' | '3' | '4'
  ip: string;
  rol: 'maestro' | 'esclavo';
}

export const PUERTO_TCP = 5000;
export const PUERTO_UDP = 5500;
export const PUERTO_WEB = 3000;

export const NODOS: { [key: string]: NodoConfig } = {
  maestro: { id: 'maestro', ip: '192.168.1.10', rol: 'maestro' },
  '1': { id: '1', ip: '192.168.1.11', rol: 'esclavo' },
  '2': { id: '2', ip: '192.168.1.12', rol: 'esclavo' },
  '3': { id: '3', ip: '192.168.1.13', rol: 'esclavo' },
  '4': { id: '4', ip: '192.168.1.14', rol: 'esclavo' },
};

// Obtiene todas las IPs de las interfaces de red locales
function obtenerIpsLocales(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        // Filtramos IPv4 que no sean loopback
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
  }
  return ips;
}

// Determinar la identidad del nodo en base a su IP de interfaz de red o fallback de entorno
export function obtenerConfiguracionNodoActual(): NodoConfig {
  const ipsLocales = obtenerIpsLocales();
  
  // 1. Intentar autodetectar buscando coincidencias con las IPs configuradas
  for (const ip of ipsLocales) {
    const nodoEncontrado = Object.values(NODOS).find(n => n.ip === ip);
    if (nodoEncontrado) {
      return nodoEncontrado;
    }
  }

  // 2. Si no coincide (por ejemplo, en desarrollo local / localhost)
  // leemos de la variable de entorno NODE_ID (ej. NODE_ID=maestro, NODE_ID=1, etc.)
  const envId = process.env.NODE_ID || 'maestro'; // por defecto maestro en desarrollo local
  const config = NODOS[envId];
  if (config) {
    // Si estamos en desarrollo local (localhost), usamos la IP local real o localhost
    return {
      ...config,
      ip: '127.0.0.1', // Para desarrollo local simulado
    };
  }

  // Fallback seguro
  return { id: 'maestro', ip: '127.0.0.1', rol: 'maestro' };
}
