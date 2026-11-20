import type {
  Mp4AudioOption,
  Mp4VariantOption,
  Mp4VariantsResponse,
  PictaAuthSession,
  PictaCanal,
  PictaComentario,
  PictaGenero,
  PictaLista,
  PictaPaginatedResponse,
  PictaPublicacion,
  PictaSerie,
  PictaSuscripcion,
  PictaTemporada,
  PictaUser,
  PictaVoto,
} from '../types/picta';

const PICTA_API_BASE = 'https://api.picta.cu';
const PICTA_CLIENT_ID = 'ebkU3YeFu3So9hesQHrS8AZjEa4v7TiYbS5QZIgO';
const SESSION_KEY = 'picta_pulse_session_v1';

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 12_000, signal: externalSignal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => {
    ctrl.abort(new DOMException('Timeout', 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => ctrl.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timer);
      ctrl.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return fetch(input, { ...rest, signal: ctrl.signal }).finally(() => {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  });
}

let sessionListener: ((session: PictaAuthSession | null) => void) | null = null;
let activeRefreshPromise: Promise<PictaAuthSession | null> | null = null;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const GET_CACHE_MAX = 140;
const getCache = new Map<string, CacheEntry>();
const inflightGets = new Map<string, Promise<unknown>>();
export const sizedImageMissCache = new Set<string>();

function normalizePictaUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+53')) return trimmed;
  if (/^53\d{8}$/.test(trimmed)) return `+${trimmed}`;
  if (/^\d{8}$/.test(trimmed)) return `+53${trimmed}`;
  return trimmed;
}

interface SafeParsedResponse<T> {
  isHtml: boolean;
  data: T | null;
  rawText: string;
}

async function parseJsonSafe<T>(res: Response): Promise<SafeParsedResponse<T>> {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();
  const isHtml =
    ct.includes('text/html') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');
  if (isHtml) {
    return { isHtml: true, data: null, rawText };
  }
  if (!trimmed) {
    return { isHtml: false, data: null, rawText };
  }
  try {
    return { isHtml: false, data: JSON.parse(trimmed) as T, rawText };
  } catch {
    return { isHtml: false, data: null, rawText };
  }
}

function buildCacheKey(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return path;
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort();
  if (keys.length === 0) return path;
  return `${path}?${keys.map((k) => `${k}=${String(params[k])}`).join('&')}`;
}

function invalidatePictaCache(prefixes: string[]) {
  for (const key of Array.from(getCache.keys())) {
    if (prefixes.some((p) => key.startsWith(p))) {
      getCache.delete(key);
    }
  }
}

function clearPictaCache() {
  getCache.clear();
  inflightGets.clear();
  generosCachePromise = null;
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

async function cachedGet<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const now = Date.now();
  const cached = getCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    getCache.delete(cacheKey);
    getCache.set(cacheKey, cached);
    return cached.data as T;
  }

  let inflight = inflightGets.get(cacheKey) as Promise<T> | undefined;
  if (!inflight) {
    inflight = fetcher()
      .then((data) => {
        if (getCache.size >= GET_CACHE_MAX) {
          const oldest = getCache.keys().next().value;
          if (oldest) getCache.delete(oldest);
        }
        getCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
        return data;
      })
      .finally(() => {
        inflightGets.delete(cacheKey);
      });
    inflightGets.set(cacheKey, inflight);
  }

  return raceWithAbort(inflight, signal);
}

export function onSessionChange(cb: (session: PictaAuthSession | null) => void) {
  sessionListener = cb;
}

export function getStoredSession(): PictaAuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PictaAuthSession;
    return parsed?.access_token ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: PictaAuthSession | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
      clearPictaCache();
    }
  } catch {
    // Ignore storage quota errors
  }
  if (sessionListener) {
    sessionListener(session);
  }
}

