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

export type GoogleAudioEncoding = 'MP3' | 'OGG_OPUS' | 'LINEAR16';

export interface GoogleSynthOptions {
  voiceName: string;
  languageCode: string;
  audioEncoding?: GoogleAudioEncoding;
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
  let res: Response;
  try {
    res = await fetch(`${base}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: opts.voiceName,
        languageCode: opts.languageCode,
        audioEncoding,
      }),
    });
  } catch {
    throw new TtsProviderError('Falha de conexão com o servidor de voz. Tente novamente.');
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: unknown };
      if (typeof j.error === 'string') detail = j.error;
    } catch {
      /* corpo não-JSON: usa o status abaixo */
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
  { id: 'en-US-Neural2-D', name: 'Inglês (EUA), masculina (D)', lang: 'en-US' },
  { id: 'en-US-Neural2-J', name: 'Inglês (EUA), masculina (J)', lang: 'en-US' },
  { id: 'en-US-Neural2-C', name: 'Inglês (EUA), feminina (C)', lang: 'en-US' },
  { id: 'en-US-Neural2-F', name: 'Inglês (EUA), feminina (F)', lang: 'en-US' },
  { id: 'pt-BR-Neural2-B', name: 'Português (BR), masculina (B)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-A', name: 'Português (BR), feminina (A)', lang: 'pt-BR' },
  { id: 'pt-BR-Neural2-C', name: 'Português (BR), feminina (C)', lang: 'pt-BR' },
];

/** Vozes disponíveis no seletor. Hoje é a lista curada acima. */
export function listGoogleVoices(): TtsVoice[] {
  return GOOGLE_VOICES;
}

/** Vozes agrupadas por idioma (en-US depois pt-BR), para os seletores. */
export function groupGoogleVoices(): Array<{ lang: string; label: string; items: TtsVoice[] }> {
  const order: Array<{ lang: string; label: string }> = [
    { lang: 'en-US', label: 'Inglês (EUA)' },
    { lang: 'pt-BR', label: 'Português (BR)' },
  ];
  return order
    .map((g) => ({ ...g, items: GOOGLE_VOICES.filter((v) => v.lang === g.lang) }))
    .filter((g) => g.items.length > 0);
}
