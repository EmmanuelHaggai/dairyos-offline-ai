const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([expo, { ignores: ['.tools/**', '.private/**', 'models/**', 'qvac/**', 'dist/**', 'ios/**', 'android/**'] }]);