interface TokenResponseData {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  device_id?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

export async function loginPicta(username: string, password: string): Promise<PictaAuthSession> {
  const trimmed = username.trim();
  const normalized = normalizePictaUsername(trimmed);
  const candidates = normalized && normalized !== trimmed ? [normalized, trimmed] : [trimmed];

  let tokenData: TokenResponseData | null = null;
  let deviceId: string | undefined;
  let lastErrorMsg = 'No se pudo iniciar sesión en Picta.';
  let shouldTryProxyFallback = false;

  // 1. Conexión directa a api.picta.cu (funciona en Cuba sin VPN porque api.picta.cu admite CORS *)
  for (const candidate of candidates) {
    try {
      const fd = new FormData();
      fd.append('grant_type', 'password');
      fd.append('client_id', PICTA_CLIENT_ID);
      fd.append('username', candidate);
      fd.append('password', password);

      const res = await fetchWithTimeout(`${PICTA_API_BASE}/o/token/`, {
        method: 'POST',
        body: fd,
        timeoutMs: 12_000,
      });

      const parsed = await parseJsonSafe<TokenResponseData>(res);
      if (parsed.isHtml) {
        shouldTryProxyFallback = true;
        break;
      }

      if (res.ok && parsed.data?.access_token) {
        tokenData = parsed.data;
        deviceId = res.headers.get('x-device-id') || parsed.data.device_id || undefined;
        break;
      }

      lastErrorMsg =
        parsed.data?.error_description ||
        parsed.data?.message ||
        'Usuario o contraseña incorrectos en Picta.';
      // Si api.picta.cu respondió explícitamente credenciales inválidas (400/401), probar siguiente variante
      shouldTryProxyFallback = false;
    } catch {
      shouldTryProxyFallback = true;
      break;
    }
  }

  // 2. Respaldo al proxy /api/auth/login solo si la conexión directa al navegador falló por red/CORS
  if (!tokenData && shouldTryProxyFallback) {
    try {
      const proxyRes = await fetchWithTimeout('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        timeoutMs: 15_000,
      });
      const parsed = await parseJsonSafe<TokenResponseData>(proxyRes);
      if (parsed.isHtml) {
        throw new Error(
          'No se pudo conectar directo con api.picta.cu y el servidor de respaldo requiere verificación (o VPN fuera de Cuba).',
        );
      }
      if (!proxyRes.ok || !parsed.data?.access_token) {
        throw new Error(
          parsed.data?.error_description || parsed.data?.message || lastErrorMsg,
        );
      }
      tokenData = parsed.data;
      deviceId = parsed.data.device_id;
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con api.picta.cu. Revisa tu conexión de datos.',
      );
    }
  }

  if (!tokenData?.access_token) {
    throw new Error(lastErrorMsg);
  }

  const initialSession: PictaAuthSession = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || '',
    expires_in: tokenData.expires_in,
    device_id: deviceId,
    user: null,
  };
  saveStoredSession(initialSession);

  try {
    const user = await fetchMe();
    const latest = getStoredSession() || initialSession;
    const fullSession: PictaAuthSession = { ...latest, user };
    saveStoredSession(fullSession);
    return fullSession;
  } catch {
    return getStoredSession() || initialSession;
  }
}

async function refreshAccessToken(): Promise<PictaAuthSession | null> {
  if (activeRefreshPromise) return activeRefreshPromise;

  activeRefreshPromise = (async () => {
    const current = getStoredSession();
    if (!current?.refresh_token) {
      saveStoredSession(null);
      return null;
    }

    try {
      let data: TokenResponseData | null = null;
      let headerDevice: string | null = null;
      let tryProxy = false;

      try {
        const fd = new FormData();
        fd.append('grant_type', 'refresh_token');
        fd.append('client_id', PICTA_CLIENT_ID);
        fd.append('refresh_token', current.refresh_token);

        const directRes = await fetchWithTimeout(`${PICTA_API_BASE}/o/token/`, {
          method: 'POST',
          body: fd,
          timeoutMs: 12_000,
        });
        const parsed = await parseJsonSafe<TokenResponseData>(directRes);
        if (parsed.isHtml) {
          tryProxy = true;
        } else if (!directRes.ok) {
          saveStoredSession(null);
          return null;
        } else {
          data = parsed.data;
          headerDevice = directRes.headers.get('x-device-id');
        }
      } catch {
        tryProxy = true;
      }

      if (!data && tryProxy) {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: current.refresh_token }),
        });
        const parsed = await parseJsonSafe<TokenResponseData>(res);
        if (parsed.isHtml || !res.ok || !parsed.data?.access_token) {
          if (res.status === 400 || res.status === 401) {
            saveStoredSession(null);
          }
          return null;
        }
        data = parsed.data;
        headerDevice = res.headers.get('x-device-id');
      }

      if (!data?.access_token) {
        return null;
      }

      const updated: PictaAuthSession = {
        ...current,
        access_token: data.access_token,
        refresh_token: data.refresh_token || current.refresh_token,
        device_id: headerDevice || data.device_id || current.device_id,
      };
      saveStoredSession(updated);
      return updated;
    } catch {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  params?: Record<string, string | number | boolean | undefined | null>;
  formBody?: Record<string, string | number | boolean | undefined | null>;
  jsonBody?: unknown;
  signal?: AbortSignal;
}

