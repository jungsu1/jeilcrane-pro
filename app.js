const STORAGE_KEY = "jeilcrane-pro-db-v2";
const EXPENSE_CATEGORIES = ["주유", "장비수리", "소모품", "식비", "보험", "기타"];
let selectedCustomerId = null;
let selectedCalendarDate = null;
let calendarViewDate = new Date();
let selectedSettlementPeriod = "this-month";
let selectedSettlementCustomer = "all";
let currentSettlementReport = null;

function getDefaultCompanyInfo() {
  return {
    companyName: "제일크레인",
    representativeName: "",
    businessNumber: "",
    address: "",
    phone: "",
    email: ""
  };
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function createInitialState() {
  return {
    jobs: [],
    customers: [],
    expenses: [],
    companyInfo: getDefaultCompanyInfo(),
    invoiceNumberState: { date: "", sequence: 0 }
  };
}

function normalizeExpense(expense) {
  const category = EXPENSE_CATEGORIES.includes(expense?.category) ? expense.category : "기타";
  return {
    id: expense?.id || createId("expense"),
    date: expense?.date || getToday(),
    category,
    amount: Number(expense?.amount || 0),
    memo: expense?.memo || "",
    createdAt: expense?.createdAt || new Date().toISOString()
  };
}

function normalizeCustomers(customers, jobs) {
  const normalized = [];
  const seen = new Set();

  (Array.isArray(customers) ? customers : []).forEach((customer) => {
    if (!customer || !customer.name) return;
    const key = String(customer.name).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    normalized.push({
      id: customer.id || createId("customer"),
      name: customer.name,
      manager: customer.manager || "",
      memo: customer.memo || "",
      createdAt: customer.createdAt || new Date().toISOString()
    });
    seen.add(key);
  });

  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    if (!job.customerName) return;
    const key = String(job.customerName).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    normalized.push({
      id: job.customerId || createId("customer"),
      name: job.customerName,
      manager: "",
      memo: "",
      createdAt: job.createdAt || new Date().toISOString()
    });
    seen.add(key);
  });

  return normalized;
}

