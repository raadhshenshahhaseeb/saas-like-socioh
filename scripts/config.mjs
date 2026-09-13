// Shared application configuration. Secrets are data, never shell or global environment.
import { randomBytes, createHash } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, readFileSync, writeFileSync, lstatSync, existsSync, mkdirSync, chmodSync, renameSync, unlinkSync, linkSync, fsyncSync, readlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const roles = ['admin', 'migrator', 'runtime'];
const keys = roles.map(role => `POSTGRES_${role.toUpperCase()}_PASSWORD`);
const passwordPattern = /^[A-Za-z0-9_-]{32,128}$/;

export function parseEnvironment(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 16384) throw new Error('Invalid application .env.');
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const match = /^([A-Z_]+)=([A-Za-z0-9_-]{32,128})$/.exec(line);
    if (!match || !keys.includes(match[1]) || values.has(match[1])) throw new Error('Invalid application .env; use only the three documented password keys and unquoted values.');
    values.set(match[1], match[2]);
  }
  if (values.size !== roles.length) throw new Error('Application .env must contain all three password keys.');
  return Object.fromEntries(roles.map((role, index) => [role, values.get(keys[index])]));
}

export function artifactPaths(app) {
  return {
    app: resolve(app), env: resolve(app, '.env'), cache: resolve(app, '.cache'),
    runtime: resolve(app, '.cache/runtime'), tmp: resolve(app, '.cache/tmp'),
    binaries: resolve(app, 'backend/bin'), goCache: resolve(app, 'backend/.cache/go-build'),
    goModules: resolve(app, 'backend/.cache/go-mod'), goPath: resolve(app, 'backend/.cache/gopath'),
    npmCache: resolve(app, 'frontend/.cache/npm'), legacy: resolve(app, '../.local/runtime'),
  };
}

function statIfPresent(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Unsafe application filesystem path.'); }
}

function assertDirectoryChain(directory, { allowMissing = false } = {}) {
  const chain = [];
  for (let current = resolve(directory); ; current = dirname(current)) {
    chain.push(current);
    if (dirname(current) === current) break;
  }
  // Validate from filesystem root, including the application root. This deliberately
  // rejects symlink aliases; only the canonical directory spelling is supported.
  for (const current of chain.reverse()) {
    const stat = statIfPresent(current);
    if (!stat && allowMissing) return;
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe application directory ancestor; symlink aliases are not supported.');
  }
}

function readPrivate(file, label) {
  let fd;
  try {
    assertDirectoryChain(dirname(file));
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error();
    return readFileSync(fd, 'utf8');
  } catch { throw new Error(`Cannot read ${label}; require a private owner-readable regular file.`); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function privateDirectory(directory) {
  assertDirectoryChain(dirname(directory));
  const stat = statIfPresent(directory);
  if (stat) {
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe application artifact directory.');
  } else {
    mkdirSync(directory, { mode: 0o700 });
  }
  // Callers name only their approved artifact directories; never an application ancestor.
  chmodSync(directory, 0o700);
}

export function writePrivate(file, content, { exclusive = false } = {}) {
  assertDirectoryChain(dirname(file));
  const stat = statIfPresent(file);
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe private application file.');
    if (exclusive) throw Object.assign(new Error('Private application file already exists.'), { code: 'EEXIST' });
  }
  const temporary = `${file}.pending-${process.pid}-${randomBytes(8).toString('hex')}`;
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, content); fsyncSync(fd); closeSync(fd); fd = undefined;
    if (exclusive) { linkSync(temporary, file); unlinkSync(temporary); }
    else renameSync(temporary, file);
    const parent = openSync(dirname(file), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function legacyCredentials(paths) {
  const file = resolve(paths.legacy, 'database-credentials.json');
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readPrivate(file, 'legacy credential record'));
    if (Object.keys(value).length !== roles.length || !roles.every(role => typeof value[role] === 'string' && passwordPattern.test(value[role]))) throw new Error();
    return value;
  } catch { throw new Error('Invalid legacy credential record; no values were changed.'); }
}

function sameCredentials(left, right) { return roles.every(role => left[role] === right[role]); }

export function loadCredentials(app) {
  const paths = artifactPaths(app);
  assertDirectoryChain(paths.app);
  if (!existsSync(paths.env)) throw new Error('Application .env missing; run make setup-env explicitly.');
  const credentials = parseEnvironment(readPrivate(paths.env, 'application .env'));
  const legacy = legacyCredentials(paths);
  if (legacy && !sameCredentials(credentials, legacy)) throw new Error('Application and legacy credentials conflict; no values were changed.');
  return credentials;
}

