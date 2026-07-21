const STORAGE_KEY = "jeilcrane-pro-db-v2";
const EXPENSE_CATEGORIES = ["주유", "장비수리", "소모품", "식비", "보험", "기타"];
let selectedCustomerId = null;
let selectedCalendarDate = null;
let calendarViewDate = new Date();
let selectedSettlementPeriod = "this-month";
let selectedSettlementCustomer = "all";
let currentSettlementReport = null;
let isSettlementOutstandingOpen = false;
let isSettlementExpenseOpen = false;
let selectedExpensePeriod = "this-month";
let editingJobId = null;
let pendingDeleteJobId = null;
let editingExpenseId = null;
let pendingDeleteExpenseId = null;

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

function getCompanyInfo() {
  const defaults = getDefaultCompanyInfo();
  const stateInfo = state?.companyInfo || {};
  let storedInfo = {};

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.companyInfo && typeof parsed.companyInfo === "object") {
        storedInfo = parsed.companyInfo;
      }
    }
  } catch (error) {
    console.warn("회사정보 조회 실패", error);
  }

  const merged = { ...storedInfo, ...stateInfo };
  const pick = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "";

  return {
    companyName: pick(merged.companyName, merged.name, merged.companyNameKo) || defaults.companyName,
    representativeName: pick(merged.representativeName, merged.representative, merged.ownerName, merged.ceo),
    phone: pick(merged.phone, merged.phoneNumber, merged.tel, merged.telephone),
    businessNumber: pick(merged.businessNumber, merged.businessNo, merged.registrationNumber, merged.businessRegistrationNumber),
    address: pick(merged.address, merged.companyAddress, merged.addr),
    email: pick(merged.email, merged.mail)
  };
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

function getLastMonth() {
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
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

async function downloadInvoice() {
  const invoiceDocument = document.querySelector("#invoiceContent .invoice-content");
  if (!invoiceDocument) {
    showToast("거래명세서를 찾지 못했습니다.");
    return;
  }

  try {
    const jsPDF = ensureJsPdfReady();
    const html2canvas = ensureHtml2CanvasReady();
    const captureHost = document.createElement("div");
    captureHost.style.position = "fixed";
    captureHost.style.left = "-10000px";
    captureHost.style.top = "0";
    captureHost.style.background = "#ffffff";
    captureHost.style.padding = "0";
    captureHost.style.margin = "0";
    captureHost.style.zIndex = "-1";

    const captureNode = invoiceDocument.cloneNode(true);
    captureNode.style.transform = "none";
    captureNode.style.transformOrigin = "top left";
    captureNode.style.width = "210mm";
    captureNode.style.minHeight = "297mm";
    captureNode.style.height = "auto";
    captureNode.style.margin = "0";
    captureNode.style.border = "none";
    captureNode.style.boxShadow = "none";
    captureNode.style.overflow = "visible";

    captureHost.appendChild(captureNode);
    document.body.appendChild(captureHost);

    let canvas;
    try {
      canvas = await html2canvas(captureNode, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true
      });
    } finally {
      captureHost.remove();
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfWidth = 210;
    const pdfHeight = 297;
    const imageHeight = (canvas.height * pdfWidth) / canvas.width;
    const fileName = `거래명세서_${getToday()}.pdf`;

    if (imageHeight <= pdfHeight + 1.5) {
      const imgData = canvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", 0, 0, pdfWidth, Math.min(imageHeight, pdfHeight));
      doc.save(fileName);
      showToast("PDF 파일을 저장했습니다.");
      return;
    }

    const pxPerMm = canvas.width / pdfWidth;
    const pageSliceHeightPx = Math.max(1, Math.floor(pdfHeight * pxPerMm));
    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height - 0.5) {
      const remaining = canvas.height - offsetY;
      const sliceHeight = Math.min(pageSliceHeightPx, remaining);
      if (sliceHeight <= 0) break;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      if (!context) {
        throw new Error("PDF 캡처를 위한 캔버스 컨텍스트를 생성하지 못했습니다.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) {
        doc.addPage("a4", "portrait");
      }

      const renderHeightMm = sliceHeight / pxPerMm;
      doc.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, renderHeightMm);

      offsetY += sliceHeight;
      pageIndex += 1;
    }

    doc.save(fileName);
    showToast("PDF 파일을 저장했습니다.");
  } catch (error) {
    console.error(error);
    showToast("PDF 저장에 실패했습니다.");
  }
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
}

function bindSettingsCards() {
  const actionToSection = {
    "open-customer-management": "customer",
    "open-company-settings": "company",
    "open-backup-view": "backup",
    "open-app-info": "app"
  };

  document.querySelectorAll(".settings-menu-card").forEach((card) => {
    card.addEventListener("click", () => {
      const section = actionToSection[card.dataset.action];
      if (!section) return;
      setView("settings");
      showSettingsSection(section);
      card.blur();
    });
  });
}

