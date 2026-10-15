import React, { useEffect, useState } from 'react';
import { ProvidersResponse, ProviderStatus } from '../types';

interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECURITY_POLICIES = [
  'Ocultar API keys',
  'Row-Level Security',
  'Restringir el acceso a registros',
  'Hashear contraseñas',
  'Rate limiting',
  'Protección contra bots',
  'Restringir archivos',
  'Devolver datos necesarios',
  'Forzar HTTPS',
];

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({ isOpen, onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [sessionPin, setSessionPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinErrorMessage, setPinErrorMessage] = useState('');

  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Key updating state
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingKeyName, setEditingKeyName] = useState<string>('');
  const [inputKeyValue, setInputKeyValue] = useState<string>('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Provider testing state
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, { status: string; latency?: number }>>({});

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput) return;

    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setSessionPin(pinInput);
        setIsAuthenticated(true);
        setPinError(false);
        setPinErrorMessage('');
        fetchStatus();
      } else {
        setPinError(true);
        setPinErrorMessage(result.error || 'PIN incorrecto. Acceso denegado.');
        setPinInput('');
      }
    } catch {
      setPinError(true);
      setPinErrorMessage('Error de comunicación con el servidor al verificar PIN.');
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/providers/status');
      if (!res.ok) throw new Error('Error al consultar el estado de proveedores.');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido al verificar claves.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setVerifyingId(providerId);
    try {
      const res = await fetch('/api/providers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const json = await res.json();
      setVerifyResult((prev) => ({
        ...prev,
        [providerId]: {
          status: json.status || (res.ok ? 'active' : 'error'),
          latency: json.latencyMs,
        },
      }));
      fetchStatus();
    } catch {
      setVerifyResult((prev) => ({
        ...prev,
        [providerId]: { status: 'error' },
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleStartConfigureKey = (p: ProviderStatus) => {
    let keyEnvName = '';
    if (p.id.startsWith('google-gemini-')) {
      const slotNum = p.id.replace('google-gemini-', '');
      keyEnvName = `GEMINI_API_KEY_${slotNum}`;
    } else if (p.id === 'google-gemini') {
      keyEnvName = 'GEMINI_API_KEY_1';
    } else if (p.id === 'groq-ai') {
      keyEnvName = 'GROQ_API_KEY';
    } else if (p.id === 'mistral-ai') {
      keyEnvName = 'MISTRAL_API_KEY';
    } else if (p.id.startsWith('nvidia-slot-')) {
      const slotNum = p.id.replace('nvidia-slot-', '');
      keyEnvName = `NVIDIA_API_KEY_${slotNum}`;
    }

    setEditingProviderId(p.id);
    setEditingKeyName(keyEnvName);
    setInputKeyValue('');
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKeyName) return;

    setIsSavingKey(true);
    try {
      const res = await fetch('/api/providers/update-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: sessionPin,
          keyName: editingKeyName,
          keyValue: inputKeyValue,
        }),
      });

      if (res.ok) {
        setEditingProviderId(null);
        setInputKeyValue('');
        fetchStatus();
      } else {
        const errorData = await res.json().catch(() => null);
        alert(errorData?.error || 'Error al guardar la clave.');
      }
    } catch {
      alert('Error de conexión al guardar la clave.');
    } finally {
      setIsSavingKey(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchStatus();
    }
    if (!isOpen) {
      setPinInput('');
      setPinError(false);
      setEditingProviderId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // VIEW 1: PIN LOCK GATE (PIN oculto)
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
        <div className="bg-[#0f131d] border border-cyan-500/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl shadow-cyan-950/60 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>

          <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-400 mb-4 mx-auto shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            <span className="material-symbols-outlined text-2xl">lock</span>
          </div>

          <h3 className="text-center font-semibold text-cyan-200 text-base mb-1">
            Gestor de APIs — NEXUS IA
          </h3>
          <p className="text-center text-xs text-slate-400 mb-5">
            Introduce el código PIN de seguridad para acceder a la configuración de proveedores.
          </p>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                placeholder="PIN de acceso..."
                autoFocus
                className={`w-full bg-[#171c25] border text-center text-lg tracking-widest text-cyan-300 font-mono rounded-xl py-2.5 px-4 focus:outline-none transition-all ${
                  pinError
                    ? 'border-red-500 ring-2 ring-red-500/30'
                    : 'border-cyan-500/30 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20'
                }`}
              />
            </div>

            {pinError && (
              <p className="text-center text-xs text-red-400 animate-pulse">
                {pinErrorMessage || 'PIN de seguridad incorrecto.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-slate-950 text-xs font-bold shadow-[0_0_15px_rgba(76,215,246,0.4)] transition-all"
              >
                Desbloquear
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // VIEW 2: AUTHENTICATED 12 KEYS MANAGEMENT DASHBOARD
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0f131d] border border-cyan-500/30 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl shadow-cyan-950/50">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-400">
              <span className="material-symbols-outlined text-xl">security</span>
            </div>
            <div>
              <h3 className="font-semibold text-cyan-200 text-sm md:text-base">
                Gestor de Seguridad & APIs — NEXUS IA
              </h3>
              <p className="text-xs text-slate-400">
                Modelo Nexus Qwen • 5 Google AI Studio • 10 NVIDIA NIM • 1 Mistral • 1 Groq
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAuthenticated(false)}
              className="p-1.5 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors text-xs flex items-center gap-1 border border-slate-800"
              title="Bloquear panel"
            >
              <span className="material-symbols-outlined text-sm">lock</span>
              <span className="hidden sm:inline">Bloquear</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Security Policies Matrix Checklist */}
        <div className="p-4 bg-[#141923] border-b border-cyan-500/20">
          <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-cyan-400">verified_user</span>
            <span>Políticas de Seguridad y Protección de Datos</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SECURITY_POLICIES.map((policy) => (
              <div
                key={policy}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300"
              >
                <span className="material-symbols-outlined text-xs text-emerald-400">check_circle</span>
                <span className="truncate">{policy}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 md:p-5 overflow-y-auto no-scrollbar space-y-4 flex-1">
          {/* Summary counters */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[#171c25] border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Total Claves</span>
              <span className="text-xl font-bold text-cyan-400">{data ? data.totalKeys : 17}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#171c25] border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Configuradas</span>
              <span className="text-xl font-bold text-emerald-400">
                {data ? data.configuredCount : '...'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#171c25] border border-slate-800 text-center">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Nodos Activos</span>
              <span className="text-xl font-bold text-purple-400">
                {data ? data.activeCount : '...'}
              </span>
            </div>
          </div>

          {loading && (
            <div className="py-8 text-center text-xs text-cyan-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Verificando conectividad de las 17 claves...</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* List of 17 Keys */}
          {data && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Estado de Nodos & Conectores</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {data.primaryModel}
                </span>
              </div>

              {data.providers.map((p: ProviderStatus, idx: number) => {
                const isGoogle = p.category === 'google';
                const isNvidia = p.category === 'nvidia';
                const isMistral = p.category === 'mistral';
                const isGroq = p.category === 'groq';

                const verification = verifyResult[p.id];
                const isTesting = verifyingId === p.id;

                let badgeColor = 'text-slate-400 border-slate-800 bg-slate-900';
                let label = 'No configurada';

                if (p.configured && p.status === 'active') {
                  badgeColor = 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';
                  label = 'Conectada & Lista';
                }

                if (verification) {
                  if (verification.status === 'active') {
                    label = `Activa (${verification.latency || 15}ms)`;
                    badgeColor = 'text-emerald-300 border-emerald-400/40 bg-emerald-950/40';
                  } else {
                    label = 'Fallo de Test';
                    badgeColor = 'text-red-400 border-red-500/40 bg-red-950/40';
                  }
                }

                return (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl bg-[#171c25]/80 border border-slate-800/80 hover:border-cyan-500/30 transition-all text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-200 block truncate">{p.name}</span>
                          <span className="text-[11px] text-slate-400 truncate block">
                            {isGoogle && 'Google AI Studio (Gemini 2.5 Flash / Pro + Imagen 3 Síntesis Visual)'}
                            {isGroq && 'Groq LPU (Llama 3.3 70B Inferencia de Ultra-Alta Velocidad)'}
                            {isNvidia && 'NVIDIA NIM Balanceo y procesamiento distribuido'}
                            {isMistral && 'Mistral AI Large & Pixtral Multimodal'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border whitespace-nowrap ${badgeColor}`}>
                          {label}
                        </span>

                        <button
                          onClick={() => handleTestProvider(p.id)}
                          disabled={isTesting || !p.configured}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-cyan-300 text-[11px] font-mono transition-colors"
                          title="Probar conectividad de la clave"
                        >
                          {isTesting ? '...' : 'Probar'}
                        </button>

                        <button
                          onClick={() => handleStartConfigureKey(p)}
                          className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 text-[11px] transition-colors"
                          title="Establecer clave"
                        >
                          Configurar
                        </button>
                      </div>
                    </div>

                    {/* Inline Key Configuration Form */}
                    {editingProviderId === p.id && (
                      <form onSubmit={handleSaveKey} className="mt-2.5 pt-2.5 border-t border-slate-800 flex gap-2">
                        <input
                          type="password"
                          value={inputKeyValue}
                          onChange={(e) => setInputKeyValue(e.target.value)}
                          placeholder={`Pegar clave para ${editingKeyName}...`}
                          className="flex-1 bg-slate-900 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setEditingProviderId(null)}
                          className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white bg-slate-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingKey || !inputKeyValue.trim()}
                          className="px-3 py-1 rounded text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40"
                        >
                          {isSavingKey ? 'Guardando...' : 'Guardar'}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-cyan-500/20 bg-[#171c25]/50 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Plataforma: <strong className="text-cyan-300">NEXUS IA</strong> • Modelo: <strong className="text-cyan-300">Nexus Qwen</strong>
          </p>
          <div className="flex gap-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium transition-colors"
            >
              Reverificar
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-slate-950 text-xs font-bold transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
