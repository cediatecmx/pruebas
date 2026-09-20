const config = require('../config');
const db = require('../data/db');

const defaults = () => ({
  globalMarkupPercent: config.defaultMarkupPercent,
  markupBySource: { syscom: null, ctonline: null, tvc: null },
  // Margen para distribuidores aprobados y logueados. Si es null, usa el
  // mismo margen público (globalMarkupPercent).
  distributorMarkupPercent: null,
  roundToNine: true,
});

async function loadSettings() {
  const { rows } = await db.query('SELECT value FROM app_settings WHERE key=$1', ['pricing']);
  if (!rows[0]) {
    const value = defaults();
    await db.query('INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', ['pricing', value]);
    return value;
  }
  return rows[0].value;
}

async function saveSettings(newSettings) {
  await db.query(`INSERT INTO app_settings(key,value) VALUES($1,$2)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`, ['pricing', newSettings]);
  return newSettings;
}

async function applyMarkup(cost, source, isDistributor = false) {
  const settings = await loadSettings();
  const percent = isDistributor
    ? settings.distributorMarkupPercent ?? settings.globalMarkupPercent
    : settings.markupBySource[source] ?? settings.globalMarkupPercent;
  let price = cost * (1 + percent / 100);
  if (settings.roundToNine) price = Math.floor(price) + 0.9;
  return Math.round(price * 100) / 100;
}

module.exports = { loadSettings, saveSettings, applyMarkup };
