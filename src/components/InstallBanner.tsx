import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'nexus_install_banner_dismissed';

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed permanently
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-[4.5rem] md:bottom-6 left-0 right-0 z-[9999] flex justify-center px-4 print-hide"
      role="complementary"
      aria-label="Banner de instalación"
    >
      <div className="flex items-center gap-3 bg-[#0f1623]/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-500/10 px-4 py-3 w-full max-w-md">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-cyan-500/30">
          <img src="/icon.jpg" alt="NEXUS AI" className="w-full h-full object-cover" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-cyan-300 truncate">📲 Instalar NEXUS AI</p>
          <p className="text-[11px] text-slate-400 leading-tight">
            Añade la app a tu pantalla de inicio
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-violet-600 text-white hover:opacity-90 active:scale-95 transition-all"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all"
            aria-label="Cerrar banner"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
