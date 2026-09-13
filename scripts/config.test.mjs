import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync, existsSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvironment, setupEnvironment, loadCredentials, artifactPaths, childEnvironment, prepareArtifacts, migrateRuntime, assertRuntimeReady, workspaceOwner, assertNodeVersion, composeConfiguration, writePrivate, assertFrontendEnvironment } from './config.mjs';

const fixtureCredentials = {
  admin: 'A'.repeat(32), migrator: 'M'.repeat(32), runtime: 'R'.repeat(32),
};
const fixtureEnvironment = Object.entries(fixtureCredentials)
  .map(([role, value]) => `POSTGRES_${role.toUpperCase()}_PASSWORD=${value}`).join('\n') + '\n';

test('canonical environment is parsed as data without changing the caller environment', () => {
  const before = new Map(Object.entries(process.env));
  assert.deepEqual(parseEnvironment(`# Synthetic fixture\n${fixtureEnvironment}`), fixtureCredentials);
  assert.ok(Object.keys(process.env).length === before.size && Object.entries(process.env).every(([key, value]) => before.get(key) === value), 'caller environment changed');
});

function fixture(t) {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '../.cache/config-tests');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(resolve(base, 'case-'));
  const app = resolve(directory, 'app');
  mkdirSync(app, { mode: 0o700 });
  t.after(() => rmSync(directory, { recursive: true })); // Only this test's fresh directory.
  return { app, paths: artifactPaths(app) };
}

test('setup creates a private environment once and ordinary loading never generates it', t => {
  const { app, paths } = fixture(t);
  assert.throws(() => loadCredentials(app), /setup-env/);
  assert.equal(existsSync(paths.env), false);
  assert.equal(setupEnvironment(app), 'created');
  const original = readFileSync(paths.env, 'utf8');
  const credentials = loadCredentials(app);
  assert.ok(Object.values(credentials).every(value => /^[A-Za-z0-9_-]{32}$/.test(value)));
  assert.equal(new Set(Object.values(credentials)).size, 3);
  assert.equal(statSync(paths.env).mode & 0o777, 0o600);
  assert.equal(setupEnvironment(app), 'unchanged');
  assert.ok(readFileSync(paths.env, 'utf8') === original, 'repeat setup changed credentials');
});

test('strict parser rejects duplicate, shell, interpolation, missing and unknown keys without reflecting input', () => {
  for (const text of [fixtureEnvironment + fixtureEnvironment, fixtureEnvironment + 'EXTRA=value\n', fixtureEnvironment.replace('POSTGRES_ADMIN', 'export POSTGRES_ADMIN'), fixtureEnvironment.replace('A'.repeat(32), '$(ignored)'), fixtureEnvironment.replace('A'.repeat(32), '"' + 'A'.repeat(32) + '"'), fixtureEnvironment.replace(/POSTGRES_ADMIN_PASSWORD=.*\n/, '')]) {
    assert.throws(() => parseEnvironment(text), error => /env/.test(error.message) && !error.message.includes('ignored'));
  }
  for (const size of [32, 33, 64, 127, 128]) {
    const text = fixtureEnvironment.replace('A'.repeat(32), '_-a09'.repeat(26).slice(0, size));
    assert.equal(parseEnvironment(text).admin.length, size);
  }
  for (const size of [0, 31, 129]) assert.throws(() => parseEnvironment(fixtureEnvironment.replace('A'.repeat(32), 'A'.repeat(size))));
});

test('explicit setup imports existing values and refuses conflicts without overwriting either file', t => {
  const { app, paths } = fixture(t);
  mkdirSync(paths.legacy, { recursive: true, mode: 0o700 });
  const legacy = resolve(paths.legacy, 'database-credentials.json');
  writeFileSync(legacy, JSON.stringify(fixtureCredentials), { mode: 0o600 });
  assert.equal(setupEnvironment(app), 'imported');
  assert.deepEqual(loadCredentials(app), fixtureCredentials);
  const conflict = fixtureEnvironment.replace('R'.repeat(32), 'Z'.repeat(32));
  writeFileSync(paths.env, conflict, { mode: 0o600 });
  for (const operation of [loadCredentials, setupEnvironment]) assert.throws(() => operation(app), /conflict/);
  assert.ok(readFileSync(paths.env, 'utf8') === conflict, 'conflict overwrote canonical file');
  assert.ok(readFileSync(legacy, 'utf8') === JSON.stringify(fixtureCredentials), 'legacy file changed');
});

