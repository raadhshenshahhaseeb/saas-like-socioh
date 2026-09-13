// Explicit, regenerable application output only. Never operate databases or evidence.
import { lstatSync, readdirSync, chmodSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareRuntimeArtifacts, validateArtifactDirectory, workspaceOwner, acquireOwnedLock,
  assertRuntimeReady, assertNoNativeRuntime, processIdentity } from './config.mjs';

const buildTargets = ['frontend/.next', 'backend/bin'];
const cacheTargets = ['frontend/.cache', 'backend/.cache', '.cache/tmp'];

function present(file) {
  try { return lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot inspect generated artifact; existing data was preserved.'); }
}

function validateTree(file) {
  const stat = lstatSync(file);
  if (process.getuid && stat.uid !== process.getuid()) throw new Error('Unsafe artifact ownership; existing data was preserved.');
  if (stat.isSymbolicLink() || stat.isFile()) return;
  if (!stat.isDirectory()) throw new Error('Unsafe non-file artifact; existing data was preserved.');
  for (const name of readdirSync(file)) validateTree(resolve(file, name));
}

function removeTree(file) {
  const stat = lstatSync(file);
  if (process.getuid && stat.uid !== process.getuid()) throw new Error('Artifact ownership changed during cleanup.');
  if (stat.isSymbolicLink() || stat.isFile()) { unlinkSync(file); return; }
  if (!stat.isDirectory()) throw new Error('Artifact type changed during cleanup.');
  // Go module cache directories may be owner-read-only. Change only validated
  // generated directories, never a source parent or a symlink target.
  chmodSync(file, 0o700);
  for (const name of readdirSync(file)) removeTree(resolve(file, name));
  rmdirSync(file);
}

export function cleanArtifacts(app, { caches = false, identity = processIdentity } = {}) {
  assertRuntimeReady(app);
  const { runtime } = prepareRuntimeArtifacts(app), owner = workspaceOwner(app);
  const releases = [];
  try {
    for (const name of ['lifecycle.lock', 'compose.lock']) releases.push(acquireOwnedLock(resolve(runtime, name), owner, identity));
    assertNoNativeRuntime(app, identity);
    const names = caches ? [...buildTargets, ...cacheTargets] : buildTargets;
    const targets = names.map(name => ({ name, file: validateArtifactDirectory(app, name) })).filter(target => present(target.file));
    // Validate every target and descendant before deleting the first output.
    for (const target of targets) validateTree(target.file);
    for (const target of targets) removeTree(target.file);
    return targets.map(target => target.name);
  } finally {
    for (const release of releases.reverse()) release();
  }
}

export async function buildApplication({ frontend, backend, start }) {
  await frontend();
  await backend();
  if (start) await start();
}
