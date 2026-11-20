import React from 'react';
import { formatCount, formatDuration, formatRelativeDate } from '../lib/pictaClient';
import type { PictaCanal, PictaPublicacion } from '../types/picta';
import { MediaImage } from './MediaImage';

interface VideoCardProps {
  video: PictaPublicacion;
  onSelect: (video: PictaPublicacion) => void;
  onChannelClick?: (canal: PictaCanal) => void;
  progressPercent?: number;
  compact?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = React.memo(({
  video,
  onSelect,
  onChannelClick,
  progressPercent,
  compact = false,
}) => {
  const duration = formatDuration(video.duracion);
  const views = formatCount(video.cantidad_visitas || video.cantidad_reproducciones);
  const relDate = formatRelativeDate(video.fecha_publicado || video.fecha_creacion);
  const channelName = video.canal?.nombre || 'Canal de Picta';
  const isLive = video.tipo === 'live' || video.categoria?.tipologia?.nombre === 'Directas';
  const priceValue = video.precios?.[0]?.valor;

  if (compact) {
    return (
      <div className="group flex gap-3 items-start rounded-2xl p-2 hover:bg-[#111318] transition-colors">
        <button
          type="button"
          onClick={() => onSelect(video)}
          className="relative w-40 aspect-video rounded-xl overflow-hidden bg-[#111318] shrink-0 cursor-pointer text-left"
        >
          <MediaImage
            src={video.url_imagen}
            size="320x180"
            alt={video.nombre}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
          />
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/80 px-1.5 py-0.5 font-mono-tabular text-[11px] font-medium text-white">
              {duration}
            </span>
          )}
          {isLive && (
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#FF4D4D] px-1.5 py-0.5 text-[10px] font-bold text-white">
              EN VIVO
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1 py-0.5">
          <button
            type="button"
            onClick={() => onSelect(video)}
            className="text-left w-full cursor-pointer"
          >
            <h4 className="font-display text-sm font-semibold text-[#F5F6F8] line-clamp-2 leading-snug group-hover:text-white">
              {video.nombre}
            </h4>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#9CA3AF]">
            {onChannelClick && video.canal ? (
              <button
                type="button"
                onClick={() => onChannelClick(video.canal!)}
                className="hover:text-[#F5F6F8] truncate max-w-[140px] cursor-pointer"
              >
                {channelName}
              </button>
            ) : (
              <span className="truncate max-w-[140px]">{channelName}</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{views} vistas</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className="group flex flex-col">
      <button
        type="button"
        onClick={() => onSelect(video)}
        className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#111318] border border-white/[0.06] cursor-pointer text-left"
      >
        <MediaImage
          src={video.url_imagen}
          size="480x270"
          alt={video.nombre}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
        />
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />

        {isLive && (
          <span className="absolute top-2.5 left-2.5 rounded-md bg-[#FF4D4D] px-2 py-0.5 text-[11px] font-bold text-white tracking-wide">
            EN VIVO
          </span>
        )}

        {duration && (
          <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/80 px-1.5 py-0.5 font-mono-tabular text-xs font-medium text-white">
            {duration}
          </span>
        )}

        {typeof progressPercent === 'number' && progressPercent > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div
              className="h-full bg-[#FF4D4D]"
              style={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
            />
          </div>
        )}
      </button>

      <div className="mt-3 flex items-start gap-3">
        <button
          type="button"
          onClick={() => video.canal && onChannelClick?.(video.canal)}
          className="w-10 h-10 rounded-full overflow-hidden bg-[#181B22] border border-white/[0.08] shrink-0 cursor-pointer"
          aria-label={channelName}
        >
          <MediaImage
            src={video.canal?.url_avatar || video.canal?.url_imagen}
            size="80x80"
            alt={channelName}
            variant="avatar"
            fallbackText={channelName}
            className="w-full h-full object-cover"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSelect(video)}
            className="text-left w-full cursor-pointer"
          >
            <h3 className="font-display text-[15px] font-semibold text-[#F5F6F8] line-clamp-2 leading-snug group-hover:text-white">
              {video.nombre}
            </h3>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-[#9CA3AF]">
            {onChannelClick && video.canal ? (
              <button
                type="button"
                onClick={() => onChannelClick(video.canal!)}
                className="hover:text-[#F5F6F8] truncate max-w-[180px] cursor-pointer"
              >
                {channelName}
              </button>
            ) : (
              <span className="truncate max-w-[180px]">{channelName}</span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{views} vistas</span>
            {relDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>{relDate}</span>
              </>
            )}
            {priceValue ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-[#FF4D4D] font-medium">{priceValue} CUP</span>
              </>
            ) : video.only_subs ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#FF4D4D] font-medium">Suscriptores</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
});
