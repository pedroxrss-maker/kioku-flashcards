/** Standard Anki 2.x collection DDL (legacy `collection.anki2`, schema ver 11). */
export const ANKI_SCHEMA = `
CREATE TABLE col (
  id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL,
  scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL,
  usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
  models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL
);
CREATE TABLE notes (
  id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL,
  mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL,
  flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL,
  flags integer NOT NULL, data text NOT NULL
);
CREATE TABLE cards (
  id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL,
  ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL,
  type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL,
  ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL,
  lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL,
  odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL
);
CREATE TABLE revlog (
  id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL,
  ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL,
  factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL
);
CREATE TABLE graves (usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`;

const BASIC_CSS =
  '.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n';

export function buildModels(modelId: number): string {
  const model = {
    [modelId]: {
      id: modelId,
      name: 'Kioku Basic',
      type: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      sortf: 0,
      did: 1,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
      ],
      css: BASIC_CSS,
      latexPre: '',
      latexPost: '',
      latexsvg: false,
      req: [[0, 'any', [0]]],
      tags: [],
      vers: [],
    },
  };
  return JSON.stringify(model);
}

export function buildDecks(deckId: number, deckName: string): string {
  const common = {
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
    conf: 1,
    usn: -1,
    desc: '',
    dyn: 0,
    collapsed: false,
    mod: Math.floor(Date.now() / 1000),
  };
  const decks = {
    '1': { ...common, id: 1, name: 'Default' },
    [deckId]: { ...common, id: deckId, name: deckName.replace(/::/g, '_') },
  };
  return JSON.stringify(decks);
}

export function buildDconf(): string {
  return JSON.stringify({
    '1': {
      id: 1,
      name: 'Default',
      mod: 0,
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, separate: true, order: 1, perDay: 20, bury: false },
      rev: { perDay: 200, ease4: 1.3, fuzz: 0.05, minSpace: 1, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 1 },
      dyn: false,
    },
  });
}

export function buildConf(modelId: number, nextPos: number): string {
  return JSON.stringify({
    nextPos,
    estTimes: true,
    activeDecks: [1],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: String(modelId),
    collapseTime: 1200,
  });
}
