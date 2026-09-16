import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRecentStore, readRecentFile } from '../src/recents.js';
import { parseFile, searchNodes } from '../src/core.js';

const xmlFile = (text, name = 'project.xml', lastModified = 1000) => new File([text], name, { type: 'application/xml', lastModified });

test('a recent XML copy survives a fresh store session and reopens with the same bytes and metadata', async () => {
  const factory = new IDBFactory();
  const firstSession = createRecentStore(factory);
  const file = xmlFile('<soapui-project name="CRL café 😀"/>');
  const entry = await firstSession.remember(file, { savedAt: 123456 });
  const secondSession = createRecentStore(factory);
  const recent = await secondSession.list();
  assert.equal(recent.length, 1);
  assert.equal(recent[0].kind, 'copy');
  assert.equal(recent[0].savedAt, 123456);
  const reopened = await readRecentFile(recent[0], secondSession);
  assert.equal(reopened.name, file.name);
  assert.equal(reopened.lastModified, file.lastModified);
  assert.equal(await reopened.text(), await file.text());
  const parsed = await parseFile(reopened, 'reopened');
  assert.equal(searchNodes(parsed.nodes, 'CRL').occurrences, 1);
  await secondSession.remember(reopened, { id: entry.id, savedAt: entry.savedAt });
  const refreshed = await secondSession.list();
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].savedAt, 123456, 'Opening a copy must not present it as a newly captured original');
});

test('same content does not create duplicates, but same filename, size and date with different content stays separate', async () => {
  const store = createRecentStore(new IDBFactory());
  const a = xmlFile('AAA');
  const b = xmlFile('BBB');
  await store.remember(a);
  await store.remember(b);
  await store.remember(a);
  const entries = await store.list();
  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(await Promise.all(entries.map(async entry => (await readRecentFile(entry, store)).text()))), new Set(['AAA', 'BBB']));
});

test('retention keeps ten recent projects and removes the evicted bytes', async () => {
  const store = createRecentStore(new IDBFactory());
  const oldest = await store.remember(xmlFile('oldest', 'oldest.xml'));
  for (let i = 0; i < 10; i++) await store.remember(xmlFile(`file ${i}`, `file-${i}.xml`));
  const entries = await store.list();
  assert.equal(entries.length, 10);
  assert.ok(!entries.some(entry => entry.id === oldest.id));
  assert.equal(await store.copy(oldest.id), undefined);
});

test('forget one and forget all remove metadata and cached bytes, without changing the input files', async () => {
  const store = createRecentStore(new IDBFactory());
  const a = xmlFile('unchanged A');
  const b = xmlFile('unchanged B');
  const one = await store.remember(a);
  const two = await store.remember(b);
  await store.remove(one.id);
  assert.equal(await store.copy(one.id), undefined);
  assert.equal((await store.list()).length, 1);
  await store.clear();
  assert.equal(await store.copy(two.id), undefined);
  assert.equal((await store.list()).length, 0);
  assert.equal(await a.text(), 'unchanged A');
  assert.equal(await b.text(), 'unchanged B');
  await assert.rejects(readRecentFile(two, store), /niet meer beschikbaar/);
});

test('original-file reopen requests only read access and reads the current file each time', async () => {
  const modes = [];
  let current = xmlFile('version one');
  const entry = { kind: 'original', handle: {
    requestPermission(options) { modes.push(options.mode); return Promise.resolve('granted'); },
    getFile() { return Promise.resolve(current); },
  } };
  assert.equal(await (await readRecentFile(entry)).text(), 'version one');
  current = xmlFile('version two');
  assert.equal(await (await readRecentFile(entry)).text(), 'version two');
  assert.deepEqual(modes, ['read', 'read']);
});

test('denied permission or a missing original never silently reopens a stale copy', async () => {
  const store = { copy() { throw new Error('Must not fall back to a copy'); } };
  const denied = { kind: 'original', handle: {
    requestPermission: async () => 'denied',
    getFile() { throw new Error('Must not read after denial'); },
  } };
  await assert.rejects(readRecentFile(denied, store), /Geen leestoegang/);
  const missing = { kind: 'original', handle: {
    requestPermission: async () => 'granted',
    getFile: async () => { throw new DOMException('missing', 'NotFoundError'); },
  } };
  await assert.rejects(readRecentFile(missing, store), /verplaatst of verwijderd/);
});

test('a copy larger than 23 MB can be saved and read in a new session', async () => {
  const factory = new IDBFactory();
  const file = xmlFile('x'.repeat(24 * 1024 * 1024) + 'CRL', 'large.xml');
  const entry = await createRecentStore(factory).remember(file);
  const reopened = await readRecentFile(entry, createRecentStore(factory));
  assert.equal(reopened.size, file.size);
  assert.equal(await reopened.slice(-3).text(), 'CRL');
});

test('unavailable storage rejects explicitly without needing a remote fallback', async () => {
  await assert.rejects(createRecentStore(null).list(), /geen lokale opslag/);
});
