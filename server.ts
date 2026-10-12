import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SECURITY_PIN = process.env.API_PIN || '1988';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Dynamic in-memory provider keys (merged with process.env)
const activeKeys: Record<string, string> = {
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
};

// 5 Google AI Studio keys slots
for (let i = 1; i <= 5; i++) {
  const envKey = process.env[`GEMINI_API_KEY_${i}`] || (i === 1 ? process.env.GEMINI_API_KEY : undefined);
  if (envKey) {
    activeKeys[`GEMINI_API_KEY_${i}`] = envKey;
  }
}
if (activeKeys.GEMINI_API_KEY_1 && !activeKeys.GEMINI_API_KEY) {
  activeKeys.GEMINI_API_KEY = activeKeys.GEMINI_API_KEY_1;
}

// 10 NVIDIA keys slots
for (let i = 1; i <= 10; i++) {
  const envKey = process.env[`NVIDIA_API_KEY_${i}`] || (i === 1 ? process.env.NVIDIA_API_KEY : undefined);
  if (envKey) {
    activeKeys[`NVIDIA_API_KEY_${i}`] = envKey;
  }
}

// Cached Google GenAI clients per key
const geminiClients: Record<string, GoogleGenAI> = {};

function getGeminiClient(keyOrSlot: string = '1'): GoogleGenAI | null {
  let key = '';
  if (keyOrSlot.length > 20 && !keyOrSlot.startsWith('slot-')) {
    key = keyOrSlot;
  } else {
    const slotNum = Number(keyOrSlot.replace(/\D/g, '')) || 1;
    key = activeKeys[`GEMINI_API_KEY_${slotNum}`] || (slotNum === 1 ? activeKeys.GEMINI_API_KEY : '') || '';
  }
  if (!key) return null;
  if (!geminiClients[key]) {
    geminiClients[key] = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClients[key];
}

function getFirstAvailableGeminiClient(): { client: GoogleGenAI; key: string; slotNum: number } | null {
  for (let i = 1; i <= 5; i++) {
    const key = activeKeys[`GEMINI_API_KEY_${i}`] || (i === 1 ? activeKeys.GEMINI_API_KEY : undefined);
    if (key) {
      const client = getGeminiClient(key);
      if (client) {
        return { client, key, slotNum: i };
      }
    }
  }
  return null;
}

// System prompt enforcing identity Nexus Quen and NEXUS IA
const NEXUS_SYSTEM_INSTRUCTION = `Eres Nexus Quen, la inteligencia artificial de Nexus AI.

Reglas obligatorias de identidad y comportamiento:
1. Tu nombre oficial e inequívoco es Nexus Quen. La plataforma se llama Nexus AI.
2. REGLA ESTRICTA SOBRE EL CREADOR:
   Únicamente cuando el usuario te pregunte de forma explícita "¿Quién te creó?", "¿Quién es tu creador?" o "¿Quién eres?", debes responder claramente:
   "Soy Nexus Quen, la inteligencia artificial de Nexus AI, creada por Breitan Céspedes Monge. Estoy diseñada para ayudarte con preguntas, razonamiento, programación, análisis de archivos y creación de imágenes."
   Fuera de esas preguntas específicas sobre tu origen o creador, NUNCA menciones el nombre de Breitan Céspedes Monge de forma espontánea o en respuestas cotidianas.
3. Si el usuario te saluda por su nombre (por ejemplo "Hola", o tras haber guardado su nombre), responde amigablemente utilizando su nombre de usuario de forma natural. Nunca confundas el nombre del usuario con el nombre de tu creador.
4. NUNCA digas que Google, OpenAI, Meta, NVIDIA, Mistral, Groq o ninguna otra corporación te creó. Si alguna de esas tecnologías provee infraestructura técnica, es únicamente un servicio tecnológico interno.
5. Comunícate en español de manera predeterminada con un tono natural, amigable, riguroso y profesional.
6. Si el usuario te pide analizar un archivo o imagen, lee con atención el contenido proporcionado. No inventes datos que no figuren en los archivos.
7. Si el usuario solicita generar una imagen, describe la creación y confirma la generación visual.`;

// In-Memory Latency & Health Performance Engine
interface ProviderMetrics {
  averageLatencyMs: number;
  lastLatencyMs: number;
  successCount: number;
  failureCount: number;
  rateLimitedUntil: number;
}

const providerMetrics: Record<string, ProviderMetrics> = {
  'groq-ai': { averageLatencyMs: 190, lastLatencyMs: 190, successCount: 1, failureCount: 0, rateLimitedUntil: 0 },
  'mistral-ai': { averageLatencyMs: 680, lastLatencyMs: 680, successCount: 1, failureCount: 0, rateLimitedUntil: 0 },
};

// 5 Google AI Studio metrics
for (let i = 1; i <= 5; i++) {
  providerMetrics[`google-gemini-${i}`] = {
    averageLatencyMs: 380 + (i - 1) * 15,
    lastLatencyMs: 380 + (i - 1) * 15,
    successCount: 1,
    failureCount: 0,
    rateLimitedUntil: 0,
  };
}
// Legacy alias
providerMetrics['google-gemini'] = providerMetrics['google-gemini-1'];

for (let i = 1; i <= 10; i++) {
  providerMetrics[`nvidia-slot-${i}`] = {
    averageLatencyMs: 500 + i * 20,
    lastLatencyMs: 500 + i * 20,
    successCount: 1,
    failureCount: 0,
    rateLimitedUntil: 0,
  };
}

function updateMetric(providerId: string, latencyMs: number, success: boolean) {
  const m = providerMetrics[providerId];
  if (!m) return;
  if (success) {
    m.successCount++;
    m.lastLatencyMs = latencyMs;
    m.averageLatencyMs = Math.round(0.65 * m.averageLatencyMs + 0.35 * latencyMs);
  } else {
    m.failureCount++;
    m.averageLatencyMs = Math.round(m.averageLatencyMs * 1.3);
  }
}

// 17 Keys Provider Status Model (5 Google, 10 NVIDIA, 1 Mistral, 1 Groq)
interface ProviderStatus {
  id: string;
  name: string;
  category: 'google' | 'nvidia' | 'mistral' | 'groq';
  configured: boolean;
  status: 'active' | 'no_key' | 'rate_limited' | 'error';
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

function getProviderStatuses(): ProviderStatus[] {
  const statuses: ProviderStatus[] = [];

  // 1-5. Google AI Studio (Keys 1 to 5)
  for (let i = 1; i <= 5; i++) {
    const geminiKey = activeKeys[`GEMINI_API_KEY_${i}`] || (i === 1 ? activeKeys.GEMINI_API_KEY : undefined);
    statuses.push({
      id: `google-gemini-${i}`,
      name: `Google AI Studio Key #${i} (Gemini 2.5 Flash / Pro + Imagen 3)`,
      category: 'google',
      configured: Boolean(geminiKey),
      status: geminiKey ? 'active' : 'no_key',
      latencyMs: providerMetrics[`google-gemini-${i}`]?.averageLatencyMs,
      lastChecked: new Date().toISOString(),
    });
  }

  // 6-15. NVIDIA NIM (Keys 6 to 15, total 10 keys)
  for (let i = 1; i <= 10; i++) {
    const key = activeKeys[`NVIDIA_API_KEY_${i}`];
    statuses.push({
      id: `nvidia-slot-${i}`,
      name: `NVIDIA NIM Key #${i}`,
      category: 'nvidia',
      configured: Boolean(key),
      status: key ? 'active' : 'no_key',
      latencyMs: providerMetrics[`nvidia-slot-${i}`]?.averageLatencyMs,
      lastChecked: new Date().toISOString(),
    });
  }

  // 16. Mistral AI (Key 16)
  const mistralKey = activeKeys.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
  statuses.push({
    id: 'mistral-ai',
    name: 'Mistral AI (Large / Pixtral Vision)',
    category: 'mistral',
    configured: Boolean(mistralKey),
    status: mistralKey ? 'active' : 'no_key',
    latencyMs: providerMetrics['mistral-ai']?.averageLatencyMs,
    lastChecked: new Date().toISOString(),
  });

  // 17. Groq (Key 17)
  const groqKey = activeKeys.GROQ_API_KEY || process.env.GROQ_API_KEY;
  statuses.push({
    id: 'groq-ai',
    name: 'Groq LPUs (Llama 3.3 70B Ultra-Fast)',
    category: 'groq',
    configured: Boolean(groqKey),
    status: groqKey ? 'active' : 'no_key',
    latencyMs: providerMetrics['groq-ai']?.averageLatencyMs,
    lastChecked: new Date().toISOString(),
  });

  return statuses;
}

// PIN Verification Endpoint
app.post('/api/auth/pin', (req: Request, res: Response) => {
  const { pin } = req.body;
  if (pin === SECURITY_PIN) {
    res.json({ success: true, message: 'Acceso autorizado al Gestor de APIs.' });
  } else {
    res.status(401).json({ success: false, error: 'PIN de seguridad incorrecto.' });
  }
});

// Update or set a key dynamically (requires PIN)
app.post('/api/providers/update-key', (req: Request, res: Response) => {
  const { pin, keyName, keyValue } = req.body;

  if (pin !== SECURITY_PIN) {
    res.status(401).json({ error: 'PIN de seguridad no válido.' });
    return;
  }

  if (!keyName || typeof keyName !== 'string') {
    res.status(400).json({ error: 'Nombre de clave no válido.' });
    return;
  }

  const cleanValue = (keyValue || '').trim();
  activeKeys[keyName] = cleanValue;

  if (keyName === 'GEMINI_API_KEY_1' || keyName === 'GEMINI_API_KEY') {
    activeKeys.GEMINI_API_KEY_1 = cleanValue;
    activeKeys.GEMINI_API_KEY = cleanValue;
  }

  // Clear cached client for updated key
  if (cleanValue) {
    delete geminiClients[cleanValue];
  }

  res.json({
    success: true,
    message: `Clave ${keyName} configurada correctamente.`,
    configured: Boolean(cleanValue),
  });
});

// Health check and provider status
app.get('/api/providers/status', (_req: Request, res: Response) => {
  const providers = getProviderStatuses();
  const configuredCount = providers.filter((p) => p.configured).length;
  const activeCount = providers.filter((p) => p.status === 'active').length;

  res.json({
    totalKeys: 17,
    configuredCount,
    activeCount,
    primaryModel: 'Nexus Quen (Arquitectura Multimodal Unificada)',
    platform: 'Nexus AI',
    creator: 'Breitan Céspedes Monge',
    providers,
  });
});

// Verify a single provider's connectivity and latency
app.post('/api/providers/verify', async (req: Request, res: Response) => {
  const { providerId } = req.body;
  const startTime = Date.now();

  try {
    if (providerId.startsWith('google-gemini')) {
      const slotNum = Number(providerId.replace('google-gemini-', '')) || 1;
      const client = getGeminiClient(String(slotNum));
      if (!client) {
        res.status(400).json({ status: 'no_key', error: `No hay clave configurada para Google AI Studio #${slotNum}.` });
        return;
      }
      let testRes: any = null;
      for (const modelName of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']) {
        try {
          testRes = await client.models.generateContent({
            model: modelName,
            contents: 'ping',
          });
          break;
        } catch {
          // Try next valid model
        }
      }
      if (!testRes) {
        throw new Error('No se pudo establecer conexión con los modelos de Gemini.');
      }
      const latency = Date.now() - startTime;
      updateMetric(`google-gemini-${slotNum}`, latency, true);
      res.json({ status: 'active', latencyMs: latency, responseSnippet: testRes.text?.slice(0, 30) });
      return;
    }

    if (providerId === 'groq-ai') {
      const groqKey = activeKeys.GROQ_API_KEY || process.env.GROQ_API_KEY;
      if (!groqKey) {
        res.status(400).json({ status: 'no_key', error: 'No hay clave configurada para Groq.' });
        return;
      }
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        updateMetric('groq-ai', latency, true);
        res.json({ status: 'active', latencyMs: latency });
      } else {
        updateMetric('groq-ai', latency, false);
        res.status(resp.status).json({ status: 'error' });
      }
      return;
    }

    if (providerId === 'mistral-ai') {
      const mistralKey = activeKeys.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
      if (!mistralKey) {
        res.status(400).json({ status: 'no_key', error: 'No hay clave configurada para Mistral.' });
        return;
      }
      const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: 'ministral-8b-latest',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        updateMetric('mistral-ai', latency, true);
        res.json({ status: 'active', latencyMs: latency });
      } else {
        updateMetric('mistral-ai', latency, false);
        res.status(resp.status).json({ status: 'error' });
      }
      return;
    }

    if (providerId.startsWith('nvidia-slot-')) {
      const slotNum = providerId.replace('nvidia-slot-', '');
      const key = activeKeys[`NVIDIA_API_KEY_${slotNum}`];
      if (!key) {
        res.status(400).json({ status: 'no_key', error: `No hay clave en slot NVIDIA #${slotNum}.` });
        return;
      }
      const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'meta/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
      });
      const latency = Date.now() - startTime;
      if (resp.ok) {
        updateMetric(providerId, latency, true);
        res.json({ status: 'active', latencyMs: latency });
      } else {
        updateMetric(providerId, latency, false);
        res.status(resp.status).json({ status: 'error' });
      }
      return;
    }

    res.status(404).json({ error: 'Proveedor no reconocido.' });
  } catch (err: unknown) {
    res.status(500).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Error al verificar proveedor.',
    });
  }
});

