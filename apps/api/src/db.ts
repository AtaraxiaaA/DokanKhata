// everything that talks to the database goes through here.
// - always use ? placeholders, never glue user input into the SQL string
// - writes go through withConn() so @app_user is set and audit_log knows who did it
// - procedures with an OUT param go through callProc()
import mysql, { type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { env } from './env';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'utf8mb4',
  connectionLimit: 10,
  dateStrings: true, // keep dates as plain strings so JS never shifts the timezone
  decimalNumbers: true, // DECIMAL comes back as a number. we still do all money math in SQL
  multipleStatements: false, // leave this off, it blocks stacked-query injection
});

export type Conn = PoolConnection;
type Params = unknown[];

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

// turns snake_case column names into camelCase keys
function toCamel<T>(row: RowDataPacket): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out as T;
}

// run a SELECT and get camelCase rows back. pass conn if you're inside withConn
export async function query<T>(sql: string, params: Params = [], conn?: Conn): Promise<T[]> {
  const [rows] = await (conn ?? pool).query<RowDataPacket[]>(sql, params as never);
  return rows.map((r) => toCamel<T>(r));
}

// same as query() but returns the first row or null
export async function queryOne<T>(
  sql: string,
  params: Params = [],
  conn?: Conn,
): Promise<T | null> {
  const rows = await query<T>(sql, params, conn);
  return rows[0] ?? null;
}

// INSERT / UPDATE / DELETE
export async function execute(sql: string, params: Params = [], conn?: Conn) {
  const [res] = await (conn ?? pool).execute<mysql.ResultSetHeader>(sql, params as never);
  return { affectedRows: res.affectedRows, insertId: res.insertId };
}

// grabs one connection, sets @app_user so the audit trigger can see who's doing it,
// runs fn, then clears it again before the connection goes back to the pool
export async function withConn<T>(appUser: string, fn: (conn: Conn) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @app_user = ?', [appUser]);
    return await fn(conn);
  } finally {
    await conn.query('SET @app_user = NULL').catch(() => {});
    conn.release();
  }
}

// calls a procedure whose last param is an OUT param and returns that value.
// the procedures handle their own transaction, so don't open another one around this.
//   const saleId = await callProc<number>(conn, 'sp_record_credit_sale', [acct, staff, json, note]);
export async function callProc<T = number>(
  conn: Conn,
  name: string,
  inArgs: unknown[],
): Promise<T> {
  if (!/^sp_[a-z_]+$/.test(name)) throw new Error(`Bad procedure name: ${name}`);
  const placeholders = inArgs.map(() => '?').join(', ');
  await conn.query(`CALL ${name}(${placeholders}${inArgs.length ? ', ' : ''}@out_param)`, inArgs);
  const [rows] = await conn.query<RowDataPacket[]>('SELECT @out_param AS v');
  return rows[0]?.v as T;
}
