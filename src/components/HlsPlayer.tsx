import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  ChevronDown,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings,
  SkipForward,
  SlidersHorizontal,
  Subtitles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { getOfflineMp4 } from '../lib/offlineMp4Store';
import {
  fetchDirectSubtitleBlobUrl,
  formatDuration,
  getDirectPictaHlsUrl,
  getPictaHlsUrl,
  getPictaImageUrl,
  registerPlayback,
} from '../lib/pictaClient';
import { usePlayer } from '../context/PlayerContext';
import type { PictaPublicacion } from '../types/picta';

interface HlsPlayerProps {
  video: PictaPublicacion;
  resumeSeconds?: number;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  onProgress?: (current: number, duration: number) => void;
  onEnded?: () => void;
  onMinimize?: () => void;
}

interface QualityLevel {
  index: number;
  label: string;
}

interface AudioTrackItem {
  id: number;
  label: string;
}

const PLAYER_AUDIO_LANGS: Record<string, string> = {
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

function formatTrackLabel(name?: string, lang?: string, idx = 0): string {
  const key = (lang || name || '').toLowerCase().trim();
  if (PLAYER_AUDIO_LANGS[key]) return PLAYER_AUDIO_LANGS[key];
  if (name && name.trim()) return name.trim();
  if (lang && lang.trim()) return lang.trim().toUpperCase();
  return `Pista ${idx + 1}`;
}

function detectTargetResolutionHeight(el: HTMLElement | null): number {
  if (typeof window === 'undefined') return 720;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const screenShortPx = Math.min(window.screen.width || 1280, window.screen.height || 720) * dpr;
  const isFs = Boolean(document.fullscreenElement);

  if (isFs) {
    const fsH = Math.max(window.innerHeight * dpr, el?.clientHeight ? el.clientHeight * dpr : 0);
    return Math.max(360, Math.min(1080, Math.round(Math.min(fsH || screenShortPx, screenShortPx || 1080))));
  }

  const widthCss = el?.clientWidth || window.innerWidth;
  const heightFrom16x9 = (widthCss * dpr * 9) / 16;
  const maxAllowed = Math.max(480, Math.min(1080, screenShortPx || 1080));
  return Math.max(360, Math.min(maxAllowed, Math.round(heightFrom16x9)));
}

function findBestLevelForHeight(
  levels: Array<{ height?: number; bitrate?: number }>,
  targetHeight: number,
): number {
  if (!levels.length) return -1;
  let bestIdx = 0;
  let bestHeight = -1;
  const ceiling = targetHeight * 1.18;

  for (let i = 0; i < levels.length; i++) {
    const h = levels[i].height || 0;
    if (h > 0 && h <= ceiling && h >= bestHeight) {
      bestHeight = h;
      bestIdx = i;
    }
  }
  return bestHeight > 0 ? bestIdx : 0;
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({
  video,
  resumeSeconds = 0,
  hasNextEpisode = false,
  onNextEpisode,
  onProgress,
  onEnded,
  onMinimize,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<number>(0);
  const { registerVideoElement, setIsPlaying: setGlobalPlaying } = usePlayer();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const showSettingsRef = useRef(false);
  useEffect(() => {
    showSettingsRef.current = showSettings;
  }, [showSettings]);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [autoActiveLabel, setAutoActiveLabel] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const [subtitleUrl, setSubtitleUrl] = useState('');
  const directStreamUrl = getDirectPictaHlsUrl(video.url_manifiesto);
  const proxyStreamUrl = getPictaHlsUrl(video.url_manifiesto);
  const streamUrl = useProxyFallback ? proxyStreamUrl : directStreamUrl;

  useEffect(() => {
    setUseProxyFallback(false);
  }, [video.id, video.url_manifiesto]);

  useEffect(() => {
    let active = true;
    let blobToRevoke = '';
    if (!video.url_subtitulo) {
      setSubtitleUrl('');
      return;
    }
    fetchDirectSubtitleBlobUrl(video.url_subtitulo).then(({ url, isBlob }) => {
      if (!active) {
        if (isBlob && url) URL.revokeObjectURL(url);
        return;
      }
      if (isBlob) blobToRevoke = url;
      setSubtitleUrl(url);
    });
    return () => {
      active = false;
      if (blobToRevoke) URL.revokeObjectURL(blobToRevoke);
    };
  }, [video.id, video.url_subtitulo]);
  const resumeRef = useRef(resumeSeconds);
  useEffect(() => {
    resumeRef.current = resumeSeconds;
  }, [video.id, resumeSeconds]);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (showSettingsRef.current) return;
      setShowControls(false);
    }, 3200);
  }, []);

  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => {
      const next = !prev;
      if (next) {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        setShowControls(true);
      } else {
        scheduleHide();
      }
      return next;
    });
  }, [scheduleHide]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    setErrorMsg(null);
    setIsBuffering(true);
    setLevels([]);
    setCurrentLevel(-1);
    setAutoActiveLabel(null);
    setAudioTracks([]);
    setCurrentAudioTrack(-1);
    setCurrentTime(0);
    setDuration(0);

    if (!streamUrl) {
      let offlineCancelled = false;
      let offlineBlobUrl = '';
      getOfflineMp4(video.id).then((rec) => {
        if (offlineCancelled || !rec?.blob) {
          setIsBuffering(false);
          setIsPlaying(false);
          setGlobalPlaying(false);
          const priceVal = video.precios?.[0]?.valor;
          if (priceVal) {
            setErrorMsg(`Esta publicación requiere pago en Picta (${priceVal} CUP) para desbloquear el video.`);
          } else if (video.only_subs) {
            setErrorMsg('Este contenido es exclusivo para suscriptores de pago del canal.');
          } else {
            setErrorMsg('Esta publicación no tiene flujo de video disponible.');
          }
          return;
        }
        registerVideoElement(el);
        offlineBlobUrl = URL.createObjectURL(rec.blob);
        el.src = offlineBlobUrl;
        el.addEventListener('loadedmetadata', () => {
          setIsBuffering(false);
          const target = resumeRef.current;
          if (target > 5 && el.duration && target < el.duration - 8) el.currentTime = target;
          el.play().catch(() => setIsPlaying(false));
        }, { once: true });
      });
      return () => {
        offlineCancelled = true;
        registerVideoElement(null);
        if (offlineBlobUrl) URL.revokeObjectURL(offlineBlobUrl);
      };
    }

    registerVideoElement(el);
    registerPlayback(video.id);

    let hls: Hls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let destroyed = false;
    let offlineBlobUrl = '';

    const applyScreenResolutionCap = () => {
      if (!hls || !hls.levels?.length) return;
      const targetH = detectTargetResolutionHeight(containerRef.current || el);
      const bestCapIdx = findBestLevelForHeight(hls.levels, targetH);
      hls.autoLevelCapping = bestCapIdx;
      return bestCapIdx;
    };

    const seekOnReady = () => {
      const target = resumeRef.current;
      if (target > 5 && el.duration && target < el.duration - 8) {
        el.currentTime = target;
      }
    };

    const onNativeMeta = () => {
      setIsBuffering(false);
      seekOnReady();
      el.play().catch(() => setIsPlaying(false));
    };
    const onNativeError = () => {
      if (!useProxyFallback && proxyStreamUrl && proxyStreamUrl !== streamUrl) {
        setUseProxyFallback(true);
        return;
      }
      setIsBuffering(false);
      setErrorMsg('No se pudo reproducir el flujo HLS de Picta.');
    };

    const startOnlineOrOfflinePlayback = async () => {
      const offlineRec = await getOfflineMp4(video.id);
      if (destroyed) return;
      if (offlineRec?.blob) {
        offlineBlobUrl = URL.createObjectURL(offlineRec.blob);
        el.src = offlineBlobUrl;
        el.addEventListener('loadedmetadata', onNativeMeta);
        el.addEventListener('error', () => {
          if (offlineBlobUrl) {
            URL.revokeObjectURL(offlineBlobUrl);
            offlineBlobUrl = '';
          }
          setErrorMsg('No se pudo reproducir el video guardado sin conexión.');
        }, { once: true });
        return;
      }

      if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
        abrEwmaDefaultEstimate: 500_000,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferHole: 0.5,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 15000,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(el);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        const parsedLevels: QualityLevel[] = data.levels
          .map((lvl, index) => ({
            index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)} kbps`,
          }))
          .sort((a, b) => parseInt(b.label, 10) - parseInt(a.label, 10));
        setLevels(parsedLevels);

        const bestIdx = applyScreenResolutionCap();
        if (typeof bestIdx === 'number' && bestIdx >= 0) {
          hls!.startLevel = bestIdx;
          const h = data.levels[bestIdx]?.height;
          if (h) setAutoActiveLabel(`${h}p`);
        }

        setIsBuffering(false);
        seekOnReady();
        el.play().catch(() => {
          setIsPlaying(false);
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        const lvl = hls?.levels?.[data.level];
        if (lvl?.height) {
          setAutoActiveLabel(`${lvl.height}p`);
        } else if (lvl?.bitrate) {
          setAutoActiveLabel(`${Math.round(lvl.bitrate / 1000)} kbps`);
        }
        if (hls?.autoLevelEnabled) {
          setCurrentLevel(-1);
        } else {
          setCurrentLevel(data.level);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
        const parsedTracks = (data.audioTracks || []).map((t, idx) => ({
          id: t.id ?? idx,
          label: formatTrackLabel(t.name, t.lang, idx),
        }));
        setAudioTracks(parsedTracks);
        if (hls && hls.audioTrack >= 0) {
          setCurrentAudioTrack(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
        setCurrentAudioTrack(data.id);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (!useProxyFallback && proxyStreamUrl && proxyStreamUrl !== streamUrl) {
              setUseProxyFallback(true);
              return;
            }
            hls?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            setIsBuffering(false);
            setErrorMsg('No se pudo reproducir el flujo HLS de Picta.');
          }
        }
      });

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (hls?.autoLevelEnabled) {
            applyScreenResolutionCap();
          }
        });
        resizeObserver.observe(containerRef.current);
      }
    } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = streamUrl;
      el.addEventListener('loadedmetadata', onNativeMeta);
      el.addEventListener('error', onNativeError);
    } else {
      setIsBuffering(false);
      setErrorMsg('Tu navegador no soporta reproducción HLS.');
    }
    };

    startOnlineOrOfflinePlayback();

    return () => {
      destroyed = true;
      registerVideoElement(null);
      resizeObserver?.disconnect();
      el.removeEventListener('loadedmetadata', onNativeMeta);
      el.removeEventListener('error', onNativeError);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      if (offlineBlobUrl) {
        URL.revokeObjectURL(offlineBlobUrl);
        offlineBlobUrl = '';
      }
      el.pause();
      el.removeAttribute('src');
      el.load();
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      if (seekTimerRef.current) {
        window.clearTimeout(seekTimerRef.current);
      }
    };
  }, [video.id, video.only_subs, video.precios, streamUrl, proxyStreamUrl, useProxyFallback, retryCount, registerVideoElement, setGlobalPlaying]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    for (let i = 0; i < el.textTracks.length; i++) {
      el.textTracks[i].mode = subtitlesOn ? 'showing' : 'hidden';
    }
  }, [subtitlesOn, video.id]);

  useEffect(() => {
    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      const hls = hlsRef.current;
      if (hls && hls.autoLevelEnabled && hls.levels?.length) {
        const targetH = detectTargetResolutionHeight(containerRef.current || videoRef.current);
        hls.autoLevelCapping = findBestLevelForHeight(hls.levels, targetH);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      if (!el || !Number.isFinite(el.duration)) return;
      el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
      setSeekFeedback(delta > 0 ? `+${delta}s` : `${delta}s`);
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
      seekTimerRef.current = window.setTimeout(() => setSeekFeedback(null), 650);
      setShowControls(true);
      scheduleHide();
    },
    [scheduleHide],
  );

  const handleSelectQuality = (lvlIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (lvlIndex === -1 && hls.levels?.length) {
      const targetH = detectTargetResolutionHeight(containerRef.current || videoRef.current);
      hls.autoLevelCapping = findBestLevelForHeight(hls.levels, targetH);
    } else {
      hls.autoLevelCapping = -1;
    }
    hls.currentLevel = lvlIndex;
    setCurrentLevel(lvlIndex);
    setShowSettings(false);
  };

  const handleSelectAudio = (trackId: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = trackId;
    setCurrentAudioTrack(trackId);
    setShowSettings(false);
  };

  const handleSpeed = (rate: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSettings(false);
  };

  const onNextRef = useRef(onNextEpisode);
  useEffect(() => {
    onNextRef.current = onNextEpisode;
  }, [onNextEpisode]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const rawArt = getPictaImageUrl(video.url_imagen, '480x270');
    const artworkSrc = rawArt
      ? new URL(rawArt, window.location.origin).toString()
      : '';
    try {
      ms.metadata = new MediaMetadata({
        title: video.nombre,
        artist: video.canal?.nombre || 'Picta',
        album: video.categoria?.tipologia?.nombre || 'Picta Pulse',
        artwork: artworkSrc ? [{ src: artworkSrc, sizes: '480x270', type: 'image/jpeg' }] : [],
      });
    } catch {
      // ignore unsupported MediaMetadata
    }

    const safeHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // unsupported action in current WebView
      }
    };

    safeHandler('play', () => {
      videoRef.current?.play().catch(() => {});
    });
    safeHandler('pause', () => {
      videoRef.current?.pause();
    });
    safeHandler('seekbackward', (details) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, el.currentTime - (details?.seekOffset || 10));
    });
    safeHandler('seekforward', (details) => {
      const el = videoRef.current;
      if (!el || !Number.isFinite(el.duration)) return;
      el.currentTime = Math.min(el.duration, el.currentTime + (details?.seekOffset || 10));
    });
    safeHandler('seekto', (details) => {
      const el = videoRef.current;
      if (!el || typeof details?.seekTime !== 'number') return;
      el.currentTime = details.seekTime;
    });
    safeHandler('nexttrack', hasNextEpisode ? () => onNextRef.current?.() : null);

    return () => {
      safeHandler('nexttrack', null);
    };
  }, [video.id, video.nombre, video.url_imagen, video.canal?.nombre, video.categoria?.tipologia?.nombre, hasNextEpisode]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  }, [isPlaying]);

  const toggleFullscreen = useCallback(async () => {
    const box = containerRef.current;
    const el = videoRef.current;
    if (!box) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (box.requestFullscreen) {
        await box.requestFullscreen();
      } else if (el && (el as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
        (el as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      }
    } catch {
      // Fullscreen denied by WebView
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const el = videoRef.current;
      if (!el || !el.isConnected) return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekBy(10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen]);

  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>({ time: 0, side: 'left' });

  const handleSurfaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side: 'left' | 'right' = x < rect.width / 2 ? 'left' : 'right';
    const now = Date.now();
    if (now - lastTapRef.current.time < 280 && lastTapRef.current.side === side) {
      seekBy(side === 'left' ? -10 : 10);
      lastTapRef.current = { time: 0, side };
      return;
    }
    lastTapRef.current = { time: now, side };
    setShowControls((prev) => {
      const next = !prev;
      if (next) scheduleHide();
      return next;
    });
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black overflow-hidden select-none group"
      onMouseMove={() => {
        setShowControls(true);
        scheduleHide();
      }}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        controlsList="nodownload"
        crossOrigin="anonymous"
        className="w-full h-full object-contain bg-black"
        onPlay={() => {
          setIsPlaying(true);
          setGlobalPlaying(true);
          setIsBuffering(false);
          scheduleHide();
        }}
        onPause={() => {
          setIsPlaying(false);
          setGlobalPlaying(false);
          setShowControls(true);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={() => {
          const el = videoRef.current;
          if (!el) return;
          setCurrentTime(el.currentTime);
          setDuration(el.duration || 0);
          if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function' && Number.isFinite(el.duration) && el.duration > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: el.duration,
                playbackRate: el.playbackRate || 1,
                position: Math.min(el.duration, Math.max(0, el.currentTime)),
              });
            } catch {
              // ignore position sync errors
            }
          }
          if (onProgress && Date.now() - lastSavedRef.current > 4000) {
            lastSavedRef.current = Date.now();
            onProgress(el.currentTime, el.duration || 0);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setGlobalPlaying(false);
          onEnded?.();
        }}
      >
        {subtitleUrl && (
          <track
            key={subtitleUrl}
            kind="subtitles"
            label="Español"
            srcLang="es"
            src={subtitleUrl}
            default={subtitlesOn}
          />
        )}
      </video>

      <div
        className="absolute inset-0 z-10"
        onClick={handleSurfaceTap}
        aria-hidden="true"
      />

      {isBuffering && !errorMsg && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/30">
          <div className="w-11 h-11 rounded-full border-2 border-white/20 border-t-[#FF4D4D] animate-spin" />
        </div>
      )}

      {seekFeedback && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <span className="rounded-xl bg-black/75 px-4 py-2 font-mono-tabular text-sm font-semibold text-white">
            {seekFeedback}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#070709]/95 p-6 text-center">
          <AlertTriangle className="w-9 h-9 text-[#FF4D4D] mb-3" />
          <p className="text-sm text-[#F5F6F8] max-w-sm">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] px-4 py-2.5 text-sm font-semibold text-white min-h-[44px] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reintentar conexión</span>
          </button>
        </div>
      )}

      {!errorMsg && (
        <div
          className={`absolute inset-0 z-20 flex flex-col justify-between bg-gradient-to-t from-black/85 via-transparent to-black/65 transition-opacity duration-200 pointer-events-none ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center justify-between p-3 pointer-events-auto">
            {onMinimize ? (
              <button
                type="button"
                onClick={onMinimize}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-black/45 hover:bg-black/70 text-white cursor-pointer"
                aria-label="Minimizar reproductor"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-1.5">
              {subtitleUrl && (
                <button
                  type="button"
                  onClick={() => setSubtitlesOn((s) => !s)}
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                    subtitlesOn ? 'bg-[#FF4D4D] text-white' : 'bg-black/45 text-white hover:bg-black/70'
                  }`}
                  aria-label="Subtítulos"
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={toggleSettings}
                className={`min-h-[44px] px-2.5 flex items-center gap-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  showSettings ? 'bg-[#FF4D4D] text-white' : 'bg-black/55 hover:bg-black/75 text-white'
                }`}
                aria-label="Calidad, audio y velocidad"
              >
                <Settings className="w-4 h-4" />
                <span className="font-mono-tabular">
                  {currentLevel === -1
                    ? autoActiveLabel
                      ? `Auto · ${autoActiveLabel}`
                      : 'Auto'
                    : levels.find((l) => l.index === currentLevel)?.label || 'Calidad'}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 pointer-events-auto">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              className="min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center font-mono-tabular text-xs font-semibold text-white cursor-pointer"
              aria-label="Retroceder 10 segundos"
            >
              -10
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-[#FF4D4D] hover:bg-[#FF6666] flex items-center justify-center text-white shadow-lg cursor-pointer"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              className="min-h-[44px] min-w-[44px] rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center font-mono-tabular text-xs font-semibold text-white cursor-pointer"
              aria-label="Adelantar 10 segundos"
            >
              +10
            </button>
          </div>

          <div className="px-3 pb-2.5 pt-1 pointer-events-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = val;
                  setCurrentTime(val);
                }}
                aria-label="Progreso de reproducción"
                className="w-full accent-[#FF4D4D] h-1.5 cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #FF4D4D ${progressPct}%, rgba(255,255,255,0.25) ${progressPct}%)`,
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-white">
              <div className="flex items-center gap-2">
                <span className="font-mono-tabular">
                  {formatDuration(currentTime) || '0:00'} / {formatDuration(duration) || '0:00'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {hasNextEpisode && onNextEpisode && (
                  <button
                    type="button"
                    onClick={onNextEpisode}
                    className="min-h-[40px] px-2.5 inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-[#FF4D4D] text-white text-xs font-semibold transition-colors cursor-pointer"
                    aria-label="Siguiente episodio"
                  >
                    <span>Siguiente</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleSettings}
                  className="min-h-[40px] px-2.5 inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono-tabular font-semibold cursor-pointer"
                  aria-label="Selector de calidad"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF4D4D]" />
                  <span>
                    {currentLevel === -1
                      ? autoActiveLabel || 'Auto'
                      : levels.find((l) => l.index === currentLevel)?.label || 'Auto'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                  aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                  aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!errorMsg && showSettings && (
        <div className="absolute inset-0 z-30 bg-[#070709]/92 backdrop-blur-md overflow-y-auto p-3 sm:p-5 text-xs">
          <div className="max-w-md mx-auto space-y-3.5">
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold text-[#F5F6F8]">Ajustes de reproducción</p>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                aria-label="Cerrar ajustes"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-[#9CA3AF] font-medium mb-1.5">Calidad de video</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectQuality(-1)}
                  className={`min-h-[36px] rounded-lg px-3 font-medium cursor-pointer ${
                    currentLevel === -1 ? 'bg-[#FF4D4D] text-white' : 'bg-white/10 text-[#F5F6F8] hover:bg-white/15'
                  }`}
                >
                  {autoActiveLabel ? `Auto (${autoActiveLabel})` : 'Auto'}
                </button>
                {levels.map((lvl) => (
                  <button
                    key={lvl.index}
                    type="button"
                    onClick={() => handleSelectQuality(lvl.index)}
                    className={`min-h-[36px] rounded-lg px-3 font-mono-tabular font-medium cursor-pointer ${
                      currentLevel === lvl.index
                        ? 'bg-[#FF4D4D] text-white'
                        : 'bg-white/10 text-[#F5F6F8] hover:bg-white/15'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            {audioTracks.length > 1 && (
              <div>
                <p className="text-[#9CA3AF] font-medium mb-1.5">Audio / Idioma</p>
                <div className="flex flex-wrap gap-1.5">
                  {audioTracks.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => handleSelectAudio(tr.id)}
                      className={`min-h-[36px] rounded-lg px-3 font-medium cursor-pointer ${
                        currentAudioTrack === tr.id
                          ? 'bg-[#FF4D4D] text-white'
                          : 'bg-white/10 text-[#F5F6F8] hover:bg-white/15'
                      }`}
                    >
                      {tr.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[#9CA3AF] font-medium mb-1.5">Velocidad</p>
              <div className="flex flex-wrap gap-1.5">
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleSpeed(rate)}
                    className={`min-h-[36px] rounded-lg px-3 font-mono-tabular font-medium cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-[#FF4D4D] text-white'
                        : 'bg-white/10 text-[#F5F6F8] hover:bg-white/15'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