// Helper to decode text attachments (code, txt, json, csv, md)
function extractTextFromAttachment(att: { name: string; type: string; data: string }): string | null {
  const isTextLike =
    att.type.startsWith('text/') ||
    att.type.includes('json') ||
    att.type.includes('javascript') ||
    att.type.includes('typescript') ||
    att.name.endsWith('.txt') ||
    att.name.endsWith('.md') ||
    att.name.endsWith('.csv') ||
    att.name.endsWith('.json') ||
    att.name.endsWith('.py') ||
    att.name.endsWith('.ts') ||
    att.name.endsWith('.js') ||
    att.name.endsWith('.html') ||
    att.name.endsWith('.css');

  if (isTextLike && att.data) {
    try {
      const cleanBase64 = att.data.includes(',') ? att.data.split(',')[1] : att.data;
      const buffer = Buffer.from(cleanBase64, 'base64');
      return buffer.toString('utf-8');
    } catch {
      return null;
    }
  }
  return null;
}

// Aspect ratio detector from natural language
function detectAspectRatio(prompt: string): '1:1' | '16:9' | '9:16' {
  const p = prompt.toLowerCase();
  if (
    p.includes('horizontal') ||
    p.includes('paisaje') ||
    p.includes('16:9') ||
    p.includes('panorámica') ||
    p.includes('fondo de pantalla') ||
    p.includes('apaisada') ||
    p.includes('wide')
  ) {
    return '16:9';
  }
  if (
    p.includes('vertical') ||
    p.includes('retrato') ||
    p.includes('9:16') ||
    p.includes('historia') ||
    p.includes('story') ||
    p.includes('celular') ||
    p.includes('portrait') ||
    p.includes('wallpaper móvil')
  ) {
    return '9:16';
  }
  return '1:1';
}