function normalizeState(source) {
  const base = source || {};
  const jobs = Array.isArray(base.jobs)
    ? base.jobs.map((job) => ({
        ...job,
        status: job.status || "진행중",
        receivableStatus: job.receivableStatus || "미수",
        invoiceIssued: job.invoiceIssued || "미발행",
        payoutStatus: job.payoutStatus || "미지급",
        workTime: job.workTime || ""
      }))
    : [];

  return {
    jobs,
    customers: normalizeCustomers(base.customers, jobs),
    expenses: Array.isArray(base.expenses) ? base.expenses.map(normalizeExpense) : [],
    companyInfo: {
      ...getDefaultCompanyInfo(),
      ...(base.companyInfo || {})
    },
    invoiceNumberState: {
      date: base.invoiceNumberState?.date || "",
      sequence: Number(base.invoiceNumberState?.sequence || 0)
    }
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return normalizeState(createInitialState());
    return normalizeState(JSON.parse(stored));
  } catch (error) {
    console.warn("데이터 불러오기 실패", error);
    return normalizeState(createInitialState());
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function formatAmountForList(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0원";
  if (amount >= 10000) {
    const man = amount / 10000;
    const rounded = Number.isInteger(man) ? man : Number(man.toFixed(1));
    return `${rounded.toLocaleString("ko-KR")}만원`;
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return formatDateKey(new Date());
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getInvoiceDateKey() {
  return getToday().replace(/-/g, "");
}

function setTodayDefaults() {
  const field = document.getElementById("jobDate");
  if (field) field.value = field.value || getToday();
}

function setView(viewName) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${viewName}View`);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
}

function toggleJobTypeFields() {
  const type = document.getElementById("jobType").value;
  const equipment = document.getElementById("equipmentFields");
  const dispatch = document.getElementById("dispatchFields");
  if (type === "배차 작업") {
    equipment.classList.add("hidden");
    dispatch.classList.remove("hidden");
  } else {
    equipment.classList.remove("hidden");
    dispatch.classList.add("hidden");
  }
}

function bindForm() {
  const form = document.getElementById("jobForm");
  document.getElementById("jobType").addEventListener("change", toggleJobTypeFields);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const siteName = document.getElementById("jobSite").value.trim();
    if (!siteName) {
      showToast("현장명을 입력해주세요.");
      return;
    }

    const customerSelect = document.getElementById("jobCustomer");
    const customerId = customerSelect.value;
    if (!customerId) {
      showToast("거래처를 선택해주세요.");
      return;
    }

    const selectedCustomer = state.customers.find((customer) => customer.id === customerId);
    const jobType = document.getElementById("jobType").value;
    const record = {
      id: createId("job"),
      date: document.getElementById("jobDate").value || getToday(),
      siteName,
      workContent: document.getElementById("jobWork").value.trim(),
      workTime: document.getElementById("jobWorkTime").value.trim(),
      customerName: selectedCustomer ? selectedCustomer.name : "",
      customerId: selectedCustomer ? selectedCustomer.id : "",
      jobType,
      memo: document.getElementById("jobMemo").value.trim(),
      status: "진행중",
      createdAt: new Date().toISOString()
    };

    if (jobType === "배차 작업") {
      record.providerName = document.getElementById("providerName").value.trim();
      record.payoutAmount = Number(document.getElementById("payoutAmount").value || 0);
      record.payoutStatus = document.getElementById("payoutStatus").value;
    } else {
      record.salesAmount = Number(document.getElementById("salesAmount").value || 0);
      record.receivableStatus = document.getElementById("receivableStatus").value;
      record.invoiceIssued = document.getElementById("invoiceIssued").value;
    }

    state.jobs.unshift(record);
    saveState();
    renderAll();
    form.reset();
    setTodayDefaults();
    toggleJobTypeFields();
    showToast("작업이 저장되었습니다.");
  });
}

function buildDatalists() {
  const siteValues = [...new Set(state.jobs.map((job) => job.siteName).filter(Boolean))];
  const providerValues = [...new Set(state.jobs.map((job) => job.providerName).filter(Boolean))];

  document.getElementById("siteOptions").innerHTML = siteValues.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  document.getElementById("providerOptions").innerHTML = providerValues.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function buildCustomerSelectOptions() {
  const select = document.getElementById("jobCustomer");
  if (!select) return;
  const previousValue = select.value;
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}" ${previousValue === customer.id ? "selected" : ""}>${escapeHtml(customer.name)}</option>`)
    .join("");
  select.innerHTML = `<option value="">거래처 선택</option>${options}`;
  if (!state.customers.length) {
    select.innerHTML = `<option value="">등록된 거래처 없음</option>`;
  }
  if (previousValue && state.customers.some((customer) => customer.id === previousValue)) {
    select.value = previousValue;
  }
}

function toggleCustomerQuickAdd(force) {
  const panel = document.getElementById("customerQuickAdd");
  if (!panel) return;
  const shouldShow = typeof force === "boolean" ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !shouldShow);
  if (shouldShow) {
    document.getElementById("quickCustomerName").focus();
  }
}

function bindSettingsForm() {
  const form = document.getElementById("companySettingsForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.companyInfo = {
      companyName: document.getElementById("companyName").value.trim() || getDefaultCompanyInfo().companyName,
      representativeName: document.getElementById("representativeName").value.trim(),
      businessNumber: document.getElementById("businessNumber").value.trim(),
      address: document.getElementById("companyAddress").value.trim(),
      phone: document.getElementById("companyPhone").value.trim(),
      email: document.getElementById("companyEmail").value.trim()
    };
    saveState();
    showToast("회사 정보가 저장되었습니다.");
  });
}

function populateSettingsForm() {
  const companyInfo = state.companyInfo || getDefaultCompanyInfo();
  document.getElementById("companyName").value = companyInfo.companyName || "";
  document.getElementById("representativeName").value = companyInfo.representativeName || "";
  document.getElementById("businessNumber").value = companyInfo.businessNumber || "";
  document.getElementById("companyAddress").value = companyInfo.address || "";
  document.getElementById("companyPhone").value = companyInfo.phone || "";
  document.getElementById("companyEmail").value = companyInfo.email || "";
}

function bindCustomerForms() {
  document.getElementById("newCustomerBtn").addEventListener("click", () => toggleCustomerQuickAdd(true));
  document.getElementById("cancelQuickCustomerBtn").addEventListener("click", () => toggleCustomerQuickAdd(false));
  document.getElementById("saveQuickCustomerBtn").addEventListener("click", () => {
    const nameInput = document.getElementById("quickCustomerName");
    const name = nameInput.value.trim();
    if (!name) {
      showToast("거래처명을 입력해주세요.");
      return;
    }

    const customer = {
      id: createId("customer"),
      name,
      manager: document.getElementById("quickCustomerManager").value.trim(),
      memo: document.getElementById("quickCustomerMemo").value.trim(),
      createdAt: new Date().toISOString()
    };

    state.customers.unshift(customer);
    selectedCustomerId = customer.id;
    saveState();
    renderAll();
    toggleCustomerQuickAdd(false);
    document.getElementById("quickCustomerName").value = "";
    document.getElementById("quickCustomerManager").value = "";
    document.getElementById("quickCustomerMemo").value = "";
    const jobCustomerSelect = document.getElementById("jobCustomer");
    jobCustomerSelect.value = customer.id;
    showToast("거래처가 등록되었습니다.");
  });

  document.getElementById("customerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const nameInput = document.getElementById("customerName");
    const name = nameInput.value.trim();
    if (!name) {
      showToast("거래처명을 입력해주세요.");
      return;
    }

    const customer = {
      id: createId("customer"),
      name,
      manager: document.getElementById("customerManager").value.trim(),
      memo: document.getElementById("customerMemo").value.trim(),
      createdAt: new Date().toISOString()
    };

    state.customers.unshift(customer);
    selectedCustomerId = customer.id;
    saveState();
    renderAll();
    document.getElementById("customerForm").reset();
    showToast("거래처가 등록되었습니다.");
  });
}

