const assert = require('assert');
const { createSNIProxy, parseSNI } = require('../sni-proxy.js');

// Basic sanity checks
assert.strictEqual(typeof createSNIProxy, 'function', 'createSNIProxy should be a function');
assert.strictEqual(typeof parseSNI, 'function', 'parseSNI should be a function');
console.log('sni-proxy test passed');