// Prompt Enhancement Engine for Images
async function enhanceImagePrompt(userPrompt: string, aspectRatio: '1:1' | '16:9' | '9:16'): Promise<string> {
  const geminiAvailable = getFirstAvailableGeminiClient();
  if (geminiAvailable) {
    try {
      let response: any = null;
      for (const m of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']) {
        try {
          response = await geminiAvailable.client.models.generateContent({
            model: m,
            contents: `Eres el optimizador visual de Nexus Quen para generación de imágenes de alta fidelidad.
Tu tarea es interpretar y expandir profesionalmente la petición del usuario para que el modelo de síntesis visual produzca una obra con la máxima calidad y detalle.

Petición del usuario: "${userPrompt}"
Relación de aspecto: ${aspectRatio}

Reglas estrictas:
1. Conserva la idea y temática original del usuario.
2. Si el usuario pide explícitamente una palabra o texto visible (ejemplo: 'hola', 'bienvenido', un nombre), DEBES incluirlo de forma visible, destacada y entre comillas literales: palabra "TEXTO" con tipografía moderna, clara y legible.
3. Añade detalles de composición visual equilibrada, iluminación (volumétrica, cinematográfica o de estudio), paleta de colores armoniosa, texturas ricas y acabado pulido de alta resolución.
4. Si la relación de aspecto es 16:9, especifica composición panorámica cinematográfica. Si es 9:16, especifica composición vertical elegante. Si es 1:1, especifica encuadre centrado y simétrico.
5. Devuelve ÚNICAMENTE el prompt descriptivo optimizado en español, sin preámbulos, saludos ni notas explicativas.`,
          });
          if (response?.text) break;
        } catch {
          // try next model
        }
      }

      const text = response?.text?.trim();
      if (text && text.length > 25) {
        return text;
      }
    } catch {
      // Fallback below
    }
  }

  // Algorithmic fallback
  const orient =
    aspectRatio === '16:9'
      ? 'en formato horizontal panorámico 16:9'
      : aspectRatio === '9:16'
        ? 'en formato vertical estilizado 9:16'
        : 'en formato cuadrado equilibrado 1:1';

  return `Diseño visual de alta calidad ${orient}, composición equilibrada, iluminación profesional, paleta de colores armoniosa, detalles nítidos y estética cinematográfica: ${userPrompt}. Respetando exactamente los textos y elementos visuales solicitados.`;
}