test('artifact paths stay application-local and directories have private permissions', t => {
  const { app, paths } = fixture(t);
  for (const directory of [app, resolve(app, 'frontend'), resolve(app, 'backend')]) {
    mkdirSync(directory, { recursive: true }); chmodSync(directory, 0o755);
  }
  prepareArtifacts(app);
  for (const key of ['runtime', 'tmp', 'binaries', 'goCache', 'goModules', 'goPath', 'npmCache']) {
    assert.ok(paths[key].startsWith(app + '/'));
    assert.equal(statSync(paths[key]).mode & 0o777, 0o700);
  }
  for (const directory of [app, resolve(app, 'frontend'), resolve(app, 'backend')]) assert.equal(statSync(directory).mode & 0o777, 0o755, 'source directory permissions changed');
});

const fakeIdentity = pid => pid === process.pid ? { pid, start: '100', exe: '/synthetic/node' } : null;
function migrationFixture(t) {
  const value = fixture(t);
  mkdirSync(resolve(value.app, 'frontend')); mkdirSync(resolve(value.app, 'backend'));
  mkdirSync(value.paths.legacy, { recursive: true, mode: 0o700 });
  writeFileSync(value.paths.env, fixtureEnvironment, { mode: 0o600 });
  return { ...value, owner: workspaceOwner(value.app) };
}

test('migration preserves owned record bytes and permanently retires both old helper lock paths', t => {
  const { app, paths, owner } = migrationFixture(t);
  const record = JSON.stringify({ owner, stack: 'acceptance', children: [{ pid: 456, start: '12', exe: '/synthetic/old-binary' }] });
  writeFileSync(resolve(paths.legacy, 'acceptance.json'), record, { mode: 0o600 });
  assert.throws(() => assertRuntimeReady(app), /migrate-runtime/);
  migrateRuntime(app, { identity: fakeIdentity });
  assert.equal(readFileSync(resolve(paths.runtime, 'acceptance.json'), 'utf8'), record);
  assert.equal(existsSync(resolve(paths.legacy, 'acceptance.json')), false);
  for (const name of ['lifecycle.lock', 'compose.lock']) {
    const retired = JSON.parse(readFileSync(resolve(paths.legacy, name), 'utf8'));
    // Both former launchers fail closed on differing owner, regardless of a dead migration PID.
    assert.notEqual(retired.owner, owner);
    assert.equal(retired.retired, true);
  }
  assert.doesNotThrow(() => assertRuntimeReady(app));
  assert.doesNotThrow(() => migrateRuntime(app, { identity: fakeIdentity }));
});

test('migration refuses an active old native or compose operation before moving records', t => {
  for (const lock of ['lifecycle.lock', 'compose.lock']) {
    const { app, paths, owner } = migrationFixture(t);
    const record = JSON.stringify({ owner, stack: 'demo', children: [] });
    writeFileSync(resolve(paths.legacy, 'demo.json'), record, { mode: 0o600 });
    writeFileSync(resolve(paths.legacy, lock), JSON.stringify({ owner, pid: 321, start: '99' }), { mode: 0o600 });
    const identity = pid => pid === 321 ? { pid, start: '99', exe: '/synthetic/active' } : fakeIdentity(pid);
    assert.throws(() => migrateRuntime(app, { identity }), /active/);
    assert.equal(readFileSync(resolve(paths.legacy, 'demo.json'), 'utf8'), record);
    assert.equal(existsSync(resolve(paths.runtime, 'demo.json')), false);
  }
});

