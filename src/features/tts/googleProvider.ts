/**
 * Provedor de TTS do Google, sempre via um Worker do Cloudflare. O navegador
 * NUNCA fala com o googleapis direto e NUNCA contém credencial do Google: ele
 * só faz POST para o Worker, que guarda a credencial no servidor.
 *
 * A URL base do Worker vem de import.meta.env.VITE_TTS_PROXY_URL (assada no
 * build do Vite). Sem ela, listVoices ainda devolve a lista curada (para o
 * seletor funcionar antes do Worker existir) e synthesize lança uma mensagem
 * clara em pt-BR, sem quebrar o app.
 */
import { TtsProviderError, type TtsVoice } from './providers';
import { supabase } from '../../lib/supabase';

export type GoogleAudioEncoding = 'MP3' | 'OGG_OPUS' | 'LINEAR16';

export interface GoogleSynthOptions {
  voiceName: string;
  languageCode: string;
  audioEncoding?: GoogleAudioEncoding;
  /** "Testar voz": gera a prévia sem consumir a cota de áudio (ainda exige login). */
  preview?: boolean;
}

const NOT_CONFIGURED =
  'Geração de áudio indisponível: o servidor de voz (Worker) ainda não foi configurado.';

/** URL base do Worker, sem barra final. Vazia quando não configurada. */
function proxyBase(): string {
  return (import.meta.env.VITE_TTS_PROXY_URL ?? '').trim().replace(/\/+$/, '');
}

/** true quando VITE_TTS_PROXY_URL está definida (Worker disponível). */
export function isTtsConfigured(): boolean {
  return proxyBase().length > 0;
}

/** Token de acesso (JWT) da sessão Supabase, para autenticar no Worker. */
async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function mimeFor(encoding: GoogleAudioEncoding): string {
  switch (encoding) {
    case 'OGG_OPUS':
      return 'audio/ogg';
    case 'LINEAR16':
      return 'audio/wav';
    case 'MP3':
    default:
      return 'audio/mpeg';
  }
}

/** Decodifica base64 (resposta do Google) em um Blob tocável. */
function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Sintetiza `text` chamando o Worker em `${VITE_TTS_PROXY_URL}/synthesize`. O
 * Worker responde com JSON { audioContent } (base64, igual à REST do Google).
 * Para MP3 o Blob retorna como audio/mpeg, exatamente o que o upload de mídia
 * espera. Lança TtsProviderError (mensagem pt-BR) em qualquer falha.
 */
