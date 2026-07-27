(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WorkDate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');

  function keyFromDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // 업무일은 매일 오전 03:00에 바뀐다.
  function workDate(input = new Date()) {
    const date = new Date(input);
    if (date.getHours() < 3) date.setDate(date.getDate() - 1);
    return keyFromDate(date);
  }

  // 정오를 기준으로 계산해 일광절약시간 등 시각 경계의 영향을 피한다.
  function shiftDate(key, amount) {
    const date = new Date(`${key}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return keyFromDate(date);
  }

  function dateRangeExclusive(startKey, endKey) {
    const result = [];
    let cursor = shiftDate(startKey, 1);
    let guard = 0;
    while (cursor <= endKey && guard < 20000) {
      result.push(cursor);
      cursor = shiftDate(cursor, 1);
      guard += 1;
    }
    return result;
  }

  return { workDate, shiftDate, dateRangeExclusive, keyFromDate };
});
