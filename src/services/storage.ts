import { ChatThread, Message, FocusMode, GalleryImage, StudentSubject } from '../types';

const THREADS_KEY = 'nexus_ai_threads_v1';
const ACTIVE_THREAD_ID_KEY = 'nexus_ai_active_thread_v1';
const USER_NAME_KEY = 'nexus_user_name';
const FOCUS_MODE_KEY = 'nexus_focus_mode_v1';
const GALLERY_KEY = 'nexus_image_gallery_v1';
const STUDENT_SUBJECT_KEY = 'nexus_student_subject_v1';

const VALID_SUBJECTS: StudentSubject[] = ['general', 'matematicas', 'ciencias', 'sociales', 'espanol', 'ingles', 'frances'];

export function getStoredStudentSubject(): StudentSubject {
  try {
    const val = localStorage.getItem(STUDENT_SUBJECT_KEY) as StudentSubject;
    if (val && VALID_SUBJECTS.includes(val)) {
      return val;
    }
  } catch {
    // fallback
  }
  return 'general';
}

export function setStoredStudentSubject(subject: StudentSubject): void {
  try {
    localStorage.setItem(STUDENT_SUBJECT_KEY, subject);
  } catch {
    // Ignore
  }
}

export function getStoredFocusMode(): FocusMode {
  try {
    const val = localStorage.getItem(FOCUS_MODE_KEY) as FocusMode;
    if (val && ['fast', 'deep', 'code', 'creative', 'student'].includes(val)) {
      return val;
    }
  } catch {
    // fallback
  }
  return 'fast'; // Default: Ultra Fast
}

export function setStoredFocusMode(mode: FocusMode): void {
  try {
    localStorage.setItem(FOCUS_MODE_KEY, mode);
  } catch {
    // Ignore
  }
}

export function getStoredGallery(): GalleryImage[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGalleryImage(img: GalleryImage): void {
  try {
    const current = getStoredGallery();
    // Prepend new image if not existing
    if (!current.some((item) => item.id === img.id || item.url === img.url)) {
      const updated = [img, ...current];
      localStorage.setItem(GALLERY_KEY, JSON.stringify(updated.slice(0, 100))); // Keep up to 100 images
    }
  } catch (err) {
    console.warn('Error saving to gallery:', err);
  }
}

export function deleteGalleryImage(id: string): void {
  try {
    const current = getStoredGallery();
    const updated = current.filter((item) => item.id !== id);
    localStorage.setItem(GALLERY_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
}

export function getUserName(): string {
  try {
    return localStorage.getItem(USER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setUserName(name: string): void {
  try {
    localStorage.setItem(USER_NAME_KEY, name.trim());
  } catch {
    // Ignore storage errors
  }
}

export function getInitialGreeting(userName?: string): string {
  const name = userName?.trim() || getUserName();
  if (name) {
    return `¡Hola, ${name}! 👋 Bienvenido a Nexus AI. ¿En qué te ayudo hoy?`;
  }
  return '¡Hola! 👋 Bienvenido a Nexus AI. ¿En qué te ayudo hoy?';
}

export const INITIAL_GREETING_TEXT = getInitialGreeting();

// IndexedDB configuration for heavy binary blobs
const DB_NAME = 'NexusAIStorage';
const DB_VERSION = 1;
const STORE_MEDIA = 'media_blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMediaBlob(id: string, data: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put({ id, data, savedAt: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error saving media to IndexedDB:', err);
  }
}

export async function getMediaBlob(id: string): Promise<string | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const request = tx.objectStore(STORE_MEDIA).get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export function createNewThread(isTemporal = false, userName?: string): ChatThread {
  const newId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const initialMessage: Message = {
    id: `msg_init_${Date.now()}`,
    role: 'assistant',
    content: getInitialGreeting(userName),
    timestamp: Date.now(),
    status: 'complete',
    providerName: 'Nexus Qwen',
  };

  return {
    id: newId,
    title: isTemporal ? 'Chat Temporal (Efímero)' : 'Nueva Conversación',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [initialMessage],
    isTemporal,
  };
}

export function loadStoredThreads(userName?: string): ChatThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const activeGreeting = getInitialGreeting(userName);
      // Migrate old greetings and provider names
      const migrated = parsed
        .filter((t) => !t.isTemporal)
        .map((thread: ChatThread) => {
          const updatedMessages = thread.messages.map((msg, index) => {
            let content = msg.content;
            // If it's the first message of the thread and is an initial greeting, update it
            if (
              index === 0 &&
              msg.role === 'assistant' &&
              (content.includes('Soy Nexus Qwen') ||
                content.includes('Breitan Céspedes Monge') ||
                content.includes('Bienvenido a Nexus AI'))
            ) {
              content = activeGreeting;
            }
            return {
              ...msg,
              content,
              providerName:
                msg.providerName === 'Nexus Qwen' ? 'Nexus Qwen' : msg.providerName || 'Nexus Qwen',
            };
          });

          return {
            ...thread,
            messages: updatedMessages,
          };
        });

      localStorage.setItem(THREADS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch (err) {
    console.error('Error loading threads from localStorage:', err);
    return [];
  }
}

export function saveStoredThreads(threads: ChatThread[]): void {
  try {
    // Only persist non-temporal threads
    const persistent = threads.filter((t) => !t.isTemporal);
    localStorage.setItem(THREADS_KEY, JSON.stringify(persistent));
  } catch (err) {
    console.error('Error saving threads to localStorage:', err);
  }
}

export function getActiveThreadId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_THREAD_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveThreadId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_THREAD_ID_KEY, id);
  } catch {
    // Ignore storage errors
  }
}

export function clearAllPersistentData(): void {
  try {
    localStorage.removeItem(THREADS_KEY);
    localStorage.removeItem(ACTIVE_THREAD_ID_KEY);
    localStorage.removeItem(USER_NAME_KEY);
  } catch {
    // Ignore
  }
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // Ignore
  }
}
