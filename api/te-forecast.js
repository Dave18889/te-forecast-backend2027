const { fetchAll, REGION_TABS } = require('../lib/sheets');
const { parseRegionTab, buildRecords, parseCostSummary, parseClashes, parsePegRates } = require('../lib/parse');

module.exports = async (req, res) => {
  try {
    const data = await fetchAll();

    const parsedRegions = REGION_TABS.map((tab) => parseRegionTab(tab, data.regions[tab]));
    const records = buildRecords(parsedRegions);
    const costSummary = parseCostSummary(data.summary);
    const clashes = parseClashes(data.clashes);
    const pegRates = parsePegRates(data.pegRates);

    res.status(200).json({
      records,
      costSummary,
      clashes,
      pegRates,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
