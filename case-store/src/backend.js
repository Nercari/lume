// Storage backend contract. It has the shape of one IndexedDB object store with string keys:
//   get(key) -> value | undefined     put(key, value)     delete(key)     keys(prefix) -> string[]
// Values must survive structured clone (IndexedDB stores CryptoKey and Uint8Array that way).
// The browser build wraps one IndexedDB object store; tests use MemoryBackend.

export class MemoryBackend {
  #map = new Map();

  async get(key) {
    return this.#map.has(key) ? structuredClone(this.#map.get(key)) : undefined;
  }

  async put(key, value) {
    this.#map.set(key, structuredClone(value));
  }

  async delete(key) {
    this.#map.delete(key);
  }

  async keys(prefix = '') {
    return [...this.#map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  // Test helper: the raw stored records, for storage-inspection checks.
  dump() {
    return [...this.#map.entries()];
  }
}
