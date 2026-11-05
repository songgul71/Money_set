"use strict";
globalThis.MoneyStorage = (() => {
  const C = globalThis.MoneyCalc, KEY = "money_set:demo:data", VERSION = 1;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const error = message => { throw new Error(message); };
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  function keys(x, allowed, label) {
    if (!object(x) || Object.keys(x).some(k => !allowed.includes(k)) || allowed.some(k => !Object.hasOwn(x, k))) error(`${label} 데이터 구조를 확인해 주세요.`);
  }
  function text(x, min, max, label) {
    if (typeof x !== "string" || x.length > max || x.trim().length < min) error(`${label}은 ${min}~${max}자로 입력해 주세요.`);
  }
  function date(x, required, label) { if (x === null && !required) return; if (!C.validDate(x)) error(`${label} 날짜를 확인해 주세요.`); }
  function timestamp(x) {
    if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) || Number.isNaN(Date.parse(x)) || new Date(x).toISOString() !== x) error("기록 시각을 확인해 주세요.");
  }
  function common(x) {
    if (typeof x.id !== "string" || !uuid.test(x.id)) error("항목 ID를 확인해 주세요.");
    timestamp(x.createdAt); timestamp(x.updatedAt);
    if (x.deletedAt !== null) timestamp(x.deletedAt);
    text(x.note, 0, 500, "메모");
  }
  function validateIncome(i) {
    keys(i, ["id", "name", "amount", "incomeType", "status", "expectedDate", "depositedDate", "includeInCalculation", "note", "createdAt", "updatedAt", "deletedAt"], "수입");
    common(i); text(i.name, 1, 50, "수입명"); C.parseAmount(i.amount);
    if (!["regular", "irregular"].includes(i.incomeType) || !["scheduled", "deposited", "canceled"].includes(i.status)) error("수입 종류 또는 상태를 확인해 주세요.");
    date(i.expectedDate, i.status === "scheduled", "예정일"); date(i.depositedDate, i.status === "deposited", "입금일");
    if (typeof i.includeInCalculation !== "boolean" || (i.includeInCalculation && !(i.incomeType === "irregular" && i.status === "scheduled"))) error("계산 포함은 비정기 예정 수입에만 적용할 수 있어요.");
    if (i.status === "canceled" && i.expectedDate === null && i.depositedDate === null) error("취소 수입의 날짜가 없어요.");
    return i;
  }
  function validatePlan(p) {
    keys(p, ["id", "title", "plannedAmount", "judgment", "planMonth", "expectedDate", "categoryId", "note", "status", "canceledAt", "createdAt", "updatedAt", "deletedAt"], "계획");
    common(p); text(p.title, 1, 80, "지출명"); C.parseAmount(p.plannedAmount);
    if (!["essential", "optional", "hold"].includes(p.judgment) || !["scheduled", "canceled"].includes(p.status)) error("지출 판단 또는 계획 상태를 확인해 주세요.");
    if (!C.validMonth(p.planMonth)) error("계획 월을 확인해 주세요.");
    date(p.expectedDate, false, "지출예상일");
    if (p.expectedDate !== null && !C.inMonth(p.expectedDate, p.planMonth)) error("지출예상일은 선택한 월 안에서 입력해 주세요.");
    if (p.categoryId !== null && !C.categories.some(c => c.id === p.categoryId)) error("사용 가능한 카테고리를 선택해 주세요.");
    if (p.status === "canceled") timestamp(p.canceledAt); else if (p.canceledAt !== null) error("예정 계획의 취소 기록을 확인해 주세요.");
    return p;
  }
  const empty = () => ({ app: "money_set", schemaVersion: VERSION, incomes: [], plans: [] });
  function validate(data) {
    if (!object(data) || data.app !== "money_set") error("지출계획 백업 파일이 아니에요.");
    if (data.schemaVersion !== VERSION) error("지원하지 않는 데이터 버전이에요. 원본은 유지했어요.");
    keys(data, ["app", "schemaVersion", "incomes", "plans"], "백업");
    if (!Array.isArray(data.incomes) || !Array.isArray(data.plans)) error("항목 목록 형식을 확인해 주세요.");
    const ids = new Set();
    data.incomes.forEach(validateIncome); data.plans.forEach(validatePlan);
    [...data.incomes, ...data.plans].forEach(item => { if (ids.has(item.id)) error("중복된 항목 ID가 있어요."); ids.add(item.id); });
    const months = new Set(data.plans.map(p => p.planMonth));
    data.incomes.forEach(i => { const d = C.incomeDate(i); if (d) months.add(`${d.slice(0, 7)}-01`); });
    months.forEach(month => C.balances(C.incomeSummary(data.incomes, month).calculationBasisIncome, C.planTotals(data.plans, month)));
    return data;
  }
  function parse(raw) { return validate(JSON.parse(raw)); }
  // The optional backend is solely for deterministic tests; the app uses the browser backend.
  function create(backend = () => globalThis.localStorage) {
    let loaded = false, blocked = true;
    function load() {
      try {
        const raw = backend().getItem(KEY), data = raw === null ? empty() : parse(raw);
        loaded = true; blocked = false; return { ok: true, data };
      } catch (e) { loaded = true; blocked = true; return { ok: false, message: `저장 데이터를 읽을 수 없어요. ${e.message} 자동으로 삭제하거나 덮어쓰지 않았어요.` }; }
    }
    function save(data, replacement = false) {
      if (!loaded || (blocked && !replacement)) error("저장 데이터를 먼저 확인해 주세요.");
      const raw = JSON.stringify(validate(data));
      try { backend().setItem(KEY, raw); blocked = false; }
      catch { error("저장하지 못했어요. 기존 데이터와 입력은 유지했어요. 저장 공간과 브라우저 설정을 확인한 후 다시 시도해 주세요."); }
    }
    function reset() {
      if (!loaded) error("저장 데이터를 먼저 확인해 주세요.");
      try { backend().removeItem(KEY); blocked = false; } catch { error("초기화하지 못했어요. 기존 데이터는 유지했어요."); }
    }
    function raw() { return backend().getItem(KEY); }
    return { load, save, reset, raw };
  }
  return Object.freeze({ KEY, VERSION, empty, validate, validateIncome, validatePlan, parse, create });
})();
