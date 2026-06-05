import { useEffect, useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Bold, Image as ImageIcon, Italic, List, Underline } from 'lucide-react';
import { fromEditorHtml, storeImage, toEditorHtml } from '../media/media';

interface RichTextFieldProps {
  label: string;
  valueHtml: string;
  onChange: (html: string) => void;
  autoFocus?: boolean;
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

/** contentEditable rich-text field with a small formatting + image toolbar. */
export function RichTextField({
  label,
  valueHtml,
  onChange,
  autoFocus,
}: RichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialize editor DOM once on mount (the component is keyed by card, so it
  // remounts when switching cards).
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

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { id, url } = await storeImage(file);
    ref.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<img src="${url}" data-kioku-media="${id}" alt="" />`,
    );
    emit();
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
          <ToolbarBtn
            onClick={() => exec('insertUnorderedList')}
            title="Lista"
          >
            <List size={14} />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => fileRef.current?.click()} title="Inserir imagem">
            <ImageIcon size={14} />
          </ToolbarBtn>
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
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFile}
      />
    </div>
  );
}
