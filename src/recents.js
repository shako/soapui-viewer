const DATABASE = 'soapui-viewer-recents';
const LIMIT = 10;

export function createRecentStore(factory = globalThis.indexedDB) {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      if (!factory) { reject(new Error('Deze browser biedt geen lokale opslag voor recente bestanden.')); return; }
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('entries', { keyPath: 'id' });
        request.result.createObjectStore('copies');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Sluit andere vensters van deze viewer en probeer opnieuw.'));
    });
    return database;
  }
  async function transact(stores, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('Opslaan is onderbroken.'));
      transaction.onerror = () => {};
      try { action(transaction, value => { result = value; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  }
  const list = () => transact(['entries'], 'readonly', (transaction, result) => {
    const request = transaction.objectStore('entries').getAll();
    request.onsuccess = () => result(request.result.sort((a, b) => b.openedAt - a.openedAt));
  });
  return {
    list,
    async remember(file, { handle = null, id, savedAt = Date.now() } = {}) {
      const existing = await list();
      if (!id && handle) {
        for (const entry of existing) {
          if (entry.handle && await handle.isSameEntry(entry.handle)) { id = entry.id; break; }
        }
      }
      if (!id && !handle) {
        // File inputs expose no stable path. Content identity keeps equally named
        // projects separate, while reopening the same copy does not add duplicates.
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        id = `copy:${file.name}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      }
      id ||= crypto.randomUUID();
      const entry = {
        id, name: file.name, size: file.size, lastModified: file.lastModified,
        openedAt: Date.now(), savedAt, kind: handle ? 'original' : 'copy', handle,
      };
      await transact(['entries', 'copies'], 'readwrite', (transaction, result) => {
        const entries = transaction.objectStore('entries');
        const copies = transaction.objectStore('copies');
        entries.put(entry);
        if (handle) copies.delete(id);
        else copies.put(file, id);
        // Read inside the write transaction so another window cannot cause the
        // retention limit to be calculated from an outdated list.
        const request = entries.getAll();
        request.onsuccess = () => {
          const others = request.result.filter(item => item.id !== id).sort((a, b) => b.openedAt - a.openedAt);
          for (const old of others.slice(LIMIT - 1)) { entries.delete(old.id); copies.delete(old.id); }
        };
        result(entry);
      });
      return entry;
    },
    copy(id) {
      return transact(['copies'], 'readonly', (transaction, result) => {
        const request = transaction.objectStore('copies').get(id);
        request.onsuccess = () => result(request.result);
      });
    },
    remove(id) {
      return transact(['entries', 'copies'], 'readwrite', transaction => {
        transaction.objectStore('entries').delete(id);
        transaction.objectStore('copies').delete(id);
      });
    },
    clear() {
      return transact(['entries', 'copies'], 'readwrite', transaction => {
        transaction.objectStore('entries').clear();
        transaction.objectStore('copies').clear();
      });
    },
  };
}

export async function readRecentFile(entry, store) {
  if (entry.kind === 'original') {
    // Called directly from the recent-file button so the permission prompt keeps
    // the required user activation. Never substitute an old copy on failure.
    if (await entry.handle.requestPermission({ mode: 'read' }) !== 'granted') {
      throw new Error('Geen leestoegang. Gebruik Projecten openen om het bestand opnieuw te kiezen.');
    }
    try { return await entry.handle.getFile(); }
    catch (error) {
      if (error.name === 'NotFoundError') throw new Error('Het oorspronkelijke bestand is verplaatst of verwijderd. Kies het opnieuw via Projecten openen.');
      throw error;
    }
  }
  const copy = await store.copy(entry.id);
  if (!copy) throw new Error('Deze lokale kopie is niet meer beschikbaar. Open het oorspronkelijke XML-bestand opnieuw.');
  return new File([copy], entry.name, { type: 'application/xml', lastModified: entry.lastModified });
}