function getCustomerJobs(customer) {
  return state.jobs.filter((job) => {
    if (customer.id && job.customerId) {
      return job.customerId === customer.id;
    }
    return job.customerName === customer.name;
  });
}

function renderCustomersView() {
  const list = document.getElementById("customerList");
  const detail = document.getElementById("customerDetail");

  if (!state.customers.length) {
    list.innerHTML = '<p class="muted">등록된 거래처가 없습니다.</p>';
    detail.innerHTML = '<p class="muted">거래처를 먼저 등록해 주세요.</p>';
    return;
  }

  if (!selectedCustomerId || !state.customers.some((customer) => customer.id === selectedCustomerId)) {
    selectedCustomerId = state.customers[0].id;
  }

  const selectedCustomer = state.customers.find((customer) => customer.id === selectedCustomerId);
  list.innerHTML = state.customers.map((customer) => {
    const jobs = getCustomerJobs(customer);
    const outstanding = jobs
      .filter((job) => job.jobType === "내 장비 작업")
      .reduce((sum, job) => sum + (job.receivableStatus === "미수" ? Number(job.salesAmount || 0) : 0), 0);
    return `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(customer.name)}</strong>
          <p>${escapeHtml(customer.manager || "담당자 미등록")} · ${escapeHtml(customer.memo || "메모 없음")}</p>
        </div>
        <div class="value-block">
          <span class="pill">${jobs.length}건</span>
          <p>${escapeHtml(formatCurrency(outstanding))}</p>
          <button class="tiny-btn" data-action="show-customer" data-id="${escapeHtml(customer.id)}">상세</button>
        </div>
      </article>
    `;
  }).join("");

  const customerJobs = getCustomerJobs(selectedCustomer);
  const recentJobs = customerJobs.slice(0, 5);
  const totalSales = customerJobs
    .filter((job) => job.jobType === "내 장비 작업")
    .reduce((sum, job) => sum + Number(job.salesAmount || 0), 0);
  const outstanding = customerJobs
    .filter((job) => job.jobType === "내 장비 작업")
    .reduce((sum, job) => sum + (job.receivableStatus === "미수" ? Number(job.salesAmount || 0) : 0), 0);

  detail.innerHTML = `
    <div class="customer-summary">
      <div class="metric-card">
        <h4>총 작업건수</h4>
        <strong>${customerJobs.length}건</strong>
      </div>
      <div class="metric-card">
        <h4>총 매출</h4>
        <strong>${formatCurrency(totalSales)}</strong>
      </div>
      <div class="metric-card">
        <h4>미수금</h4>
        <strong>${formatCurrency(outstanding)}</strong>
      </div>
    </div>
    <div class="stack-list">
      ${recentJobs.length ? recentJobs.map((job) => `
        <article class="list-item">
          <div>
            <strong>${escapeHtml(job.siteName)}</strong>
            <p>${escapeHtml(job.date)} · ${escapeHtml(job.workContent || "작업내용 없음")}</p>
          </div>
          <div class="value-block">
            <span class="pill">${escapeHtml(job.jobType)}</span>
            <p>${escapeHtml(formatCurrency(job.salesAmount || 0))}</p>
          </div>
        </article>
      `).join("") : '<p class="muted">최근 작업 내역이 없습니다.</p>'}
    </div>
  `;
}

function getSettlementRange(periodName) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const createMonthKey = (year, monthIndex) => {
    const month = String(monthIndex + 1).padStart(2, "0");
    return `${year}-${month}`;
  };

  const getMonthRangeKeys = (year, monthIndex) => {
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    return {
      startKey: formatDateKey(start),
      endKey: formatDateKey(end)
    };
  };

  const monthKey = createMonthKey(currentYear, currentMonth);

  switch (periodName) {
    case "last-month": {
      const targetMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
      const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      return getMonthRangeKeys(targetYear, targetMonthIndex);
    }
    case "this-year": {
      return {
        startKey: `${currentYear}-01-01`,
        endKey: `${currentYear}-12-31`
      };
    }
    case "all": {
      return null;
    }
    case "custom": {
      const startInput = document.getElementById("settlementStartMonth");
      const endInput = document.getElementById("settlementEndMonth");
      const startValue = startInput?.value;
      const endValue = endInput?.value;
      if (!startValue && !endValue) {
        return getMonthRangeKeys(currentYear, currentMonth);
      }

      const startRange = startValue ? getMonthRangeKeys(Number(startValue.split("-")[0]), Number(startValue.split("-")[1]) - 1) : null;
      const endRange = endValue ? getMonthRangeKeys(Number(endValue.split("-")[0]), Number(endValue.split("-")[1]) - 1) : null;
      return {
        startKey: startRange?.startKey || null,
        endKey: endRange?.endKey || null
      };
    }
    case "this-month":
    default: {
      return getMonthRangeKeys(currentYear, currentMonth);
    }
  }
}

