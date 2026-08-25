// Parsing logic for the 2027 T&E Forecast sheet. Tested against a real
// export of the sheet — see the project notes for the block layout this
// assumes.

// Google Sheets date cells come back from the API (in UNFORMATTED_VALUE
// mode) as serial numbers (days since Dec 30, 1899), not ISO strings.
function serialToISODate(serial) {
  if (typeof serial !== 'number') return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

const CURRENCY_SYMBOL = {
  USD: '$',
  GBP: '£',
  AUD: 'A$',
  INR: '\u20b9',
  EUR: '\u20ac',
  BRL: 'R$',
  CAD: 'C$',
  SGD: 'S$',
  JPY: '\u00a5',
};

function currencySymbol(code) {
  return CURRENCY_SYMBOL[code] || (code || '');
}

// --- Parse a single region tab (NA, LATAM, EMEA, APAC, JAPAN, INDIA) ---
// Layout: title row, currency/note row, "Hotel" note row (ignored per
// instruction — column layout varies by region because of it, so columns
// are located by header text rather than fixed index), header row, then
// repeating conference blocks: a "▸ Conference Name (CODE)" title row, an
// "Event dates →" row with start/end dates and a combined
// "Venue: X · Meal limits: Y" string, then one row per role until a blank
// or "Est. T&E:" summary row.
function parseRegionTab(tabKey, rows) {
  const conferences = [];
  if (!rows || rows.length === 0) return { region: tabKey, currency: null, conferences };

  const noteText = (rows[1] && rows[1][0]) || '';
  const currencyMatch = /all figures\s+([A-Z]{3})/.exec(noteText);
  const currency = currencyMatch ? currencyMatch[1] : null;

  // Find the header row (contains "Role" in column A) to map columns by name.
  const headerIdx = rows.findIndex((r) => (r[0] || '').toString().trim() === 'Role');
  const header = headerIdx >= 0 ? rows[headerIdx] : [];
  const colIndex = (predicate) => header.findIndex((h) => predicate((h || '').toString().trim()));

  const arrivalCol = colIndex((h) => h.startsWith('Onsite Arrival'));
  const depCol = colIndex((h) => h.startsWith('Onsite Dep'));
  const flightCol = colIndex((h) => h.startsWith('Flight Budget'));
  const perDiemCol = colIndex((h) => h.startsWith('Per Diem'));
  const otherCol = colIndex((h) => h.startsWith('Other'));
  const totalCol = colIndex((h) => h.startsWith('Total Budget'));
  const personCol = colIndex((h) => h.startsWith('Person'));

  let i = headerIdx >= 0 ? headerIdx + 1 : 0;

  while (i < rows.length) {
    const row = rows[i] || [];
    const titleCell = (row[0] || '').toString();

    if (titleCell.startsWith('\u25b8')) {
      // Conference title row, e.g. "▸ 2027 NA CIO Leadership Forum - West (CIOS21)"
      const raw = titleCell.replace(/^\u25b8\s*/, '').trim();
      const codeMatch = /\(([^)]+)\)\s*$/.exec(raw);
      const code = codeMatch ? codeMatch[1] : null;
      const name = codeMatch ? raw.slice(0, codeMatch.index).trim() : raw;
      const note = row.slice(1).map((c) => (c === undefined || c === null ? '' : String(c).trim())).find((c) => c) || null;

      const datesRow = rows[i + 1] || [];
      const eventStart = serialToISODate(datesRow[1]);
      const eventEnd = serialToISODate(datesRow[2]);
      const infoText = (datesRow[4] || '').toString();
      const venueMatch = /Venue:\s*(.*?)\s*(?:\u00b7|$)/.exec(infoText);
      const mealMatch = /Meal limits:\s*(.*)$/.exec(infoText);
      const venue = venueMatch ? venueMatch[1].trim() : null;
      const mealCountry = mealMatch ? mealMatch[1].trim() : null;

      const roles = [];
      let r = i + 2;
      while (r < rows.length && rows[r] && rows[r][0]) {
        const dr = rows[r];
        roles.push({
          role: dr[0],
          onsiteArrival: serialToISODate(dr[arrivalCol]),
          onsiteDeparture: serialToISODate(dr[depCol]),
          flightBudget: typeof dr[flightCol] === 'number' ? dr[flightCol] : null,
          perDiem: typeof dr[perDiemCol] === 'number' ? dr[perDiemCol] : null,
          other: typeof dr[otherCol] === 'number' ? dr[otherCol] : null,
          totalBudget: typeof dr[totalCol] === 'number' ? dr[totalCol] : null,
          person: dr[personCol] || null,
        });
        r++;
      }

      conferences.push({ code, name, note, venue, mealCountry, eventStart, eventEnd, roles });

      // Skip forward past the "Est. T&E:" row and blank separator row(s).
      i = r;
      while (i < rows.length && (!rows[i] || !rows[i][0])) i++;
    } else {
      i++;
    }
  }

  return { region: tabKey, currency, conferences };
}

