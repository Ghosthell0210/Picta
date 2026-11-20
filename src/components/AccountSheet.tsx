import React from 'react';
import { LogOut, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MediaImage } from './MediaImage';
import { PWAInstallButton } from './PWAInstallButton';

interface AccountSheetProps {
  onClose: () => void;
}

export const AccountSheet: React.FC<AccountSheetProps> = ({ onClose }) => {
  const { user, logout } = useAuth();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#111318] p-6 text-[#F5F6F8] shadow-2xl">
        <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between gap-4">
          <h3 className="font-display text-lg font-bold">Tu cuenta de Picta</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-white cursor-pointer"
            aria-label="Cerrar cuenta"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3.5 rounded-2xl bg-[#070709] border border-white/[0.06] p-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-[#181B22] border border-white/10 shrink-0">
            <MediaImage
              src={user?.avatar}
              size="80x80"
              alt={user?.username || 'Usuario'}
              variant="avatar"
              fallbackText={user?.username || 'P'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold truncate">
              {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Usuario'}
            </p>
            <p className="text-xs text-[#9CA3AF] truncate">
              @{user?.username} {user?.phone_number ? `· ${user.phone_number}` : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl bg-[#181B22] border border-white/[0.06] p-3.5">
            <p className="text-[#9CA3AF]">Suscripción</p>
            <p className="mt-1 font-semibold text-[#F5F6F8]">
              {user?.has_subscription ? user.subscription_plan?.nombre || 'Activa' : 'Gratuita'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#181B22] border border-white/[0.06] p-3.5">
            <p className="text-[#9CA3AF]">Descargas usadas</p>
            <p className="mt-1 font-mono-tabular font-semibold text-[#F5F6F8]">
              {user?.total_downloads ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-[#181B22] border border-white/[0.06] p-4 space-y-2 text-xs text-[#9CA3AF]">
          <div className="flex items-center gap-2 text-[#F5F6F8] font-semibold">
            <Smartphone className="w-4 h-4 text-[#FF4D4D]" />
            <span>Listo para PWA / Android</span>
          </div>
          <p>
            Conecta directo con Picta para cargar catálogos, reproducir HLS con baja latencia en Cuba e instalar la app en tu móvil sin depender del navegador.
          </p>
          <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#9CA3AF]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF4D4D]" />
            <span>Autenticación OAuth2 oficial contra api.picta.cu</span>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full min-h-[46px] rounded-xl border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 hover:bg-[#FF4D4D]/20 text-[#FCA5A5] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
};