function isDateInRange(dateValue, range) {
  if (!range) return true;
  if (!dateValue) return false;
  if (range.startKey && dateValue < range.startKey) return false;
  if (range.endKey && dateValue > range.endKey) return false;
  return true;
}

function updateSettlementPeriodUI() {
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.period === selectedSettlementPeriod);
  });

  const customRow = document.getElementById("customPeriodRow");
  if (customRow) {
    customRow.classList.toggle("hidden", selectedSettlementPeriod !== "custom");
  }
}

function buildSettlementCustomerOptions() {
  const select = document.getElementById("settlementCustomerSelect");
  if (!select) return;

  const previousValue = select.value || selectedSettlementCustomer;
  const options = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}" ${previousValue === customer.id ? "selected" : ""}>${escapeHtml(customer.name)}</option>`)
    .join("");

  select.innerHTML = `<option value="all">전체</option>${options}`;
  if (previousValue && state.customers.some((customer) => customer.id === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = "all";
  }

  selectedSettlementCustomer = select.value || "all";
}

function buildSettlementReportData() {
  const range = getSettlementRange(selectedSettlementPeriod);
  const selectedCustomer = state.customers.find((customer) => customer.id === selectedSettlementCustomer);
  const customerName = selectedCustomer?.name || "";

  const filteredJobs = state.jobs.filter((job) => {
    if (!isDateInRange(job.date, range)) return false;
    if (selectedSettlementCustomer === "all") return true;
    if (job.jobType === "내 장비 작업") {
      return (job.customerId && job.customerId === selectedSettlementCustomer) || (job.customerName && job.customerName === customerName);
    }
    return false;
  });

  const filteredExpenses = state.expenses.filter((expense) => isDateInRange(expense.date, range));
  const equipmentJobs = filteredJobs.filter((job) => job.jobType === "내 장비 작업");
  const completedReceivables = equipmentJobs.filter((job) => job.receivableStatus === "수금완료");
  const outstandingReceivables = equipmentJobs.filter((job) => job.receivableStatus === "미수");

  const summary = {
    jobCount: filteredJobs.length,
    totalSales: equipmentJobs.reduce((sum, job) => sum + Number(job.salesAmount || 0), 0),
    completedReceivable: completedReceivables.reduce((sum, job) => sum + Number(job.salesAmount || 0), 0),
    outstandingReceivable: outstandingReceivables.reduce((sum, job) => sum + Number(job.salesAmount || 0), 0),
    totalExpenses: filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    netProfit: 0
  };
  summary.netProfit = summary.totalSales - summary.totalExpenses;

  const customerMap = new Map();
  filteredJobs.forEach((job) => {
    const name = job.customerName || job.providerName || "미입력";
    if (!name) return;
    const key = `${job.jobType}:${name}`;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        name,
        totalAmount: 0,
        count: 0
      });
    }
    const entry = customerMap.get(key);
    entry.totalAmount += job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0);
    entry.count += 1;
  });

  return {
    filters: {
      period: selectedSettlementPeriod,
      customerId: selectedSettlementCustomer,
      customerName,
      range
    },
    summary,
    customerSummaries: Array.from(customerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    jobs: filteredJobs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""))
  };
}

