// Feature: auto-job-application-helper, Property setup smoke test
import * as fc from 'fast-check';
test('fast-check is operational in backend test suite', () => {
  fc.assert(fc.property(fc.integer(), (n) => typeof n === 'number'));
});