test('migration detects conflicting destinations without overwriting records', t => {
  const { app, paths, owner } = migrationFixture(t);
  prepareArtifacts(app);
  const original = JSON.stringify({ owner, stack: 'demo', children: [] });
  writeFileSync(resolve(paths.legacy, 'demo.json'), original, { mode: 0o600 });
  writeFileSync(resolve(paths.runtime, 'demo.json'), original + '\n', { mode: 0o600 });
  assert.throws(() => migrateRuntime(app, { identity: fakeIdentity }), /conflict/);
  assert.equal(readFileSync(resolve(paths.legacy, 'demo.json'), 'utf8'), original);
  assert.equal(readFileSync(resolve(paths.runtime, 'demo.json'), 'utf8'), original + '\n');
});

test('migration resumes byte-identical partial copies and preserves historical executable identity', t => {
  const { app, paths, owner } = migrationFixture(t);
  prepareArtifacts(app);
  const record = JSON.stringify({ owner, stack: 'failure', stopped: true, children: [{ pid: 456, start: '17', exe: '/synthetic/retired-binary' }] });
  for (const directory of [paths.runtime, paths.legacy]) writeFileSync(resolve(directory, 'failure.json'), record, { mode: 0o600 });
  migrateRuntime(app, { identity: fakeIdentity });
  assert.equal(readFileSync(resolve(paths.runtime, 'failure.json'), 'utf8'), record);
  assert.equal(existsSync(resolve(paths.legacy, 'failure.json')), false);
});

test('failed first or second retirement write retains old records and gates new helpers until retry', t => {
  for (const failingLock of ['lifecycle.lock', 'compose.lock']) {
    const { app, paths, owner } = migrationFixture(t);
    const record = JSON.stringify({ owner, stack: 'demo', children: [] });
    const source = resolve(paths.legacy, 'demo.json');
    const destination = resolve(paths.runtime, 'demo.json');
    writeFileSync(source, record, { mode: 0o600 });
    const write = (file, content, options) => {
      if (file === resolve(paths.legacy, failingLock)) throw new Error('Synthetic retirement write failure.');
      writePrivate(file, content, options);
    };
    assert.throws(() => migrateRuntime(app, { identity: fakeIdentity, write }), /Synthetic retirement/);
    assert.equal(existsSync(source), true, 'old ownership record removed before both retirement markers persisted');
    assert.equal(readFileSync(source, 'utf8'), record);
    assert.throws(() => assertRuntimeReady(app), /migrate-runtime/, 'new helpers must stay gated after retirement failure');
    assert.equal(readFileSync(destination, 'utf8'), record);
    const originalInode = statSync(destination).ino;
    migrateRuntime(app, { identity: fakeIdentity });
    assert.doesNotThrow(() => assertRuntimeReady(app));
    assert.equal(readFileSync(destination, 'utf8'), record);
    assert.equal(statSync(destination).ino, originalInode, 'retry replaced an already valid destination');
    assert.equal(existsSync(source), false);
    for (const name of ['lifecycle.lock', 'compose.lock']) {
      const retired = JSON.parse(readFileSync(resolve(paths.legacy, name), 'utf8'));
      assert.notEqual(retired.owner, owner);
      assert.equal(retired.retired, true);
    }
  }
});

test('migration refuses foreign record ownership before moving any owned record', t => {
  const { app, paths, owner } = migrationFixture(t);
  writeFileSync(resolve(paths.legacy, 'demo.json'), JSON.stringify({ owner, stack: 'demo', children: [] }), { mode: 0o600 });
  writeFileSync(resolve(paths.legacy, 'failure.json'), JSON.stringify({ owner: 'synthetic-other-owner', stack: 'failure', children: [] }), { mode: 0o600 });
  assert.throws(() => migrateRuntime(app, { identity: fakeIdentity }), /ownership/);
  assert.equal(existsSync(resolve(paths.legacy, 'demo.json')), true);
  assert.equal(existsSync(resolve(paths.runtime, 'demo.json')), false);
});

test('world-readable canonical environment is rejected without silently repairing caller permissions', t => {
  const { app, paths } = fixture(t);
  writeFileSync(paths.env, fixtureEnvironment, { mode: 0o644 }); chmodSync(paths.env, 0o644);
  assert.throws(() => loadCredentials(app), /private/);
  assert.equal(statSync(paths.env).mode & 0o777, 0o644);
});

