import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Play, Sparkles } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useSettings } from '../../db/hooks';
import { storeAudio } from '../media/media';
import {
  DEFAULT_ELEVEN_MODEL,
  ELEVEN_MODELS,
  ElevenLabsProvider,
  TtsProviderError,
  type TtsVoice,
} from './providers';

const LANG_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ['', 'Automático'],
  ['en', 'Inglês'],
  ['pt', 'Português'],
  ['es', 'Espanhol'],
  ['fr', 'Francês'],
  ['de', 'Alemão'],
  ['it', 'Italiano'],
  ['ja', 'Japonês'],
];

interface ElevenLabsDialogProps {
  open: boolean;
  onClose: () => void;
  defaultText: string;
  /** Deck language, e.g. 'en-US' — used to seed the language select. */
  defaultLang: string;
  onInsert: (audio: { id: string; url: string; label: string }) => void;
}

function baseLang(code: string): string {
  const base = code.split('-')[0].toLowerCase();
  return LANG_OPTIONS.some(([c]) => c === base) ? base : 'en';
}

export function ElevenLabsDialog({
  open,
  onClose,
  defaultText,
  defaultLang,
  onInsert,
}: ElevenLabsDialogProps) {
  const settings = useSettings();
  const apiKey = settings?.tts.elevenLabsApiKey ?? '';

  const [text, setText] = useState('');
  const [lang, setLang] = useState('en');
  const [model, setModel] = useState(DEFAULT_ELEVEN_MODEL);
  const [voiceId, setVoiceId] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [busy, setBusy] = useState<'idle' | 'testing' | 'generating' | 'voices'>('idle');
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !settings) return;
    setText(defaultText);
    setLang(baseLang(defaultLang));
    setModel(settings.tts.elevenLabsModel || DEFAULT_ELEVEN_MODEL);
    setVoiceId(settings.tts.elevenLabsVoiceId || '');
    setError(null);
    if (apiKey) void loadVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadVoices() {
    if (!apiKey) return;
    setBusy('voices');
    setError(null);
    try {
      const list = await new ElevenLabsProvider(apiKey).listVoices();
      setVoices(list);
      setVoiceId((cur) => cur || settings?.tts.elevenLabsVoiceId || list[0]?.id || '');
    } catch (e) {
      setError(e instanceof TtsProviderError ? e.message : 'Falha ao carregar vozes.');
    } finally {
      setBusy('idle');
    }
  }

  async function synth(): Promise<Blob> {
    return new ElevenLabsProvider(apiKey).synthesize(text, {
      voiceId,
      modelId: model,
      languageCode: lang || undefined,
    });
  }

  async function test() {
    if (!apiKey || !voiceId || !text.trim() || busy !== 'idle') return;
    setBusy('testing');
    setError(null);
    try {
      const blob = await synth();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      await new Audio(previewUrl.current).play();
    } catch (e) {
      setError(e instanceof TtsProviderError ? e.message : 'Falha ao gerar a prévia.');
    } finally {
      setBusy('idle');
    }
  }

  async function generate() {
    if (!apiKey || !voiceId || !text.trim() || busy !== 'idle') return;
    setBusy('generating');
    setError(null);
    try {
      const blob = await synth();
      const { id, url } = await storeAudio(blob);
      onInsert({ id, url, label: `ElevenLabs · ${lang || 'auto'}` });
      onClose();
    } catch (e) {
      setError(e instanceof TtsProviderError ? e.message : 'Falha ao gerar o áudio.');
    } finally {
      setBusy('idle');
    }
  }

  const hasKey = !!apiKey;
  const canRun = hasKey && !!voiceId && !!text.trim() && busy === 'idle';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar com ElevenLabs"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="default"
            icon={busy === 'testing' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            onClick={test}
            disabled={!canRun}
          >
            Testar
          </Button>
          <Button
            variant="accent"
            icon={busy === 'generating' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            onClick={generate}
            disabled={!canRun}
          >
            Gerar e anexar
          </Button>
        </>
      }
    >
      {!hasKey ? (
        <p className="text-sm text-muted">
          Configure sua chave de API da ElevenLabs em{' '}
          <Link to="/settings" className="text-accent underline" onClick={onClose}>
            Configurações
          </Link>{' '}
          para gerar áudios.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="el-text">
              Texto a falar
            </label>
            <textarea
              id="el-text"
              className="field"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ resize: 'vertical' }}
            />
            <p className="mono text-[10px] text-muted mt-1">
              {text.length} caracteres · a ElevenLabs cobra por caractere
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="el-lang">
                Idioma
              </label>
              <select id="el-lang" className="field" value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANG_OPTIONS.map(([code, label]) => (
                  <option key={code || 'auto'} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="el-model">
                Modelo
              </label>
              <select id="el-model" className="field" value={model} onChange={(e) => setModel(e.target.value)}>
                {ELEVEN_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Voz
              </span>
              <button
                type="button"
                onClick={loadVoices}
                disabled={busy !== 'idle'}
                className="mono text-[10px] text-muted hover:text-fg transition-colors inline-flex items-center gap-1"
              >
                {busy === 'voices' && <Loader2 size={11} className="animate-spin" />}
                Atualizar vozes
              </button>
            </div>
            <select
              className="field"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              {voices.length === 0 && <option value="">— sem vozes carregadas —</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.lang ? ` — ${v.lang}` : ''}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="mono text-xs" style={{ color: 'var(--accent)' }}>⚠ {error}</p>}
        </div>
      )}
    </Modal>
  );
}
