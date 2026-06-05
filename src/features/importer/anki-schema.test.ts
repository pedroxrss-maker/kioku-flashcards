import path from 'node:path';
import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import {
  ANKI_SCHEMA,
  buildConf,
  buildDconf,
  buildDecks,
  buildModels,
} from './anki-schema';

const FIELD_SEP = String.fromCharCode(0x1f);

async function loadSql() {
  return initSqlJs({
    locateFile: (f: string) => path.join(process.cwd(), 'node_modules/sql.js/dist', f),
  });
}

describe('anki-schema (export SQL correctness)', () => {
  it('builders emit valid JSON', () => {
    expect(() => JSON.parse(buildModels(123))).not.toThrow();
    expect(() => JSON.parse(buildDecks(456, 'My Deck'))).not.toThrow();
    expect(() => JSON.parse(buildDconf())).not.toThrow();
    expect(() => JSON.parse(buildConf(123, 5))).not.toThrow();
    const models = JSON.parse(buildModels(123)) as Record<string, { flds: unknown[] }>;
    expect(models['123'].flds).toHaveLength(2);
  });

  it('schema DDL runs and a note/card round-trips through export/import', async () => {
    const SQL = await loadSql();
    const db = new SQL.Database();
    db.run(ANKI_SCHEMA);

    const now = Date.now();
    db.run('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      1, Math.floor(now / 1000), now, now, 11, 0, 0, 0,
      buildConf(now, 2), buildModels(now), buildDecks(now + 1, 'Deck'), buildDconf(), '{}',
    ]);
    const flds = `Front side${FIELD_SEP}Back side`;
    db.run('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
      now, 'guid123456', now, Math.floor(now / 1000), -1, '', flds, 'Front side', 42, 0, '',
    ]);
    db.run('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      now + 5, now, now + 1, 0, Math.floor(now / 1000), -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, '',
    ]);

    const bytes = db.export();
    db.close();

    const db2 = new SQL.Database(bytes);
    const res = db2.exec('SELECT flds FROM notes');
    const got = String(res[0].values[0][0]);
    expect(got.split(FIELD_SEP)).toEqual(['Front side', 'Back side']);

    const cardCount = db2.exec('SELECT COUNT(*) FROM cards')[0].values[0][0];
    expect(cardCount).toBe(1);
    db2.close();
  });
});
