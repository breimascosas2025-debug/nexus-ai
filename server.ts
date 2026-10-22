import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

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

// 4 Dedicated NVIDIA image model keys (optional overrides)
const imageKeyNames = ['NVIDIA_KEY_FLUX_KLEIN', 'NVIDIA_KEY_FLUX_DEV', 'NVIDIA_KEY_QWEN_IMAGEN', 'NVIDIA_KEY_SD_35_LARGE'];
for (const kName of imageKeyNames) {
  if (process.env[kName]) {
    activeKeys[kName] = process.env[kName]!;
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

// ─── Dynamic temporal context (computed at startup, never hardcoded) ──────────
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_DATE_ES = `${NOW.getDate()} de ${MESES_ES[NOW.getMonth()]} de ${CURRENT_YEAR}`;

// Gemini chat model fallback chains (verified against the live catalog)
const GEMINI_CHAT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
const GEMINI_DEEP_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-flash-latest'];
const GEMINI_VISION_VERIFY_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

// System prompt enforcing identity Nexus Qwen and NEXUS IA
const NEXUS_SYSTEM_INSTRUCTION = `Eres Nexus Qwen, la inteligencia artificial de Nexus AI.

Reglas obligatorias de identidad y comportamiento:
1. Tu nombre oficial e inequívoco es Nexus Qwen. La plataforma se llama Nexus AI.
2. CONTEXTO TEMPORAL ACTUAL:
   La fecha actual del sistema es ${CURRENT_DATE_ES}. Todo razonamiento sobre edades, eventos, "hoy", "este año" o actualidad debe tomar esta fecha como presente. Nunca digas que un evento ya ocurrido "aún no ha sucedido": si tu conocimiento no alcanza la fecha actual y no tienes datos web, dilo brevemente en una sola línea en lugar de inventar.

   EVENTOS VERIFICADOS (datos confirmados con fuentes reales):
   - La Copa Mundial de la FIFA 2026 se jugó en Estados Unidos, México y Canadá del 11 de junio al 19 de julio de 2026 (primera edición con 48 selecciones). El campeón fue ESPAÑA, que venció 1-0 a Argentina en la final del 19 de julio de 2026 en el Estadio de Nueva York/Nueva Jersey (MetLife Stadium), con gol de Ferrán Torres en la prórroga. Es el segundo título mundial de España (tras Sudáfrica 2010). Entrenador campeón: Luis de la Fuente.
3. REGLA ESTRICTA SOBRE EL CREADOR:
   Únicamente cuando el usuario te pregunte de forma explícita "¿Quién te creó?", "¿Quién es tu creador?" o "¿Quién eres?", debes responder claramente:
   "Soy Nexus Qwen, la inteligencia artificial de Nexus AI, creada por Breitan Céspedes Monge. Estoy diseñada para ayudarte con preguntas, razonamiento, programación, análisis de archivos y creación de imágenes."
   Fuera de esas preguntas específicas sobre tu origen o creador, NUNCA menciones el nombre de Breitan Céspedes Monge de forma espontánea o en respuestas cotidianas.
4. Si el usuario te saluda por su nombre, responde amigablemente utilizando su nombre de forma natural. Nunca confundas el nombre del usuario con el nombre de tu creador.
5. NUNCA digas que Google, OpenAI, Meta, NVIDIA, Mistral, Groq o ninguna otra corporación te creó. Si alguna de esas tecnologías provee infraestructura técnica, es únicamente un servicio tecnológico interno.
6. Comunícate en español de manera predeterminada con un tono natural, amigable, riguroso y profesional.

PROTOCOLO DE RESPUESTA DIRECTA (extremadamente importante):
- Calibra la longitud de cada respuesta con la complejidad real de la pregunta. Pregunta simple = respuesta breve y definitiva. Ejemplo: "¿Cuánto es 1 + 1?" → responde exactamente: 2
- PROHIBIDO añadir explicaciones no solicitadas, introducciones ("¡Claro!", "Por supuesto", "¡Gran pregunta!"), conclusiones obvias, resúmenes de tu propia respuesta ni ofrecimientos de ayuda adicionales cuando la pregunta es simple o de respuesta única.
- Si el usuario pide "solo la respuesta", "solo el resultado" o usa una pregunta cerrada corta, entrega ÚNICAMENTE el dato o resultado final, sin desarrollo.
- Si el usuario pide explicación, procedimiento, "paso a paso", "por qué" o "cómo", entonces sí desarrolla la explicación completa y ordenada.
- En ejercicios y cálculos: verifica internamente el resultado antes de responderlo. Nunca inventes resultados.
- Si un dato no puede verificarse y no hay información web disponible, indícalo en una sola frase breve. Nunca inventes fechas, resultados ni noticias.

INTERPRETACIÓN DE INSTRUCCIONES:
- Comprende la intención del usuario aunque haya errores ortográficos, tildes omitidas, expresiones informales o redacción imperfecta. Corrige mentalmente e interpreta, sin señalar los errores ni pedir reescrituras.
- Nunca cambies la intención original del pedido. Si hay ambigüedad razonable, elige la interpretación más probable y responde; solo pregunta si es genuinamente imposible de determinar.
- Mantén el contexto de toda la conversación: referencias como "eso", "el segundo", "el otro ejemplo" se refieren a turnos previos.
- Detecta automáticamente el tipo de tarea: respuesta directa, explicación, traducción, resolución de ejercicio, análisis de imagen/documento o solicitud de imagen, y ejecútala sin pedir confirmaciones innecesarias.

VERIFICACIÓN Y RIGOR:
- En matemáticas: comprueba las operaciones antes de responder (recalcula mentalmente, sustituye en ecuaciones para verificar).
- Si el usuario adjunta una imagen (ejercicio, documento, pregunta escolar), transcribe fielmente lo observable y resuélvelo. No inventes datos que no estén en la imagen.
- Si el usuario solicita generar una imagen, describe la creación y confirma la generación visual.`;

// ─── Local deterministic math engine (instant exact answers, no LLM) ─────────
function normalizeMathQuestion(raw: string): string | null {
  let t = raw.trim();
  // Only handle short prompts that are essentially the operation itself
  if (t.length > 120) return null;
  t = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Reject conversational/complex asks (let the LLM handle those)
  if (/(explica|explicame|procedimiento|paso a paso|por que|porque|demuestra|justifica|historia|demostracion)/.test(t)) return null;

  t = t
    .replace(/^[\s¿?¡!]+/, '')
    .replace(/(cuanto es|cuanto son|calcula(?:me)?|calcule|resultado de|cual es el resultado de|resuelve(?:me)?|cuanto vale|cuanto da|dime cuanto es)\s+/, '')
    .replace(/[\s?¡!]+$/, '');
  // Percentage: "15% de 200"
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*%\s*de\s*(\d+(?:[.,]\d+)?)/g, '($1/100)*$2');
  // Spanish word operators
  t = t
    .replace(/\b(mas)\b/g, '+')
    .replace(/\b(menos)\b/g, '-')
    .replace(/\b(por|multiplicado por|x)\b/g, '*')
    .replace(/\b(dividido entre|dividido por|entre)\b/g, '/')
    .replace(/\b(elevado a|a la potencia de)\b/g, '^')
    .replace(/\bal cuadrado\b/g, '^2')
    .replace(/\bal cubo\b/g, '^3')
    .replace(/\braiz cuadrada de\s*(\d+(?:[.,]\d+)?)/g, 'sqrt($1)')
    .replace(/\braiz de\s*(\d+(?:[.,]\d+)?)/g, 'sqrt($1)');
  // Normalize decimal separators
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  // Must contain at least one digit and one operator, and only allowed chars
  if (!/\d/.test(t)) return null;
  if (!/[+\-*/^]|sqrt\(/.test(t)) return null;
  if (!/^[0-9+\-*/^().\ssqrt]*$/.test(t)) return null;
  return t.trim() || null;
}

function evaluateMathTokens(src: string): number | null {
  // Recursive descent parser: + - * / ^ sqrt and parentheses
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  const eat = (c: string) => { if (s[i] === c) { i++; return true; } return false; };

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parseFactor(): number | null {
    const base = parseUnary();
    if (base === null) return null;
    if (peek() === '^') {
      i++;
      const exp = parseFactor();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  }
  function parseUnary(): number | null {
    if (eat('-')) { const v = parseUnary(); return v === null ? null : -v; }
    if (eat('+')) return parseUnary();
    return parsePrimary();
  }
  function parsePrimary(): number | null {
    if (s.startsWith('sqrt(', i)) {
      i += 5;
      const v = parseExpression();
      if (v === null || !eat(')')) return null;
      if (v < 0) return null;
      return Math.sqrt(v);
    }
    if (eat('(')) {
      const v = parseExpression();
      if (v === null || !eat(')')) return null;
      return v;
    }
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (start === i) return null;
    const num = Number(s.slice(start, i));
    return Number.isFinite(num) ? num : null;
  }

  const result = parseExpression();
  if (result === null || i < s.length || !Number.isFinite(result)) return null;
  return result;
}

function formatMathResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded).replace('.', ',');
}

// Try to answer pure arithmetic questions locally (deterministic, zero latency, exact)
function tryLocalMath(raw: string): string | null {
  const normalized = normalizeMathQuestion(raw);
  if (!normalized) return null;
  const value = evaluateMathTokens(normalized);
  if (value === null) return null;
  return formatMathResult(value);
}

// ─── Brevity / intent detection ───────────────────────────────────────────────
type ResponseIntent = 'minimal' | 'explain' | 'normal';

function detectResponseIntent(text: string): ResponseIntent {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/(explica|explicame|por que|procedimiento|paso a paso|demuestra|demostracion|justifica|detall(|ame|alo)|desarrolla|enseñame|ensename)/.test(t)) {
    return 'explain';
  }
  if (/(solo la respuesta|solo el resultado|sin explicaci|respuesta corta|solo dime|unicamente la respuesta|solo responde)/.test(t)) {
    return 'minimal';
  }
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  const isQuestionish = /[?¿]|^(cuanto|que|quien|cuando|donde|cual|cuales|como|capital|cual es)/.test(t);
  // Short and question-like → minimal (e.g. "¿cuánto es 1+1?", "¿capital de Francia?")
  if (words <= 10 && isQuestionish) return 'minimal';
  return 'normal';
}

