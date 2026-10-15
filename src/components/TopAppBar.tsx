import React, { useState } from 'react';
import { FocusMode } from '../types';
import { FocusSelector } from './FocusSelector';

interface TopAppBarProps {
  onToggleDrawer: () => void;
  onNewChat: () => void;
  onOpenKeysModal: () => void;
  isTemporalMode: boolean;
  currentFocusMode: FocusMode;
  onSelectFocusMode: (mode: FocusMode) => void;
  onOpenGallery: () => void;
  onOpenExport: () => void;
  galleryCount: number;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  onToggleDrawer,
  onNewChat,
  onOpenKeysModal,
  isTemporalMode,
  currentFocusMode,
  onSelectFocusMode,
  onOpenGallery,
  onOpenExport,
  galleryCount,
}) => {
  const [showIdentityPopup, setShowIdentityPopup] = useState(false);

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-[#0f131d]/90 backdrop-blur-2xl border-b border-cyan-500/15 shadow-lg shadow-black/40 px-3 md:px-6 py-2.5 print-hide">
      <div className="max-w-7xl mx-auto flex justify-between items-center gap-2">
        {/* Leading Menu Icon & Logo */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <button
            onClick={onToggleDrawer}
            className="p-1.5 rounded-xl hover:bg-slate-800/60 text-slate-200 transition-all active:scale-95 flex items-center justify-center border border-slate-800/80 cursor-pointer"
            title="Abrir menú y chats"
          >
            <span className="material-symbols-outlined text-cyan-400 text-2xl" data-icon="menu">
              menu
            </span>
          </button>

          <div className="flex items-center gap-2">
            <img
              src="/icon.jpg"
              alt="Nexus AI Brand Mark"
              className="h-7 w-7 rounded-lg object-cover border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
            />
            <span className="font-bold text-sm bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent hidden sm:inline font-mono tracking-wider">
              NEXUS AI
            </span>
          </div>
        </div>

        {/* Center: Focus Selector (Modos de Pensamiento) & Model Pill */}
        <div className="flex items-center gap-2">
          {/* Holographic Focus Mode Switcher */}
          <FocusSelector
            currentMode={currentFocusMode}
            onSelectMode={onSelectFocusMode}
          />

          {/* Model Identity Indicator */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowIdentityPopup(!showIdentityPopup)}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1b2029]/80 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:border-purple-400/50 transition-all cursor-pointer group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#4cd7f6] animate-pulse" />
              <span className="text-xs font-semibold text-cyan-300 tracking-wide">
                Nexus Qwen
              </span>
              <span className="material-symbols-outlined text-slate-400 text-sm group-hover:text-cyan-300 transition-colors">
                expand_more
              </span>
            </button>

            {/* Identity Popup */}
            {showIdentityPopup && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 w-72 bg-[#171c25] border border-cyan-500/30 rounded-2xl p-3.5 shadow-2xl z-50 text-xs">
                <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-800">
                  <span className="material-symbols-outlined text-cyan-400 text-lg">verified</span>
                  <span className="font-semibold text-slate-200">Identidad Oficial NEXUS IA</span>
                </div>
                <p className="text-slate-300 leading-relaxed mb-2">
                  <strong>Nexus Qwen</strong> es el núcleo cuántico de inteligencia artificial de <strong>NEXUS AI</strong>, creada por <strong>Breitan Céspedes Monge</strong>.
                </p>
                <p className="text-slate-400 text-[11px] leading-tight">
                  Soporta Búsqueda Web en Vivo, Modos de Pensamiento, Síntesis Visual de Alta Calidad y Exportación Profesional.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Trailing Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* Visual Gallery Shortcut */}
          <button
            onClick={onOpenGallery}
            className="relative p-1.5 rounded-xl hover:bg-slate-800/60 text-slate-300 hover:text-cyan-400 transition-all active:scale-95 flex items-center justify-center border border-slate-800 cursor-pointer"
            title="Abrir Galería Visual de Imágenes Generadas"
          >
            <span className="material-symbols-outlined text-cyan-400 text-xl">
              photo_library
            </span>
            {galleryCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-cyan-500 text-slate-950 font-bold text-[9px] font-mono shadow-sm">
                {galleryCount}
              </span>
            )}
          </button>

          {/* Export Professional (PDF / Markdown) */}
          <button
            onClick={onOpenExport}
            className="p-1.5 rounded-xl hover:bg-slate-800/60 text-slate-300 hover:text-purple-400 transition-all active:scale-95 flex items-center justify-center border border-slate-800 cursor-pointer"
            title="Exportar conversación (PDF y Markdown)"
          >
            <span className="material-symbols-outlined text-purple-400 text-xl">
              ios_share
            </span>
          </button>

          {isTemporalMode && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-500/30 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              Temporal
            </span>
          )}

          <button
            onClick={onOpenKeysModal}
            className="p-1.5 rounded-xl hover:bg-slate-800/60 text-slate-300 hover:text-cyan-400 transition-all active:scale-95 flex items-center justify-center border border-slate-800 cursor-pointer"
            title="Gestor de Seguridad & APIs"
          >
            <span className="material-symbols-outlined text-cyan-400 text-xl" data-icon="lock">
              lock
            </span>
          </button>

          <button
            onClick={onNewChat}
            className="p-1.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-slate-950 font-bold transition-all active:scale-90 flex items-center justify-center shadow-[0_0_15px_rgba(76,215,246,0.4)] cursor-pointer"
            title="Iniciar nueva conversación"
          >
            <span className="material-symbols-outlined text-xl" data-icon="add">
              add
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
