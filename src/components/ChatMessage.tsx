import React, { useState, useEffect } from 'react';
import { Message, FocusMode } from '../types';

interface ChatMessageProps {
  message: Message;
  onRetry?: () => void;
  onOpenImageModal?: (url: string, prompt: string) => void;
  userName?: string;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onSwitchVersion?: (messageId: string, targetVersionIndex: number) => void;
  onRegenerateResponse?: (messageId: string) => void;
}

const FOCUS_MODE_LABELS: Record<FocusMode, { label: string; icon: string; color: string }> = {
  fast: { label: 'Ultra Rápido', icon: 'bolt', color: 'text-amber-300 border-amber-500/30 bg-amber-950/40' },
  deep: { label: 'Razonamiento Profundo', icon: 'psychology', color: 'text-purple-300 border-purple-500/30 bg-purple-950/40' },
  code: { label: 'Arquitecto de Código', icon: 'terminal', color: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/40' },
  creative: { label: 'Creativo & Visual', icon: 'palette', color: 'text-pink-300 border-pink-500/30 bg-pink-950/40' },
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onRetry,
  onOpenImageModal,
  userName,
  onEditMessage,
  onSwitchVersion,
  onRegenerateResponse,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [showEnhancedPrompt, setShowEnhancedPrompt] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);

  // Message inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);

  useEffect(() => {
    setEditDraft(message.content);
  }, [message.content]);

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (codeText: string, index: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const handleDownloadImage = (url: string, prompt: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexus_quen_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Respuesta de Nexus Quen',
          text: message.content,
        });
      } catch {
        handleCopyMessage();
      }
    } else {
      handleCopyMessage();
    }
  };

  const handleSaveEdit = () => {
    if (!editDraft.trim()) return;
    if (onEditMessage) {
      onEditMessage(message.id, editDraft.trim());
    }
    setIsEditing(false);
  };

  // Version branching index
  const totalVersions = message.versions && message.versions.length > 0 ? message.versions.length : 1;
  const currentVersionIdx = message.currentVersionIndex !== undefined ? message.currentVersionIndex : totalVersions - 1;

  // Helper to parse code blocks vs normal markdown paragraphs
  const renderFormattedContent = (content: string) => {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push(
          <div key={`text_${lastIndex}`} className="space-y-2 my-2">
            {textBefore.split('\n\n').map((para, pIdx) => (
              <p key={pIdx} className="leading-relaxed whitespace-pre-wrap">
                {para}
              </p>
            ))}
          </div>
        );
      }

      const lang = match[1] || 'code';
      const codeSnippet = match[2];
      const currentCodeIndex = codeIndex++;

      parts.push(
        <div
          key={`code_${match.index}`}
          className="rounded-xl overflow-hidden border border-cyan-500/20 bg-[#070b14] my-3 shadow-lg"
        >
          {/* Code Window Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#1b2029]/80 border-b border-slate-800 text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500/70" />
              <span className="text-[11px] font-mono text-cyan-400 ml-2">{lang}</span>
            </div>
            <button
              onClick={() => handleCopyCode(codeSnippet, currentCodeIndex)}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs font-mono transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">
                {copiedCodeIndex === currentCodeIndex ? 'check' : 'content_copy'}
              </span>
              <span>{copiedCodeIndex === currentCodeIndex ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
          <pre className="p-3.5 text-xs font-mono overflow-x-auto text-slate-200 leading-relaxed">
            <code>{codeSnippet}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = content.substring(lastIndex);
    if (remainingText.trim()) {
      parts.push(
        <div key={`text_end`} className="space-y-2 my-2">
          {remainingText.split('\n\n').map((para, pIdx) => (
            <p key={pIdx} className="leading-relaxed whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      );
    }

    return parts.length > 0 ? parts : <p className="whitespace-pre-wrap">{content}</p>;
  };

  // ================= USER MESSAGE =================
  if (message.role === 'user') {
    return (
      <div className="flex justify-end w-full mb-4 animate-fade-in group print-message">
        <div className="max-w-[90%] md:max-w-[75%] bg-[#1b2029]/95 border border-cyan-500/30 rounded-2xl rounded-br-sm p-4 backdrop-blur-xl shadow-lg relative">
          <div className="flex items-center justify-between gap-1.5 mb-1.5 text-cyan-400">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm" data-icon="account_circle">
                account_circle
              </span>
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-300 font-semibold">
                {userName || 'Usuario'}
              </span>
            </div>

            {/* Version Branching & Edit Actions */}
            <div className="flex items-center gap-2 print-hide">
              {/* Branch navigator if multiple versions */}
              {totalVersions > 1 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                  <button
                    disabled={currentVersionIdx <= 0}
                    onClick={() => onSwitchVersion && onSwitchVersion(message.id, currentVersionIdx - 1)}
                    className="disabled:opacity-30 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Versión anterior"
                  >
                    ◀
                  </button>
                  <span>
                    {currentVersionIdx + 1}/{totalVersions}
                  </span>
                  <button
                    disabled={currentVersionIdx >= totalVersions - 1}
                    onClick={() => onSwitchVersion && onSwitchVersion(message.id, currentVersionIdx + 1)}
                    className="disabled:opacity-30 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Versión siguiente"
                  >
                    ▶
                  </button>
                </div>
              )}

              {/* Edit button */}
              {!isEditing && onEditMessage && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition-all opacity-70 group-hover:opacity-100 cursor-pointer"
                  title="Editar mensaje y bifurcar conversación"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Attachments if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {message.attachments.map((att) => (
                <div key={att.id} className="relative group">
                  {att.isImage ? (
                    <img
                      src={att.data}
                      alt={att.name}
                      className="w-24 h-24 object-cover rounded-xl border border-cyan-500/40 shadow-md"
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200">
                      <span className="material-symbols-outlined text-cyan-400">description</span>
                      <span className="truncate max-w-[120px] font-mono text-[11px]">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Content or Inline Editor */}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="w-full bg-[#0a0f18] border border-cyan-400/60 rounded-xl p-3 text-xs md:text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400 resize-none min-h-[80px]"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditDraft(message.content);
                    setIsEditing(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 transition-all cursor-pointer shadow-md"
                >
                  Guardar y Regenerar
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm md:text-[15px] text-slate-100 leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= ASSISTANT (Nexus Quen) =================
  const activeFocus = message.focusMode ? FOCUS_MODE_LABELS[message.focusMode] : null;

  return (
    <div className="w-full bg-[#171c25]/75 border border-cyan-500/25 rounded-2xl p-4 md:p-5 backdrop-blur-2xl relative holo-glow mb-5 transition-all print-message">
      {/* Header of Response */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center shadow-[0_0_8px_#4cd7f6]">
            <span className="material-symbols-outlined text-xs text-cyan-300" data-icon="neurology">
              neurology
            </span>
          </div>
          <span className="text-xs md:text-sm font-semibold text-cyan-300 tracking-wide">
            Nexus Quen
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-900 text-purple-300 text-[10px] font-mono border border-purple-500/30">
            NEXUS IA
          </span>

          {/* Focus Mode Indicator Badge */}
          {activeFocus && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${activeFocus.color}`}
            >
              <span className="material-symbols-outlined text-[11px]">{activeFocus.icon}</span>
              <span>{activeFocus.label}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Version Branching for Assistant */}
          {totalVersions > 1 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 print-hide">
              <button
                disabled={currentVersionIdx <= 0}
                onClick={() => onSwitchVersion && onSwitchVersion(message.id, currentVersionIdx - 1)}
                className="disabled:opacity-30 hover:text-cyan-200 transition-colors cursor-pointer"
                title="Versión previa"
              >
                ◀
              </button>
              <span>
                {currentVersionIdx + 1}/{totalVersions}
              </span>
              <button
                disabled={currentVersionIdx >= totalVersions - 1}
                onClick={() => onSwitchVersion && onSwitchVersion(message.id, currentVersionIdx + 1)}
                className="disabled:opacity-30 hover:text-cyan-200 transition-colors cursor-pointer"
                title="Versión posterior"
              >
                ▶
              </button>
            </div>
          )}

          {message.status === 'streaming' && (
            <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-mono print-hide">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Sintetizando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Generated Image Result Card */}
      {message.generatedImage && (
        <div className="mb-4 rounded-xl overflow-hidden border border-cyan-500/40 bg-black/60 p-2.5 shadow-xl">
          <div className="relative group cursor-pointer">
            <img
              src={message.generatedImage.url}
              alt={message.generatedImage.prompt}
              onClick={() =>
                onOpenImageModal &&
                onOpenImageModal(message.generatedImage!.url, message.generatedImage!.prompt)
              }
              className="w-full max-h-96 object-contain rounded-lg transition-transform duration-300 group-hover:scale-[1.01]"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 print-hide">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadImage(
                    message.generatedImage!.url,
                    message.generatedImage!.prompt
                  );
                }}
                className="px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg hover:bg-cyan-400 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>Descargar en Alta Calidad</span>
              </button>
            </div>
          </div>
          <div className="p-2 text-xs text-slate-300 flex items-center justify-between">
            <span className="italic truncate pr-2">"{message.generatedImage.prompt}"</span>
            <button
              onClick={() =>
                handleDownloadImage(
                  message.generatedImage!.url,
                  message.generatedImage!.prompt
                )
              }
              className="text-cyan-400 hover:text-cyan-300 text-xs font-medium flex items-center gap-1 flex-shrink-0 cursor-pointer print-hide"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Guardar</span>
            </button>
          </div>

          {/* Expandable Enhanced Prompt Section */}
          {message.generatedImage.enhancedPrompt && (
            <div className="mt-1 pt-2 border-t border-cyan-500/20 px-1">
              <button
                type="button"
                onClick={() => setShowEnhancedPrompt(!showEnhancedPrompt)}
                className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer print-hide"
              >
                <span className="material-symbols-outlined text-sm">
                  {showEnhancedPrompt ? 'expand_less' : 'auto_awesome'}
                </span>
                <span>
                  {showEnhancedPrompt ? 'Ocultar prompt optimizado' : 'Ver prompt optimizado por Nexus Quen'}
                </span>
                {message.generatedImage.aspectRatio && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-[10px] text-cyan-300">
                    Formato {message.generatedImage.aspectRatio}
                  </span>
                )}
              </button>
              {showEnhancedPrompt && (
                <div className="mt-2 p-2.5 rounded-lg bg-[#070b14]/90 border border-cyan-500/20 text-xs text-slate-300 font-sans leading-relaxed">
                  <p className="whitespace-pre-wrap text-slate-200">{message.generatedImage.enhancedPrompt}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 font-mono print-hide">
                    <span>Aspect Ratio: {message.generatedImage.aspectRatio || '1:1'}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(message.generatedImage?.enhancedPrompt || '')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-xs">content_copy</span>
                      <span>Copiar prompt optimizado</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Live Web Grounding (Google Search Sources) */}
      {message.sources && message.sources.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-[#0d121c]/90 border border-cyan-500/30 shadow-md">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-cyan-300 text-xs font-semibold">
              <span className="material-symbols-outlined text-base text-cyan-400">language</span>
              <span>Fuentes Web en Vivo Verificadas</span>
              <span className="px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-500/40 text-[10px] font-mono text-cyan-400">
                {message.sources.length}
              </span>
            </div>
            {message.sources.length > 3 && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors print-hide cursor-pointer"
              >
                {showAllSources ? 'Mostrar menos' : `Ver todas (${message.sources.length})`}
              </button>
            )}
          </div>

          {/* Search Queries Chips */}
          {message.searchQueries && message.searchQueries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {message.searchQueries.map((q, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700/80 text-[10px] font-mono text-slate-300 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[10px] text-cyan-400">search</span>
                  <span>{q}</span>
                </span>
              ))}
            </div>
          )}

          {/* Sources Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {(showAllSources ? message.sources : message.sources.slice(0, 3)).map((source, idx) => {
              let domain = '';
              try {
                domain = new URL(source.url).hostname.replace('www.', '');
              } catch {
                domain = 'web';
              }

              return (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-[#141a27] hover:bg-[#1a2336] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between group"
                  title={source.title}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 truncate mb-1">
                    <span className="material-symbols-outlined text-xs">public</span>
                    <span className="truncate">{domain}</span>
                  </div>
                  <div className="text-xs text-slate-200 line-clamp-2 font-medium leading-snug group-hover:text-cyan-300 transition-colors">
                    {source.title || domain}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Text Body */}
      <div className="text-sm md:text-[15px] text-slate-200 leading-relaxed font-sans">
        {renderFormattedContent(message.content)}
      </div>

      {/* Error notification if message failed */}
      {message.status === 'error' && (
        <div className="mt-3 p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400">error</span>
            <span>{message.error || 'Ocurrió un error al procesar la respuesta.'}</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {/* Response Actions Bar */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-cyan-500/15 print-hide">
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={handleCopyMessage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition-all text-xs cursor-pointer"
            title="Copiar texto"
          >
            <span className="material-symbols-outlined text-sm">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>

          {(onRegenerateResponse || onRetry) && (
            <button
              onClick={() => {
                if (onRegenerateResponse) onRegenerateResponse(message.id);
                else if (onRetry) onRetry();
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition-all text-xs cursor-pointer"
              title="Regenerar respuesta y agregar a historial de ramificación"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>Regenerar</span>
            </button>
          )}

          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 transition-all text-xs cursor-pointer"
            title="Compartir"
          >
            <span className="material-symbols-outlined text-sm">share</span>
            <span>Compartir</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <button
            onClick={() => setLiked(liked === true ? null : true)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              liked === true ? 'text-cyan-400 bg-cyan-950/40' : 'hover:text-cyan-300'
            }`}
            title="Buena respuesta"
          >
            <span className="material-symbols-outlined text-base">thumb_up</span>
          </button>
          <button
            onClick={() => setLiked(liked === false ? null : false)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              liked === false ? 'text-red-400 bg-red-950/40' : 'hover:text-red-400'
            }`}
            title="Mala respuesta"
          >
            <span className="material-symbols-outlined text-base">thumb_down</span>
          </button>
        </div>
      </div>
    </div>
  );
};
