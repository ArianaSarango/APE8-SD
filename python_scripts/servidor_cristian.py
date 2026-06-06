import socket
import time
import threading
from datetime import datetime, timezone

class ServidorCristian:
    def __init__(self, tcp_port=5001, udp_port=5001):
        self.tcp_port = tcp_port
        self.udp_port = udp_port
        self.server_ip = "192.168.1.10"
        
    def iniciar_servidor_tcp(self):
        """Servidor TCP para el algoritmo de Cristian"""
        servidor_tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        servidor_tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        servidor_tcp.bind((self.server_ip, self.tcp_port))
        servidor_tcp.listen(5)
        print(f"[TCP] Servidor escuchando en {self.server_ip}:{self.tcp_port}")
        
        while True:
            cliente_socket, direccion = servidor_tcp.accept()
            print(f"[TCP] Conexión recibida desde {direccion}")
            # Crear un hilo para manejar cada cliente TCP
            threading.Thread(target=self.manejar_cliente_tcp, 
                           args=(cliente_socket, direccion)).start()
    
    def manejar_cliente_tcp(self, cliente_socket, direccion):
        """Maneja la solicitud TCP del cliente"""
        try:
            while True:
                datos = cliente_socket.recv(1024)
                if not datos:
                    break
                    
                mensaje = datos.decode('utf-8')
                print(f"[TCP] Mensaje de {direccion}: {mensaje}")
                
                if mensaje == "SOLICITUD_HORA":
                    # Enviar la hora actual UTC del servidor
                    hora_servidor = time.time()
                    cliente_socket.send(str(hora_servidor).encode('utf-8'))
                    hora_utc = datetime.fromtimestamp(hora_servidor, tz=timezone.utc)
                    print(f"[TCP] Hora UTC enviada a {direccion}: {hora_utc.strftime('%H:%M:%S.%f')[:-3]}")
                    
        except Exception as e:
            print(f"[TCP] Error con {direccion}: {e}")
        finally:
            cliente_socket.close()
            print(f"[TCP] Conexión cerrada con {direccion}")
    
    def iniciar_servidor_udp(self):
        """Servidor UDP para el algoritmo de Cristian"""
        servidor_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        servidor_udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        servidor_udp.bind((self.server_ip, self.udp_port))
        print(f"[UDP] Servidor escuchando en {self.server_ip}:{self.udp_port}")
        
        while True:
            try:
                datos, direccion = servidor_udp.recvfrom(1024)
                mensaje = datos.decode('utf-8')
                print(f"[UDP] Mensaje de {direccion}: {mensaje}")
                
                if mensaje == "SOLICITUD_HORA":
                    # Enviar la hora actual UTC del servidor
                    hora_servidor = time.time()
                    servidor_udp.sendto(str(hora_servidor).encode('utf-8'), direccion)
                    hora_utc = datetime.fromtimestamp(hora_servidor, tz=timezone.utc)
                    print(f"[UDP] Hora UTC enviada a {direccion}: {hora_utc.strftime('%H:%M:%S.%f')[:-3]}")
                    
            except Exception as e:
                print(f"[UDP] Error: {e}")
    
    def iniciar(self):
        """Inicia ambos servidores en hilos separados"""
        print("="*60)
        print("=== SERVIDOR ALGORITMO DE CRISTIAN ===")
        print(f"IP del Servidor: {self.server_ip}")
        print(f"Puerto TCP: {self.tcp_port}")
        print(f"Puerto UDP: {self.udp_port}")
        print("="*60)
        print("Esperando solicitudes...\n")
        
        # Crear hilos para TCP y UDP
        hilo_tcp = threading.Thread(target=self.iniciar_servidor_tcp)
        hilo_udp = threading.Thread(target=self.iniciar_servidor_udp)
        
        hilo_tcp.daemon = True
        hilo_udp.daemon = True
        
        hilo_tcp.start()
        hilo_udp.start()
        
        # Mantener el servidor corriendo
        try:
            hilo_tcp.join()
            hilo_udp.join()
        except KeyboardInterrupt:
            print("\n[Servidor] Deteniendo...")

if __name__ == "__main__":
    servidor = ServidorCristian(tcp_port=5001, udp_port=5001)
    servidor.iniciar()
