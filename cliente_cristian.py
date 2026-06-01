import socket
import time
from datetime import datetime, timezone

class ClienteCristian:
    def __init__(self, servidor_ip="192.168.1.10", tcp_port=5000, udp_port=5001):
        self.servidor_ip = servidor_ip
        self.tcp_port = tcp_port
        self.udp_port = udp_port
        self.cliente_ip = "192.168.1.11"
    
    def sincronizar_tcp(self):
        """Sincronización usando TCP"""
        print("\n" + "="*60)
        print("=== SINCRONIZACIÓN POR TCP ===")
        print("="*60)
        
        try:
            # Conectar al servidor TCP
            cliente_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            cliente_tcp.settimeout(5)  # Timeout de 5 segundos
            cliente_tcp.connect((self.servidor_ip, self.tcp_port))
            
            # Registrar tiempo de envío (UTC)
            tiempo_envio = time.time()
            hora_envio_utc = datetime.fromtimestamp(tiempo_envio, tz=timezone.utc)
            print(f"\n[TCP] Hora local UTC (envío): {hora_envio_utc.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            
            # Enviar solicitud
            cliente_tcp.send("SOLICITUD_HORA".encode('utf-8'))
            
            # Recibir hora del servidor
            datos = cliente_tcp.recv(1024)
            tiempo_recepcion = time.time()
            hora_recepcion_utc = datetime.fromtimestamp(tiempo_recepcion, tz=timezone.utc)
            
            hora_servidor = float(datos.decode('utf-8'))
            hora_servidor_utc = datetime.fromtimestamp(hora_servidor, tz=timezone.utc)
            
            # Calcular delay (RTT)
            rtt = tiempo_recepcion - tiempo_envio
            
            # Calcular hora sincronizada
            hora_sincronizada = hora_servidor + (rtt / 2)
            hora_sincronizada_utc = datetime.fromtimestamp(hora_sincronizada, tz=timezone.utc)
            
            # Calcular desfase
            hora_local_actual = time.time()
            desfase = hora_sincronizada - hora_local_actual
            
            print(f"\n[TCP] RESULTADOS (TODAS LAS HORAS EN UTC):")
            print(f"  Cliente IP: {self.cliente_ip}")
            print(f"  Servidor IP: {self.servidor_ip}:{self.tcp_port}")
            print(f"  ─────────────────────────────────────────")
            print(f"  Hora local (envío):     {hora_envio_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  Hora del servidor:      {hora_servidor_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  Hora local (recepción): {hora_recepcion_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  ─────────────────────────────────────────")
            print(f"  RTT (delay):            {rtt*1000:.3f} ms")
            print(f"  RTT/2:                  {(rtt/2)*1000:.3f} ms")
            print(f"  Hora sincronizada:      {hora_sincronizada_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  ─────────────────────────────────────────")
            print(f"  Desfase:                {desfase*1000:.3f} ms")
            
            if desfase > 0:
                print(f"  → El reloj local está ATRASADO {abs(desfase*1000):.3f} ms")
            elif desfase < 0:
                print(f"  → El reloj local está ADELANTADO {abs(desfase*1000):.3f} ms")
            else:
                print(f"  → Los relojes están perfectamente sincronizados")
            
            # Mostrar también hora local para referencia
            hora_local_actual_dt = datetime.now()
            hora_sincronizada_local = datetime.fromtimestamp(hora_sincronizada)
            print(f"\n[TCP] HORA LOCAL (REFERENCIA):")
            print(f"  Hora local actual:      {hora_local_actual_dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            print(f"  Hora sincronizada:      {hora_sincronizada_local.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            
            cliente_tcp.close()
            
        except socket.timeout:
            print("[TCP] Error: Timeout al conectar con el servidor")
        except ConnectionRefusedError:
            print("[TCP] Error: No se pudo conectar al servidor. ¿Está el servidor ejecutándose?")
        except Exception as e:
            print(f"[TCP] Error: {e}")
    
    def sincronizar_udp(self):
        """Sincronización usando UDP"""
        print("\n" + "="*60)
        print("=== SINCRONIZACIÓN POR UDP ===")
        print("="*60)
        
        try:
            # Crear socket UDP
            cliente_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            cliente_udp.settimeout(5)  # Timeout de 5 segundos
            
            # Registrar tiempo de envío (UTC)
            tiempo_envio = time.time()
            hora_envio_utc = datetime.fromtimestamp(tiempo_envio, tz=timezone.utc)
            print(f"\n[UDP] Hora local UTC (envío): {hora_envio_utc.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            
            # Enviar solicitud
            cliente_udp.sendto("SOLICITUD_HORA".encode('utf-8'), 
                             (self.servidor_ip, self.udp_port))
            
            # Recibir respuesta
            datos, _ = cliente_udp.recvfrom(1024)
            tiempo_recepcion = time.time()
            hora_recepcion_utc = datetime.fromtimestamp(tiempo_recepcion, tz=timezone.utc)
            
            hora_servidor = float(datos.decode('utf-8'))
            hora_servidor_utc = datetime.fromtimestamp(hora_servidor, tz=timezone.utc)
            
            # Calcular delay (RTT)
            rtt = tiempo_recepcion - tiempo_envio
            
            # Calcular hora sincronizada
            hora_sincronizada = hora_servidor + (rtt / 2)
            hora_sincronizada_utc = datetime.fromtimestamp(hora_sincronizada, tz=timezone.utc)
            
            # Calcular desfase
            hora_local_actual = time.time()
            desfase = hora_sincronizada - hora_local_actual
            
            print(f"\n[UDP] RESULTADOS (TODAS LAS HORAS EN UTC):")
            print(f"  Cliente IP: {self.cliente_ip}")
            print(f"  Servidor IP: {self.servidor_ip}:{self.udp_port}")
            print(f"  ─────────────────────────────────────────")
            print(f"  Hora local (envío):     {hora_envio_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  Hora del servidor:      {hora_servidor_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  Hora local (recepción): {hora_recepcion_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  ─────────────────────────────────────────")
            print(f"  RTT (delay):            {rtt*1000:.3f} ms")
            print(f"  RTT/2:                  {(rtt/2)*1000:.3f} ms")
            print(f"  Hora sincronizada:      {hora_sincronizada_utc.strftime('%H:%M:%S.%f')[:-3]}")
            print(f"  ─────────────────────────────────────────")
            print(f"  Desfase:                {desfase*1000:.3f} ms")
            
            if desfase > 0:
                print(f"  → El reloj local está ATRASADO {abs(desfase*1000):.3f} ms")
            elif desfase < 0:
                print(f"  → El reloj local está ADELANTADO {abs(desfase*1000):.3f} ms")
            else:
                print(f"  → Los relojes están perfectamente sincronizados")
            
            # Mostrar también hora local para referencia
            hora_local_actual_dt = datetime.now()
            hora_sincronizada_local = datetime.fromtimestamp(hora_sincronizada)
            print(f"\n[UDP] HORA LOCAL (REFERENCIA):")
            print(f"  Hora local actual:      {hora_local_actual_dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            print(f"  Hora sincronizada:      {hora_sincronizada_local.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
            
            cliente_udp.close()
            
        except socket.timeout:
            print("[UDP] Error: Timeout al conectar con el servidor")
        except Exception as e:
            print(f"[UDP] Error: {e}")
    
    def ejecutar_pruebas(self):
        """Ejecuta pruebas con ambos protocolos"""
        print("="*60)
        print("=== CLIENTE ALGORITMO DE CRISTIAN ===")
        print(f"IP del Cliente: {self.cliente_ip}")
        print(f"IP del Servidor: {self.servidor_ip}")
        print(f"Puerto TCP Servidor: {self.tcp_port}")
        print(f"Puerto UDP Servidor: {self.udp_port}")
        print("="*60)
        
        # Probar con TCP
        self.sincronizar_tcp()
        
        print("\n" + "="*60)
        time.sleep(1)  # Pequeña pausa entre pruebas
        
        # Probar con UDP
        self.sincronizar_udp()
        
        print("\n" + "="*60)
        print("=== FIN DE LAS PRUEBAS ===")
        print("="*60)

if __name__ == "__main__":
    # Configuración con las IPs específicas
    cliente = ClienteCristian(
        servidor_ip="192.168.1.10",  # IP del servidor
        tcp_port=5000,                # Puerto TCP del servidor
        udp_port=5001                 # Puerto UDP del servidor
    )
    cliente.ejecutar_pruebas()