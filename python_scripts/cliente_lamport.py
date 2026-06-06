import socket
import threading
import time
import json
from datetime import datetime
import random

class ClienteLamport:
    def __init__(self, servidor_ip="192.168.1.10", puerto=5000, cliente_id=None):
        self.servidor_ip = servidor_ip
        self.puerto = puerto
        self.cliente_ip = "192.168.1.11"  # Cambiar según el cliente
        self.cliente_id = cliente_id or self.cliente_ip
        self.reloj_logico = 0  # Reloj lógico del cliente
        self.lock = threading.Lock()
        
    def incrementar_reloj(self):
        """Incrementa el reloj lógico local"""
        with self.lock:
            self.reloj_logico += 1
            return self.reloj_logico
    
    def actualizar_reloj(self, timestamp_recibido):
        """Actualiza el reloj lógico según algoritmo de Lamport"""
        with self.lock:
            self.reloj_logico = max(self.reloj_logico, timestamp_recibido) + 1
            return self.reloj_logico
    
    def generar_evento_local(self, nombre_evento):
        """Genera un evento local (incrementa el reloj)"""
        timestamp = self.incrementar_reloj()
        print(f"  [Evento Local] {nombre_evento} - Timestamp: {timestamp}")
        return timestamp
    
    def solicitar_evento_tcp(self, evento_nombre):
        """Solicita procesar un evento en el servidor usando TCP"""
        print(f"\n[Cliente {self.cliente_id}] Solicitando evento TCP: {evento_nombre}")
        
        try:
            cliente_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            cliente_tcp.settimeout(5)
            cliente_tcp.connect((self.servidor_ip, self.puerto))
            
            # Incrementar reloj local para el evento de envío
            timestamp_envio = self.incrementar_reloj()
            
            mensaje = {
                'tipo': 'SOLICITAR_EVENTO',
                'evento': evento_nombre,
                'timestamp': timestamp_envio,
                'cliente_id': self.cliente_id
            }
            
            print(f"  Enviando solicitud con timestamp: {timestamp_envio}")
            cliente_tcp.send(json.dumps(mensaje).encode('utf-8'))
            
            # Recibir respuesta
            datos = cliente_tcp.recv(4096)
            respuesta = json.loads(datos.decode('utf-8'))
            
            # Actualizar reloj con el timestamp de respuesta
            timestamp_respuesta = respuesta.get('timestamp', 0)
            self.actualizar_reloj(timestamp_respuesta)
            
            print(f"  Respuesta recibida: {respuesta.get('mensaje', '')}")
            print(f"  Timestamp respuesta: {timestamp_respuesta}")
            print(f"  Reloj local actualizado: {self.reloj_logico}")
            
            cliente_tcp.close()
            return True
            
        except Exception as e:
            print(f"  Error TCP: {e}")
            return False
    
    def consultar_reloj_tcp(self):
        """Consulta el reloj lógico del servidor usando TCP"""
        print(f"\n[Cliente {self.cliente_id}] Consultando reloj del servidor...")
        
        try:
            cliente_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            cliente_tcp.settimeout(5)
            cliente_tcp.connect((self.servidor_ip, self.puerto))
            
            timestamp_envio = self.incrementar_reloj()
            mensaje = {
                'tipo': 'CONSULTAR_RELOJ',
                'timestamp': timestamp_envio,
                'cliente_id': self.cliente_id
            }
            
            cliente_tcp.send(json.dumps(mensaje).encode('utf-8'))
            datos = cliente_tcp.recv(4096)
            respuesta = json.loads(datos.decode('utf-8'))
            
            reloj_servidor = respuesta.get('reloj_servidor', 0)
            timestamp_respuesta = respuesta.get('timestamp', 0)
            
            self.actualizar_reloj(timestamp_respuesta)
            
            print(f"  Reloj del servidor: {reloj_servidor}")
            print(f"  Reloj local: {self.reloj_logico}")
            print(f"  Diferencia: {reloj_servidor - self.reloj_logico}")
            
            cliente_tcp.close()
            return reloj_servidor
            
        except Exception as e:
            print(f"  Error TCP: {e}")
            return None
    
    def solicitar_evento_udp(self, evento_nombre):
        """Solicita procesar un evento en el servidor usando UDP"""
        print(f"\n[Cliente {self.cliente_id}] Solicitando evento UDP: {evento_nombre}")
        
        try:
            cliente_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            cliente_udp.settimeout(5)
            
            timestamp_envio = self.incrementar_reloj()
            mensaje = {
                'tipo': 'SOLICITAR_EVENTO',
                'evento': evento_nombre,
                'timestamp': timestamp_envio,
                'cliente_id': self.cliente_id
            }
            
            print(f"  Enviando solicitud con timestamp: {timestamp_envio}")
            cliente_udp.sendto(json.dumps(mensaje).encode('utf-8'), 
                             (self.servidor_ip, self.puerto))
            
            # Recibir respuesta
            datos, _ = cliente_udp.recvfrom(4096)
            respuesta = json.loads(datos.decode('utf-8'))
            
            timestamp_respuesta = respuesta.get('timestamp', 0)
            self.actualizar_reloj(timestamp_respuesta)
            
            print(f"  Respuesta recibida: {respuesta.get('mensaje', '')}")
            print(f"  Timestamp respuesta: {timestamp_respuesta}")
            print(f"  Reloj local actualizado: {self.reloj_logico}")
            
            cliente_udp.close()
            return True
            
        except socket.timeout:
            print(f"  UDP Error: Timeout - No se recibió respuesta")
            return False
        except Exception as e:
            print(f"  UDP Error: {e}")
            return False
    
    def simular_eventos_concurrentes(self, num_eventos=5):
        """Simula múltiples eventos concurrentes para demostrar el algoritmo"""
        print(f"\n{'='*60}")
        print(f"SIMULANDO {num_eventos} EVENTOS CONCURRENTES")
        print(f"{'='*60}")
        
        eventos = [
            "CLICK_BOTON",
            "ENVIO_DATOS",
            "PROCESAMIENTO",
            "LECTURA_ARCHIVO",
            "ESCRITURA_LOG",
            "CONSULTA_DB",
            "RENDERIZADO",
            "COMPRESION"
        ]
        
        for i in range(num_eventos):
            evento = random.choice(eventos)
            self.generar_evento_local(f"PRE-{evento}")
            
            # Alternar entre TCP y UDP
            if i % 2 == 0:
                self.solicitar_evento_tcp(evento)
            else:
                self.solicitar_evento_udp(evento)
            
            time.sleep(random.uniform(0.1, 0.5))
        
        print(f"\nReloj lógico final después de {num_eventos} eventos: {self.reloj_logico}")
    
    def ejecutar_prueba_completa(self):
        """Ejecuta prueba completa del algoritmo de Lamport"""
        print("\n" + "="*70)
        print(f"=== CLIENTE LAMPORT {self.cliente_id} ===")
        print(f"IP Cliente: {self.cliente_ip}")
        print(f"Servidor: {self.servidor_ip}:{self.puerto}")
        print("="*70)
        print("\nEl algoritmo de Lamport asigna timestamps lógicos a los eventos")
        print("para mantener un orden causal entre ellos\n")
        
        # Evento inicial
        self.generar_evento_local("INICIO_CLIENTE")
        print(f"Reloj lógico inicial: {self.reloj_logico}")
        
        # Prueba 1: Evento simple con TCP
        print("\n--- PRUEBA 1: Evento simple TCP ---")
        self.solicitar_evento_tcp("PRUEBA_INICIAL_TCP")
        
        time.sleep(1)
        
        # Prueba 2: Evento simple con UDP
        print("\n--- PRUEBA 2: Evento simple UDP ---")
        self.solicitar_evento_udp("PRUEBA_INICIAL_UDP")
        
        time.sleep(1)
        
        # Prueba 3: Consulta de reloj
        print("\n--- PRUEBA 3: Consulta de reloj ---")
        self.consultar_reloj_tcp()
        
        time.sleep(1)
        
        # Prueba 4: Eventos concurrentes
        print("\n--- PRUEBA 4: Eventos concurrentes ---")
        self.simular_eventos_concurrentes(6)
        
        # Prueba 5: Eventos con diferentes prioridades
        print("\n--- PRUEBA 5: Eventos con dependencias ---")
        print("\n[Demostrando relación de causalidad]")
        
        # Evento A
        timestamp_a = self.generar_evento_local("EVENTO_A")
        print(f"Evento A ocurre en timestamp: {timestamp_a}")
        
        # Evento B (después de A)
        self.actualizar_reloj(timestamp_a)
        timestamp_b = self.incrementar_reloj()
        print(f"Evento B (después de A) timestamp: {timestamp_b}")
        
        # Verificar causalidad
        if timestamp_b > timestamp_a:
            print(f"✓ Relación causal: A → B (A antes que B)")
        
        # Consulta final
        print("\n--- CONSULTA FINAL ---")
        reloj_servidor = self.consultar_reloj_tcp()
        
        print(f"\n{'='*70}")
        print(f"RESUMEN FINAL CLIENTE {self.cliente_id}")
        print(f"  Reloj lógico local: {self.reloj_logico}")
        print(f"  Reloj lógico servidor: {reloj_servidor}")
        print(f"  Total eventos generados: {self.reloj_logico}")
        print(f"{'='*70}")

if __name__ == "__main__":
    # Para múltiples clientes, cambia el ID y la IP
    
    # Cliente 1
    cliente1 = ClienteLamport(
        servidor_ip="192.168.1.10",
        puerto=5000,
        cliente_id="CLIENTE_1"
    )
    cliente1.cliente_ip = "192.168.1.11"
    cliente1.ejecutar_prueba_completa()
    
    # Para ejecutar múltiples clientes (descomentar para 5 máquinas)
    # time.sleep(2)
    # cliente2 = ClienteLamport(
    #     servidor_ip="192.168.1.10",
    #     puerto=5000,
    #     cliente_id="CLIENTE_2"
    # )
    # cliente2.cliente_ip = "192.168.1.12"
    # cliente2.ejecutar_prueba_completa()