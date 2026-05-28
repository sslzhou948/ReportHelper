const DEFAULT_RECHECK_TODOS = [
  '\u9884\u7ea6\u6302\u53f7',
  '\u51c6\u5907\u8eab\u4efd\u8bc1\u548c\u75c5\u5386\u672c',
  '\u590d\u67e5\u524d\u4e00\u65e5\u6e05\u6de1\u996e\u98df',
  '\u590d\u67e5\u5f53\u5929\u7a7a\u8179',
  '\u63d0\u524d 2 \u5c0f\u65f6\u51fa\u53d1'
];

function todayString(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDefaultTodos() {
  return DEFAULT_RECHECK_TODOS.map((text, index) => ({
    id: `todo_new_${index + 1}`,
    text,
    isDone: true,
    isTemplate: true,
    sortOrder: index + 1
  }));
}

function defaultRecheckDate(now = new Date(), days = 30) {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + days);
  return todayString(date);
}

function validateRecheckPlan(plan, now = new Date()) {
  const errors = {};
  if (!plan.type) errors.type = '\u8bf7\u586b\u5199\u68c0\u67e5\u7c7b\u578b';
  if (!plan.date) errors.date = '\u8bf7\u9009\u62e9\u590d\u67e5\u65e5\u671f';
  if (!plan.hospital) errors.hospital = '\u8bf7\u586b\u5199\u533b\u9662';

  if (plan.date && plan.date < todayString(now)) {
    errors.date = '\u590d\u67e5\u65e5\u671f\u4e0d\u80fd\u65e9\u4e8e\u4eca\u5929';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = {
  DEFAULT_RECHECK_TODOS,
  buildDefaultTodos,
  defaultRecheckDate,
  todayString,
  validateRecheckPlan
};