function showSettingsSection(sectionName) {
  const sections = {
    customer: document.getElementById("settingsCustomerSection"),
    company: document.getElementById("settingsCompanySection"),
    backup: document.getElementById("settingsBackupSection"),
    app: document.getElementById("settingsAppInfoSection")
  };

  Object.entries(sections).forEach(([key, element]) => {
    if (element) {
      element.classList.toggle("hidden", key !== sectionName);
    }
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

function setJobFormMode(isEditMode) {
  const title = document.getElementById("jobFormTitle");
  const submitButton = document.getElementById("jobSubmitBtn");
  const cancelButton = document.getElementById("jobEditCancelBtn");

  if (title) title.textContent = isEditMode ? "작업 수정" : "작업 등록";
  if (submitButton) submitButton.textContent = isEditMode ? "수정 완료" : "작업 저장";
  if (cancelButton) cancelButton.classList.toggle("hidden", !isEditMode);
}

function resetJobFormToCreateMode() {
  const form = document.getElementById("jobForm");
  editingJobId = null;
  if (form) form.reset();
  setTodayDefaults();
  toggleJobTypeFields();
  setJobFormMode(false);
}

function startJobEdit(job) {
  if (!job) return;
  const customerSelect = document.getElementById("jobCustomer");
  const matchedCustomerByName = state.customers.find((customer) => customer.name === job.customerName);
  const customerId = state.customers.some((customer) => customer.id === job.customerId)
    ? job.customerId
    : (matchedCustomerByName ? matchedCustomerByName.id : "");

  editingJobId = job.id;
  setView("jobs");

  document.getElementById("jobDate").value = job.date || getToday();
  document.getElementById("jobSite").value = job.siteName || "";
  document.getElementById("jobWork").value = job.workContent || "";
  document.getElementById("jobWorkTime").value = job.workTime || "";
  if (customerSelect) customerSelect.value = customerId;
  document.getElementById("jobType").value = job.jobType || "내 장비 작업";
  document.getElementById("jobMemo").value = job.memo || "";
  document.getElementById("salesAmount").value = Number(job.salesAmount || 0) || "";
  document.getElementById("receivableStatus").value = job.receivableStatus || "미수";
  document.getElementById("invoiceIssued").value = job.invoiceIssued || "미발행";
  document.getElementById("payoutAmount").value = Number(job.payoutAmount || 0) || "";
  document.getElementById("payoutStatus").value = job.payoutStatus || "미지급";

  toggleJobTypeFields();
  setJobFormMode(true);
  document.getElementById("jobSite").focus();
}

function bindForm() {
  const form = document.getElementById("jobForm");
  const cancelEditButton = document.getElementById("jobEditCancelBtn");
  document.getElementById("jobType").addEventListener("change", toggleJobTypeFields);

  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", () => {
      resetJobFormToCreateMode();
      showToast("작업 수정을 취소했습니다.");
    });
  }

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

    const currentEditId = editingJobId;
    const existingJob = currentEditId ? state.jobs.find((job) => job.id === currentEditId) : null;
    if (currentEditId && !existingJob) {
      showToast("수정할 작업을 찾지 못했습니다.");
      resetJobFormToCreateMode();
      return;
    }

    const selectedCustomer = state.customers.find((customer) => customer.id === customerId);
    const jobType = document.getElementById("jobType").value;
    const record = {
      id: existingJob ? existingJob.id : createId("job"),
      date: document.getElementById("jobDate").value || getToday(),
      siteName,
      workContent: document.getElementById("jobWork").value.trim(),
      workTime: document.getElementById("jobWorkTime").value.trim(),
      customerName: selectedCustomer ? selectedCustomer.name : "",
      customerId: selectedCustomer ? selectedCustomer.id : "",
      jobType,
      memo: document.getElementById("jobMemo").value.trim(),
      status: existingJob ? (existingJob.status || "진행중") : "진행중",
      createdAt: existingJob ? (existingJob.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    if (jobType === "배차 작업") {
      record.providerName = existingJob ? (existingJob.providerName || "") : "";
      record.payoutAmount = Number(document.getElementById("payoutAmount").value || 0);
      record.payoutStatus = document.getElementById("payoutStatus").value;
      delete record.salesAmount;
      delete record.receivableStatus;
      delete record.invoiceIssued;
    } else {
      record.salesAmount = Number(document.getElementById("salesAmount").value || 0);
      record.receivableStatus = document.getElementById("receivableStatus").value;
      record.invoiceIssued = document.getElementById("invoiceIssued").value;
      delete record.providerName;
      delete record.payoutAmount;
      delete record.payoutStatus;
    }

    if (existingJob) {
      const targetIndex = state.jobs.findIndex((job) => job.id === existingJob.id);
      if (targetIndex === -1) {
        showToast("수정할 작업을 찾지 못했습니다.");
        resetJobFormToCreateMode();
        return;
      }
      state.jobs[targetIndex] = record;
    } else {
      state.jobs.unshift(record);
    }

    saveState();
    renderAll();
    resetJobFormToCreateMode();
    showToast(existingJob ? "작업이 수정되었습니다." : "작업이 저장되었습니다.");
  });
}

function buildDatalists() {
  const providerValues = [...new Set(state.jobs.map((job) => job.providerName).filter(Boolean))];

  const providerOptions = document.getElementById("providerOptions");
  if (providerOptions) {
    providerOptions.innerHTML = providerValues.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  }
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

function getJobCustomerName(job) {
  return String(
    job?.customerName
    || job?.customer
    || job?.client
    || job?.orderer
    || job?.dispatchCompany
    || job?.vendor
    || job?.providerName
    || ""
  ).trim();
}

function updateSettlementPeriodUI() {
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.period === selectedSettlementPeriod);
  });

  const customPeriodRow = document.getElementById("customPeriodRow");
  if (customPeriodRow) {
    customPeriodRow.classList.toggle("hidden", selectedSettlementPeriod !== "custom");
  }
}

function updateExpensePeriodUI() {
  document.querySelectorAll("[data-expense-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.expensePeriod === selectedExpensePeriod);
  });

  const customRow = document.getElementById("expenseCustomPeriodRow");
  if (customRow) {
    customRow.classList.toggle("hidden", selectedExpensePeriod !== "custom");
  }
}

function getSelectedExpenseMonth() {
  if (selectedExpensePeriod === "last-month") {
    return getLastMonth();
  }

  if (selectedExpensePeriod === "custom") {
    const monthInput = document.getElementById("expenseFilterMonth");
    return monthInput?.value || getCurrentMonth();
  }

  return getCurrentMonth();
}

function getSettlementJobAmount(job) {
  return job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0);
}

function getSettlementCollectionStatus(job) {
  if (job.jobType === "배차 작업") {
    return String(
      job.payoutStatus
      || job.receivableStatus
      || job.collectionStatus
      || job.receivable
      || "미지급"
    ).trim();
  }

  return String(
    job.receivableStatus
    || job.collectionStatus
    || job.receivable
    || job.payoutStatus
    || "미수"
  ).trim();
}

function isOutstandingReceivableJob(job) {
  const status = getSettlementCollectionStatus(job);
  if (status === "수금완료" || status === "지급완료") return false;
  return status.includes("미수") || status.includes("미지급");
}

