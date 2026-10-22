export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64 representation
  isImage: boolean;
}

export type FocusMode = 'fast' | 'deep' | 'code' | 'creative' | 'student';

export type StudentSubject =
  | 'general'
  | 'matematicas'
  | 'ciencias'
  | 'sociales'
  | 'espanol'
  | 'ingles'
  | 'frances';

export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
  domain?: string;
}

export interface MessageVersion {
  id: string;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  sources?: WebSource[];
  searchQueries?: string[];
  generatedImage?: {
    url: string;
    prompt: string;
    enhancedPrompt?: string;
    aspectRatio?: string;
  };
  providerName?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  attachments?: Attachment[];
  sources?: WebSource[];
  searchQueries?: string[];
  focusMode?: FocusMode;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  generatedImage?: {
    url: string;
    prompt: string;
    enhancedPrompt?: string;
    aspectRatio?: string;
    exactText?: string;
    textOverlay?: boolean;
    textVerified?: boolean;
  };
  providerName?: string;
  error?: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: string;
  timestamp: number;
  threadId?: string;
  threadTitle?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  isTemporal?: boolean;
  focusMode?: FocusMode;
}

export interface ProviderStatus {
  id: string;
  name: string;
  category: 'google' | 'nvidia' | 'mistral' | 'groq';
  configured: boolean;
  status: 'active' | 'no_key' | 'rate_limited' | 'error';
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

export interface ProvidersResponse {
  totalKeys: number;
  configuredCount: number;
  activeCount: number;
  primaryModel: string;
  creator: string;
  providers: ProviderStatus[];
}