export async function pictaRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, formBody, jsonBody, signal } = opts;

  let query = '';
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        sp.append(k, String(v));
      }
    }
    const str = sp.toString();
    if (str) query = (path.includes('?') ? '&' : '?') + str;
  }

  const normalizedPath = `${path.startsWith('/') ? path : `/${path}`}${query}`;
  const directUrl = `${PICTA_API_BASE}${normalizedPath}`;
  const proxyUrl = `/api/picta${normalizedPath}`;

  const executeDirect = async (session: PictaAuthSession | null): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (session?.device_id) headers['X-Device-Id'] = session.device_id;
    if (session?.profile_id !== undefined) headers['X-Profile-Id'] = String(session.profile_id);

    let body: BodyInit | undefined;
    if (method !== 'GET') {
      if (formBody) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(formBody)) {
          if (v !== undefined && v !== null) {
            fd.append(k, String(v));
          }
        }
        body = fd;
      } else if (jsonBody !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(jsonBody);
      }
    }

    return fetchWithTimeout(directUrl, { method, headers, body, signal, timeoutMs: 14_000 });
  };

  const executeProxy = async (session: PictaAuthSession | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (session?.device_id) headers['X-Device-Id'] = session.device_id;
    if (session?.profile_id !== undefined) headers['X-Profile-Id'] = String(session.profile_id);

    let body: string | undefined;
    if (formBody) {
      headers['Content-Type'] = 'application/json';
      headers['x-picta-form'] = '1';
      body = JSON.stringify(formBody);
    } else if (jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(jsonBody);
    }

    return fetchWithTimeout(proxyUrl, { method, headers, body, signal, timeoutMs: 18_000 });
  };

  const executeBest = async (session: PictaAuthSession | null): Promise<Response> => {
    try {
      const directRes = await executeDirect(session);
      const ct = (directRes.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('text/html')) {
        return directRes;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
    }
    return executeProxy(session);
  };

  let session = getStoredSession();
  let res = await executeBest(session);

  if (res.status === 401 && session?.refresh_token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      session = refreshed;
      res = await executeBest(session);
    }
  }

  const respDevice = res.headers.get('x-device-id');
  const respProfileRaw = res.headers.get('x-profile-id');
  const respProfile = respProfileRaw && /^\d+$/.test(respProfileRaw) ? Number(respProfileRaw) : undefined;
  if (
    session &&
    ((respDevice && respDevice !== session.device_id) ||
      (respProfile !== undefined && respProfile !== session.profile_id))
  ) {
    saveStoredSession({
      ...session,
      device_id: respDevice || session.device_id,
      profile_id: respProfile ?? session.profile_id,
    });
  }

  if (res.status === 204) {
    return {} as T;
  }

  const parsed = await parseJsonSafe<Record<string, unknown>>(res);
  if (parsed.isHtml) {
    throw new Error('Respuesta HTML inesperada al consultar Picta. Comprueba tu conexión.');
  }

  if (!res.ok) {
    const errObj = (parsed.data || { detail: parsed.rawText }) as {
      detail?: string;
      message?: string;
      error?: { message?: string } | string;
    };
    const msg =
      (typeof errObj.error === 'object' ? errObj.error?.message : errObj.error) ||
      errObj.detail ||
      errObj.message ||
      `Error ${res.status} en Picta`;
    throw new Error(msg);
  }

  return (parsed.data ?? {}) as T;
}

export async function fetchMe(): Promise<PictaUser> {
  return pictaRequest<PictaUser>('/v2/usuario/me/');
}