function sortJobsByDateAsc(a, b) {
  const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCompare !== 0) return dateCompare;
  return String(a.siteName || "").localeCompare(String(b.siteName || ""));
}

function buildOutstandingReceivableDetailHtml(report) {
  const outstandingJobs = report.jobs
    .filter(isOutstandingReceivableJob)
    .slice()
    .sort(sortJobsByDateAsc);

  if (!outstandingJobs.length) {
    return `
      <section class="settlement-outstanding-panel">
        <p class="muted">선택한 기간의 미수 작업이 없습니다.</p>
      </section>
    `;
  }

  const renderJob = (job) => {
    const amount = getSettlementJobAmount(job);
    const statusText = getSettlementCollectionStatus(job);
    const customerName = getJobCustomerName(job) || "미입력";
    return `
      <article class="list-item settlement-outstanding-item">
        <div>
          <strong>${escapeHtml(job.date || "-")} · ${escapeHtml(job.siteName || "현장 미입력")}</strong>
          <p>${escapeHtml(job.workContent || "작업내용 없음")}</p>
          <p class="muted">${escapeHtml(customerName)} · ${escapeHtml(job.jobType || "작업구분 미입력")}</p>
        </div>
        <div class="value-block">
          <span class="pill pending">${escapeHtml(statusText)}</span>
          <p>${escapeHtml(formatCurrency(amount))}</p>
        </div>
      </article>
    `;
  };

  if (selectedSettlementCustomer === "all") {
    const grouped = outstandingJobs.reduce((map, job) => {
      const key = getJobCustomerName(job) || "미입력";
      if (!map[key]) map[key] = [];
      map[key].push(job);
      return map;
    }, {});

    const customerNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ko"));
    const totalOutstanding = outstandingJobs.reduce((sum, job) => sum + getSettlementJobAmount(job), 0);

    const groups = customerNames.map((name) => {
      const jobs = grouped[name].slice().sort(sortJobsByDateAsc);
      const subtotal = jobs.reduce((sum, job) => sum + getSettlementJobAmount(job), 0);

      return `
        <section class="settlement-outstanding-group">
          <h4>${escapeHtml(name)}</h4>
          <div class="stack-list">
            ${jobs.map(renderJob).join("")}
          </div>
          <div class="settlement-outstanding-subtotal">
            <span>거래처 미수 합계</span>
            <strong>${escapeHtml(formatCurrency(subtotal))}</strong>
          </div>
        </section>
      `;
    }).join("");

    return `
      <section class="settlement-outstanding-panel">
        ${groups}
        <div class="settlement-outstanding-total">
          <span>전체 미수금 합계</span>
          <strong>${escapeHtml(formatCurrency(totalOutstanding))}</strong>
        </div>
      </section>
    `;
  }

  const selectedCustomerName = report.filters.customerName || "선택 거래처";
  const subtotal = outstandingJobs.reduce((sum, job) => sum + getSettlementJobAmount(job), 0);

  return `
    <section class="settlement-outstanding-panel">
      <section class="settlement-outstanding-group">
        <h4>${escapeHtml(selectedCustomerName)}</h4>
        <div class="stack-list">
          ${outstandingJobs.map(renderJob).join("")}
        </div>
        <div class="settlement-outstanding-subtotal">
          <span>거래처 미수 합계</span>
          <strong>${escapeHtml(formatCurrency(subtotal))}</strong>
        </div>
      </section>
    </section>
  `;
}