export function setupEnvironment(app) {
  const paths = artifactPaths(app);
  assertDirectoryChain(paths.app);
  if (existsSync(paths.env)) { loadCredentials(app); return 'unchanged'; }
  const imported = legacyCredentials(paths);
  const credentials = imported || Object.fromEntries(roles.map(role => [role, randomBytes(24).toString('base64url')]));
  const content = roles.map((role, index) => `${keys[index]}=${credentials[role]}\n`).join('');
  try { writePrivate(paths.env, content, { exclusive: true }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw new Error('Cannot create application .env; existing files were preserved.');
    loadCredentials(app); return 'unchanged';
  }
  return imported ? 'imported' : 'created';
}

export function prepareArtifacts(app) {
  const paths = artifactPaths(app);
  assertDirectoryChain(paths.app);
  const directories = [paths.cache, paths.runtime, paths.tmp, paths.binaries,
    resolve(app, 'backend/.cache'), paths.goCache, paths.goModules, paths.goPath,
    resolve(app, 'frontend/.cache'), paths.npmCache];
  // Preflight every existing ancestor before any chmod/create, including artifacts
  // whose leaf already exists under a symlinked source or cache parent.
  for (const directory of directories) assertDirectoryChain(directory, { allowMissing: true });
  for (const directory of directories) privateDirectory(directory);
  return paths;
}

export function validateArtifactDirectory(app, relative) {
  const root = resolve(app), target = resolve(root, relative);
  assertDirectoryChain(root);
  if (!target.startsWith(root + '/') || target === root) throw new Error('Unsafe application artifact target.');
  assertDirectoryChain(target, { allowMissing: true });
  return target;
}

export function prepareRuntimeArtifacts(app) {
  const paths = artifactPaths(app);
  validateArtifactDirectory(app, '.cache'); validateArtifactDirectory(app, '.cache/runtime');
  privateDirectory(paths.cache); privateDirectory(paths.runtime);
  return paths;
}

export function assertNodeVersion(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major !== 24 || minor < 21) throw new Error('Node 24.21 or later in the Node 24 series is required; select it on PATH before running application commands.');
}

export function assertFrontendEnvironment(app) {
  assertDirectoryChain(resolve(app));
  const frontend = resolve(app, 'frontend');
  assertDirectoryChain(frontend, { allowMissing: true });
  if (!existsSync(frontend)) return;
  // Check names, not contents or symlink targets: Next can load these independently
  // of the scoped child environment. The canonical root .env remains permitted.
  if (readdirSync(frontend).some(name => name === '.env' || (name.startsWith('.env.') && name !== '.env.example'))) throw new Error('Frontend dotenv files are not supported; keep canonical configuration in the application root .env.');
}

export function childEnvironment({ app, credentials, config, scope = 'base', inherited = process.env, nodeExecutable = process.execPath }) {
  if (!['base', 'serve', 'migrate', 'tests', 'frontend', 'frontend-build'].includes(scope)) throw new Error('Unknown child environment scope.');
  if (scope === 'frontend' || scope === 'frontend-build') assertFrontendEnvironment(app);
  const paths = artifactPaths(app);
  const env = {};
  for (const key of ['LANG', 'LC_ALL', 'TZ', 'TERM', 'CI']) if (typeof inherited[key] === 'string') env[key] = inherited[key];
  env.PATH = `${dirname(nodeExecutable)}:${inherited.PATH || ''}`;
  env.TMPDIR = paths.tmp;
  env.NEXT_TELEMETRY_DISABLED = '1';
  env.NO_UPDATE_NOTIFIER = '1';
  if (scope !== 'frontend') env.npm_config_cache = paths.npmCache;
  if (!['frontend', 'frontend-build'].includes(scope)) {
    env.GOCACHE = paths.goCache; env.GOMODCACHE = paths.goModules; env.GOPATH = paths.goPath;
    env.GOENV = 'off'; // Do not import workstation-specific go env -w configuration.
  }
  if (['serve', 'migrate', 'tests', 'frontend'].includes(scope)) {
    env.APP_ORIGIN = `http://127.0.0.1:${config.web}`;
    env.GO_API_URL = `http://127.0.0.1:${config.go}`;
    env.PORT = String(config.web); env.HOSTNAME = '127.0.0.1';
  }
  if (['serve', 'migrate', 'tests'].includes(scope)) {
    env.DEMO_DATABASE_NAME = config.database;
    env.DEMO_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
    env.APP_ADDR = `127.0.0.1:${config.go}`;
  }
  const uri = (role, password, database) => `postgresql://${role}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}?sslmode=disable`;
  if (scope === 'serve') env.DATABASE_URL = uri('catalog_runtime', credentials.runtime, config.database);
  if (scope === 'migrate') env.MIGRATION_DATABASE_URL = uri('catalog_migrator', credentials.migrator, config.database);
  if (scope === 'tests') {
    env.TEST_DATABASE_URL = uri('catalog_runtime', credentials.runtime, 'catalog_integration');
    env.TEST_MIGRATION_DATABASE_URL = uri('catalog_migrator', credentials.migrator, 'catalog_integration');
    env.TEST_DATABASE_NAME = 'catalog_integration';
  }
  return env;
}

