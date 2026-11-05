/* DOM templates contain only trusted static markup. All record text uses textContent/value. */
"use strict";
(() => {
  const C = globalThis.MoneyCalc, S = globalThis.MoneyStorage, store = S.create();
  const root = document.getElementById("content"), notice = document.getElementById("notice");
  const labels = { essential: "필수", optional: "선택", hold: "보류" };
  let data = null, blocked = false, storageMessage = "", route, noticeTimer, undo = null;
  const $ = selector => root.querySelector(selector);
  function el(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
  function link(text, href, className = "text-button") { const n = el("a", className, text); n.href = href; return n; }
  function button(text, action, className = "text-button") { const n = el("button", className, text); n.type = "button"; n.addEventListener("click", action); return n; }
  function href(path, month = route.month, params = {}) { return `#${path}?${new URLSearchParams({ month: month.slice(0, 7), ...params })}`; }
  function appendTemplate(id) { root.append(document.getElementById(id).content.cloneNode(true)); }
  function showError(message, target = $("#form-error")) {
    if (!target) { toast(message); return; } target.textContent = message; target.hidden = false; target.tabIndex = -1; target.focus();
  }
  function clearNotice() { clearTimeout(noticeTimer); notice.hidden = true; notice.replaceChildren(); undo = null; }
  function toast(message, undoAction = null) {
    clearNotice(); notice.append(el("span", "", message)); notice.hidden = false;
    if (undoAction) notice.append(button("되돌리기", undoAction));
    notice.append(button("닫기", clearNotice));
    noticeTimer = setTimeout(clearNotice, undoAction ? 20000 : 7000);
  }
  function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, n => n.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  function read() {
    const result = store.load(); blocked = !result.ok;
    if (result.ok) { data = result.data; storageMessage = ""; } else { data = null; storageMessage = result.message; }
  }
  function commit(change) {
    if (blocked || !data) throw new Error("저장 데이터를 다시 불러온 뒤 시도해 주세요.");
    const next = structuredClone(data); change(next); store.save(next); data = next;
  }
  function parseRoute() {
    const [path, query = ""] = location.hash.slice(1).split("?");
    const params = new URLSearchParams(query), months = params.getAll("month");
    const month = months.length === 1 ? C.queryMonth(months[0]) : null;
    const validPath = ["/home", "/incomes", "/plans/new", "/plans/edit"].includes(path);
    const result = { path: validPath ? path : "/home", month: month || C.currentMonth(), id: params.get("id"), deposit: params.get("deposit") === "1" };
    if (!validPath || !month) {
      history.replaceState(null, "", href(result.path, result.month, result.id && validPath ? { id: result.id } : {}));
    }
    return result;
  }
  function fillBalances(values) { root.querySelectorAll("[data-balance]").forEach(n => { n.textContent = C.format(values[n.dataset.balance]); }); }
  function home() {
    appendTemplate("home-template"); const month = route.month;
    const summary = C.incomeSummary(data.incomes, month), totals = C.planTotals(data.plans, month);
    const dateNode = $(".month-label"); dateNode.textContent = C.monthLabel(month); dateNode.dateTime = month.slice(0, 7);
    root.querySelectorAll("[data-month]").forEach(a => {
      const next = C.moveMonth(month, Number(a.dataset.month));
      if (next) { a.href = href("/home", next); a.setAttribute("aria-label", `${C.monthLabel(next)} 보기`); }
      else { a.setAttribute("aria-disabled", "true"); a.removeAttribute("href"); }
    });
    $("#income-amount").textContent = C.format(summary.calculationBasisIncome);
    $("#income-link").href = href("/incomes"); $("#new-plan").href = href("/plans/new");
    const incomes = data.incomes.filter(i => i.status !== "canceled" && i.deletedAt === null && C.inMonth(C.incomeDate(i), month));
    if (incomes.length) $("#income-description").textContent = `기본 포함 ${C.format(summary.baseIncludedIncome)}${summary.selectedScheduledIncome ? ` · 선택 포함 예정 ${C.format(summary.selectedScheduledIncome)}` : ""}`;
    fillBalances(C.balances(summary.calculationBasisIncome, totals));
    const plans = data.plans.filter(p => p.planMonth === month && p.deletedAt === null);
    const scheduled = plans.filter(p => p.status === "scheduled");
    $("#empty-plans").hidden = scheduled.length > 0;
    for (const judgment of Object.keys(labels)) {
      const group = scheduled.filter(p => p.judgment === judgment); if (!group.length) continue;
      const section = el("section", "card plan-group"), heading = el("h2", "group-title");
      heading.append(el("span", `badge ${judgment}`, labels[judgment]), el("span", "small", C.format(totals[judgment])));
      section.append(heading); group.forEach(p => section.append(planItem(p))); $("#plan-groups").append(section);
    }
    const canceled = plans.filter(p => p.status === "canceled"), toggle = $("#canceled-toggle"), list = $("#canceled-plans");
    toggle.firstElementChild.textContent = `취소 항목 ${canceled.length}건 보기`;
    toggle.addEventListener("click", () => { list.hidden = !list.hidden; toggle.setAttribute("aria-expanded", String(!list.hidden)); });
    if (!canceled.length) list.append(el("p", "small muted list-item", "취소한 계획이 없어요."));
    canceled.forEach(p => list.append(planItem(p)));
  }
  function planItem(p) {
    const item = el("article", "list-item"), row = el("div", "row start");
    row.append(el("h3", "item-title", p.title), el("p", "item-amount", C.format(C.parseAmount(p.plannedAmount)))); item.append(row);
    const category = C.categories.find(c => c.id === p.categoryId);
    if (p.expectedDate || category) item.append(el("p", "small muted item-meta", [p.expectedDate, category?.name].filter(Boolean).join(" · ")));
    if (p.note) item.append(el("p", "small muted item-note", p.note));
    const actions = el("div", "actions");
    if (p.status === "scheduled") actions.append(link("수정", href("/plans/edit", p.planMonth, { id: p.id })), button("취소", () => changePlan(p.id, true)));
    else actions.append(button("복구", () => changePlan(p.id, false)));
    item.append(actions); return item;
  }
  function changePlan(id, cancel) {
    try { commit(d => { const p = d.plans.find(p => p.id === id); if (!p) throw new Error("계획을 찾을 수 없어요."); p.status = cancel ? "canceled" : "scheduled"; p.canceledAt = cancel ? new Date().toISOString() : null; p.updatedAt = new Date().toISOString(); }); render(false); toast(cancel ? "계획을 취소했어요." : "계획을 복구했어요."); }
    catch (e) { toast(e.message); }
  }
  function fieldError(name, message) {
    const n = $(`#${name}-error`); if (n) { n.textContent = message; n.hidden = false; }
    const field = $(`[name="${name}"]`); if (field) { field.setAttribute("aria-invalid", "true"); field.setAttribute("aria-describedby", `${name}-error`); }
  }
  function clearErrors(form) {
    form.querySelectorAll(".field-error,.error-panel").forEach(n => { n.hidden = true; });
    form.querySelectorAll("[aria-invalid]").forEach(n => { n.removeAttribute("aria-invalid"); n.removeAttribute("aria-describedby"); });
  }
  function focusFirstError(form) {
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) { if (first.closest("#optional-fields")) openDetails(true); first.focus(); return true; } return false;
  }
  function amountInput(input, callback = () => {}) {
    input.addEventListener("input", () => {
      // Keep invalid signs/decimals visible so validation can reject, rather than silently changing their value.
      const plain = input.value.replaceAll(",", "");
      if (/^\d{1,12}$/.test(plain)) input.value = new Intl.NumberFormat("ko-KR").format(BigInt(plain));
      callback();
    });
  }
  function openDetails(open) { $("#optional-fields").hidden = !open; $("#details-toggle").setAttribute("aria-expanded", String(open)); $("#details-arrow").textContent = open ? "⌃" : "⌄"; }
  function invalidItem(message) {
    root.append(el("h1", "page-header", "항목을 열 수 없어요"), el("p", "error-panel", message), link("지출계획으로", href("/home"), "ui-button"));
  }
  function planForm() {
    const editing = route.path === "/plans/edit", p = editing ? data.plans.find(p => p.id === route.id && p.planMonth === route.month && p.status === "scheduled" && p.deletedAt === null) : null;
    if (editing && !p) { invalidItem("계획이 없거나 편집할 수 없는 상태예요."); return; }
    appendTemplate("plan-template"); root.classList.add("form-shell");
    $("#form-month").textContent = `${C.monthLabel(route.month)} 계획`; $("#preview-month").textContent = C.monthLabel(route.month);
    if (editing) $("#form-heading").textContent = "계획 수정";
    $("#form-cancel").href = href("/home");
    C.categories.forEach(c => { const option = el("option", "", c.name); option.value = c.id; $("#categoryId").append(option); });
    $("#expectedDate").min = route.month;
    const next = C.moveMonth(route.month, 1); $("#expectedDate").max = next ? new Date(Date.parse(`${next}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : "9999-12-31";
    if (p) {
      $("#title").value = p.title; $("#amount").value = new Intl.NumberFormat("ko-KR").format(C.parseAmount(p.plannedAmount));
      $(`[name="judgment"][value="${p.judgment}"]`).checked = true;
      $("#expectedDate").value = p.expectedDate || ""; $("#categoryId").value = p.categoryId || ""; $("#note").value = p.note;
      if (p.expectedDate || p.categoryId || p.note) openDetails(true);
    }
    $("#details-toggle").addEventListener("click", () => openDetails($("#optional-fields").hidden));
    const form = $("#plan-form"), id = p?.id || uuid(), createdAt = p?.createdAt || new Date().toISOString(); let submitted = false;
    const updatePreview = () => {
      let amount = 0n; try { amount = C.parseAmount($("#amount").value.replaceAll(",", "")); } catch { /* Invalid draft does not affect saved totals. */ }
      try { fillBalances(C.preview(data, route.month, form.elements.judgment.value || null, amount, p?.id)); $("#preview-error").hidden = true; }
      catch (e) { $("#preview-error").textContent = e.message; $("#preview-error").hidden = false; }
    };
    amountInput($("#amount"), updatePreview); form.addEventListener("change", updatePreview); updatePreview();
    form.addEventListener("submit", event => {
      event.preventDefault(); if (submitted) return; clearErrors(form);
      const value = name => form.elements[name].value;
      const candidate = { id, title: value("title").trim(), plannedAmount: value("amount").replaceAll(",", ""), judgment: value("judgment"), planMonth: route.month,
        expectedDate: value("expectedDate") || null, categoryId: value("categoryId") || null, note: value("note"), status: "scheduled", canceledAt: null,
        createdAt, updatedAt: new Date().toISOString(), deletedAt: null };
      if (!candidate.title || candidate.title.length > 80) fieldError("title", "지출명을 1~80자로 입력해 주세요.");
      try { C.parseAmount(candidate.plannedAmount); } catch (e) { fieldError("amount", e.message); }
      if (!labels[candidate.judgment]) fieldError("judgment", "지출 판단을 선택해 주세요.");
      if (candidate.expectedDate && !C.inMonth(candidate.expectedDate, route.month)) fieldError("expectedDate", "지출예상일은 선택한 월 안에서 입력해 주세요.");
      if (candidate.note.length > 500) fieldError("note", "메모는 500자까지 입력할 수 있어요.");
      if (focusFirstError(form)) return;
      submitted = true; form.querySelector('[type="submit"]').disabled = true;
      try {
        S.validatePlan(candidate); commit(d => { const index = d.plans.findIndex(x => x.id === id); if (index < 0) d.plans.push(candidate); else d.plans[index] = candidate; });
        location.hash = href("/home"); toast(editing ? "계획을 수정했어요." : "계획을 저장했어요.");
      } catch (e) { submitted = false; form.querySelector('[type="submit"]').disabled = false; showError(e.message); }
    });
  }
  function incomes() {
    const p = route.id ? data.incomes.find(i => i.id === route.id && i.status !== "canceled" && i.deletedAt === null && C.inMonth(C.incomeDate(i), route.month)) : null;
    if (route.id && !p) { invalidItem("수입이 없거나 편집할 수 없는 상태예요."); return; }
    appendTemplate("income-template");
    $("#form-month").textContent = C.monthLabel(route.month); $("#home-link").href = href("/home");
    const summary = C.incomeSummary(data.incomes, route.month);
    $("#income-amount").textContent = C.format(summary.calculationBasisIncome);
    $("#income-breakdown").textContent = `기본 포함 ${C.format(summary.baseIncludedIncome)} · 선택 포함 예정 ${C.format(summary.selectedScheduledIncome)}`;
    const current = data.incomes.filter(i => i.status !== "canceled" && i.deletedAt === null && C.inMonth(C.incomeDate(i), route.month));
    if (!current.length) $("#income-list").append(el("p", "small muted card", "아직 등록한 수입이 없어요."));
    current.forEach(i => {
      const item = el("article", "card"), row = el("div", "row start"); row.append(el("h2", "body-heading item-title", i.name), el("p", "item-amount", C.format(C.parseAmount(i.amount)))); item.append(row);
      item.append(el("p", "small muted item-meta", `${i.incomeType === "regular" ? "정기수입" : "비정기 수입"} · ${i.status === "scheduled" ? "입금 예정" : "입금 완료"} · ${C.incomeDate(i)}`));
      if (i.note) item.append(el("p", "small muted item-note", i.note));
      const actions = el("div", "actions"); actions.append(link("수정", href("/incomes", route.month, { id: i.id })));
      if (i.status === "scheduled") actions.append(link("입금 완료", href("/incomes", route.month, { id: i.id, deposit: "1" })));
      actions.append(button("취소", () => cancelIncome(i.id))); item.append(actions);
      if (i.incomeType === "irregular" && i.status === "scheduled") {
        const label = el("label", "check-label small"), check = el("input"); check.type = "checkbox"; check.checked = i.includeInCalculation;
        label.append(check, document.createTextNode("계산에 포함")); check.addEventListener("change", () => {
          try { commit(d => { const target = d.incomes.find(x => x.id === i.id); target.includeInCalculation = check.checked; target.updatedAt = new Date().toISOString(); }); render(false); }
          catch (e) { check.checked = i.includeInCalculation; toast(e.message); }
        }); item.append(label);
      }
      $("#income-list").append(item);
    });
    const form = $("#income-form"), id = p?.id || uuid(), createdAt = p?.createdAt || new Date().toISOString(); let submitted = false;
    $("#expectedDate").value = p?.expectedDate || route.month;
    if (p) {
      $("#income-form-title").textContent = "수입 수정";
      for (const name of ["name", "incomeType", "status", "note"]) form.elements[name].value = p[name];
      $("#amount").value = new Intl.NumberFormat("ko-KR").format(C.parseAmount(p.amount)); $("#depositedDate").value = p.depositedDate || p.expectedDate || route.month;
      $("#includeInCalculation").checked = p.includeInCalculation;
      $("#income-cancel").hidden = false; $("#income-cancel").href = href("/incomes");
    }
    if (route.deposit && p) $("#status").value = "deposited";
    const syncFields = () => {
      const deposited = $("#status").value === "deposited", selectable = !deposited && $("#incomeType").value === "irregular";
      $("#deposit-field").hidden = !deposited; $("#include-field").hidden = !selectable; $("#expected-required").hidden = deposited;
      $("#depositedDate").required = deposited; $("#expectedDate").required = !deposited;
      if (!selectable) $("#includeInCalculation").checked = false;
      if (deposited && !$("#depositedDate").value) $("#depositedDate").value = $("#expectedDate").value || route.month;
    };
    $("#status").addEventListener("change", syncFields); $("#incomeType").addEventListener("change", syncFields); syncFields(); amountInput($("#amount"));
    form.addEventListener("submit", event => {
      event.preventDefault(); if (submitted) return; clearErrors(form); const value = name => form.elements[name].value;
      const deposited = value("status") === "deposited";
      const candidate = { id, name: value("name").trim(), amount: value("amount").replaceAll(",", ""), incomeType: value("incomeType"), status: value("status"),
        expectedDate: value("expectedDate") || null, depositedDate: deposited ? value("depositedDate") || null : null,
        includeInCalculation: !deposited && value("incomeType") === "irregular" && $("#includeInCalculation").checked,
        note: value("note"), createdAt, updatedAt: new Date().toISOString(), deletedAt: null };
      if (!candidate.name || candidate.name.length > 50) fieldError("name", "수입명을 1~50자로 입력해 주세요.");
      try { C.parseAmount(candidate.amount); } catch (e) { fieldError("amount", e.message); }
      if ((!deposited || candidate.expectedDate) && !C.validDate(candidate.expectedDate)) fieldError("expectedDate", "올바른 예정일을 입력해 주세요.");
      if (deposited && !C.validDate(candidate.depositedDate)) fieldError("depositedDate", "올바른 입금일을 입력해 주세요.");
      if (candidate.note.length > 500) fieldError("note", "메모는 500자까지 입력할 수 있어요.");
      if (focusFirstError(form)) return; submitted = true; form.querySelector('[type="submit"]').disabled = true;
      try {
        S.validateIncome(candidate); commit(d => { const index = d.incomes.findIndex(x => x.id === id); if (index < 0) d.incomes.push(candidate); else d.incomes[index] = candidate; });
        const month = `${C.incomeDate(candidate).slice(0, 7)}-01`, dest = href("/incomes", month);
        if (location.hash === dest) render(false); else location.hash = dest;
        toast(p ? "수입을 수정했어요." : "수입을 저장했어요.");
      } catch (e) { submitted = false; form.querySelector('[type="submit"]').disabled = false; showError(e.message); }
    });
  }
  function cancelIncome(id) {
    const original = structuredClone(data.incomes.find(i => i.id === id));
    try {
      commit(d => { const i = d.incomes.find(i => i.id === id); i.status = "canceled"; i.includeInCalculation = false; i.updatedAt = new Date().toISOString(); });
      if (route.id === id) { history.replaceState(null, "", href("/incomes")); route.id = null; }
      render(false);
      toast("수입을 취소했어요. 잠시 동안 되돌릴 수 있어요.", () => {
        if (!undo) return;
        try { commit(d => { const index = d.incomes.findIndex(i => i.id === id); d.incomes[index] = { ...original, updatedAt: new Date().toISOString() }; }); clearNotice(); render(false); toast("수입 취소를 되돌렸어요."); }
        catch (e) { notice.firstElementChild.textContent = e.message; }
      });
      undo = original;
    } catch (e) { toast(e.message); }
  }
  function download(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function backup(recovery = false) {
    appendTemplate("backup-template"); if (recovery) $(".backup").open = true;
    const message = text => { $("#backup-message").textContent = text; };
    $('[data-action="export"]').addEventListener("click", () => {
      try { const raw = recovery ? store.raw() : JSON.stringify(S.validate(data), null, 2); if (raw === null) throw new Error("내보낼 저장 데이터가 없어요."); download(raw, recovery ? "money-set-original.json" : "money-set-backup.json"); message(recovery ? "원문 백업 파일을 만들었어요." : "백업 파일을 만들었어요."); } catch (e) { message(e.message); }
    });
    $('[data-action="import"]').addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", async event => {
      const input = event.target, file = input.files[0]; if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("5MB 이하의 JSON 파일을 선택해 주세요.");
        const replacement = S.parse(await file.text());
        if (!confirm(`수입 ${replacement.incomes.length}건, 계획 ${replacement.plans.length}건으로 모든 월의 앱 데이터를 교체할까요? 기존 내용을 보관하려면 먼저 내보내 주세요.`)) { message("불러오기를 취소했어요. 기존 데이터는 유지했어요."); return; }
        store.save(replacement, true); data = replacement; blocked = false; clearNotice(); render(false); toast("백업 데이터를 불러왔어요.");
      } catch (e) { message(`불러오지 못했어요. ${e.message}`); } finally { input.value = ""; }
    });
    $('[data-action="reset"]').addEventListener("click", () => {
      if (!confirm("모든 월의 수입과 계획을 초기화할까요? 되돌릴 수 없어요. 필요한 내용은 먼저 내보내 주세요.")) return;
      try { store.reset(); data = S.empty(); blocked = false; clearNotice(); render(false); toast("앱 데이터를 초기화했어요."); } catch (e) { message(e.message); }
    });
  }
  function render(focus = true) {
    route = parseRoute(); root.replaceChildren(); root.className = "shell";
    if (blocked || !data) {
      root.classList.add("recovery"); root.append(el("h1", "", "저장 데이터를 확인해 주세요"), el("p", "error-panel", storageMessage || "다른 탭에서 데이터가 변경됐어요. 입력 내용을 확인한 뒤 다시 불러와 주세요."));
      root.append(button("다시 불러오기", () => { read(); render(); }, "secondary-button")); backup(true);
    } else {
      if (route.path === "/home") home(); else if (route.path === "/incomes") incomes(); else planForm();
      if (route.path === "/home") backup();
    }
    document.title = `${root.querySelector("h1")?.textContent || "지출계획"} · 지출계획`;
    if (focus) { root.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", () => { render(); });
  // Basic change detection only; deliberately no concurrent edit merge/locking system.
  window.addEventListener("storage", event => {
    if (event.key !== S.KEY && event.key !== null) return; blocked = true;
    storageMessage = "다른 탭에서 데이터가 변경됐어요. 입력 내용은 복사해 두고 다시 불러와 주세요.";
    root.querySelectorAll('button[type="submit"]').forEach(b => { b.disabled = true; });
    let warning = $("#external-change"); if (!warning) { warning = el("section", "error-panel"); warning.id = "external-change"; root.prepend(warning); }
    warning.replaceChildren(el("p", "", storageMessage), button("다시 불러오기", () => { read(); render(); }, "secondary-button"));
  });
  document.querySelector(".skip-link").addEventListener("click", event => { event.preventDefault(); root.focus(); window.scrollTo(0, 0); });
  read(); render(false);
})();