export async function fetchPublicaciones(
  params: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<PictaPaginatedResponse<PictaPublicacion>> {
  const key = buildCacheKey('/v2/publicacion/', params);
  return cachedGet(
    key,
    45_000,
    () => pictaRequest<PictaPaginatedResponse<PictaPublicacion>>('/v2/publicacion/', { params }),
    signal,
  );
}

export async function fetchPublicacionBySlug(slug: string, signal?: AbortSignal): Promise<PictaPublicacion | null> {
  const res = await fetchPublicaciones({ slug_url_raw: slug }, signal);
  return res.results?.[0] || null;
}

export async function fetchRecomendados(idPublicacion: number): Promise<PictaPublicacion[]> {
  try {
    const key = buildCacheKey('/v2/lista_reproduccion_canal/listar_recomendados/', {
      id_publicacion: idPublicacion,
    });
    const res = await cachedGet(key, 180_000, () =>
      pictaRequest<PictaPaginatedResponse<PictaPublicacion>>(
        '/v2/lista_reproduccion_canal/listar_recomendados/',
        { params: { id_publicacion: idPublicacion } },
      ),
    );
    return res.results || [];
  } catch {
    return [];
  }
}

export async function fetchSeries(
  params: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<PictaPaginatedResponse<PictaSerie>> {
  const key = buildCacheKey('/v2/serie/', params);
  return cachedGet(key, 60_000, () => pictaRequest<PictaPaginatedResponse<PictaSerie>>('/v2/serie/', { params }), signal);
}

export async function fetchTemporadas(serieId: number): Promise<PictaTemporada[]> {
  const params = { serie_pelser_id: serieId, ordering: 'numero', page_size: 50 };
  const key = buildCacheKey('/v2/temporada/', params);
  const res = await cachedGet(key, 300_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaTemporada>>('/v2/temporada/', { params }),
  );
  return res.results || [];
}

export async function fetchEpisodiosByTemporada(temporadaId: number): Promise<PictaPublicacion[]> {
  const res = await fetchPublicaciones({ temporada_id: temporadaId, page_size: 100 });
  const items = res.results || [];
  return [...items].sort((a, b) => {
    const na = a.categoria?.capitulo?.numero ?? a.categoria?.numero_capitulo ?? 0;
    const nb = b.categoria?.capitulo?.numero ?? b.categoria?.numero_capitulo ?? 0;
    return na - nb;
  });
}

export async function fetchCanales(
  params: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal,
): Promise<PictaPaginatedResponse<PictaCanal>> {
  const key = buildCacheKey('/v2/canal/', params);
  return cachedGet(key, 60_000, () => pictaRequest<PictaPaginatedResponse<PictaCanal>>('/v2/canal/', { params }), signal);
}

export async function fetchCanalByAlias(alias: string): Promise<PictaCanal | null> {
  const res = await fetchCanales({ alias_raw: alias });
  return res.results?.[0] || null;
}

export async function fetchCanalById(canalId: number, nombreFallback?: string): Promise<PictaCanal | null> {
  const byId = await fetchCanales({ id: canalId, page_size: 1 }).catch(() => ({ results: [] as PictaCanal[] }));
  if (byId.results?.[0]) return byId.results[0];
  if (nombreFallback) {
    const byName = await fetchCanales({ nombre_raw: nombreFallback, page_size: 5 }).catch(() => ({
      results: [] as PictaCanal[],
    }));
    const exact = (byName.results || []).find((c) => c.id === canalId) || byName.results?.[0];
    if (exact) return exact;
  }
  return null;
}

export async function fetchComentarios(
  publicacionId: number,
  page = 1,
): Promise<PictaPaginatedResponse<PictaComentario>> {
  const params = { publicacion_id: publicacionId, page, page_size: 20 };
  const key = buildCacheKey('/v2/comentario/', params);
  return cachedGet(key, 30_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaComentario>>('/v2/comentario/', { params }),
  );
}

export async function fetchRespuestasComentario(comentarioId: number): Promise<PictaComentario[]> {
  const params = { comentario_id: comentarioId, page_size: 50 };
  const key = buildCacheKey('/v2/comentario/', params);
  const res = await cachedGet(key, 30_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaComentario>>('/v2/comentario/', { params }),
  );
  return res.results || [];
}

export async function postComentario(
  publicacionId: number,
  texto: string,
  parentId?: number,
): Promise<PictaComentario> {
  const formBody: Record<string, string | number> = {
    publicacion: publicacionId,
    texto,
    usuario: 'true',
  };
  if (parentId) {
    formBody.comentario = parentId;
  }
  const created = await pictaRequest<PictaComentario>('/v1/comentario/', { method: 'POST', formBody });
  invalidatePictaCache(['/v2/comentario/']);
  return created;
}

export async function deleteComentario(comentarioId: number): Promise<void> {
  await pictaRequest('/v1/comentario/' + comentarioId + '/', { method: 'DELETE' });
  invalidatePictaCache(['/v2/comentario/']);
}

export async function fetchUserVote(publicacionId: number, userId: number): Promise<PictaVoto | null> {
  try {
    const params = { usuario_id: userId, publicacion_id: publicacionId };
    const key = buildCacheKey('/v2/voto/', params);
    const res = await cachedGet(key, 30_000, () =>
      pictaRequest<PictaPaginatedResponse<PictaVoto>>('/v2/voto/', { params }),
    );
    return res.results?.[0] || null;
  } catch {
    return null;
  }
}

export async function submitVote(publicacionId: number, valor: boolean): Promise<PictaVoto> {
  const res = await pictaRequest<PictaVoto>('/v1/voto/', {
    method: 'POST',
    formBody: { usuario: 'true', publicacion: publicacionId, valor: valor ? 'true' : 'false' },
  });
  invalidatePictaCache(['/v2/voto/']);
  return res;
}

export async function updateVote(voteId: number, valor: boolean): Promise<PictaVoto> {
  const res = await pictaRequest<PictaVoto>(`/v1/voto/${voteId}/`, {
    method: 'PATCH',
    formBody: { valor: valor ? 'true' : 'false' },
  });
  invalidatePictaCache(['/v2/voto/']);
  return res;
}

export async function removeVote(voteId: number): Promise<void> {
  await pictaRequest(`/v1/voto/${voteId}/`, { method: 'DELETE' });
  invalidatePictaCache(['/v2/voto/']);
}

export async function fetchUserSuscripciones(username: string): Promise<PictaSuscripcion[]> {
  const params = { usuario_nombre_raw: username, page_size: 100 };
  const key = buildCacheKey('/v2/suscripcion/', params);
  const res = await cachedGet(key, 60_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaSuscripcion>>('/v2/suscripcion/', { params }),
  );
  return res.results || [];
}

export async function checkCanalSubscription(canalId: number, username: string): Promise<PictaSuscripcion | null> {
  const params = { canal_id: canalId, usuario_nombre_raw: username };
  const key = buildCacheKey('/v2/suscripcion/', params);
  const res = await cachedGet(key, 45_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaSuscripcion>>('/v2/suscripcion/', { params }),
  );
  return res.results?.[0] || null;
}

export async function subscribeCanal(canalId: number): Promise<PictaSuscripcion> {
  const res = await pictaRequest<PictaSuscripcion>('/v1/suscripcion/', {
    method: 'POST',
    formBody: { canal: canalId, usuario: 'true' },
  });
  invalidatePictaCache(['/v2/suscripcion/', 'subscriptionsFeed:']);
  return res;
}

export async function unsubscribeCanal(suscripcionId: number): Promise<void> {
  await pictaRequest(`/v1/suscripcion/${suscripcionId}/`, { method: 'DELETE' });
  invalidatePictaCache(['/v2/suscripcion/', 'subscriptionsFeed:']);
}

export async function fetchListasCanal(canalId?: number, canalName?: string): Promise<PictaLista[]> {
  const params: Record<string, string | number> = { page_size: 48 };
  if (canalId) params.canal_id = canalId;
  if (canalName) params.canal_nombre_raw = canalName;
  const key = buildCacheKey('/v2/lista_reproduccion_canal/', params);
  const res = await cachedGet(key, 120_000, () =>
    pictaRequest<PictaPaginatedResponse<PictaLista>>('/v2/lista_reproduccion_canal/', { params }),
  );
  const results = res.results || [];
  return canalId ? results.filter((l) => !l.canal?.id || l.canal.id === canalId) : results;
}

export async function fetchListaPublicaciones(
  listaId: number,
): Promise<Array<{ id: number; posicion: number; publicacion: PictaPublicacion }>> {
  const params = { lista_id: listaId, ordering: 'posicion', page_size: 50 };
  const key = buildCacheKey('/v2/li_re_ca_pub/', params);
  const res = await cachedGet(key, 120_000, () =>
    pictaRequest<PictaPaginatedResponse<{ id: number; posicion: number; publicacion: PictaPublicacion }>>(
      '/v2/li_re_ca_pub/',
      { params },
    ),
  );
  return res.results || [];
}

export async function registerPlayback(publicacionId: number): Promise<void> {
  try {
    await pictaRequest('/v1/reproduccion/', {
      method: 'POST',
      formBody: { publicacion: publicacionId, usuario: 'true' },
    });
  } catch {
    // Non-blocking telemetry
  }
}

export async function fetchUserDownloadsQuota(): Promise<unknown[]> {
  const res = await pictaRequest<{ descargas?: unknown[] }>('/v2/publicacion/get_descargas/');
  return res.descargas || [];
}

export async function generateDownloadLink(publicacionId: number, calidad: string): Promise<{ url: string }> {
  return pictaRequest<{ url: string }>('/v2/publicacion/get_url_descarga/', {
    params: { id_publicacion: publicacionId, calidad },
  });
}

let generosCachePromise: Promise<PictaGenero[]> | null = null;

export async function fetchGeneros(): Promise<PictaGenero[]> {
  if (!generosCachePromise) {
    generosCachePromise = pictaRequest<PictaPaginatedResponse<PictaGenero>>('/v2/genero/', {
      params: { page_size: 60 },
    })
      .then((res) => res.results || [])
      .catch(() => {
        generosCachePromise = null;
        return [];
      });
  }
  return generosCachePromise;
}

export async function fetchSubscriptionsFeed(
  username: string,
  signal?: AbortSignal,
): Promise<{ subsCount: number; videos: PictaPublicacion[] }> {
  return cachedGet(
    `subscriptionsFeed:${username}`,
    60_000,
    async () => {
      const subs = await fetchUserSuscripciones(username);
      if (subs.length === 0) return { subsCount: 0, videos: [] };

      const channels = subs.map((s) => s.canal).filter((c) => Boolean(c?.nombre)).slice(0, 16);
      const allVideos: PictaPublicacion[] = [];
      const seen = new Set<number>();

      for (let i = 0; i < channels.length; i += 4) {
        const batch = channels.slice(i, i + 4);
        const results = await Promise.all(
          batch.map((ch) =>
            fetchPublicaciones({
              canal_nombre_raw: ch.nombre,
              page: 1,
              page_size: 8,
              ordering: '-fecha_publicado',
            }).catch(() => ({ results: [] as PictaPublicacion[] })),
          ),
        );
        for (const res of results) {
          for (const pub of res.results || []) {
            if (!seen.has(pub.id)) {
              seen.add(pub.id);
              allVideos.push(pub);
            }
          }
        }
      }

      allVideos.sort((a, b) => {
        const ta = new Date(a.fecha_publicado || a.fecha_creacion || 0).getTime();
        const tb = new Date(b.fecha_publicado || b.fecha_creacion || 0).getTime();
        return tb - ta;
      });

      return { subsCount: subs.length, videos: allVideos };
    },
    signal,
  );
}

const CLIENT_LANG_LABELS: Record<string, string> = {
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

function parseHlsAttrListClient(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    attrs[match[1]] = match[3] !== undefined ? match[3] : match[2];
  }
  return attrs;
}

function parseDurationClient(dur?: string | number): number {
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

function formatEstimatedMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `~${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 10) return `~${Math.round(mb)} MB`;
  return `~${mb.toFixed(1)} MB`;
}

function formatClientAudioLabel(lang?: string, name?: string, index = 0): string {
  const key = (lang || name || '').toLowerCase().trim();
  if (CLIENT_LANG_LABELS[key]) return CLIENT_LANG_LABELS[key];
  if (name && name.trim()) return name.trim().toUpperCase();
  if (lang && lang.trim()) return lang.trim().toUpperCase();
  return `Audio ${index + 1}`;
}

export async function fetchMp4Variants(
  manifestUrl: string,
  duration?: string | number,
): Promise<Mp4VariantsResponse> {
  const hlsUrl = getDirectPictaHlsUrl(manifestUrl);

  // 1. Consulta directa a videos.picta.cu (funciona en Cuba sin VPN)
  try {
    const res = await fetch(hlsUrl);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && !ct.includes('text/html')) {
      const manifestText = await res.text();
      const baseUrl = res.url || hlsUrl;
      const lines = manifestText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const audioTracks: Mp4AudioOption[] = [];
      const variants: Mp4VariantOption[] = [];
      let durationSec = parseDurationClient(duration);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MEDIA:')) {
          const attrs = parseHlsAttrListClient(line.slice('#EXT-X-MEDIA:'.length));
          if (attrs.TYPE === 'AUDIO' && attrs.URI) {
            audioTracks.push({
              id: `aud_${audioTracks.length}`,
              language: attrs.LANGUAGE || undefined,
              label: formatClientAudioLabel(attrs.LANGUAGE, attrs.NAME, audioTracks.length),
              url: new URL(attrs.URI, baseUrl).toString(),
              isDefault: attrs.DEFAULT === 'YES' || attrs.AUTOSELECT === 'YES',
            });
          }
        } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const attrs = parseHlsAttrListClient(line.slice('#EXT-X-STREAM-INF:'.length));
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
          const subRes = await fetch(probeTarget);
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

      return {
        isLive,
        durationSeconds: durationSec,
        variants: variants
          .sort((a, b) => a.bandwidth - b.bandwidth)
          .map((v) => ({
            ...v,
            estimatedSizeLabel:
              durationSec > 0 && v.bandwidth > 0
                ? formatEstimatedMb(((v.bandwidth + 128000) * durationSec) / 8)
                : undefined,
          })),
        audioTracks,
      };
    }
  } catch {
    // Fallback to server proxy below
  }

  // 2. Respaldo al servidor /api/mp4/variants
  const sp = new URLSearchParams({ url: manifestUrl });
  if (duration !== undefined && duration !== null && duration !== '') {
    sp.set('duration', String(duration));
  }
  const res = await fetch(`/api/mp4/variants?${sp.toString()}`);
  const parsed = await parseJsonSafe<Mp4VariantsResponse & { error?: string }>(res);
  if (parsed.isHtml || !res.ok || !parsed.data) {
    throw new Error(parsed.data?.error || 'No se pudieron leer las calidades del video.');
  }
  return parsed.data;
}

export class ClientRemuxUnsupportedError extends Error {
  constructor(message = 'Stream requiere empaquetado en servidor') {
    super(message);
    this.name = 'ClientRemuxUnsupportedError';
  }
}

async function fetchBinaryWithRetry(url: string, signal?: AbortSignal, retries = 3): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} descargando segmento`);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Error descargando segmento HLS.');
}

export async function downloadHlsAsMp4Client(opts: {
  videoUrl: string;
  audioUrl?: string;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
}): Promise<Blob> {
  const { videoUrl, audioUrl, signal, onProgress } = opts;

  if (audioUrl) {
    throw new ClientRemuxUnsupportedError('Las pistas de audio separadas requieren servidor.');
  }
  if (!videoUrl.toLowerCase().includes('.m3u8')) {
    onProgress?.(10);
    const bytes = await fetchBinaryWithRetry(videoUrl, signal, 3);
    onProgress?.(100);
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  }

  const manifestRes = await fetch(videoUrl, { signal });
  if (!manifestRes.ok) {
    throw new Error(`No se pudo abrir el flujo HLS (HTTP ${manifestRes.status}).`);
  }
  const baseUrl = manifestRes.url || videoUrl;
  const manifestText = await manifestRes.text();
  const lines = manifestText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.some((l) => l.startsWith('#EXT-X-KEY'))) {
    throw new ClientRemuxUnsupportedError('El flujo tiene cifrado EXT-X-KEY.');
  }

  let mapUrl: string | null = null;
  const segmentUrls: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match?.[1]) {
        mapUrl = new URL(match[1], baseUrl).toString();
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    segmentUrls.push(new URL(line, baseUrl).toString());
  }

  if (segmentUrls.length === 0) {
    throw new ClientRemuxUnsupportedError('Lista de reproducción sin segmentos directos.');
  }

  const isFmp4 = Boolean(mapUrl) || segmentUrls.some((u) => /\.(m4s|mp4)(\?|$)/i.test(u));
  const downloadUrls = mapUrl ? [mapUrl, ...segmentUrls] : segmentUrls;
  const total = downloadUrls.length;
  const downloaded: Array<Uint8Array | null> = new Array(total).fill(null);

  let completed = 0;
  let cursor = 0;
  const CONCURRENCY = 5;

  const worker = async () => {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const idx = cursor++;
      if (idx >= total) return;
      downloaded[idx] = await fetchBinaryWithRetry(downloadUrls[idx], signal, 3);
      completed += 1;
      const downloadMaxPct = isFmp4 ? 95 : 88;
      onProgress?.(Math.min(downloadMaxPct, Math.max(2, Math.round(2 + (completed / total) * (downloadMaxPct - 2)))));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));

  const validBuffers = downloaded.filter((b): b is Uint8Array => b !== null);
  if (isFmp4) {
    onProgress?.(100);
    return new Blob(validBuffers.map((b) => b.buffer as ArrayBuffer), { type: 'video/mp4' });
  }

  // Transmux MPEG-TS (.ts) -> fragmented MP4 100% en el navegador con mux.js (sin servidor ni VPN)
  const muxMod = await import('mux.js');
  const muxjs = (muxMod.default ?? muxMod) as typeof import('mux.js').default;
  const transmuxer = new muxjs.mp4.Transmuxer({ remux: true });
  const mp4Parts: ArrayBuffer[] = [];
  let gotInit = false;

  transmuxer.on('data', (segment) => {
    if (!gotInit && segment.initSegment && segment.initSegment.byteLength > 0) {
      mp4Parts.push(new Uint8Array(segment.initSegment).buffer as ArrayBuffer);
      gotInit = true;
    }
    if (segment.data && segment.data.byteLength > 0) {
      mp4Parts.push(new Uint8Array(segment.data).buffer as ArrayBuffer);
    }
  });

  for (let i = 0; i < validBuffers.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    transmuxer.push(validBuffers[i]);
    transmuxer.flush();
    downloaded[i] = null; // libera RAM incrementalmente
    onProgress?.(Math.min(99, 88 + Math.round(((i + 1) / validBuffers.length) * 11)));
  }

  if (mp4Parts.length === 0) {
    throw new ClientRemuxUnsupportedError('No se generaron cajas MP4 válidas desde TS.');
  }

  onProgress?.(100);
  return new Blob(mp4Parts, { type: 'video/mp4' });
}

