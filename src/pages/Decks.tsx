import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { DeckBrowser } from '../features/decks/DeckBrowser';
import { ImportButton } from '../features/importer/ImportButton';
import { AiImportButton } from '../features/importer/AiImportButton';
import { useDecks } from '../db/hooks';

export function Decks() {
  const decks = useDecks();
  return (
    <div className="rise">
      <PageHeader
        title="Meus decks"
        subtitle={`${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link to="/generate" className="btn btn-accent btn-sm">
              <Sparkles size={16} /> Gerar deck com IA
            </Link>
            <AiImportButton />
            <ImportButton variant="ghost" />
          </div>
        }
      />
      <DeckBrowser />
    </div>
  );
}
