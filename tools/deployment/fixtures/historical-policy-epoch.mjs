// Test-process-only fixture for pre-inventory-change release scenarios. The
// historical bytes are reconstructed from the *only* four approved digest
// replacements and checked against the blobs in the authenticated executor
// commit e42e5288502085368eb1c7c9017643f63f9d2b19. Never import in release code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const inventoryPath = fileURLToPath(new URL('../approved-security-tests.json', import.meta.url));
const policyPath = fileURLToPath(new URL('../unattended-policy.json', import.meta.url));
const originalRead = fs.readFileSync;
const substitute = (bytes, changes) => {
  let text = bytes.toString('utf8');
  for (const [current, historical] of changes) {
    assert.equal(text.split(current).length, 2, 'one exact approved digest replacement');
    text = text.replace(current, historical);
  }
  return Buffer.from(text);
};
const originalInventory = substitute(originalRead(inventoryPath), [
  ['dffaae558c04afc614a9ab1c7782c3af492c5f1e8e0d622247d1e93aa3eae81f',
    'e28faa320901a6c9c88072d049e44964f35fad91a932318e43438ee6d1a72b17'],
  ['e5626ea6cd0efa8f03f1d71ebbb5bf4bbecf1522b74e44e47434396d4e697de0',
    'c8628caff8fce379e0f4919d24d89bfd03643d35a22ec66ba51490eab63ba29e'],
  ['c2c517babdd99ec3d07c08cb2d6401918371aae2341ab21997423585cb7c920c',
    'b526238b9175800ca815a744487fe68fc9de7034acd2f024e3075c4cfeb33cd4']
]);
const originalPolicy = substitute(originalRead(policyPath), [[
  '2bedab20a4fe26c07a8ca027a52dfb2d3db60e21ee69f627775f6efe928a7239',
  '8ae9edb167884e84db0ed9d342eb315bb6d19ee51722eb20f75fb2c4ea99dbd5'
]]);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(digest(originalInventory), '8ae9edb167884e84db0ed9d342eb315bb6d19ee51722eb20f75fb2c4ea99dbd5');
assert.equal(digest(originalPolicy), 'c9afde42f7a91f82558e7eea72a018e41d025239ae781aef7c2a41109459321a');
assert.equal(blob(originalInventory), '23a68f0a3f1c66056457ce0e172bf4164673fa0a');
assert.equal(blob(originalPolicy), 'cc03c543f64ea0b5bf7d3be5d72080886006946c');

fs.readFileSync = function readHistoricalPolicy(path, options) {
  const name = path instanceof URL ? fileURLToPath(path) : path;
  const bytes = name === inventoryPath ? originalInventory : name === policyPath ? originalPolicy : null;
  if (!bytes) return originalRead(path, options);
  const encoding = typeof options === 'string' ? options : options?.encoding;
  return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
};
syncBuiltinESMExports();