function buildIntentInstruction(intent: ResponseIntent): string {
  switch (intent) {
    case 'minimal':
      return '\n\n[PROTOCOLO DE RESPUESTA MÍNIMA — PRIORIDAD MÁXIMA]\nLa pregunta del usuario es simple o pide solo el dato. Responde ÚNICAMENTE con la respuesta final (una palabra, un número o una frase corta). Sin introducciones, sin contexto, sin explicaciones, sin repetir la pregunta, sin ofertas de ayuda.';
    case 'explain':
      return '\n\n[PROTOCOLO EXPLICATIVO]\nEl usuario solicitó explicación o procedimiento. Desarrolla la respuesta de forma completa, ordenada y didáctica (pasos numerados cuando aplique), verificando cada cálculo antes de afirmarlo. Sin relleno innecesario.';
    default:
      return '\n\n[PROTOCOLO DE LONGITUD EQUILIBRADA]\nCalibra la extensión exactamente con la complejidad de la pregunta: completo pero sin relleno, sin introducciones genéricas ni conclusiones que repitan lo ya dicho.';
  }
}

// ─── Student mode subject instructions ────────────────────────────────────────
export type StudentSubject = 'general' | 'matematicas' | 'ciencias' | 'sociales' | 'espanol' | 'ingles' | 'frances';