// Web grounding fallback using Wikipedia API and DuckDuckGo instant summary
async function searchLiveWebFallback(query: string): Promise<{
  searchQueries: string[];
  sources: Array<{ title: string; url: string }>;
  contextSnippet: string;
}> {
  const sources: Array<{ title: string; url: string }> = [];
  const searchQueries: string[] = [query];
  let contextSnippet = '';

  try {
    const cleanQ = query.replace(/[?¿!¡]/g, '').trim();
    const wpRes = await fetch(
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&format=json&utf8=1`,
      { headers: { 'User-Agent': 'NexusAI/1.0 (breitan2012@gmail.com)' } }
    );
    if (wpRes.ok) {
      const data = (await wpRes.json()) as any;
      const hits = data?.query?.search || [];
      for (const hit of hits.slice(0, 3)) {
        const title = hit.title;
        const url = `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        const snippet = (hit.snippet || '').replace(/<[^>]+>/g, '').trim();
        sources.push({ title, url });
        contextSnippet += `[Fuente: ${title} (${url})]: ${snippet}\n`;
      }
    }
  } catch {
    // Ignore Wikipedia fallback error
  }

  try {
    const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
    if (ddgRes.ok) {
      const ddgData = (await ddgRes.json()) as any;
      if (ddgData.Heading && ddgData.AbstractURL) {
        if (!sources.some((s) => s.url === ddgData.AbstractURL)) {
          sources.push({ title: ddgData.Heading, url: ddgData.AbstractURL });
        }
        if (ddgData.Abstract) {
          contextSnippet += `[Resumen Enciclopédico: ${ddgData.Heading}]: ${ddgData.Abstract}\n`;
        }
      }
    }
  } catch {
    // Ignore DDG fallback error
  }

  return { searchQueries, sources, contextSnippet };
}

