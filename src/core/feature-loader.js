const fs = require('fs');
const path = require('path');

const FEATURES_DIR = path.join(__dirname, '..', 'features');

function loadFeatures(db) {
  const features = new Map();
  if (!fs.existsSync(FEATURES_DIR)) return features;

  const entries = fs.readdirSync(FEATURES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(FEATURES_DIR, entry.name, 'index.js');
    if (!fs.existsSync(manifestPath)) continue;

    const feature = require(manifestPath);
    feature.initSchema(db);
    features.set(feature.name, feature);
  }
  return features;
}

module.exports = { loadFeatures };
