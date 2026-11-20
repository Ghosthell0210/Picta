import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let resolvedFfmpegBin: string | null = null;

function ensureFfmpegBinary(): string {
  if (resolvedFfmpegBin && (resolvedFfmpegBin === 'ffmpeg' || fs.existsSync(resolvedFfmpegBin))) {
    return resolvedFfmpegBin;
  }

  let installerPath = '';
  try {
    const pkg = require('@ffmpeg-installer/ffmpeg') as { path?: string };
    if (pkg?.path) installerPath = pkg.path;
  } catch {
    // ignore if package unavailable
  }

  const candidates = [
    installerPath,
    path.join(__dirname, 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean);

  for (const bin of candidates) {
    if (fs.existsSync(bin)) {
      try {
        fs.chmodSync(bin, 0o755);
      } catch {
        // ignore read-only fs chmod errors
      }
      resolvedFfmpegBin = bin;
      return bin;
    }
  }

  return 'ffmpeg';
}

const PICTA_API_BASE = 'https://api.picta.cu';
const PICTA_CLIENT_ID = 'ebkU3YeFu3So9hesQHrS8AZjEa4v7TiYbS5QZIgO';
const PORT = Number(process.env.PORT || 3000);

function normalizePictaUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+53')) return trimmed;
  if (/^53\d{8}$/.test(trimmed)) return `+${trimmed}`;
  if (/^\d{8}$/.test(trimmed)) return `+53${trimmed}`;
  return trimmed;
}

function isAllowedPictaUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return parsed.hostname === 'picta.cu' || parsed.hostname.endsWith('.picta.cu');
  } catch {
    return false;
  }
}

function rewriteM3u8Manifest(manifestText: string, baseUrl: string): string {
  const lines = manifestText.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_match, uriValue: string) => {
        try {
          const resolved = new URL(uriValue, baseUrl).toString();
          return `URI="/api/stream?url=${encodeURIComponent(resolved)}"`;
        } catch {
          return `URI="${uriValue}"`;
        }
      });
    }

    try {
      const resolved = new URL(trimmed, baseUrl).toString();
      return `/api/stream?url=${encodeURIComponent(resolved)}`;
    } catch {
      return line;
    }
  });

  return rewritten.join('\n');
}

