const assert = require('node:assert/strict');
const { workDate, shiftDate, dateRangeExclusive } = require('./date-utils');

assert.equal(workDate(new Date(2026, 6, 27, 2, 59, 59)), '2026-07-26');
assert.equal(workDate(new Date(2026, 6, 27, 3, 0, 0)), '2026-07-27');

assert.equal(shiftDate('2026-07-24', 1), '2026-07-25');
assert.equal(shiftDate('2026-07-24', 2), '2026-07-26');
assert.equal(shiftDate('2026-07-24', 3), '2026-07-27');
assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');

const fullYear = dateRangeExclusive('2026-01-01', '2027-01-01');
assert.equal(fullYear.length, 365);
assert.equal(fullYear[0], '2026-01-02');
assert.equal(fullYear.at(-1), '2027-01-01');

console.log('날짜 자동 전환 검사 통과: 새벽 3시, 주말, 연말, 365일');
