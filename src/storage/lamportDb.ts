import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { EventoCodigo } from '../network/tcpServer';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'lamport-history.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

let db: SqlJsDatabase | null = null;
let inicializacion: Promise<void> | null = null;

function asegurarDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('La base de datos Lamport no está inicializada.');
  }

  return db;
}

function persistirDb(): void {
  const database = asegurarDb();
  fs.writeFileSync(dbPath, Buffer.from(database.export()));
}

export async function inicializarLamportDb(): Promise<void> {
  if (inicializacion) {
    return inicializacion;
  }

  inicializacion = (async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    });

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(fileBuffer));
    } else {
      db = new SQL.Database();
    }

    asegurarDb().exec(`
      CREATE TABLE IF NOT EXISTS lamport_events (
        id TEXT PRIMARY KEY,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        virtualTime INTEGER NOT NULL,
        logicalTime INTEGER NOT NULL,
        nodoId TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
    `);

    persistirDb();
  })();

  return inicializacion;
}

export function cargarHistorialLamport(): EventoCodigo[] {
  const rows = asegurarDb().exec(`
    SELECT id, author, content, virtualTime, logicalTime, nodoId, createdAt
    FROM lamport_events
    ORDER BY logicalTime ASC, createdAt ASC, id ASC;
  `);

  if (rows.length === 0) {
    return [];
  }

  const result = rows[0];

  return result.values.map((values: Array<string | number | Uint8Array | null>) => {
    const row = Object.fromEntries(
      result.columns.map((column: string, index: number) => [column, values[index]])
    ) as Record<string, string | number | null>;

    return {
      id: String(row.id ?? ''),
      author: String(row.author ?? ''),
      content: String(row.content ?? ''),
      virtualTime: Number(row.virtualTime ?? 0),
      logicalTime: Number(row.logicalTime ?? 0),
      nodoId: String(row.nodoId ?? 'desconocido')
    };
  });
}

export function guardarEventoLamport(evento: EventoCodigo): void {
  const database = asegurarDb();
  const statement = database.prepare(`
    INSERT OR REPLACE INTO lamport_events (
      id, author, content, virtualTime, logicalTime, nodoId, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?);
  `);

  statement.run([
    evento.id,
    evento.author,
    evento.content,
    evento.virtualTime,
    evento.logicalTime,
    evento.nodoId,
    Date.now()
  ]);
  statement.free();

  persistirDb();
}