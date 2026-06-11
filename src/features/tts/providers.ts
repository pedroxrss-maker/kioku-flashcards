/**
 * Tipos compartilhados de TTS na nuvem, independentes de provedor. O provedor
 * concreto (Google, via Worker) vive em googleProvider.ts. O fluxo continua
 * sendo gerar-e-guardar: sintetiza um MP3 uma vez, salva no Supabase Storage e
 * toca offline na revisao (via URL assinada), sem chave no navegador.
 */

export interface TtsVoice {
  id: string;
  name: string;
  lang?: string;
}

/** Carrega uma mensagem pt-BR pronta para mostrar em dialogos/toasts. */
export class TtsProviderError extends Error {}
