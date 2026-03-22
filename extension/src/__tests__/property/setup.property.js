// Feature: auto-job-application-helper, Property setup smoke test
const fc = require('fast-check');
test('fast-check is operational in extension test suite', () => {
  fc.assert(fc.property(fc.integer(), (n) => typeof n === 'number'));
});
