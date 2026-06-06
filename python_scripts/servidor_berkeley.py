#!/usr/bin/env python3
"""
Coordinador Berkeley — solicita la hora a 4 clientes, calcula el promedio
y envía la corrección a cada uno.

Máquina servidor: python servidor_berkeley.py
"""

import json
import socket
import time
from datetime import datetime, timezone

RESTA_HORAS = 5
OFFSET_SEGUNDOS = -RESTA_HORAS * 3600

HOST = "0.0.0.0"
PUERTO = 5000
INTERVALO_RONDA = 5
TIMEOUT_RESPUESTA = 4

CLIENTES = {
    "CLIENTE_1": "192.168.1.11",
    "CLIENTE_2": "192.168.1.12",
    "CLIENTE_3": "192.168.1.13",
    "CLIENTE_4": "192.168.1.14",
}


def hora_actual():
    """Hora del sistema menos 5 horas."""
    return time.time() + OFFSET_SEGUNDOS


def ajustar_recibida(epoch):
    """Hora recibida de un cliente menos 5 horas."""
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


class ServidorBerkeley:
    def __init__(self):
        self.offset = 0.0
        self.sock_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock_udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock_udp.bind((HOST, PUERTO))
        self.sock_udp.settimeout(0.2)

    def calcular_berkeley(self, horas_clientes):
        """horas_clientes: dict id -> epoch. Incluye hora del servidor al calcular."""
        hora_srv = hora_actual()
        valores = list(horas_clientes.values()) + [hora_srv]
        promedio = sum(valores) / len(valores)
        correcciones = {cid: promedio - h for cid, h in horas_clientes.items()}
        correccion_srv = promedio - hora_srv
        return promedio, correcciones, correccion_srv, hora_srv

    def ronda_udp(self):
        solicitud = json.dumps({"tipo": "SOLICITUD_HORA"}).encode("utf-8")
        for ip in CLIENTES.values():
            self.sock_udp.sendto(solicitud, (ip, PUERTO))

        respuestas = {}
        fin = time.time() + TIMEOUT_RESPUESTA
        while len(respuestas) < len(CLIENTES) and time.time() < fin:
            restante = fin - time.time()
            if restante <= 0:
                break
            self.sock_udp.settimeout(restante)
            try:
                datos, addr = self.sock_udp.recvfrom(4096)
            except socket.timeout:
                break
            msg = json.loads(datos.decode("utf-8"))
            if msg.get("tipo") != "RESPUESTA_HORA":
                continue
            cid = msg.get("cliente_id")
            if cid in CLIENTES:
                respuestas[cid] = {
                    "hora": ajustar_recibida(msg["hora"]),
                    "addr": addr,
                }

        if not respuestas:
            print("[SERVIDOR|UDP] sin respuestas")
            return

        horas = {cid: d["hora"] for cid, d in respuestas.items()}
        promedio, corr, corr_srv, hora_srv = self.calcular_berkeley(horas)
        self.offset = corr_srv
        log_sync("SERVIDOR", "UDP", hora_srv, promedio, corr_srv * 1000)

        base = {"tipo": "CORRECCION", "promedio": promedio}
        for cid, datos in respuestas.items():
            paquete = {**base, "correccion": corr[cid]}
            self.sock_udp.sendto(json.dumps(paquete).encode("utf-8"), datos["addr"])

    def ronda_tcp(self):
        conexiones = {}
        solicitud = {"tipo": "SOLICITUD_HORA"}

        for cid, ip in CLIENTES.items():
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(TIMEOUT_RESPUESTA)
                s.connect((ip, PUERTO))
                enviar_json_tcp(s, solicitud)
                resp = recibir_json_tcp(s)
                if resp.get("tipo") == "RESPUESTA_HORA":
                    conexiones[cid] = (s, ajustar_recibida(resp["hora"]))
                else:
                    s.close()
            except OSError:
                pass

        if not conexiones:
            print("[SERVIDOR|TCP] sin respuestas")
            return

        horas = {cid: h for cid, (_, h) in conexiones.items()}
        promedio, corr, corr_srv, hora_srv = self.calcular_berkeley(horas)
        self.offset = corr_srv
        log_sync("SERVIDOR", "TCP", hora_srv, promedio, corr_srv * 1000)

        base = {"tipo": "CORRECCION", "promedio": promedio}
        for cid, (s, _) in conexiones.items():
            try:
                enviar_json_tcp(s, {**base, "correccion": corr[cid]})
            except OSError:
                pass
            finally:
                s.close()

    def bucle_rondas(self):
        while True:
            self.ronda_udp()
            self.ronda_tcp()
            time.sleep(INTERVALO_RONDA)

    def iniciar(self):
        print(f"[SERVIDOR] Berkeley — puerto {PUERTO}, ronda cada {INTERVALO_RONDA}s")
        print(f"[SERVIDOR] Clientes: {', '.join(CLIENTES.values())}")
        try:
            self.bucle_rondas()
        except KeyboardInterrupt:
            print("[SERVIDOR] Detenido.")


if __name__ == "__main__":
    ServidorBerkeley().iniciar()
