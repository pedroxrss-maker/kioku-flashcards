import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/Button';
import { downloadBlob } from '../../lib/download';

interface ExportButtonProps {
  deckId: string;
  size?: 'sm' | 'md';
}

/** Exports the deck as a best-effort Anki .apkg (code-split). */
export function ExportButton({ deckId, size = 'sm' }: ExportButtonProps) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { exportApkg } = await import('./apkg-export');
      const { blob, name } = await exportApkg(deckId);
      downloadBlob(blob, name);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Falha ao exportar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size={size}
      icon={<Download size={15} />}
      onClick={run}
      disabled={busy}
    >
      {busy ? 'Exportando…' : 'Exportar .apkg'}
    </Button>
  );
}