test('Compose gets only role-specific private files and an explicitly empty interpolation source', t => {
  const { app } = fixture(t);
  mkdirSync(resolve(app, 'frontend')); mkdirSync(resolve(app, 'backend'));
  prepareArtifacts(app);
  const composition = composeConfiguration({ app, credentials: fixtureCredentials, database: 'catalog_test', port: 3100, inherited: { PATH: '/synthetic/tools', POSTGRES_ADMIN_PASSWORD: 'untrusted', DATABASE_URL: 'untrusted', COMPOSE_ENV_FILES: '/synthetic/untrusted' }, nodeExecutable: '/synthetic/node' });
  assert.ok(!Object.keys(composition.environment).some(key => /PASSWORD|DATABASE_URL|COMPOSE_ENV_FILES/.test(key)));
  assert.ok(!Object.values(composition.environment).some(value => Object.values(fixtureCredentials).some(secret => value.includes(secret))));
  for (const [role, secret] of Object.entries(fixtureCredentials)) {
    const key = role === 'admin' ? 'postgres' : role === 'runtime' ? 'go' : 'migration';
    assert.ok(composition.contents[key].includes(secret));
    for (const [other, otherSecret] of Object.entries(fixtureCredentials)) if (other !== role) assert.ok(!composition.contents[key].includes(otherSecret));
  }
  assert.ok(!composition.contents.interpolation.includes('='));
  for (const [name, content] of Object.entries(composition.contents)) {
    writePrivate(composition.files[name], content);
    assert.equal(statSync(composition.files[name]).mode & 0o777, 0o600);
  }
});

test('private environment and artifact symlinks are refused without modifying their targets', t => {
  const { app, paths } = fixture(t);
  const target = resolve(app, 'caller-data');
  writeFileSync(target, fixtureEnvironment, { mode: 0o600 });
  symlinkSync(target, paths.env);
  assert.throws(() => loadCredentials(app), /private/);
  assert.throws(() => setupEnvironment(app), /private/);
  assert.ok(readFileSync(target, 'utf8') === fixtureEnvironment);
  mkdirSync(resolve(app, 'frontend')); mkdirSync(resolve(app, 'backend'));
  symlinkSync(resolve(app, 'backend'), paths.cache);
  assert.throws(() => prepareArtifacts(app), /Unsafe/);
});

test('existing artifacts below symlinked source parents never chmod or overwrite outside targets', t => {
  for (const source of ['backend', 'frontend']) {
    const { app } = fixture(t);
    const outside = resolve(app, '../outside-target');
    const artifact = source === 'backend' ? 'bin' : '.cache/npm';
    const target = resolve(outside, artifact);
    mkdirSync(target, { recursive: true, mode: 0o755 });
    chmodSync(target, 0o755); chmodSync(outside, 0o755);
    const payload = resolve(target, 'caller-data');
    writeFileSync(payload, 'synthetic caller data', { mode: 0o644 });
    const mode = statSync(target).mode;
    symlinkSync(outside, resolve(app, source));
    mkdirSync(resolve(app, source === 'backend' ? 'frontend' : 'backend'));
    assert.throws(() => prepareArtifacts(app), /Unsafe/);
    assert.throws(() => writePrivate(resolve(app, source, artifact, 'caller-data'), 'replacement'), /Unsafe/);
    assert.equal(statSync(target).mode, mode, 'outside artifact permissions changed');
    assert.equal(statSync(outside).mode & 0o777, 0o755, 'outside source permissions changed');
    assert.equal(readFileSync(payload, 'utf8'), 'synthetic caller data');
  }
});

test('symlinked application roots and nested cache ancestors are rejected before writes', t => {
  const { app } = fixture(t);
  mkdirSync(resolve(app, 'backend')); mkdirSync(resolve(app, 'frontend'));
  const alias = resolve(app, '../app-alias');
  symlinkSync(app, alias);
  assert.throws(() => setupEnvironment(alias), /Unsafe/);
  assert.throws(() => prepareArtifacts(alias), /Unsafe/);
  assert.equal(existsSync(resolve(app, '.env')), false);
  const outside = resolve(app, '../outside-cache');
  mkdirSync(resolve(outside, 'npm'), { recursive: true, mode: 0o755 });
  chmodSync(resolve(outside, 'npm'), 0o755);
  symlinkSync(outside, resolve(app, 'frontend/.cache'));
  assert.throws(() => prepareArtifacts(app), /Unsafe/);
  assert.equal(statSync(resolve(outside, 'npm')).mode & 0o777, 0o755);
});

