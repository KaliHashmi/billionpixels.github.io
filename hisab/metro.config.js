// Default Expo configuration, plus .bin files as assets: the offline PDF reader and text-recognition
// engine copied to assets/ocr/ by scripts/vendor-ocr.mjs.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('bin');

module.exports = config;
