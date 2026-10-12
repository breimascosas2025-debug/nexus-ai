import React, { useState, useRef, ChangeEvent, KeyboardEvent } from 'react';
import { Attachment } from '../types';

interface OmnibarProps {
  onSendMessage: (content: string, attachments: Attachment[], webSearch?: boolean) => void;
  onCancelGeneration: () => void;
  isProcessing: boolean;
  statusText?: string;
  onTriggerImageMode?: () => void;
  isWebSearchActive: boolean;
  onToggleWebSearch: () => void;
}

export const Omnibar: React.FC<OmnibarProps> = ({
  onSendMessage,
  onCancelGeneration,
  isProcessing,
  statusText,
  onTriggerImageMode,
  isWebSearchActive,
  onToggleWebSearch,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isImageMode, setIsImageMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleToggleImageMode = () => {
    const next = !isImageMode;
    setIsImageMode(next);
    if (next) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
    if (onTriggerImageMode) {
      onTriggerImageMode();
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // 20MB limit check
      if (file.size > 20 * 1024 * 1024) {
        alert(`El archivo ${file.name} supera el límite máximo de 20MB.`);
        return;
      }

      const reader = new FileReader();
      const isImage = file.type.startsWith('image/');

      reader.onload = () => {
        const base64Data = reader.result as string;
        const newAttachment: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data: base64Data,
          isImage,
        };
        setAttachments((prev) => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = () => {
    if ((!inputText.trim() && attachments.length === 0) || isProcessing) return;
    let textToSend = inputText.trim();
    if (isImageMode && textToSend) {
      const lower = textToSend.toLowerCase();
      const alreadyDescribesImage = /(imagen|foto|dibujo|wallpaper|ilustración|crea|haz|genera|diseña|dibuja|pinta|renderiza|sintetiza)/i.test(lower);
      if (!alreadyDescribesImage) {
        textToSend = `Crea una imagen de: ${textToSend}`;
      }
      setIsImageMode(false);
    }
    onSendMessage(textToSend, attachments, isWebSearchActive);
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed bottom-14 md:bottom-16 left-0 w-full z-40 px-3 md:px-6 pointer-events-none omnibar-container">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        {/* Processing Indicator Pill above input */}
        {isProcessing && (
          <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#1b2029]/95 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-xl animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-medium text-cyan-300">
                {statusText || 'Nexus Quen está procesando...'}
              </span>
            </div>
            <button
              onClick={onCancelGeneration}
              className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">stop_circle</span>
              <span>Detener</span>
            </button>
          </div>
        )}

        {/* Omnibar Glass Capsule */}
        <div className="bg-[#0a0e17]/90 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl p-2 md:p-2.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.9),0_0_25px_-5px_rgba(6,182,212,0.25)] flex flex-col transition-all focus-within:border-cyan-400 focus-within:shadow-[0_0_30px_rgba(76,215,246,0.35)]">
          {/* Attachment preview list */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 p-2 bg-[#171c25]/80 rounded-xl border border-slate-800 max-h-32 overflow-y-auto no-scrollbar">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 bg-slate-900/90 border border-cyan-500/20 rounded-lg p-1.5 pr-2 text-xs text-slate-200"
                >
                  {att.isImage ? (
                    <img
                      src={att.data}
                      alt={att.name}
                      className="w-8 h-8 rounded object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <span className="material-symbols-outlined text-base">description</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 max-w-[130px]">
                    <span className="truncate font-medium text-[11px]">{att.name}</span>
                    <span className="text-[10px] text-slate-400">{formatSize(att.size)}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-1 hover:text-red-400 text-slate-400 transition-colors ml-1 cursor-pointer"
                    title="Quitar archivo"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Web Search Indicator Pill */}
          {isWebSearchActive && (
            <div className="mb-1.5 px-2.5 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-400/40 text-[11px] text-cyan-300 font-mono flex items-center justify-between w-fit gap-2">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-xs text-cyan-400">language</span>
                <span>Búsqueda Web en Vivo Activada (Google Grounding)</span>
              </span>
              <button
                onClick={onToggleWebSearch}
                className="hover:text-red-400 ml-1 cursor-pointer"
                title="Desactivar búsqueda web"
              >
                ✕
              </button>
            </div>
          )}

          {/* Active Image Mode Indicator Pill */}
          {isImageMode && (
            <div className="mb-1.5 px-2.5 py-1 rounded-lg bg-purple-950/90 border border-purple-400/60 text-[11px] text-purple-200 font-mono flex items-center justify-between w-fit gap-2 shadow-[0_0_15px_rgba(168,85,247,0.35)] animate-fade-in">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-purple-300">image</span>
                <span className="font-semibold text-purple-300">Modo Imagen Activado:</span>
                <span>Nexus Quen creará la imagen que describas</span>
              </span>
              <button
                onClick={() => setIsImageMode(false)}
                className="hover:text-red-400 ml-1 cursor-pointer font-bold px-1"
                title="Desactivar modo imagen"
              >
                ✕
              </button>
            </div>
          )}

          {/* Main Controls Row */}
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.py,.html,.css,.csv"
              className="hidden"
            />

            {/* Multimodal Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 border border-slate-700 flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 cursor-pointer"
              title="Adjuntar imágenes o archivos (PDF, código, texto)"
            >
              <span className="material-symbols-outlined text-xl md:text-2xl" data-icon="add">
                add
              </span>
            </button>

            {/* Image Mode Shortcut Button */}
            <button
              onClick={handleToggleImageMode}
              className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 flex-shrink-0 cursor-pointer ${
                isImageMode
                  ? 'bg-purple-600/40 text-purple-200 border border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] scale-105'
                  : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-500/30'
              }`}
              title={
                isImageMode
                  ? 'Modo Imagen Activado (haz clic para desactivar)'
                  : 'Activar Modo Imagen (Nexus Quen creará lo que escribas)'
              }
            >
              <span className="material-symbols-outlined text-lg md:text-xl" data-icon="image">
                image
              </span>
            </button>

            {/* Live Web Grounding Toggle Button */}
            <button
              onClick={onToggleWebSearch}
              className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 flex-shrink-0 cursor-pointer ${
                isWebSearchActive
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'bg-slate-800/60 hover:bg-slate-700/80 text-slate-400 hover:text-cyan-400 border border-slate-700/80'
              }`}
              title={
                isWebSearchActive
                  ? 'Búsqueda Web en Vivo Activada (haz clic para desactivar)'
                  : 'Activar Búsqueda Web en Vivo (Google Search Grounding)'
              }
            >
              <span className="material-symbols-outlined text-lg md:text-xl">
                language
              </span>
            </button>

            {/* Prompt Text Input */}
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  isImageMode
                    ? 'Describe la imagen que deseas crear...'
                    : isWebSearchActive
                      ? 'Pregunta a Nexus Quen con búsqueda web en vivo...'
                      : 'Pregunta a Nexus Quen o pide crear una imagen...'
                }
                className="w-full bg-transparent border-0 text-slate-100 placeholder:text-slate-500 focus:ring-0 text-sm md:text-base py-2 px-1 focus:outline-none resize-none leading-relaxed"
              />
            </div>

            {/* Action Tray: Send or Stop */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isProcessing ? (
                <button
                  onClick={onCancelGeneration}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-red-600/80 hover:bg-red-500 text-white flex items-center justify-center font-bold shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all active:scale-90 cursor-pointer"
                  title="Cancelar generación"
                >
                  <span className="material-symbols-outlined text-xl" data-icon="stop">
                    stop
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!inputText.trim() && attachments.length === 0}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-cyan-400 to-purple-400 hover:from-cyan-400 hover:to-purple-300 disabled:opacity-40 disabled:pointer-events-none text-slate-950 flex items-center justify-center font-bold shadow-[0_0_18px_rgba(76,215,246,0.6)] hover:shadow-[0_0_26px_rgba(208,188,255,0.7)] transition-all active:scale-90 cursor-pointer"
                  title="Enviar prompt"
                >
                  <span className="material-symbols-outlined text-xl font-bold" data-icon="arrow_upward">
                    arrow_upward
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
