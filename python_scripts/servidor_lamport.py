import socket
import threading
import time
import json
from datetime import datetime
import random

class ServidorLamport:
    def __init__(self, puerto=5002):
        self.puerto = puerto
        self.server_ip = "192.168.1.10"
        self.reloj_logico = 0  # Reloj lógico de Lamport
        self.lock = threading.Lock()  # Para acceso seguro al reloj
        self.clientes_conectados = {}  # Diccionario de clientes conectados
        self.eventos = []  # Lista para registrar eventos
        
    def incrementar_reloj(self):
        """Incrementa el reloj lógico"""
        with self.lock:
            self.reloj_logico += 1
            return self.reloj_logico
    
    def actualizar_reloj(self, timestamp_recibido):
        """Actualiza el reloj lógico según el algoritmo de Lamport"""
        with self.lock:
            self.reloj_logico = max(self.reloj_logico, timestamp_recibido) + 1
            return self.reloj_logico
    
    def registrar_evento(self, evento, direccion=None):
        """Registra un evento para seguimiento"""
        timestamp = self.reloj_logico
        evento_reg = {
            'timestamp': timestamp,
            'evento': evento,
            'direccion': str(direccion),
            'hora_real': datetime.now().strftime('%H:%M:%S.%f')[:-3]
        }
        self.eventos.append(evento_reg)
        return timestamp
    
    def manejar_cliente_tcp(self, cliente_socket, direccion):
        """Maneja la conexión TCP de un cliente"""
        try:
            # Evento: nuevo cliente conectado
            timestamp_connect = self.incrementar_reloj()
            self.registrar_evento("CLIENTE_CONECTADO", direccion)
            print(f"[TCP Lamport] Cliente {direccion} conectado - Timestamp: {timestamp_connect}")
            
            # Registrar cliente
            self.clientes_conectados[direccion] = {
                'socket': cliente_socket,
                'protocolo': 'TCP',
                'ultimo_timestamp': timestamp_connect
            }
            
            while True:
                datos = cliente_socket.recv(4096)
                if not datos:
                    break
                
                mensaje = json.loads(datos.decode('utf-8'))
                timestamp_recibido = mensaje.get('timestamp', 0)
                
                # Actualizar reloj lógico con el timestamp del mensaje
                timestamp_actual = self.actualizar_reloj(timestamp_recibido)
                
                print(f"\n[TCP Lamport] Mensaje de {direccion}:")
                print(f"  Tipo: {mensaje['tipo']}")
                print(f"  Timestamp del mensaje: {timestamp_recibido}")
                print(f"  Reloj local actualizado: {timestamp_actual}")
                
                if mensaje['tipo'] == 'SOLICITAR_EVENTO':
                    # Cliente solicita generar un evento
                    evento_cliente = mensaje.get('evento', 'EVENTO_SIN_NOMBRE')
                    
                    # Registrar evento del cliente
                    self.registrar_evento(f"EVENTO_CLIENTE:{evento_cliente}", direccion)
                    
                    # Responder al cliente
                    respuesta = {
                        'tipo': 'RESPUESTA_EVENTO',
                        'timestamp': timestamp_actual,
                        'evento_recibido': evento_cliente,
                        'mensaje': f"Evento '{evento_cliente}' procesado"
                    }
                    cliente_socket.send(json.dumps(respuesta).encode('utf-8'))
                    
                    print(f"  Evento cliente: {evento_cliente}")
                    print(f"  Respuesta enviada con timestamp: {timestamp_actual}")
                    
                elif mensaje['tipo'] == 'CONSULTAR_RELOJ':
                    # Cliente consulta el reloj lógico
                    respuesta = {
                        'tipo': 'RELOJ_ACTUAL',
                        'timestamp': timestamp_actual,
                        'reloj_servidor': self.reloj_logico
                    }
                    cliente_socket.send(json.dumps(respuesta).encode('utf-8'))
                    print(f"  Reloj consultado: {self.reloj_logico}")
                
                elif mensaje['tipo'] == 'ENVIAR_MENSAJE':
                    # Cliente envía mensaje a otro cliente (simulado)
                    destino = mensaje.get('destino', 'DESCONOCIDO')
                    contenido = mensaje.get('contenido', '')
                    
                    # Registrar evento de envío
                    self.registrar_evento(f"ENVIO_MENSAJE:{destino}", direccion)
                    
                    respuesta = {
                        'tipo': 'MENSAJE_ENVIADO',
                        'timestamp': timestamp_actual,
                        'destino': destino,
                        'contenido': contenido
                    }
                    cliente_socket.send(json.dumps(respuesta).encode('utf-8'))
                    
                    print(f"  Mensaje enviado a {destino}: {contenido}")
                    
                # Actualizar último timestamp del cliente
                self.clientes_conectados[direccion]['ultimo_timestamp'] = timestamp_actual
                
                # Mostrar estado actual del reloj
                print(f"  Estado actual del reloj lógico: {self.reloj_logico}")
                
        except Exception as e:
            print(f"[TCP Lamport] Error con {direccion}: {e}")
        finally:
            # Evento: cliente desconectado
            timestamp_disconnect = self.incrementar_reloj()
            self.registrar_evento("CLIENTE_DESCONECTADO", direccion)
            print(f"[TCP Lamport] Cliente {direccion} desconectado - Timestamp: {timestamp_disconnect}")
            
            if direccion in self.clientes_conectados:
                del self.clientes_conectados[direccion]
            cliente_socket.close()
    
    def manejar_cliente_udp(self, servidor_udp):
        """Maneja solicitudes UDP"""
        while True:
            try:
                datos, direccion = servidor_udp.recvfrom(4096)
                mensaje = json.loads(datos.decode('utf-8'))
                timestamp_recibido = mensaje.get('timestamp', 0)
                
                # Actualizar reloj lógico con el timestamp del mensaje
                timestamp_actual = self.actualizar_reloj(timestamp_recibido)
                
                print(f"\n[UDP Lamport] Mensaje de {direccion}:")
                print(f"  Tipo: {mensaje['tipo']}")
                print(f"  Timestamp del mensaje: {timestamp_recibido}")
                print(f"  Reloj local actualizado: {timestamp_actual}")
                
                if mensaje['tipo'] == 'SOLICITAR_EVENTO':
                    evento_cliente = mensaje.get('evento', 'EVENTO_SIN_NOMBRE')
                    
                    # Registrar evento
                    self.registrar_evento(f"EVENTO_CLIENTE:{evento_cliente}", direccion)
                    
                    # Responder por UDP
                    respuesta = {
                        'tipo': 'RESPUESTA_EVENTO',
                        'timestamp': timestamp_actual,
                        'evento_recibido': evento_cliente,
                        'mensaje': f"Evento '{evento_cliente}' procesado"
                    }
                    servidor_udp.sendto(json.dumps(respuesta).encode('utf-8'), direccion)
                    
                    print(f"  Evento cliente: {evento_cliente}")
                    
                elif mensaje['tipo'] == 'CONSULTAR_RELOJ':
                    respuesta = {
                        'tipo': 'RELOJ_ACTUAL',
                        'timestamp': timestamp_actual,
                        'reloj_servidor': self.reloj_logico
                    }
                    servidor_udp.sendto(json.dumps(respuesta).encode('utf-8'), direccion)
                    print(f"  Reloj consultado: {self.reloj_logico}")
                
                print(f"  Estado actual del reloj lógico: {self.reloj_logico}")
                
            except Exception as e:
                print(f"[UDP Lamport] Error: {e}")
    
    def iniciar_servidor_tcp(self):
        """Inicia el servidor TCP"""
        servidor_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        servidor_tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        servidor_tcp.bind((self.server_ip, self.puerto))
        servidor_tcp.listen(10)
        print(f"[TCP Lamport] Servidor escuchando en {self.server_ip}:{self.puerto}")
        
        while True:
            cliente_socket, direccion = servidor_tcp.accept()
            threading.Thread(target=self.manejar_cliente_tcp, 
                           args=(cliente_socket, direccion)).start()
    
    def iniciar_servidor_udp(self):
        """Inicia el servidor UDP"""
        servidor_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        servidor_udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        servidor_udp.bind((self.server_ip, self.puerto))
        print(f"[UDP Lamport] Servidor escuchando en {self.server_ip}:{self.puerto}")
        
        self.manejar_cliente_udp(servidor_udp)
    
    def mostrar_resumen_eventos(self):
        """Muestra un resumen periódico de eventos"""
        while True:
            time.sleep(30)  # Cada 30 segundos
            print("\n" + "="*70)
            print("=== RESUMEN DE EVENTOS (LAMPORT) ===")
            print(f"Reloj Lógico Actual: {self.reloj_logico}")
            print(f"Total de eventos registrados: {len(self.eventos)}")
            print("\nÚltimos 10 eventos:")
            for evento in self.eventos[-10:]:
                print(f"  [{evento['timestamp']:3d}] {evento['evento']:30s} - {evento['direccion']:20s} ({evento['hora_real']})")
            print("="*70 + "\n")
    
    def iniciar(self):
        """Inicia el servidor de Lamport"""
        print("="*70)
        print("=== SERVIDOR ALGORITMO DE LAMPORT (RELOJES LÓGICOS) ===")
        print(f"IP del Servidor: {self.server_ip}")
        print(f"Puerto: {self.puerto} (TCP y UDP)")
        print("="*70)
        print("El algoritmo de Lamport mantiene un reloj lógico para ordenar eventos")
        print("No sincroniza tiempo real, sino el orden de ocurrencia de eventos\n")
        
        # Hilo para mostrar resumen
        hilo_resumen = threading.Thread(target=self.mostrar_resumen_eventos)
        hilo_resumen.daemon = True
        hilo_resumen.start()
        
        # Hilos para TCP y UDP
        hilo_tcp = threading.Thread(target=self.iniciar_servidor_tcp)
        hilo_udp = threading.Thread(target=self.iniciar_servidor_udp)
        
        hilo_tcp.daemon = True
        hilo_udp.daemon = True
        
        hilo_tcp.start()
        hilo_udp.start()
        
        try:
            hilo_tcp.join()
            hilo_udp.join()
        except KeyboardInterrupt:
            print("\n[Servidor Lamport] Deteniendo...")
            print(f"Reloj lógico final: {self.reloj_logico}")
            print(f"Total eventos procesados: {len(self.eventos)}")

if __name__ == "__main__":
    servidor = ServidorLamport(puerto=5002)
    servidor.iniciar()