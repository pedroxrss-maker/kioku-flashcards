import { useRef, useState } from 'react';
import { Cloud, Loader2, Play } from 'lucide-react';
import { Button } from '../../components/Button';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import { isTtsConfigured, listGoogleVoices, synthesizeGoogle } from './googleProvider';
import { TtsProviderError, type TtsVoice } from './providers';
import type { AppSettings } from '../../db/types';

type Status = { kind: 'idle' | 'ok' | 'err'; msg?: string };

/** Frase curta de teste, no idioma da voz escolhida. */
const SAMPLE: Record<string, string> = {
  'pt-BR': 'Olá! Esta é uma voz de teste do Kioku.',
  'en-US': 'Hello! This is a Kioku test voice.',
};

/** Agrupa as vozes por idioma, na ordem en-US depois pt-BR. */
function groupVoices(voices: TtsVoice[]): Array<{ lang: string; label: string; items: TtsVoice[] }> {
  const order: Array<{ lang: string; label: string }> = [
    { lang: 'en-US', label: 'Inglês (EUA)' },
    { lang: 'pt-BR', label: 'Português (BR)' },
  ];
  return order
    .map((g) => ({ ...g, items: voices.filter((v) => v.lang === g.lang) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Configurações do TTS na nuvem (Google). Sem campo de chave: a credencial fica
 * no Worker. Escolhe a voz padrão e testa tocando uma frase curta.
 */
export function GoogleTtsSettings() {
  const settings = useSettings();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);
  const previewUrl = useRef<string | null>(null);

  if (!settings) return null;
  const tt = settings.tts;
  const voices = listGoogleVoices();
  const groups = groupVoices(voices);

  const save = (patch: Partial<AppSettings['tts']>) =>
    repo.saveSettings({ tts: { ...tt, ...patch } });

  function onPickVoice(voiceId: string) {
    const v = voices.find((x) => x.id === voiceId);
    if (!v) return;
    save({ googleVoiceName: v.id, googleLanguageCode: v.lang ?? tt.googleLanguageCode });
  }

  async function testVoice() {
    if (loading) return;
    setLoading(true);
    setStatus({ kind: 'idle' });
    try {
      const sample = SAMPLE[tt.googleLanguageCode] ?? SAMPLE['en-US'];
      const blob = await synthesizeGoogle(sample, {
        voiceName: tt.googleVoiceName,
        languageCode: tt.googleLanguageCode,
      });
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      await new Audio(previewUrl.current).play();
      setStatus({ kind: 'ok', msg: 'Voz tocada com sucesso.' });
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof TtsProviderError ? e.message : 'Falha ao gerar a prévia.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={15} className="text-muted" />
        <h3 className="mono text-xs text-muted">Google (nuvem) · gera e salva MP3</h3>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="field-label" htmlFor="g-voice">
            Voz padrão
          </label>
          <select
            id="g-voice"
            className="field"
            value={tt.googleVoiceName}
            onChange={(e) => onPickVoice(e.target.value)}
          >
            {groups.map((g) => (
              <optgroup key={g.lang} label={g.label}>
                {g.items.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1">
            A credencial do Google fica no servidor (Worker), não no aplicativo.
          </p>
        </div>

        {!isTtsConfigured() && (
          <p className="mono text-[11px]" style={{ color: 'var(--muted)' }}>
            O servidor de voz (Worker) ainda não foi configurado. Você pode escolher a voz agora; a
            geração de áudio fica disponível quando o Worker estiver no ar.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            onClick={testVoice}
            disabled={loading}
          >
            Testar voz
          </Button>
          {status.kind !== 'idle' && (
            <span
              className="mono text-[11px]"
              style={{ color: status.kind === 'ok' ? 'var(--accent-green)' : 'var(--accent)' }}
            >
              {status.kind === 'ok' ? '✓' : '⚠'} {status.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
