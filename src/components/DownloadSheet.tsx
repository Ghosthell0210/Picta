import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  HardDriveDownload,
  Loader2,
  Play,
  Share2,
  Volume2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { saveOfflineMp4 } from '../lib/offlineMp4Store';
import {
  ClientRemuxUnsupportedError,
  cancelMp4Job,
  canShareMp4File,
  downloadHlsAsMp4Client,
  fetchDirectSubtitleBlobUrl,
  fetchMp4BlobFromUrl,
  fetchMp4JobStatus,
  fetchMp4Variants,
  formatFileSize,
  generateDownloadLink,
  getPictaSubtitleUrl,
  isAndroidWebView,
  isHostedPreviewHost,
  parseDescargaVariants,
  prepareMp4Download,
  saveMp4BlobToDevice,
  shareMp4Blob,
} from '../lib/pictaClient';
import type { Mp4AudioOption, Mp4VariantOption, PictaPublicacion } from '../types/picta';

interface DownloadSheetProps {
  video: PictaPublicacion;
  onClose: () => void;
}

export const DownloadSheet: React.FC<DownloadSheetProps> = ({ video, onClose }) => {
  const { user } = useAuth();
  const { addSavedDownload, playVideo } = usePlayer();

  const [loadingVariants, setLoadingVariants] = useState(false);
  const [variants, setVariants] = useState<Mp4VariantOption[]>([]);
  const [audioTracks, setAudioTracks] = useState<Mp4AudioOption[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [prepStageLabel, setPrepStageLabel] = useState('Descargando video MP4...');
  const [progressPct, setProgressPct] = useState(0);
  const [readyFileSize, setReadyFileSize] = useState<number | undefined>(undefined);
  const [readyFileUrl, setReadyFileUrl] = useState<string | null>(null);
  const [readyServerFileUrl, setReadyServerFileUrl] = useState<string | null>(null);
  const [readyFileName, setReadyFileName] = useState<string>('');
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [downloadingBlob, setDownloadingBlob] = useState(false);
  const [transferPct, setTransferPct] = useState(0);
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  const [officialLoadingKey, setOfficialLoadingKey] = useState<string | null>(null);
  const [officialUrls, setOfficialUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const clientAbortRef = useRef<AbortController | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const jobStatusRef = useRef<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  jobStatusRef.current = jobStatus;

  const isWebView = isAndroidWebView();
  const isPreviewProxy = isHostedPreviewHost();
  const priceValue = video.precios?.[0]?.valor;
  const hasStream = Boolean(video.url_manifiesto);
  const officialVariants = parseDescargaVariants(video.descarga);
  const subtitleFallbackUrl = getPictaSubtitleUrl(video.url_subtitulo);

  useEffect(() => {
    if (!hasStream) return;
    let cancelled = false;
    setLoadingVariants(true);
    setError(null);

    fetchMp4Variants(video.url_manifiesto!, video.duracion)
      .then((res) => {
        if (cancelled) return;
        setIsLive(res.isLive);
        setDurationSeconds(res.durationSeconds || 0);
        setVariants(res.variants || []);
        setAudioTracks(res.audioTracks || []);

        if (res.variants.length > 0) {
          const preferred =
            res.variants.find((v) => /480p|360p/i.test(v.label)) ||
            res.variants[Math.min(1, res.variants.length - 1)];
          setSelectedVariantId(preferred.id);
        }
        if (res.audioTracks.length > 0) {
          const spanish =
            res.audioTracks.find((a) => /spa|es/i.test(a.language || '') || /español/i.test(a.label)) ||
            res.audioTracks.find((a) => a.isDefault) ||
            res.audioTracks[0];
          setSelectedAudioId(spanish.id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron consultar las calidades.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVariants(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasStream, video.id, video.url_manifiesto, video.duracion]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      if (clientAbortRef.current) clientAbortRef.current.abort();
      if (activeJobRef.current && jobStatusRef.current === 'preparing') {
        cancelMp4Job(activeJobRef.current);
      }
    };
  }, []);

  const persistOfflineCopy = async (blob: Blob, fileName: string, qualityLabel: string) => {
    try {
      await saveOfflineMp4({
        videoId: video.id,
        video,
        blob,
        filename: fileName,
        quality: qualityLabel,
        sizeBytes: blob.size,
        savedAt: Date.now(),
      });
      setSavedOffline(true);
    } catch {
      setSavedOffline(false);
    }
  };

  const deliverBlobToDevice = async (blob: Blob, fileName: string, serverFileUrl?: string | null) => {
    if (isWebView) {
      if (canShareMp4File(fileName)) {
        await shareMp4Blob(blob, fileName);
        return;
      }
      if (!isPreviewProxy && serverFileUrl) {
        const link = document.createElement('a');
        link.href = serverFileUrl;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      return;
    }
    saveMp4BlobToDevice(blob, fileName);
  };

  const triggerFileDownload = async (url: string, fileName: string, blobOverride?: Blob | null) => {
    if (blobOverride) {
      await deliverBlobToDevice(blobOverride, fileName, readyServerFileUrl);
      return;
    }

    if (isWebView && !isPreviewProxy && url.startsWith('/api/mp4/file/')) {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    setDownloadingBlob(true);
    setTransferPct(0);
    setError(null);
    try {
      const fetchedBlob = await fetchMp4BlobFromUrl(url, (pct) => setTransferPct(pct));
      setReadyBlob(fetchedBlob);
      await deliverBlobToDevice(fetchedBlob, fileName, readyServerFileUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el archivo MP4.');
    } finally {
      setDownloadingBlob(false);
    }
  };

  const startServerMp4Preparation = async (
    chosenVariant: Mp4VariantOption,
    chosenAudio: Mp4AudioOption | undefined,
    baseName: string,
  ) => {
    setPrepStageLabel('Empaquetando MP4 en servidor...');
    setProgressPct(4);

    const { jobId: newJobId } = await prepareMp4Download({
      videoUrl: chosenVariant.url,
      audioUrl: chosenAudio?.url,
      filename: baseName,
      durationSeconds,
    });

    activeJobRef.current = newJobId;
    setJobId(newJobId);

    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const st = await fetchMp4JobStatus(newJobId);
        setProgressPct(st.progressPct);
        if (st.status === 'ready') {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          const fileUrl = `/api/mp4/file/${encodeURIComponent(newJobId)}`;
          const finalName = st.filename || baseName;
          setReadyServerFileUrl(fileUrl);

          let fetchedBlob: Blob | null = null;
          if (!isWebView || isPreviewProxy || canShareMp4File(finalName)) {
            try {
              setPrepStageLabel('Recibiendo archivo MP4...');
              fetchedBlob = await fetchMp4BlobFromUrl(fileUrl, (pct) => setTransferPct(pct));
              setReadyBlob(fetchedBlob);
              if (isWebView) {
                await persistOfflineCopy(
                  fetchedBlob,
                  finalName,
                  `${chosenVariant.label}${chosenAudio ? ` · ${chosenAudio.label}` : ''}`,
                );
              }
            } catch {
              // fallback to URL button
            }
          }

          setJobStatus('ready');
          setReadyFileSize(fetchedBlob?.size || st.fileSize);
          setReadyFileUrl(fileUrl);
          setReadyFileName(finalName);

          addSavedDownload({
            id: `${video.id}_mp4_${chosenVariant.label}_${chosenAudio?.label || 'def'}`,
            video,
            quality: `${chosenVariant.label}${chosenAudio ? ` · ${chosenAudio.label}` : ''}`,
            sizeLabel: formatFileSize(fetchedBlob?.size || st.fileSize) || chosenVariant.estimatedSizeLabel || 'MP4',
            url: fileUrl,
            createdAt: Date.now(),
          });

          if (fetchedBlob) {
            await deliverBlobToDevice(fetchedBlob, finalName, fileUrl);
          } else {
            await triggerFileDownload(fileUrl, finalName);
          }
        } else if (st.status === 'error') {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setJobStatus('error');
          setError(st.error || 'No se pudo generar el archivo MP4.');
        }
      } catch (err) {
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        setJobStatus('error');
        setError(err instanceof Error ? err.message : 'Error preparando el MP4.');
      }
    }, 750);
  };

  const handleStartFreeMp4 = async () => {
    const chosenVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
    if (!chosenVariant) return;
    const chosenAudio = audioTracks.find((a) => a.id === selectedAudioId);

    setError(null);
    setJobStatus('preparing');
    setPrepStageLabel('Descargando directo desde Picta...');
    setProgressPct(2);
    setReadyFileUrl(null);
    setReadyServerFileUrl(null);
    setReadyBlob(null);
    setSavedOffline(false);
    setReadyFileSize(undefined);
    setReadyFileName('');

    const baseName = `${video.slug_url || video.id}_${chosenVariant.label.replace(/\s+/g, '')}.mp4`;

    // En WebView con servidor público propio (no ais-pre), usar el gestor nativo DownloadManager si es posible
    const preferClientRemux = !chosenAudio && (!isWebView || isPreviewProxy || canShareMp4File(baseName));

    if (preferClientRemux) {
      const ctrl = new AbortController();
      clientAbortRef.current = ctrl;
      try {
        const clientBlob = await downloadHlsAsMp4Client({
          videoUrl: chosenVariant.url,
          signal: ctrl.signal,
          onProgress: (pct) => {
            setProgressPct(pct);
            if (pct >= 88) {
              setPrepStageLabel('Ensamblando MP4...');
            }
          },
        });
        if (ctrl.signal.aborted) return;
        clientAbortRef.current = null;

        setReadyBlob(clientBlob);
        setReadyFileSize(clientBlob.size);
        setReadyFileUrl(chosenVariant.url);
        setReadyFileName(baseName);

        if (isWebView) {
          setPrepStageLabel('Guardando en biblioteca offline...');
          await persistOfflineCopy(clientBlob, baseName, chosenVariant.label);
        }

        setJobStatus('ready');

        addSavedDownload({
          id: `${video.id}_mp4_${chosenVariant.label}_direct`,
          video,
          quality: chosenVariant.label,
          sizeLabel: formatFileSize(clientBlob.size) || chosenVariant.estimatedSizeLabel || 'MP4',
          url: chosenVariant.url,
          createdAt: Date.now(),
        });

        await deliverBlobToDevice(clientBlob, baseName, null);
        return;
      } catch (err) {
        clientAbortRef.current = null;
        if (err instanceof DOMException && err.name === 'AbortError') {
          setJobStatus('idle');
          setProgressPct(0);
          return;
        }
        if (!(err instanceof ClientRemuxUnsupportedError)) {
          // continuar al respaldo de servidor FFmpeg
        }
      }
    }

    try {
      await startServerMp4Preparation(chosenVariant, chosenAudio, baseName);
    } catch (err) {
      setJobStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la descarga MP4.',
      );
    }
  };

  const handleCancelPrep = async () => {
    if (clientAbortRef.current) {
      clientAbortRef.current.abort();
      clientAbortRef.current = null;
    }
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (jobId) {
      await cancelMp4Job(jobId);
    }
    activeJobRef.current = null;
    setJobId(null);
    setJobStatus('idle');
    setProgressPct(0);
  };

  const handleGenerateOfficial = async (key: string, label: string, sizeLabel: string) => {
    setOfficialLoadingKey(key);
    setError(null);
    try {
      const res = await generateDownloadLink(video.id, key);
      if (!res?.url) throw new Error('Picta no devolvió un enlace válido.');
      setOfficialUrls((prev) => ({ ...prev, [key]: res.url }));
      addSavedDownload({
        id: `${video.id}_${key}`,
        video,
        quality: label,
        sizeLabel,
        url: res.url,
        createdAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el enlace oficial.');
    } finally {
      setOfficialLoadingKey(null);
    }
  };

  const handleSubtitleDownload = async () => {
    if (!video.url_subtitulo || subBusy) return;
    setSubBusy(true);
    try {
      const { url, isBlob } = await fetchDirectSubtitleBlobUrl(video.url_subtitulo);
      if (!url) return;
      const link = document.createElement('a');
      link.href = url;
      link.download = `${video.slug_url || video.id}.vtt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (isBlob) {
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } finally {
      setSubBusy(false);
    }
  };

  const handleCopyCurrentUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedAppLink(true);
      window.setTimeout(() => setCopiedAppLink(false), 2200);
    } catch {
      // ignore clipboard restriction
    }
  };

  const chosenVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];
  const fileNameToUse =
    readyFileName || `${video.slug_url || video.id}_${chosenVariant?.label || 'video'}.mp4`;
  const canWebViewShare = canShareMp4File(fileNameToUse);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#111318] p-6 text-[#F5F6F8] shadow-2xl max-h-[88dvh] overflow-y-auto">
        <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-[#F5F6F8]">Descargar video MP4</h3>
            <p className="mt-1 text-xs text-[#9CA3AF] line-clamp-1">{video.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-white cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 px-3.5 py-3 text-xs text-[#FCA5A5]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FF4D4D]" />
            <span>{error}</span>
          </div>
        )}

        {!hasStream ? (
          <div className="mt-4 rounded-2xl bg-[#070709] border border-white/[0.06] p-4 text-xs text-[#9CA3AF] leading-relaxed">
            {priceValue
              ? `Esta publicación tiene un costo de ${priceValue} CUP en Picta y no expone flujo gratuito para descargar.`
              : video.only_subs
                ? 'Esta publicación es exclusiva para suscriptores de pago del canal y no permite descarga gratuita.'
                : 'Esta publicación no tiene flujo de video disponible para descargar.'}
          </div>
        ) : loadingVariants ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-xs text-[#9CA3AF]">
            <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
            <span>Analizando calidades e idiomas disponibles...</span>
          </div>
        ) : isLive || video.tipo === 'live' ? (
          <div className="mt-4 rounded-2xl bg-[#070709] border border-white/[0.06] p-4 text-xs text-[#9CA3AF]">
            Las transmisiones en vivo no tienen un archivo finalizado para descargar en MP4.
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F6F8] mb-2.5">
                <Film className="w-4 h-4 text-[#FF4D4D]" />
                <span>Elige la calidad del MP4</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {variants.map((v) => {
                  const active = selectedVariantId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={jobStatus === 'preparing'}
                      onClick={() => {
                        setSelectedVariantId(v.id);
                        setJobStatus('idle');
                        setReadyFileUrl(null);
                        setReadyServerFileUrl(null);
                        setReadyBlob(null);
                        setSavedOffline(false);
                      }}
                      className={`min-h-[54px] rounded-2xl border px-3.5 py-2.5 text-left transition-colors cursor-pointer disabled:opacity-60 ${
                        active
                          ? 'bg-[#FF4D4D]/15 border-[#FF4D4D] text-white'
                          : 'bg-[#181B22] border-white/[0.06] text-[#F5F6F8] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-sm font-bold">{v.label}</span>
                        {active && <Check className="w-4 h-4 text-[#FF4D4D] shrink-0" />}
                      </div>
                      <p className="mt-0.5 font-mono-tabular text-[11px] text-[#9CA3AF]">
                        {v.estimatedSizeLabel || (v.resolution ? v.resolution : 'Calidad HLS')}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {audioTracks.length > 1 && (
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F6F8] mb-2.5">
                  <Volume2 className="w-4 h-4 text-[#FF4D4D]" />
                  <span>Pista de audio</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {audioTracks.map((tr) => {
                    const active = selectedAudioId === tr.id;
                    return (
                      <button
                        key={tr.id}
                        type="button"
                        disabled={jobStatus === 'preparing'}
                        onClick={() => {
                          setSelectedAudioId(tr.id);
                          setJobStatus('idle');
                          setReadyFileUrl(null);
                          setReadyServerFileUrl(null);
                          setReadyBlob(null);
                          setSavedOffline(false);
                        }}
                        className={`min-h-[42px] px-4 rounded-xl border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                          active
                            ? 'bg-[#FF4D4D]/15 border-[#FF4D4D] text-white'
                            : 'bg-[#181B22] border-white/[0.06] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {tr.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {jobStatus === 'preparing' ? (
              <div className="rounded-2xl bg-[#070709] border border-white/[0.08] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#F5F6F8]">{prepStageLabel}</span>
                  <span className="font-mono-tabular font-bold text-[#FF4D4D]">{progressPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#FF4D4D] transition-all duration-300"
                    style={{ width: `${Math.max(4, progressPct)}%` }}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCancelPrep}
                    className="min-h-[38px] px-3 rounded-lg text-xs text-[#9CA3AF] hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : jobStatus === 'ready' && (readyBlob || readyFileUrl) ? (
              <div className="space-y-2.5">
                {isWebView ? (
                  <>
                    {savedOffline && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2.5">
                        <div className="flex items-start gap-2.5 text-xs text-emerald-200">
                          <HardDriveDownload className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">
                              Video guardado sin conexión ({chosenVariant?.label}
                              {readyFileSize ? ` · ${formatFileSize(readyFileSize)}` : ''})
                            </p>
                            <p className="mt-0.5 text-[11px] text-emerald-200/80">
                              Ya puedes reproducirlo sin internet ni VPN desde la pestaña Descargas.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            playVideo(video);
                          }}
                          className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#070709] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Ver ahora sin conexión</span>
                        </button>
                      </div>
                    )}

                    {readyBlob && canWebViewShare && (
                      <button
                        type="button"
                        onClick={() => shareMp4Blob(readyBlob, fileNameToUse)}
                        className="w-full min-h-[46px] rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Exportar / Compartir MP4</span>
                      </button>
                    )}

                    {!isPreviewProxy && readyServerFileUrl && (
                      <a
                        href={readyServerFileUrl}
                        download={fileNameToUse}
                        className="w-full min-h-[46px] rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          Guardar en Android ({chosenVariant?.label}
                          {readyFileSize ? ` · ${formatFileSize(readyFileSize)}` : ''})
                        </span>
                      </a>
                    )}

                    <div className="rounded-2xl bg-[#070709] border border-white/[0.08] p-3 text-[11px] text-[#9CA3AF] space-y-2">
                      <p>
                        El WebView de WebIntoApp no puede escribir archivos <span className="text-[#F5F6F8]">blob:</span> directo a la carpeta Descargas de Android. Para guardar el <span className="text-[#F5F6F8]">.mp4</span> en tu galería/Descargas, abre Picta Pulse en Chrome e instala la PWA.
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-h-[38px] rounded-xl bg-[#181B22] hover:bg-white/10 text-[#F5F6F8] font-semibold inline-flex items-center justify-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#FF4D4D]" />
                          <span>Abrir en Chrome</span>
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyCurrentUrl}
                          className="min-h-[38px] px-3 rounded-xl bg-[#181B22] hover:bg-white/10 text-[#F5F6F8] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedAppLink ? <Check className="w-3.5 h-3.5 text-[#FF4D4D]" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedAppLink ? 'Copiado' : 'Copiar URL'}</span>
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={downloadingBlob}
                      onClick={() => triggerFileDownload(readyFileUrl || '', fileNameToUse, readyBlob)}
                      className="w-full min-h-[48px] rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] disabled:opacity-75 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      {downloadingBlob ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span>
                        {downloadingBlob
                          ? `Descargando MP4${transferPct > 0 ? ` (${transferPct}%)` : '...'}`
                          : `Guardar MP4 (${chosenVariant?.label}${readyFileSize ? ` · ${formatFileSize(readyFileSize)}` : ''})`}
                      </span>
                    </button>
                    {readyBlob && !savedOffline && (
                      <button
                        type="button"
                        onClick={() =>
                          persistOfflineCopy(readyBlob, fileNameToUse, chosenVariant?.label || 'MP4')
                        }
                        className="w-full min-h-[42px] rounded-xl bg-[#181B22] hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#F5F6F8] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <HardDriveDownload className="w-4 h-4 text-[#FF4D4D]" />
                        <span>Guardar también para ver sin conexión</span>
                      </button>
                    )}
                    <p className="text-[11px] text-center text-[#9CA3AF]">
                      Si no inició automáticamente, toca el botón de arriba para guardar el archivo MP4.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={!chosenVariant}
                onClick={handleStartFreeMp4}
                className="w-full min-h-[48px] rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>
                  Descargar MP4 gratis ({chosenVariant?.label || 'Video'}
                  {chosenVariant?.estimatedSizeLabel ? ` · ${chosenVariant.estimatedSizeLabel}` : ''})
                </span>
              </button>
            )}
          </div>
        )}

        {subtitleFallbackUrl && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-[#181B22] border border-white/[0.06] p-3.5">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[#9CA3AF]" />
              <div>
                <p className="text-sm font-semibold text-[#F5F6F8]">Subtítulos en español</p>
                <p className="text-xs text-[#9CA3AF]">Archivo WebVTT gratuito</p>
              </div>
            </div>
            <button
              type="button"
              disabled={subBusy}
              onClick={handleSubtitleDownload}
              className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-[#F5F6F8] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {subBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>Bajar</span>
            </button>
          </div>
        )}

        {user?.has_subscription && officialVariants.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.08] space-y-2">
            <p className="text-xs font-semibold text-[#9CA3AF]">
              Descarga con tu plan oficial ({user.subscription_plan?.nombre || 'Activo'})
            </p>
            {officialVariants.map((v) => {
              const ready = officialUrls[v.key];
              return (
                <div
                  key={v.key}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#070709] border border-white/[0.06] p-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#F5F6F8]">{v.label}</p>
                    <p className="font-mono-tabular text-[11px] text-[#9CA3AF]">{v.size}</p>
                  </div>
                  {ready ? (
                    <a
                      href={isWebView ? ready : `/api/download?url=${encodeURIComponent(ready)}&filename=${encodeURIComponent(`${video.slug_url || video.id}_${v.key}.mp4`)}`}
                      target={isWebView ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      download={`${video.slug_url || video.id}_${v.key}.mp4`}
                      className="min-h-[40px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Bajar</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(officialLoadingKey)}
                      onClick={() => handleGenerateOfficial(v.key, v.label, v.size)}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#181B22] hover:bg-white/10 text-xs font-semibold text-[#F5F6F8] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {officialLoadingKey === v.key ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Enlace oficial</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
