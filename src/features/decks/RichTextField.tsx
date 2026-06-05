import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Bold, Image as ImageIcon, Italic, List, Underline, Volume2 } from 'lucide-react';
import {
  audioChipHtml,
  fromEditorHtml,
  storeAudio,
  storeImage,
  toEditorHtml,
} from '../media/media';
import { ElevenLabsDialog } from '../tts/ElevenLabsDialog';

interface RichTextFieldProps {
  label: string;
  valueHtml: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
  /** Deck language (e.g. 'en-US'), used to seed the ElevenLabs dialog. */
  ttsLang?: string;
}

function ToolbarBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // Keep focus in the editable area so execCommand targets the selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="p-1.5 text-muted hover:text-fg transition-colors"
      style={{ border: '1px solid var(--line)' }}
    >
      {children}
    </button>
  );
}

/** contentEditable rich-text field with a formatting + image + audio toolbar. */
export function RichTextField({
  label,
  valueHtml,
  onChange,
  autoFocus,
  ttsLang = 'en-US',
}: RichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const [audioMenu, setAudioMenu] = useState(false);
  const [elOpen, setElOpen] = useState(false);
  const [dialogText, setDialogText] = useState('');

  useEffect(() => {
    let alive = true;
    toEditorHtml(valueHtml).then((h) => {
      if (alive && ref.current) {
        ref.current.innerHTML = h;
        if (autoFocus) ref.current.focus();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    if (ref.current) onChange(fromEditorHtml(ref.current.innerHTML));
  }

  function exec(command: string) {
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  /** Plain text of the field, excluding audio chip labels. */
  function plainText(): string {
    const el = ref.current;
    if (!el) return '';
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.kioku-audio-chip').forEach((n) => n.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function insertAudioChip(audio: { id: string; url: string; label: string }) {
    if (!ref.current) return;
    ref.current.insertAdjacentHTML('beforeend', audioChipHtml(audio));
    emit();
  }

  async function onImageFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { id, url } = await storeImage(file);
    ref.current?.focus();
    document.execCommand('insertHTML', false, `<img src="${url}" data-kioku-media="${id}" alt="" />`);
    emit();
  }

  async function onAudioFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { id, url } = await storeAudio(file);
    insertAudioChip({ id, url, label: file.name });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="field-label" style={{ marginBottom: 0 }}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          <ToolbarBtn onClick={() => exec('bold')} title="Negrito (Ctrl+B)">
            <Bold size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => exec('italic')} title="Itálico (Ctrl+I)">
            <Italic size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => exec('underline')} title="Sublinhado (Ctrl+U)">
            <Underline size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Lista">
            <List size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => imageRef.current?.click()} title="Inserir imagem">
            <ImageIcon size={14} />
          </ToolbarBtn>
          <div className="relative">
            <ToolbarBtn onClick={() => setAudioMenu((o) => !o)} title="Áudio">
              <Volume2 size={14} />
            </ToolbarBtn>
            {audioMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAudioMenu(false)} />
                <div
                  className="absolute right-0 z-50 mt-1"
                  style={{ border: '1px solid var(--line)', background: 'var(--surface)', minWidth: 210 }}
                >
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                    onClick={() => {
                      setAudioMenu(false);
                      audioRef.current?.click();
                    }}
                  >
                    Anexar áudio
                  </button>
                  <button
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                    style={{ borderTop: '1px solid var(--line)' }}
                    onClick={() => {
                      setAudioMenu(false);
                      setDialogText(plainText());
                      setElOpen(true);
                    }}
                  >
                    Gerar com ElevenLabs
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        role="textbox"
        aria-multiline
        aria-label={label}
        className="field card-content-sm"
        style={{ minHeight: 110, maxHeight: 280, overflowY: 'auto' }}
      />
      <input ref={imageRef} type="file" accept="image/*" hidden onChange={onImageFile} />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={onAudioFile} />

      <ElevenLabsDialog
        open={elOpen}
        onClose={() => setElOpen(false)}
        defaultText={dialogText}
        defaultLang={ttsLang}
        onInsert={insertAudioChip}
      />
    </div>
  );
}
