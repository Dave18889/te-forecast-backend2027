let RECORDS = [];
let REGIONS = [];
let COST_SUMMARY = null;
let CLASHES = [];
let PEG_RATES = {};
const REGION_CURRENCY = {}; // region -> currency code, derived from records

const CURRENCY_SYMBOL = { USD: '$', GBP: '£', AUD: 'A$', INR: '\u20b9', EUR: '\u20ac', BRL: 'R$', CAD: 'C$', SGD: 'S$', JPY: '\u00a5' };
function currencySymbol(code) { return CURRENCY_SYMBOL[code] || (code || ''); }

const LIVE_DATA_URL = '/api/te-forecast';

async function loadLiveData() {
  const subtitleEl = document.getElementById('subtitleText');
  const dot = document.getElementById('liveDot');
  subtitleEl.textContent = 'Loading latest data\u2026';
  try {
    const res = await fetch(LIVE_DATA_URL);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    RECORDS = json.records || [];
    COST_SUMMARY = json.costSummary || null;
    CLASHES = json.clashes || [];
    PEG_RATES = json.pegRates || {};

    REGIONS = ["NA","LATAM","EMEA","INDIA","APAC","JAPAN"].filter(r => RECORDS.some(rec => rec.region === r));
    RECORDS.forEach(r => { if (r.currency && !REGION_CURRENCY[r.region]) REGION_CURRENCY[r.region] = r.currency; });
    if (!currentRegion) currentRegion = REGIONS[0];

    dot.className = 'live-dot';
    const time = new Date(json.updatedAt || Date.now()).toLocaleTimeString();
    subtitleEl.innerHTML = `${REGIONS.length} region sheets \u00b7 ${RECORDS.length} assignments \u00b7 ${new Set(RECORDS.map(r=>r.conference)).size} conferences \u00b7 updated ${time}`;

    renderAll();
    renderCostView();
  } catch (err) {
    dot.className = 'live-dot error';
    subtitleEl.textContent = `Could not load live data \u2014 ${err.message}`;
    console.error(err);
  }
}

const SEARCHABLE = ["conference","person","role","venue"];
const SEARCH_LABELS = { conference: "Conference", person: "Person", role: "Role", venue: "Venue" };
const TODAY_ISO = new Date().toISOString().slice(0,10);

let currentRegion = null;
let activeFields = new Set(SEARCHABLE);
let sortMode = "date";
let sortDir = 1;
let openConfs = new Set();

const tabsEl = document.getElementById('tabs');
const chipsEl = document.getElementById('fieldChips');
const sortRowEl = document.getElementById('sortRow');
const confListEl = document.getElementById('confList');
const searchInput = document.getElementById('searchInput');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');

const personSearchInput = document.getElementById('personSearchInput');
const personGroups = document.getElementById('personGroups');
const personResultCount = document.getElementById('personResultCount');
const personEmptyState = document.getElementById('personEmptyState');

