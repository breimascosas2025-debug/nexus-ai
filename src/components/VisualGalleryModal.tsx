import React, { useState, useMemo } from 'react';
import { GalleryImage } from '../types';

interface VisualGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: GalleryImage[];
  onDeleteImage: (id: string) => void;
  onSelectThread?: (threadId: string) => void;
  onTriggerNewImage?: () => void;
}

export const VisualGalleryModal: React.FC<VisualGalleryModalProps> = ({
  isOpen,
  onClose,
  images,
  onDeleteImage,
  onSelectThread,
  onTriggerNewImage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRatio, setSelectedRatio] = useState<string>('all');
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  const filteredImages = useMemo(() => {
    return images.filter((img) => {
      const matchSearch =
        img.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (img.enhancedPrompt && img.enhancedPrompt.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchRatio =
        selectedRatio === 'all' ||
        (img.aspectRatio && img.aspectRatio.includes(selectedRatio));

      return matchSearch && matchRatio;
    });
  }, [images, searchQuery, selectedRatio]);

  const handleDownload = (img: GalleryImage) => {
    const link = document.createElement('a');
    link.href = img.url;
    link.download = `nexus_quen_image_${img.id || Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPromptText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0b0f17] border border-cyan-500/30 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(6,182,212,0.2)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-cyan-500/20 bg-[#121723]/90 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-500 flex items-center justify-center text-slate-950 font-bold shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <span className="material-symbols-outlined text-2xl" data-icon="photo_library">
                photo_library
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-bold text-slate-100">
                  Galería Visual de Nexus Quen
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  {images.length} {images.length === 1 ? 'creación' : 'creaciones'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Colección de síntesis holográfica e imágenes generadas con prompts optimizados
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar galería"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-3 md:p-4 bg-[#10141f] border-b border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500 text-sm">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por descripción o palabras clave..."
              className="w-full bg-[#181e2b] border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Aspect Ratio Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar">
            {[
              { id: 'all', label: 'Todas' },
              { id: '16:9', label: 'Horizontal (16:9)' },
              { id: '1:1', label: 'Cuadrada (1:1)' },
              { id: '9:16', label: 'Vertical (9:16)' },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setSelectedRatio(filter.id)}
                className={`px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  selectedRatio === filter.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar">
          {filteredImages.length === 0 ? (
            <div className="text-center py-20 flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4">
                <span className="material-symbols-outlined text-3xl">image_not_supported</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">
                {images.length === 0
                  ? 'Aún no has generado ninguna imagen'
                  : 'No hay imágenes que coincidan con la búsqueda'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                {images.length === 0
                  ? 'Pide a Nexus Quen "Hazme una imagen de..." en el chat para crear obras visuales con optimización automática.'
                  : 'Prueba cambiando los filtros de formato o el término de búsqueda.'}
              </p>
              {images.length === 0 && onTriggerNewImage && (
                <button
                  onClick={() => {
                    onClose();
                    onTriggerNewImage();
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-slate-950 text-xs font-bold shadow-lg hover:shadow-cyan-500/30 transition-all cursor-pointer"
                >
                  Crear mi primera imagen
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredImages.map((img) => (
                <div
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className="group relative rounded-2xl overflow-hidden bg-[#141924] border border-cyan-500/20 hover:border-cyan-400/60 transition-all duration-300 shadow-lg hover:shadow-[0_8px_30px_rgba(6,182,212,0.25)] flex flex-col cursor-pointer"
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video w-full bg-black/60 overflow-hidden flex items-center justify-center">
                    <img
                      src={img.url}
                      alt={img.prompt}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Format Pill Overlay */}
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300">
                      {img.aspectRatio || '1:1'}
                    </div>

                    {/* Hover Action Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 justify-between">
                      <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        <span>Ver detalle</span>
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(img);
                        }}
                        className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-md"
                        title="Descargar imagen"
                      >
                        <span className="material-symbols-outlined text-sm">download</span>
                      </button>
                    </div>
                  </div>

                  {/* Meta Details */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-slate-200 line-clamp-2 leading-snug italic mb-2">
                      "{img.prompt}"
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 pt-2 font-mono">
                      <span>{new Date(img.timestamp).toLocaleDateString()}</span>
                      <span className="text-cyan-400/80">Nexus Quen</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Detail Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 md:p-6 bg-black/95 backdrop-blur-2xl animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] flex flex-col md:flex-row bg-[#0f141f] border border-cyan-500/40 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Image View */}
            <div className="md:w-3/5 bg-black/90 flex items-center justify-center p-4 relative min-h-[300px]">
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-xl shadow-2xl"
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-cyan-500/30 text-xs font-mono text-cyan-300">
                Formato {selectedImage.aspectRatio || '1:1'}
              </div>
            </div>

            {/* Right Details Pod */}
            <div className="md:w-2/5 p-5 md:p-6 flex flex-col justify-between border-t md:border-t-0 md:border-l border-cyan-500/20 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-400">auto_awesome</span>
                    <span className="text-xs font-mono font-semibold text-cyan-300 uppercase">
                      Detalle de Síntesis
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {/* Prompt Original */}
                <div className="mt-4">
                  <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider block mb-1">
                    Prompt del Usuario
                  </span>
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans">
                    "{selectedImage.prompt}"
                  </div>
                </div>

                {/* Enhanced Prompt */}
                {selectedImage.enhancedPrompt && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowEnhanced(!showEnhanced)}
                      className="flex items-center justify-between w-full text-[11px] font-mono text-cyan-400 hover:text-cyan-300 py-1"
                    >
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">
                          {showEnhanced ? 'expand_less' : 'expand_more'}
                        </span>
                        <span>Prompt Optimizado por Nexus Quen</span>
                      </span>
                      <span className="text-[10px] text-slate-500">IA Enhanced</span>
                    </button>

                    {showEnhanced && (
                      <div className="mt-1 p-3 rounded-xl bg-[#080d17] border border-cyan-500/30 text-xs text-slate-300 leading-relaxed">
                        <p>{selectedImage.enhancedPrompt}</p>
                        <button
                          onClick={() => handleCopyPromptText(selectedImage.enhancedPrompt!)}
                          className="mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">content_copy</span>
                          <span>{copiedPrompt ? 'Copiado al portapapeles' : 'Copiar prompt optimizado'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 text-[11px] text-slate-500 font-mono space-y-1">
                  <div>Fecha: {new Date(selectedImage.timestamp).toLocaleString()}</div>
                  <div>Generador: Nexus Quen Vision Synthesizer</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>Descargar Imagen en Alta Calidad</span>
                </button>

                <div className="flex gap-2">
                  {selectedImage.threadId && onSelectThread && (
                    <button
                      onClick={() => {
                        onSelectThread(selectedImage.threadId!);
                        setSelectedImage(null);
                        onClose();
                      }}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">chat</span>
                      <span>Ir al Chat</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm('¿Eliminar esta imagen de la galería?')) {
                        onDeleteImage(selectedImage.id);
                        setSelectedImage(null);
                      }
                    }}
                    className="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/30 text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    title="Eliminar de la galería"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
