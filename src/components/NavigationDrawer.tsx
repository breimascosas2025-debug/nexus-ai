import React, { useState } from 'react';
import { ChatThread } from '../types';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  threads: ChatThread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: (isTemporal?: boolean) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  isTemporalMode: boolean;
  onToggleTemporalMode: (enableTemporal: boolean) => void;
  onOpenKeysModal: () => void;
  onClearAllData: () => void;
  userName?: string;
  onOpenChangeName?: () => void;
  fastestLatency?: number | null;
  onOpenGallery?: () => void;
  onOpenExport?: () => void;
  galleryCount?: number;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onRenameThread,
  isTemporalMode,
  onToggleTemporalMode,
  onOpenKeysModal,
  onClearAllData,
  userName,
  onOpenChangeName,
  fastestLatency,
  onOpenGallery,
  onOpenExport,
  galleryCount = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartRename = (thread: ChatThread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditTitle(thread.title);
  };

  const handleSaveRename = (threadId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim()) {
      onRenameThread(threadId, editTitle.trim());
    }
    setEditingThreadId(null);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-[#070b14]/80 backdrop-blur-md z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col p-4 w-80 md:w-88 bg-[#0f131d]/95 backdrop-blur-2xl border-r border-cyan-500/20 shadow-2xl shadow-black transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full border border-cyan-400/40 bg-cyan-950/40 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
              <span className="material-symbols-outlined text-2xl" data-icon="neurology">
                neurology
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-cyan-300 text-sm tracking-wide truncate max-w-[140px]">
                  {userName || 'Usuario'}
                </h3>
                {onOpenChangeName && (
                  <button
                    onClick={onOpenChangeName}
                    className="text-slate-400 hover:text-cyan-300 p-0.5 rounded transition-colors"
                    title="Cambiar mi nombre"
                  >
                    <span className="material-symbols-outlined text-xs">edit</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-purple-300/80">NEXUS IA</p>
            </div>
          </div>
          <button
            className="p-1.5 text-slate-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-slate-800/60"
            onClick={onClose}
            title="Cerrar panel"
          >
            <span className="material-symbols-outlined text-xl" data-icon="close">
              close
            </span>
          </button>
        </div>

        {/* Telemetry pill */}
        <div className="py-2.5 flex items-center justify-between border-b border-slate-800">
          <span className="text-[11px] font-mono tracking-wider text-cyan-400/90 uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {fastestLatency ? `Auto-Velocidad • ${fastestLatency}ms` : 'Sinapsis Activa • v4.5'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            Nexus Quen
          </span>
        </div>

        {/* Mode Toggle (Chat Normal vs Chat Temporal) */}
        <div className="mt-3 p-2 bg-[#171c25]/90 rounded-xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
            Modo de Conversación
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onToggleTemporalMode(false)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                !isTemporalMode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-sm" data-icon="history">
                history
              </span>
              <span>Normal</span>
            </button>
            <button
              onClick={() => onToggleTemporalMode(true)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                isTemporalMode
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-sm" data-icon="timer">
                timer
              </span>
              <span>Temporal</span>
            </button>
          </div>
          {isTemporalMode && (
            <p className="text-[11px] text-purple-300/80 mt-2 px-1 leading-tight">
              ⚠️ Las conversaciones en modo temporal no se registran en el historial y se eliminan al salir.
            </p>
          )}
        </div>

        {/* Action: New Chat & Tools buttons */}
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => {
                onNewThread(isTemporalMode);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 text-cyan-200 border border-cyan-500/30 rounded-xl py-2 px-3 text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base" data-icon="add">
                add
              </span>
              <span>Nuevo Chat</span>
            </button>

            <button
              onClick={onOpenKeysModal}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-300 border border-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer"
              title="Gestor de Seguridad & APIs"
            >
              <span className="material-symbols-outlined text-base text-cyan-400" data-icon="lock">
                lock
              </span>
              <span>APIs</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {onOpenGallery && (
              <button
                onClick={() => {
                  onOpenGallery();
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/40 rounded-xl text-xs font-medium transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">photo_library</span>
                <span>Galería</span>
                {galleryCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-500 text-slate-950 font-bold text-[9px] font-mono">
                    {galleryCount}
                  </span>
                )}
              </button>
            )}

            {onOpenExport && (
              <button
                onClick={() => {
                  onOpenExport();
                  onClose();
                }}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-500/20 hover:border-purple-500/40 rounded-xl text-xs font-medium transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">ios_share</span>
                <span>Exportar</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Input for Threads */}
        <div className="mt-3 relative">
          <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-500 text-sm">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar conversaciones..."
            className="w-full bg-[#171c25]/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Thread History list */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 mt-3 pr-1">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">
            Historial de Chats ({threads.length})
          </div>

          {filteredThreads.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No hay conversaciones en el historial.
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = thread.id === editingThreadId;

              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    onSelectThread(thread.id);
                    onClose();
                  }}
                  className={`group relative flex items-center justify-between p-2 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`material-symbols-outlined text-sm ${
                        isActive ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                      data-icon="chat_bubble_outline"
                    >
                      chat_bubble_outline
                    </span>

                    {isEditing ? (
                      <form
                        onSubmit={(e) => handleSaveRename(thread.id, e)}
                        className="flex-1 flex gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                          autoFocus
                        />
                        <button type="submit" className="text-cyan-400 hover:text-cyan-300 px-1">
                          <span className="material-symbols-outlined text-sm">check</span>
                        </button>
                      </form>
                    ) : (
                      <span className="truncate flex-1 font-medium">{thread.title}</span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleStartRename(thread, e)}
                        className="p-1 hover:text-cyan-400 text-slate-400 rounded transition-colors"
                        title="Cambiar título"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteThread(thread.id);
                        }}
                        className="p-1 hover:text-red-400 text-slate-400 rounded transition-colors"
                        title="Eliminar conversación"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Storage & Creator */}
        <div className="mt-auto pt-3 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs px-1 text-slate-400">
            <span>Almacenamiento Local</span>
            <button
              onClick={() => setConfirmClearOpen(true)}
              className="text-red-400/80 hover:text-red-400 text-[11px] underline transition-colors"
            >
              Borrar historial
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">NEXUS IA Core</span>
              <span className="text-cyan-400 font-mono">v4.5-cinematic</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Modelo soberano <strong className="text-slate-400">Nexus Quen</strong>.
            </div>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal to Clear Data */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#171c25] border border-red-500/40 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-2.5 text-red-400 mb-3">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h4 className="font-semibold text-sm">¿Borrar todo el historial?</h4>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Esta acción eliminará de forma irreversible todas las conversaciones, adjuntos locales y
              caché en este dispositivo.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onClearAllData();
                  setConfirmClearOpen(false);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
              >
                Sí, borrar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