function convertSrtToVtt(srtText: string): string {
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}\n`;
}

async function fetchWithConnectTimeout(
  url: string,
  init: RequestInit,
  res: Response,
  timeoutMs: number,
): Promise<{ upstream: globalThis.Response; ctrl: AbortController; cleanup: () => void }> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new Error(`Upstream timeout after ${timeoutMs}ms`));
  }, timeoutMs);

  const onClose = () => {
    if (!res.writableEnded) {
      ctrl.abort(new Error('Client disconnected'));
    }
  };
  res.on('close', onClose);

  try {
    const upstream = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(timer);
    return {
      upstream,
      ctrl,
      cleanup: () => {
        clearTimeout(timer);
        res.off('close', onClose);
      },
    };
  } catch (err) {
    clearTimeout(timer);
    res.off('close', onClose);
    if (timedOut && err instanceof Error) {
      throw new Error(`Tiempo de espera agotado conectando con Picta (${timeoutMs / 1000}s)`);
    }
    throw err;
  }
}

async function pipeUpstreamBody(upstream: globalThis.Response, res: Response): Promise<void> {
  if (!upstream.body) {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!res.writableEnded) res.send(buf);
    return;
  }
  const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
  nodeStream.on('error', () => {
    // Handled via pipeline rejection to prevent unhandled Readable 'error' crash
  });
  try {
    await pipeline(nodeStream, res);
  } catch {
    if (!nodeStream.destroyed) nodeStream.destroy();
    if (!res.destroyed && !res.writableEnded) res.destroy();
  }
}

interface Mp4VariantInfo {
  id: string;
  label: string;
  resolution?: string;
  bandwidth: number;
  estimatedSizeLabel?: string;
  url: string;
}

interface Mp4AudioInfo {
  id: string;
  label: string;
  language?: string;
  url: string;
  isDefault?: boolean;
}

interface Mp4Job {
  id: string;
  status: 'preparing' | 'ready' | 'error';
  progressPct: number;
  durationSeconds: number;
  filePath: string;
  tempDir?: string;
  filename: string;
  fileSize?: number;
  error?: string;
  createdAt: number;
  activeDownloads: number;
  abortCtrl?: AbortController;
  proc?: ReturnType<typeof spawn>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const mp4Jobs = new Map<string, Mp4Job>();

const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000;
const IMAGE_CACHE_MAX_ENTRIES = 150;
const IMAGE_CACHE_MAX_BYTES = 20 * 1024 * 1024;
const SIZED_MISS_MAX_ENTRIES = 500;

interface CachedImageEntry {
  buf: Buffer;
  ct: string;
  expiresAt: number;
}

const imageCache = new Map<string, CachedImageEntry>();
let imageCacheBytes = 0;
const imageInflight = new Map<string, Promise<{ buf: Buffer; ct: string } | null>>();
const sizedMissCache = new Set<string>();

function getCachedImage(key: string): CachedImageEntry | null {
  const entry = imageCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    imageCacheBytes -= entry.buf.length;
    imageCache.delete(key);
    return null;
  }
  // Refresh LRU order
  imageCache.delete(key);
  imageCache.set(key, entry);
  return entry;
}

function setCachedImage(key: string, buf: Buffer, ct: string) {
  if (buf.length > 2 * 1024 * 1024) return;
  const existing = imageCache.get(key);
  if (existing) {
    imageCacheBytes -= existing.buf.length;
    imageCache.delete(key);
  }
  while (
    imageCache.size >= IMAGE_CACHE_MAX_ENTRIES ||
    imageCacheBytes + buf.length > IMAGE_CACHE_MAX_BYTES
  ) {
    const oldestKey = imageCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = imageCache.get(oldestKey);
    if (oldest) imageCacheBytes -= oldest.buf.length;
    imageCache.delete(oldestKey);
  }
  imageCache.set(key, { buf, ct, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
  imageCacheBytes += buf.length;
}

function cleanupMp4Job(jobId: string) {
  const job = mp4Jobs.get(jobId);
  if (!job) return;
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  try {
    job.abortCtrl?.abort();
  } catch {
    // ignore
  }
  try {
    if (job.proc && !job.proc.killed) job.proc.kill('SIGTERM');
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
  } catch {
    // ignore
  }
  if (job.tempDir) {
    try {
      fs.rmSync(job.tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  mp4Jobs.delete(jobId);
}

async function fetchBufferWithRetry(url: string, signal: AbortSignal, retries = 3): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal.aborted) throw new Error('Descarga cancelada.');
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(new Error('Timeout descargando segmento')), 25000);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} descargando recurso de Picta`);
      }
      const arr = await resp.arrayBuffer();
      return Buffer.from(arr);
    } catch (err) {
      lastErr = err;
      if (signal.aborted) throw new Error('Descarga cancelada.');
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo descargar el segmento desde Picta.');
}

