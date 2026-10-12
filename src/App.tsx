import React, { useState, useEffect, useRef } from 'react';
import { ChatThread, Message, Attachment, FocusMode, GalleryImage } from './types';
import {
  loadStoredThreads,
  saveStoredThreads,
  createNewThread,
  getActiveThreadId,
  setActiveThreadId,
  clearAllPersistentData,
  saveMediaBlob,
  getUserName,
  setUserName,
  getInitialGreeting,
  getStoredFocusMode,
  setStoredFocusMode,
  getStoredGallery,
  saveGalleryImage,
  deleteGalleryImage,
} from './services/storage';
import { ThreeOrb } from './components/ThreeOrb';
import { TopAppBar } from './components/TopAppBar';
import { NavigationDrawer } from './components/NavigationDrawer';
import { Omnibar } from './components/Omnibar';
import { ChatMessage } from './components/ChatMessage';
import { KeyManagerModal } from './components/KeyManagerModal';
import { WelcomeOnboardingModal } from './components/WelcomeOnboardingModal';
import { VisualGalleryModal } from './components/VisualGalleryModal';
import { ExportModal } from './components/ExportModal';
import InstallBanner from './components/InstallBanner';

export default function App() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string>('');
  const [temporalThread, setTemporalThread] = useState<ChatThread | null>(null);
  const [isTemporalMode, setIsTemporalMode] = useState(false);

  // User Profile
  const [userName, setUserNameState] = useState<string>(() => getUserName());
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(false);
  const [fastestLatency, setFastestLatency] = useState<number | null>(null);

  // Focus Mode (Modos de Pensamiento de Nexus Quen)
  const [focusMode, setFocusModeState] = useState<FocusMode>(() => getStoredFocusMode());

  // Live Web Grounding Toggle
  const [isWebSearchActive, setIsWebSearchActive] = useState<boolean>(false);

  // Visual Gallery State
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(() => getStoredGallery());
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Professional Export State
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Modals & Navigation
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isKeysModalOpen, setIsKeysModalOpen] = useState(false);

  // Hologram and Generation states
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<'idle' | 'thinking' | 'generating' | 'error'>('idle');
  const [statusText, setStatusText] = useState('Nexus Quen en reposo');

  // Image preview modal (lightbox within chat)
  const [previewImage, setPreviewImage] = useState<{ url: string; prompt: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initialize threads and sync gallery on mount
  useEffect(() => {
    const currentName = getUserName();
    const stored = loadStoredThreads(currentName);
    if (stored.length > 0) {
      setThreads(stored);
      const savedActiveId = getActiveThreadId();
      const validActive = stored.find((t) => t.id === savedActiveId);
      if (validActive) {
        setActiveThreadIdState(validActive.id);
      } else {
        setActiveThreadIdState(stored[0].id);
        setActiveThreadId(stored[0].id);
      }

      // Sync any past images from threads into gallery
      for (const t of stored) {
        for (const m of t.messages) {
          if (m.generatedImage?.url) {
            saveGalleryImage({
              id: `img_${m.id}`,
              url: m.generatedImage.url,
              prompt: m.generatedImage.prompt,
              enhancedPrompt: m.generatedImage.enhancedPrompt,
              aspectRatio: m.generatedImage.aspectRatio,
              timestamp: m.timestamp,
              threadId: t.id,
              threadTitle: t.title,
            });
          }
        }
      }
      setGalleryImages(getStoredGallery());
    } else {
      // First turn: create an initial normal thread with automatic greeting
      const init = createNewThread(false, currentName);
      setThreads([init]);
      saveStoredThreads([init]);
      setActiveThreadIdState(init.id);
      setActiveThreadId(init.id);
    }

    // Fetch initial provider status & fastest latency benchmark
    fetch('/api/providers/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.providers)) {
          const active = data.providers.filter(
            (p: { configured: boolean; latencyMs?: number }) => p.configured && p.latencyMs
          );
          if (active.length > 0) {
            const minLat = Math.min(...active.map((p: { latencyMs: number }) => p.latencyMs));
            setFastestLatency(minLat);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectFocusMode = (mode: FocusMode) => {
    setFocusModeState(mode);
    setStoredFocusMode(mode);
  };

  const handleWelcomeComplete = (newName: string) => {
    setUserNameState(newName);
    setUserName(newName);
    setIsWelcomeModalOpen(false);

    // Personalize initial message in threads
    const newGreeting = getInitialGreeting(newName);
    setThreads((prev) => {
      const updated = prev.map((t) => {
        if (t.messages.length === 1 && t.messages[0].role === 'assistant') {
          return {
            ...t,
            messages: [
              {
                ...t.messages[0],
                content: newGreeting,
              },
            ],
          };
        }
        return t;
      });
      saveStoredThreads(updated);
      return updated;
    });
  };

  // Sync threads to storage whenever modified (only non-temporal)
  useEffect(() => {
    if (threads.length > 0 && !isTemporalMode) {
      saveStoredThreads(threads);
    }
  }, [threads, isTemporalMode]);

  // Current active thread
  const currentThread: ChatThread | undefined = isTemporalMode
    ? temporalThread || undefined
    : threads.find((t) => t.id === activeThreadId);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [currentThread?.messages, isProcessing]);

  // Handlers for switching and creating threads
  const handleSelectThread = (threadId: string) => {
    setIsTemporalMode(false);
    setActiveThreadIdState(threadId);
    setActiveThreadId(threadId);
  };

  const handleNewThread = (temporal = false) => {
    if (temporal) {
      const newTemp = createNewThread(true, userName);
      setTemporalThread(newTemp);
      setIsTemporalMode(true);
    } else {
      const newT = createNewThread(false, userName);
      setThreads((prev) => [newT, ...prev]);
      setActiveThreadIdState(newT.id);
      setActiveThreadId(newT.id);
      setIsTemporalMode(false);
    }
  };

  const handleDeleteThread = (threadId: string) => {
    const updated = threads.filter((t) => t.id !== threadId);
    setThreads(updated);
    saveStoredThreads(updated);

    if (activeThreadId === threadId) {
      if (updated.length > 0) {
        setActiveThreadIdState(updated[0].id);
        setActiveThreadId(updated[0].id);
      } else {
        const fresh = createNewThread(false, userName);
        setThreads([fresh]);
        saveStoredThreads([fresh]);
        setActiveThreadIdState(fresh.id);
        setActiveThreadId(fresh.id);
      }
    }
  };

  const handleRenameThread = (threadId: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle, updatedAt: Date.now() } : t))
    );
  };

  const handleToggleTemporalMode = (enableTemporal: boolean) => {
    if (enableTemporal && !isTemporalMode) {
      const newTemp = createNewThread(true, userName);
      setTemporalThread(newTemp);
      setIsTemporalMode(true);
    } else if (!enableTemporal && isTemporalMode) {
      setTemporalThread(null);
      setIsTemporalMode(false);
    }
  };

  const handleClearAllData = () => {
    clearAllPersistentData();
    setUserNameState('');
    const fresh = createNewThread(false, '');
    setThreads([fresh]);
    setActiveThreadIdState(fresh.id);
    setTemporalThread(null);
    setIsTemporalMode(false);
    setGalleryImages([]);
    setIsWelcomeModalOpen(true);
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProcessStatus('idle');
    setStatusText('Generación cancelada por el usuario.');
    setTimeout(() => setStatusText('Nexus Quen en reposo'), 2500);
  };

  const handleDeleteGalleryImage = (id: string) => {
    deleteGalleryImage(id);
    setGalleryImages((prev) => prev.filter((item) => item.id !== id));
  };

  // Check if prompt intends to generate an image
  const isImageGenerationPrompt = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    if (
      lower.startsWith('hazme una imagen') ||
      lower.startsWith('haz una imagen') ||
      lower.startsWith('crea una imagen') ||
      lower.startsWith('crear imagen') ||
      lower.startsWith('crear una imagen') ||
      lower.startsWith('genera una imagen') ||
      lower.startsWith('generar imagen') ||
      lower.startsWith('generar una imagen') ||
      lower.startsWith('diseña una imagen') ||
      lower.startsWith('diseñar una imagen') ||
      lower.startsWith('diseña imagen') ||
      lower.startsWith('dibuja') ||
      lower.startsWith('dibújame') ||
      lower.startsWith('dibujar') ||
      lower.startsWith('píntame') ||
      lower.startsWith('pinta') ||
      lower.startsWith('crea un fondo') ||
      lower.startsWith('crea una ilustración') ||
      lower.startsWith('genera una ilustración')
    ) {
      return true;
    }

    const actionPattern = /\b(hazme|haz|crea|crear|genera|generar|diseña|diseñar|dibuja|dibújame|pinta|píntame|quiero|dame|renderiza|sintetiza)\b.*\b(imagen|foto|fotografía|ilustración|dibujo|wallpaper|fondo|gráfico|póster)\b/i;
    return actionPattern.test(lower);
  };

  // Send message and execute AI inference
  const handleSendMessage = async (
    content: string,
    attachments: Attachment[] = [],
    webSearchOverride?: boolean
  ) => {
    if (!currentThread) return;

    const useWebSearch = webSearchOverride !== undefined ? webSearchOverride : isWebSearchActive;
    const isImageRequest = isImageGenerationPrompt(content);

    const userMessage: Message = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'complete',
      attachments,
      focusMode,
      versions: [
        {
          id: `v_init_${Date.now()}`,
          content,
          timestamp: Date.now(),
          attachments,
        },
      ],
      currentVersionIndex: 0,
    };

    // Save heavy attachments to IndexedDB asynchronously
    for (const att of attachments) {
      if (att.data) {
        saveMediaBlob(att.id, att.data);
      }
    }

    // Auto-update thread title if this is the first user message
    const hasPriorUserMsg = currentThread.messages.some((m) => m.role === 'user');
    let threadTitle = currentThread.title;
    if (!hasPriorUserMsg && content.trim()) {
      threadTitle = content.length > 32 ? `${content.substring(0, 30)}...` : content;
    }

    const assistantMsgId = `asst_${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: isImageRequest ? 'Preparando tu imagen… Sintetizando visualmente con Nexus Quen.' : '',
      timestamp: Date.now(),
      status: 'streaming',
      providerName: 'Nexus Quen',
      focusMode,
    };

    const updatedMessages = [...currentThread.messages, userMessage, initialAssistantMsg];

    // Update state immediately
    if (isTemporalMode) {
      setTemporalThread((prev) =>
        prev
          ? {
              ...prev,
              title: threadTitle,
              updatedAt: Date.now(),
              messages: updatedMessages,
            }
          : null
      );
    } else {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentThread.id
            ? {
                ...t,
                title: threadTitle,
                updatedAt: Date.now(),
                messages: updatedMessages,
              }
            : t
        )
      );
    }

    // Set processing state for the 3D Orbit & status bar
    setIsProcessing(true);
    setProcessStatus(isImageRequest ? 'generating' : 'thinking');
    setStatusText(
      isImageRequest
        ? 'Preparando tu imagen…'
        : useWebSearch
          ? 'Buscando en la web en vivo con Nexus Quen...'
          : 'Nexus Quen está procesando...'
    );

    // Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // PATH 1: Real Image Generation with Automatic Prompt Enhancement
    if (isImageRequest) {
      try {
        setStatusText('Sintetizando imagen con Nexus Quen...');
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: content }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'No se pudo generar la imagen con el proveedor actual.');
        }

        // Save generated image blob in IndexedDB
        await saveMediaBlob(`img_${Date.now()}`, data.imageUrl);

        // Add to persistent gallery
        const galleryItem: GalleryImage = {
          id: `img_${Date.now()}`,
          url: data.imageUrl,
          prompt: content,
          enhancedPrompt: data.enhancedPrompt,
          aspectRatio: data.aspectRatio,
          timestamp: Date.now(),
          threadId: currentThread.id,
          threadTitle: currentThread.title,
        };
        saveGalleryImage(galleryItem);
        setGalleryImages((prev) => [galleryItem, ...prev]);

        const finalContent = `He generado la imagen solicitada para ti con Nexus Quen:\n\n*«${content}»*`;

        updateAssistantMessage(currentThread.id, assistantMsgId, {
          content: finalContent,
          status: 'complete',
          generatedImage: {
            url: data.imageUrl,
            prompt: content,
            enhancedPrompt: data.enhancedPrompt,
            aspectRatio: data.aspectRatio,
          },
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const message = err instanceof Error ? err.message : 'Error al generar la imagen.';
        updateAssistantMessage(currentThread.id, assistantMsgId, {
          content: `No fue posible completar la creación de la imagen en este momento. ${message}`,
          status: 'error',
          error: message,
        });
      } finally {
        setIsProcessing(false);
        setProcessStatus('idle');
        setStatusText('Nexus Quen en reposo');
        abortControllerRef.current = null;
      }
      return;
    }

    // PATH 2: Normal / Multimodal Chat via Server-Sent Events (SSE)
    try {
      const historyPayload = currentThread.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      historyPayload.push({ role: 'user', content });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyPayload,
          attachments: attachments.map((a) => ({
            name: a.name,
            type: a.type,
            size: a.size,
            data: a.data,
          })),
          userName,
          focusMode,
          webSearch: useWebSearch,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error en el servidor NEXUS IA (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let detectedProvider = 'Nexus Quen';
      let foundSources: Array<{ title: string; url: string }> = [];
      let foundQueries: string[] = [];

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const lines = evt.split('\n');
          let eventType = 'message';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.replace('event: ', '').trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.replace('data: ', '').trim();
            }
          }

          if (eventData) {
            try {
              const parsed = JSON.parse(eventData);
              if (eventType === 'token' && parsed.text) {
                accumulatedText += parsed.text;
                updateAssistantMessage(currentThread.id, assistantMsgId, {
                  content: accumulatedText,
                  status: 'streaming',
                  providerName: detectedProvider,
                  sources: foundSources,
                  searchQueries: foundQueries,
                });
              } else if (eventType === 'grounding' && parsed) {
                foundSources = parsed.sources || [];
                foundQueries = parsed.searchQueries || [];
                updateAssistantMessage(currentThread.id, assistantMsgId, {
                  sources: foundSources,
                  searchQueries: foundQueries,
                });
              } else if (eventType === 'provider' && parsed.name) {
                detectedProvider = parsed.name;
              } else if (eventType === 'telemetry' && parsed.latencyMs) {
                setFastestLatency(parsed.latencyMs);
              } else if (eventType === 'error') {
                throw new Error(parsed.message || 'Error durante la síntesis.');
              }
            } catch {
              // Ignore non-json or chunk boundaries
            }
          }
        }
      }

      updateAssistantMessage(currentThread.id, assistantMsgId, {
        content: accumulatedText,
        status: 'complete',
        providerName: detectedProvider,
        sources: foundSources,
        searchQueries: foundQueries,
        focusMode,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Error en la conexión con Nexus Quen.';
      updateAssistantMessage(currentThread.id, assistantMsgId, {
        content: `Lo siento, ocurrió un error al procesar tu solicitud: ${message}`,
        status: 'error',
        error: message,
      });
    } finally {
      setIsProcessing(false);
      setProcessStatus('idle');
      setStatusText('Nexus Quen en reposo');
      abortControllerRef.current = null;
    }
  };

  const updateAssistantMessage = (
    threadId: string,
    messageId: string,
    updates: Partial<Message>
  ) => {
    if (isTemporalMode) {
      setTemporalThread((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
        };
      });
    } else {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
              }
            : t
        )
      );
    }
  };

  // Branching: Handle user editing their message
  const handleEditUserMessage = (messageId: string, newContent: string) => {
    if (!currentThread) return;

    const msgIndex = currentThread.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const oldMsg = currentThread.messages[msgIndex];
    const prevVersions = oldMsg.versions || [
      {
        id: oldMsg.id,
        content: oldMsg.content,
        timestamp: oldMsg.timestamp,
        attachments: oldMsg.attachments,
      },
    ];

    const newVersion = {
      id: `v_${Date.now()}`,
      content: newContent,
      timestamp: Date.now(),
      attachments: oldMsg.attachments,
    };

    const updatedUserMsg: Message = {
      ...oldMsg,
      content: newContent,
      versions: [...prevVersions, newVersion],
      currentVersionIndex: prevVersions.length,
    };

    // Fork: truncate subsequent messages after this one
    const truncated = currentThread.messages.slice(0, msgIndex);
    const updatedMessages = [...truncated, updatedUserMsg];

    if (isTemporalMode) {
      setTemporalThread((prev) => (prev ? { ...prev, messages: updatedMessages } : null));
    } else {
      setThreads((prev) =>
        prev.map((t) => (t.id === currentThread.id ? { ...t, messages: updatedMessages } : t))
      );
    }

    // Automatically synthesize a new assistant response for this branch
    setTimeout(() => {
      handleSendMessage(newContent, oldMsg.attachments || []);
    }, 100);
  };

  // Branching: Switch versions (< 1 / N >)
  const handleSwitchVersion = (messageId: string, targetVersionIndex: number) => {
    if (!currentThread) return;

    const msg = currentThread.messages.find((m) => m.id === messageId);
    if (!msg || !msg.versions || !msg.versions[targetVersionIndex]) return;

    const targetVersion = msg.versions[targetVersionIndex];

    const updated = currentThread.messages.map((m) => {
      if (m.id === messageId) {
        return {
          ...m,
          content: targetVersion.content,
          currentVersionIndex: targetVersionIndex,
          sources: targetVersion.sources || m.sources,
          searchQueries: targetVersion.searchQueries || m.searchQueries,
          generatedImage: targetVersion.generatedImage || m.generatedImage,
        };
      }
      return m;
    });

    if (isTemporalMode) {
      setTemporalThread((prev) => (prev ? { ...prev, messages: updated } : null));
    } else {
      setThreads((prev) =>
        prev.map((t) => (t.id === currentThread.id ? { ...t, messages: updated } : t))
      );
    }
  };

  // Branching: Regenerate response for assistant message
  const handleRegenerateResponse = (assistantMessageId: string) => {
    if (!currentThread) return;

    const asstIndex = currentThread.messages.findIndex((m) => m.id === assistantMessageId);
    if (asstIndex <= 0) return;

    const userMsg = currentThread.messages[asstIndex - 1];
    if (userMsg.role !== 'user') return;

    const asstMsg = currentThread.messages[asstIndex];
    const prevVersions = asstMsg.versions || [
      {
        id: asstMsg.id,
        content: asstMsg.content,
        timestamp: asstMsg.timestamp,
        sources: asstMsg.sources,
        searchQueries: asstMsg.searchQueries,
        generatedImage: asstMsg.generatedImage,
        providerName: asstMsg.providerName,
      },
    ];

    // Truncate from the assistant turn and regenerate
    const truncated = currentThread.messages.slice(0, asstIndex);
    if (isTemporalMode) {
      setTemporalThread((prev) => (prev ? { ...prev, messages: truncated } : null));
    } else {
      setThreads((prev) =>
        prev.map((t) => (t.id === currentThread.id ? { ...t, messages: truncated } : t))
      );
    }

    setTimeout(() => {
      handleSendMessage(userMsg.content, userMsg.attachments || []);
    }, 100);
  };

  const handleRetryLastMessage = () => {
    if (!currentThread) return;
    const lastUserMsg = [...currentThread.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content, lastUserMsg.attachments || []);
    }
  };

  return (
    <div className="bg-[#0a0e17] text-[#dfe2f0] min-h-screen flex flex-col font-sans relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top App Bar with Drawer Toggle, Focus Mode Switcher & Tools */}
      <TopAppBar
        onToggleDrawer={() => setIsDrawerOpen(true)}
        onNewChat={() => handleNewThread(isTemporalMode)}
        onOpenKeysModal={() => setIsKeysModalOpen(true)}
        isTemporalMode={isTemporalMode}
        currentFocusMode={focusMode}
        onSelectFocusMode={handleSelectFocusMode}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        galleryCount={galleryImages.length}
      />

      {/* Navigation Drawer */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        isTemporalMode={isTemporalMode}
        onToggleTemporalMode={handleToggleTemporalMode}
        onOpenKeysModal={() => {
          setIsDrawerOpen(false);
          setIsKeysModalOpen(true);
        }}
        onClearAllData={handleClearAllData}
        userName={userName}
        onOpenChangeName={() => {
          setIsDrawerOpen(false);
          setIsWelcomeModalOpen(true);
        }}
        fastestLatency={fastestLatency}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        galleryCount={galleryImages.length}
      />

      {/* Key Manager Modal */}
      <KeyManagerModal
        isOpen={isKeysModalOpen}
        onClose={() => setIsKeysModalOpen(false)}
      />

      {/* Welcome & User Name Onboarding Modal */}
      <WelcomeOnboardingModal
        isOpen={isWelcomeModalOpen}
        onComplete={handleWelcomeComplete}
        onCancel={() => setIsWelcomeModalOpen(false)}
        currentName={userName}
      />

      {/* Visual Gallery Modal */}
      <VisualGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        images={galleryImages}
        onDeleteImage={handleDeleteGalleryImage}
        onSelectThread={handleSelectThread}
        onTriggerNewImage={() => {
          handleSendMessage(
            'Diseña una imagen horizontal panorámica en formato 16:9 con estética futurista de Nexus AI.'
          );
        }}
      />

      {/* Professional Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        thread={currentThread || null}
        userName={userName}
      />

      {/* Main Viewport Container */}
      <main
        ref={chatScrollRef}
        className="flex-1 w-full max-w-4xl mx-auto px-3 md:px-6 pt-20 pb-44 cinematic-bg flex flex-col items-center overflow-y-auto chat-scroll-area"
      >
        {/* Printable Official Document Header for PDF */}
        <div className="print-header w-full mb-6 p-6 border-b-2 border-slate-900 bg-white text-slate-900">
          <div className="flex items-center justify-between pb-4 border-b border-slate-300">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">NEXUS AI — INFORME OFICIAL</h1>
              <p className="text-xs text-slate-600">
                Núcleo Cuántico Nexus Quen • Creado por Breitan Céspedes Monge
              </p>
            </div>
            <div className="text-right text-xs text-slate-500 font-mono">
              <div>Fecha: {new Date().toLocaleDateString()}</div>
              <div>Modo: {focusMode.toUpperCase()}</div>
            </div>
          </div>
          <div className="mt-3 text-sm">
            <span className="font-semibold text-slate-800">Tema: </span>
            <span>{currentThread?.title}</span>
            <span className="ml-4 font-semibold text-slate-800">Usuario: </span>
            <span>{userName || 'Usuario'}</span>
          </div>
        </div>

        {/* Multimodal Synapse Connected Header Chip */}
        <div className="flex items-center gap-2 mb-2 px-3 py-1 rounded-full bg-[#171c25]/80 border border-cyan-500/20 text-slate-400 print-hide">
          <span className="material-symbols-outlined text-xs text-cyan-400" data-icon="sensors">
            sensors
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">
            Sinapsis Multimodal Conectada • Núcleo Cuántico 128k
          </span>
        </div>

        {/* 3D Holographic Orbit Component */}
        <div className="print-hide">
          <ThreeOrb isProcessing={isProcessing} status={processStatus} />
        </div>

        {/* Hologram State Pill Selector */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-[#171c25]/90 backdrop-blur-xl border border-cyan-500/30 rounded-full mb-4 z-20 print-hide">
          <button
            onClick={() => {
              setIsProcessing(false);
              setProcessStatus('idle');
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              processStatus === 'idle'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(76,215,246,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                processStatus === 'idle' ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>En Reposo</span>
          </button>

          <button
            onClick={() => {
              setIsProcessing(true);
              setProcessStatus('thinking');
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              processStatus === 'thinking'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                processStatus === 'thinking' ? 'bg-purple-400 animate-ping' : 'bg-purple-500/60'
              }`}
            />
            <span>Pensando</span>
          </button>

          <button
            onClick={() => {
              setIsProcessing(true);
              setProcessStatus('generating');
            }}
            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              processStatus === 'generating'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                processStatus === 'generating' ? 'bg-cyan-400 animate-ping' : 'bg-cyan-500/60'
              }`}
            />
            <span>Generando</span>
          </button>
        </div>

        {/* Center Main Heading */}
        <div className="text-center px-4 mb-4 print-hide">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
            {userName ? `¡Hola, ${userName}! 👋` : '¡Hola! 👋 Bienvenido a Nexus AI'}
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
            {userName ? 'Bienvenido a Nexus AI. ¿En qué te ayudo hoy?' : '¿En qué te ayudo hoy?'}
          </p>
        </div>

        {/* Bento Quick Suggestion Cards */}
        {(!currentThread || currentThread.messages.length <= 1) && (
          <div className="w-full mb-6 print-hide">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Protocolos Rápidos
              </span>
              <span className="text-[11px] font-mono text-cyan-400">
                Selecciona uno para comenzar →
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {/* Card 1 */}
              <button
                onClick={() =>
                  handleSendMessage('Ayúdame a resolver un problema algorítmico y deductivo paso a paso.')
                }
                className="p-3.5 rounded-2xl glass-card-holo text-left group transition-all duration-300 active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all mb-2.5">
                  <span className="material-symbols-outlined text-xl" data-icon="neurology">
                    neurology
                  </span>
                </div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  Resolver un problema
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                  Depuración algorítmica y deducción lógica paso a paso.
                </p>
              </button>

              {/* Card 2 */}
              <button
                onClick={() =>
                  handleSendMessage('Hazme una imagen horizontal que diga HOLA')
                }
                className="p-3.5 rounded-2xl glass-card-holo text-left group transition-all duration-300 active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-400/30 flex items-center justify-center text-purple-300 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all mb-2.5">
                  <span className="material-symbols-outlined text-xl" data-icon="auto_awesome">
                    auto_awesome
                  </span>
                </div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-purple-300 transition-colors">
                  Generar una imagen
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                  Crea mundos visuales y fondos cinemáticos de alta fidelidad.
                </p>
              </button>

              {/* Card 3 */}
              <button
                onClick={() => {
                  setIsWebSearchActive(true);
                  handleSendMessage('¿Cuáles son las últimas noticias científicas de hoy?', [], true);
                }}
                className="p-3.5 rounded-2xl glass-card-holo text-left group transition-all duration-300 active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-400/30 flex items-center justify-center text-blue-300 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all mb-2.5">
                  <span className="material-symbols-outlined text-xl">
                    language
                  </span>
                </div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-blue-300 transition-colors">
                  Búsqueda Web en Vivo
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                  Verificación de datos en tiempo real con Google Search Grounding.
                </p>
              </button>

              {/* Card 4 */}
              <button
                onClick={() => handleSendMessage('¿Quién eres y quién te creó?')}
                className="p-3.5 rounded-2xl glass-card-holo text-left group transition-all duration-300 active:scale-95 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 group-hover:scale-110 group-hover:bg-cyan-400/20 transition-all mb-2.5">
                  <span className="material-symbols-outlined text-xl" data-icon="verified">
                    verified
                  </span>
                </div>
                <h4 className="text-xs md:text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                  ¿Quién te creó?
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                  Conoce el origen oficial de Nexus Quen.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Message Thread Stream */}
        <div className="w-full space-y-4 mb-8">
          {currentThread?.messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              userName={userName}
              onRetry={handleRetryLastMessage}
              onOpenImageModal={(url, prompt) => setPreviewImage({ url, prompt })}
              onEditMessage={handleEditUserMessage}
              onSwitchVersion={handleSwitchVersion}
              onRegenerateResponse={handleRegenerateResponse}
            />
          ))}
        </div>
      </main>

      {/* Floating Glass Omnibar with Web Grounding toggle */}
      <Omnibar
        onSendMessage={handleSendMessage}
        onCancelGeneration={handleCancelGeneration}
        isProcessing={isProcessing}
        statusText={statusText}
        isWebSearchActive={isWebSearchActive}
        onToggleWebSearch={() => setIsWebSearchActive(!isWebSearchActive)}
        onTriggerImageMode={() =>
          handleSendMessage(
            'Diseña una imagen horizontal en formato 16:9 con estética futurista de Nexus AI.'
          )
        }
      />

      {/* Image Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in print-hide"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-[#0f131d] border border-cyan-500/40 rounded-2xl p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <span className="text-xs text-slate-300 italic truncate pr-4">
                "{previewImage.prompt}"
              </span>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 hover:text-white text-slate-400 rounded cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <img
              src={previewImage.url}
              alt={previewImage.prompt}
              className="w-full max-h-[75vh] object-contain rounded-xl"
            />
            <div className="flex justify-end pt-3">
              <a
                href={previewImage.url}
                download="nexus_quen_image.png"
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">download</span>
                <span>Descargar Imagen</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 w-full z-40 bg-[#0f131d]/90 backdrop-blur-2xl border-t border-cyan-500/20 shadow-2xl flex justify-around items-center px-4 py-2 print-hide">
        {/* Tab 1: Chat */}
        <button
          onClick={() => {
            if (isTemporalMode) setIsTemporalMode(false);
          }}
          className={`flex flex-col items-center justify-center transition-all cursor-pointer ${
            !isTemporalMode ? 'text-cyan-400 scale-105' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="material-symbols-outlined text-2xl" data-icon="chat_bubble">
            chat_bubble
          </span>
          <span className="text-[11px] font-medium mt-0.5">Chat</span>
        </button>

        {/* Tab 2: Galería Visual */}
        <button
          onClick={() => setIsGalleryOpen(true)}
          className="flex flex-col items-center justify-center text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer relative"
          title="Abrir Galería Visual"
        >
          <span className="material-symbols-outlined text-2xl">photo_library</span>
          <span className="text-[11px] font-medium mt-0.5">Galería</span>
          {galleryImages.length > 0 && (
            <span className="absolute top-0 right-1 px-1 rounded-full bg-cyan-500 text-slate-950 text-[9px] font-bold font-mono">
              {galleryImages.length}
            </span>
          )}
        </button>

        {/* Tab 3: Modo Temporal */}
        <button
          onClick={() => handleToggleTemporalMode(!isTemporalMode)}
          className={`flex flex-col items-center justify-center transition-all cursor-pointer ${
            isTemporalMode ? 'text-purple-400 scale-105' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Alternar Chat Temporal"
        >
          <span className="material-symbols-outlined text-2xl" data-icon="timer">
            timer
          </span>
          <span className="text-[11px] font-medium mt-0.5">Temporal</span>
        </button>

        {/* Tab 4: Gestor de APIs con PIN oculto */}
        <button
          onClick={() => setIsKeysModalOpen(true)}
          className="flex flex-col items-center justify-center text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer"
          title="Gestor de Seguridad & APIs"
        >
          <span className="material-symbols-outlined text-2xl" data-icon="lock">
            lock
          </span>
          <span className="text-[11px] font-medium mt-0.5">APIs</span>
        </button>

        {/* Tab 5: Historial / Biblioteca */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="flex flex-col items-center justify-center text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer"
          title="Abrir historial de conversaciones"
        >
          <span className="material-symbols-outlined text-2xl" data-icon="folder_open">
            folder_open
          </span>
          <span className="text-[11px] font-medium mt-0.5">Historial</span>
        </button>
      </nav>

      {/* PWA Install Banner — floats above bottom nav */}
      <InstallBanner />
    </div>
  );
}
