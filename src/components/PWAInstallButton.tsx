import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] text-white font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[44px] px-4 py-2 text-xs' : 'w-full min-h-[46px] px-5 py-2.5 text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar aplicación</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#181B22] hover:bg-[#20242E] text-[#F5F6F8] min-h-[44px] px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="w-4 h-4 shrink-0" />
          <span>Instalar en iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111318] p-6 text-[#F5F6F8] shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-display text-lg font-semibold">Instalar en iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-white cursor-pointer"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-[#9CA3AF]">
                <li>1. Toca el botón <strong className="text-[#F5F6F8]">Compartir</strong> en la barra inferior de Safari.</li>
                <li>2. Desplázate y selecciona <strong className="text-[#F5F6F8]">Añadir a pantalla de inicio</strong>.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#FF4D4D] text-white font-semibold text-sm hover:bg-[#FF6666] transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