async function downloadHlsPlaylistToLocal(
  manifestUrl: string,
  prefix: string,
  destDir: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const manifestRes = await fetch(manifestUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
  if (!manifestRes.ok) {
    throw new Error(`No se pudo leer la lista de reproducción (HTTP ${manifestRes.status}).`);
  }
  const baseUrl = manifestRes.url || manifestUrl;
  const rawText = await manifestRes.text();
  const rawLines = rawText.split(/\r?\n/);

  const rewrittenLines: string[] = [];
  const tasks: Array<{ url: string; filePath: string }> = [];
  let assetCounter = 0;
  let segCounter = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      if (trimmed.includes('URI="')) {
        let updatedLine = trimmed;
        const uriMatches = Array.from(trimmed.matchAll(/URI="([^"]+)"/g));
        for (const m of uriMatches) {
          const uriVal = m[1];
          const resolved = new URL(uriVal, baseUrl).toString();
          const pathname = new URL(resolved).pathname;
          const extMatch = pathname.match(/\.(mp4|m4s|ts|key|aac)$/i);
          const ext = extMatch ? extMatch[0].toLowerCase() : trimmed.startsWith('#EXT-X-KEY') ? '.key' : '.mp4';
          const localAsset = `${prefix}_asset_${assetCounter++}${ext}`;
          tasks.push({ url: resolved, filePath: path.join(destDir, localAsset) });
          updatedLine = updatedLine.replace(`URI="${uriVal}"`, `URI="${localAsset}"`);
        }
        rewrittenLines.push(updatedLine);
      } else {
        rewrittenLines.push(trimmed);
      }
      continue;
    }

    const resolvedSeg = new URL(trimmed, baseUrl).toString();
    const pathname = new URL(resolvedSeg).pathname;
    const extMatch = pathname.match(/\.(ts|m4s|mp4|aac)$/i);
    const ext = extMatch ? extMatch[0].toLowerCase() : '.ts';
    const localSeg = `${prefix}_${String(segCounter++).padStart(5, '0')}${ext}`;
    tasks.push({ url: resolvedSeg, filePath: path.join(destDir, localSeg) });
    rewrittenLines.push(localSeg);
  }

  if (!rewrittenLines.some((l) => l === '#EXT-X-ENDLIST')) {
    rewrittenLines.push('#EXT-X-ENDLIST');
  }

  const localM3u8Path = path.join(destDir, `${prefix}.m3u8`);
  await fs.promises.writeFile(localM3u8Path, rewrittenLines.join('\n'), 'utf8');

  const total = Math.max(1, tasks.length);
  let done = 0;
  let cursor = 0;
  const CONCURRENCY = 5;

  const worker = async () => {
    while (true) {
      if (signal.aborted) throw new Error('Descarga cancelada.');
      const idx = cursor++;
      if (idx >= tasks.length) return;
      const item = tasks[idx];
      const buf = await fetchBufferWithRetry(item.url, signal, 3);
      await fs.promises.writeFile(item.filePath, buf);
      done += 1;
      onProgress(done, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()));
  return localM3u8Path;
}

function parseHlsAttrList(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    attrs[match[1]] = match[3] !== undefined ? match[3] : match[2];
  }
  return attrs;
}

function parseDurationInput(dur?: unknown): number {
  if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) return dur;
  if (typeof dur === 'string') {
    const trimmed = dur.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => Number(p.trim()));
      if (parts.every((n) => Number.isFinite(n))) {
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
      }
    }
  }
  return 0;
}

function formatBytesMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `~${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 10) return `~${Math.round(mb)} MB`;
  return `~${mb.toFixed(1)} MB`;
}

const LANG_LABELS: Record<string, string> = {
  es: 'Español',
  spa: 'Español',
  en: 'Inglés',
  eng: 'Inglés',
  fr: 'Francés',
  fre: 'Francés',
  fra: 'Francés',
  pt: 'Portugués',
  por: 'Portugués',
  nb: 'Original (NO)',
  nob: 'Original (NO)',
  ko: 'Coreano',
  kor: 'Coreano',
  ja: 'Japonés',
  jpn: 'Japonés',
  de: 'Alemán',
  deu: 'Alemán',
  it: 'Italiano',
  ita: 'Italiano',
  ru: 'Ruso',
  rus: 'Ruso',
  pl: 'Polaco',
  pol: 'Polaco',
};

function formatAudioLabel(lang?: string, name?: string, index = 0): string {
  const key = (lang || name || '').toLowerCase().trim();
  if (LANG_LABELS[key]) return LANG_LABELS[key];
  if (name && name.trim()) return name.trim().toUpperCase();
  if (lang && lang.trim()) return lang.trim().toUpperCase();
  return `Audio ${index + 1}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = (req.body || {}) as { username?: string; password?: string };
      if (!username || !password) {
        res.status(400).json({ error: 'missing_credentials', message: 'Ingresa tu usuario o teléfono y contraseña.' });
        return;
      }

      const candidates = [normalizePictaUsername(username)];
      if (candidates[0] !== username.trim()) {
        candidates.push(username.trim());
      }

      let lastStatus = 400;
      let lastBody: Record<string, unknown> = {};
      let deviceId: string | null = null;

      for (const candidate of candidates) {
        const fd = new FormData();
        fd.append('grant_type', 'password');
        fd.append('client_id', PICTA_CLIENT_ID);
        fd.append('username', candidate);
        fd.append('password', password);

        const upstream = await fetch(`${PICTA_API_BASE}/o/token/`, {
          method: 'POST',
          body: fd,
          signal: AbortSignal.timeout(15000),
        });

        deviceId = upstream.headers.get('x-device-id') || upstream.headers.get('X-Device-Id');
        lastStatus = upstream.status;
        lastBody = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;

        if (upstream.ok && lastBody.access_token) {
          res.json({
            ...lastBody,
            device_id: deviceId || undefined,
            normalized_username: candidate,
          });
          return;
        }
      }

      res.status(lastStatus).json({
        error: lastBody.error || 'invalid_grant',
        error_description: lastBody.error_description || 'Usuario o contraseña incorrectos en Picta.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de red conectando con Picta';
      res.status(502).json({ error: 'upstream_error', message });
    }
  });

  app.post('/api/auth/refresh', async (req: Request, res: Response) => {
    try {
      const { refresh_token } = (req.body || {}) as { refresh_token?: string };
      if (!refresh_token) {
        res.status(400).json({ error: 'missing_refresh_token' });
        return;
      }

      const fd = new FormData();
      fd.append('grant_type', 'refresh_token');
      fd.append('client_id', PICTA_CLIENT_ID);
      fd.append('refresh_token', refresh_token);

      const upstream = await fetch(`${PICTA_API_BASE}/o/token/`, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(15000),
      });

      const data = await upstream.json().catch(() => ({}));
      const deviceId = upstream.headers.get('x-device-id') || upstream.headers.get('X-Device-Id');
      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }

      res.json({ ...data, device_id: deviceId || undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error renovando sesión';
      res.status(502).json({ error: 'upstream_error', message });
    }
  });

  app.all('/api/picta/*', async (req: Request, res: Response) => {
    try {
      const subpath = req.originalUrl.replace(/^\/api\/picta/, '');
      const targetUrl = `${PICTA_API_BASE}${subpath}`;

      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      const authHeader = req.header('authorization');
      if (authHeader) headers.Authorization = authHeader;

      const deviceId = req.header('x-device-id');
      if (deviceId) headers['X-Device-Id'] = deviceId;

      const profileId = req.header('x-profile-id');
      if (profileId) headers['X-Profile-Id'] = profileId;

      let body: BodyInit | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const useFormData = req.header('x-picta-form') === '1';
        if (useFormData && req.body && typeof req.body === 'object') {
          const fd = new FormData();
          for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
            if (v !== undefined && v !== null) {
              fd.append(k, String(v));
            }
          }
          body = fd;
        } else if (req.body && Object.keys(req.body as object).length > 0) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(req.body);
        }
      }

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.timeout(20000),
      });

      const respDeviceId = upstream.headers.get('x-device-id');
      if (respDeviceId) {
        res.setHeader('X-Device-Id', respDeviceId);
      }

      const contentType = upstream.headers.get('content-type') || 'application/json';
      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);

      if (upstream.status === 204) {
        res.end();
        return;
      }

      const text = await upstream.text();
      res.send(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexión con api.picta.cu';
      res.status(502).json({ error: { code: 'PROXY_ERROR', message } });
    }
  });

  app.get('/api/stream', async (req: Request, res: Response) => {
    let cleanup: (() => void) | undefined;
    try {
      const url = typeof req.query.url === 'string' ? req.query.url : '';
      const asVtt = req.query.vtt === '1';
      if (!url || !isAllowedPictaUrl(url)) {
        res.status(400).json({ error: 'URL de streaming inválida' });
        return;
      }

      const fetchHeaders: Record<string, string> = {};
      const range = req.header('range');
      if (range) fetchHeaders.Range = range;

      const result = await fetchWithConnectTimeout(url, { headers: fetchHeaders }, res, 30000);
      const { upstream } = result;
      cleanup = result.cleanup;

      if (!upstream.ok && upstream.status !== 206) {
        if (!res.headersSent) {
          res.status(upstream.status).send('No se pudo obtener el flujo multimedia');
        }
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

      const ct = upstream.headers.get('content-type') || '';

      if (asVtt || url.toLowerCase().includes('.srt')) {
        const text = await upstream.text();
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(asVtt ? convertSrtToVtt(text) : text);
        return;
      }

      if (url.toLowerCase().includes('.m3u8') || ct.includes('mpegurl') || ct.includes('m3u8')) {
        const manifest = await upstream.text();
        const rewritten = rewriteM3u8Manifest(manifest, upstream.url || url);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(rewritten);
        return;
      }

      res.status(upstream.status);
      if (ct) res.setHeader('Content-Type', ct);
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      const ar = upstream.headers.get('accept-ranges');
      if (ar) res.setHeader('Accept-Ranges', ar);
      const isVodSegment = /\.(m4s|ts|mp4|aac|key)(\?|$)/i.test(url) || /init\.mp4/i.test(url);
      res.setHeader('Cache-Control', isVodSegment ? 'public, max-age=3600, immutable' : 'public, max-age=300');

      await pipeUpstreamBody(upstream, res);
    } catch (err) {
      if (!res.headersSent && !res.writableEnded) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Error de streaming' });
      }
    } finally {
      cleanup?.();
    }
  });

  app.get('/api/image', async (req: Request, res: Response) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      const size = typeof req.query.size === 'string' ? req.query.size : '480x270';
      if (!rawUrl || !isAllowedPictaUrl(rawUrl)) {
        res.status(400).end();
        return;
      }

      const cacheKey = `${size}::${rawUrl}`;
      const cached = getCachedImage(cacheKey);
      if (cached) {
        res.setHeader('Content-Type', cached.ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Image-Cache', 'HIT');
        res.send(cached.buf);
        return;
      }

      let inflight = imageInflight.get(cacheKey);
      if (!inflight) {
        inflight = (async () => {
          const [basePath, query] = rawUrl.split('?');
          const hasImageExt = /\.(jpe?g|png|webp|gif|svg)$/i.test(basePath);
          const isAvatarUrl = /\/avatar\//i.test(basePath);

          const buildSized = (u: string, s: string) => {
            const [base, q] = u.split('?');
            const stripped = base.replace(/_\d+x\d+$/, '');
            const sized = `${stripped}_${s}`;
            return q ? `${sized}?${q}` : sized;
          };

          const skipSized = (hasImageExt && isAvatarUrl) || sizedMissCache.has(cacheKey);
          const candidates = skipSized ? [rawUrl] : [buildSized(rawUrl, size), rawUrl];

          for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            try {
              const upstream = await fetch(candidate, { signal: AbortSignal.timeout(15000) });
              if (upstream.ok) {
                const ct = upstream.headers.get('content-type') || 'image/jpeg';
                const buf = Buffer.from(await upstream.arrayBuffer());
                setCachedImage(cacheKey, buf, ct);
                return { buf, ct };
              }
              await upstream.body?.cancel().catch(() => {});
              if (!skipSized && i === 0 && upstream.status === 404) {
                if (sizedMissCache.size >= SIZED_MISS_MAX_ENTRIES) {
                  sizedMissCache.clear();
                }
                sizedMissCache.add(cacheKey);
              }
            } catch {
              // try next candidate
            }
          }
          return null;
        })().finally(() => {
          imageInflight.delete(cacheKey);
        });

        imageInflight.set(cacheKey, inflight);
      }

      const resolved = await inflight;
      if (resolved && !res.writableEnded) {
        res.setHeader('Content-Type', resolved.ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('X-Image-Cache', 'MISS');
        res.send(resolved.buf);
        return;
      }

      if (!res.headersSent) res.status(404).end();
    } catch {
      if (!res.headersSent && !res.writableEnded) res.status(404).end();
    }
  });

  app.get('/api/download', async (req: Request, res: Response) => {
    let cleanup: (() => void) | undefined;
    try {
      const url = typeof req.query.url === 'string' ? req.query.url : '';
      const filename = typeof req.query.filename === 'string' ? req.query.filename : 'picta-video.mp4';
      if (!url || !isAllowedPictaUrl(url)) {
        res.status(400).json({ error: 'URL de descarga inválida' });
        return;
      }

      const result = await fetchWithConnectTimeout(url, {}, res, 30000);
      const { upstream } = result;
      cleanup = result.cleanup;

      if (!upstream.ok) {
        if (!res.headersSent) {
          res.status(upstream.status).send('No se pudo descargar el archivo');
        }
        return;
      }

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      const cl = upstream.headers.get('content-length');
      if (cl) res.setHeader('Content-Length', cl);

      await pipeUpstreamBody(upstream, res);
    } catch (err) {
      if (!res.headersSent && !res.writableEnded) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Error en descarga' });
      }
    } finally {
      cleanup?.();
    }
  });

  app.get('/api/mp4/variants', async (req: Request, res: Response) => {
    let cleanup: (() => void) | undefined;
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      let durationSec = parseDurationInput(req.query.duration);
      if (!rawUrl || !isAllowedPictaUrl(rawUrl)) {
        res.status(400).json({ error: 'URL de publicación inválida.' });
        return;
      }

      const hlsUrl = rawUrl.endsWith('.mpd')
        ? rawUrl.replace(/manifest\.mpd$/i, 'master.m3u8')
        : rawUrl;

      const result = await fetchWithConnectTimeout(hlsUrl, {}, res, 20000);
      cleanup = result.cleanup;
      const { upstream } = result;
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: 'No se pudo consultar las calidades de Picta.' });
        return;
      }

      const manifestText = await upstream.text();
      const baseUrl = upstream.url || hlsUrl;
      const lines = manifestText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const audioTracks: Mp4AudioInfo[] = [];
      const variants: Mp4VariantInfo[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MEDIA:')) {
          const attrs = parseHlsAttrList(line.slice('#EXT-X-MEDIA:'.length));
          if (attrs.TYPE === 'AUDIO' && attrs.URI) {
            const resolved = new URL(attrs.URI, baseUrl).toString();
            audioTracks.push({
              id: `aud_${audioTracks.length}`,
              language: attrs.LANGUAGE || undefined,
              label: formatAudioLabel(attrs.LANGUAGE, attrs.NAME, audioTracks.length),
              url: resolved,
              isDefault: attrs.DEFAULT === 'YES' || attrs.AUTOSELECT === 'YES',
            });
          }
        } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const attrs = parseHlsAttrList(line.slice('#EXT-X-STREAM-INF:'.length));
          const nextUri = lines[i + 1];
          if (nextUri && !nextUri.startsWith('#')) {
            const resolved = new URL(nextUri, baseUrl).toString();
            const bw = Number(attrs['AVERAGE-BANDWIDTH'] || attrs.BANDWIDTH || 0);
            const resolution = attrs.RESOLUTION;
            const fnameMatch = nextUri.match(/(\d{3,4}p)\.m3u8/i);
            let label = fnameMatch ? fnameMatch[1].toLowerCase() : '';
            if (!label && resolution) {
              const parts = resolution.split('x').map(Number);
              if (parts.length === 2 && Number.isFinite(parts[1])) {
                label = `${parts[1]}p`;
              }
            }
            if (!label) {
              label = bw > 0 ? `${Math.round(bw / 1000)} kbps` : `Calidad ${variants.length + 1}`;
            }
            variants.push({
              id: `var_${variants.length}`,
              label,
              resolution,
              bandwidth: bw,
              url: resolved,
            });
          }
        }
      }

      let isLive = false;
      const probeTarget = variants[0]?.url || baseUrl;
      if (variants.length === 0 && !manifestText.includes('#EXT-X-ENDLIST')) {
        isLive = true;
      } else if (variants.length > 0 || durationSec <= 0) {
        try {
          const subRes = await fetch(probeTarget, { signal: AbortSignal.timeout(10000) });
          if (subRes.ok) {
            const subText = await subRes.text();
            if (!subText.includes('#EXT-X-ENDLIST')) {
              isLive = true;
            }
            if (durationSec <= 0) {
              let sum = 0;
              for (const m of subText.matchAll(/#EXTINF:(\d+(?:\.\d+)?)/g)) {
                sum += Number(m[1]);
              }
              if (sum > 0) durationSec = Math.round(sum);
            }
          }
        } catch {
          // ignore duration probe error
        }
      }

      if (variants.length === 0) {
        variants.push({
          id: 'var_0',
          label: 'Original',
          bandwidth: 0,
          url: baseUrl,
        });
      }

      const enrichedVariants = variants
        .sort((a, b) => a.bandwidth - b.bandwidth)
        .map((v) => ({
          ...v,
          estimatedSizeLabel:
            durationSec > 0 && v.bandwidth > 0
              ? formatBytesMb(((v.bandwidth + 128000) * durationSec) / 8)
              : undefined,
        }));

      res.json({
        isLive,
        durationSeconds: durationSec,
        variants: enrichedVariants,
        audioTracks,
      });
    } catch (err) {
      if (!res.headersSent) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Error leyendo variantes HLS' });
      }
    } finally {
      cleanup?.();
    }
  });

  app.post('/api/mp4/prepare', async (req: Request, res: Response) => {
    try {
      const { videoUrl, audioUrl, filename, durationSeconds } = (req.body || {}) as {
        videoUrl?: string;
        audioUrl?: string;
        filename?: string;
        durationSeconds?: number;
      };

      if (!videoUrl || !isAllowedPictaUrl(videoUrl)) {
        res.status(400).json({ error: 'URL de video inválida.' });
        return;
      }
      if (audioUrl && !isAllowedPictaUrl(audioUrl)) {
        res.status(400).json({ error: 'URL de audio inválida.' });
        return;
      }

      for (const [id, existing] of mp4Jobs.entries()) {
        const ageMs = Date.now() - existing.createdAt;
        if (
          ageMs > 20 * 60 * 1000 ||
          (existing.status !== 'preparing' && existing.activeDownloads === 0 && ageMs > 10 * 60 * 1000)
        ) {
          cleanupMp4Job(id);
        }
      }

      const jobId = crypto.randomBytes(8).toString('hex');
      const rawName = (filename || `picta-${jobId}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeName = rawName.toLowerCase().endsWith('.mp4') ? rawName : `${rawName}.mp4`;
      const filePath = `/tmp/picta_mp4_${jobId}.mp4`;
      const tempDir = `/tmp/picta_hls_${jobId}`;
      const dur = Number(durationSeconds) > 0 ? Number(durationSeconds) : 0;
      const abortCtrl = new AbortController();

      fs.mkdirSync(tempDir, { recursive: true });

      const job: Mp4Job = {
        id: jobId,
        status: 'preparing',
        progressPct: 2,
        durationSeconds: dur,
        filePath,
        tempDir,
        filename: safeName,
        createdAt: Date.now(),
        activeDownloads: 0,
        abortCtrl,
      };
      job.cleanupTimer = setTimeout(() => cleanupMp4Job(jobId), 20 * 60 * 1000);
      mp4Jobs.set(jobId, job);

      res.json({ jobId });

      (async () => {
        try {
          const hasAudio = Boolean(audioUrl);
          const videoWeight = hasAudio ? 72 : 88;
          const audioWeight = hasAudio ? 16 : 0;

          const localVideoInput = videoUrl.toLowerCase().includes('.m3u8')
            ? await downloadHlsPlaylistToLocal(videoUrl, 'v', tempDir, abortCtrl.signal, (done, total) => {
                if (!abortCtrl.signal.aborted) {
                  job.progressPct = Math.min(2 + videoWeight, Math.max(2, Math.round(2 + (done / total) * videoWeight)));
                }
              })
            : await (async () => {
                const buf = await fetchBufferWithRetry(videoUrl, abortCtrl.signal, 3);
                const p = path.join(tempDir, 'v_raw.mp4');
                await fs.promises.writeFile(p, buf);
                job.progressPct = 2 + videoWeight;
                return p;
              })();

          let localAudioInput: string | null = null;
          if (audioUrl) {
            localAudioInput = audioUrl.toLowerCase().includes('.m3u8')
              ? await downloadHlsPlaylistToLocal(audioUrl, 'a', tempDir, abortCtrl.signal, (done, total) => {
                  if (!abortCtrl.signal.aborted) {
                    const base = 2 + videoWeight;
                    job.progressPct = Math.min(90, Math.max(base, Math.round(base + (done / total) * audioWeight)));
                  }
                })
              : await (async () => {
                  const buf = await fetchBufferWithRetry(audioUrl, abortCtrl.signal, 3);
                  const p = path.join(tempDir, 'a_raw.m4a');
                  await fs.promises.writeFile(p, buf);
                  job.progressPct = 90;
                  return p;
                })();
          }

          if (abortCtrl.signal.aborted) return;
          job.progressPct = Math.max(job.progressPct, 92);

          const args = [
            '-y',
            '-loglevel',
            'error',
            '-i',
            localVideoInput,
            ...(localAudioInput
              ? ['-i', localAudioInput, '-map', '0:v:0?', '-map', '1:a:0?']
              : ['-map', '0:v:0?', '-map', '0:a:0?']),
            '-sn',
            '-dn',
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            filePath,
          ];

          const ffmpegBin = ensureFfmpegBinary();
          const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
          job.proc = proc;

          let stderrTail = '';
          proc.stderr.on('data', (chunk: Buffer) => {
            stderrTail = (stderrTail + chunk.toString()).slice(-800);
          });

          proc.on('error', (err) => {
            job.status = 'error';
            job.error = err.message || 'Error ejecutando ffmpeg';
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {
              // ignore
            }
          });

          proc.on('close', (code) => {
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {
              // ignore
            }
            if (abortCtrl.signal.aborted) return;
            if (code === 0 && fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath);
              if (stat.size > 0) {
                job.status = 'ready';
                job.progressPct = 100;
                job.fileSize = stat.size;
                if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
                job.cleanupTimer = setTimeout(() => {
                  if (job.activeDownloads === 0) cleanupMp4Job(jobId);
                }, 15 * 60 * 1000);
                return;
              }
            }
            if (job.status !== 'error') {
              job.status = 'error';
              job.error = stderrTail.trim() || `No se pudo generar el archivo MP4 (código ${code}).`;
            }
            try {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch {
              // ignore
            }
          });
        } catch (err) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
          if (!abortCtrl.signal.aborted) {
            job.status = 'error';
            job.error = err instanceof Error ? err.message : 'Error descargando segmentos de Picta.';
          }
        }
      })();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error iniciando descarga MP4' });
    }
  });

  app.get('/api/mp4/status/:jobId', (req: Request, res: Response) => {
    const job = mp4Jobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Trabajo de descarga expirado o no encontrado.' });
      return;
    }
    res.json({
      id: job.id,
      status: job.status,
      progressPct: job.progressPct,
      fileSize: job.fileSize,
      filename: job.filename,
      error: job.error,
    });
  });

  app.delete('/api/mp4/job/:jobId', (req: Request, res: Response) => {
    cleanupMp4Job(req.params.jobId);
    res.status(204).end();
  });

  app.get('/api/mp4/file/:jobId', async (req: Request, res: Response) => {
    const job = mp4Jobs.get(req.params.jobId);
    if (!job || job.status !== 'ready' || !fs.existsSync(job.filePath)) {
      res.status(404).json({ error: 'El archivo MP4 ya no está disponible.' });
      return;
    }

    const stat = fs.statSync(job.filePath);
    const total = stat.size;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);

    const range = req.header('range');
    let start = 0;
    let end = total - 1;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        start = m[1] ? Number(m[1]) : 0;
        end = m[2] ? Math.min(total - 1, Number(m[2])) : total - 1;
        if (start > end || start >= total) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      }
    }

    res.setHeader('Content-Length', String(end - start + 1));

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.activeDownloads += 1;

    const stream = fs.createReadStream(job.filePath, { start, end });
    stream.on('error', () => {
      if (!res.destroyed && !res.writableEnded) res.destroy();
    });
    try {
      await pipeline(stream, res);
    } catch {
      if (!stream.destroyed) stream.destroy();
    } finally {
      job.activeDownloads = Math.max(0, job.activeDownloads - 1);
      if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
      job.cleanupTimer = setTimeout(() => {
        if (job.activeDownloads === 0) cleanupMp4Job(job.id);
      }, 10 * 60 * 1000);
    }
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    if (!process.env.DISABLE_HMR) {
      process.env.DISABLE_HMR = 'true';
    }

    if (process.env.DISABLE_HMR === 'true') {
      app.get('/@vite/client', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(`
const sheetsMap = new Map();
function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
class ErrorOverlay extends HTMLElement {}
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`);
      });
    }

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          }
        },
      }),
    );
    app.get('/assets/*', (_req: Request, res: Response) => {
      res.status(404).end();
    });
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Picta Pulse server listening on http://0.0.0.0:${PORT}`);
  });

  const handleShutdown = () => {
    for (const jobId of Array.from(mp4Jobs.keys())) {
      cleanupMp4Job(jobId);
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