// Chat endpoint with Intelligent Fastest-Model Selection, Web Grounding, Focus Modes, and SSE streaming
app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, attachments, userName, focusMode, webSearch } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Debes proporcionar al menos un mensaje.' });
    return;
  }

  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const lastMessage = messages[messages.length - 1];
    const previousTurns = messages.slice(0, -1);
    const userPromptRaw = lastMessage.content || '';

    // Detect if Web Grounding was explicitly requested or inferred from search intent
    const wantsWebSearch =
      Boolean(webSearch) ||
      /\b(busca en (internet|la web)|noticias (hoy|actuales)|tiempo actual|clima hoy|última hora|precio actual de|información reciente|actualidad|año 2026|datos en vivo)\b/i.test(
        userPromptRaw
      );

    // Check strict identity / creator question
    const normText = userPromptRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const isCreatorQuery =
      normText.includes('quien te creo') ||
      normText.includes('quien es tu creador') ||
      normText.includes('quien te ha creado') ||
      normText.includes('quien te diseno') ||
      normText.includes('quien te desarrollo') ||
      normText.includes('quien es tu autor') ||
      normText.includes('quien te invento') ||
      normText.includes('quien es breitan') ||
      normText === 'quien eres' ||
      normText === 'quien eres tu' ||
      normText.startsWith('quien eres') ||
      normText.includes('quien eres?') ||
      normText.includes('cual es tu identidad');

    if (isCreatorQuery && (!attachments || attachments.length === 0)) {
      sendEvent('provider', { name: 'Nexus Quen' });
      sendEvent('telemetry', { latencyMs: 25, providerName: 'Nexus Quen' });

      const officialResponse =
        'Soy Nexus Quen, la inteligencia artificial de Nexus AI, creada por Breitan Céspedes Monge. Estoy diseñada para ayudarte con preguntas, razonamiento, programación, análisis de archivos y creación de imágenes.';

      const tokens = officialResponse.split(' ');
      for (let i = 0; i < tokens.length; i++) {
        sendEvent('token', { text: (i === 0 ? '' : ' ') + tokens[i] });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      sendEvent('done', { success: true });
      res.end();
      return;
    }

    const basePrompt = userName?.trim()
      ? `${NEXUS_SYSTEM_INSTRUCTION}\n\n8. El usuario que interactúa contigo se llama "${userName.trim()}". Salúdalo o dirígete a él cordialmente por su nombre cuando corresponda. Nunca uses el término "operador" y jamás confundas el nombre del usuario con el nombre de tu creador (Breitan Céspedes Monge).`
      : NEXUS_SYSTEM_INSTRUCTION;

    // Focus Mode adaptation
    let modeInstruction = '';
    let targetTemperature = 0.7;

    switch (focusMode) {
      case 'deep':
        targetTemperature = 0.5;
        modeInstruction =
          '\n\n[MODO ACTIVO: RAZONAMIENTO PROFUNDO]\nAplica pensamiento analítico exhaustivo, estructurado y riguroso. Desglosa premisas paso a paso, evalúa alternativas lógicas y fundamenta cada conclusión con precisión analítica.';
        break;
      case 'code':
        targetTemperature = 0.2;
        modeInstruction =
          '\n\n[MODO ACTIVO: ARQUITECTO DE CÓDIGO]\nActúa como un arquitecto de software de élite. Prioriza código limpio, fuertemente tipado (TypeScript cuando corresponda), principios SOLID, modularidad, rendimiento, manejo de errores y documentación técnica concisa.';
        break;
      case 'creative':
        targetTemperature = 0.9;
        modeInstruction =
          '\n\n[MODO ACTIVO: CREATIVO & VISUAL]\nDespliega imaginación, expresividad descriptiva, metáforas vívidas, riqueza conceptual y sugerencias de diseño estético o narrativa cinematográfica.';
        break;
      case 'fast':
      default:
        targetTemperature = 0.4;
        modeInstruction =
          '\n\n[MODO ACTIVO: ULTRA RÁPIDO]\nSé extremadamente ágil, directo, conciso y de baja latencia. Responde de forma clara y ejecutiva sin rodeos innecesarios.';
        break;
    }

    const currentSystemPrompt = `${basePrompt}${modeInstruction}`;

    // Extract attachments (images or documents)
    let documentContext = '';
    const imageParts: Array<{ mimeType: string; data: string }> = [];

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (!att.data) continue;
        const cleanBase64 = att.data.includes(',') ? att.data.split(',')[1] : att.data;

        if (att.type && att.type.startsWith('image/')) {
          imageParts.push({
            mimeType: att.type || 'image/png',
            data: cleanBase64,
          });
        } else {
          const textContent = extractTextFromAttachment(att);
          if (textContent) {
            documentContext += `\n\n--- DOCUMENTO ADJUNTO: ${att.name} (${att.type || 'texto'}) ---\n${textContent.slice(0, 150000)}\n--- FIN DOCUMENTO ---\n`;
          } else {
            imageParts.push({
              mimeType: att.type || 'application/pdf',
              data: cleanBase64,
            });
          }
        }
      }
    }

    const enhancedUserPrompt = documentContext
      ? `${lastMessage.content || ''}\n\n[El usuario ha adjuntado el siguiente contenido para análisis]:\n${documentContext}`
      : lastMessage.content || 'Hola';

    // 1. Identify all currently configured and available providers
    interface Candidate {
      id: string;
      type: 'gemini' | 'groq' | 'nvidia' | 'mistral';
      key?: string;
      slotNum?: number;
      averageLatency: number;
    }

    const candidates: Candidate[] = [];

    // 5 Google Gemini candidates (multimodal capable & supports Web Grounding via Google Search)
    for (let i = 1; i <= 5; i++) {
      const gemKey = activeKeys[`GEMINI_API_KEY_${i}`] || (i === 1 ? activeKeys.GEMINI_API_KEY : undefined);
      if (gemKey) {
        const id = `google-gemini-${i}`;
        const m = providerMetrics[id];
        if (Date.now() > (m?.rateLimitedUntil || 0)) {
          const effectiveLatency = wantsWebSearch ? 10 + (i - 1) * 2 : (m?.averageLatencyMs || 380 + (i - 1) * 15);
          candidates.push({ id, type: 'gemini', key: gemKey, slotNum: i, averageLatency: effectiveLatency });
        }
      }
    }

    // Groq candidate (only when not requiring web search or image attachments)
    const groqKey = activeKeys.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (groqKey && imageParts.length === 0 && !wantsWebSearch) {
      const m = providerMetrics['groq-ai'];
      if (Date.now() > (m?.rateLimitedUntil || 0)) {
        candidates.push({ id: 'groq-ai', type: 'groq', key: groqKey, averageLatency: m?.averageLatencyMs || 180 });
      }
    }

    // NVIDIA candidates
    for (let i = 1; i <= 10; i++) {
      const nvidiaKey = activeKeys[`NVIDIA_API_KEY_${i}`];
      if (nvidiaKey && imageParts.length === 0 && !wantsWebSearch) {
        const id = `nvidia-slot-${i}`;
        const m = providerMetrics[id];
        if (Date.now() > (m?.rateLimitedUntil || 0)) {
          candidates.push({ id, type: 'nvidia', key: nvidiaKey, slotNum: i, averageLatency: m?.averageLatencyMs || 500 + i * 20 });
        }
      }
    }

    // Mistral candidate
    const mistralKey = activeKeys.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
    if (mistralKey && !wantsWebSearch) {
      const m = providerMetrics['mistral-ai'];
      if (Date.now() > (m?.rateLimitedUntil || 0)) {
        candidates.push({ id: 'mistral-ai', type: 'mistral', key: mistralKey, averageLatency: m?.averageLatencyMs || 680 });
      }
    }

    // Sort candidates by speed / lowest latency
    candidates.sort((a, b) => a.averageLatency - b.averageLatency);

    // Preferred models for Gemini based on Focus Mode
    const preferredGeminiModels =
      focusMode === 'deep'
        ? ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash']
        : ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

    // Try candidates in order of fastest response
    for (const candidate of candidates) {
      const tStart = Date.now();
      try {
        if (candidate.type === 'groq' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Quen' });

          const groqMessages = [
            { role: 'system', content: currentSystemPrompt },
            ...previousTurns.map((m: { role: string; content: string }) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
            { role: 'user', content: enhancedUserPrompt },
          ];

          const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${candidate.key}`,
            },
            body: JSON.stringify({
              model: 'qwen/qwen3.8-27b',
              messages: groqMessages,
              stream: true,
              temperature: targetTemperature,
            }),
          });

          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let receivedAnyToken = false;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const text = parsed.choices?.[0]?.delta?.content;
                    if (text) {
                      receivedAnyToken = true;
                      sendEvent('token', { text });
                    }
                  } catch {
                    // Ignore chunk parse error
                  }
                }
              }
            }

            if (receivedAnyToken) {
              const latency = Date.now() - tStart;
              updateMetric(candidate.id, latency, true);
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Quen' });
              sendEvent('done', { success: true });
              res.end();
              return;
            }
          } else if (response.status === 429) {
            providerMetrics['groq-ai'].rateLimitedUntil = Date.now() + 60000;
          }
        }

        if (candidate.type === 'gemini') {
          const gemClient = candidate.key ? getGeminiClient(candidate.key) : getFirstAvailableGeminiClient()?.client;
          if (gemClient) {
            sendEvent('provider', { name: 'Nexus Quen' });

            const formattedHistory = previousTurns.map((msg: { role: string; content: string }) => ({
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }],
            }));

            const baseTurnParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
            for (const img of imageParts) {
              baseTurnParts.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.data,
                },
              });
            }

            const searchQueries: string[] = [];
            const sources: Array<{ title: string; url: string }> = [];
            let responseStream: any = null;

            if (wantsWebSearch) {
              // 1. Try Google Search Grounding with official models
              for (const m of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']) {
                try {
                  const currentTurnParts = [...baseTurnParts, { text: enhancedUserPrompt }];
                  const allContents = [...formattedHistory, { role: 'user', parts: currentTurnParts }];
                  responseStream = await gemClient.models.generateContentStream({
                    model: m,
                    contents: allContents,
                    config: {
                      systemInstruction: currentSystemPrompt,
                      tools: [{ googleSearch: {} }],
                      temperature: targetTemperature,
                    },
                  });
                  break;
                } catch {
                  // Tool error or quota; try next or fall back to public live web search
                }
              }

              // 2. If Google Search tool quota is exhausted (429), use live web search fallback
              if (!responseStream) {
                const liveSearch = await searchLiveWebFallback(userPromptRaw);
                for (const q of liveSearch.searchQueries) {
                  if (!searchQueries.includes(q)) searchQueries.push(q);
                }
                for (const s of liveSearch.sources) {
                  if (!sources.some((ex) => ex.url === s.url)) sources.push(s);
                }

                const promptWithWeb = liveSearch.contextSnippet
                  ? `${enhancedUserPrompt}\n\n[INFORMACIÓN DE BÚSQUEDA WEB EN VIVO VERIFICADA]:\n${liveSearch.contextSnippet}\nUsa estos datos web recientes para responder con máxima precisión al usuario.`
                  : enhancedUserPrompt;

                for (const m of preferredGeminiModels) {
                  try {
                    const currentTurnParts = [...baseTurnParts, { text: promptWithWeb }];
                    const allContents = [...formattedHistory, { role: 'user', parts: currentTurnParts }];
                    responseStream = await gemClient.models.generateContentStream({
                      model: m,
                      contents: allContents,
                      config: {
                        systemInstruction: currentSystemPrompt,
                        temperature: targetTemperature,
                      },
                    });
                    break;
                  } catch {
                    // Try next model
                  }
                }
              }
            } else {
              // Standard generation without web search
              for (const m of preferredGeminiModels) {
                try {
                  const currentTurnParts = [...baseTurnParts, { text: enhancedUserPrompt }];
                  const allContents = [...formattedHistory, { role: 'user', parts: currentTurnParts }];
                  responseStream = await gemClient.models.generateContentStream({
                    model: m,
                    contents: allContents,
                    config: {
                      systemInstruction: currentSystemPrompt,
                      temperature: targetTemperature,
                    },
                  });
                  break;
                } catch {
                  // Try next model
                }
              }
            }

            if (responseStream) {
              let receivedAnyToken = false;

              for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                  receivedAnyToken = true;
                  sendEvent('token', { text });
                }

                // Extract Grounding metadata (Google Search citations and queries)
                const gm = chunk.candidates?.[0]?.groundingMetadata;
                if (gm) {
                  if (gm.webSearchQueries && Array.isArray(gm.webSearchQueries)) {
                    for (const q of gm.webSearchQueries) {
                      if (q && !searchQueries.includes(q)) {
                        searchQueries.push(q);
                      }
                    }
                  }
                  if (gm.groundingChunks && Array.isArray(gm.groundingChunks)) {
                    for (const gc of gm.groundingChunks) {
                      if (gc.web?.uri && gc.web?.title) {
                        if (!sources.some((s) => s.url === gc.web!.uri)) {
                          sources.push({
                            title: gc.web.title,
                            url: gc.web.uri,
                          });
                        }
                      }
                    }
                  }
                }
              }

              if (receivedAnyToken) {
                if (sources.length > 0 || searchQueries.length > 0) {
                  sendEvent('grounding', {
                    searchQueries,
                    sources,
                  });
                }
                const latency = Date.now() - tStart;
                updateMetric(candidate.id, latency, true);
                sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Quen' });
                sendEvent('done', { success: true });
                res.end();
                return;
              }
            }
          }
        }

        if (candidate.type === 'nvidia' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Quen' });

          const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${candidate.key}`,
            },
            body: JSON.stringify({
              model: 'meta/llama-3.3-70b-instruct',
              messages: [
                { role: 'system', content: currentSystemPrompt },
                ...previousTurns.map((m: { role: string; content: string }) => ({
                  role: m.role === 'assistant' ? 'assistant' : 'user',
                  content: m.content,
                })),
                { role: 'user', content: enhancedUserPrompt },
              ],
              stream: true,
              temperature: targetTemperature,
            }),
          });

          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let receivedAny = false;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const text = parsed.choices?.[0]?.delta?.content;
                    if (text) {
                      receivedAny = true;
                      sendEvent('token', { text });
                    }
                  } catch {
                    // Ignore parse error
                  }
                }
              }
            }

            if (receivedAny) {
              const latency = Date.now() - tStart;
              updateMetric(candidate.id, latency, true);
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Quen' });
              sendEvent('done', { success: true });
              res.end();
              return;
            }
          } else if (response.status === 429) {
            providerMetrics[candidate.id].rateLimitedUntil = Date.now() + 60000;
          }
        }

        if (candidate.type === 'mistral' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Quen' });

          const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${candidate.key}`,
            },
            body: JSON.stringify({
              model: 'ministral-8b-latest',
              messages: [
                { role: 'system', content: currentSystemPrompt },
                ...previousTurns.map((m: { role: string; content: string }) => ({
                  role: m.role === 'assistant' ? 'assistant' : 'user',
                  content: m.content,
                })),
                { role: 'user', content: enhancedUserPrompt },
              ],
              stream: true,
            }),
          });

          if (response.ok && response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let receivedAny = false;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const text = parsed.choices?.[0]?.delta?.content;
                    if (text) {
                      receivedAny = true;
                      sendEvent('token', { text });
                    }
                  } catch {
                    // Ignore
                  }
                }
              }
            }

            if (receivedAny) {
              const latency = Date.now() - tStart;
              updateMetric(candidate.id, latency, true);
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Quen' });
              sendEvent('done', { success: true });
              res.end();
              return;
            }
          }
        }
      } catch (err) {
        updateMetric(candidate.id, Date.now() - tStart, false);
      }
    }

    // Fallback if no provider key is configured or all failed
    sendEvent('provider', { name: 'Nexus Quen' });
    const hasAnyConfiguredKey = Boolean(
      activeKeys.GEMINI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        activeKeys.GROQ_API_KEY ||
        process.env.GROQ_API_KEY ||
        activeKeys.MISTRAL_API_KEY ||
        process.env.MISTRAL_API_KEY ||
        Object.keys(activeKeys).some((k) => k.startsWith('NVIDIA_API_KEY_') && activeKeys[k])
    );

    let localFallback: string;
    if (hasAnyConfiguredKey) {
      localFallback = `¡Hola! Soy Nexus Quen. Los servidores en la nube experimentaron una alta congestión momentánea o saturación de cuota (429 Rate Limit). Por favor, intenta de nuevo en unos segundos.`;
    } else {
      localFallback = `¡Hola! Soy Nexus Quen, tu inteligencia artificial personal.\n\nHe recibido tu solicitud. Para habilitar respuestas en tiempo real mediante los modelos más rápidos de la nube, puedes configurar al menos una clave en el **Gestor de APIs** (Google AI Studio, Groq, NVIDIA slots o Mistral).`;
    }
    sendEvent('token', { text: localFallback });
    sendEvent('done', { success: true });
    res.end();
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Error al procesar la solicitud en Nexus AI.';
    sendEvent('error', { message: errMessage });
    res.end();
  }
});

// Image generation endpoint with Automatic Prompt Enhancement & Multi-Key rotation
app.post('/api/generate-image', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Debes proporcionar un texto descriptivo para generar la imagen.' });
    return;
  }

  // Detect requested aspect ratio (16:9, 9:16, 1:1)
  const aspectRatio = detectAspectRatio(prompt);

  // Check if any Google AI Studio key is configured
  const hasAnyGeminiKey = [1, 2, 3, 4, 5].some((i) =>
    Boolean(activeKeys[`GEMINI_API_KEY_${i}`] || (i === 1 ? activeKeys.GEMINI_API_KEY : undefined))
  );

  if (!hasAnyGeminiKey) {
    res.status(503).json({
      error: 'La generación de imágenes requiere que configures al menos una clave de Google AI Studio (Imagen 3).',
    });
    return;
  }

  try {
    // 1. Automatically enhance the user's prompt into a complete, professional photographic/art prompt
    const enhancedPrompt = await enhanceImagePrompt(prompt, aspectRatio);

    // 2. Try generation across all configured Google keys until successful
    let imageUrl: string | null = null;
    let lastError = 'No se pudo generar la imagen.';

    for (let slot = 1; slot <= 5; slot++) {
      const key = activeKeys[`GEMINI_API_KEY_${slot}`] || (slot === 1 ? activeKeys.GEMINI_API_KEY : undefined);
      if (!key) continue;

      const client = getGeminiClient(key);
      if (!client) continue;

      for (const imagenModel of ['imagen-3.0-generate-002', 'imagen-3.0-fast-generate-001']) {
        try {
          const response = await client.models.generateImages({
            model: imagenModel,
            prompt: enhancedPrompt,
            config: {
              numberOfImages: 1,
              aspectRatio: aspectRatio,
              outputMimeType: 'image/jpeg',
            },
          });

          const bytes = response?.generatedImages?.[0]?.image?.imageBytes;
          if (bytes) {
            imageUrl = `data:image/jpeg;base64,${bytes}`;
            break;
          }
        } catch (genErr: any) {
          lastError = genErr?.message || lastError;
        }
      }

      if (imageUrl) break;
    }

    // High quality AI image fallback if Google quota is exceeded
    if (!imageUrl) {
      try {
        const encoded = encodeURIComponent(enhancedPrompt.slice(0, 450));
        const dims =
          aspectRatio === '16:9'
            ? 'width=1280&height=720'
            : aspectRatio === '9:16'
              ? 'width=720&height=1280'
              : 'width=1024&height=1024';
        const pollUrl = `https://image.pollinations.ai/prompt/${encoded}?${dims}&nologo=true&enhance=false`;
        const resPoll = await fetch(pollUrl);
        if (resPoll.ok) {
          const arrayBuffer = await resPoll.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          imageUrl = `data:image/jpeg;base64,${base64}`;
        }
      } catch (pollErr: any) {
        lastError = pollErr?.message || lastError;
      }
    }

    if (!imageUrl) {
      res.status(502).json({
        error: `Error al generar la imagen: ${lastError}`,
      });
      return;
    }

    res.json({
      success: true,
      imageUrl,
      prompt, // original prompt
      enhancedPrompt, // improved professional prompt
      aspectRatio,
      model: 'Nexus Quen Vision Synthesizer',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al generar la imagen.';
    res.status(500).json({ error: message });
  }
});

