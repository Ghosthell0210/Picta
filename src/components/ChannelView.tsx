import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ListVideo, Loader2, UserPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  checkCanalSubscription,
  fetchCanalById,
  fetchEpisodiosByTemporada,
  fetchListaPublicaciones,
  fetchListasCanal,
  fetchPublicaciones,
  fetchSeries,
  fetchTemporadas,
  formatCount,
  subscribeCanal,
  unsubscribeCanal,
} from '../lib/pictaClient';
import type { PictaCanal, PictaLista, PictaPublicacion, PictaSerie, PictaTemporada } from '../types/picta';
import { MediaImage } from './MediaImage';
import { VideoCard } from './VideoCard';

interface ChannelViewProps {
  canal: PictaCanal;
  onBack: () => void;
  onSelectVideo: (video: PictaPublicacion) => void;
}

export const ChannelView: React.FC<ChannelViewProps> = ({ canal, onBack, onSelectVideo }) => {
  const { user } = useAuth();
  const [channelInfo, setChannelInfo] = useState<PictaCanal>(canal);
  const [tab, setTab] = useState<'videos' | 'movies' | 'series' | 'listas'>('videos');
  const [videos, setVideos] = useState<PictaPublicacion[]>([]);
  const [movies, setMovies] = useState<PictaPublicacion[]>([]);
  const [videosPage, setVideosPage] = useState(1);
  const [hasMoreVideos, setHasMoreVideos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [series, setSeries] = useState<PictaSerie[]>([]);
  const [listas, setListas] = useState<PictaLista[]>([]);
  const [selectedListaItems, setSelectedListaItems] = useState<PictaPublicacion[] | null>(null);
  const [activeListaName, setActiveListaName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [subId, setSubId] = useState<number | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [selectedSerie, setSelectedSerie] = useState<PictaSerie | null>(null);
  const [temporadas, setTemporadas] = useState<PictaTemporada[]>([]);
  const [activeTemporada, setActiveTemporada] = useState<number | null>(null);
  const [episodios, setEpisodios] = useState<PictaPublicacion[]>([]);
  const [loadingSerie, setLoadingSerie] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChannelInfo(canal);
    setLoading(true);
    setSelectedListaItems(null);
    setTab('videos');
    setVideosPage(1);

    Promise.all([
      fetchCanalById(canal.id, canal.nombre).catch(() => null),
      fetchPublicaciones({ canal_id: canal.id, page: 1, page_size: 36, ordering: '-fecha_publicado' }).catch(() => ({
        results: [] as PictaPublicacion[],
        next: null as string | null,
      })),
      fetchPublicaciones({
        canal_id: canal.id,
        tipologia_nombre_raw__in: 'Película',
        page: 1,
        page_size: 36,
        ordering: '-fecha_publicado',
      }).catch(() => ({ results: [] as PictaPublicacion[] })),
      fetchSeries({ page: 1, page_size: 100 }).catch(() => ({ results: [] as PictaSerie[] })),
      fetchListasCanal(canal.id, canal.nombre).catch(() => []),
      user?.username ? checkCanalSubscription(canal.id, user.username).catch(() => null) : Promise.resolve(null),
    ])
      .then(async ([fullCanal, vRes, mRes, sRes, lRes, sub]) => {
        if (cancelled) return;
        const resolvedCanal = fullCanal ? { ...canal, ...fullCanal } : canal;
        setChannelInfo(resolvedCanal);

        let vItems = vRes.results || [];
        let hasNext = Boolean(vRes.next);

        if (vItems.length === 0 && canal.nombre) {
          const fallback = await fetchPublicaciones({
            canal_nombre_raw: canal.nombre,
            page: 1,
            page_size: 36,
            ordering: '-fecha_publicado',
          }).catch(() => ({ results: [] as PictaPublicacion[], next: null as string | null }));
          vItems = fallback.results || [];
          hasNext = Boolean(fallback.next);
        }

        const featuredPubs = (resolvedCanal.publicaciones_destacadas || [])
          .map((d) => d.publicacion)
          .filter((p): p is PictaPublicacion => Boolean(p && p.id))
          .map((p) => (p.canal ? p : { ...p, canal: resolvedCanal }));

        const seenV = new Set(vItems.map((p) => p.id));
        const mergedVideos = [...vItems, ...featuredPubs.filter((p) => !seenV.has(p.id))];

        setVideos(mergedVideos);
        setHasMoreVideos(hasNext);

        const mItems = mRes.results || [];
        const derivedMovies = mergedVideos.filter((v) => v.categoria?.tipologia?.nombre === 'Película');
        const seenM = new Set(mItems.map((p) => p.id));
        setMovies([...mItems, ...derivedMovies.filter((p) => !seenM.has(p.id))]);

        setSeries((sRes.results || []).filter((s) => s.canal?.id === canal.id));
        setListas(lRes || []);
        setSubId(sub ? sub.id : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canal, user?.username]);

  const handleLoadMoreVideos = async () => {
    if (loadingMore || !hasMoreVideos) return;
    setLoadingMore(true);
    const nextPage = videosPage + 1;
    try {
      const res = await fetchPublicaciones({
        canal_id: canal.id,
        page: nextPage,
        page_size: 36,
        ordering: '-fecha_publicado',
      });
      const incoming = res.results || [];
      setVideos((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
      });
      setVideosPage(nextPage);
      setHasMoreVideos(Boolean(res.next));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleSub = async () => {
    if (subBusy) return;
    setSubBusy(true);
    try {
      if (subId) {
        await unsubscribeCanal(subId);
        setSubId(null);
      } else {
        const created = await subscribeCanal(canal.id);
        setSubId(created.id);
      }
    } finally {
      setSubBusy(false);
    }
  };

  const openPlaylist = async (lista: PictaLista) => {
    setActiveListaName(lista.nombre);
    setLoading(true);
    try {
      const items = await fetchListaPublicaciones(lista.id);
      setSelectedListaItems(items.map((x) => x.publicacion).filter(Boolean));
    } finally {
      setLoading(false);
    }
  };

  const subCountText = useMemo(() => {
    if (typeof channelInfo.cantidad_suscripciones === 'number') {
      return `${formatCount(channelInfo.cantidad_suscripciones)} suscriptores`;
    }
    return loading ? 'Cargando suscriptores...' : '0 suscriptores';
  }, [channelInfo.cantidad_suscripciones, loading]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] min-w-[44px] rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.08] flex items-center justify-center text-[#F5F6F8] cursor-pointer"
          aria-label="Volver"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-display text-lg font-semibold text-[#F5F6F8] truncate">{channelInfo.nombre}</h2>
      </div>

      <section className="rounded-3xl bg-[#111318] border border-white/[0.08] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-[#181B22] border border-white/10 shrink-0">
            <MediaImage
              src={channelInfo.url_avatar || channelInfo.url_imagen}
              size="80x80"
              alt={channelInfo.nombre}
              variant="avatar"
              fallbackText={channelInfo.nombre}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#F5F6F8] truncate">
              {channelInfo.nombre}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#9CA3AF]">
              <span className="font-mono-tabular">{subCountText}</span>
              {channelInfo.alias && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>@{channelInfo.alias}</span>
                </>
              )}
            </div>
            {channelInfo.descripcion && (
              <p className="mt-2 text-sm text-[#D1D5DB] line-clamp-2 max-w-2xl">{channelInfo.descripcion}</p>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={subBusy}
          onClick={handleToggleSub}
          className={`min-h-[46px] px-5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors ${
            subId
              ? 'bg-[#181B22] border border-white/10 text-[#F5F6F8] hover:bg-white/10'
              : 'bg-[#FF4D4D] hover:bg-[#FF6666] text-white'
          }`}
        >
          {subId ? (
            <>
              <Check className="w-4 h-4" />
              <span>Suscrito</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span>Suscribirse</span>
            </>
          )}
        </button>
      </section>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/[0.08]">
        {[
          { id: 'videos', label: `Videos (${videos.length})` },
          { id: 'movies', label: `Películas (${movies.length})` },
          { id: 'series', label: `Series (${series.length})` },
          { id: 'listas', label: `Listas (${listas.length})` },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id as 'videos' | 'movies' | 'series' | 'listas');
              setSelectedListaItems(null);
            }}
            className={`min-h-[44px] px-4 text-sm font-semibold whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
              tab === item.id ? 'border-[#FF4D4D] text-[#F5F6F8]' : 'border-transparent text-[#9CA3AF]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
        </div>
      ) : tab === 'videos' ? (
        videos.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9CA3AF]">Este canal aún no tiene videos.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} onSelect={onSelectVideo} />
              ))}
            </div>
            {hasMoreVideos && (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={handleLoadMoreVideos}
                  className="min-h-[44px] px-7 rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/10 text-sm font-semibold text-[#F5F6F8] disabled:opacity-50 cursor-pointer"
                >
                  {loadingMore ? 'Cargando...' : 'Cargar más videos'}
                </button>
              </div>
            )}
          </div>
        )
      ) : tab === 'movies' ? (
        movies.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9CA3AF]">Este canal no tiene películas publicadas.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {movies.map((v) => (
              <VideoCard key={v.id} video={v} onSelect={onSelectVideo} />
            ))}
          </div>
        )
      ) : tab === 'series' ? (
        series.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9CA3AF]">Este canal no tiene series publicadas.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {series.map((s) => (
              <button
                key={s.pelser_id}
                type="button"
                onClick={async () => {
                  setSelectedSerie(s);
                  setLoadingSerie(true);
                  setTemporadas([]);
                  setEpisodios([]);
                  try {
                    const temps = await fetchTemporadas(s.pelser_id);
                    setTemporadas(temps);
                    if (temps.length > 0) {
                      setActiveTemporada(temps[0].id);
                      const eps = await fetchEpisodiosByTemporada(temps[0].id);
                      setEpisodios(eps);
                    }
                  } finally {
                    setLoadingSerie(false);
                  }
                }}
                className="group text-left rounded-2xl bg-[#111318] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-colors cursor-pointer"
              >
                <div className="aspect-[3/4] bg-[#181B22] overflow-hidden">
                  <MediaImage
                    src={s.url_imagen || s.imagen_secundaria}
                    size="320x450"
                    alt={s.nombre}
                    variant="poster"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                </div>
                <div className="p-3">
                  <h4 className="font-display text-sm font-semibold text-[#F5F6F8] line-clamp-1">{s.nombre}</h4>
                  <p className="mt-1 font-mono-tabular text-xs text-[#9CA3AF]">
                    {s.cantidad_temporadas || 1} temp · {s.cantidad_capitulos || 0} cap
                  </p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : selectedListaItems ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-[#F5F6F8]">{activeListaName}</h3>
            <button
              type="button"
              onClick={() => setSelectedListaItems(null)}
              className="text-xs text-[#FF4D4D] font-semibold min-h-[40px] px-2 cursor-pointer"
            >
              Ver todas las listas
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {selectedListaItems.map((v) => (
              <VideoCard key={v.id} video={v} onSelect={onSelectVideo} />
            ))}
          </div>
        </div>
      ) : listas.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#9CA3AF]">Este canal no tiene listas de reproducción.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listas.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => openPlaylist(l)}
              className="flex items-center gap-3.5 rounded-2xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.06] p-3.5 text-left cursor-pointer transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-[#181B22] flex items-center justify-center shrink-0">
                <ListVideo className="w-5 h-5 text-[#FF4D4D]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display text-sm font-semibold text-[#F5F6F8] truncate">{l.nombre}</h4>
                <p className="mt-0.5 font-mono-tabular text-xs text-[#9CA3AF]">
                  {l.publicaciones?.length ?? 0} videos
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedSerie && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#111318] p-5 sm:p-6 max-h-[88dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-[#F5F6F8]">{selectedSerie.nombre}</h3>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  {[selectedSerie.pais, selectedSerie.ano, selectedSerie.clasificacion].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSerie(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-white cursor-pointer"
                aria-label="Cerrar serie"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {temporadas.length > 0 && (
              <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {temporadas.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={async () => {
                      setActiveTemporada(t.id);
                      setLoadingSerie(true);
                      try {
                        setEpisodios(await fetchEpisodiosByTemporada(t.id));
                      } finally {
                        setLoadingSerie(false);
                      }
                    }}
                    className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTemporada === t.id
                        ? 'bg-[#FF4D4D] text-white'
                        : 'bg-[#181B22] text-[#9CA3AF] hover:text-white'
                    }`}
                  >
                    {t.nombre || `Temporada ${t.numero}`}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {loadingSerie ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
                </div>
              ) : episodios.length === 0 ? (
                <p className="py-6 text-sm text-[#9CA3AF] text-center">
                  No hay episodios publicados en esta temporada.
                </p>
              ) : (
                episodios.map((ep) => (
                  <VideoCard
                    key={ep.id}
                    video={ep}
                    compact
                    onSelect={(v) => {
                      setSelectedSerie(null);
                      onSelectVideo(v);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
