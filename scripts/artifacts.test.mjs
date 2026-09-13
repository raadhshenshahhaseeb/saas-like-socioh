import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanArtifacts, buildApplication } from './artifacts.mjs';
import { artifactPaths, workspaceOwner, assertNoNativeRuntime } from './config.mjs';

const self = pid => pid === process.pid ? { pid, start: '100', exe: '/synthetic/node' } : null;
function fixture(t) {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '../.cache/artifact-tests');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(resolve(base, 'case-'));
  const app = resolve(root, 'app'); mkdirSync(app);
  t.after(() => rmSync(root, { recursive: true }));
  const paths = artifactPaths(app);
  for (const name of ['frontend/.next', 'backend/bin', 'frontend/.cache/npm', 'backend/.cache/go-mod/readonly', '.cache/tmp', '.cache/runtime', 'backend/src', 'frontend/src']) mkdirSync(resolve(app, name), { recursive: true, mode: 0o700 });
  for (const name of ['frontend/.next/build', 'backend/bin/catalog', 'frontend/.cache/npm/cache', 'backend/.cache/go-mod/readonly/module', '.cache/tmp/temp', '.cache/runtime/owned.log', '.cache/runtime/scoped.env', 'backend/src/main.go', 'frontend/src/page.tsx', '.env']) writeFileSync(resolve(app, name), 'synthetic preserved or regenerable fixture', { mode: 0o600 });
  return { app, root, paths, owner: workspaceOwner(app) };
}

test('clean removes only build outputs and never reads or deletes environment runtime or sources', t => {
  const { app } = fixture(t);
  const removed = cleanArtifacts(app, { identity: self });
  assert.deepEqual(removed, ['frontend/.next', 'backend/bin']);
  for (const name of removed) assert.equal(existsSync(resolve(app, name)), false);
  for (const name of ['.env', '.cache/runtime/owned.log', '.cache/runtime/scoped.env', 'backend/src/main.go', 'frontend/src/page.tsx', 'frontend/.cache/npm/cache', 'backend/.cache/go-mod/readonly/module', '.cache/tmp/temp']) assert.equal(readFileSync(resolve(app, name), 'utf8'), 'synthetic preserved or regenerable fixture');
});

test('cleanup additionally removes regenerable caches including read-only module directories', t => {
  const { app, root } = fixture(t);
  const outside = resolve(root, 'outside-data'); writeFileSync(outside, 'untouched caller data');
  symlinkSync(outside, resolve(app, 'backend/.cache/external-link'));
  chmodSync(resolve(app, 'backend/.cache/go-mod/readonly/module'), 0o444);
  chmodSync(resolve(app, 'backend/.cache/go-mod/readonly'), 0o555);
  const removed = cleanArtifacts(app, { caches: true, identity: self });
  assert.deepEqual(removed, ['frontend/.next', 'backend/bin', 'frontend/.cache', 'backend/.cache', '.cache/tmp']);
  for (const name of removed) assert.equal(existsSync(resolve(app, name)), false);
  assert.equal(readFileSync(outside, 'utf8'), 'untouched caller data');
  for (const name of ['.env', '.cache/runtime/owned.log', '.cache/runtime/scoped.env', 'backend/src/main.go', 'frontend/src/page.tsx']) assert.equal(existsSync(resolve(app, name)), true);
});

test('every live owned native stack blocks shared builds and cleanup without deleting outputs', t => {
  for (const stack of ['demo', 'acceptance', 'failure']) {
    const { app, paths, owner } = fixture(t);
    const child = { pid: 321, start: '77', exe: '/synthetic/active' };
    writeFileSync(resolve(paths.runtime, `${stack}.json`), JSON.stringify({ owner, stack, children: [child] }), { mode: 0o600 });
    const identity = pid => pid === 321 ? child : self(pid);
    assert.throws(() => assertNoNativeRuntime(app, identity), /live owned native/);
    assert.throws(() => cleanArtifacts(app, { caches: true, identity }), /live owned native/);
    assert.equal(existsSync(resolve(app, 'frontend/.next/build')), true);
    assert.equal(existsSync(resolve(app, 'backend/.cache/go-mod/readonly/module')), true);
  }
});

test('active native or Compose helper locks block cleanup without changing its targets', t => {
  for (const name of ['lifecycle.lock', 'compose.lock']) {
    const { app, paths, owner } = fixture(t);
    const child = { pid: 321, start: '77', exe: '/synthetic/active' };
    writeFileSync(resolve(paths.runtime, name), JSON.stringify({ owner, ...child }), { mode: 0o600 });
    assert.throws(() => cleanArtifacts(app, { caches: true, identity: pid => pid === 321 ? child : self(pid) }), /active/);
    assert.equal(existsSync(resolve(app, 'frontend/.next/build')), true);
  }
});

test('foreign or malformed runtime ownership blocks cleanup and reused process IDs do not', t => {
  const { app, paths, owner } = fixture(t);
  const record = resolve(paths.runtime, 'demo.json');
  for (const value of [{ owner: 'foreign', stack: 'demo', children: [] }, { owner, stack: 'demo', children: [{}] }]) {
    writeFileSync(record, JSON.stringify(value), { mode: 0o600 });
    assert.throws(() => cleanArtifacts(app, { identity: self }), /ownership/);
    assert.equal(existsSync(resolve(app, 'backend/bin/catalog')), true);
  }
  writeFileSync(record, JSON.stringify({ owner, stack: 'demo', children: [{ pid: 321, start: 'old', exe: '/synthetic/old' }] }), { mode: 0o600 });
  assert.doesNotThrow(() => cleanArtifacts(app, { identity: pid => pid === 321 ? { pid, start: 'new', exe: '/synthetic/new' } : self(pid) }));
});

test('cleanup rejects symlink roots or ancestors before deleting any other target', t => {
  for (const link of ['frontend/.next', 'backend/.cache']) {
    const { app, root } = fixture(t);
    const original = resolve(app, link);
    rmSync(original, { recursive: true }); // Only a generated directory in this fresh fixture.
    const outside = resolve(root, 'outside'); mkdirSync(outside); writeFileSync(resolve(outside, 'keep'), 'untouched');
    const mode = statSync(outside).mode;
    symlinkSync(outside, original);
    assert.throws(() => cleanArtifacts(app, { caches: true, identity: self }), /Unsafe/);
    assert.equal(readFileSync(resolve(outside, 'keep'), 'utf8'), 'untouched');
    assert.equal(statSync(outside).mode, mode);
    assert.equal(existsSync(resolve(app, 'backend/bin/catalog')), true);
  }
});

test('aggregate build and run sequence is deterministic and stops on the first failure', async () => {
  const order = [];
  await buildApplication({ frontend: async () => { order.push('frontend'); }, backend: async () => { order.push('backend'); }, start: async () => { order.push('start'); } });
  assert.deepEqual(order, ['frontend', 'backend', 'start']);
  const failed = [];
  await assert.rejects(buildApplication({ frontend: () => { failed.push('frontend'); throw new Error('synthetic failure'); }, backend: () => { failed.push('backend'); }, start: () => { failed.push('start'); } }), /synthetic failure/);
  assert.deepEqual(failed, ['frontend']);
});
