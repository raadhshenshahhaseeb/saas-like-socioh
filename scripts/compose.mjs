#!/usr/bin/env node
// Rehearses only the owned local Compose application; no hosting-panel operations.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { artifactPaths, assertNodeVersion, loadCredentials, prepareArtifacts, dockerEnvironment,
  redact, workspaceOwner, acquireOwnedLock, assertRuntimeReady, writePrivate, composeConfiguration, assertFrontendEnvironment, prepareRuntimeArtifacts } from './config.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { runtime } = artifactPaths(app);
const project = 'socioh-p1-app';
const owner = workspaceOwner(app);
const action = process.argv[2] || 'status';
const port = Number(process.env.SOCIOH_COMPOSE_PORT || 3100);
const database = process.env.SOCIOH_COMPOSE_DATABASE || 'catalog_test';
let credentials = {};
try {
  assertNodeVersion();
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local Compose port.');
  if (!['catalog_demo', 'catalog_test'].includes(database)) throw new Error('Compose database must be the owned demo or test database.');
  credentials = loadCredentials(app);
  assertRuntimeReady(app);
  if (['build', 'up', 'restart'].includes(action)) assertFrontendEnvironment(app);
  if (action !== 'status') prepareRuntimeArtifacts(app);
} catch (error) { console.error(redact(error.message, credentials)); process.exit(1); }
function safe(text) { return redact(text, credentials); }
function call(program, args, options = {}) {
  const r = spawnSync(program, args, { cwd: app, env: dockerEnvironment({ app }), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (r.error || r.status !== 0) throw new Error(`${program} failed: ${safe(r.stderr || r.error?.message || 'nonzero exit')}`);
  return r.stdout || '';
}
const configuration = composeConfiguration({ app, credentials, database, port });
const migrationFile = configuration.files.migration;
const interpolationFile = configuration.files.interpolation;
function prepareEnvironment() {
  for (const [name, content] of Object.entries(configuration.contents)) writePrivate(configuration.files[name], content);
}
const env = configuration.environment;
function compose(args) { return call('docker', ['compose', '--env-file', interpolationFile, '-p', project, '-f', 'compose.yaml', ...args], { env }); }
function container(service) {
  const id = compose(['ps', '--all', '-q', service]).trim();
  if (!id) return null;
  const detail = JSON.parse(call('docker', ['inspect', id]))[0];
  if (detail.Config.Labels['dev.socioh.owner'] !== owner || detail.Config.Labels['com.docker.compose.project'] !== project) throw new Error('Refusing an unowned Compose container.');
  return detail;
}
function validateOwned() {
  for (const service of ['database', 'backend', 'frontend']) container(service);
  for (const [name, internal] of [[`${project}_ingress`, false], [`${project}_api`, true], [`${project}-database`, true]]) {
    const r = spawnSync('docker', ['network', 'inspect', name], { encoding: 'utf8', env: dockerEnvironment({ app }) });
    if (r.status !== 0) {
      if (/not found|no such network/i.test(r.stderr || '')) continue;
      throw new Error('Cannot inspect the owned Compose networks.');
    }
    const network = JSON.parse(r.stdout)[0];
    if (network.Labels?.['dev.socioh.owner'] !== owner || network.Internal !== internal) throw new Error('Refusing an unowned or mismatched Compose network.');
  }
}
function acquireLock() {
  return acquireOwnedLock(resolve(runtime, 'compose.lock'), owner);
}
async function waitFor(predicate, name, seconds = 90) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${name}`);
}
async function health(service) { await waitFor(() => container(service)?.State.Health?.Status === 'healthy', service); }
async function availablePort() {
  await new Promise((res, rej) => {
    const s = net.createServer(); s.once('error', () => rej(new Error(`Local port ${port} is occupied; existing listener preserved.`)));
    s.listen(port, '127.0.0.1', () => s.close(res));
  });
}
function volume() {
  const r = spawnSync('docker', ['volume', 'inspect', '--format', '{{json .Labels}}', 'socioh-p1-compose-data'], { encoding: 'utf8', env: dockerEnvironment({ app }) });
  if (r.status === 0) {
    if (JSON.parse(r.stdout)?.['dev.socioh.owner'] !== owner) throw new Error('Compose volume is not owned by this workspace.');
  } else if (/no such volume/i.test(r.stderr || '')) call('docker', ['volume', 'create', '--label', `dev.socioh.owner=${owner}`, 'socioh-p1-compose-data']);
  else throw new Error('Cannot inspect the Compose volume.');
}
function provision() {
  const db = container('database');
  const sql = `DO $r$ BEGIN
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='catalog_migrator') THEN CREATE ROLE catalog_migrator LOGIN; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='catalog_runtime') THEN CREATE ROLE catalog_runtime LOGIN; END IF;
END $r$;
ALTER ROLE catalog_migrator PASSWORD '${credentials.migrator}';
ALTER ROLE catalog_runtime PASSWORD '${credentials.runtime}';\n`;
  call('docker', ['exec', '-i', db.Id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql });
  const present = call('docker', ['exec', db.Id, 'psql', '-XAt', '-U', 'postgres', '-d', 'postgres', '-c', `SELECT 1 FROM pg_database WHERE datname='${database}'`]).trim();
  if (present !== '1') call('docker', ['exec', db.Id, 'createdb', '-U', 'postgres', '-O', 'catalog_migrator', database]);
  call('docker', ['exec', db.Id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', `ALTER DATABASE ${database} OWNER TO catalog_migrator`]);
  call('docker', ['run', '--rm', '--network', 'socioh-p1-app-database', '--env-file', migrationFile, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', 'socioh-phase1-backend:local', 'migrate', 'up']);
}
function record() {
  const services = ['backend', 'frontend'].map(service => {
    const x = container(service);
    if (!x?.State.Running || x.State.Health?.Status !== 'healthy') throw new Error('Cannot record an unhealthy container runtime.');
    return { name: service === 'backend' ? 'go' : 'next', container: x.Id, pid: x.State.Pid, start: x.State.StartedAt, exe: x.Image };
  });
  const value = { owner, stack: 'acceptance', kind: 'compose', project, database, frontendURL: `http://127.0.0.1:${port}`, children: services, capturedAt: new Date().toISOString() };
  writePrivate(resolve(runtime, 'compose.json'), JSON.stringify(value, null, 2));
}
let releaseLock;
let cleanupApplication = false;
try {
  if (!['build', 'up', 'restart', 'stop', 'status'].includes(action)) throw new Error('Use build, up, restart, stop or status.');
  if (action === 'status') {
    console.log(call('docker', ['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--filter', `label=dev.socioh.owner=${owner}`]));
    process.exit(0);
  }
  if (action !== 'status') { releaseLock = acquireLock(); prepareArtifacts(app); prepareEnvironment(); }
  compose(['config', '--quiet']);
  validateOwned();
  if (action === 'build') { console.log(compose(['build'])); }
  else if (action === 'up') {
    if (container('frontend')?.State.Running || container('backend')?.State.Running) throw new Error('Compose application is already running; use restart.');
    await availablePort(); volume(); compose(['up', '-d', 'database']); await health('database');
    provision(); cleanupApplication = true;
    compose(['up', '-d', 'backend', 'frontend']); await health('backend'); await health('frontend'); record();
    cleanupApplication = false;
    console.log(`Owned Docker application ready: http://127.0.0.1:${port}`);
  } else if (action === 'restart') {
    if (!container('backend') || !container('frontend')) throw new Error('No owned application to restart.');
    compose(['stop', 'frontend', 'backend']); // Stop first: recovery must never overlap the old Go instance.
    cleanupApplication = true;
    compose(['start', 'backend', 'frontend']); await health('backend'); await health('frontend'); record();
    cleanupApplication = false;
    console.log('Owned Docker application restarted; database volume preserved.');
  } else if (action === 'stop') { compose(['stop']); console.log('Owned Compose containers stopped; data preserved.'); }
  else if (action === 'status') console.log(compose(['ps']));
  else throw new Error('Use build, up, restart, stop or status.');
} catch (error) {
  console.error(safe(error.message)); process.exitCode = 1;
  if (cleanupApplication) {
    try { validateOwned(); compose(['stop', 'frontend', 'backend']); console.error('Failed application startup stopped; database and diagnostic evidence preserved.'); }
    catch (cleanupError) { console.error(`Owned startup cleanup needs operator review: ${safe(cleanupError.message)}`); }
  }
}
finally { releaseLock?.(); }