const STUDENT_BASE_RULES = `
[MODO ESTUDIANTE ACTIVO]
Actúa como un tutor académico experto, preciso y didáctico. Reglas obligatorias:
1. CORRECCIÓN ANTE TODO: verifica mentalmente cada resultado, cálculo, fecha o regla gramatical antes de responderla. Si no estás seguro de un dato, dilo brevemente en lugar de inventar.
2. EJERCICIOS: resuélvelos correctamente. Por defecto muestra un procedimiento resumido y claro, y marca la respuesta final (ejemplo: **Respuesta: x = 5**). Si el usuario pide "solo la respuesta" o "solo el resultado", entrega únicamente el resultado final sin procedimiento.
3. FOTOS DE EJERCICIOS O DOCUMENTOS: si el usuario adjunta una imagen, transcribe primero lo que se ve (enunciado, opciones, datos), luego resuelve. No inventes contenido que no sea visible.
4. LENGUAJE: claro, amigable y adaptado a nivel escolar/estudiantil. Sin relleno ni sermones.
5. En cálculos: muestra las operaciones esenciales paso a paso y verifica el resultado final antes de darlo.`;

const STUDENT_SUBJECT_INSTRUCTIONS: Record<StudentSubject, string> = {
  general: `${STUDENT_BASE_RULES}\nDominio: todas las materias escolares (matemáticas, ciencias, estudios sociales, español, inglés y francés). Detecta automáticamente la materia de cada pregunta.`,
  matematicas: `${STUDENT_BASE_RULES}\nDominio: MATEMÁTICAS — aritmética, álgebra, geometría, trigonometría, funciones, probabilidad y estadística.\n- Muestra el procedimiento paso a paso con las operaciones explícitas.\n- En ecuaciones: despeja paso a paso y VERIFICA sustituyendo el resultado en la ecuación original.\n- En geometría: indica la fórmula usada, la sustitución de valores y las unidades.\n- En problemas verbales: identifica los datos, plantea y resuelve.\n- Marca siempre la respuesta final con unidades cuando correspondan.`,
  ciencias: `${STUDENT_BASE_RULES}\nDominio: CIENCIAS — biología, química y física.\n- Física: indica la fórmula, sustitución, resultado con unidades y notación científica cuando corresponda.\n- Química: balancea ecuaciones mostrando el método; usa la tabla periódica correctamente; define nomenclatura IUPAC y común.\n- Biología: explica procesos (célula, genética, ecosistemas) con precisión terminológica y ejemplos.\n- Distingue claramente hipótesis, teoría y ley.`,
  sociales: `${STUDENT_BASE_RULES}\nDominio: ESTUDIOS SOCIALES — historia y geografía de Costa Rica, América y el mundo.\n- Prioriza precisión en fechas, personajes, procesos y periodos.\n- Para Costa Rica: civilizaciones indígenas, conquista, independencia (1821), campaña nacional (1856-1857), reforma liberal, Estado benefactor, abolición del ejército (1948), actualidad.\n- Geografía: provincias, cantones, capitales, ríos, cordilleras, países y capitales del mundo.\n- Usa cronología clara (antes/después, causas/consecuencias) cuando aplique.`,
  espanol: `${STUDENT_BASE_RULES}\nDominio: ESPAÑOL — ortografía, gramática, literatura, redacción y comprensión lectora.\n- Ortografía según la RAE: tildes (agudas, llanas, esdrújulas), b/v, g/j, h, c/s/z/x, puntuación.\n- REGLA CRÍTICA PARA TILDES: cuando el usuario pregunta si una palabra "lleva tilde" o "tiene tilde", la pregunta significa "¿debe escribirse con tilde según las reglas de acentuación?" (NO si la forma citada ya contiene la tilde escrita). Antes de responder, razona silábicamente: identifica la sílaba tónica, clasifica la palabra (aguda/llana/esdrújula) y aplica la regla (agudas llevan tilde si terminan en n, s o vocal; llanas llevan tilde si NO terminan en n, s o vocal; esdrújulas siempre). Ejemplos verificados: "condición" → SÍ (aguda terminada en n), "árbol" → SÍ (llana terminada en l), "camión" → SÍ (aguda terminada en n), "casa" → NO (llana terminada en vocal).\n- Gramática: partes de la oración, análisis sintáctico (sujeto/predicado, complementos), morfología y conjugaciones.\n- Análisis de textos: tema, idea principal, intención del autor, figuras literarias.\n- Corrige textos mostrando los errores y la forma correcta. Al corregir ortografía, señala la regla aplicada.`,
  ingles: `${STUDENT_BASE_RULES}\nDominio: INGLÉS.\n- Traducces español→inglés y inglés→español naturales y correctas (no literales cuando no suenen bien).\n- Gramática: tiempos verbales, modales, condicionales, phrasal verbs, preposiciones.\n- Vocabulario: da la palabra, pronunciación aproximada y un ejemplo de uso.\n- Si piden ejercicios, corrígelos indicando por qué cada opción es correcta o incorrecta.`,
  frances: `${STUDENT_BASE_RULES}\nDominio: FRANCÉS.\n- Traducciones español→francés y francés→español naturales y correctas.\n- Gramática: conjugación (indicatif, subjonctif, conditionnel, impératif), articles, pronoms, prépositions, genre et nombre.\n- Vocabulaire: mot, prononciation approximative et exemple d'utilisation.\n- Si piden ejercicios, corrígelos indicando la regla aplicada.`,
};