function buildSettlementExpenseDetailHtml(report) {
  const expenses = (Array.isArray(report.expenses) ? report.expenses : [])
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

  if (!expenses.length) {
    return `
      <section class="settlement-expense-panel">
        <p class="muted">선택한 기간의 지출 내역이 없습니다.</p>
      </section>
    `;
  }

  const grouped = expenses.reduce((map, expense) => {
    const key = String(expense.category || "기타").trim() || "기타";
    if (!map[key]) map[key] = [];
    map[key].push(expense);
    return map;
  }, {});

  const categoryNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ko"));
  const totalExpenseAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const groupsHtml = categoryNames.map((categoryName) => {
    const items = grouped[categoryName]
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

    const subtotal = items.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return `
      <section class="settlement-expense-group">
        <h4>${escapeHtml(categoryName)}</h4>
        <div class="stack-list">
          ${items.map((expense) => `
            <article class="list-item settlement-expense-item">
              <div>
                <strong>${escapeHtml(expense.date || "-")} · ${escapeHtml(expense.category || "기타")}</strong>
                <p>${escapeHtml(expense.memo || "내용 없음")}</p>
              </div>
              <div class="value-block">
                <p>${escapeHtml(formatCurrency(expense.amount))}</p>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="settlement-expense-subtotal">
          <span>항목 합계</span>
          <strong>${escapeHtml(formatCurrency(subtotal))}</strong>
        </div>
      </section>
    `;
  }).join("");

  return `
    <section class="settlement-expense-panel">
      ${groupsHtml}
      <div class="settlement-expense-total">
        <span>전체 지출 합계</span>
        <strong>${escapeHtml(formatCurrency(totalExpenseAmount))}</strong>
      </div>
    </section>
  `;
}

function buildSettlementReportData() {
  const range = getSettlementRange(selectedSettlementPeriod);
  const customerName = selectedSettlementCustomer === "all"
    ? ""
    : String(state.customers.find((customer) => customer.id === selectedSettlementCustomer)?.name || "").trim();

  const filteredJobs = state.jobs.filter((job) => {
    if (!isDateInRange(job.date, range)) return false;
    if (selectedSettlementCustomer === "all") return true;
    return getJobCustomerName(job) === customerName;
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
    const name = getJobCustomerName(job) || "미입력";
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
    jobs: filteredJobs.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    expenses: filteredExpenses.slice()
  };
}

function buildSettlementCustomerOptions() {
  const select = document.getElementById("settlementCustomerSelect");
  if (!select) return;

  const previousValue = selectedSettlementCustomer || "all";
  const customerOptions = state.customers
    .map((customer) => `<option value="${escapeHtml(customer.id)}" ${previousValue === customer.id ? "selected" : ""}>${escapeHtml(customer.name)}</option>`)
    .join("");

  select.innerHTML = `<option value="all" ${previousValue === "all" ? "selected" : ""}>전체 거래처</option>${customerOptions}`;

  if (previousValue !== "all" && !state.customers.some((customer) => customer.id === previousValue)) {
    selectedSettlementCustomer = "all";
    select.value = "all";
  } else {
    select.value = previousValue;
  }
}

function renderSettlementView() {
  updateSettlementPeriodUI();
  buildSettlementCustomerOptions();

  currentSettlementReport = buildSettlementReportData();
  window.jeilcraneSettlementReport = currentSettlementReport;

  const settlementStatementBtn = document.getElementById("settlementStatementBtn");
  if (settlementStatementBtn) {
    const shouldShow = selectedSettlementCustomer !== "all" && currentSettlementReport.jobs.length > 0;
    settlementStatementBtn.classList.toggle("hidden", !shouldShow);
  }

  const { summary, customerSummaries, jobs } = currentSettlementReport;

  const summaryItems = [
    { title: "작업건수", value: `${summary.jobCount}건` },
    { title: "총매출", value: formatCurrency(summary.totalSales) },
    { title: "수금완료", value: formatCurrency(summary.completedReceivable) },
    {
      title: "미수금",
      value: formatCurrency(summary.outstandingReceivable),
      action: "toggle-outstanding-details"
    },
    {
      title: "총지출",
      value: formatCurrency(summary.totalExpenses),
      action: "toggle-expense-details"
    },
    { title: "순이익", value: formatCurrency(summary.netProfit) }
  ];

  const summaryActionState = {
    "toggle-outstanding-details": isSettlementOutstandingOpen,
    "toggle-expense-details": isSettlementExpenseOpen
  };

  const summaryCardsHtml = summaryItems.map((item) => {
    if (item.action) {
      const isOpen = Boolean(summaryActionState[item.action]);
      return `
        <button type="button" class="metric-card settlement-summary-card settlement-summary-btn ${isOpen ? "open" : ""}" data-action="${escapeHtml(item.action)}" aria-expanded="${isOpen ? "true" : "false"}">
          <h4>${escapeHtml(item.title)}</h4>
          <strong>${escapeHtml(item.value)}</strong>
        </button>
      `;
    }

    return `
      <div class="metric-card settlement-summary-card">
        <h4>${escapeHtml(item.title)}</h4>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `;
  }).join("");

  const outstandingDetailHtml = isSettlementOutstandingOpen
    ? buildOutstandingReceivableDetailHtml(currentSettlementReport)
    : "";

  const expenseDetailHtml = isSettlementExpenseOpen
    ? buildSettlementExpenseDetailHtml(currentSettlementReport)
    : "";

  document.getElementById("settlementSummary").innerHTML = `${summaryCardsHtml}${outstandingDetailHtml}${expenseDetailHtml}`;

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

  const groupedJobs = jobs.reduce((groups, job) => {
    const key = job.date || "미지정";
    if (!groups[key]) groups[key] = [];
    groups[key].push(job);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedJobs).sort((a, b) => a.localeCompare(b));

  const jobItems = sortedDates.map((dateKey) => {
    const dateJobs = groupedJobs[dateKey].slice().sort((a, b) => (a.siteName || "").localeCompare(b.siteName || ""));
    const daySales = dateJobs
      .filter((job) => job.jobType === "내 장비 작업")
      .reduce((sum, job) => sum + Number(job.salesAmount || 0), 0);

    return `
      <section class="settlement-day-group">
        <div class="settlement-day-header">
          <strong>${escapeHtml(dateKey)}</strong>
          <span class="pill">일매출 ${escapeHtml(formatAmountForList(daySales))}</span>
        </div>
        <div class="settlement-day-items">
          ${dateJobs.map((job) => {
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
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");

  document.getElementById("settlementJobList").innerHTML = jobItems || '<p class="muted">선택한 조건의 작업이 없습니다.</p>';
}

function buildSettlementStatementHtml(report) {
  const companyInfo = getCompanyInfo();
  const selectedCustomer = state.customers.find((customer) => customer.id === report.filters.customerId);
  const customerName = selectedCustomer?.name || report.filters.customerName || "선택된 거래처";
  const periodLabel = report.filters.period === "custom"
    ? `${report.filters.range?.startKey || ""}${report.filters.range?.startKey && report.filters.range?.endKey ? " ~ " : ""}${report.filters.range?.endKey || ""}`
    : (report.filters.period === "this-month" ? "이번 달" : report.filters.period === "last-month" ? "지난 달" : report.filters.period === "this-year" ? "올해" : report.filters.period === "all" ? "전체" : "기간 선택");

  const issueDate = getToday();
  const pickCustomerField = (...values) => values.map((value) => String(value ?? "").trim()).find(Boolean) || "-";

  const customerRepresentative = pickCustomerField(
    selectedCustomer?.representativeName,
    selectedCustomer?.representative,
    selectedCustomer?.ceoName,
    selectedCustomer?.manager
  );
  const customerPhone = pickCustomerField(
    selectedCustomer?.phone,
    selectedCustomer?.tel,
    selectedCustomer?.telephone,
    selectedCustomer?.mobile,
    selectedCustomer?.managerPhone,
    selectedCustomer?.contact
  );
  const customerBusinessNumber = pickCustomerField(
    selectedCustomer?.businessNumber,
    selectedCustomer?.businessNo,
    selectedCustomer?.registrationNumber,
    selectedCustomer?.businessRegistrationNumber
  );
  const customerAddress = pickCustomerField(
    selectedCustomer?.address,
    selectedCustomer?.companyAddress,
    selectedCustomer?.addr
  );

  const sortedJobs = report.jobs
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  if (!sortedJobs.length) {
    return `
      <div class="settlement-statement-empty">
        <p>선택한 거래처와 기간에 해당하는 작업이 없습니다.</p>
      </div>
    `;
  }

  const equipmentJobs = sortedJobs.filter((job) => job.jobType === "내 장비 작업");
  const dispatchJobs = sortedJobs.filter((job) => job.jobType === "배차 작업");

  const getSupplyAmount = (job) => (job.jobType === "내 장비 작업" ? Number(job.salesAmount || 0) : Number(job.payoutAmount || 0));
  const getVatAmount = (supplyAmount) => Math.round(supplyAmount * 0.1);

  const getSectionTotals = (jobs) => jobs.reduce((acc, job) => {
    const supply = getSupplyAmount(job);
    const vat = getVatAmount(supply);
    acc.supply += supply;
    acc.vat += vat;
    acc.total += supply + vat;
    return acc;
  }, { supply: 0, vat: 0, total: 0 });

  const buildSectionRows = (jobs) => jobs.map((job) => {
    const supplyAmount = getSupplyAmount(job);
    const vatAmount = getVatAmount(supplyAmount);
    const totalAmount = supplyAmount + vatAmount;

    return `
      <tr class="statement-row">
        <td class="date-cell">${escapeHtml(job.date || "")}</td>
        <td class="site-cell">${escapeHtml(job.siteName || "현장 미입력")}</td>
        <td class="work-cell">${escapeHtml(job.workContent || "작업내용 없음")}</td>
        <td class="amount-cell">${escapeHtml(formatCurrency(supplyAmount))}</td>
        <td class="amount-cell">${escapeHtml(formatCurrency(vatAmount))}</td>
        <td class="amount-cell">${escapeHtml(formatCurrency(totalAmount))}</td>
      </tr>
    `;
  }).join("");

  const buildSectionHtml = (title, jobs, emptyLabel, subtotalLabel) => {
    const totals = getSectionTotals(jobs);
    const rows = buildSectionRows(jobs);

    return `
      <section class="statement-section-block">
        <h3 class="statement-section-title">■ ${escapeHtml(title)}</h3>
        ${rows ? `
          <table class="settlement-a4-table">
            <colgroup>
              <col style="width:14%" />
              <col style="width:21%" />
              <col style="width:25%" />
              <col style="width:14%" />
              <col style="width:12%" />
              <col style="width:14%" />
            </colgroup>
            <thead>
              <tr>
                <th>날짜</th>
                <th>현장명</th>
                <th>작업내용</th>
                <th>공급가액</th>
                <th>부가세</th>
                <th>합계금액</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        ` : `<p class="statement-empty-note">${escapeHtml(emptyLabel)}</p>`}

        <div class="statement-subtotal-box">
          <div class="statement-subtotal-title">${escapeHtml(subtotalLabel)}</div>
          <div><span>공급가액</span><strong>${escapeHtml(formatCurrency(totals.supply))}</strong></div>
          <div><span>부가세</span><strong>${escapeHtml(formatCurrency(totals.vat))}</strong></div>
          <div><span>합계금액</span><strong>${escapeHtml(formatCurrency(totals.total))}</strong></div>
        </div>
      </section>
    `;
  };

  const equipmentTotals = getSectionTotals(equipmentJobs);
  const dispatchTotals = getSectionTotals(dispatchJobs);
  const settlementNetSupply = equipmentTotals.supply - dispatchTotals.supply;
  const settlementVat = Math.round(settlementNetSupply * 0.1);
  const settlementFinalTotal = settlementNetSupply + settlementVat;

  return `
      <div class="report-scale-wrapper">
        <article class="report-document settlement-a4-document" aria-label="거래내역서 A4 문서">
          <header class="statement-header">
            <h2>거래내역서</h2>
            <div class="statement-meta">
              <div>발행일자: ${escapeHtml(issueDate)}</div>
              <div>조회기간: ${escapeHtml(periodLabel)}</div>
            </div>
          </header>

          <section class="statement-parties">
            <div class="statement-party-box">
              <h3>공급자 정보</h3>
              <div>상호: ${escapeHtml(companyInfo.companyName || "-")}</div>
              <div>대표자: ${escapeHtml(companyInfo.representativeName || "-")}</div>
              <div>연락처: ${escapeHtml(companyInfo.phone || "-")}</div>
              <div>사업자번호: ${escapeHtml(companyInfo.businessNumber || "-")}</div>
              <div>주소: ${escapeHtml(companyInfo.address || "-")}</div>
            </div>
            <div class="statement-party-box">
              <h3>공급받는 자 정보</h3>
              <div>거래처명: ${escapeHtml(customerName || "-")}</div>
              <div>대표자/담당자: ${escapeHtml(customerRepresentative)}</div>
              <div>연락처: ${escapeHtml(customerPhone)}</div>
              <div>사업자번호: ${escapeHtml(customerBusinessNumber)}</div>
              <div>주소: ${escapeHtml(customerAddress)}</div>
            </div>
          </section>

          ${buildSectionHtml("내 장비 작업", equipmentJobs, "내 장비 작업 없음", "내 장비 소계")}
          ${buildSectionHtml("배차 작업", dispatchJobs, "배차 작업 없음", "배차 소계")}

          <footer class="statement-total-box">
            <div class="statement-total-title">■ 정산 합계</div>
            <div><span>순 공급가액</span><strong>${escapeHtml(formatCurrency(settlementNetSupply))}</strong></div>
            <div><span>부가세</span><strong>${escapeHtml(formatCurrency(settlementVat))}</strong></div>
            <div><span>최종 합계</span><strong>${escapeHtml(formatCurrency(settlementFinalTotal))}</strong></div>
          </footer>
        </article>
      </div>
  `;
}

function updateSettlementStatementPreviewScale() {
  const viewport = document.querySelector("#settlementStatementContent.report-preview-scroll");
  const scaleWrap = document.querySelector("#settlementStatementContent .report-scale-wrapper");
  const documentNode = document.querySelector("#settlementStatementContent .report-document");
  if (!viewport || !scaleWrap || !documentNode) return;

  documentNode.style.transform = "scale(1)";
  const availableWidth = Math.max(viewport.clientWidth - 4, 320);
  const documentWidth = documentNode.offsetWidth || 1;
  const scale = Math.min(1, availableWidth / documentWidth);

  documentNode.style.transformOrigin = "top center";
  documentNode.style.transform = `scale(${scale})`;

  const scaledHeight = Math.ceil(documentNode.scrollHeight * scale);
  scaleWrap.style.height = `${Math.max(320, scaledHeight)}px`;
}

function refreshSettlementStatementIfOpen() {
  const modal = document.getElementById("settlementStatementModal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (!currentSettlementReport || !Array.isArray(currentSettlementReport.jobs) || currentSettlementReport.jobs.length === 0) {
    closeSettlementStatement();
    return;
  }

  document.getElementById("settlementStatementContent").innerHTML = buildSettlementStatementHtml(currentSettlementReport);
  updateSettlementStatementPreviewScale();
}

function getSettlementPeriodLabel(report) {
  return report.filters.period === "custom"
    ? `${report.filters.range?.startKey || ""}${report.filters.range?.startKey && report.filters.range?.endKey ? " ~ " : ""}${report.filters.range?.endKey || ""}`
    : (report.filters.period === "this-month" ? "이번 달" : report.filters.period === "last-month" ? "지난 달" : report.filters.period === "this-year" ? "올해" : report.filters.period === "all" ? "전체" : "기간 선택");
}

function getSettlementFileMonth(report) {
  if (report.filters.period === "custom" && report.filters.range?.startKey) {
    return report.filters.range.startKey.slice(0, 7);
  }
  return getCurrentMonth();
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function getSettlementPdfFileName(report) {
  const selectedCustomer = state.customers.find((customer) => customer.id === report.filters.customerId);
  const customerName = sanitizeFileNamePart(selectedCustomer?.name || report.filters.customerName || "거래처");
  const monthPart = sanitizeFileNamePart(getSettlementFileMonth(report));
  return `거래내역서_${customerName || "거래처"}_${monthPart || getCurrentMonth()}.pdf`;
}

function ensureJsPdfReady() {
  const jsPdfApi = window.jspdf?.jsPDF;
  if (!jsPdfApi) {
    throw new Error("jsPDF를 불러오지 못했습니다.");
  }
  return jsPdfApi;
}

function ensureHtml2CanvasReady() {
  if (!window.html2canvas) {
    throw new Error("html2canvas를 불러오지 못했습니다.");
  }
  return window.html2canvas;
}

async function createSettlementPdfDocument(report) {
  const jsPDF = ensureJsPdfReady();
  const html2canvas = ensureHtml2CanvasReady();
  const documentNode = document.querySelector("#settlementStatementContent .report-document");
  if (!documentNode) {
    throw new Error("거래내역서 문서를 찾지 못했습니다.");
  }
  const captureHost = document.createElement("div");
  captureHost.style.position = "fixed";
  captureHost.style.left = "-10000px";
  captureHost.style.top = "0";
  captureHost.style.background = "#ffffff";
  captureHost.style.padding = "0";
  captureHost.style.margin = "0";
  captureHost.style.zIndex = "-1";

  const captureNode = documentNode.cloneNode(true);
  captureNode.style.transform = "none";
  captureNode.style.transformOrigin = "top left";
  captureNode.style.width = "210mm";
  captureNode.style.minHeight = "297mm";
  captureNode.style.height = "auto";
  captureNode.style.margin = "0";
  captureNode.style.border = "none";
  captureNode.style.boxShadow = "none";
  captureNode.style.overflow = "visible";

  captureHost.appendChild(captureNode);
  document.body.appendChild(captureHost);

  let canvas;
  try {
    canvas = await html2canvas(captureNode, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });
  } finally {
    captureHost.remove();
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfWidth = 210;
  const pdfHeight = 297;
  const imageHeight = (canvas.height * pdfWidth) / canvas.width;

  if (imageHeight <= pdfHeight + 1.5) {
    const imgData = canvas.toDataURL("image/png");
    doc.addImage(imgData, "PNG", 0, 0, pdfWidth, Math.min(imageHeight, pdfHeight));
    return { doc, fileName: getSettlementPdfFileName(report) };
  }

  const pxPerMm = canvas.width / pdfWidth;
  const pageSliceHeightPx = Math.max(1, Math.floor(pdfHeight * pxPerMm));
  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height - 0.5) {
    const remaining = canvas.height - offsetY;
    const sliceHeight = Math.min(pageSliceHeightPx, remaining);
    if (sliceHeight <= 0) break;
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) {
      throw new Error("PDF 캡처를 위한 캔버스 컨텍스트를 생성하지 못했습니다.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    if (pageIndex > 0) {
      doc.addPage("a4", "portrait");
    }

    const renderHeightMm = sliceHeight / pxPerMm;
    doc.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pdfWidth, renderHeightMm);

    offsetY += sliceHeight;
    pageIndex += 1;
  }

  return { doc, fileName: getSettlementPdfFileName(report) };
}

async function downloadSettlementPdf() {
  if (!currentSettlementReport || currentSettlementReport.jobs.length === 0) {
    showToast("선택한 조건의 작업이 없어 저장할 수 없습니다.");
    return;
  }

  try {
    const { doc, fileName } = await createSettlementPdfDocument(currentSettlementReport);
    doc.save(fileName);
    showToast("PDF 파일을 저장했습니다.");
  } catch (error) {
    console.error(error);
    showToast("PDF 저장에 실패했습니다.");
  }
}

function openSettlementStatement() {
  if (!currentSettlementReport || currentSettlementReport.jobs.length === 0) {
    showToast("선택한 조건의 작업이 없어 출력할 수 없습니다.");
    return;
  }

  const content = buildSettlementStatementHtml(currentSettlementReport);
  document.getElementById("settlementStatementContent").innerHTML = content;
  document.getElementById("settlementStatementModal").classList.remove("hidden");
  document.getElementById("settlementStatementModal").setAttribute("aria-hidden", "false");
  updateSettlementStatementPreviewScale();
}

function closeSettlementStatement() {
  document.body.classList.remove("print-settlement");
  document.getElementById("settlementStatementModal").classList.add("hidden");
  document.getElementById("settlementStatementModal").setAttribute("aria-hidden", "true");
}

function printSettlementStatement() {
  document.body.classList.add("print-settlement");
  const cleanup = () => document.body.classList.remove("print-settlement");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 1000);
}

function bindExpenseForm() {
  const form = document.getElementById("expenseForm");
  if (!form) return;
  const cancelEditButton = document.getElementById("expenseEditCancelBtn");

  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", () => {
      resetExpenseFormToCreateMode();
      showToast("지출 수정을 취소했습니다.");
    });
  }

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

    const existingExpense = editingExpenseId
      ? state.expenses.find((expense) => expense.id === editingExpenseId)
      : null;

    const record = {
      id: existingExpense ? existingExpense.id : createId("expense"),
      date,
      category,
      amount,
      memo,
      createdAt: existingExpense ? (existingExpense.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    if (existingExpense) {
      const index = state.expenses.findIndex((expense) => expense.id === existingExpense.id);
      if (index === -1) {
        showToast("수정할 지출을 찾지 못했습니다.");
        resetExpenseFormToCreateMode();
        return;
      }
      state.expenses[index] = record;
    } else {
      state.expenses.unshift(record);
    }

    saveState();
    renderAll();
    resetExpenseFormToCreateMode();
    showToast(existingExpense ? "지출이 수정되었습니다." : "지출이 저장되었습니다.");
  });
}

