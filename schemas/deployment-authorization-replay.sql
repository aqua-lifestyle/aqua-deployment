-- Apply once using a database owner outside the deployment executor.
-- Admission receives INSERT-only access; it has no SELECT, UPDATE, DELETE,
-- schema, migration, or provider privileges. Keep rows as permanent replay tombstones.
CREATE TABLE aqua_deployment_authorization_replay (
  attestation_id uuid PRIMARY KEY,
  replay_key char(64) NOT NULL UNIQUE CHECK (replay_key ~ '^[a-f0-9]{64}$'),
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Replace aqua_admission with the separately managed admission role.
GRANT INSERT ON aqua_deployment_authorization_replay TO aqua_admission;
