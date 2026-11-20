import React, { useEffect, useState } from 'react';
import { Bookmark, ChevronRight, Clock, ListVideo, Loader2, Trash2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import {
  fetchListaPublicaciones,
  fetchListasCanal,
  fetchUserSuscripciones,
  formatCount,
} from '../lib/pictaClient';
import type { PictaCanal, PictaLista, PictaPublicacion, PictaSuscripcion } from '../types/picta';
import { MediaImage } from './MediaImage';
import { VideoCard } from './VideoCard';

interface LibraryViewProps {
  onSelectVideo: (video: PictaPublicacion) => void;
  onSelectChannel: (canal: PictaCanal) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onSelectVideo, onSelectChannel }) => {
  const { user } = useAuth();
  const { history, savedVideos, clearHistory } = usePlayer();

  const [tab, setTab] = useState<'suscripciones' | 'guardados' | 'historial' | 'listas'>('suscripciones');
  const [subs, setSubs] = useState<PictaSuscripcion[]>([]);
  const [listas, setListas] = useState<PictaLista[]>([]);
  const [activeLista, setActiveLista] = useState<{ name: string; items: PictaPublicacion[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (tab === 'suscripciones' && user?.username) {
      setLoading(true);
      fetchUserSuscripciones(user.username)
        .then((res) => {
          if (!cancelled) setSubs(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (tab === 'listas') {
      setLoading(true);
      fetchListasCanal()
        .then((res) => {
          if (!cancelled) setListas(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [tab, user?.username]);

  const openLista = async (l: PictaLista) => {
    setLoading(true);
    try {
      const rows = await fetchListaPublicaciones(l.id);
      setActiveLista({
        name: l.nombre,
        items: rows.map((r) => r.publicacion).filter(Boolean),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'suscripciones', label: 'Suscripciones', icon: Users },
          { id: 'guardados', label: `Guardados (${savedVideos.length})`, icon: Bookmark },
          { id: 'historial', label: `Historial (${history.length})`, icon: Clock },
          { id: 'listas', label: 'Listas de Picta', icon: ListVideo },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id as typeof tab);
                setActiveLista(null);
              }}
              className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                active
                  ? 'bg-[#FF4D4D] text-white'
                  : 'bg-[#111318] text-[#9CA3AF] hover:text-[#F5F6F8] border border-white/[0.06]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-[#FF4D4D] animate-spin" />
        </div>
      ) : tab === 'suscripciones' ? (
        subs.length === 0 ? (
          <div className="py-14 text-center text-[#9CA3AF]">
            <Users className="w-8 h-8 mx-auto opacity-40 mb-2" />
            <p className="text-sm text-[#F5F6F8] font-medium">Aún no sigues canales</p>
            <p className="text-xs mt-1">Suscríbete a tus canales favoritos desde cualquier video o en Explorar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectChannel(s.canal)}
                className="flex items-center gap-3.5 rounded-2xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.06] p-3.5 text-left cursor-pointer transition-colors"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-[#181B22] shrink-0">
                  <MediaImage
                    src={s.canal?.url_avatar || s.canal?.url_imagen}
                    size="80x80"
                    alt={s.canal?.nombre || 'Canal'}
                    variant="avatar"
                    fallbackText={s.canal?.nombre}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-semibold text-[#F5F6F8] truncate">
                    {s.canal?.nombre}
                  </h3>
                  <p className="mt-0.5 font-mono-tabular text-xs text-[#9CA3AF] truncate">
                    {typeof s.canal?.cantidad_suscripciones === 'number'
                      ? `${formatCount(s.canal.cantidad_suscripciones)} suscriptores`
                      : s.canal?.alias
                        ? `@${s.canal.alias}`
                        : 'Abrir canal'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />
              </button>
            ))}
          </div>
        )
      ) : tab === 'guardados' ? (
        savedVideos.length === 0 ? (
          <div className="py-14 text-center text-[#9CA3AF]">
            <Bookmark className="w-8 h-8 mx-auto opacity-40 mb-2" />
            <p className="text-sm text-[#F5F6F8] font-medium">Tu lista de guardados está vacía</p>
            <p className="text-xs mt-1">Toca "Guardar" en cualquier video para verlo más tarde.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
            {savedVideos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onSelect={onSelectVideo}
                onChannelClick={onSelectChannel}
              />
            ))}
          </div>
        )
      ) : tab === 'historial' ? (
        history.length === 0 ? (
          <div className="py-14 text-center text-[#9CA3AF]">
            <Clock className="w-8 h-8 mx-auto opacity-40 mb-2" />
            <p className="text-sm text-[#F5F6F8] font-medium">Sin historial reciente</p>
            <p className="text-xs mt-1">Los videos que reproduzcas aparecerán aquí para retomar donde los dejaste.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearHistory}
                className="min-h-[40px] px-3 rounded-xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.08] text-xs font-medium text-[#9CA3AF] hover:text-[#FF4D4D] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar historial</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
              {history.map((item) => (
                <VideoCard
                  key={item.video.id}
                  video={item.video}
                  onSelect={onSelectVideo}
                  onChannelClick={onSelectChannel}
                  progressPercent={
                    item.durationSeconds > 0
                      ? Math.round((item.progressSeconds / item.durationSeconds) * 100)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        )
      ) : activeLista ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-[#F5F6F8]">{activeLista.name}</h3>
            <button
              type="button"
              onClick={() => setActiveLista(null)}
              className="text-xs font-semibold text-[#FF4D4D] min-h-[40px] px-2 cursor-pointer"
            >
              Volver a listas
            </button>
          </div>
          {activeLista.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9CA3AF]">Esta lista no tiene videos disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-7">
              {activeLista.items.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onSelect={onSelectVideo}
                  onChannelClick={onSelectChannel}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listas.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => openLista(l)}
              className="flex items-center gap-3.5 rounded-2xl bg-[#111318] hover:bg-[#181B22] border border-white/[0.06] p-3.5 text-left cursor-pointer transition-colors"
            >
              <div className="w-16 h-11 rounded-xl overflow-hidden bg-[#181B22] shrink-0">
                <MediaImage
                  src={l.url_imagen}
                  size="120x68"
                  alt={l.nombre}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-display text-sm font-semibold text-[#F5F6F8] truncate">{l.nombre}</h4>
                <p className="mt-0.5 text-xs text-[#9CA3AF] truncate">
                  {l.canal?.nombre || 'Lista de Picta'} · {l.publicaciones?.length ?? 0} videos
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
