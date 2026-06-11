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
            <AiImportButton />
            <ImportButton variant="ghost" />
          </div>
        }
      />
      <DeckBrowser />
    </div>
  );
}
