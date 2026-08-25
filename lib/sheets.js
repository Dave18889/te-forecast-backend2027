// Shared Google Sheets API access for the 2027 T&E portal.
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed / not needed (e.g. running on Vercel) — ignore.
}

const API_KEY = process.env.GOOGLE_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const REGION_TABS = ['NA', 'LATAM', 'EMEA', 'APAC', 'JAPAN', 'INDIA'];
const REGION_RANGES = REGION_TABS.map((t) => `'${t}'!A1:N500`);
const SUMMARY_RANGE = `'2027 SUMMARY'!B1:F400`;
const CLASHES_RANGE = `'Clashes'!B1:F200`;
const PEG_RATES_RANGE = `'Peg Rates 2027'!A1:C30`;

const ALL_RANGES = [...REGION_RANGES, SUMMARY_RANGE, CLASHES_RANGE, PEG_RATES_RANGE];

// Cache the whole batch together — all tabs are read on every request anyway.
const CACHE_TTL_MS = 15 * 1000;
let cached = null;
let cachedAt = 0;

async function fetchAll() {
  if (!API_KEY || !SPREADSHEET_ID) {
    throw new Error(
      'Missing GOOGLE_API_KEY or SPREADSHEET_ID. Set them in .env locally, or in your Vercel project\'s Environment Variables.'
    );
  }

  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const rangeParams = ALL_RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${rangeParams}&valueRenderOption=UNFORMATTED_VALUE&key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${body}`);
  }
  const json = await res.json();
  const valueRanges = json.valueRanges || [];

  const result = {
    regions: {},
    summary: [],
    clashes: [],
    pegRates: [],
  };

  REGION_TABS.forEach((tab, i) => {
    result.regions[tab] = valueRanges[i]?.values || [];
  });
  result.summary = valueRanges[REGION_TABS.length]?.values || [];
  result.clashes = valueRanges[REGION_TABS.length + 1]?.values || [];
  result.pegRates = valueRanges[REGION_TABS.length + 2]?.values || [];

  cached = result;
  cachedAt = Date.now();
  return result;
}

module.exports = { fetchAll, REGION_TABS };
