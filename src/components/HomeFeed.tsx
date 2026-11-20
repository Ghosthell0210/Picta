import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Flame, Play, RotateCcw, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { fetchPublicaciones, fetchSubscriptionsFeed, formatCount, formatDuration } from '../lib/pictaClient';
import type { PictaCanal, PictaPublicacion } from '../types/picta';
import { MediaImage } from './MediaImage';
import { VideoCard } from './VideoCard';

interface HomeFeedProps {
  onSelectVideo: (video: PictaPublicacion) => void;
  onSelectChannel: (canal: PictaCanal) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'Todo' },
  { id: 'subscriptions', label: 'Suscripciones' },
  { id: 'Película', label: 'Películas' },
  { id: 'Serie', label: 'Series' },
  { id: 'Video Musical', label: 'Música' },
  { id: 'Documental', label: 'Documentales' },
  { id: 'Shorts', label: 'Shorts' },
  { id: 'Live', label: 'En vivo' },
];

const SORT_OPTIONS = [
  { id: '-fecha_publicado', label: 'Recientes' },
  { id: '-cantidad_visitas', label: 'Populares' },
  { id: '-cantidad_me_gusta', label: 'Valorados' },
];

export const HomeFeed: React.FC<HomeFeedProps> = ({ onSelectVideo, onSelectChannel }) => {
  const { user } = useAuth();
  const { history } = usePlayer();
  const [category, setCategory] = useState('all');
  const [ordering, setOrdering] = useState('-fecha_publicado');
  const [onlyFree, setOnlyFree] = useState(true);
  const [videos, setVideos] = useState<PictaPublicacion[]>([]);
  const [subsCount, setSubsCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadFeed = useCallback(
    async (targetPage: number, append: boolean) => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        if (category === 'subscriptions') {
          if (!user?.username) {
            setVideos([]);
            setHasMore(false);
            setSubsCount(0);
            return;
          }
          const res = await fetchSubscriptionsFeed(user.username, ctrl.signal);
          const filtered = onlyFree
            ? res.videos.filter((v) => !v.precios || v.precios.length === 0)
            : res.videos;
          setSubsCount(res.subsCount);
          setVideos(filtered);
          setHasMore(false);
          setPage(1);
          return;
        }

        const params: Record<string, string | number> = {
          page: targetPage,
          page_size: 18,
          ordering,
        };
        if (onlyFree) {
          params.precios__isnull = 'true';
        }
        if (category === 'Live') {
          params.tipo__in = 'live';
        } else if (category !== 'all') {
          params.tipologia_nombre_raw__in = category;
        }

        const res = await fetchPublicaciones(params, ctrl.signal);
        const items = res.results || [];
        setVideos((prev) => (append ? [...prev, ...items] : items));
        setHasMore(Boolean(res.next));
        setPage(targetPage);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Error cargando el catálogo de Picta.');
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, ordering, onlyFree, user?.username],
  );

  useEffect(() => {
    loadFeed(1, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [loadFeed]);

  const progressMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const h of history) {
      if (h.durationSeconds > 0) {
        map.set(h.video.id, Math.round((h.progressSeconds / h.durationSeconds) * 100));
      }
    }
    return map;
  }, [history]);

  const featured = category === 'all' && videos.length > 0 ? videos[0] : null;
  const gridItems = featured ? videos.slice(1) : videos;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#FF4D4D] text-white font-semibold'
                    : 'bg-[#111318] text-[#9CA3AF] hover:text-[#F5F6F8] hover:bg-[#181B22] border border-white/[0.06]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 self-start shrink-0">
          <button
            type="button"
            onClick={() => setOnlyFree((f) => !f)}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap border transition-colors cursor-pointer ${
              onlyFree
                ? 'bg-[#181B22] border-[#FF4D4D]/50 text-[#F5F6F8]'
                : 'bg-[#111318] border-white/[0.06] text-[#9CA3AF] hover:text-[#F5F6F8]'
            }`}
          >
            {onlyFree ? 'Solo gratis' : 'Incluir de pago'}
          </button>

          {category !== 'subscriptions' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#111318] border border-white/[0.06] shrink-0">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrdering(opt.id)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    ordering === opt.id ? 'bg-[#181B22] text-white' : 'text-[#9CA3AF] hover:text-[#F5F6F8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {category === 'subscriptions' && !loading && subsCount !== null && subsCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
          <Users className="w-4 h-4 text-[#FF4D4D]" />
          <span>
            Lo más reciente de tus <strong className="font-mono-tabular text-[#F5F6F8]">{subsCount}</strong> canales seguidos
          </span>
        </div>
      )}

      {featured && !loading && (
        <section className="relative w-full rounded-3xl overflow-hidden bg-[#111318] border border-white/[0.08]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] items-stretch">
            <div className="relative aspect-video lg:aspect-auto lg:min-h-[340px] overflow-hidden bg-black">
              <MediaImage
                src={featured.url_imagen}
                size="480x270"
                alt={featured.nombre}
                priority
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#070709] via-[#070709]/35 to-transparent" />
            </div>

            <div className="p-5 sm:p-7 flex flex-col justify-center bg-[#111318]">
              <div className="flex items-center gap-2 text-xs text-[#FF4D4D] font-semibold">
                <Flame className="w-4 h-4 shrink-0" />
                <span>Destacado en Picta</span>
              </div>

              <h2 className="mt-2 font-display text-xl sm:text-2xl font-bold text-[#F5F6F8] line-clamp-2 leading-tight">
                {featured.nombre}
              </h2>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#9CA3AF]">
                <span>{featured.canal?.nombre || 'Picta'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {formatCount(featured.cantidad_visitas || featured.cantidad_reproducciones)} vistas
                </span>
                {formatDuration(featured.duracion) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{formatDuration(featured.duracion)}</span>
                  </>
                )}
              </div>

              {featured.descripcion && (
                <p className="mt-3 text-sm text-[#9CA3AF] line-clamp-2 leading-relaxed">
                  {featured.descripcion}
                </p>
              )}

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectVideo(featured)}
                  className="min-h-[46px] px-6 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Reproducir ahora</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-2xl border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 text-sm text-[#FCA5A5]">
            <AlertCircle className="w-5 h-5 shrink-0 text-[#FF4D4D] mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadFeed(1, false)}
            className="min-h-[44px] px-4 rounded-xl bg-[#FF4D4D] text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="animate-pulse">
              <div className="w-full aspect-video rounded-2xl bg-[#111318]" />
              <div className="mt-3 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-[#111318] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-5/6 rounded bg-[#111318]" />
                  <div className="h-3 w-1/2 rounded bg-[#111318]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : gridItems.length === 0 && !error ? (
        <div className="py-16 text-center text-[#9CA3AF]">
          <p className="text-base font-medium text-[#F5F6F8]">No hay publicaciones en esta categoría</p>
          <p className="mt-1 text-sm">Prueba cambiando el filtro o explorando otra sección.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {gridItems.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onSelect={onSelectVideo}
                onChannelClick={onSelectChannel}
                progressPercent={progressMap.get(video.id)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => loadFeed(page + 1, true)}
                className="min-h-[46px] px-8 rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/10 text-sm font-semibold text-[#F5F6F8] disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loadingMore ? 'Cargando más...' : 'Cargar más videos'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