function setExpenseFormMode(isEditMode) {
  const title = document.getElementById("expenseFormTitle");
  const submitButton = document.getElementById("expenseSubmitBtn");
  const cancelButton = document.getElementById("expenseEditCancelBtn");

  if (title) title.textContent = isEditMode ? "지출 수정" : "지출 등록";
  if (submitButton) submitButton.textContent = isEditMode ? "수정 완료" : "지출 저장";
  if (cancelButton) cancelButton.classList.toggle("hidden", !isEditMode);
}

function resetExpenseFormToCreateMode() {
  const form = document.getElementById("expenseForm");
  editingExpenseId = null;
  if (form) form.reset();
  const dateField = document.getElementById("expenseDate");
  if (dateField) dateField.value = getToday();
  setExpenseFormMode(false);
}

function startExpenseEdit(expense) {
  if (!expense) return;
  editingExpenseId = expense.id;
  setView("expenses");
  document.getElementById("expenseDate").value = expense.date || getToday();
  document.getElementById("expenseCategory").value = expense.category || "기타";
  document.getElementById("expenseAmount").value = Number(expense.amount || 0) || "";
  document.getElementById("expenseMemo").value = expense.memo || "";
  setExpenseFormMode(true);
  document.getElementById("expenseAmount").focus();
}

