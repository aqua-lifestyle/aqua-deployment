import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createPostgresReplayStore, PostgresReplayStore } from './postgres-replay-store.mjs';

const sample = () => {
  const attestationId = randomUUID();
  return { attestationId, replayKey: createHash('sha256').update(attestationId).digest('hex'),
    payloadSha256: 'b'.repeat(64), expiresAt: '2026-10-19T12:00:00.000Z' };
};

test('PostgreSQL replay adapter uses one conflict-safe INSERT and fails on uncertain results', async () => {
  const calls = [];
  const store = new PostgresReplayStore({ query: async (...args) => {
    calls.push(args); return { rowCount: 1, rows: [{ consumed: 1 }] };
  } });
  assert.equal(await store.consumeOnce(sample()), true);
  assert.match(calls[0][0], /ON CONFLICT DO NOTHING\s+RETURNING 1 AS consumed/);
  const schema = readFileSync(new URL('../../schemas/deployment-authorization-replay.sql', import.meta.url), 'utf8');
  assert.match(schema, /attestation_id uuid PRIMARY KEY/);
  assert.match(schema, /replay_key char\(64\) NOT NULL UNIQUE/);
  const duplicate = new PostgresReplayStore({ query: async () => ({ rowCount: 0, rows: [] }) });
  assert.equal(await duplicate.consumeOnce(sample()), false);
  const uncertain = new PostgresReplayStore({ query: async () => ({ rowCount: null, rows: [] }) });
  await assert.rejects(uncertain.consumeOnce(sample()), /uncertain/);
  const failed = new PostgresReplayStore({ query: async () => { throw Error('unavailable'); } });
  await assert.rejects(failed.consumeOnce(sample()), /unavailable/);
});

test('invalid replay coordinates never reach PostgreSQL', async () => {
  let called = false;
  const store = new PostgresReplayStore({ query: async () => { called = true; return {}; } });
  await assert.rejects(store.consumeOnce({ ...sample(), replayKey: 'not-a-digest' }), /claims invalid/);
  await assert.rejects(createPostgresReplayStore('postgresql://localhost/aqua'), /TLS identity verification/);
  assert.equal(called, false);
});

test('disposable PostgreSQL admits at most one concurrent use of a signed authorization', {
  skip: !process.env.AQUA_TEST_DATABASE_URL && 'AQUA_TEST_DATABASE_URL not configured',
}, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.AQUA_TEST_DATABASE_URL, max: 32,
    connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  let admissionPool;
  try {
    const ddl = readFileSync(new URL('../../schemas/deployment-authorization-replay.sql', import.meta.url), 'utf8')
      .split('-- Replace aqua_admission')[0]
      .replace('CREATE TABLE aqua_deployment_authorization_replay',
        'CREATE TABLE IF NOT EXISTS aqua_deployment_authorization_replay');
    await pool.query(ddl);
    await pool.query(`DO $$ BEGIN CREATE ROLE aqua_admission_test NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query('GRANT INSERT ON aqua_deployment_authorization_replay TO aqua_admission_test');
    admissionPool = new Pool({ connectionString: process.env.AQUA_TEST_DATABASE_URL, max: 32,
      connectionTimeoutMillis: 3000, statement_timeout: 5000, options: '-c role=aqua_admission_test' });
    const store = new PostgresReplayStore(admissionPool);
    const row = sample();
    const results = await Promise.all(Array.from({ length: 64 }, () => store.consumeOnce(row)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter(x => x === false).length, 63);
    const sameAttestationDifferentKey = { ...sample(), attestationId: row.attestationId, replayKey: 'c'.repeat(64) };
    assert.equal(await store.consumeOnce(sameAttestationDifferentKey), false);
    const differentAttestationSameKey = { ...sample(), replayKey: row.replayKey };
    assert.equal(await store.consumeOnce(differentAttestationSameKey), false);
    await assert.rejects(admissionPool.query('SELECT attestation_id FROM aqua_deployment_authorization_replay'),
      error => error.code === '42501');
    await assert.rejects(admissionPool.query('DELETE FROM aqua_deployment_authorization_replay'),
      error => error.code === '42501');
    await assert.rejects(admissionPool.query('CREATE TABLE aqua_forbidden_table (id integer)'),
      error => error.code === '42501');
  } finally {
    if (admissionPool) await admissionPool.end();
    await pool.end();
  }
});
