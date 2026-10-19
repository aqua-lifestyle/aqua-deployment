const INSERT_ONCE = `
  INSERT INTO aqua_deployment_authorization_replay
    (attestation_id, replay_key, payload_sha256, expires_at)
  VALUES ($1::uuid, $2, $3, $4::timestamptz)
  ON CONFLICT DO NOTHING
  RETURNING 1 AS consumed`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;

/** A single PostgreSQL INSERT is the atomic replay-consumption boundary. */
export class PostgresReplayStore {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('Replay database client unavailable');
    this.pool = pool;
  }

  async consumeOnce({ attestationId, replayKey, payloadSha256, expiresAt } = {}) {
    if (!UUID.test(attestationId ?? '') || !DIGEST.test(replayKey ?? '') ||
        !DIGEST.test(payloadSha256 ?? '') || typeof expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt).toISOString() !== expiresAt)
      throw new TypeError('Replay reservation claims invalid');
    const result = await this.pool.query(INSERT_ONCE,
      [attestationId, replayKey, payloadSha256, expiresAt]);
    if (result?.rowCount === 1 && result.rows?.length === 1 && result.rows[0]?.consumed === 1) return true;
    if (result?.rowCount === 0 && Array.isArray(result.rows) && result.rows.length === 0) return false;
    throw new Error('Replay reservation result uncertain');
  }
}

export async function createPostgresReplayStore(connectionString) {
  if (typeof connectionString !== 'string' || !connectionString.trim())
    throw new TypeError('Replay store configuration unavailable');
  let parsed;
  try { parsed = new URL(connectionString); } catch { throw new TypeError('Replay store configuration invalid'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      parsed.searchParams.get('sslmode') !== 'verify-full')
    throw new TypeError('Replay store must use PostgreSQL TLS identity verification');
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 5000, statement_timeout: 3000, query_timeout: 3000,
    application_name: 'aqua-attestation-admission' });
  return { store: new PostgresReplayStore(pool), close: () => pool.end() };
}

export const replayInsertStatement = INSERT_ONCE;