test('documented Node prerequisite is enforced without discovering a private toolchain', () => {
  assert.doesNotThrow(() => assertNodeVersion('24.21.0'));
  assert.doesNotThrow(() => assertNodeVersion('24.22.1'));
  for (const version of ['24.11.1', '22.0.0', '25.0.0']) assert.throws(() => assertNodeVersion(version), /Node 24/);
});

test('child environments isolate runtime migration tests and frontend from ambient secrets', t => {
  const { app } = fixture(t);
  const config = { database: 'catalog_demo', go: 8080, web: 3000 };
  const inherited = { PATH: '/synthetic/tools', LANG: 'C', DATABASE_URL: 'synthetic-untrusted', MIGRATION_DATABASE_URL: 'synthetic-untrusted', POSTGRES_ADMIN_PASSWORD: 'synthetic-untrusted', NODE_OPTIONS: '--require=untrusted', UNRELATED_TOOL_CONFIG: '/synthetic/ignored' };
  const get = scope => childEnvironment({ app, credentials: fixtureCredentials, config, inherited, nodeExecutable: '/synthetic/node', scope });
  for (const scope of ['base', 'frontend', 'frontend-build']) {
    const env = get(scope);
    assert.ok(!Object.keys(env).some(key => /DATABASE|PASSWORD|WORKSPACE|UNRELATED_TOOL_CONFIG|NODE_OPTIONS/.test(key)), 'secret or unrelated metadata crossed frontend/build boundary');
    assert.ok(!Object.values(env).some(value => Object.values(fixtureCredentials).some(secret => value.includes(secret))), 'credential crossed child boundary');
  }
  assert.ok(get('serve').DATABASE_URL.includes(fixtureCredentials.runtime));
  assert.ok(!Object.hasOwn(get('serve'), 'MIGRATION_DATABASE_URL'));
  assert.ok(get('migrate').MIGRATION_DATABASE_URL.includes(fixtureCredentials.migrator));
  assert.ok(!Object.hasOwn(get('migrate'), 'DATABASE_URL'));
  assert.ok(get('tests').TEST_DATABASE_URL.includes('/catalog_integration?'));
  assert.ok(!Object.hasOwn(get('tests'), 'DATABASE_URL'));
  assert.throws(() => get('unknown'), /scope/);
});

test('frontend dotenv files directories and broken links are refused while root configuration remains allowed', t => {
  for (const [name, kind] of [['.env', 'file'], ['.env.local', 'file'], ['.env.production', 'directory'], ['.env.development.local', 'broken-link']]) {
    const { app, paths } = fixture(t);
    const frontend = resolve(app, 'frontend'); mkdirSync(frontend);
    writeFileSync(paths.env, fixtureEnvironment, { mode: 0o600 });
    writeFileSync(resolve(frontend, '.env.example'), '# Documentation only\n');
    assert.doesNotThrow(() => assertFrontendEnvironment(app));
    const target = resolve(frontend, name);
    if (kind === 'file') writeFileSync(target, 'SYNTHETIC_SECRET=do-not-reflect-this', { mode: 0o600 });
    else if (kind === 'directory') mkdirSync(target);
    else symlinkSync(resolve(frontend, 'missing-target'), target);
    assert.throws(() => assertFrontendEnvironment(app), error => /Frontend dotenv/.test(error.message) && !error.message.includes('do-not-reflect-this'));
    for (const scope of ['frontend', 'frontend-build']) assert.throws(() => childEnvironment({ app, credentials: fixtureCredentials, config: { database: 'catalog_demo', go: 8080, web: 3000 }, scope, inherited: {}, nodeExecutable: '/synthetic/node' }), /Frontend dotenv/);
    assert.ok(readFileSync(paths.env, 'utf8') === fixtureEnvironment, 'root canonical configuration changed');
  }
});
