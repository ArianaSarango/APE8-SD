declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null;

  export interface QueryResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    run(params?: SqlValue[] | Record<string, SqlValue>): void;
    free(): void;
  }

  export interface Database {
    exec(sql: string): QueryResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  export default function initSqlJs(options?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}