// Flattens all region tabs into one array of person-assignment records,
// matching the shape the frontend expects (one row per person per
// conference).
function buildRecords(regionsParsed) {
  const records = [];
  regionsParsed.forEach(({ region, currency, conferences }) => {
    conferences.forEach((conf) => {
      const conference = conf.code ? `${conf.name} (${conf.code})` : conf.name;
      conf.roles.forEach((r) => {
        records.push({
          region,
          currency,
          conference,
          code: conf.code,
          venue: conf.venue,
          mealCountry: conf.mealCountry,
          eventStart: conf.eventStart,
          eventEnd: conf.eventEnd,
          note: conf.note,
          person: r.person,
          role: r.role,
          inDate: r.onsiteArrival,
          outDate: r.onsiteDeparture,
          flightBudget: r.flightBudget,
          perDiem: r.perDiem,
          other: r.other,
          totalBudget: r.totalBudget,
        });
      });
    });
  });
  return records;
}

// --- Parse the "2027 SUMMARY" tab (region totals + per-region event list) ---
// Layout (all within columns B:F once fetched with that offset, so index 0
// here is column B): a "REGION SUMMARY" section with one row per region
// (Region, Base Ccy, 2027 Local, 2027 USD, Events) followed by a
// "GLOBAL TOTAL (USD)" row, then repeating "{REGION} — Events" sections,
// each with its own header row and one row per event (Event, Dates,
// Venue / Location, 2027 Forecast (CCY), Assigned Reg Lead).
function parseCostSummary(rows) {
  if (!rows || rows.length === 0) return { regionTotals: [], globalTotalUSD: null, regionEvents: {} };

  const regionTotals = [];
  let globalTotalUSD = null;

  const summaryHeaderIdx = rows.findIndex((r) => (r[0] || '').toString().trim() === 'REGION SUMMARY');
  if (summaryHeaderIdx >= 0) {
    let i = summaryHeaderIdx + 2; // skip section header + column header row
    while (i < rows.length && rows[i] && rows[i][0]) {
      const row = rows[i];
      const label = (row[0] || '').toString();
      if (label.startsWith('GLOBAL TOTAL')) {
        globalTotalUSD = typeof row[3] === 'number' ? row[3] : null;
        i++;
        break;
      }
      regionTotals.push({
        region: label,
        currency: row[1] || null,
        local: typeof row[2] === 'number' ? row[2] : null,
        usd: typeof row[3] === 'number' ? row[3] : null,
        events: typeof row[4] === 'number' ? row[4] : null,
      });
      i++;
    }
  }

  const regionEvents = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const label = (row[0] || '').toString();
    const match = /^(.+?)\s*\u2014\s*Events$/.exec(label);
    if (match) {
      const region = match[1].trim();
      const headerRow = rows[i + 1] || [];
      const currencyMatch = /\(([A-Z]{3})\)/.exec((headerRow[3] || '').toString());
      const currency = currencyMatch ? currencyMatch[1] : null;

      const events = [];
      let r = i + 2;
      while (r < rows.length && rows[r] && rows[r][0]) {
        const er = rows[r];
        events.push({
          code: er[0],
          dates: er[1] || null,
          venue: er[2] || null,
          forecast: typeof er[3] === 'number' ? er[3] : null,
          regLead: er[4] || null,
        });
        r++;
      }
      regionEvents[region] = { currency, events };
      i = r;
    }
  }

  return { regionTotals, globalTotalUSD, regionEvents };
}

// --- Parse the "Clashes" tab (already computed live by the sheet) ---
// Columns (fetched with a B-start range, so index 0 is column B): Person,
// Region, Event, Onsite Dates, Clashes With.
function parseClashes(rows) {
  if (!rows || rows.length === 0) return [];
  const headerIdx = rows.findIndex((r) => (r[0] || '').toString().trim() === 'Person');
  if (headerIdx < 0) return [];

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) break;
    out.push({
      person: row[0],
      region: row[1] || null,
      event: row[2] || null,
      onsiteDates: row[3] || null,
      clashesWith: row[4] || null,
    });
  }
  return out;
}

// --- Parse the "Peg Rates 2027" tab into a { CODE: rateToUSD } map ---
function parsePegRates(rows) {
  const map = {};
  if (!rows) return map;
  rows.forEach((row) => {
    const code = (row[0] || '').toString().trim();
    const rate = row[2];
    if (/^[A-Z]{3}$/.test(code) && typeof rate === 'number') {
      map[code] = rate;
    }
  });
  return map;
}

module.exports = {
  parseRegionTab,
  buildRecords,
  parseCostSummary,
  parseClashes,
  parsePegRates,
  currencySymbol,
};