export function dockerEnvironment({ app, inherited = process.env, nodeExecutable = process.execPath }) {
  const env = {};
  for (const key of ['HOME', 'LANG', 'LC_ALL', 'TERM', 'DOCKER_CONFIG']) if (typeof inherited[key] === 'string') env[key] = inherited[key];
  env.PATH = `${dirname(nodeExecutable)}:${inherited.PATH || ''}`;
  env.TMPDIR = artifactPaths(app).tmp;
  return env;
}

export function composeConfiguration({ app, credentials, database, port, inherited = process.env, nodeExecutable = process.execPath }) {
  if (!['catalog_demo', 'catalog_test'].includes(database) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid owned Compose configuration.');
  const { runtime } = artifactPaths(app);
  const files = {
    postgres: resolve(runtime, 'compose-postgres.env'), go: resolve(runtime, 'compose-go.env'),
    migration: resolve(runtime, 'compose-migration.env'), interpolation: resolve(runtime, 'compose-interpolation.env'),
  };
  const uri = (role, password) => `postgresql://${role}:${encodeURIComponent(password)}@database:5432/${database}?sslmode=disable`;
  const contents = {
    postgres: `POSTGRES_PASSWORD=${credentials.admin}\nPOSTGRES_DB=${database}\n`,
    go: `DATABASE_URL=${uri('catalog_runtime', credentials.runtime)}\nDEMO_DATABASE_NAME=${database}\nAPP_ADDR=0.0.0.0:8080\n`,
    migration: `MIGRATION_DATABASE_URL=${uri('catalog_migrator', credentials.migrator)}\nDEMO_DATABASE_NAME=${database}\n`,
    interpolation: '# Deliberately empty; canonical credentials are parsed only by the application helper.\n',
  };
  const environment = dockerEnvironment({ app, inherited, nodeExecutable });
  Object.assign(environment, { SOCIOH_OWNER: workspaceOwner(app), SOCIOH_PG_ENV_FILE: files.postgres, SOCIOH_GO_ENV_FILE: files.go, SOCIOH_COMPOSE_PORT: String(port) });
  return { files, contents, environment };
}

export function redact(message, credentials) {
  let result = String(message || '');
  for (const value of Object.values(credentials)) result = result.replaceAll(value, '[redacted]');
  return result;
}

export function workspaceOwner(app) { return createHash('sha256').update(resolve(app)).digest('hex').slice(0, 16); }

export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields[0] === 'Z') return null;
    return { pid, start: fields[19], exe: readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '') };
  } catch { return null; }
}

function readRecord(file) {
  try {
    const record = JSON.parse(readPrivate(file, 'runtime ownership record'));
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error();
    return record;
  }
  catch { throw new Error('Invalid private runtime ownership record; files were preserved.'); }
}

export function acquireOwnedLock(file, owner, identity = processIdentity) {
  const self = identity(process.pid);
  if (!self) throw new Error('Cannot establish lifecycle process identity.');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writePrivate(file, JSON.stringify({ owner, ...self }), { exclusive: true });
      return () => {
        const saved = readRecord(file);
        if (saved.owner === owner && saved.pid === self.pid && saved.start === self.start) unlinkSync(file);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = readRecord(file);
      if (previous.owner === owner && (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || typeof previous.start !== 'string' || !previous.start)) throw new Error('Invalid lifecycle lock ownership record; existing state was preserved.');
      const current = identity(previous.pid);
      if (previous.owner !== owner || (current && current.start === previous.start && (!previous.exe || previous.exe === current.exe))) throw new Error('Lifecycle operation active or ownership differs; existing state was preserved.');
      renameSync(file, `${file}.stale-${Date.now()}-${randomBytes(4).toString('hex')}`);
    }
  }
  throw new Error('Cannot acquire application lifecycle lock.');
}

