import { useState } from 'react';
import { Check, Cloud, Loader2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { useSettings } from '../../db/hooks';
import { repo } from '../../db/repositories';
import {
  ELEVEN_MODELS,
  ElevenLabsProvider,
  TtsProviderError,
  type TtsVoice,
} from './providers';
import type { AppSettings } from '../../db/types';

type Status = { kind: 'idle' | 'ok' | 'err'; msg?: string };

/** ElevenLabs cloud-TTS settings — key, default model + voice, test connection. */
export function ElevenLabsSettings() {
  const settings = useSettings();
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [loading, setLoading] = useState(false);

  if (!settings) return null;
  const tt = settings.tts;
  const save = (patch: Partial<AppSettings['tts']>) =>
    repo.saveSettings({ tts: { ...tt, ...patch } });

  async function refreshVoices() {
    if (!tt.elevenLabsApiKey) return;
    setLoading(true);
    setStatus({ kind: 'idle' });
    try {
      const list = await new ElevenLabsProvider(tt.elevenLabsApiKey).listVoices();
      setVoices(list);
      if (!tt.elevenLabsVoiceId && list[0]) save({ elevenLabsVoiceId: list[0].id });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof TtsProviderError ? e.message : 'Falha ao carregar vozes.' });
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    if (!tt.elevenLabsApiKey) return;
    setLoading(true);
    setStatus({ kind: 'idle' });
    try {
      const list = await new ElevenLabsProvider(tt.elevenLabsApiKey).listVoices();
      setVoices(list);
      setStatus({ kind: 'ok', msg: `Conectado · ${list.length} vozes disponíveis` });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof TtsProviderError ? e.message : 'Falha na conexão.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Cloud size={15} className="text-muted" />
        <h3 className="mono text-xs text-muted">ElevenLabs (nuvem) · gera e salva MP3</h3>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label" htmlFor="el-key" style={{ marginBottom: 0 }}>
              Chave de API da ElevenLabs
            </label>
            {tt.elevenLabsApiKey ? (
              <span
                className="mono text-[10px] inline-flex items-center gap-1"
                style={{ color: 'var(--accent-green)' }}
              >
                <Check size={11} /> chave salva
              </span>
            ) : (
              <span className="mono text-[10px] text-muted">nenhuma chave</span>
            )}
          </div>
          <input
            id="el-key"
            type="password"
            autoComplete="off"
            className="field"
            placeholder="sk_..."
            value={tt.elevenLabsApiKey}
            onChange={(e) => save({ elevenLabsApiKey: e.target.value.trim() })}
          />
          <p className="text-[11px] text-muted mt-1">
            A chave fica salva na sua conta e é usada para gerar e salvar os áudios na nuvem.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="el-model-default">
              Modelo padrão
            </label>
            <select
              id="el-model-default"
              className="field"
              value={tt.elevenLabsModel}
              onChange={(e) => save({ elevenLabsModel: e.target.value })}
            >
              {ELEVEN_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Voz padrão
              </span>
              <button
                type="button"
                onClick={refreshVoices}
                disabled={!tt.elevenLabsApiKey || loading}
                className="mono text-[10px] text-muted hover:text-fg transition-colors inline-flex items-center gap-1"
              >
                {loading && <Loader2 size={11} className="animate-spin" />}
                Atualizar vozes
              </button>
            </div>
            <select
              className="field"
              value={tt.elevenLabsVoiceId}
              onChange={(e) => save({ elevenLabsVoiceId: e.target.value })}
            >
              {voices.length === 0 && (
                <option value={tt.elevenLabsVoiceId}>
                  {tt.elevenLabsVoiceId || '— atualize as vozes —'}
                </option>
              )}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.lang ? ` — ${v.lang}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
            onClick={testConnection}
            disabled={!tt.elevenLabsApiKey || loading}
          >
            Testar conexão
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