// ─── Health-check / Keep-alive endpoint ───────────────────────────────────────
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'alive', ts: Date.now(), uptime: process.uptime() });
});

// ─── Auto-ping every 4 minutes so Render Free Tier stays awake ────────────────
function startKeepAlive() {
  const interval = 4 * 60 * 1000; // 4 minutes (Render duerme tras ~15 min inactivo)

  // URL externa de Render (el self-ping a localhost NO cuenta como actividad)
  const externalUrl = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/api/ping`
    : `http://localhost:${PORT}/api/ping`;

  setInterval(async () => {
    try {
      const response = await fetch(externalUrl);
      const data = await response.json() as { status: string; ts: number };
      console.log(`[KeepAlive] 🟢 Ping OK — ${new Date(data.ts).toISOString()}`);
    } catch (err) {
      // Si el ping externo falla, intentar localhost como fallback
      try {
        await fetch(`http://localhost:${PORT}/api/ping`);
        console.log('[KeepAlive] 🟡 Ping localhost OK (fallback)');
      } catch {
        console.warn('[KeepAlive] ⚠️  Ping falló:', err);
      }
    }
  }, interval);
  console.log(`[KeepAlive] Auto-ping activado cada 4 min → ${externalUrl}`);
}

// ─── Start Express server and mount Vite / Static files ────────────────────────
async function startServer() {
  const distDir = path.join(__dirname, 'dist');
  const indexHtml = path.join(distDir, 'index.html');

  if (fs.existsSync(indexHtml)) {
    console.log(`[Server] Serving production build from ${distDir}`);
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(indexHtml);
    });
  } else {
    console.log('[Server] Starting Vite development middleware');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexus AI Server running on port ${PORT}`);
    startKeepAlive();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