// ─── Exact text extraction for image generation ──────────────────────────────
export function extractExactText(prompt: string): { exactText: string | null; cleanPrompt: string } {
  // 1. Quoted segments: «...», "...", '...', “...” (prefer these: highest precision)
  const quotedMatches: string[] = [];
  const quoteRegex = /[«"“'']([^«»"“”'']{1,90})[»"”'']/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(prompt)) !== null) {
    const inner = m[1].trim();
    if (inner.length >= 1 && /[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ¿?¡!]/.test(inner)) {
      quotedMatches.push(inner);
    }
  }
  if (quotedMatches.length > 0) {
    const exactText = quotedMatches.join('\n');
    let clean = prompt;
    for (const q of quotedMatches) {
      clean = clean.replace(new RegExp(`[«"“'']${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[»"”'']`), '').trim();
    }
    return { exactText, cleanPrompt: cleanCleanPrompt(clean) };
  }

  // 2. Natural language patterns: "que diga X", "con el texto X", "texto: X", "diciendo X"
  const kw = prompt.match(/(?:que diga(?: exactamente)?|que escriba|que ponga|que se lea|con el texto|con la palabra|el texto|texto\s*:|diciendo)\s+(.+)$/i);
  if (kw) {
    let candidate = kw[1].trim();
    // Cut at sentence end / conjunction that clearly separates design from text
    candidate = candidate.split(/\.\s|\.$|,\s+(?:con|sobre|en|de fondo|en un|en el)/i)[0].trim();
    // Remove trailing design instructions
    candidate = candidate.replace(/\s+(?:en|con|sobre)\s+(?:letras|tipografía|fondo|colores?).*/i, '').trim();
    if (candidate.length >= 1 && candidate.length <= 90 && /[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/.test(candidate)) {
      const clean = prompt.replace(kw[0], '').trim();
      return { exactText: candidate, cleanPrompt: cleanCleanPrompt(clean) };
    }
  }
  return { exactText: null, cleanPrompt: prompt.trim() };
}

function cleanCleanPrompt(p: string): string {
  return p
    .replace(/\s*(que diga(?: exactamente)?|que escriba|que ponga|con el texto|texto\s*:)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,:;—-]+|[\s,:;—-]+$/g, '')
    .trim() || 'diseño profesional';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ─── Exact typography overlay (guarantees pixel-perfect text) ─────────────────
