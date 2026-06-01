#!/usr/bin/env python3
"""
Cliente Berkeley — escucha solicitudes del coordinador, responde con su hora
y aplica la corrección al promedio del grupo.

Uso (en cada máquina cliente 1..4):
    python cliente_berkeley.py --numero 3
"""

import argparse
import json
import socket
import threading
import time
from datetime import datetime, timezone

SERVIDOR_IP = "192.168.1.10"
PUERTO = 5000
RESTA_HORAS = 5
OFFSET_SEGUNDOS = -RESTA_HORAS * 3600

IPS_LOCALES = {
    1: "192.168.1.11",
    2: "192.168.1.12",
    3: "192.168.1.13",
    4: "192.168.1.14",
}


def hora_actual():
    """Hora del sistema menos 5 horas."""
    return time.time() + OFFSET_SEGUNDOS


def ajustar_recibida(epoch):
    """Valor recibido del servidor menos 5 horas (por si viene en UTC crudo)."""
    return float(epoch) + OFFSET_SEGUNDOS


def fmt(epoch):
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%H:%M:%S")


def log_sync(nodo, protocolo, actual, calculada, desfase_ms):
    print(
        f"[{nodo}|{protocolo}] actual={fmt(actual)} "
        f"calculada={fmt(calculada)} desfase={desfase_ms:+.0f}ms"
    )


def enviar_json_tcp(sock, msg):
    sock.sendall(json.dumps(msg).encode("utf-8") + b"\n")


def recibir_json_tcp(sock):
    buf = b""
    while b"\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("conexión cerrada")
        buf += chunk
    linea, _ = buf.split(b"\n", 1)
    return json.loads(linea.decode("utf-8"))


class ClienteBerkeley:
    def __init__(self, numero):
        self.numero = numero
        self.cliente_id = f"CLIENTE_{numero}"
        self.offset = 0.0
        self.ultima_hora = time.time()
        self.lock = threading.Lock()

    def aplicar_correccion(self, correccion, promedio, protocolo, hora_enviada):
        with self.lock:
            self.offset = float(correccion)
            calculada = float(promedio)
            desfase_ms = correccion * 1000
        log_sync(self.cliente_id, protocolo, hora_enviada, calculada, desfase_ms)

    def escucha_udp(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", PUERTO))
        print(f"[{self.cliente_id}] UDP escuchando en puerto {PUERTO}")

        while True:
            datos, addr = sock.recvfrom(4096)
            msg = json.loads(datos.decode("utf-8"))
            tipo = msg.get("tipo")

            if tipo == "SOLICITUD_HORA":
                with self.lock:
                    self.ultima_hora = hora_actual()
                respuesta = {
                    "tipo": "RESPUESTA_HORA",
                    "cliente_id": self.cliente_id,
                    "hora": time.time(),
                }
                sock.sendto(json.dumps(respuesta).encode("utf-8"), addr)

            elif tipo == "CORRECCION":
                with self.lock:
                    hora_reportada = self.ultima_hora
                self.aplicar_correccion(
                    msg["correccion"],
                    float(msg["promedio"]),
                    "UDP",
                    hora_reportada,
                )

    def manejar_tcp(self, conn):
        try:
            msg = recibir_json_tcp(conn)
            if msg.get("tipo") == "SOLICITUD_HORA":
                self.ultima_hora = hora_actual()
                enviar_json_tcp(conn, {
                    "tipo": "RESPUESTA_HORA",
                    "cliente_id": self.cliente_id,
                    "hora": time.time(),
                })
                corr = recibir_json_tcp(conn)
                if corr.get("tipo") == "CORRECCION":
                    self.aplicar_correccion(
                        corr["correccion"],
                        float(corr["promedio"]),
                        "TCP",
                        self.ultima_hora,
                    )
        except (json.JSONDecodeError, ConnectionError, OSError):
            pass
        finally:
            conn.close()

    def escucha_tcp(self):
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("0.0.0.0", PUERTO))
        srv.listen(5)
        print(f"[{self.cliente_id}] TCP escuchando en puerto {PUERTO}")

        while True:
            conn, _ = srv.accept()
            threading.Thread(target=self.manejar_tcp, args=(conn,), daemon=True).start()

    def iniciar(self):
        print(
            f"[{self.cliente_id}] IP {IPS_LOCALES[self.numero]} — "
            f"esperando al servidor {SERVIDOR_IP}"
        )
        threading.Thread(target=self.escucha_udp, daemon=True).start()
        threading.Thread(target=self.escucha_tcp, daemon=True).start()
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print(f"[{self.cliente_id}] Detenido.")


def main():
    p = argparse.ArgumentParser(description="Cliente Berkeley (escucha y responde)")
    p.add_argument("--numero", "-n", type=int, required=True, choices=[1, 2, 3, 4])
    args = p.parse_args()
    ClienteBerkeley(args.numero).iniciar()


if __name__ == "__main__":
    main()