function renderExpensesView() {
  const expenseSummary = document.getElementById("expenseSummary");
  const expenseList = document.getElementById("expenseList");
  if (!expenseSummary || !expenseList) return;

  updateExpensePeriodUI();

  const targetMonth = getSelectedExpenseMonth();
  const filteredExpenses = state.expenses
    .filter((expense) => String(expense.date || "").startsWith(targetMonth));

  const sortedExpenses = filteredExpenses
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const totalExpense = sortedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  expenseSummary.innerHTML = [
    { title: "총 지출", value: formatCurrency(totalExpense) },
    { title: "등록 건수", value: `${sortedExpenses.length}건` }
  ].map((item) => `
    <div class="metric-card">
      <h4>${escapeHtml(item.title)}</h4>
      <strong>${escapeHtml(item.value)}</strong>
    </div>
  `).join("");

  expenseList.innerHTML = sortedExpenses.length
    ? sortedExpenses.map((expense) => `
      <article class="list-item expense-list-item">
        <div class="expense-item-main">
          <div class="expense-item-top">
            <strong>${escapeHtml(expense.category || "기타")}</strong>
            <span class="expense-amount">${escapeHtml(formatCurrency(expense.amount))}</span>
          </div>
          <p>${escapeHtml(expense.date || "-")} · ${escapeHtml(expense.memo || "내용 없음")}</p>
        </div>
        <div class="job-card-actions expense-card-actions">
          <button class="tiny-btn" data-action="edit-expense" data-id="${escapeHtml(expense.id)}">수정</button>
          <button class="tiny-btn danger" data-action="delete-expense" data-id="${escapeHtml(expense.id)}">삭제</button>
        </div>
      </article>
    `).join("")
    : '<p class="muted">등록된 지출이 없습니다.</p>';
}

