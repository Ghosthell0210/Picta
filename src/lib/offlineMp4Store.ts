import type { PictaPublicacion } from '../types/picta';

const DB_NAME = 'picta_pulse_offline_v1';
const DB_VERSION = 1;
const STORE_NAME = 'mp4_downloads';

export interface OfflineMp4Record {
  videoId: number;
  video: PictaPublicacion;
  blob: Blob;
  filename: string;
  quality: string;
  sizeBytes: number;
  savedAt: number;
}

export interface OfflineMp4Meta {
  videoId: number;
  video: PictaPublicacion;
  filename: string;
  quality: string;
  sizeBytes: number;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Error abriendo almacenamiento offline.'));
  });
}

export async function saveOfflineMp4(record: OfflineMp4Record): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el video offline.'));
      tx.onabort = () => reject(tx.error || new Error('Almacenamiento cancelado o sin espacio.'));
    });
  } finally {
    db.close();
  }
}

export async function getOfflineMp4(videoId: number): Promise<OfflineMp4Record | null> {
  try {
    const db = await openDb();
    try {
      return await new Promise<OfflineMp4Record | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(videoId);
        req.onsuccess = () => resolve((req.result as OfflineMp4Record) || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function listOfflineMp4s(): Promise<OfflineMp4Meta[]> {
  try {
    const db = await openDb();
    try {
      return await new Promise<OfflineMp4Meta[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as OfflineMp4Record[]) || [];
          const metas: OfflineMp4Meta[] = rows
            .map((r) => ({
              videoId: r.videoId,
              video: r.video,
              filename: r.filename,
              quality: r.quality,
              sizeBytes: r.sizeBytes || r.blob?.size || 0,
              savedAt: r.savedAt,
            }))
            .sort((a, b) => b.savedAt - a.savedAt);
          resolve(metas);
        };
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function deleteOfflineMp4(videoId: number): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(videoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore storage errors
  }
}
