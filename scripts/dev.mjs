#!/usr/bin/env node
// Owns only this project's local demo/test processes and PostgreSQL container.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { artifactPaths, assertNodeVersion, setupEnvironment, loadCredentials, prepareArtifacts,
  childEnvironment, dockerEnvironment, redact, workspaceOwner, processIdentity,
  acquireOwnedLock, assertRuntimeReady, migrateRuntime, writePrivate, assertFrontendEnvironment,
  assertNoNativeRuntime, prepareRuntimeArtifacts } from './config.mjs';
import { cleanArtifacts, buildApplication } from './artifacts.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { runtime, binaries } = artifactPaths(app);
const runtimeNode = process.execPath;
const owner = workspaceOwner(app);
const dbName = 'socioh-p1-postgres';
const dbImage = 'postgres:17-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0';
const args = process.argv.slice(2);
const action = args[0] || 'status';
const stack = args.find(x => x.startsWith('--stack='))?.slice(8) || process.env.SOCIOH_STACK || 'demo';
const configs = {
  demo: { database: 'catalog_demo', web: 3000, go: 8080 },
  acceptance: { database: 'catalog_test', web: 3000, go: 8080 },
  failure: { database: 'catalog_failure', web: 3001, go: 8081 },
};
let credentials = {};
try {
  assertNodeVersion();
  if (action === 'setup-env') { console.log(`Application .env ${setupEnvironment(app)}; credential values are never displayed.`); process.exit(0); }
  if (action === 'migrate-runtime') { migrateRuntime(app); console.log('Runtime ownership records migrated; running services and credential values were unchanged.'); process.exit(0); }
  if (!Object.hasOwn(configs, stack)) throw new Error('Unknown stack; use demo, acceptance or failure.');
  if (!['clean', 'cleanup'].includes(action)) credentials = loadCredentials(app);
  assertRuntimeReady(app);
  if (['start', 'restart', 'build', 'run'].includes(action)) assertFrontendEnvironment(app);
  if (action !== 'status' && !['clean', 'cleanup'].includes(action)) prepareRuntimeArtifacts(app);
} catch (error) { console.error(redact(error.message, credentials)); process.exit(1); }
const cfg = configs[stack];
function sanitize(text) { return redact(text, credentials); }
function command(program, argv, opts = {}) {
  const r = spawnSync(program, argv, { cwd: app, env: dockerEnvironment({ app }), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opts });
  if (r.error || r.status !== 0) throw new Error(`${program} failed: ${sanitize(r.stderr || r.error?.message || 'nonzero exit')}`);
  return r.stdout || '';
}
function environment(scope = 'base') {
  return childEnvironment({ app, credentials, config: cfg, scope });
}
async function waitFor(predicate, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await predicate()) return; } catch { /* retry during startup */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function inspectContainer() {
  const r = spawnSync('docker', ['inspect', '--format', '{{json .Config.Labels}}', dbName], { encoding: 'utf8', env: dockerEnvironment({ app }) });
  if (r.status !== 0) {
    if (/no such (object|container)/i.test(r.stderr || '')) return null;
    throw new Error('Cannot inspect local Docker container; check Docker permission.');
  }
  const labels = JSON.parse(r.stdout);
  if (labels['dev.socioh.owner'] !== owner) throw new Error('Refusing to manage a container not owned by this workspace.');
  const details = JSON.parse(command('docker', ['inspect', dbName]))[0];
  const ports = details.HostConfig.PortBindings;
  if (details.Config.Image !== dbImage || details.HostConfig.Privileged || Object.keys(ports).length !== 1 ||
      ports['5432/tcp']?.length !== 1 || ports['5432/tcp'][0].HostIp !== '127.0.0.1' || ports['5432/tcp'][0].HostPort !== '55432' ||
      !details.Mounts.some(m => m.Type === 'volume' && m.Name === 'socioh-p1-postgres-data' && m.Destination === '/var/lib/postgresql/data')) {
    throw new Error('Owned database configuration differs from its pinned loopback/volume contract.');
  }
  return labels;
}
async function setupDB() {
  const volume = spawnSync('docker', ['volume', 'inspect', '--format', '{{json .Labels}}', 'socioh-p1-postgres-data'], { encoding: 'utf8', env: dockerEnvironment({ app }) });
  if (volume.status === 0) {
    if (JSON.parse(volume.stdout)?.['dev.socioh.owner'] !== owner) throw new Error('Refusing to reuse a database volume owned by another workspace.');
  } else if (/no such volume|No such volume/i.test(volume.stderr || '')) {
    command('docker', ['volume', 'create', '--label', `dev.socioh.owner=${owner}`, 'socioh-p1-postgres-data']);
  } else throw new Error('Cannot inspect the owned database volume; check Docker permission.');
  if (!inspectContainer()) {
    const envFile = resolve(runtime, 'postgres.env');
    writePrivate(envFile, `POSTGRES_PASSWORD=${credentials.admin}\nPOSTGRES_DB=catalog_demo\n`);
    command('docker', ['run', '-d', '--name', dbName, '--label', `dev.socioh.owner=${owner}`, '--label', 'dev.socioh.purpose=phase1',
      '-p', '127.0.0.1:55432:5432', '--env-file', envFile, '--memory', '512m', '--cpus', '1',
      '--log-opt', 'max-size=5m', '--log-opt', 'max-file=2', '-v', 'socioh-p1-postgres-data:/var/lib/postgresql/data', dbImage]);
  } else command('docker', ['start', dbName]);
  await waitFor(() => spawnSync('docker', ['exec', dbName, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', env: dockerEnvironment({ app }) }).status === 0, 'PostgreSQL');
  const sql = `DO $roles$ BEGIN
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='catalog_migrator') THEN CREATE ROLE catalog_migrator LOGIN; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='catalog_runtime') THEN CREATE ROLE catalog_runtime LOGIN; END IF;
END $roles$;
ALTER ROLE catalog_migrator PASSWORD '${credentials.migrator}';
ALTER ROLE catalog_runtime PASSWORD '${credentials.runtime}';
ALTER DATABASE catalog_demo OWNER TO catalog_migrator;\n`;
  command('docker', ['exec', '-i', dbName, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql });
  for (const database of ['catalog_test', 'catalog_failure', 'catalog_integration']) {
    const present = command('docker', ['exec', dbName, 'psql', '-XAt', '-U', 'postgres', '-d', 'postgres', '-c', `SELECT 1 FROM pg_database WHERE datname='${database}'`]).trim();
    if (present !== '1') command('docker', ['exec', dbName, 'createdb', '-U', 'postgres', '-O', 'catalog_migrator', database]);
  }
  console.log('Owned PostgreSQL demo/test databases ready on loopback. Credentials retained privately.');
}
function matching(saved) {
  const now = processIdentity(saved.pid);
  return now && now.start === saved.start && now.exe === saved.exe;
}
const statePath = resolve(runtime, `${stack}.json`);
async function stopChildren(children) {
  for (const child of children) if (matching(child)) {
    try { process.kill(child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  await waitFor(() => children.every(c => !matching(c)), 'owned processes to stop', 20000);
}
function persistState(saved) {
  const pending = `${statePath}.pending-${process.pid}-${randomBytes(3).toString('hex')}`;
  writeFileSync(pending, JSON.stringify(saved, null, 2), { mode: 0o600, flag: 'wx' });
  renameSync(pending, statePath);
}
async function stop() {
  if (!existsSync(statePath)) return;
  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  if (saved.owner !== owner || saved.stack !== stack) throw new Error('Runtime ownership mismatch.');
  await stopChildren(saved.children || []);
  persistState({ ...saved, stopped: true, children: [] });
}
function checkPort(port) {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already used; preserving the existing listener.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolvePort));
  });
}
function launch(program, argv, name, cwd, env) {
  const fd = openSync(resolve(runtime, `${stack}-${name}.log`), 'a', 0o600);
  const child = spawn(program, argv, { cwd, env, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); child.unref();
  return new Promise((res, rej) => {
    child.once('error', rej);
    child.once('spawn', () => {
      const identity = processIdentity(child.pid);
      if (!identity) rej(new Error(`Cannot establish ${name} process ownership`));
      else res({ ...identity, name });
    });
  });
}
async function start() {
  if (existsSync(statePath)) {
    const previous = JSON.parse(readFileSync(statePath, 'utf8'));
    if (previous.owner !== owner || previous.stack !== stack) throw new Error('Refusing to replace a runtime record with different ownership.');
    if ((previous.children || []).some(matching)) throw new Error('Owned runtime is already alive; use the explicit restart command.');
    renameSync(statePath, `${statePath}.previous-${Date.now()}-${randomBytes(3).toString('hex')}`);
  }
  await checkPort(cfg.go); await checkPort(cfg.web);
  const env = environment('serve');
  const backend = resolve(binaries, stack === 'failure' ? 'catalog-testserver' : 'catalog');
  if (!existsSync(backend)) throw new Error('Backend binary missing; run build-backend first.');
  const nextCLI = resolve(app, 'frontend/node_modules/next/dist/bin/next');
  if (!existsSync(nextCLI) || !existsSync(resolve(app, 'frontend/.next/BUILD_ID'))) throw new Error('Production frontend build missing.');
  command(resolve(binaries, 'catalog'), ['migrate', 'up'], { env: environment('migrate'), cwd: resolve(app, 'backend') });
  const saved = { owner, stack, children: [], frontendURL: env.APP_ORIGIN, backendURL: env.GO_API_URL, database: cfg.database, started: new Date().toISOString() };
  const persist = () => persistState(saved);
  try {
    saved.children.push(await launch(backend, stack === 'failure' ? [] : ['serve'], 'go', resolve(app, 'backend'), env)); persist();
    await waitFor(async () => saved.children.every(matching) && (await fetch(`${env.GO_API_URL}/readyz`, { signal: AbortSignal.timeout(1500) })).ok, 'Go readiness');
    saved.children.push(await launch(runtimeNode, [nextCLI, 'start', '--hostname', '127.0.0.1', '--port', String(cfg.web)], 'next', resolve(app, 'frontend'), { ...environment('frontend'), NODE_ENV: 'production' })); persist();
    await waitFor(async () => saved.children.every(matching) && (await fetch(env.APP_ORIGIN, { signal: AbortSignal.timeout(1500) })).ok, 'Next.js readiness');
    if (!saved.children.every(matching)) throw new Error('Owned runtime exited during readiness verification.');
    console.log(`${stack} ready: ${env.APP_ORIGIN}`);
  } catch (error) {
    // State persistence may itself have failed: clean up the identities held in memory.
    await stopChildren(saved.children);
    try { persistState({ ...saved, stopped: true, children: [] }); } catch { /* Original failure remains authoritative. */ }
    throw error;
  }
}
function acquireLifecycleLock() {
  return acquireOwnedLock(resolve(runtime, 'lifecycle.lock'), owner);
}
function buildBackend() {
  command('go', ['build', '-trimpath', '-o', resolve(binaries, 'catalog'), './cmd/app'], { cwd: resolve(app, 'backend'), env: environment() });
  command('go', ['build', '-trimpath', '-tags', 'testfixture', '-o', resolve(binaries, 'catalog-testserver'), './cmd/testserver'], { cwd: resolve(app, 'backend'), env: environment() });
  console.log('Backend production and test-only binaries built.');
}
function buildFrontend() {
  if (!existsSync(resolve(app, 'frontend/node_modules/next/dist/bin/next'))) throw new Error('Frontend dependencies missing; install the pinned dependencies with the documented npm ci command first.');
  console.log(sanitize(command('npm', ['run', 'build'], { cwd: resolve(app, 'frontend'), env: environment('frontend-build') }).trim()));
}
function requirePreparedDatabase() {
  if (!inspectContainer() || spawnSync('docker', ['exec', dbName, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore', env: dockerEnvironment({ app }) }).status !== 0) throw new Error('Owned native PostgreSQL is not ready; run make setup-db explicitly before make run. No database was started or reset.');
}
let releaseLock;
try {
  if (!['status', 'clean', 'cleanup'].includes(action)) {
    releaseLock = acquireLifecycleLock();
    if (['build-backend', 'build', 'run'].includes(action) || (action === 'exec' && process.env.SOCIOH_COMMAND_CWD === 'frontend')) assertNoNativeRuntime(app);
    prepareArtifacts(app);
  }
  if (action === 'clean' || action === 'cleanup') {
    const removed = cleanArtifacts(app, { caches: action === 'cleanup' });
    console.log(removed.length ? `Removed regenerable output: ${removed.join(', ')}. Configuration, runtime records/logs, databases and source were preserved; outputs can be rebuilt.` : 'No selected regenerable output exists. Configuration, runtime records/logs, databases and source were preserved.');
  } else if (action === 'setup-db') await setupDB();
  else if (action === 'build-backend') buildBackend();
  else if (action === 'build' || action === 'run') {
    if (action === 'run') requirePreparedDatabase();
    await buildApplication({ frontend: buildFrontend, backend: buildBackend, start: action === 'run' ? start : undefined });
  } else if (action === 'migrate') {
    console.log(sanitize(command(resolve(binaries, 'catalog'), ['migrate', 'up'], { cwd: resolve(app, 'backend'), env: environment('migrate') }).trim()));
  } else if (action === 'reset') {
    if (!args.includes('--confirm-demo-reset')) throw new Error('Reset removes only this selected demo workspace\'s stored runs/results. Stop its app first, preserve any needed exports, then pass --confirm-demo-reset explicitly.');
    if (existsSync(statePath) && (JSON.parse(readFileSync(statePath, 'utf8')).children || []).some(matching)) throw new Error('Stop the selected owned application before its explicit data reset.');
    console.log(sanitize(command(resolve(binaries, 'catalog'), ['reset', '--confirm-demo-reset'], { cwd: resolve(app, 'backend'), env: environment('migrate') }).trim()));
  } else if (action === 'start') await start();
  else if (action === 'restart') { await stop(); await start(); }
  else if (action === 'stop') await stop();
  else if (action === 'status') console.log(existsSync(statePath) ? readFileSync(statePath, 'utf8') : 'No owned runtime for this stack.');
  else if (action === 'exec') {
    const sep = args.indexOf('--'); if (sep < 0 || !args[sep + 1]) throw new Error('Usage: exec [--stack=name] -- program arguments');
    const directory = process.env.SOCIOH_COMMAND_CWD || '';
    if (!['', 'backend', 'frontend'].includes(directory)) throw new Error('Command directory must be backend, frontend or the application root.');
    const r = spawnSync(args[sep + 1], args.slice(sep + 2), { cwd: resolve(app, directory), env: environment(directory === 'backend' ? 'tests' : directory === 'frontend' ? 'frontend-build' : 'base'), stdio: 'inherit' });
    if (r.error) throw r.error; process.exitCode = r.status ?? 1;
  } else throw new Error('Use setup-env, migrate-runtime, setup-db, build, run, build-backend, clean, cleanup, migrate, reset, start, restart, stop, status or exec.');
} catch (error) { console.error(sanitize(error.message)); process.exitCode = 1; }
finally { releaseLock?.(); }