function renderSettlementView() {
  updateSettlementPeriodUI();
  buildSettlementCustomerOptions();

  currentSettlementReport = buildSettlementReportData();
  window.jeilcraneSettlementReport = currentSettlementReport;

  const { summary, customerSummaries, jobs } = currentSettlementReport;

  document.getElementById("settlementSummary").innerHTML = [
    { title: "작업건수", value: `${summary.jobCount}건` },
    { title: "총매출", value: formatCurrency(summary.totalSales) },
    { title: "수금완료", value: formatCurrency(summary.completedReceivable) },
    { title: "미수금", value: formatCurrency(summary.outstandingReceivable) },
    { title: "총지출", value: formatCurrency(summary.totalExpenses) },
    { title: "순이익", value: formatCurrency(summary.netProfit) }
  ].map((item) => `
    <div class="metric-card settlement-summary-card">
      <h4>${escapeHtml(item.title)}</h4>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");

  const customerItems = customerSummaries
    .map((customer) => `
      <article class="list-item settlement-card-item">
        <div>
          <strong>${escapeHtml(customer.name)}</strong>
          <p>${customer.count}건 · 기간 합계</p>
        </div>
        <div class="value-block">
          <span class="pill">합계</span>
          <p>${escapeHtml(formatAmountForList(customer.totalAmount))}</p>
        </div>
      </article>
    `)
    .join("");

  document.getElementById("settlementCustomers").innerHTML = customerItems || '<p class="muted">선택한 조건의 거래처 합계가 없습니다.</p>';

  const jobItems = jobs
    .map((job) => {
      const amountValue = job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0);
      const amountText = formatAmountForList(amountValue);
      const statusText = job.jobType === "내 장비 작업" ? (job.receivableStatus || "미수") : (job.payoutStatus || "미지급");
      const statusClass = statusText === "수금완료" || statusText === "지급완료" ? "completed" : "pending";

      return `
        <article class="list-item job-list-item settlement-job-card">
          <div class="job-card-main">
            <div class="job-card-header">
              <strong class="job-title">${escapeHtml(job.siteName || "현장 미입력")}</strong>
            </div>
            <div class="job-card-meta">
              <span>📅 ${escapeHtml(job.date || "")}</span>
              <span>🚛 ${escapeHtml(job.jobType)}</span>
              ${job.workTime ? `<span>🕒 ${escapeHtml(job.workTime)}</span>` : ""}
              <span>🏢 ${escapeHtml(job.customerName || job.providerName || "정보 없음")}</span>
            </div>
            <div class="job-card-finance">
              <div class="job-amount-row">
                <span class="job-card-label">💰</span>
                <span class="job-amount">${escapeHtml(amountText)}</span>
              </div>
              <span class="pill ${statusClass}">${escapeHtml(statusText)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.getElementById("settlementJobList").innerHTML = jobItems || '<p class="muted">선택한 조건의 작업이 없습니다.</p>';
}

function bindExpenseForm() {
  const form = document.getElementById("expenseForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const date = document.getElementById("expenseDate").value;
    const category = document.getElementById("expenseCategory").value;
    const amount = Number(document.getElementById("expenseAmount").value || 0);
    const memo = document.getElementById("expenseMemo").value.trim();

    if (!date) {
      showToast("날짜를 입력해주세요.");
      return;
    }

    if (!category) {
      showToast("지출항목을 선택해주세요.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("금액은 0보다 커야 합니다.");
      return;
    }

    state.expenses.unshift({
      id: createId("expense"),
      date,
      category,
      amount,
      memo,
      createdAt: new Date().toISOString()
    });

    saveState();
    renderAll();
    form.reset();
    document.getElementById("expenseDate").value = date;
    document.getElementById("expenseCategory").value = category;
    showToast("지출이 저장되었습니다.");
  });
}

function renderDashboard() {
  const month = getCurrentMonth();
  const today = getToday();
  const monthJobs = state.jobs.filter((job) => job.date && job.date.startsWith(month));
  const todayJobs = state.jobs.filter((job) => job.date === today);
  const todayCount = todayJobs.length;

  const monthlySales = monthJobs
    .filter((job) => job.jobType === "내 장비 작업")
    .reduce((sum, job) => sum + Number(job.salesAmount || 0), 0);

  const outstandingReceivable = state.jobs
    .filter((job) => job.jobType === "내 장비 작업")
    .reduce((sum, job) => sum + (job.receivableStatus === "미수" ? Number(job.salesAmount || 0) : 0), 0);

  const outstandingPayable = state.jobs
    .filter((job) => job.jobType === "배차 작업")
    .reduce((sum, job) => sum + (job.payoutStatus === "미지급" ? Number(job.payoutAmount || 0) : 0), 0);
  const monthlyExpenses = state.expenses.filter((expense) => expense.date && expense.date.startsWith(month));
  const totalExpenses = monthlyExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const netProfit = monthlySales - totalExpenses;

  document.getElementById("dashboardMetrics").innerHTML = [
    { title: "이번 달 매출", value: formatCurrency(monthlySales) },
    { title: "이번 달 지출", value: formatCurrency(totalExpenses) },
    { title: "순이익", value: formatCurrency(netProfit) },
    { title: "미수금", value: formatCurrency(outstandingReceivable) },
    { title: "미지급금", value: formatCurrency(outstandingPayable) },
    { title: "오늘 등록 건수", value: `${todayCount}건` }
  ].map((item) => `
    <div class="metric-card">
      <h4>${escapeHtml(item.title)}</h4>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");

  const celebration = document.getElementById("celebrationMessage");
  if (todayCount >= 2) {
    celebration.textContent = "🎉 오늘도 작업을 등록해 주셨네요!";
    celebration.classList.remove("hidden");
  } else {
    celebration.textContent = "";
    celebration.classList.add("hidden");
  }

  const todayList = todayJobs.length
    ? todayJobs.map((job) => `
      <article class="list-item job-list-item">
        <div class="job-card-main">
          <div class="job-card-header">
            <strong class="job-title">${escapeHtml(job.siteName || "현장 미입력")}</strong>
          </div>
          <div class="job-card-meta">
            <span>📅 ${escapeHtml(job.date || "")}</span>
            <span>🚛 ${escapeHtml(job.jobType)}</span>
            ${job.workTime ? `<span>🕒 ${escapeHtml(job.workTime)}</span>` : ""}
            <span>🏢 ${escapeHtml(job.customerName || "거래처 미입력")}</span>
          </div>
          <div class="job-card-content">
            <span class="job-card-label">📝</span>
            <p>${escapeHtml(job.workContent || "작업내용 없음")}</p>
          </div>
        </div>
      </article>
    `).join("")
    : '<p class="muted">오늘 등록된 작업이 없습니다.</p>';

  document.getElementById("todayJobsList").innerHTML = todayList;
}

function generateInvoiceNumber(job) {
  if (job.invoiceNumber) return job.invoiceNumber;

  const todayKey = getInvoiceDateKey();
  const currentSequence = state.invoiceNumberState?.date === todayKey ? Number(state.invoiceNumberState?.sequence || 0) : 0;
  const nextSequence = currentSequence + 1;
  const invoiceNumber = `JC-${todayKey}-${String(nextSequence).padStart(3, "0")}`;

  state.invoiceNumberState = { date: todayKey, sequence: nextSequence };
  job.invoiceNumber = invoiceNumber;
  saveState();
  return invoiceNumber;
}

function buildInvoiceHtml(job) {
  const amount = job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0);
  const invoiceDate = job.date || getToday();
  const customerName = job.customerName || job.providerName || "미입력";
  const siteName = job.siteName || "미입력";
  const workContent = job.workContent || "작업내용 없음";
  const companyInfo = state.companyInfo || getDefaultCompanyInfo();
  const invoiceNumber = job.invoiceNumber || generateInvoiceNumber(job);
  const contactLine = [companyInfo.phone, companyInfo.email].filter(Boolean).join(" / ");

  return `
    <div class="invoice-content">
      <div class="invoice-header">
        <div class="invoice-title-block">
          <h2 class="invoice-title">거래명세서</h2>
          <div class="invoice-meta-line">
            <span>문서번호: ${escapeHtml(invoiceNumber)}</span>
            <span>발행일: ${escapeHtml(invoiceDate)}</span>
          </div>
        </div>
      </div>
      <div class="invoice-company">
        <div class="invoice-company-info">
          <div class="invoice-company-name">${escapeHtml(companyInfo.companyName || "제일크레인")}</div>
          <div class="invoice-company-item">대표자: ${escapeHtml(companyInfo.representativeName || "정보 없음")}</div>
          <div class="invoice-company-item">사업자등록번호: ${escapeHtml(companyInfo.businessNumber || "정보 없음")}</div>
          <div class="invoice-company-item">주소: ${escapeHtml(companyInfo.address || "정보 없음")}</div>
          <div class="invoice-company-item">전화번호: ${escapeHtml(companyInfo.phone || "정보 없음")}</div>
          <div class="invoice-company-item">이메일: ${escapeHtml(companyInfo.email || "정보 없음")}</div>
        </div>
      </div>
      <div class="invoice-party">
        <div class="invoice-party-card">
          <div class="invoice-party-label">공급받는자</div>
          <div class="invoice-party-value">${escapeHtml(customerName)}</div>
        </div>
        <div class="invoice-party-card accent">
          <div class="invoice-party-label">합계금액</div>
          <div class="invoice-party-value">${escapeHtml(formatCurrency(amount))}</div>
        </div>
      </div>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>현장명</th>
            <th>작업내용</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(siteName)}</td>
            <td>${escapeHtml(workContent)}</td>
            <td>${escapeHtml(formatCurrency(amount))}</td>
          </tr>
        </tbody>
      </table>
      <p class="invoice-total">합계: ${escapeHtml(formatCurrency(amount))}</p>
    </div>
  `;
}

function openInvoice(jobId) {
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (!job) return;
  const invoiceNumber = generateInvoiceNumber(job);
  document.getElementById("invoiceContent").innerHTML = buildInvoiceHtml({ ...job, invoiceNumber });
  document.getElementById("invoiceModal").classList.remove("hidden");
  document.getElementById("invoiceModal").setAttribute("aria-hidden", "false");
}

function closeInvoice() {
  document.getElementById("invoiceModal").classList.add("hidden");
  document.getElementById("invoiceModal").setAttribute("aria-hidden", "true");
}

function printInvoice() {
  window.print();
}

function downloadInvoice() {
  const printWindow = window.open("", "_blank", "width=900,height=1000");
  if (!printWindow) {
    showToast("팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.");
    return;
  }
  const content = document.getElementById("invoiceContent").innerHTML;
  printWindow.document.write(`<!DOCTYPE html><html><head><title>거래명세서</title><style>@page{size:A4;margin:12mm}body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif} .invoice-content{padding:24px;font-size:13px;line-height:1.45} .invoice-company{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px;border-bottom:1px solid #e5e7eb;padding-bottom:12px} .invoice-company-info{text-align:right;font-size:12px;color:#374151} .invoice-title{font-size:22px;margin:0 0 6px} .invoice-number{margin:0;font-weight:700} .invoice-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0;font-size:12px} .invoice-table{width:100%;border-collapse:collapse;margin-top:16px} .invoice-table th,.invoice-table td{border:1px solid #d1d5db;padding:8px;text-align:left} .invoice-table th{background:#f3f4f6} .invoice-total{text-align:right;font-weight:700;margin-top:16px}</style></head><body>${content}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function getVisibleJobs() {
  if (selectedCalendarDate) {
    return state.jobs.filter((job) => job.date === selectedCalendarDate);
  }
  return state.jobs;
}

function renderCalendarView() {
  const container = document.getElementById("calendarContainer");
  const summary = document.getElementById("calendarSelectionSummary");
  if (!container || !summary) return;

  const monthLabel = `${calendarViewDate.getFullYear()}년 ${calendarViewDate.getMonth() + 1}월`;
  const firstDay = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), 1);
  const lastDay = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 0);
  const leadingDays = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  const jobsByDate = state.jobs.reduce((map, job) => {
    if (job.date) {
      if (!map[job.date]) map[job.date] = [];
      map[job.date].push(job);
    }
    return map;
  }, {});
  const todayKey = getToday();

  const days = Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - leadingDays + 1;
    return new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), dayOffset);
  });

  container.innerHTML = `
    <div class="calendar-toolbar">
      <button type="button" class="ghost-btn compact" data-action="calendar-prev">◀</button>
      <strong>${escapeHtml(monthLabel)}</strong>
      <button type="button" class="ghost-btn compact" data-action="calendar-next">▶</button>
    </div>
    <div class="calendar-weekdays">
      <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
    </div>
    <div class="calendar-grid">
      ${days.map((date) => {
        const dateKey = formatDateKey(date);
        const isCurrentMonth = date.getMonth() === calendarViewDate.getMonth();
        const isSelected = selectedCalendarDate === dateKey;
        const isToday = dateKey === todayKey;
        const jobs = jobsByDate[dateKey] || [];
        const hasJobs = jobs.length > 0;
        const hasEquipmentJobs = jobs.some((job) => job.jobType === "내 장비 작업");
        const hasDispatchJobs = jobs.some((job) => job.jobType === "배차 작업");
        return `
          <button
            type="button"
            class="calendar-date-btn ${isCurrentMonth ? "" : "calendar-date-btn-muted"} ${isSelected ? "selected" : ""} ${hasJobs ? "has-jobs" : ""} ${isToday ? "today" : ""}"
            data-action="select-date"
            data-date="${escapeHtml(dateKey)}"
          >
            <span class="calendar-date-number">${date.getDate()}</span>
            ${hasJobs ? `
              <span class="calendar-marker-group">
                ${hasEquipmentJobs ? '<span class="calendar-dot calendar-dot-green"></span>' : ""}
                ${hasDispatchJobs ? '<span class="calendar-dot calendar-dot-red"></span>' : ""}
              </span>
            ` : ""}
            ${hasJobs ? `<span class="calendar-count">${jobs.length}</span>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;

  if (selectedCalendarDate) {
    const selectedJobs = jobsByDate[selectedCalendarDate] || [];
    const dailySales = selectedJobs
      .filter((job) => job.jobType === "내 장비 작업")
      .reduce((sum, job) => sum + Number(job.salesAmount || 0), 0);

    summary.innerHTML = `
      <div class="calendar-summary-card">
        <div>
          <p class="muted">${escapeHtml(selectedCalendarDate)} 선택됨</p>
          <strong>${selectedJobs.length}건</strong>
        </div>
        <div class="calendar-summary-amount">${escapeHtml(formatCurrency(dailySales))}</div>
      </div>
    `;
  } else {
    summary.innerHTML = '<div class="calendar-summary-card"><div><p class="muted">전체 작업 보기</p><strong>모든 작업</strong></div></div>';
  }
}

function renderJobList() {
  const visibleJobs = getVisibleJobs();
  const items = visibleJobs.map((job) => {
    const amountValue = job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0);
    const amountText = formatAmountForList(amountValue);
    const statusText = job.jobType === "내 장비 작업" ? (job.receivableStatus || "미수") : (job.payoutStatus || "미지급");
    const statusClass = statusText === "수금완료" || statusText === "지급완료" ? "completed" : "pending";

    return `
      <article class="list-item job-list-item">
        <div class="job-card-main">
          <div class="job-card-header">
            <strong class="job-title">${escapeHtml(job.siteName || "현장 미입력")}</strong>
          </div>
          <div class="job-card-meta">
            <span>📅 ${escapeHtml(job.date || "")}</span>
            <span>🚛 ${escapeHtml(job.jobType)}</span>
            ${job.workTime ? `<span>🕒 ${escapeHtml(job.workTime)}</span>` : ""}
            <span>🏢 ${escapeHtml(job.customerName || job.providerName || "정보 없음")}</span>
          </div>
          <div class="job-card-content">
            <span class="job-card-label">📝</span>
            <p>${escapeHtml(job.workContent || "작업내용 없음")}</p>
          </div>
          <div class="job-card-finance">
            <div class="job-amount-row">
              <span class="job-card-label">💰</span>
              <span class="job-amount">${escapeHtml(amountText)}</span>
            </div>
            <span class="pill ${statusClass}">${escapeHtml(statusText)}</span>
          </div>
        </div>
        <div class="job-card-actions">
          <button class="tiny-btn" data-action="invoice" data-id="${escapeHtml(job.id)}">거래명세서</button>
          <button class="tiny-btn danger" data-action="delete" data-id="${escapeHtml(job.id)}">삭제</button>
        </div>
      </article>
    `;
  }).join("");

  document.getElementById("jobList").innerHTML = items || '<p class="muted">등록된 작업이 없습니다.</p>';
}

function handleListActions(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id, date } = button.dataset;

  if (action === "show-customer") {
    selectedCustomerId = id;
    renderCustomersView();
    return;
  }

  if (action === "invoice") {
    openInvoice(id);
    return;
  }

  if (action === "select-date") {
    selectedCalendarDate = date || null;
    renderCalendarView();
    renderJobList();
    return;
  }

  if (action === "calendar-prev") {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
    renderCalendarView();
    return;
  }

  if (action === "calendar-next") {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
    renderCalendarView();
    return;
  }

  if (action === "show-all-jobs") {
    selectedCalendarDate = null;
    renderCalendarView();
    renderJobList();
    return;
  }

  if (action === "delete") {
    state.jobs = state.jobs.filter((job) => job.id !== id);
    saveState();
    renderAll();
    showToast("작업이 삭제되었습니다.");
  }

  if (action === "delete-expense") {
    state.expenses = state.expenses.filter((expense) => expense.id !== id);
    saveState();
    renderAll();
    showToast("지출이 삭제되었습니다.");
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jeilcrane-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("백업 파일이 다운로드되었습니다.");
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      state.jobs = Array.isArray(imported.jobs) ? imported.jobs : state.jobs;
      state.customers = normalizeCustomers(imported.customers, state.jobs);
      state.expenses = Array.isArray(imported.expenses) ? imported.expenses.map(normalizeExpense) : [];
      saveState();
      renderAll();
      showToast("데이터를 복구했습니다.");
    } catch (error) {
      console.error(error);
      showToast("복구에 실패했습니다.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function renderAll() {
  buildDatalists();
  buildCustomerSelectOptions();
  renderDashboard();
  renderCalendarView();
  renderJobList();
  renderCustomersView();
  renderSettlementView();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("SW 등록 실패", error));
    });
  }
}

const state = loadState();

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindForm();
  bindSettingsForm();
  bindCustomerForms();
  bindExpenseForm();
  document.addEventListener("click", handleListActions);
  document.getElementById("backupBtn").addEventListener("click", exportBackup);
  document.getElementById("exportBtn").addEventListener("click", exportBackup);
  document.getElementById("importFile").addEventListener("change", importBackup);
  document.getElementById("closeInvoiceBtn").addEventListener("click", closeInvoice);
  document.getElementById("backToMainBtn").addEventListener("click", () => {
    closeInvoice();
    setView("jobs");
  });
  document.getElementById("printInvoiceBtn").addEventListener("click", printInvoice);
  document.getElementById("downloadInvoiceBtn").addEventListener("click", downloadInvoice);
  document.getElementById("invoiceModal").addEventListener("click", (event) => {
    if (event.target.id === "invoiceModal") closeInvoice();
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSettlementPeriod = button.dataset.period;
      renderSettlementView();
    });
  });

  const customerSelect = document.getElementById("settlementCustomerSelect");
  if (customerSelect) {
    customerSelect.addEventListener("change", () => {
      selectedSettlementCustomer = customerSelect.value || "all";
      renderSettlementView();
    });
  }

  const startMonthInput = document.getElementById("settlementStartMonth");
  const endMonthInput = document.getElementById("settlementEndMonth");
  [startMonthInput, endMonthInput].forEach((input) => {
    if (input) {
      input.addEventListener("change", () => {
        if (selectedSettlementPeriod !== "custom") {
          selectedSettlementPeriod = "custom";
        }
        renderSettlementView();
      });
    }
  });

  if (startMonthInput && !startMonthInput.value) {
    startMonthInput.value = getCurrentMonth();
  }
  if (endMonthInput && !endMonthInput.value) {
    endMonthInput.value = getCurrentMonth();
  }
  setTodayDefaults();
  toggleJobTypeFields();
  toggleCustomerQuickAdd(false);
  populateSettingsForm();
  renderAll();
  setView("dashboard");
  registerServiceWorker();
});
