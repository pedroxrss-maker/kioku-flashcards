import { PageHeader } from '../components/PageHeader';
import { DeckBrowser } from '../features/decks/DeckBrowser';
import { ImportButton } from '../features/importer/ImportButton';
import { useDecks } from '../db/hooks';

export function Decks() {
  const decks = useDecks();
  return (
    <div className="rise">
      <PageHeader
        title="Meus Decks"
        subtitle={`${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`}
        action={<ImportButton variant="ghost" />}
      />
      <DeckBrowser />
    </div>
  );
}