export async function prepareMp4Download(opts: {
  videoUrl: string;
  audioUrl?: string;
  filename: string;
  durationSeconds?: number;
}): Promise<{ jobId: string }> {
  const res = await fetch('/api/mp4/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const parsed = await parseJsonSafe<{ jobId?: string; error?: string }>(res);
  if (parsed.isHtml || !res.ok || !parsed.data?.jobId) {
    throw new Error(parsed.data?.error || 'No se pudo preparar la descarga MP4 en el servidor.');
  }
  return { jobId: parsed.data.jobId };
}

export async function fetchMp4JobStatus(jobId: string): Promise<{
  id: string;
  status: 'preparing' | 'ready' | 'error';
  progressPct: number;
  fileSize?: number;
  filename?: string;
  error?: string;
}> {
  const res = await fetch(`/api/mp4/status/${encodeURIComponent(jobId)}`);
  const parsed = await parseJsonSafe<{
    id: string;
    status: 'preparing' | 'ready' | 'error';
    progressPct: number;
    fileSize?: number;
    filename?: string;
    error?: string;
  }>(res);
  if (parsed.isHtml || !res.ok || !parsed.data) {
    throw new Error(parsed.data?.error || 'Error consultando el progreso de descarga.');
  }
  return parsed.data;
}

export async function cancelMp4Job(jobId: string): Promise<void> {
  await fetch(`/api/mp4/job/${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => {});
}

export function isAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /;?\s*wv\)|Android.*Version\/\d+\.\d+.*Chrome\//i.test(navigator.userAgent);
}

export function isHostedPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /\.(run\.app|web\.app)$/i.test(window.location.hostname);
}

export async function fetchMp4BlobFromUrl(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const res = await fetch(url, { credentials: 'include' });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    const parsed = await parseJsonSafe<{ error?: string }>(res);
    throw new Error(parsed.data?.error || `Error descargando archivo (HTTP ${res.status})`);
  }
  if (ct.includes('text/html')) {
    throw new Error(
      'El proxy de vista previa devolvió una verificación HTML de cookies en lugar del MP4.',
    );
  }

  const total = Number(res.headers.get('content-length') || 0);
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(new Uint8Array(value));
        received += value.byteLength;
        if (total > 0 && onProgress) {
          onProgress(Math.min(100, Math.round((received / total) * 100)));
        }
      }
    }
    return new Blob(chunks, { type: ct || 'video/mp4' });
  }
  return res.blob();
}

export function saveMp4BlobToDevice(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 90_000);
}

export function canShareMp4File(filename = 'video.mp4'): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array([0])], filename, { type: 'video/mp4' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareMp4Blob(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    const file = new File([blob], filename, { type: 'video/mp4' });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({
      title: filename,
      files: [file],
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return true; // usuario cerró el selector de compartir manualmente
    }
    return false;
  }
}

export async function downloadFileViaBlob(
  url: string,
  filename: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const blob = await fetchMp4BlobFromUrl(url, onProgress);
  saveMp4BlobToDevice(blob, filename);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function getPictaImageCandidates(rawUrl?: string, size = '480x270'): string[] {
  if (!rawUrl) return [];
  const [basePath, query] = rawUrl.split('?');
  const hasImageExt = /\.(jpe?g|png|webp|gif|svg)$/i.test(basePath);
  const isAvatarUrl = /\/avatar\//i.test(basePath);
  const cacheKey = `${size}::${rawUrl}`;

  const candidates: string[] = [];
  if (!(hasImageExt && isAvatarUrl) && !sizedImageMissCache.has(cacheKey)) {
    const stripped = basePath.replace(/_\d+x\d+$/, '');
    const sized = query ? `${stripped}_${size}?${query}` : `${stripped}_${size}`;
    candidates.push(sized);
  }
  candidates.push(rawUrl);
  candidates.push(`/api/image?url=${encodeURIComponent(rawUrl)}&size=${encodeURIComponent(size)}`);
  return candidates;
}

export function getPictaImageUrl(rawUrl?: string, _size = '480x270'): string {
  return rawUrl || '';
}

export function getDirectPictaHlsUrl(manifestUrl?: string): string {
  if (!manifestUrl) return '';
  return manifestUrl.endsWith('.mpd')
    ? manifestUrl.replace(/manifest\.mpd$/i, 'master.m3u8')
    : manifestUrl;
}

export function getPictaHlsUrl(manifestUrl?: string): string {
  const direct = getDirectPictaHlsUrl(manifestUrl);
  if (!direct) return '';
  return `/api/stream?url=${encodeURIComponent(direct)}`;
}

export function getPictaSubtitleUrl(subUrl?: string): string {
  if (!subUrl) return '';
  return `/api/stream?url=${encodeURIComponent(subUrl)}&vtt=1`;
}

export function convertSrtToVttClient(srtText: string): string {
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const converted = normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${converted}\n`;
}

export async function fetchDirectSubtitleBlobUrl(subUrl?: string): Promise<{ url: string; isBlob: boolean }> {
  if (!subUrl) return { url: '', isBlob: false };
  try {
    const res = await fetch(subUrl);
    if (res.ok) {
      const text = await res.text();
      const vtt = text.trimStart().startsWith('WEBVTT') ? text : convertSrtToVttClient(text);
      const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt; charset=utf-8' }));
      return { url: blobUrl, isBlob: true };
    }
  } catch {
    // Fallback to server proxy below
  }
  return { url: getPictaSubtitleUrl(subUrl), isBlob: false };
}

export function formatDuration(dur?: string | number): string {
  if (dur === undefined || dur === null || dur === '') return '';
  if (typeof dur === 'string' && dur.includes(':')) {
    const parts = dur.split(':').map((p) => p.trim());
    if (parts.length === 3 && parts[0] === '00') {
      return `${parts[1]}:${parts[2]}`;
    }
    return dur;
  }
  const total = Number(dur);
  if (!Number.isFinite(total) || total <= 0) return '';
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

export function formatCount(num?: number): string {
  if (!num || num <= 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'ahora';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} m`;
  const years = Math.floor(months / 12);
  return `hace ${years} a`;
}

export function parseDescargaVariants(descargaJson?: string): Array<{ key: string; label: string; size: string }> {
  if (!descargaJson) return [];
  try {
    const parsed = JSON.parse(descargaJson) as Record<string, string>;
    const labels: Record<string, string> = {
      low: '360p (Ligero)',
      medium: '480p (Estándar)',
      high: '720p (HD)',
      hd: '1080p (Full HD)',
      source: 'Original',
    };
    return Object.entries(parsed)
      .filter(([, size]) => typeof size === 'string' && size.trim() !== '')
      .map(([key, size]) => ({
        key,
        label: labels[key.toLowerCase()] || key.toUpperCase(),
        size,
      }));
  } catch {
    return [];
  }
}