const runtimeRecords = ['demo.json', 'acceptance.json', 'failure.json', 'compose.json'];
const lifecycleLocks = ['lifecycle.lock', 'compose.lock'];
function isRetired(record, owner) { return record.owner === `retired:${owner}` && record.retired === true && record.migrationOwner === owner; }

export function assertNoNativeRuntime(app, identity = processIdentity) {
  const { runtime } = artifactPaths(app), owner = workspaceOwner(app);
  for (const stack of ['demo', 'acceptance', 'failure']) {
    const file = resolve(runtime, `${stack}.json`);
    if (!statIfPresent(file)) continue;
    const saved = readRecord(file);
    if (saved.owner !== owner || saved.stack !== stack || !Array.isArray(saved.children)) throw new Error('Invalid or foreign native runtime ownership; existing state was preserved.');
    for (const child of saved.children) {
      if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || typeof child.start !== 'string' || !child.start || typeof child.exe !== 'string' || !child.exe) throw new Error('Invalid native process ownership record; existing state was preserved.');
      const current = identity(child.pid);
      if (current && current.start === child.start && current.exe === child.exe) throw new Error('A live owned native stack uses shared build outputs; stop it explicitly before build, clean or cleanup.');
    }
  }
}

export function assertRuntimeReady(app) {
  const paths = artifactPaths(app), owner = workspaceOwner(app);
  const legacyRecord = runtimeRecords.some(name => existsSync(resolve(paths.legacy, name)));
  const legacyLock = lifecycleLocks.some(name => {
    const file = resolve(paths.legacy, name);
    return existsSync(file) && !isRetired(readRecord(file), owner);
  });
  if (legacyRecord || legacyLock) throw new Error('Legacy runtime ownership records remain; run make migrate-runtime explicitly before application commands.');
}

export function migrateRuntime(app, { identity = processIdentity, write = writePrivate } = {}) {
  loadCredentials(app); // Validate canonical/legacy agreement before creating new lock paths.
  const paths = prepareArtifacts(app), owner = workspaceOwner(app);
  if (!existsSync(paths.legacy)) { assertRuntimeReady(app); return; }
  const oldDirectory = lstatSync(paths.legacy);
  if (!oldDirectory.isDirectory() || oldDirectory.isSymbolicLink()) throw new Error('Unsafe legacy runtime directory.');
  const releases = [];
  try {
    // Fixed order, fail-fast locks: no old helper action can race the record transfer.
    for (const name of lifecycleLocks) {
      const file = resolve(paths.legacy, name);
      if (existsSync(file) && isRetired(readRecord(file), owner)) continue;
      releases.push(acquireOwnedLock(file, owner, identity));
    }
    for (const name of lifecycleLocks) releases.push(acquireOwnedLock(resolve(paths.runtime, name), owner, identity));
    const transfers = [];
    for (const name of runtimeRecords) {
      const source = resolve(paths.legacy, name), destination = resolve(paths.runtime, name);
      if (!existsSync(source)) continue;
      const content = readPrivate(source, 'legacy runtime record');
      let record;
      try { record = JSON.parse(content); } catch { throw new Error('Invalid legacy runtime record; records were preserved.'); }
      if (record.owner !== owner || !Array.isArray(record.children) ||
          (name === 'compose.json' ? record.kind !== 'compose' || record.project !== 'socioh-p1-app' : record.stack !== name.slice(0, -5))) throw new Error('Legacy runtime record ownership differs; records were preserved.');
      if (existsSync(destination) && readPrivate(destination, 'destination runtime record') !== content) throw new Error('Runtime migration destination conflict; records were preserved.');
      transfers.push({ source, destination, content });
    }
    // Complete all exclusive copies before removing any source. A partial copy is recoverable:
    // ordinary helpers remain gated, and a repeat accepts only byte-identical destinations.
    for (const item of transfers) if (!existsSync(item.destination)) write(item.destination, item.content, { exclusive: true });
    const retired = JSON.stringify({ owner: `retired:${owner}`, migrationOwner: owner, retired: true, destination: 'app/.cache/runtime' });
    // Retire BOTH old lock paths durably before dropping the records that gate new
    // helpers. A retirement failure leaves old records in place for a safe retry.
    for (const name of lifecycleLocks) write(resolve(paths.legacy, name), retired);
    for (const item of transfers) unlinkSync(item.source);
  } finally {
    for (const release of releases.reverse()) release();
  }
  assertRuntimeReady(app);
}