function fmtDate(iso) {
  if (!iso) return '<span class="muted">\u2014</span>';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateFull(iso) {
  if (!iso) return '<span class="muted">\u2014</span>';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtBudget(n, currencyLabel) {
  if (n === null || n === undefined) return '<span class="muted">\u2014</span>';
  const formatted = n.toLocaleString('en-US');
  return currencyLabel ? `${currencyLabel} ${formatted}` : formatted;
}

document.getElementById('modeBrowse').onclick = () => setMode('browse');
document.getElementById('modePerson').onclick = () => setMode('person');
document.getElementById('modeCost').onclick = () => setMode('cost');

function setMode(mode) {
  document.getElementById('modeBrowse').classList.toggle('active', mode === 'browse');
  document.getElementById('modePerson').classList.toggle('active', mode === 'person');
  document.getElementById('modeCost').classList.toggle('active', mode === 'cost');
  document.getElementById('browseView').style.display = mode === 'browse' ? 'block' : 'none';
  document.getElementById('personView').style.display = mode === 'person' ? 'block' : 'none';
  document.getElementById('costView').style.display = mode === 'cost' ? 'block' : 'none';
  if (mode === 'person') renderPersonView();
  if (mode === 'cost') renderCostView();
}

let showUSD = false;

function convertIfNeeded(n, currencyCode) {
  if (n === null || n === undefined || !showUSD) return n;
  const rate = PEG_RATES[currencyCode];
  return rate ? n * rate : n;
}
function budgetDisplay(n, region) {
  const code = REGION_CURRENCY[region];
  const val = convertIfNeeded(n, code);
  const label = showUSD ? 'US$' : currencySymbol(code);
  return fmtBudget(val, label);
}

document.getElementById('usdToggle').onclick = () => {
  showUSD = !showUSD;
  document.getElementById('usdToggle').classList.toggle('active', showUSD);
  document.getElementById('usdToggle').textContent = showUSD ? 'Show native currencies' : 'Show in USD';
  renderRegionSummary(); renderConfList(); renderCostView();
  if (document.getElementById('personView').style.display !== 'none') renderPersonView();
};

let openCostRegions = new Set();

function renderCostView() {
  const headlineEl = document.getElementById('costHeadline');
  const gridEl = document.getElementById('costRegionGrid');

  if (!COST_SUMMARY || !COST_SUMMARY.regionTotals || COST_SUMMARY.regionTotals.length === 0) {
    headlineEl.innerHTML = `
      <div>
        <div class="label">2027 Forecast</div>
        <div class="value" style="font-size:16px;">No cost data was returned from the sheet.</div>
        <div class="sub">Check that the "2027 SUMMARY" tab still exists with that exact name and layout.</div>
      </div>
    `;
    gridEl.innerHTML = "";
    return;
  }

  headlineEl.innerHTML = `
    <div>
      <div class="label">2027 Global Forecast Total (USD)</div>
      <div class="value">${fmtBudget(COST_SUMMARY.globalTotalUSD, 'US$')}</div>
      <div class="sub">Sum of every region's forecast, converted to a common USD basis via the sheet's own peg rates so regions in different currencies can be compared on one line.</div>
    </div>
  `;

  gridEl.innerHTML = "";
  COST_SUMMARY.regionTotals.forEach(rt => {
    const currencyLabel = currencySymbol(rt.currency);
    const isOpen = openCostRegions.has(rt.region);
    const displayTotal = showUSD ? fmtBudget(rt.usd, 'US$') : fmtBudget(rt.local, currencyLabel);
    const secondaryTotal = showUSD ? '' : `<div class="cost-region-delta">${fmtBudget(rt.usd, 'US$')} equivalent</div>`;

    const card = document.createElement('div');
    card.className = 'cost-region-card' + (isOpen ? ' open' : '');

    const head = document.createElement('div');
    head.className = 'cost-region-head';
    head.innerHTML = `
      <div>
        <div class="cost-region-name">${rt.region}</div>
        <div class="cost-region-total">${displayTotal}</div>
        ${secondaryTotal}
        <div class="cost-region-delta">${rt.events ?? '\u2014'} events</div>
      </div>
      <span class="cost-chevron">\u203a</span>
    `;
    head.onclick = () => {
      if (openCostRegions.has(rt.region)) openCostRegions.delete(rt.region);
      else openCostRegions.add(rt.region);
      renderCostView();
    };
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'cost-region-body';
    const regionEvents = (COST_SUMMARY.regionEvents && COST_SUMMARY.regionEvents[rt.region]) || { events: [] };
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Event</th><th>Dates</th><th>Venue</th><th>Forecast</th><th>Reg Lead</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    regionEvents.events.forEach(ev => {
      const forecastVal = convertIfNeeded(ev.forecast, rt.currency);
      const forecastLabel = showUSD ? 'US$' : currencyLabel;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ev.code || ''}</td>
        <td>${ev.dates || ''}</td>
        <td>${ev.venue || ''}</td>
        <td>${fmtBudget(forecastVal, forecastLabel)}</td>
        <td>${ev.regLead || '<span class="muted">Unassigned</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
    const totalsTr = document.createElement('tr');
    totalsTr.style.borderTop = '2px solid var(--navy)';
    totalsTr.style.fontWeight = '700';
    totalsTr.innerHTML = `
      <td colspan="3"><b>Total</b></td>
      <td><b>${displayTotal}</b></td>
      <td></td>
    `;
    tbody.appendChild(totalsTr);
    table.appendChild(tbody);
    body.appendChild(table);
    card.appendChild(body);

    gridEl.appendChild(card);
  });
}

function renderTabs() {
  tabsEl.innerHTML = "";
  REGIONS.forEach(region => {
    const confCount = new Set(RECORDS.filter(r => r.region === region).map(r => r.conference)).size;
    const btn = document.createElement('button');
    btn.className = 'tab' + (region === currentRegion ? ' active' : '');
    btn.innerHTML = `${region} <span class="count">${confCount}</span>`;
    btn.onclick = () => { currentRegion = region; searchInput.value = ""; renderAll(); };
    tabsEl.appendChild(btn);
  });
}

function renderChips() {
  chipsEl.innerHTML = "";
  const label = document.createElement('span');
  label.style.cssText = "font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:var(--text-faint);align-self:center;margin-right:2px;";
  label.textContent = "Search in:";
  chipsEl.appendChild(label);
  SEARCHABLE.forEach(field => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeFields.has(field) ? ' active' : '');
    chip.textContent = SEARCH_LABELS[field];
    chip.onclick = () => { activeFields.has(field) ? activeFields.delete(field) : activeFields.add(field); renderConfList(); };
    chipsEl.appendChild(chip);
  });
}

const regionSummaryEl = document.getElementById('regionSummary');

function renderRegionSummary() {
  const regionRecords = RECORDS.filter(r => r.region === currentRegion);
  const totalCost = regionRecords.reduce((s,r) => s + (r.totalBudget||0), 0);
  const uniquePeople = new Set(regionRecords.map(r => r.person).filter(Boolean)).size;
  const confCount = new Set(regionRecords.map(r => r.conference)).size;

  regionSummaryEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${budgetDisplay(totalCost, currentRegion)}</div>
      <div class="stat-label">Total forecasted cost</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${uniquePeople}</div>
      <div class="stat-label">Unique team members</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${confCount}</div>
      <div class="stat-label">Conferences</div>
    </div>
  `;
}

function renderSortRow() {
  sortRowEl.innerHTML = "";
  const label = document.createElement('span');
  label.style.cssText = "font-family:'Inter',sans-serif;font-size:11px;font-weight:600;color:var(--text-faint);align-self:center;margin-right:2px;";
  label.textContent = "Sort:";
  sortRowEl.appendChild(label);
  [["date","Event date"],["name","Name"],["budget","Team budget"]].forEach(([key,lbl]) => {
    const btn = document.createElement('button');
    btn.className = 'sort-btn' + (sortMode === key ? ' active' : '');
    btn.textContent = lbl + (sortMode === key ? (sortDir === 1 ? ' \u25b2' : ' \u25bc') : '');
    btn.onclick = () => { sortDir = (sortMode === key) ? -sortDir : 1; sortMode = key; renderConfList(); };
    sortRowEl.appendChild(btn);
  });
}

function rolePriority(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('reg lead')) return 0;
  if (r.includes('reg support')) return 1;
  if (r.includes('it lead')) return 2;
  if (r.includes('it support')) return 3;
  if (r.includes('zone lead')) return 5;
  return 4;
}

function findRegLead(people) {
  const lead = people.find(p => (p.role || '').toLowerCase().includes('reg lead'));
  return lead ? lead.person : null;
}

function extractConfCode(conference) {
  const m = conference && conference.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}
function stripConfCode(conference) {
  return conference ? conference.replace(/\s*\([^)]+\)\s*$/, '') : conference;
}

function highlight(text, term) {
  if (!term || !text) return text || '';
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + term.length) + '</mark>' + text.slice(idx + term.length);
}

function groupConferences(region) {
  const map = new Map();
  RECORDS.filter(r => r.region === region).forEach(r => {
    if (!map.has(r.conference)) {
      map.set(r.conference, {
        conference: r.conference,
        code: r.code,
        venue: r.venue,
        eventStart: r.eventStart,
        eventEnd: r.eventEnd,
        note: r.note,
        region: r.region,
        people: []
      });
    }
    map.get(r.conference).people.push(r);
  });
  return [...map.values()];
}

function renderConfList() {
  const term = searchInput.value.trim().toLowerCase();
  let confs = groupConferences(currentRegion);

  if (term) {
    confs = confs.filter(c => {
      const confMatch = (activeFields.has("conference") && c.conference.toLowerCase().includes(term)) ||
                        (activeFields.has("venue") && c.venue && c.venue.toLowerCase().includes(term));
      const peopleMatch = c.people.some(p =>
        (activeFields.has("person") && p.person && p.person.toLowerCase().includes(term)) ||
        (activeFields.has("role") && p.role && p.role.toLowerCase().includes(term))
      );
      return confMatch || peopleMatch;
    });
  }

  confs.sort((a,b) => {
    if (sortMode === "name") return a.conference.localeCompare(b.conference) * sortDir;
    if (sortMode === "budget") {
      const ba = a.people.reduce((s,p)=>s+(p.totalBudget||0),0);
      const bb = b.people.reduce((s,p)=>s+(p.totalBudget||0),0);
      return (ba-bb) * sortDir;
    }
    return String(a.eventStart||'').localeCompare(String(b.eventStart||'')) * sortDir;
  });

  confListEl.innerHTML = "";
  confs.forEach(c => {
    const key = c.region + '::' + c.conference;
    const peopleMatch = term && c.people.some(p =>
      (activeFields.has("person") && p.person && p.person.toLowerCase().includes(term)) ||
      (activeFields.has("role") && p.role && p.role.toLowerCase().includes(term))
    );
    const isOpen = openConfs.has(key) || peopleMatch;

    const item = document.createElement('div');
    const isPast = c.eventEnd && c.eventEnd < TODAY_ISO;
    item.className = 'conf-item' + (isOpen ? ' open' : '') + (isPast ? ' past' : '');

    const budgetTotal = c.people.reduce((s,p)=>s+(p.totalBudget||0),0);
    const regLead = findRegLead(c.people);
    const confCode = c.code || extractConfCode(c.conference);
    const confName = stripConfCode(c.conference);

    let daysUntilBadge = '';
    if (!isPast && c.eventStart) {
      const daysUntil = Math.round((new Date(c.eventStart + 'T00:00:00') - new Date(TODAY_ISO + 'T00:00:00')) / 86400000);
      if (daysUntil === 0) daysUntilBadge = '<span class="days-until-badge">today</span>';
      else if (daysUntil > 0) daysUntilBadge = `<span class="days-until-badge">in ${daysUntil} day${daysUntil === 1 ? '' : 's'}</span>`;
    }

    const head = document.createElement('div');
    head.className = 'conf-header';
    head.innerHTML = `
      <span class="chevron">\u203a</span>
      <div class="conf-main">
        <div class="conf-title-row">
          <span class="conf-title">${highlight(confName, activeFields.has("conference") ? term : "")}</span>
          ${confCode ? `<span class="conf-code">${confCode}</span>` : ''}
          ${isPast ? '<span class="past-badge">Completed</span>' : ''}
          ${daysUntilBadge}
        </div>
        ${c.venue ? `<div class="conf-venue">${highlight(c.venue, activeFields.has("venue") ? term : "")}</div>` : ''}
        ${regLead ? `<div class="conf-reglead"><b>Reg Lead</b> ${regLead}</div>` : ''}
        ${c.note ? `<div class="conf-note">${c.note}</div>` : ''}
      </div>
      <div class="conf-meta"><b>${c.people.length}</b> on team<br>${budgetDisplay(budgetTotal, c.region)} total</div>
      <div class="conf-dates"><span class="label">Event</span>${fmtDate(c.eventStart)}<span class="dash">\u2013</span>${fmtDateFull(c.eventEnd)}</div>
    `;
    head.onclick = () => {
      if (openConfs.has(key)) openConfs.delete(key); else openConfs.add(key);
      renderConfList();
    };
    item.appendChild(head);

    const body = document.createElement('div');
    body.className = 'conf-body';
    const peopleSorted = c.people.slice().sort((a,b) => {
      const pa = rolePriority(a.role), pb = rolePriority(b.role);
      if (pa !== pb) return pa - pb;
      return (a.role||'').localeCompare(b.role||'');
    });
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Person</th><th>Role</th><th>In Date</th><th>Out Date</th><th>Total Budget</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    peopleSorted.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.person ? highlight(p.person, activeFields.has("person") ? term : "") : '<span class="muted">Unassigned</span>'}</td>
        <td><span class="role-pill">${highlight(p.role, activeFields.has("role") ? term : "")}</span></td>
        <td>${fmtDateFull(p.inDate)}</td>
        <td>${fmtDateFull(p.outDate)}</td>
        <td>${budgetDisplay(p.totalBudget, c.region)}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
    item.appendChild(body);

    confListEl.appendChild(item);
  });

  emptyState.style.display = confs.length === 0 ? 'block' : 'none';
  resultCount.textContent = `${confs.length} of ${groupConferences(currentRegion).length} conferences`;
}

function renderAll() { renderTabs(); renderRegionSummary(); renderChips(); renderSortRow(); renderConfList(); renderGlobalClashBadge(); }
searchInput.addEventListener('input', renderConfList);

// ---- Clash lookups (sourced from the sheet's own live Clashes tab) ----
function clashesForPerson(person) {
  return CLASHES.filter(c => c.person === person);
}
function recordHasClash(record) {
  return CLASHES.some(c => c.person === record.person && c.event === record.code);
}

function renderGlobalClashBadge() {
  const badge = document.getElementById('clashBadgeGlobal');
  const count = new Set(CLASHES.map(c => c.person)).size;
  if (count > 0) {
    badge.className = 'clash-badge-global warn';
    badge.textContent = `\u26a0 ${count} people with overlapping trips`;
    badge.onclick = () => { setMode('person'); };
  } else {
    badge.className = 'clash-badge-global clear';
    badge.textContent = 'No overlapping trips detected';
    badge.onclick = null;
  }
}

let openPersons = new Set();

function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(escape).join(',')].concat(rows.map(r => r.map(escape).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('exportBrowseBtn').onclick = () => {
  const rows = [];
  const confs = groupConferences(currentRegion);
  confs.forEach(c => {
    c.people.forEach(p => {
      rows.push([
        c.region, stripConfCode(c.conference), c.code || '', c.venue || '',
        c.eventStart || '', c.eventEnd || '', p.person || 'Unassigned', p.role || '',
        p.inDate || '', p.outDate || '', p.totalBudget ?? '',
        REGION_CURRENCY[c.region] || ''
      ]);
    });
  });
  downloadCSV(`${currentRegion}-conferences.csv`,
    ['Region','Conference','Code','Venue','Event Start','Event End','Person','Role','In Date','Out Date','Total Budget','Currency'],
    rows);
};

document.getElementById('exportPersonBtn').onclick = () => {
  const counts = {};
  RECORDS.forEach(r => { if (r.person) counts[r.person] = (counts[r.person] || 0) + 1; });
  const people = Object.keys(counts).filter(p => counts[p] > 3).sort();
  const rows = [];
  people.forEach(person => {
    const records = RECORDS.filter(r => r.person === person).slice().sort((a,b) => (a.inDate||'').localeCompare(b.inDate||''));
    records.forEach(r => {
      rows.push([person, r.region, r.conference, r.role, r.inDate || '', r.outDate || '',
        r.totalBudget ?? '', REGION_CURRENCY[r.region] || '',
        recordHasClash(r) ? 'Yes' : 'No']);
    });
  });
  downloadCSV('people-conferences.csv',
    ['Person','Region','Conference','Role','In Date','Out Date','Total Budget','Currency','Overlaps Another Trip'],
    rows);
};

document.getElementById('exportCostBtn').onclick = () => {
  if (!COST_SUMMARY) return;
  const rows = [];
  COST_SUMMARY.regionTotals.forEach(rt => {
    const regionEvents = (COST_SUMMARY.regionEvents && COST_SUMMARY.regionEvents[rt.region]) || { events: [] };
    regionEvents.events.forEach(ev => {
      rows.push([rt.region, ev.code, ev.dates, ev.venue, ev.forecast ?? '', ev.regLead || '', rt.currency || '']);
    });
    rows.push([rt.region, 'TOTAL', '', '', rt.local ?? '', '', rt.currency || '']);
  });
  downloadCSV('cost-summary.csv', ['Region','Event','Dates','Venue','Forecast','Reg Lead','Currency'], rows);
};

function renderPersonView() {
  const term = personSearchInput.value.trim().toLowerCase();
  const counts = {};
  RECORDS.forEach(r => { if (r.person) counts[r.person] = (counts[r.person] || 0) + 1; });
  const people = Object.keys(counts).filter(p => counts[p] > 3).sort();
  const matched = term ? people.filter(p => p.toLowerCase().includes(term)) : people;

  personGroups.innerHTML = "";
  let totalClashCount = 0;

  matched.forEach(person => {
    const records = RECORDS.filter(r => r.person === person)
      .slice()
      .sort((a,b) => (a.inDate||'').localeCompare(b.inDate||''));
    const personClashes = clashesForPerson(person);
    const hasClash = personClashes.length > 0;
    if (hasClash) totalClashCount++;
    const isOpen = openPersons.has(person);

    const budgetTotal = records.reduce((s,r)=> s + (r.totalBudget||0), 0);
    const distinctRegions = new Set(records.map(r => r.region));
    let budgetTotalText;
    if (showUSD) {
      const usdSum = records.reduce((s,r) => s + (convertIfNeeded(r.totalBudget, REGION_CURRENCY[r.region]) || 0), 0);
      budgetTotalText = `US$ ${usdSum.toLocaleString('en-US')}`;
    } else {
      const aggCurrency = distinctRegions.size === 1 ? currencySymbol(REGION_CURRENCY[records[0].region]) : null;
      budgetTotalText = aggCurrency
        ? `${aggCurrency} ${budgetTotal.toLocaleString('en-US')}`
        : `${budgetTotal.toLocaleString('en-US')} (mixed currencies)`;
    }

    const totalTravelDays = records.reduce((s,r) => {
      if (!r.inDate || !r.outDate) return s;
      const days = Math.round((new Date(r.outDate) - new Date(r.inDate)) / 86400000) + 1;
      return s + Math.max(days, 0);
    }, 0);

    const item = document.createElement('div');
    item.className = 'person-item' + (isOpen ? ' open' : '') + (hasClash ? ' has-clash' : '');

    const header = document.createElement('div');
    header.className = 'person-header';
    header.innerHTML = `
      <span class="person-chevron">\u203a</span>
      <div class="person-name">${person}</div>
      <div class="person-meta">${records.length} conference${records.length === 1 ? '' : 's'} \u00b7 ${totalTravelDays} travel day${totalTravelDays === 1 ? '' : 's'} \u00b7 ${budgetTotalText} total</div>
      <div class="clash-status ${hasClash ? 'warn' : 'clear'}">${hasClash ? `\u26a0 ${personClashes.length} overlapping trip${personClashes.length===1?'':'s'}` : '\u2713 No clashes'}</div>
    `;
    header.onclick = () => {
      if (openPersons.has(person)) openPersons.delete(person);
      else openPersons.add(person);
      renderPersonView();
    };
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'person-body';
    const tableWrap = document.createElement('div');
    tableWrap.className = 'person-table-scroll';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Region</th><th>Conference</th><th>Role</th><th>In Date</th><th>Out Date</th><th>Total Budget</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    records.forEach(r => {
      const clashed = recordHasClash(r);
      const tr = document.createElement('tr');
      if (clashed) tr.className = 'clash-row';
      tr.innerHTML = `
        <td>${r.region}</td>
        <td>${r.conference}${clashed ? ' <span class="clash-flag">\u26a0 overlap</span>' : ''}</td>
        <td><span class="role-pill">${r.role}</span></td>
        <td>${fmtDateFull(r.inDate)}</td>
        <td>${fmtDateFull(r.outDate)}</td>
        <td>${budgetDisplay(r.totalBudget, r.region)}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);
    item.appendChild(body);

    personGroups.appendChild(item);
  });

  personEmptyState.style.display = matched.length === 0 ? 'block' : 'none';
  personResultCount.textContent = `${matched.length} of ${people.length} people with 4+ conferences` + (totalClashCount ? ` \u00b7 ${totalClashCount} with overlapping trips` : '');
}

personSearchInput.addEventListener('input', renderPersonView);

loadLiveData();
setInterval(loadLiveData, 5 * 60 * 1000);
