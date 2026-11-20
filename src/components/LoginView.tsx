import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Phone, Play, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCubanPhone = /^\d{8}$/.test(username.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Completa tu usuario o número móvil y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar con Picta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#070709] text-[#F5F6F8] flex flex-col justify-center px-4 py-10 pt-safe pb-safe">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/30 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-[#FF4D4D] fill-[#FF4D4D]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#F5F6F8]">
              Picta Pulse
            </h1>
            <p className="text-sm text-[#9CA3AF]">
              Cliente alternativo rápido para Picta
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-[#111318] p-6 sm:p-8 shadow-2xl">
          <h2 className="font-display text-xl font-semibold text-[#F5F6F8]">
            Inicia sesión con tu cuenta
          </h2>
          <p className="mt-1.5 text-sm text-[#9CA3AF]">
            Conecta directamente con api.picta.cu usando tu número móvil cubano o nombre de usuario.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="picta-user" className="block text-sm font-medium text-[#F5F6F8] mb-2">
                Teléfono o usuario
              </label>
              <div className="relative flex items-center">
                <Phone className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 pointer-events-none" />
                <input
                  id="picta-user"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej. 56942234 o usuario"
                  className="w-full min-h-[48px] rounded-xl bg-[#070709] border border-white/10 focus:border-[#FF4D4D] focus:outline-none pl-10 pr-16 text-base text-[#F5F6F8] placeholder:text-[#6B7280] transition-colors"
                />
                {isCubanPhone && (
                  <span className="absolute right-3 font-mono-tabular text-xs font-medium text-[#FF4D4D]">
                    +53
                  </span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="picta-pass" className="block text-sm font-medium text-[#F5F6F8] mb-2">
                Contraseña
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 pointer-events-none" />
                <input
                  id="picta-pass"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña de Picta"
                  className="w-full min-h-[48px] rounded-xl bg-[#070709] border border-white/10 focus:border-[#FF4D4D] focus:outline-none pl-10 pr-12 text-base text-[#F5F6F8] placeholder:text-[#6B7280] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#9CA3AF] hover:text-[#F5F6F8] cursor-pointer"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-[#FF4D4D]/35 bg-[#FF4D4D]/10 px-4 py-3 text-sm text-[#FCA5A5]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FF4D4D]" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-[#FF4D4D] hover:bg-[#FF6666] disabled:opacity-60 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Conectando con Picta...</span>
                </>
              ) : (
                <span>Entrar a Picta</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-col gap-3">
            <PWAInstallButton />
            <p className="text-xs text-[#9CA3AF] text-center">
              Tu sesión se guarda de forma segura en tu dispositivo mediante tokens OAuth2 oficiales de Picta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
