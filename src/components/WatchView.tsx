import React, { Suspense, useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Share2,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import {
  checkCanalSubscription,
  fetchCanalById,
  fetchEpisodiosByTemporada,
  fetchRecomendados,
  fetchTemporadas,
  fetchUserVote,
  formatCount,
  formatRelativeDate,
  removeVote,
  submitVote,
  subscribeCanal,
  unsubscribeCanal,
  updateVote,
} from '../lib/pictaClient';
import type { PictaCanal, PictaPublicacion, PictaTemporada, PictaVoto } from '../types/picta';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { CommentsSection } from './CommentsSection';
import { HlsPlayer } from './HlsPlayer';
import { MediaImage } from './MediaImage';
import { VideoCard } from './VideoCard';

const DownloadSheet = lazyWithRetry(() => import('./DownloadSheet').then((m) => ({ default: m.DownloadSheet })));

interface WatchViewProps {
  video: PictaPublicacion;
  onSelectVideo: (video: PictaPublicacion) => void;
  onSelectChannel: (canal: PictaCanal) => void;
}

export const WatchView: React.FC<WatchViewProps> = ({
  video,
  onSelectVideo,
  onSelectChannel,
}) => {
  const { user } = useAuth();
  const {
    minimizePlayer,
    updateProgress,
    getResumeSeconds,
    toggleSavedVideo,
    isVideoSaved,
    playVideo,
  } = usePlayer();

  const [descExpanded, setDescExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'recommended' | 'comments'>('recommended');
  const [recommended, setRecommended] = useState<PictaPublicacion[]>([]);
  const [seasons, setSeasons] = useState<PictaTemporada[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<PictaPublicacion[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(true);

  const [userVote, setUserVote] = useState<PictaVoto | null>(null);
  const [likeCount, setLikeCount] = useState(video.cantidad_me_gusta || 0);
  const [dislikeCount, setDislikeCount] = useState(video.cantidad_no_me_gusta || 0);
  const [voteBusy, setVoteBusy] = useState(false);

  const [subId, setSubId] = useState<number | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [canalSubsCount, setCanalSubsCount] = useState<number | undefined>(video.canal?.cantidad_suscripciones);
  const saved = isVideoSaved(video.id);
  const [showDownloadSheet, setShowDownloadSheet] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);

  const resumeSec = React.useMemo(() => getResumeSeconds(video.id), [video.id]);

  useEffect(() => {
    setLikeCount(video.cantidad_me_gusta || 0);
    setDislikeCount(video.cantidad_no_me_gusta || 0);
    setDescExpanded(false);
    setActiveTab('recommended');

    let cancelled = false;
    setLoadingRecs(true);

    fetchRecomendados(video.id)
      .then((list) => {
        if (!cancelled) setRecommended(list);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecs(false);
      });

    const tempId = video.categoria?.capitulo?.temporada?.id || video.categoria?.temporada?.id;
    const serieId = video.categoria?.capitulo?.temporada?.serie?.pelser_id;
    setSelectedSeasonId(tempId ?? null);

    if (serieId) {
      fetchTemporadas(serieId)
        .then((temps) => {
          if (!cancelled) setSeasons(temps);
        })
        .catch(() => {
          if (!cancelled) setSeasons([]);
        });
    } else {
      setSeasons([]);
    }

    if (tempId) {
      setLoadingEpisodes(true);
      fetchEpisodiosByTemporada(tempId)
        .then((eps) => {
          if (!cancelled) setEpisodes(eps);
        })
        .finally(() => {
          if (!cancelled) setLoadingEpisodes(false);
        });
    } else {
      setEpisodes([]);
    }

    if (user?.id) {
      fetchUserVote(video.id, user.id).then((v) => {
        if (!cancelled) setUserVote(v);
      });
    } else {
      setUserVote(null);
    }

    if (video.canal?.id && user?.username) {
      checkCanalSubscription(video.canal.id, user.username).then((s) => {
        if (!cancelled) setSubId(s ? s.id : null);
      });
    } else {
      setSubId(null);
    }

    setCanalSubsCount(video.canal?.cantidad_suscripciones);
    if (video.canal?.id && typeof video.canal.cantidad_suscripciones !== 'number') {
      fetchCanalById(video.canal.id, video.canal.nombre).then((ch) => {
        if (!cancelled && ch && typeof ch.cantidad_suscripciones === 'number') {
          setCanalSubsCount(ch.cantidad_suscripciones);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [video.id, video.canal?.id, video.canal?.nombre, video.canal?.cantidad_suscripciones, user?.id, user?.username]);

  const handleVote = async (valor: boolean) => {
    if (voteBusy) return;
    setVoteBusy(true);
    try {
      if (userVote && userVote.valor === valor) {
        await removeVote(userVote.id);
        setUserVote(null);
        if (valor) setLikeCount((c) => Math.max(0, c - 1));
        else setDislikeCount((c) => Math.max(0, c - 1));
      } else if (userVote) {
        const updated = await updateVote(userVote.id, valor);
        setUserVote(updated);
        if (valor) {
          setLikeCount((c) => c + 1);
          setDislikeCount((c) => Math.max(0, c - 1));
        } else {
          setDislikeCount((c) => c + 1);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      } else {
        const created = await submitVote(video.id, valor);
        setUserVote(created);
        if (valor) setLikeCount((c) => c + 1);
        else setDislikeCount((c) => c + 1);
      }
    } catch {
      // ignore failed vote silently
    } finally {
      setVoteBusy(false);
    }
  };

  const handleToggleSub = async () => {
    if (!video.canal?.id || subBusy) return;
    setSubBusy(true);
    try {
      if (subId) {
        await unsubscribeCanal(subId);
        setSubId(null);
      } else {
        const created = await subscribeCanal(video.canal.id);
        setSubId(created.id);
      }
    } catch {
      // ignore error
    } finally {
      setSubBusy(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `https://www.picta.cu/medias/${video.slug_url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.nombre, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback(true);
        window.setTimeout(() => setShareFeedback(false), 2000);
      }
    } catch {
      // Share cancelled
    }
  };

  const handleSeasonSwitch = async (tempId: number) => {
    setSelectedSeasonId(tempId);
    setLoadingEpisodes(true);
    try {
      const eps = await fetchEpisodiosByTemporada(tempId);
      setEpisodes(eps);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const currentEpIdx = episodes.findIndex((item) => item.id === video.id);
  const nextEpisode = currentEpIdx >= 0 && currentEpIdx + 1 < episodes.length ? episodes[currentEpIdx + 1] : null;
  const fallbackNext = !nextEpisode && recommended.length > 0 && recommended[0].id !== video.id ? recommended[0] : null;
  const upNextVideo = nextEpisode || fallbackNext;

  const handleAutoNext = () => {
    if (nextEpisode) {
      playVideo(nextEpisode, episodes);
    } else if (fallbackNext) {
      playVideo(fallbackNext, recommended);
    }
  };

  const categoryLabel = video.categoria?.tipologia?.nombre || 'Audiovisual';
  const channelName = video.canal?.nombre || 'Canal de Picta';

  return (
    <div className="min-h-dvh bg-[#070709] text-[#F5F6F8] pb-24 lg:pb-12">
      <div className="max-w-7xl mx-auto lg:px-6 lg:pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6 items-start">
          <div>
            <div className="sticky top-0 z-30 lg:static lg:rounded-3xl overflow-hidden bg-black border-b lg:border border-white/[0.08]">
              <HlsPlayer
                video={video}
                resumeSeconds={resumeSec}
                hasNextEpisode={Boolean(upNextVideo)}
                onNextEpisode={upNextVideo ? handleAutoNext : undefined}
                onProgress={(cur, dur) => updateProgress(video, cur, dur)}
                onEnded={handleAutoNext}
                onMinimize={minimizePlayer}
              />
            </div>

            <div className="px-4 lg:px-0 pt-4">
              <h1 className="font-display text-lg sm:text-xl font-bold text-[#F5F6F8] leading-snug">
                {video.nombre}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#9CA3AF]">
                <span className="font-mono-tabular">
                  {formatCount(video.cantidad_visitas || video.cantidad_reproducciones)} vistas
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatRelativeDate(video.fecha_publicado || video.fecha_creacion)}</span>
                <span aria-hidden="true">·</span>
                <span>{categoryLabel}</span>
                {video.hd && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular text-[#F5F6F8]">HD</span>
                  </>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <div className="inline-flex items-center rounded-xl bg-[#111318] border border-white/[0.08] shrink-0">
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => handleVote(true)}
                    className={`min-h-[44px] px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-l-xl transition-colors cursor-pointer ${
                      userVote?.valor === true ? 'text-[#FF4D4D]' : 'text-[#F5F6F8] hover:bg-white/5'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span className="font-mono-tabular">{formatCount(likeCount)}</span>
                  </button>
                  <span className="w-px h-5 bg-white/10" aria-hidden="true" />
                  <button
                    type="button"
                    disabled={voteBusy}
                    onClick={() => handleVote(false)}
                    className={`min-h-[44px] px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-r-xl transition-colors cursor-pointer ${
                      userVote?.valor === false ? 'text-[#FF4D4D]' : 'text-[#9CA3AF] hover:text-[#F5F6F8] hover:bg-white/5'
                    }`}
                    aria-label="No me gusta"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    {dislikeCount > 0 && <span className="font-mono-tabular">{formatCount(dislikeCount)}</span>}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleSavedVideo(video)}
                  className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 shrink-0 whitespace-nowrap transition-colors cursor-pointer ${
                    saved
                      ? 'bg-[#FF4D4D]/15 border-[#FF4D4D]/40 text-[#FF4D4D]'
                      : 'bg-[#111318] border-white/[0.08] text-[#F5F6F8] hover:bg-[#181B22]'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${saved ? 'fill-[#FF4D4D]' : ''}`} />
                  <span>{saved ? 'Guardado' : 'Guardar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDownloadSheet(true)}
                  className="min-h-[44px] px-4 rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.08] text-xs font-semibold text-[#F5F6F8] inline-flex items-center gap-2 shrink-0 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  className="min-h-[44px] px-4 rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.08] text-xs font-semibold text-[#F5F6F8] inline-flex items-center gap-2 shrink-0 whitespace-nowrap transition-colors cursor-pointer"
                >
                  {shareFeedback ? <Check className="w-4 h-4 text-[#FF4D4D]" /> : <Share2 className="w-4 h-4" />}
                  <span>{shareFeedback ? 'Enlace copiado' : 'Compartir'}</span>
                </button>
              </div>

              {video.canal && (
                <div className="mt-5 flex items-center justify-between gap-3 py-3.5 border-y border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => onSelectChannel(video.canal!)}
                    className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-[#181B22] border border-white/10 shrink-0">
                      <MediaImage
                        src={video.canal.url_avatar || video.canal.url_imagen}
                        size="80x80"
                        alt={channelName}
                        variant="avatar"
                        fallbackText={channelName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-[#F5F6F8] truncate">
                        {channelName}
                      </p>
                      <p className="font-mono-tabular text-xs text-[#9CA3AF]">
                        {formatCount(canalSubsCount || 0)} suscriptores
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={subBusy}
                    onClick={handleToggleSub}
                    className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
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
                </div>
              )}

              {video.descripcion && (
                <div className="mt-4 rounded-2xl bg-[#111318] border border-white/[0.06] p-4">
                  <p className={`text-sm text-[#D1D5DB] leading-relaxed whitespace-pre-line ${descExpanded ? '' : 'line-clamp-3'}`}>
                    {video.descripcion}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDescExpanded((e) => !e)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#F5F6F8] hover:text-[#FF4D4D] min-h-[36px] cursor-pointer"
                  >
                    <span>{descExpanded ? 'Mostrar menos' : 'Leer descripción completa'}</span>
                    {descExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              )}

              {(episodes.length > 0 || seasons.length > 1) && (
                <div className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-[#F5F6F8]">
                      Episodios de la temporada ({episodes.length})
                    </h3>
                    {nextEpisode && (
                      <button
                        type="button"
                        onClick={() => onSelectVideo(nextEpisode)}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <span>Siguiente episodio</span>
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {seasons.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                      {seasons.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSeasonSwitch(s.id)}
                          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            selectedSeasonId === s.id
                              ? 'bg-white text-[#070709]'
                              : 'bg-[#111318] border border-white/[0.08] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {s.nombre || `Temporada ${s.numero}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {loadingEpisodes ? (
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="min-w-[180px] h-20 rounded-2xl bg-[#111318] animate-pulse shrink-0" />
                      ))}
                    </div>
                  ) : episodes.length === 0 ? (
                    <p className="text-xs text-[#9CA3AF]">No hay episodios publicados en esta temporada.</p>
                  ) : (
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
                      {episodes.map((ep) => {
                        const active = ep.id === video.id;
                        return (
                          <button
                            key={ep.id}
                            type="button"
                            onClick={() => onSelectVideo(ep)}
                            className={`min-w-[180px] max-w-[200px] rounded-2xl p-3 text-left border transition-colors cursor-pointer shrink-0 ${
                              active
                                ? 'bg-[#FF4D4D]/15 border-[#FF4D4D]/50 text-white'
                                : 'bg-[#111318] border-white/[0.06] text-[#F5F6F8] hover:bg-[#181B22]'
                            }`}
                          >
                            <p className="font-mono-tabular text-[11px] text-[#FF4D4D] font-semibold">
                              Ep. {ep.categoria?.capitulo?.numero ?? ep.categoria?.numero_capitulo ?? '—'}
                            </p>
                            <p className="mt-1 text-xs font-medium line-clamp-2">{ep.nombre}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-center gap-2 border-b border-white/[0.08] lg:hidden">
                <button
                  type="button"
                  onClick={() => setActiveTab('recommended')}
                  className={`min-h-[44px] px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'recommended'
                      ? 'border-[#FF4D4D] text-[#F5F6F8]'
                      : 'border-transparent text-[#9CA3AF]'
                  }`}
                >
                  Recomendados
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('comments')}
                  className={`min-h-[44px] px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'comments'
                      ? 'border-[#FF4D4D] text-[#F5F6F8]'
                      : 'border-transparent text-[#9CA3AF]'
                  }`}
                >
                  Comentarios ({video.cantidad_comentarios ?? 0})
                </button>
              </div>

              <div className={`mt-5 ${activeTab === 'comments' ? 'block' : 'hidden lg:block'}`}>
                <CommentsSection
                  publicacionId={video.id}
                  commentsEnabled={video.mostrar_comentarios !== false}
                />
              </div>
            </div>
          </div>

          <aside className={`px-4 lg:px-0 ${activeTab === 'recommended' ? 'block' : 'hidden lg:block'}`}>
            <h3 className="font-display text-base font-semibold text-[#F5F6F8] mb-3">
              A continuación
            </h3>
            {loadingRecs ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-40 aspect-video rounded-xl bg-[#111318]" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 w-full rounded bg-[#111318]" />
                      <div className="h-3 w-2/3 rounded bg-[#111318]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recommended.length === 0 ? (
              <p className="text-sm text-[#9CA3AF]">No hay videos relacionados disponibles.</p>
            ) : (
              <div className="space-y-2">
                {recommended.map((item) => (
                  <VideoCard
                    key={item.id}
                    video={item}
                    compact
                    onSelect={onSelectVideo}
                    onChannelClick={onSelectChannel}
                  />
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      {showDownloadSheet && (
        <Suspense fallback={null}>
          <DownloadSheet video={video} onClose={() => setShowDownloadSheet(false)} />
        </Suspense>
      )}
    </div>
  );
};
