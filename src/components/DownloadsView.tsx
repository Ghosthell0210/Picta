import React, { Suspense, useCallback, useEffect, useState } from 'react';
import {
  CloudDownload,
  Download,
  ExternalLink,
  HardDriveDownload,
  Info,
  Play,
  Share2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import {
  deleteOfflineMp4,
  getOfflineMp4,
  listOfflineMp4s,
  type OfflineMp4Meta,
} from '../lib/offlineMp4Store';
import {
  canShareMp4File,
  downloadFileViaBlob,
  fetchUserDownloadsQuota,
  formatFileSize,
  formatRelativeDate,
  isAndroidWebView,
  saveMp4BlobToDevice,
  shareMp4Blob,
} from '../lib/pictaClient';
import type { PictaPublicacion } from '../types/picta';
import { MediaImage } from './MediaImage';

const DownloadSheet = lazyWithRetry(() => import('./DownloadSheet').then((m) => ({ default: m.DownloadSheet })));

interface DownloadsViewProps {
  onSelectVideo: (video: PictaPublicacion) => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({ onSelectVideo }) => {
  const { user, refreshUser } = useAuth();
  const { savedDownloads, savedVideos, removeSavedDownload } = usePlayer();
  const [quotaCount, setQuotaCount] = useState<number | null>(null);
  const [quotaNote, setQuotaNote] = useState<string | null>(null);
  const [sheetVideo, setSheetVideo] = useState<PictaPublicacion | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [offlineVideos, setOfflineVideos] = useState<OfflineMp4Meta[]>([]);

  const loadOfflineList = useCallback(() => {
    listOfflineMp4s()
      .then(setOfflineVideos)
      .catch(() => setOfflineVideos([]));
  }, []);

  useEffect(() => {
    loadOfflineList();
    refreshUser().catch(() => {});
    fetchUserDownloadsQuota()
      .then((list) => {
        setQuotaCount(list.length);
        setQuotaNote(null);
      })
      .catch((err) => {
        setQuotaNote(err instanceof Error ? err.message : null);
      });
  }, [refreshUser, loadOfflineList]);

  const handleExportOffline = async (meta: OfflineMp4Meta) => {
    const rec = await getOfflineMp4(meta.videoId);
    if (!rec?.blob) return;
    if (isAndroidWebView()) {
      if (canShareMp4File(meta.filename)) {
        await shareMp4Blob(rec.blob, meta.filename);
      } else {
        setDownloadErr(
          'El WebView del APK bloquea exportar a Descargas. Puedes reproducirlo sin conexión aquí o abrir la web en Chrome.',
        );
      }
      return;
    }
    saveMp4BlobToDevice(rec.blob, meta.filename);
  };

  const handleDeleteOffline = async (videoId: number) => {
    await deleteOfflineMp4(videoId);
    setOfflineVideos((prev) => prev.filter((item) => item.videoId !== videoId));
  };

  const maxDownloads = user?.subscription_plan?.descargas ?? 0;
  const usedDownloads = quotaCount ?? user?.total_downloads ?? 0;
  const isWebView = isAndroidWebView();

  return (
    <div className="space-y-6 pb-8">
      <section className="rounded-3xl bg-[#111318] border border-white/[0.08] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/30 flex items-center justify-center shrink-0">
              <CloudDownload className="w-5 h-5 text-[#FF4D4D]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#F5F6F8]">
                Centro de descargas de Picta
              </h2>
              <p className="mt-0.5 text-sm text-[#9CA3AF]">
                {user?.has_subscription
                  ? `Plan ${user.subscription_plan?.nombre || 'Activo'} · ${user.dias_restantes ?? 0} días restantes`
                  : 'Cuenta sin suscripción activa de descargas'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#070709] border border-white/[0.06] px-4 py-3 text-left sm:text-right">
            <p className="text-xs text-[#9CA3AF]">Descargas realizadas</p>
            <p className="font-mono-tabular text-lg font-bold text-[#F5F6F8]">
              {usedDownloads}
              {maxDownloads > 0 ? ` / ${maxDownloads}` : ''}
            </p>
          </div>
        </div>

        {quotaNote && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#070709] border border-white/[0.06] px-4 py-3 text-xs text-[#9CA3AF]">
            <Info className="w-4 h-4 text-[#FF4D4D] shrink-0 mt-0.5" />
            <span>
              Estado oficial de Picta: {quotaNote}. Puedes seguir viendo cualquier video por streaming HLS o bajar subtítulos gratuitos.
            </span>
          </div>
        )}
      </section>

      {offlineVideos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display text-base font-semibold text-[#F5F6F8]">
              Videos guardados sin conexión ({offlineVideos.length})
            </h3>
          </div>
          <div className="space-y-2.5">
            {offlineVideos.map((item) => (
              <div
                key={item.videoId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#111318] border border-emerald-500/20 p-3.5"
              >
                <button
                  type="button"
                  onClick={() => onSelectVideo(item.video)}
                  className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <div className="w-24 aspect-video rounded-xl overflow-hidden bg-[#181B22] shrink-0">
                    <MediaImage
                      src={item.video.url_imagen}
                      size="320x180"
                      alt={item.video.nombre}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold text-[#F5F6F8] truncate">
                      {item.video.nombre}
                    </p>
                    <p className="mt-1 font-mono-tabular text-xs text-[#9CA3AF]">
                      {item.quality} · {formatFileSize(item.sizeBytes)} · {formatRelativeDate(new Date(item.savedAt).toISOString())}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectVideo(item.video)}
                    className="min-h-[42px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#070709] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ver offline</span>
                  </button>
                  {(!isWebView || canShareMp4File(item.filename)) && (
                    <button
                      type="button"
                      onClick={() => handleExportOffline(item)}
                      className="min-h-[42px] px-3.5 rounded-xl bg-[#181B22] hover:bg-white/10 text-[#F5F6F8] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isWebView ? <Share2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                      <span>{isWebView ? 'Exportar' : 'Guardar'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteOffline(item.videoId)}
                    className="min-h-[42px] min-w-[42px] rounded-xl bg-[#181B22] hover:text-[#FF4D4D] text-[#9CA3AF] flex items-center justify-center cursor-pointer"
                    aria-label="Eliminar descarga offline"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-[#F5F6F8]">
          Enlaces generados ({savedDownloads.length})
        </h3>

        {downloadErr && (
          <div className="rounded-xl border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 px-4 py-3 text-xs text-[#FCA5A5]">
            {downloadErr}
          </div>
        )}

        {savedDownloads.length === 0 ? (
          <div className="rounded-2xl bg-[#111318] border border-white/[0.06] p-8 text-center">
            <Download className="w-7 h-7 mx-auto text-[#9CA3AF] opacity-40 mb-2" />
            <p className="text-sm font-medium text-[#F5F6F8]">No hay enlaces generados todavía</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Toca "Descargar" dentro de cualquier video para generar su archivo MP4.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {savedDownloads.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#111318] border border-white/[0.06] p-3.5"
              >
                <button
                  type="button"
                  onClick={() => onSelectVideo(item.video)}
                  className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <div className="w-24 aspect-video rounded-xl overflow-hidden bg-[#181B22] shrink-0">
                    <MediaImage
                      src={item.video.url_imagen}
                      size="320x180"
                      alt={item.video.nombre}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-semibold text-[#F5F6F8] truncate">
                      {item.video.nombre}
                    </p>
                    <p className="mt-1 font-mono-tabular text-xs text-[#9CA3AF]">
                      {item.quality} · {item.sizeLabel} · {formatRelativeDate(new Date(item.createdAt).toISOString())}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {item.url.startsWith('/api/mp4/file/') || item.url.includes('.m3u8') ? (
                    item.url.startsWith('/api/mp4/file/') &&
                    Date.now() - item.createdAt <= 14 * 60 * 1000 &&
                    !isWebView ? (
                      <button
                        type="button"
                        disabled={downloadingId === item.id}
                        onClick={async () => {
                          setDownloadingId(item.id);
                          setDownloadErr(null);
                          try {
                            await downloadFileViaBlob(item.url, `${item.video.slug_url || item.video.id}.mp4`);
                          } catch (err) {
                            setDownloadErr(
                              err instanceof Error
                                ? err.message
                                : 'El archivo temporal ya expiró. Toca Preparar MP4.',
                            );
                          } finally {
                            setDownloadingId(null);
                          }
                        }}
                        className="min-h-[42px] px-4 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingId === item.id ? 'Guardando...' : 'Descargar'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSheetVideo(item.video)}
                        className="min-h-[42px] px-4 rounded-xl bg-[#181B22] hover:bg-[#222630] border border-white/10 text-[#F5F6F8] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#FF4D4D]" />
                        <span>Preparar MP4</span>
                      </button>
                    )
                  ) : (
                    <a
                      href={
                        isWebView
                          ? item.url
                          : `/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(
                              `${item.video.slug_url || item.video.id}.mp4`,
                            )}`
                      }
                      target={isWebView ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      download={`${item.video.slug_url || item.video.id}.mp4`}
                      className="min-h-[42px] px-4 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar</span>
                    </a>
                  )}
                  {!item.url.startsWith('/api/mp4/file/') && !item.url.includes('.m3u8') && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] min-w-[42px] rounded-xl bg-[#181B22] hover:bg-white/10 text-[#F5F6F8] flex items-center justify-center"
                      aria-label="Abrir enlace directo"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSavedDownload(item.id)}
                    className="min-h-[42px] min-w-[42px] rounded-xl bg-[#181B22] hover:text-[#FF4D4D] text-[#9CA3AF] flex items-center justify-center cursor-pointer"
                    aria-label="Eliminar de la lista"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {savedVideos.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-base font-semibold text-[#F5F6F8]">
            Desde tus videos guardados
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {savedVideos.slice(0, 6).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-[#111318] border border-white/[0.06] p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-20 aspect-video rounded-xl overflow-hidden bg-[#181B22] shrink-0">
                    <MediaImage
                      src={v.url_imagen}
                      size="320x180"
                      alt={v.nombre}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs font-semibold text-[#F5F6F8] line-clamp-2">{v.nombre}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetVideo(v)}
                  className="min-h-[42px] px-3.5 rounded-xl bg-[#181B22] hover:bg-[#222630] text-xs font-semibold text-[#F5F6F8] shrink-0 cursor-pointer"
                >
                  Opciones
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sheetVideo && (
        <Suspense fallback={null}>
          <DownloadSheet
            video={sheetVideo}
            onClose={() => {
              setSheetVideo(null);
              loadOfflineList();
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
