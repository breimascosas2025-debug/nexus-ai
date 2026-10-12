import React, { useState } from 'react';
import { ChatThread } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  thread: ChatThread | null;
  userName?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  thread,
  userName,
}) => {
  const [downloadingMd, setDownloadingMd] = useState(false);

  if (!isOpen || !thread) return null;

  const handleExportMarkdown = () => {
    setDownloadingMd(true);

    const formattedDate = new Date(thread.createdAt).toLocaleString();
    const userDisplayName = userName || 'Usuario';

    let md = `---
title: "${thread.title.replace(/"/g, '\\"')}"
date: "${formattedDate}"
platform: "Nexus AI"
core_assistant: "Nexus Quen"
creator: "Breitan Céspedes Monge"
focus_mode: "${thread.focusMode || 'fast'}"
total_messages: ${thread.messages.length}
---

# ${thread.title}
*Conversación oficial generada en Nexus AI con el núcleo cuántico Nexus Quen.*  
**Fecha:** ${formattedDate}  
**Participante:** ${userDisplayName}  
**Asistente:** Nexus Quen (Creado por Breitan Céspedes Monge)  

---

`;

    for (const msg of thread.messages) {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();

      if (msg.role === 'user') {
        md += `### 👤 ${userDisplayName} (${timeStr})\n\n`;
        md += `${msg.content}\n\n`;

        if (msg.attachments && msg.attachments.length > 0) {
          md += `*Archivos adjuntos:*\n`;
          for (const att of msg.attachments) {
            md += `- 📎 \`${att.name}\` (${att.type})\n`;
          }
          md += `\n`;
        }
      } else {
        md += `### 🤖 Nexus Quen (${timeStr})\n\n`;
        md += `${msg.content}\n\n`;

        if (msg.sources && msg.sources.length > 0) {
          md += `#### 🌐 Fuentes Web Verificadas:\n`;
          for (const src of msg.sources) {
            md += `- [${src.title}](${src.url})\n`;
          }
          md += `\n`;
        }

        if (msg.generatedImage) {
          md += `#### 🎨 Imagen Generada por Nexus Quen:\n`;
          md += `*Prompt:* "${msg.generatedImage.prompt}"\n\n`;
          if (msg.generatedImage.enhancedPrompt) {
            md += `*Prompt Optimizado:* "${msg.generatedImage.enhancedPrompt}"\n\n`;
          }
          md += `*Formato:* ${msg.generatedImage.aspectRatio || '1:1'}\n\n`;
        }
      }

      md += `---\n\n`;
    }

    md += `\n*Documento exportado desde Nexus AI. Nexus Quen ha sido creado y diseñado por Breitan Céspedes Monge.*`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = thread.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 30);
    link.href = url;
    link.download = `nexus_chat_${safeTitle}_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setTimeout(() => {
      setDownloadingMd(false);
      onClose();
    }, 800);
  };

  const handleExportPdf = () => {
    // Print triggers print styles defined in index.css
    window.print();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in print-hide">
      <div className="w-full max-w-lg bg-[#0e131d] border border-cyan-500/30 rounded-3xl p-5 md:p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-cyan-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-400/40 text-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <span className="material-symbols-outlined text-2xl">ios_share</span>
            </div>
            <div>
              <h3 className="text-sm md:text-base font-bold text-slate-100">
                Exportación Profesional
              </h3>
              <p className="text-xs text-slate-400">
                Descarga o imprime esta conversación en formatos estándar
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Thread Snapshot Info */}
        <div className="my-4 p-3.5 rounded-2xl bg-[#141a26] border border-slate-800 text-xs text-slate-300 space-y-1">
          <div className="flex items-center justify-between font-medium">
            <span className="text-white truncate max-w-[280px]">{thread.title}</span>
            <span className="text-cyan-400 font-mono text-[11px]">
              {thread.messages.length} mensajes
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Creado: {new Date(thread.createdAt).toLocaleDateString()} • Asistente: Nexus Quen
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-3">
          {/* PDF Option */}
          <div
            onClick={handleExportPdf}
            className="group p-4 rounded-2xl bg-[#131926] hover:bg-[#1a2336] border border-cyan-500/20 hover:border-cyan-400/60 transition-all cursor-pointer flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-500/30 text-red-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
              </div>
              <div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  Documento PDF Imprimible
                </h4>
                <p className="text-[11px] text-slate-400">
                  Formato ejecutivo con membrete oficial Nexus AI y bloques de código listos para imprimir o guardar como PDF
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-500 group-hover:text-cyan-400 transition-colors">
              arrow_forward
            </span>
          </div>

          {/* Markdown Option */}
          <div
            onClick={handleExportMarkdown}
            className="group p-4 rounded-2xl bg-[#131926] hover:bg-[#1a2336] border border-cyan-500/20 hover:border-purple-400/60 transition-all cursor-pointer flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">markdown</span>
              </div>
              <div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-purple-300 transition-colors">
                  Archivo Markdown (.md)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Incluye encabezado YAML, metadatos, citas web, formato de código y trazabilidad completa
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-500 group-hover:text-purple-400 transition-colors">
              {downloadingMd ? 'hourglass_top' : 'download'}
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-5 pt-3 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500 font-mono">
            Nexus AI • Creador de Nexus Quen: Breitan Céspedes Monge
          </p>
        </div>
      </div>
    </div>
  );
};