function openDeleteExpenseModal(expenseId) {
  const expense = state.expenses.find((item) => item.id === expenseId);
  if (!expense) {
    showToast("삭제할 지출을 찾지 못했습니다.");
    return;
  }
  pendingDeleteExpenseId = expenseId;
  const modal = document.getElementById("deleteExpenseModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteExpenseModal() {
  pendingDeleteExpenseId = null;
  const modal = document.getElementById("deleteExpenseModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function confirmDeleteExpense() {
  if (!pendingDeleteExpenseId) {
    closeDeleteExpenseModal();
    return;
  }

  const expenseIdToDelete = pendingDeleteExpenseId;
  closeDeleteExpenseModal();
  state.expenses = state.expenses.filter((expense) => expense.id !== expenseIdToDelete);
  if (editingExpenseId === expenseIdToDelete) {
    resetExpenseFormToCreateMode();
  }
  saveState();
  renderAll();
  showToast("지출이 삭제되었습니다.");
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

function openDeleteJobModal(jobId) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    showToast("삭제할 작업을 찾지 못했습니다.");
    return;
  }
  pendingDeleteJobId = jobId;
  const modal = document.getElementById("deleteJobModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDeleteJobModal() {
  pendingDeleteJobId = null;
  const modal = document.getElementById("deleteJobModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function confirmDeleteJob() {
  if (!pendingDeleteJobId) {
    closeDeleteJobModal();
    return;
  }

  const jobIdToDelete = pendingDeleteJobId;
  closeDeleteJobModal();
  state.jobs = state.jobs.filter((job) => job.id !== jobIdToDelete);
  saveState();
  renderAll();
  showToast("작업이 삭제되었습니다.");
}

function printInvoice() {
  window.print();
}

function getCalendarMonthContext() {
  return {
    currentCalendarYear: calendarViewDate.getFullYear(),
    currentCalendarMonth: calendarViewDate.getMonth()
  };
}

function getVisibleJobs() {
  if (selectedCalendarDate) {
    return state.jobs.filter((job) => job.date === selectedCalendarDate);
  }

  const { currentCalendarYear, currentCalendarMonth } = getCalendarMonthContext();

  const monthlyJobs = state.jobs.filter((job) => {
    if (!job.date) return false;
    const [jobYear, jobMonth] = job.date.split("-").map(Number);
    return jobYear === currentCalendarYear && jobMonth === currentCalendarMonth + 1;
  });

  return monthlyJobs;
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
    summary.innerHTML = `<div class="calendar-summary-card"><div><p class="muted">${escapeHtml(monthLabel)} 전체 작업</p><strong>현재 월 작업</strong></div></div>`;
  }

  const showAllJobsButton = document.querySelector('[data-action="show-all-jobs"]');
  if (showAllJobsButton) {
    showAllJobsButton.textContent = `${monthLabel} 전체 작업`;
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
          <button class="tiny-btn" data-action="edit" data-id="${escapeHtml(job.id)}">수정</button>
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

  if (action === "toggle-outstanding-details") {
    isSettlementOutstandingOpen = !isSettlementOutstandingOpen;
    renderSettlementView();
    return;
  }

  if (action === "toggle-expense-details") {
    isSettlementExpenseOpen = !isSettlementExpenseOpen;
    renderSettlementView();
    return;
  }

  if (action === "edit") {
    const job = state.jobs.find((item) => item.id === id);
    if (!job) {
      showToast("수정할 작업을 찾지 못했습니다.");
      return;
    }
    startJobEdit(job);
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
    selectedCalendarDate = null;
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
    renderCalendarView();
    renderJobList();
    return;
  }

  if (action === "calendar-next") {
    selectedCalendarDate = null;
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
    renderCalendarView();
    renderJobList();
    return;
  }

  if (action === "show-all-jobs") {
    selectedCalendarDate = null;
    renderCalendarView();
    renderJobList();
    return;
  }

  if (action === "delete") {
    openDeleteJobModal(id);
    return;
  }

  if (action === "edit-expense") {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense) {
      showToast("수정할 지출을 찾지 못했습니다.");
      return;
    }
    startExpenseEdit(expense);
    return;
  }

  if (action === "delete-expense") {
    openDeleteExpenseModal(id);
    return;
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
  renderExpensesView();
  renderCustomersView();
  renderSettlementView();
  refreshSettlementStatementIfOpen();
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
  bindSettingsCards();
  bindSettingsForm();
  bindCustomerForms();
  bindExpenseForm();
  document.addEventListener("click", handleListActions);
  document.getElementById("backupBtn").addEventListener("click", exportBackup);
  document.getElementById("exportBtn").addEventListener("click", exportBackup);
  document.getElementById("importFile").addEventListener("change", importBackup);
  document.getElementById("closeInvoiceBtn").addEventListener("click", closeInvoice);
  document.getElementById("settlementStatementBtn").addEventListener("click", openSettlementStatement);
  document.getElementById("closeReportBtn").addEventListener("click", closeSettlementStatement);
  document.getElementById("savePdfBtn").addEventListener("click", downloadSettlementPdf);
  document.getElementById("printReportBtn").addEventListener("click", printSettlementStatement);
  document.getElementById("settlementStatementModal").addEventListener("click", (event) => {
    if (event.target.id === "settlementStatementModal") closeSettlementStatement();
  });
  window.addEventListener("resize", () => {
    updateSettlementStatementPreviewScale();
  });
  document.getElementById("backToMainBtn").addEventListener("click", () => {
    closeInvoice();
    setView("jobs");
  });
  document.getElementById("printInvoiceBtn").addEventListener("click", printInvoice);
  document.getElementById("downloadInvoiceBtn").addEventListener("click", downloadInvoice);
  document.getElementById("cancelDeleteJobBtn").addEventListener("click", closeDeleteJobModal);
  document.getElementById("confirmDeleteJobBtn").addEventListener("click", confirmDeleteJob);
  document.getElementById("deleteJobModal").addEventListener("click", (event) => {
    if (event.target.id === "deleteJobModal") closeDeleteJobModal();
  });
  document.getElementById("cancelDeleteExpenseBtn").addEventListener("click", closeDeleteExpenseModal);
  document.getElementById("confirmDeleteExpenseBtn").addEventListener("click", confirmDeleteExpense);
  document.getElementById("deleteExpenseModal").addEventListener("click", (event) => {
    if (event.target.id === "deleteExpenseModal") closeDeleteExpenseModal();
  });
  document.getElementById("invoiceModal").addEventListener("click", (event) => {
    if (event.target.id === "invoiceModal") closeInvoice();
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSettlementPeriod = button.dataset.period;
      renderSettlementView();
    });
  });

  document.querySelectorAll("[data-expense-period]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedExpensePeriod = button.dataset.expensePeriod || "this-month";
      renderExpensesView();
    });
  });

  const expenseFilterMonthInput = document.getElementById("expenseFilterMonth");
  if (expenseFilterMonthInput) {
    if (!expenseFilterMonthInput.value) {
      expenseFilterMonthInput.value = getCurrentMonth();
    }

    expenseFilterMonthInput.addEventListener("change", () => {
      if (selectedExpensePeriod !== "custom") {
        selectedExpensePeriod = "custom";
      }
      renderExpensesView();
    });
  }

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
  resetExpenseFormToCreateMode();
  toggleCustomerQuickAdd(false);
  setJobFormMode(false);
  populateSettingsForm();
  showSettingsSection("company");
  renderAll();
  setView("dashboard");
  registerServiceWorker();
});