async function renderTextOverlay(width: number, height: number, exactText: string): Promise<Buffer> {
  const paragraphs = exactText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const longest = Math.max(...paragraphs.map((p) => p.length));
  // Auto font size: fit the longest line into ~86% of width
  let fontSize = Math.min(height * 0.16, (width * 0.86) / (longest * 0.58));
  fontSize = Math.max(22, Math.min(fontSize, width * 0.14));
  const lineHeight = fontSize * 1.28;

  // Word-wrap each paragraph
  const maxChars = Math.max(8, Math.floor((width * 0.86) / (fontSize * 0.55)));
  const lines: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/);
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars && line) {
        lines.push(line.trim());
        line = w;
      } else {
        line = (line + ' ' + w).trim();
      }
    }
    if (line) lines.push(line.trim());
  }

  const totalTextHeight = lines.length * lineHeight;
  const startY = height / 2 - totalTextHeight / 2 + fontSize * 0.9;
  const bandTop = height / 2 - totalTextHeight / 2 - fontSize * 0.55;
  const bandHeight = totalTextHeight + fontSize * 1.1;

  const textElems = lines
    .map((line, idx) => {
      return `      <text x="${width / 2}" y="${startY + idx * lineHeight}" text-anchor="middle" font-family="Arial, 'Segoe UI', 'DejaVu Sans', sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" filter="url(#txtShadow)">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" stop-opacity="0"/>
      <stop offset="50%" stop-color="rgba(0,0,0,0.55)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)" stop-opacity="0"/>
    </linearGradient>
    <filter id="txtShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.max(2, fontSize * 0.05)}" stdDeviation="${Math.max(2, fontSize * 0.06)}" flood-color="rgba(0,0,0,0.85)"/>
    </filter>
  </defs>
  <rect x="0" y="${Math.max(0, bandTop)}" width="${width}" height="${bandHeight}" fill="url(#scrim)"/>
${textElems}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── Vision verification of rendered text ─────────────────────────────────────
async function verifyImageText(
  imageBase64Png: string,
  expectedText: string
): Promise<{ verified: boolean; transcribed: string } | null> {
  const g = getFirstAvailableGeminiClient();
  if (!g) return null;
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]/g, '');
  for (const model of GEMINI_VISION_VERIFY_MODELS) {
    try {
      const r = await g.client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: imageBase64Png } },
              { text: 'Transcribe EXACTLY all the text visible in this image, character by character, preserving accents, punctuation and line breaks. Output ONLY the transcribed text, nothing else.' },
            ],
          },
        ],
      });
      const transcribed = (r.text || '').trim();
      if (!transcribed) continue;
      const nExp = norm(expectedText.replace(/\n/g, ''));
      const nGot = norm(transcribed.replace(/\n/g, ''));
      const verified = nExp === nGot || nExp.includes(nGot) || nGot.includes(nExp);
      return { verified, transcribed };
    } catch {
      // try next model
    }
  }
  return null;
}

// ─── Reference image analysis (style guidance for generation) ─────────────────
async function describeReferenceImages(
  referenceImages: Array<{ type?: string; data: string }>
): Promise<string> {
  const g = getFirstAvailableGeminiClient();
  if (!g) return '';
  const parts: Array<Record<string, unknown>> = [
    { text: 'Describe in English, in 2 short sentences per image: the main subject, the visual style, the color palette and the composition of each attached image. Output only the descriptions.' },
  ];
  for (const img of referenceImages.slice(0, 3)) {
    const cleanB64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
    parts.push({ inlineData: { mimeType: img.type || 'image/png', data: cleanB64 } });
  }
  for (const model of GEMINI_VISION_VERIFY_MODELS) {
    try {
      const r = await g.client.models.generateContent({ model, contents: [{ role: 'user', parts }] });
      const t = (r.text || '').trim();
      if (t) return t;
    } catch {
      // try next model
    }
  }
  return '';
}


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

  // 6-15. NVIDIA NIM (Keys 6 to 15, total 10 keys: FLUX.2-klein-4b, FLUX.1-dev, Qwen & Vision Synthesis)
  for (let i = 1; i <= 10; i++) {
    const key = activeKeys[`NVIDIA_API_KEY_${i}`];
    statuses.push({
      id: `nvidia-slot-${i}`,
      name: `NVIDIA NIM Key #${i} (FLUX.2-klein / FLUX.1-dev)`,
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
    primaryModel: 'Nexus Qwen (Arquitectura Multimodal Unificada)',
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
      for (const modelName of GEMINI_CHAT_MODELS) {
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
      const rawKey = activeKeys[`NVIDIA_API_KEY_${slotNum}`];
      if (!rawKey) {
        res.status(400).json({ status: 'no_key', error: `No hay clave en slot NVIDIA #${slotNum}.` });
        return;
      }
      const key = rawKey.replace(/^Bearer\s+/i, '').trim();
      const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'meta/llama-3.2-11b-vision-instruct',
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
async function enhanceImagePrompt(
  userPrompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16',
  referenceContext = ''
): Promise<string> {
  const geminiAvailable = getFirstAvailableGeminiClient();
  if (geminiAvailable) {
    try {
      let response: any = null;
      for (const m of GEMINI_CHAT_MODELS) {
        try {
          response = await geminiAvailable.client.models.generateContent({
            model: m,
            contents: `You are the master AI visual prompt engineer for high-end image diffusion models (Flux and Midjourney).
Convert and expand the user's request into a stunning, descriptive English prompt tailored for photorealistic or artistic synthesis.

User request: "${userPrompt}"
Aspect ratio: ${aspectRatio}
${referenceContext ? `Reference image(s) provided by the user — keep the subject/style consistent with them:\n${referenceContext}` : ''}

Strict Rules:
1. PRESERVE THE EXACT SUBJECT: focus strictly on what the user asked for. Never insert random people or objects unless explicitly requested.
2. TEXT & TYPOGRAPHY: If the user asks for specific words, letters or signs (for example: "HOLA", "BIENVENIDO", a title or a name), include the EXACT text in literal double quotes. The quoted text is SACRED: never translate it, never translate it, never abbreviate it, never add or remove accents, letters or punctuation. Render it as the main typographic element.
3. VISUAL COMPOSITION: Add lighting (cinematic, volumetric, studio, or golden hour), balanced color palette, fine materials, crisp textures, and 8k detail.
4. If aspect ratio is 16:9, specify wide panoramic composition. If 9:16, specify vertical portrait composition. If 1:1, specify symmetrical centered composition.
5. REMOVE CONVERSATIONAL FILLER: Strip phrases like "hazme una imagen", "create an image of", "dibuja", etc.
6. NEVER add watermarks, signatures or random lettering that the user did not request.
7. Return ONLY the English prompt. No greetings, introductions, quotation wrappers or explanations.`,
          });
          if (response?.text) break;
        } catch {
          // try next model
        }
      }

      const text = response?.text?.trim().replace(/^["']|["']$/g, '');
      if (text && text.length > 20) {
        return text;
      }
    } catch {
      // Fallback below
    }
  }

  // Algorithmic fallback
  const orient =
    aspectRatio === '16:9'
      ? 'wide 16:9 cinematic composition'
      : aspectRatio === '9:16'
        ? 'vertical 9:16 portrait composition'
        : 'centered 1:1 balanced composition';

  const cleanPrompt = userPrompt.replace(/^(crea|hazme|haz|genera|diseña|dibuja|pinta)\s+(una\s+)?(imagen|foto|dibujo|ilustración)\s*(de|que\s+diga)?\s*:?\s*/i, '').trim();

  return `High quality ${orient}, photorealistic, stunning lighting, vivid colors, crisp focus, 8k resolution: ${cleanPrompt}`;
}

// Background-only prompt (used when exact text will be overlaid typographically)
async function enhanceBackgroundPrompt(
  userPrompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16',
  referenceContext = ''
): Promise<string> {
  const geminiAvailable = getFirstAvailableGeminiClient();
  if (geminiAvailable) {
    try {
      let response: any = null;
      for (const m of GEMINI_CHAT_MODELS) {
        try {
          response = await geminiAvailable.client.models.generateContent({
            model: m,
            contents: `You are a master AI visual prompt engineer for image diffusion models.
The user wants a professional background/scenic design. The final typography will be added later by a design engine, so the image must NOT contain any text.

User request: "${userPrompt}"
Aspect ratio: ${aspectRatio}
${referenceContext ? `Reference image(s) provided by the user — keep the subject/style consistent with them:\n${referenceContext}` : ''}

Strict Rules:
1. ABSOLUTELY NO TEXT: no words, no letters, no numbers, no signs, no typography, no writing, no watermarks, no logos. Leave a clean, visually calm central area where typography will be placed later.
2. Design a stunning professional background that matches the theme, mood and colors the user wants: cinematic lighting, balanced color palette, fine textures, 8k detail.
3. If aspect ratio is 16:9, wide panoramic composition. If 9:16, vertical portrait composition. If 1:1, symmetrical centered composition.
4. Strip conversational filler like "hazme una imagen", "que diga ...", "create an image of".
5. Return ONLY the English prompt. No explanations.`,
          });
          if (response?.text) break;
        } catch {
          // try next model
        }
      }

      const text = response?.text?.trim().replace(/^["']|["']$/g, '');
      if (text && text.length > 20) {
        return text;
      }
    } catch {
      // Fallback below
    }
  }

  const orient =
    aspectRatio === '16:9'
      ? 'wide 16:9 cinematic composition'
      : aspectRatio === '9:16'
        ? 'vertical 9:16 portrait composition'
        : 'centered 1:1 balanced composition';

  return `Professional background design, ${orient}, cinematic lighting, rich colors, fine textures, 8k detail, absolutely no text, no letters, no words, no typography, clean central area for text placement. Theme: ${userPrompt}`;
}

// Live web search fallback: Wikipedia (ES + EN) full intro extracts + DuckDuckGo instant answers.
// Used when Google Search Grounding is unavailable or quota-exhausted.
async function searchLiveWebFallback(query: string): Promise<{
  searchQueries: string[];
  sources: Array<{ title: string; url: string }>;
  contextSnippet: string;
}> {
  const sources: Array<{ title: string; url: string }> = [];
  const searchQueries: string[] = [query];
  let contextSnippet = '';
  const cleanQ = query.replace(/[?¿!¡]/g, '').trim();

  const wikiExtract = async (lang: 'es' | 'en'): Promise<void> => {
    try {
      const srRes = await fetch(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQ)}&format=json&utf8=1&srlimit=4`,
        { headers: { 'User-Agent': 'NexusAI/1.0 (nexus-ia)' } }
      );
      if (!srRes.ok) return;
      const srData = (await srRes.json()) as any;
      const hits = srData?.query?.search || [];
      // Take the top 3 hits and fetch their full intro extracts (much richer than search snippets)
      const top = hits.slice(0, 3);
      if (top.length === 0) return;
      const titles = top.map((h: any) => h.title);
      const exRes = await fetch(
        `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&titles=${encodeURIComponent(titles.join('|'))}`,
        { headers: { 'User-Agent': 'NexusAI/1.0 (nexus-ia)' } }
      );
      if (!exRes.ok) return;
      const exData = (await exRes.json()) as any;
      const pages = Object.values(exData?.query?.pages || {}) as any[];
      for (const page of pages) {
        const extract: string = (page?.extract || '').trim();
        if (!extract || extract.length < 60) continue;
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`;
        if (!sources.some((s) => s.url === url)) {
          sources.push({ title: page.title, url });
        }
        contextSnippet += `[Fuente: ${page.title} (${url})]: ${extract.slice(0, 1100)}\n\n`;
      }
    } catch {
      // Ignore Wikipedia error
    }
  };

  await wikiExtract('es');
  if (contextSnippet.length < 200) {
    await wikiExtract('en');
  }

  try {
    const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (ddgRes.ok) {
      const ddgData = (await ddgRes.json()) as any;
      if (ddgData?.Heading && ddgData?.AbstractURL) {
        if (!sources.some((s) => s.url === ddgData.AbstractURL)) {
          sources.push({ title: ddgData.Heading, url: ddgData.AbstractURL });
        }
        if (ddgData.Abstract) {
          contextSnippet += `[Resumen Enciclopédico: ${ddgData.Heading}]: ${ddgData.Abstract}\n`;
        }
      }
      // Related topics often carry the actual answer for sports/results queries
      for (const topic of (ddgData?.RelatedTopics || []).slice(0, 3)) {
        if (topic?.Text && topic?.FirstURL && !sources.some((s) => s.url === topic.FirstURL)) {
          sources.push({ title: (topic.Text || '').split(' - ')[0].slice(0, 80), url: topic.FirstURL });
          contextSnippet += `[Tema relacionado: ${topic.FirstURL}]: ${topic.Text}\n`;
        }
      }
    }
  } catch {
    // Ignore DDG fallback error
  }

  return { searchQueries, sources, contextSnippet };
}

// Detect questions that require live web information (current events, results, news...)
// NOTE: matched against de-accented lowercase text
const LIVE_INFO_KEYWORDS = [
  'quien gano', 'quien es el campeon', 'ganador', 'ganadora', 'campeon', 'campeona', 'campeonato',
  'resultado', 'resultados', 'marcador', 'goles', 'mundial', 'olimpic', 'olimpiada', 'champions',
  'noticias', 'noticia', 'ultima hora', 'de hoy', 'hoy', 'actualidad', 'actualmente', 'actualizado',
  'reciente', 'recientes', 'ultimo', 'ultima', 'estreno', 'lanzamiento', 'salio',
  'precio', 'precios', 'cotizacion', 'dolar', 'inflacion', 'clima', 'temperatura',
  'eleccion', 'elecciones', 'presidente', 'primera ministra', 'primer ministro', 'gobernador', 'alcalde', 'alcaldesa',
  'partido', 'torneo', 'temporada', 'fichaje', 'transferencia', 'seleccion',
  'premio', 'nobel', 'oscar', 'grammy', 'balon de oro',
  'murio', 'fallecio', 'nacio', 'cumpleanos', 'aniversario',
  'hackeo', 'accidente', 'terremoto', 'huracan', 'tifon', 'incendio', 'inundacion',
  'version', 'update', 'actualizacion', 'lanzo', 'anuncio',
  'sigue siendo', 'record',
];
const LIVE_INFO_PATTERNS = new RegExp(`\\b(${LIVE_INFO_KEYWORDS.map((k) => k.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
// Words that end in 's' or need suffix flexibility handled separately
const LIVE_INFO_SUFFIX = /\b(liga|copa|final|edad|juego|liga|racha|copas|finales|goles)\b/i;

const RECENT_YEAR_PATTERNS = /\b(2024|2025|2026|2027)\b/;

function shouldSearchLive(text: string, explicit: boolean): boolean {
  if (explicit) return true;
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (LIVE_INFO_PATTERNS.test(t) || LIVE_INFO_SUFFIX.test(t)) return true;
  // Question about a recent year → needs verification
  if (RECENT_YEAR_PATTERNS.test(t) && /[?¿]|quien|que\b|cuando|como|donde|cual|resultado|gano|paso|sucedio|ocurrio/.test(t)) {
    return true;
  }
  return false;
}

// Chat endpoint with Intelligent Fastest-Model Selection, Web Grounding, Focus Modes, and SSE streaming
app.post('/api/chat', async (req: Request, res: Response) => {
  const { messages, attachments, userName, focusMode, webSearch, studentSubject } = req.body;

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
    const wantsWebSearch = shouldSearchLive(userPromptRaw, Boolean(webSearch));

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
      sendEvent('provider', { name: 'Nexus Qwen' });
      sendEvent('telemetry', { latencyMs: 25, providerName: 'Nexus Qwen' });

      const officialResponse =
        'Soy Nexus Qwen, la inteligencia artificial de Nexus AI, creada por Breitan Céspedes Monge. Estoy diseñada para ayudarte con preguntas, razonamiento, programación, análisis de archivos y creación de imágenes.';

      const tokens = officialResponse.split(' ');
      for (let i = 0; i < tokens.length; i++) {
        sendEvent('token', { text: (i === 0 ? '' : ' ') + tokens[i] });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      sendEvent('done', { success: true });
      res.end();
      return;
    }

    // ── Local deterministic math short-circuit: exact answers with zero latency ──
    if (
      (!Array.isArray(attachments) || attachments.length === 0) &&
      previousTurns.length === 0 &&
      focusMode !== 'deep'
    ) {
      const localMathAnswer = tryLocalMath(userPromptRaw);
      if (localMathAnswer !== null) {
        sendEvent('provider', { name: 'Nexus Qwen' });
        sendEvent('telemetry', { latencyMs: 5, providerName: 'Nexus Qwen' });
        sendEvent('token', { text: localMathAnswer });
        sendEvent('done', { success: true });
        res.end();
        return;
      }
    }

    const temporalContext = `\n\n[CONTEXTO TEMPORAL DEL SISTEMA]\nFecha actual del sistema: ${CURRENT_DATE_ES}. Cualquier razonamiento, cálculo de edad, evento reciente o búsqueda en la web debe basarse en esta fecha.`;

    const basePrompt = userName?.trim()
      ? `${NEXUS_SYSTEM_INSTRUCTION}${temporalContext}\n\n9. El usuario que interactúa contigo se llama "${userName.trim()}". Salúdalo o dirígete a él cordialmente por su nombre cuando corresponda. Nunca uses el término "operador" y jamás confundas el nombre del usuario con el nombre de tu creador (Breitan Céspedes Monge).`
      : `${NEXUS_SYSTEM_INSTRUCTION}${temporalContext}`;

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
      case 'student': {
        targetTemperature = 0.2;
        const subject: StudentSubject =
          studentSubject && STUDENT_SUBJECT_INSTRUCTIONS[studentSubject as StudentSubject]
            ? (studentSubject as StudentSubject)
            : 'general';
        modeInstruction = `\n${STUDENT_SUBJECT_INSTRUCTIONS[subject]}`;
        break;
      }
      case 'fast':
      default:
        targetTemperature = 0.4;
        modeInstruction =
          '\n\n[MODO ACTIVO: ULTRA RÁPIDO]\nSé extremadamente ágil, directo, conciso y de baja latencia. Responde de forma clara y ejecutiva sin rodeos innecesarios.';
        break;
    }

    // Brevity / verbosity intent adaptation
    const intentInstruction = buildIntentInstruction(detectResponseIntent(userPromptRaw));

    const currentSystemPrompt = `${basePrompt}${modeInstruction}${intentInstruction}`;

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
    const preferredGeminiModels = focusMode === 'deep' ? GEMINI_DEEP_MODELS : GEMINI_CHAT_MODELS;

    // Try candidates in order of fastest response
    for (const candidate of candidates) {
      const tStart = Date.now();
      try {
        if (candidate.type === 'groq' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Qwen' });

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
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Qwen' });
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
            sendEvent('provider', { name: 'Nexus Qwen' });

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
              for (const m of GEMINI_CHAT_MODELS) {
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
                } catch (modelErr: any) {
                  if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(modelErr?.message || modelErr || ''))) {
                    providerMetrics[candidate.id].rateLimitedUntil = Date.now() + 60000;
                  }
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
                  } catch (modelErr: any) {
                    if (/429|RESOURCE_EXHAUSTED|quota/i.test(String(modelErr?.message || modelErr || ''))) {
                      providerMetrics[candidate.id].rateLimitedUntil = Date.now() + 60000;
                    }
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
              try {
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
              } catch (streamErr: any) {
                // Mid-stream failure: if nothing was emitted yet, fail over to the next candidate
                const errMsg = String(streamErr?.message || streamErr || '');
                if (/429|RESOURCE_EXHAUSTED|quota/i.test(errMsg)) {
                  providerMetrics[candidate.id].rateLimitedUntil = Date.now() + 60000;
                }
                if (receivedAnyToken) {
                  // Partial answer already delivered: close gracefully instead of mixing providers
                  updateMetric(candidate.id, Date.now() - tStart, true);
                  sendEvent('telemetry', { latencyMs: Date.now() - tStart, providerName: 'Nexus Qwen' });
                  sendEvent('done', { success: true });
                  res.end();
                  return;
                }
                throw streamErr;
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
                sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Qwen' });
                sendEvent('done', { success: true });
                res.end();
                return;
              }
            }
          }
        }

        if (candidate.type === 'nvidia' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Qwen' });

          const cleanKey = candidate.key.replace(/^Bearer\s+/i, '').trim();
          const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cleanKey}`,
            },
            body: JSON.stringify({
              model: 'meta/llama-3.2-11b-vision-instruct',
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
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Qwen' });
              sendEvent('done', { success: true });
              res.end();
              return;
            }
          } else if (response.status === 429) {
            providerMetrics[candidate.id].rateLimitedUntil = Date.now() + 60000;
          }
        }

        if (candidate.type === 'mistral' && candidate.key) {
          sendEvent('provider', { name: 'Nexus Qwen' });

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
              sendEvent('telemetry', { latencyMs: latency, providerName: 'Nexus Qwen' });
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
    sendEvent('provider', { name: 'Nexus Qwen' });
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
      localFallback = `¡Hola! Soy Nexus Qwen. Los servidores en la nube experimentaron una alta congestión momentánea o saturación de cuota (429 Rate Limit). Por favor, intenta de nuevo en unos segundos.`;
    } else {
      localFallback = `¡Hola! Soy Nexus Qwen, tu inteligencia artificial personal.\n\nHe recibido tu solicitud. Para habilitar respuestas en tiempo real mediante los modelos más rápidos de la nube, puedes configurar al menos una clave en el **Gestor de APIs** (Google AI Studio, Groq, NVIDIA slots o Mistral).`;
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

// Image generation endpoint powered by NVIDIA NIM (FLUX.2-klein-4b, FLUX.1-dev)
// with Exact-Text Typography Overlay, Reference Images, Vision Verification
// and Distributed Rotation across the 10 NVIDIA API Keys.
app.post('/api/generate-image', async (req: Request, res: Response) => {
  const { prompt, referenceImages } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Debes proporcionar un texto descriptivo para generar la imagen.' });
    return;
  }

  // Detect requested aspect ratio (16:9, 9:16, 1:1)
  const aspectRatio = detectAspectRatio(prompt);

  // Check if any NVIDIA key is configured
  const configuredNvidiaKeys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const rawKey = activeKeys[`NVIDIA_API_KEY_${i}`] || (i === 1 ? activeKeys.NVIDIA_API_KEY : undefined);
    if (rawKey) {
      const cleanKey = rawKey.replace(/^Bearer\s+/i, '').trim();
      if (cleanKey.length > 10) {
        configuredNvidiaKeys.push(cleanKey);
      }
    }
  }

  if (configuredNvidiaKeys.length === 0) {
    res.status(503).json({
      error: 'La generación de imágenes requiere que configures al menos una clave de NVIDIA NIM en el Gestor de APIs.',
    });
    return;
  }

  try {
    // 0. Extract the EXACT text the user wants rendered (if any)
    const { exactText, cleanPrompt } = extractExactText(prompt);

    // 0.1 Analyze reference images (if provided) for style guidance
    let referenceContext = '';
    if (Array.isArray(referenceImages) && referenceImages.length > 0) {
      referenceContext = await describeReferenceImages(referenceImages);
    }

    // 1. Enhance the prompt: background-only (when we overlay text) or full design
    const enhancedPrompt = exactText
      ? await enhanceBackgroundPrompt(cleanPrompt, aspectRatio, referenceContext)
      : await enhanceImagePrompt(prompt, aspectRatio, referenceContext);

    // Calculate dimensions based on aspect ratio (supported by FLUX models)
    let width = 1024;
    let height = 1024;
    if (aspectRatio === '16:9') {
      width = 1344;
      height = 768;
    } else if (aspectRatio === '9:16') {
      width = 768;
      height = 1344;
    }

    let imageBuffer: Buffer | null = null;
    let outputMime = 'image/jpeg';
    let modelUsed = 'FLUX.2-klein-4b';
    let lastError = 'No se pudo generar la imagen.';

    // Model candidate configurations (verified live availability; dead endpoints removed)
    const imageCandidates = [
      {
        name: 'FLUX.2-klein-4b',
        dedicatedKey: activeKeys.NVIDIA_KEY_FLUX_KLEIN,
        url: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b',
        getBody: (p: string) => ({
          prompt: p,
          steps: 4,
          width,
          height,
        }),
      },
      {
        name: 'FLUX.1-dev',
        dedicatedKey: activeKeys.NVIDIA_KEY_FLUX_DEV,
        url: 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev',
        getBody: (p: string) => ({
          prompt: p,
          steps: 25,
          width,
          height,
          seed: 0,
        }),
      },
    ];

    // Iterate through candidates and keys with automatic failover
    for (const candidate of imageCandidates) {
      const keysToTry: string[] = [];
      if (candidate.dedicatedKey) {
        keysToTry.push(candidate.dedicatedKey.replace(/^Bearer\s+/i, '').trim());
      }
      for (const k of configuredNvidiaKeys) {
        if (!keysToTry.includes(k)) keysToTry.push(k);
      }

      for (const key of keysToTry) {
        try {
          const bodyPayload = candidate.getBody(enhancedPrompt);
          const response = await fetch(candidate.url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(120_000),
          });

          if (response.ok) {
            const data = (await response.json()) as any;
            const b64 = data?.artifacts?.[0]?.base64;
            if (b64) {
              imageBuffer = Buffer.from(b64, 'base64');
              modelUsed = candidate.name;
              break;
            }
          } else {
            const errorText = await response.text().catch(() => '');
            lastError = `[${candidate.name} HTTP ${response.status}]: ${errorText.slice(0, 200)}`;
          }
        } catch (fetchErr: any) {
          lastError = fetchErr?.message || lastError;
        }
      }

      if (imageBuffer) break;
    }

    if (!imageBuffer) {
      res.status(502).json({
        error: `Error al generar la imagen con los modelos de NVIDIA NIM: ${lastError}`,
      });
      return;
    }

    // 2. Exact-text typographic overlay: guarantees pixel-perfect text
    //    (accents, punctuation, ¿? ¡! — impossible for diffusion models to garble)
    let textOverlay = false;
    if (exactText) {
      try {
        const overlayBuffer = await renderTextOverlay(width, height, exactText);
        imageBuffer = await sharp(imageBuffer)
          .resize(width, height, { fit: 'cover' })
          .composite([{ input: overlayBuffer }])
          .png()
          .toBuffer();
        outputMime = 'image/png';
        textOverlay = true;
      } catch {
        // If overlay fails, deliver the raw generated image rather than an error
      }
    }

    const finalBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:${outputMime};base64,${finalBase64}`;

    // 3. Vision verification: transcribe the text back and compare with the request
    let textVerified: boolean | null = null;
    let transcribedText = '';
    if (exactText && textOverlay) {
      try {
        const verification = await verifyImageText(finalBase64, exactText);
        if (verification) {
          textVerified = verification.verified;
          transcribedText = verification.transcribed;
        }
      } catch {
        // Verification is best-effort; never block delivery
      }
    }

    res.json({
      success: true,
      imageUrl,
      prompt, // original prompt
      enhancedPrompt, // improved professional prompt
      aspectRatio,
      model: `NVIDIA NIM (${modelUsed})`,
      exactText: exactText || undefined,
      textOverlay,
      textVerified: textVerified === null ? undefined : textVerified,
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
