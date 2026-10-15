import React, { useState } from 'react';
import { FocusMode } from '../types';

interface FocusSelectorProps {
  currentMode: FocusMode;
  onSelectMode: (mode: FocusMode) => void;
}

const MODES: Array<{
  id: FocusMode;
  label: string;
  icon: string;
  tagline: string;
  color: string;
  borderColor: string;
  badgeBg: string;
}> = [
  {
    id: 'fast',
    label: 'Ultra Rápido',
    icon: 'bolt',
    tagline: 'Respuestas ágiles, concisas y de mínima latencia',
    color: 'text-amber-300',
    borderColor: 'border-amber-400/40',
    badgeBg: 'bg-amber-500/20 text-amber-300',
  },
  {
    id: 'deep',
    label: 'Razonamiento Profundo',
    icon: 'psychology',
    tagline: 'Análisis lógico reflexivo y deducción exhaustiva paso a paso',
    color: 'text-purple-300',
    borderColor: 'border-purple-400/40',
    badgeBg: 'bg-purple-500/20 text-purple-300',
  },
  {
    id: 'code',
    label: 'Arquitecto de Código',
    icon: 'terminal',
    tagline: 'Ingeniería de software, TypeScript estricto y mejores prácticas',
    color: 'text-cyan-300',
    borderColor: 'border-cyan-400/40',
    badgeBg: 'bg-cyan-500/20 text-cyan-300',
  },
  {
    id: 'creative',
    label: 'Creativo & Visual',
    icon: 'palette',
    tagline: 'Imaginación estética, prosa descriptiva y conceptos artísticos',
    color: 'text-pink-300',
    borderColor: 'border-pink-400/40',
    badgeBg: 'bg-pink-500/20 text-pink-300',
  },
];

export const FocusSelector: React.FC<FocusSelectorProps> = ({ currentMode, onSelectMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const active = MODES.find((m) => m.id === currentMode) || MODES[0];

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#131822]/90 border ${active.borderColor} shadow-sm hover:bg-[#1a2130] transition-all cursor-pointer group`}
        title="Cambiar Modo de Pensamiento de Nexus Qwen"
      >
        <span className={`material-symbols-outlined text-sm md:text-base ${active.color}`}>
          {active.icon}
        </span>
        <span className="text-xs font-semibold text-slate-200 hidden sm:inline">
          {active.label}
        </span>
        <span className="material-symbols-outlined text-slate-400 text-xs group-hover:text-cyan-300 transition-colors">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 md:w-80 rounded-2xl bg-[#0f141f]/98 border border-cyan-500/30 shadow-[0_12px_36px_rgba(0,0,0,0.8),0_0_20px_rgba(6,182,212,0.2)] backdrop-blur-2xl z-50 p-2 animate-fade-in">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                Modo de Pensamiento
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Nexus Qwen Core</span>
            </div>

            <div className="p-1 space-y-1 mt-1">
              {MODES.map((mode) => {
                const isSelected = mode.id === currentMode;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      onSelectMode(mode.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'hover:bg-slate-800/60 border border-transparent text-slate-300'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected ? mode.badgeBg : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">
                        {mode.icon}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold ${
                            isSelected ? 'text-white' : 'text-slate-200'
                          }`}
                        >
                          {mode.label}
                        </span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-xs text-cyan-400">
                            check_circle
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {mode.tagline}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
