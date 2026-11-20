import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Film, Loader2, Search, SlidersHorizontal, Tv, Users, X } from 'lucide-react';
import {
  fetchCanales,
  fetchEpisodiosByTemporada,
  fetchGeneros,
  fetchPublicaciones,
  fetchSeries,
  fetchTemporadas,
  formatCount,
} from '../lib/pictaClient';
import type { PictaCanal, PictaGenero, PictaPublicacion, PictaSerie, PictaTemporada } from '../types/picta';
import { MediaImage } from './MediaImage';
import { VideoCard } from './VideoCard';

const COUNTRIES = [
  'Cuba',
  'Estados Unidos',
  'España',
  'México',
  'Corea del Sur',
  'Japón',
  'Reino Unido',
  'Francia',
  'Colombia',
  'Argentina',
  'Polonia',
  'Brasil',
  'Alemania',
  'Italia',
];

interface ExploreSearchViewProps {
  initialQuery?: string;
  onSelectVideo: (video: PictaPublicacion) => void;
  onSelectChannel: (canal: PictaCanal) => void;
}

export const ExploreSearchView: React.FC<ExploreSearchViewProps> = ({
  initialQuery = '',
  onSelectVideo,
  onSelectChannel,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<'videos' | 'series' | 'canales'>('videos');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [generos, setGeneros] = useState<PictaGenero[]>([]);
  const [videos, setVideos] = useState<PictaPublicacion[]>([]);
  const [series, setSeries] = useState<PictaSerie[]>([]);
  const [canales, setCanales] = useState<PictaCanal[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSerie, setSelectedSerie] = useState<PictaSerie | null>(null);
  const [temporadas, setTemporadas] = useState<PictaTemporada[]>([]);
  const [activeTemporada, setActiveTemporada] = useState<number | null>(null);
  const [episodios, setEpisodios] = useState<PictaPublicacion[]>([]);
  const [loadingSerie, setLoadingSerie] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    fetchGeneros().then(setGeneros);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);

      const q = query.trim();
      const cleanTokens = q
        .toLowerCase()
        .replace(/['’".,:;!?()]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0);
      const longestToken = cleanTokens.reduce((best, t) => (t.length > best.length ? t : best), '');
      const wildcardPattern = longestToken ? `*${longestToken}*` : '';

      try {
        const extraFilters: Record<string, string> = {};
        if (selectedGenre) extraFilters.genero_raw = selectedGenre;
        if (selectedCountry) extraFilters.pais = selectedCountry;

        if (scope === 'videos') {
          if (!q) {
            const res = await fetchPublicaciones(
              { page: 1, page_size: 24, ordering: '-cantidad_reproducciones', ...extraFilters },
              ctrl.signal,
            );
            setVideos(res.results || []);
          } else {
            const [bySearch, byTitle] = await Promise.all([
              fetchPublicaciones(
                { page: 1, page_size: 24, ordering: '-cantidad_visitas', search: q, ...extraFilters },
                ctrl.signal,
              ).catch(() => ({ results: [] as PictaPublicacion[] })),
              wildcardPattern
                ? fetchPublicaciones(
                    {
                      page: 1,
                      page_size: 24,
                      ordering: '-cantidad_visitas',
                      nombre__wildcard: wildcardPattern,
                      ...extraFilters,
                    },
                    ctrl.signal,
                  ).catch(() => ({ results: [] as PictaPublicacion[] }))
                : Promise.resolve({ results: [] as PictaPublicacion[] }),
            ]);
            const seen = new Set<number>();
            const merged: PictaPublicacion[] = [];
            const titleItems = (byTitle.results || []).filter((item) => {
              const nameLower = (item.nombre || '').toLowerCase();
              return cleanTokens.length <= 1 || cleanTokens.every((t) => nameLower.includes(t));
            });
            for (const item of [...titleItems, ...(bySearch.results || []), ...(byTitle.results || [])]) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                merged.push(item);
              }
            }
            setVideos(merged);
          }
        } else if (scope === 'series') {
          const res = await fetchSeries(
            {
              page: 1,
              page_size: 48,
              ordering: '-last_update',
              ...(wildcardPattern ? { nombre__wildcard: wildcardPattern } : {}),
              ...extraFilters,
            },
            ctrl.signal,
          );
          let items = res.results || [];
          if (cleanTokens.length > 1) {
            const filtered = items.filter((s) => {
              const nameLower = (s.nombre || '').toLowerCase();
              return cleanTokens.every((t) => nameLower.includes(t));
            });
            if (filtered.length > 0) items = filtered;
          }
          setSeries(items);
        } else {
          const res = await fetchCanales(
            {
              page: 1,
              page_size: 48,
              ordering: '-cantidad_suscripciones',
              ...(wildcardPattern ? { nombre__wildcard: wildcardPattern } : {}),
            },
            ctrl.signal,
          );
          let items = res.results || [];
          if (cleanTokens.length > 1) {
            const filtered = items.filter((c) => {
              const nameLower = (c.nombre || '').toLowerCase();
              return cleanTokens.every((t) => nameLower.includes(t));
            });
            if (filtered.length > 0) items = filtered;
          }
          setCanales(items);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // keep current view cleanly
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, scope, selectedGenre, selectedCountry]);

  const openSerieDetail = async (serie: PictaSerie) => {
    setSelectedSerie(serie);
    setLoadingSerie(true);
    setTemporadas([]);
    setEpisodios([]);
    try {
      const temps = await fetchTemporadas(serie.pelser_id);
      setTemporadas(temps);
      if (temps.length > 0) {
        setActiveTemporada(temps[0].id);
        const eps = await fetchEpisodiosByTemporada(temps[0].id);
        setEpisodios(eps);
      }
    } finally {
      setLoadingSerie(false);
    }
  };

  const handleSelectTemporada = async (tempId: number) => {
    setActiveTemporada(tempId);
    setLoadingSerie(true);
    try {
      const eps = await fetchEpisodiosByTemporada(tempId);
      setEpisodios(eps);
    } finally {
      setLoadingSerie(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-4 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar películas, series, canales o temas en Picta..."
            className="w-full min-h-[48px] rounded-2xl bg-[#111318] border border-white/10 focus:border-[#FF4D4D] focus:outline-none pl-11 pr-12 text-sm sm:text-base text-[#F5F6F8] placeholder:text-[#6B7280]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#9CA3AF] hover:text-white cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScope('videos')}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                scope === 'videos'
                  ? 'bg-[#FF4D4D] text-white'
                  : 'bg-[#111318] text-[#9CA3AF] hover:text-[#F5F6F8] border border-white/[0.06]'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Videos</span>
            </button>
            <button
              type="button"
              onClick={() => setScope('series')}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                scope === 'series'
                  ? 'bg-[#FF4D4D] text-white'
                  : 'bg-[#111318] text-[#9CA3AF] hover:text-[#F5F6F8] border border-white/[0.06]'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Series</span>
            </button>
            <button
              type="button"
              onClick={() => setScope('canales')}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                scope === 'canales'
                  ? 'bg-[#FF4D4D] text-white'
                  : 'bg-[#111318] text-[#9CA3AF] hover:text-[#F5F6F8] border border-white/[0.06]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Canales</span>
            </button>
          </div>

          {scope !== 'canales' && (
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 border cursor-pointer transition-colors ${
                showFilters || selectedGenre || selectedCountry
                  ? 'bg-[#181B22] border-[#FF4D4D]/50 text-[#F5F6F8]'
                  : 'bg-[#111318] border-white/[0.06] text-[#9CA3AF] hover:text-[#F5F6F8]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 text-[#FF4D4D]" />
              <span>
                Filtros
                {(selectedGenre || selectedCountry)
                  ? ` (${[selectedGenre, selectedCountry].filter(Boolean).length})`
                  : ''}
              </span>
            </button>
          )}
        </div>

        {scope !== 'canales' && showFilters && (
          <div className="rounded-2xl bg-[#111318] border border-white/[0.08] p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="explore-genre" className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Género
              </label>
              <select
                id="explore-genre"
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#070709] border border-white/10 focus:border-[#FF4D4D] focus:outline-none px-3 text-sm text-[#F5F6F8]"
              >
                <option value="">Todos los géneros</option>
                {generos.map((g) => (
                  <option key={g.id} value={g.nombre}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="explore-country" className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                País
              </label>
              <select
                id="explore-country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-[#070709] border border-white/10 focus:border-[#FF4D4D] focus:outline-none px-3 text-sm text-[#F5F6F8]"
              >
                <option value="">Todos los países</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {(selectedGenre || selectedCountry) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedGenre('');
                  setSelectedCountry('');
                }}
                className="min-h-[44px] px-4 rounded-xl bg-[#181B22] hover:bg-white/10 text-xs font-semibold text-[#F5F6F8] cursor-pointer whitespace-nowrap"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-14 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
        </div>
      ) : scope === 'videos' ? (
        videos.length === 0 ? (
          <p className="py-14 text-center text-sm text-[#9CA3AF]">
            No se encontraron videos para "{query}".
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onSelect={onSelectVideo}
                onChannelClick={onSelectChannel}
              />
            ))}
          </div>
        )
      ) : scope === 'series' ? (
        series.length === 0 ? (
          <p className="py-14 text-center text-sm text-[#9CA3AF]">No se encontraron series.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {series.map((s) => (
              <button
                key={s.pelser_id}
                type="button"
                onClick={() => openSerieDetail(s)}
                className="group text-left rounded-2xl bg-[#111318] border border-white/[0.06] overflow-hidden hover:border-white/20 transition-colors cursor-pointer flex flex-col"
              >
                <div className="aspect-[3/4] w-full bg-[#181B22] overflow-hidden">
                  <MediaImage
                    src={s.url_imagen || s.imagen_secundaria}
                    size="320x450"
                    alt={s.nombre}
                    variant="poster"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-display text-sm font-semibold text-[#F5F6F8] line-clamp-1">
                    {s.nombre}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[#9CA3AF] font-mono-tabular">
                    <span>{s.cantidad_temporadas || 1} temp</span>
                    <span aria-hidden="true">·</span>
                    <span>{s.cantidad_capitulos || 0} cap</span>
                    {s.ano && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{s.ano}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : canales.length === 0 ? (
        <p className="py-14 text-center text-sm text-[#9CA3AF]">No se encontraron canales.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {canales.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectChannel(c)}
              className="flex items-center gap-3.5 rounded-2xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.06] p-3.5 text-left transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[#181B22] border border-white/10 shrink-0">
                <MediaImage
                  src={c.url_avatar || c.url_imagen}
                  size="80x80"
                  alt={c.nombre}
                  variant="avatar"
                  fallbackText={c.nombre}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-sm font-semibold text-[#F5F6F8] truncate">
                  {c.nombre}
                </h3>
                <p className="mt-0.5 font-mono-tabular text-xs text-[#9CA3AF]">
                  {formatCount(c.cantidad_suscripciones || 0)} suscriptores
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
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

            {selectedSerie.sinopsis && (
              <p className="mt-3 text-sm text-[#D1D5DB] leading-relaxed">{selectedSerie.sinopsis}</p>
            )}

            {temporadas.length > 0 && (
              <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {temporadas.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemporada(t.id)}
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