export async function synthesizeGoogle(text: string, opts: GoogleSynthOptions): Promise<Blob> {
  const base = proxyBase();
  if (!base) throw new TtsProviderError(NOT_CONFIGURED);

  const audioEncoding = opts.audioEncoding ?? 'MP3';
  // O Worker exige login: anexa o JWT do Supabase (Authorization: Bearer).
  const token = await getAccessToken();
  if (!token) throw new TtsProviderError('Faça login para gerar áudio.');

  let res: Response;
  try {
    res = await fetch(`${base}/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        voiceName: opts.voiceName,
        languageCode: opts.languageCode,
        audioEncoding,
        preview: opts.preview === true,
      }),
    });
  } catch {
    throw new TtsProviderError('Falha de conexão com o servidor de voz. Tente novamente.');
  }

  if (!res.ok) {
    let payload: { error?: unknown; code?: string; max_count?: number } | null = null;
    try {
      payload = await res.json();
    } catch {
      /* corpo não-JSON: usa o status abaixo */
    }
    const detail = typeof payload?.error === 'string' ? payload.error : '';
    // Limite mensal de áudios do plano (gratuito limitado; pagos ilimitados). O
    // teto exibido vem do servidor (max_count), nunca fixo aqui.
    if (res.status === 429 && payload?.code === 'quota_exceeded') {
      const cap = typeof payload.max_count === 'number' && payload.max_count > 0 ? ` (${payload.max_count})` : '';
      throw new TtsProviderError(
        `Você atingiu o limite mensal de áudios do seu plano${cap}. Faça upgrade para gerar mais.`,
      );
    }
    if (res.status === 401) {
      throw new TtsProviderError('Sua sessão expirou. Entre novamente para gerar áudio.');
    }
    if (res.status === 503 && payload?.code === 'quota_unavailable') {
      throw new TtsProviderError('Não foi possível verificar seu limite agora. Tente novamente em instantes.');
    }
    throw new TtsProviderError(detail || `Erro ao gerar áudio (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new TtsProviderError('Resposta inválida do servidor de voz.');
  return base64ToBlob(data.audioContent, mimeFor(audioEncoding));
}

/**
 * Lista curada de vozes Google Neural2 de alta qualidade (en-US e pt-BR), com
 * rótulos para o seletor. `id` é o voiceName que o Google espera; `lang` é o
 * languageCode. Pode ser trocada depois por um GET real em
 * `${VITE_TTS_PROXY_URL}/voices`.
 */
export const GOOGLE_VOICES: TtsVoice[] = [
  // Inglês (EUA)
  { id: 'en-US-Neural2-D', name: 'Inglês (EUA), masculina (D)', lang: 'en-US' },
  { id: 'en-US-Neural2-J', name: 'Inglês (EUA), masculina (J)', lang: 'en-US' },
  { id: 'en-US-Neural2-C', name: 'Inglês (EUA), feminina (C)', lang: 'en-US' },
  { id: 'en-US-Neural2-F', name: 'Inglês (EUA), feminina (F)', lang: 'en-US' },
  // Português (BR)
  { id: 'pt-BR-Neural2-B', name: 'Português (BR), masculina (B)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-A', name: 'Português (BR), feminina (A)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-C', name: 'Português (BR), feminina (C)', lang: 'pt-BR' },
  // Inglês (Reino Unido)
  { id: 'en-GB-Neural2-B', name: 'Inglês (Reino Unido), masculina (B)', lang: 'en-GB' },
  { id: 'en-GB-Neural2-D', name: 'Inglês (Reino Unido), masculina (D)', lang: 'en-GB' },
  { id: 'en-GB-Neural2-A', name: 'Inglês (Reino Unido), feminina (A)', lang: 'en-GB' },
  { id: 'en-GB-Neural2-C', name: 'Inglês (Reino Unido), feminina (C)', lang: 'en-GB' },
  // Espanhol (Espanha)
  { id: 'es-ES-Neural2-B', name: 'Espanhol (Espanha), masculina (B)', lang: 'es-ES' },
  { id: 'es-ES-Neural2-C', name: 'Espanhol (Espanha), feminina (C)', lang: 'es-ES' },
  { id: 'es-ES-Neural2-D', name: 'Espanhol (Espanha), feminina (D)', lang: 'es-ES' },
  // Espanhol (América Latina)
  { id: 'es-US-Neural2-B', name: 'Espanhol (Latam), masculina (B)', lang: 'es-US' },
  { id: 'es-US-Neural2-C', name: 'Espanhol (Latam), masculina (C)', lang: 'es-US' },
  { id: 'es-US-Neural2-A', name: 'Espanhol (Latam), feminina (A)', lang: 'es-US' },
  // Francês (França)
  { id: 'fr-FR-Neural2-B', name: 'Francês (França), masculina (B)', lang: 'fr-FR' },
  { id: 'fr-FR-Neural2-D', name: 'Francês (França), masculina (D)', lang: 'fr-FR' },
  { id: 'fr-FR-Neural2-A', name: 'Francês (França), feminina (A)', lang: 'fr-FR' },
  { id: 'fr-FR-Neural2-C', name: 'Francês (França), feminina (C)', lang: 'fr-FR' },
  // Alemão
  { id: 'de-DE-Neural2-B', name: 'Alemão, masculina (B)', lang: 'de-DE' },
  { id: 'de-DE-Neural2-D', name: 'Alemão, masculina (D)', lang: 'de-DE' },
  { id: 'de-DE-Neural2-A', name: 'Alemão, feminina (A)', lang: 'de-DE' },
  { id: 'de-DE-Neural2-C', name: 'Alemão, feminina (C)', lang: 'de-DE' },
  // Italiano
  { id: 'it-IT-Neural2-C', name: 'Italiano, masculina (C)', lang: 'it-IT' },
  { id: 'it-IT-Neural2-A', name: 'Italiano, feminina (A)', lang: 'it-IT' },
  // Japonês
  { id: 'ja-JP-Neural2-C', name: 'Japonês, masculina (C)', lang: 'ja-JP' },
  { id: 'ja-JP-Neural2-D', name: 'Japonês, masculina (D)', lang: 'ja-JP' },
  { id: 'ja-JP-Neural2-B', name: 'Japonês, feminina (B)', lang: 'ja-JP' },
  // Coreano
  { id: 'ko-KR-Neural2-C', name: 'Coreano, masculina (C)', lang: 'ko-KR' },
  { id: 'ko-KR-Neural2-A', name: 'Coreano, feminina (A)', lang: 'ko-KR' },
  { id: 'ko-KR-Neural2-B', name: 'Coreano, feminina (B)', lang: 'ko-KR' },
  // Grego (Grécia) — única voz disponível (WaveNet; sem Neural2, sem masculina)
  { id: 'el-GR-Wavenet-A', name: 'Grego, feminina (WaveNet)', lang: 'el-GR' },
];

/** Frase curta de teste por idioma (prefixo de 2 letras). Cai para inglês. */
const SAMPLES: Record<string, string> = {
  en: 'Hello! This is a Kioku test voice.',
  pt: 'Olá! Esta é uma voz de teste do Kioku.',
  es: '¡Hola! Esta es una voz de prueba de Kioku.',
  fr: 'Bonjour ! Ceci est une voix de test de Kioku.',
  de: 'Hallo! Dies ist eine Kioku-Teststimme.',
  it: 'Ciao! Questa è una voce di prova di Kioku.',
  ja: 'こんにちは。これは Kioku のテスト音声です。',
  ko: '안녕하세요. 이것은 Kioku 테스트 음성입니다.',
  el: 'Γεια σας! Αυτή είναι μια δοκιμαστική φωνή του Kioku.',
};

/** Texto de teste no idioma da voz (para o botão "Testar voz"). */
export function sampleText(languageCode: string): string {
  const base = (languageCode || 'en').slice(0, 2).toLowerCase();
  return SAMPLES[base] ?? SAMPLES.en;
}

/** Vozes disponíveis no seletor. Hoje é a lista curada acima. */
export function listGoogleVoices(): TtsVoice[] {
  return GOOGLE_VOICES;
}

/** Vozes agrupadas por idioma (en-US depois pt-BR), para os seletores. */
export function groupGoogleVoices(): Array<{ lang: string; label: string; items: TtsVoice[] }> {
  const order: Array<{ lang: string; label: string }> = [
    { lang: 'en-US', label: 'Inglês (EUA)' },
    { lang: 'pt-BR', label: 'Português (BR)' },
    { lang: 'en-GB', label: 'Inglês (Reino Unido)' },
    { lang: 'es-ES', label: 'Espanhol (Espanha)' },
    { lang: 'es-US', label: 'Espanhol (América Latina)' },
    { lang: 'fr-FR', label: 'Francês (França)' },
    { lang: 'de-DE', label: 'Alemão' },
    { lang: 'it-IT', label: 'Italiano' },
    { lang: 'ja-JP', label: 'Japonês' },
    { lang: 'ko-KR', label: 'Coreano' },
    { lang: 'el-GR', label: 'Grego' },
  ];
  return order
    .map((g) => ({ ...g, items: GOOGLE_VOICES.filter((v) => v.lang === g.lang) }))
    .filter((g) => g.items.length > 0);
}
