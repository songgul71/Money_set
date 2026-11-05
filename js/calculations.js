/* Pure rules ported from src/domain/{money,month,calculations,plan-draft}.ts. */
"use strict";
globalThis.MoneyCalc = (() => {
  const MAX_INPUT_AMOUNT = 999999999999n;
  const INT64_MIN = -(2n ** 63n), INT64_MAX = 2n ** 63n - 1n;
  const categories = Object.freeze([
    "대출이자/할부", "교통/이동", "구독/멤버십", "생활용품", "선물/경조사", "식비",
    "의료/건강", "주거/공과금", "취미/여가", "혼합", "기타",
  ].map((name, index) => Object.freeze({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name })));
  function assertInt64(value) {
    if (value < INT64_MIN || value > INT64_MAX) throw new RangeError("금액 합계가 64비트 정수 범위를 벗어났습니다.");
    return value;
  }
  function parseAmount(value) {
    if (typeof value !== "string" || !/^\d{1,12}$/.test(value) || BigInt(value) < 1n || BigInt(value) > MAX_INPUT_AMOUNT)
      throw new Error("금액은 1원부터 999,999,999,999원까지 정수로 입력해 주세요.");
    return BigInt(value);
  }
  const sum = values => assertInt64(values.reduce((a, b) => a + b, 0n));
  const format = value => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number), date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  const validMonth = value => typeof value === "string" && /^\d{4}-\d{2}-01$/.test(value) && validDate(value);
  const queryMonth = value => typeof value === "string" && validMonth(`${value}-01`) ? `${value}-01` : null;
  function currentMonth(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).formatToParts(now);
    return `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}-01`;
  }
  function moveMonth(month, delta) {
    if (!validMonth(month)) throw new Error("계획 월을 확인해 주세요.");
    const [y, m] = month.split("-").map(Number), date = new Date(Date.UTC(y, m - 1 + delta, 1));
    const result = `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return validMonth(result) ? result : null;
  }
  const monthLabel = month => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;
  const incomeDate = income => income.status === "deposited" ? income.depositedDate : income.expectedDate;
  const inMonth = (date, month) => validDate(date) && date.slice(0, 7) === month.slice(0, 7);
  function incomeSummary(incomes, month) {
    const active = incomes.filter(i => i.deletedAt === null && i.status !== "canceled" && inMonth(incomeDate(i), month));
    const baseIncludedIncome = sum(active.filter(i => i.incomeType === "regular" || i.status === "deposited").map(i => parseAmount(i.amount)));
    const selectedScheduledIncome = sum(active.filter(i => i.incomeType === "irregular" && i.status === "scheduled" && i.includeInCalculation).map(i => parseAmount(i.amount)));
    return { baseIncludedIncome, selectedScheduledIncome, calculationBasisIncome: sum([baseIncludedIncome, selectedScheduledIncome]) };
  }
  function planTotals(plans, month) {
    const active = plans.filter(p => p.deletedAt === null && p.status === "scheduled" && p.planMonth === month);
    const totals = Object.fromEntries(["essential", "optional", "hold"].map(j => [j, sum(active.filter(p => p.judgment === j).map(p => parseAmount(p.plannedAmount)))]));
    return { ...totals, total: sum(Object.values(totals)) };
  }
  function balances(income, totals) {
    const afterEssential = assertInt64(income - totals.essential);
    const afterEssentialAndOptional = assertInt64(afterEssential - totals.optional);
    return { afterEssential, afterEssentialAndOptional, afterAllPlans: assertInt64(afterEssentialAndOptional - totals.hold) };
  }
  function preview(data, month, judgment, amount, editingId = null) {
    const totals = planTotals(data.plans.filter(p => p.id !== editingId), month);
    if (judgment) totals[judgment] = assertInt64(totals[judgment] + amount);
    totals.total = sum([totals.essential, totals.optional, totals.hold]);
    return balances(incomeSummary(data.incomes, month).calculationBasisIncome, totals);
  }
  return Object.freeze({ MAX_INPUT_AMOUNT, INT64_MIN, INT64_MAX, categories, assertInt64, parseAmount, sum, format,
    validDate, validMonth, queryMonth, currentMonth, moveMonth, monthLabel, incomeDate, inMonth, incomeSummary, planTotals, balances, preview });
})();
