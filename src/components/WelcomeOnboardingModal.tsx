import React, { useState, useEffect } from 'react';
import { setUserName } from '../services/storage';

interface WelcomeOnboardingModalProps {
  isOpen: boolean;
  onComplete: (name: string) => void;
  onCancel?: () => void;
  currentName?: string;
}

export const WelcomeOnboardingModal: React.FC<WelcomeOnboardingModalProps> = ({
  isOpen,
  onComplete,
  onCancel,
  currentName = '',
}) => {
  const [nameInput, setNameInput] = useState(currentName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNameInput(currentName);
      setError('');
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nameInput.trim();
    if (!cleanName) {
      setError('Por favor, escribe cómo quieres que te llame antes de continuar.');
      return;
    }

    setUserName(cleanName);
    onComplete(cleanName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#070b14]/90 backdrop-blur-2xl animate-fade-in">
      {/* Background ambient glows */}
      <div className="absolute w-80 h-80 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
      <div className="absolute w-60 h-60 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />

      <div className="relative bg-[#0f131d]/95 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(6,182,212,0.25)] text-center">
        {onCancel && currentName && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Cerrar"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        )}

        {/* Hologram icon pedestal */}
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 mx-auto flex items-center justify-center text-cyan-400 mb-5 shadow-[0_0_20px_rgba(6,182,212,0.35)]">
          <span className="material-symbols-outlined text-3xl" data-icon="neurology">
            neurology
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent mb-3">
          ¡Hola! 👋 Bienvenido a Nexus AI
        </h2>

        <p className="text-sm text-slate-300 leading-relaxed mb-6 font-sans">
          Soy <strong className="text-cyan-300">Nexus Quen</strong>, tu asistente personal. Antes de
          comenzar, ¿cómo quieres que te llame?
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-[11px] font-mono text-cyan-300 uppercase tracking-wider mb-2">
              Tu nombre o apodo preferido
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (error) setError('');
              }}
              placeholder="Escribe tu nombre aquí..."
              autoFocus
              className="w-full bg-[#171c25] border border-cyan-500/30 rounded-xl px-4 py-3 text-sm md:text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all shadow-inner"
            />
            {error && <p className="text-xs text-red-400 mt-2 font-medium">{error}</p>}
          </div>

          <div className="flex gap-2">
            {onCancel && currentName && (
              <button
                type="button"
                onClick={onCancel}
                className="w-1/3 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-all"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-cyan-400 to-purple-400 hover:from-cyan-400 hover:to-purple-300 text-slate-950 font-bold text-sm shadow-[0_0_25px_rgba(76,215,246,0.5)] transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Guardar y continuar</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </form>

        <div className="mt-5 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
          Podrás cambiar tu nombre en cualquier momento desde los ajustes.
        </div>
      </div>
    </div>
  );
};
