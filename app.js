const STORAGE_KEY = "alSafwaFactorySystem.v1";
const SESSION_KEY = "alSafwaFactorySystem.currentUser";
const LAST_SAVED_KEY = "alSafwaFactorySystem.lastSavedAt";
const FACTORY_MAPS_URL = "https://maps.app.goo.gl/q6fX5HjU9tsyyLNz6?g_st=ic";

const defaultUsers = [
  { id: "admin-fathy", name: "فتحي عبدالستار", email: "fathy@alsafwa.local", password: "123456", addedBy: "النظام" },
  { id: "admin-yair", name: "ياسر ناصف", email: "yair@alsafwa.local", password: "123456", addedBy: "النظام" }
];

const systemUser = { id: "system", name: "النظام", email: "system@alsafwa.local" };

const seedData = {
  stones: [
    { id: crypto.randomUUID(), name: "رخام جلالة", color: "بيج كريمي مع عروق ذهبية", quantity: 1240, price: 750, location: "عنبر A1", notes: "مناسب للمطابخ والحوائط", pattern: "vein", createdBy: systemUser, updatedBy: systemUser },
    { id: crypto.randomUUID(), name: "جرانيت أسود أسوان", color: "أسود منقط بلورات رمادية", quantity: 215, price: 1200, location: "عنبر B2", notes: "قوة تحمل عالية للسلالم", pattern: "dark", createdBy: systemUser, updatedBy: systemUser },
    { id: crypto.randomUUID(), name: "رخام كرارا إيطالي", color: "أبيض ناعم بعروق كلاسيكية", quantity: 285, price: 2450, location: "عنبر C1", notes: "خامة فاخرة للواجهات", pattern: "white", createdBy: systemUser, updatedBy: systemUser },
    { id: crypto.randomUUID(), name: "جرانيت أحمر أسواني", color: "أحمر داكن بحبيبات سوداء", quantity: 540, price: 950, location: "عنبر C3", notes: "مناسب للأرضيات الخارجية", pattern: "red", createdBy: systemUser, updatedBy: systemUser }
  ],
  invoices: [],
  factoryReports: [],
  users: defaultUsers,
  calculatorHistory: []
};

let state = loadState();
let editingStoneId = null;
let currentUser = loadCurrentUser();
let remoteStorageReady = false;
let cloudStorageReady = false;
let calculatorExpression = "";

const views = {
  dashboard: document.querySelector("#dashboardView"),
  inventory: document.querySelector("#inventoryView"),
  sales: document.querySelector("#salesView"),
  invoices: document.querySelector("#invoicesView"),
  reports: document.querySelector("#reportsView"),
  factoryReports: document.querySelector("#factoryReportsView"),
  calculator: document.querySelector("#calculatorView"),
  users: document.querySelector("#usersView")
};

const titles = {
  dashboard: "الرئيسية",
  inventory: "إدارة المخزون",
  sales: "إنشاء فاتورة جديدة",
  invoices: "الفواتير القديمة",
  reports: "التقارير",
  factoryReports: "تقارير المصنع",
  calculator: "حاسبة القياسات",
  users: "إدارة المستخدمين"
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seedData);
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return structuredClone(seedData);
  }
}

function normalizeState(parsed) {
  const users = parsed.users?.length ? parsed.users : structuredClone(defaultUsers);
  users.forEach(user => {
    if (user.id === "admin-yair" || user.email?.toLowerCase() === "yair@alsafwa.local") {
      user.name = "ياسر ناصف";
    }
  });
  const stones = (parsed.stones || []).map(stone => ({
    ...stone,
    linearPrice: Number(stone.linearPrice || stone.price || 0),
    piecePrice: Number(stone.piecePrice || 0),
    thickness: Number(stone.thickness || 0),
    length: Number(stone.length || 0),
    width: Number(stone.width || 0),
    createdBy: stone.createdBy || systemUser,
    updatedBy: stone.updatedBy || stone.createdBy || systemUser
  }));
  const invoices = (parsed.invoices || []).map(invoice => normalizeInvoice(invoice));
  const calculatorHistory = Array.isArray(parsed.calculatorHistory) ? parsed.calculatorHistory.slice(0, 8) : [];
  const factoryReports = (parsed.factoryReports || []).map(report => ({
    ...report,
    amount: Number(report.amount || 0),
    createdBy: report.createdBy || systemUser
  }));
  return { stones, invoices, factoryReports, users, calculatorHistory };
}

function normalizeInvoice(invoice) {
  const legacyItem = invoice.stoneId ? [{
    stoneId: invoice.stoneId,
    stoneName: invoice.stoneName,
    meters: Number(invoice.meters || 0),
    unitPrice: Number(invoice.unitPrice || 0),
    total: Number(invoice.total || 0)
  }] : [];
  const items = Array.isArray(invoice.items) && invoice.items.length ? invoice.items : legacyItem;
  const normalizedItems = items.map(item => ({
    stoneId: item.stoneId,
    stoneName: item.stoneName,
    calculationType: item.calculationType || "square",
    meters: Number(item.meters || 0),
    quantity: Number(item.quantity || item.meters || 0),
    length: Number(item.length || 0),
    width: Number(item.width || 0),
    thickness: Number(item.thickness || 0),
    baseWidth: Number(item.baseWidth || 60),
    multiplier: Number(item.multiplier || 1),
    factor: Number(item.factor || 1),
    stockImpact: Number(item.stockImpact || item.meters || 0),
    unitPrice: Number(item.unitPrice || 0),
    total: Number(item.total || (Number(item.meters || 0) * Number(item.unitPrice || 0)))
  }));
  const total = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const metersTotal = normalizedItems.reduce((sum, item) => sum + Number(item.stockImpact || item.meters || 0), 0);
  return {
    ...invoice,
    items: normalizedItems,
    stoneId: normalizedItems[0]?.stoneId || invoice.stoneId,
    stoneName: normalizedItems.map(item => item.stoneName).join("، ") || invoice.stoneName,
    meters: metersTotal || Number(invoice.meters || 0),
    unitPrice: normalizedItems.length === 1 ? normalizedItems[0].unitPrice : Number(invoice.unitPrice || 0),
    total: total || Number(invoice.total || 0),
    paymentMethod: invoice.paymentMethod || (invoice.paymentStatus === "unpaid" ? "" : "cash"),
    createdBy: invoice.createdBy || systemUser
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(LAST_SAVED_KEY, new Date().toISOString());
  if (cloudStorageReady) saveStateSupabase();
  else if (remoteStorageReady) saveStateRemote();
}

async function loadStateRemote() {
  if (await loadStateSupabase()) return true;
  if (location.protocol === "file:") return false;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return false;
    state = normalizeState(await response.json());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    currentUser = loadCurrentUser();
    remoteStorageReady = true;
    return true;
  } catch {
    return false;
  }
}

function getSupabaseConfig() {
  const config = window.SAFWA_SUPABASE || {};
  const url = String(config.url || "").replace(/\/$/, "");
  const anonKey = String(config.anonKey || "");
  return { url, anonKey };
}

function hasSupabaseConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return url.startsWith("https://") && anonKey.length > 20;
}

function supabaseHeaders() {
  const { anonKey } = getSupabaseConfig();
  const headers = {
    apikey: anonKey,
    "Content-Type": "application/json"
  };
  if (!anonKey.startsWith("sb_publishable_")) {
    headers.Authorization = `Bearer ${anonKey}`;
  }
  return headers;
}

async function loadStateSupabase() {
  if (!hasSupabaseConfig()) return false;
  const { url } = getSupabaseConfig();
  try {
    const response = await fetch(`${url}/rest/v1/app_state?id=eq.main&select=data`, {
      headers: supabaseHeaders(),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Supabase read failed");
    const rows = await response.json();
    if (rows[0]?.data) {
      state = normalizeState(rows[0].data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      await createStateSupabase();
    }
    currentUser = loadCurrentUser();
    cloudStorageReady = true;
    return true;
  } catch {
    showToast("تعذر الاتصال بقاعدة البيانات السحابية");
    return false;
  }
}

async function createStateSupabase() {
  const { url } = getSupabaseConfig();
  await fetch(`${url}/rest/v1/app_state`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({ id: "main", data: state })
  });
}

async function saveStateSupabase() {
  const { url } = getSupabaseConfig();
  try {
    let response = await fetch(`${url}/rest/v1/app_state?id=eq.main`, {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({ data: state, updated_at: new Date().toISOString() })
    });
    if (response.status === 404 || response.status === 406) {
      response = await fetch(`${url}/rest/v1/app_state`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({ id: "main", data: state })
      });
    }
    if (!response.ok) throw new Error("Supabase save failed");
  } catch {
    showToast("تعذر الحفظ السحابي مؤقتًا");
  }
}

async function saveStateRemote() {
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
  } catch {
    showToast("تعذر الحفظ على السيرفر مؤقتًا، تم الحفظ على الجهاز");
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    /* Some browsers do not allow persistent storage on local files. localStorage still keeps the data. */
  }
}

function loadCurrentUser() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    const user = JSON.parse(saved);
    return state.users.find(item => item.id === user.id) || null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : systemUser;
}

function userLabel(user) {
  return user?.name || "غير محدد";
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function money(value) {
  return `${formatNumber(value, 2)} ج.م`;
}

function meters(value) {
  return `${formatNumber(value, 2, true)} م²`;
}

function invoiceCalculationLabel(type) {
  return {
    square: "متر مربع",
    linear: "متر طولي",
    piece: "قطعة"
  }[type] || "متر مربع";
}

function itemMeasureLabel(item) {
  const type = item.calculationType || "square";
  const value = formatNumber(item.meters || item.quantity || 0, 2, true);
  if (type === "linear") return `${value} متر طولي`;
  if (type === "piece") return `${value} قطعة`;
  return `${value} م²`;
}

function itemPriceLabel(item) {
  return `${money(item.unitPrice)} / ${invoiceCalculationLabel(item.calculationType)}`;
}

function formatNumber(value, digits = 0, trimZeros = false) {
  const number = Number(value || 0);
  const fixed = number.toFixed(digits);
  return trimZeros ? fixed.replace(/\.?0+$/, "") : fixed;
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  const options = withTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { year: "numeric", month: "2-digit", day: "2-digit" };
  return date.toLocaleString("en-GB", options).replace(",", "");
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function paymentLabel(status) {
  return { paid: "مدفوع بالكامل", deposit: "دفع عربون", unpaid: "لم يتم الدفع" }[status] || status;
}

function paymentMethodLabel(method) {
  return {
    cash: "نقدي",
    vodafone_cash: "فودافون كاش",
    instapay: "إنستا باي",
    bank_transfer: "تحويل بنكي"
  }[method] || "غير محدد";
}

function factoryReportTypeLabel(type) {
  return {
    maintenance: "صيانة",
    withdrawal: "سحب من الحساب",
    expense: "مصروف تشغيل",
    purchase: "شراء للمصنع",
    utilities: "كهرباء / مياه / مرافق",
    other: "أخرى"
  }[type] || "أخرى";
}

function factoryReportSourceLabel(source) {
  return {
    cash: "الخزنة / نقدي",
    bank: "الحساب البنكي",
    vodafone_cash: "فودافون كاش",
    instapay: "إنستا باي",
    other: "أخرى"
  }[source] || "غير محدد";
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 1000);
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function toCsv(rows) {
  return rows.map(row => row.map(csvValue).join(",")).join("\n");
}

function showAppForUser() {
  document.body.classList.toggle("login-mode", !currentUser);
  document.querySelector("#loginScreen").classList.toggle("hidden-app", Boolean(currentUser));
  document.querySelector("#appShell").classList.toggle("hidden-app", !currentUser);
  document.querySelector("#currentUserChip").textContent = currentUser ? `داخل باسم: ${currentUser.name}` : "";
}

function navigate(viewName) {
  Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
  document.querySelector("#pageTitle").textContent = titles[viewName];
  renderAll();
}

function stats() {
  const now = new Date();
  const today = todayKey(now);
  const month = monthKey(now);
  const todaysInvoices = state.invoices.filter(inv => inv.date.startsWith(today));
  const monthlyInvoices = state.invoices.filter(inv => inv.date.startsWith(month));
  const totalStock = state.stones.reduce((sum, stone) => sum + Number(stone.quantity), 0);
  const totalSales = state.invoices.reduce((sum, inv) => sum + inv.total, 0);
  const paidTotal = state.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const topStone = getTopStone();
  return {
    totalStock,
    totalSales,
    paidTotal,
    todaySales: todaysInvoices.reduce((sum, inv) => sum + inv.total, 0),
    monthSales: monthlyInvoices.reduce((sum, inv) => sum + inv.total, 0),
    invoiceCount: state.invoices.length,
    customers: new Set(state.invoices.map(inv => inv.phone)).size,
    topStone
  };
}

function getTopStone() {
  const totals = {};
  state.invoices.forEach(inv => {
    getInvoiceItems(inv).forEach(item => {
      totals[item.stoneName] = (totals[item.stoneName] || 0) + item.meters;
    });
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? `${sorted[0][0]} - ${meters(sorted[0][1])}` : "لا يوجد بيع بعد";
}

function getInvoiceItems(invoice) {
  if (Array.isArray(invoice.items) && invoice.items.length) return invoice.items;
  if (!invoice.stoneId) return [];
  return [{
    stoneId: invoice.stoneId,
    stoneName: invoice.stoneName,
    meters: Number(invoice.meters || 0),
    unitPrice: Number(invoice.unitPrice || 0),
    total: Number(invoice.total || 0)
  }];
}

function invoiceStoneNames(invoice) {
  return getInvoiceItems(invoice).map(item => item.stoneName).join("، ");
}

function renderStats(container, items) {
  container.innerHTML = items.map((item, index) => `
    <article class="stat-card stat-tone-${index % 4}" style="--delay: ${index * 90}ms">
      <div>
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
      <div class="stat-icon"><span class="material-symbols-outlined">${item.icon}</span></div>
    </article>
  `).join("");
}

function renderDashboard() {
  const data = stats();
  renderStats(document.querySelector("#dashboardStats"), [
    { label: "مبيعات اليوم", value: money(data.todaySales), icon: "today" },
    { label: "مبيعات الشهر", value: money(data.monthSales), icon: "calendar_month" },
    { label: "عدد العملاء", value: formatNumber(data.customers), icon: "groups" },
    { label: "عدد الخامات", value: formatNumber(state.stones.length), icon: "inventory_2" }
  ]);

  document.querySelector("#recentInvoices").innerHTML = state.invoices.slice(0, 6).map(inv => `
    <tr>
      <td>${inv.customerName}</td>
      <td>${invoiceStoneNames(inv)}</td>
      <td>${money(inv.total)}</td>
      <td><span class="pay-chip ${inv.paymentStatus}">${paymentLabel(inv.paymentStatus)}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="4">لا توجد فواتير حتى الآن.</td></tr>`;

  const lowStock = state.stones.filter(stone => stone.quantity <= 300);
  document.querySelector("#stockAlerts").innerHTML = lowStock.map(stone => `
    <div class="alert-item">
      <strong>${stone.name}</strong>
      <span class="stock-chip ${stone.quantity <= 0 ? "out" : "low"}">${stockText(stone.quantity)}</span>
    </div>
  `).join("") || `<div class="alert-item"><strong>الخامات مستقرة</strong><span>لا توجد تنبيهات حالية</span></div>`;
}

function stockClass(quantity) {
  if (quantity <= 0) return "out";
  if (quantity <= 300) return "low";
  return "ok";
}

function stockText(quantity) {
  if (quantity <= 0) return "نفد";
  if (quantity <= 300) return "منخفض";
  return "متوفر";
}

function renderInventory() {
  const query = document.querySelector("#inventorySearch").value.trim().toLowerCase();
  const stones = state.stones.filter(stone => [stone.name, stone.color, stone.location, stone.notes].join(" ").toLowerCase().includes(query));
  document.querySelector("#stoneGrid").innerHTML = stones.map(stone => `
    <article class="stone-card">
      <div class="stone-art ${stone.pattern || "vein"}"><span class="location-chip">${stone.location}</span></div>
      <div class="stone-body">
        <div class="stone-title">
          <div>
            <h3>${stone.name}</h3>
            <p>${stone.color}</p>
          </div>
          <span class="stock-chip ${stockClass(stone.quantity)}">${stockText(stone.quantity)}</span>
        </div>
        <div class="stone-meta">
          <div><p>متر مربع</p><strong>${money(stone.price)}</strong></div>
          <div><p>متر طولي</p><strong>${money(stone.linearPrice || stone.price)}</strong></div>
          <div><p>قطعة</p><strong>${stone.piecePrice ? money(stone.piecePrice) : "غير محدد"}</strong></div>
          <div><p>المقاس</p><strong>${stone.length || 0} × ${stone.width || 0} م</strong></div>
          <div><p>السمك</p><strong>${stone.thickness || 0} سم</strong></div>
        </div>
        <p class="stone-note">آخر تعديل بواسطة: ${userLabel(stone.updatedBy)}</p>
        <p class="stone-note">${stone.notes || "لا توجد ملاحظات"}</p>
        <div class="stone-actions">
          <button class="ghost-button" data-edit-stone="${stone.id}"><span class="material-symbols-outlined">edit</span>تعديل</button>
          <button class="primary-button" data-sell-stone="${stone.id}"><span class="material-symbols-outlined">receipt_long</span>بيع</button>
          <button class="danger-button" data-delete-stone="${stone.id}"><span class="material-symbols-outlined">delete</span>حذف</button>
        </div>
      </div>
    </article>
  `).join("") || `<section class="panel">لا توجد خامات مطابقة للبحث.</section>`;
}

function renderInvoiceStoneOptions() {
  const rows = document.querySelectorAll(".invoice-stone");
  rows.forEach(select => {
    const current = select.value;
    select.innerHTML = invoiceStoneOptions(current);
  });
  if (!rows.length) addInvoiceItem();
}

function invoiceStoneOptions(current = "") {
  return `<option value="">اختر النوع...</option>` + state.stones.map(stone => `
    <option value="${stone.id}" ${stone.id === current ? "selected" : ""}>${stone.name}</option>
  `).join("");
}

function addInvoiceItem(prefill = {}) {
  const container = document.querySelector("#invoiceItems");
  const row = document.createElement("article");
  row.className = "invoice-item";
  row.innerHTML = `
    <label>نوع الرخام / الجرانيت<select required class="invoice-stone">${invoiceStoneOptions(prefill.stoneId || "")}</select></label>
    <label>طريقة الحساب<select class="invoice-mode">
      <option value="square" ${(prefill.calculationType || "square") === "square" ? "selected" : ""}>متر مربع</option>
      <option value="linear" ${prefill.calculationType === "linear" ? "selected" : ""}>متر طولي</option>
      <option value="piece" ${prefill.calculationType === "piece" ? "selected" : ""}>قطعة</option>
    </select></label>
    <label class="invoice-quantity-field">الكمية<input required min="0.1" step="0.1" type="number" class="invoice-meters" placeholder="0.00" value="${prefill.meters || ""}" /></label>
    <label class="invoice-dimension-field">الطول بالمتر<input min="0" step="0.01" type="number" class="invoice-length" placeholder="0.00" value="${prefill.length || ""}" /></label>
    <label class="invoice-dimension-field">العرض بالمتر<input min="0" step="0.01" type="number" class="invoice-width" placeholder="0.00" value="${prefill.width || ""}" /></label>
    <label>السمك بالسم<input min="0" step="0.1" type="number" class="invoice-thickness" placeholder="0.00" value="${prefill.thickness || ""}" /></label>
    <label>سعر الوحدة<input required readonly min="0" step="0.01" type="number" class="invoice-price" placeholder="0.00" value="${prefill.unitPrice || ""}" /></label>
    <label class="invoice-linear-extra">العرض الأساسي سم<input min="1" step="0.1" type="number" class="invoice-base-width" value="${prefill.baseWidth || 60}" /></label>
    <label class="invoice-linear-extra">معامل الزيادة<input min="1" step="0.05" type="number" class="invoice-multiplier" value="${prefill.multiplier || 1.25}" /></label>
    <button class="icon-button remove-invoice-item close-x" type="button" title="حذف البند" aria-label="حذف البند">×</button>
    <div class="invoice-item-total"><span>إجمالي البند</span><strong>0.00 ج.م</strong></div>
  `;
  container.appendChild(row);
  syncInvoiceItemPrice(row);
  syncInvoiceItemMode(row);
  updateInvoiceSummary();
}

function syncInvoiceItemPrice(row) {
  const stone = state.stones.find(item => item.id === row.querySelector(".invoice-stone").value);
  const priceInput = row.querySelector(".invoice-price");
  const mode = row.querySelector(".invoice-mode")?.value || "square";
  const price = mode === "linear" ? (stone?.linearPrice || stone?.price || 0) : mode === "piece" ? (stone?.piecePrice || stone?.price || 0) : (stone?.price || 0);
  priceInput.value = stone ? Number(price || 0).toFixed(2) : "";
  if (stone) {
    if (!row.querySelector(".invoice-length").value && Number(stone.length || 0) > 0) row.querySelector(".invoice-length").value = stone.length;
    if (!row.querySelector(".invoice-width").value && Number(stone.width || 0) > 0) row.querySelector(".invoice-width").value = stone.width;
    if (!row.querySelector(".invoice-thickness").value && Number(stone.thickness || 0) > 0) row.querySelector(".invoice-thickness").value = stone.thickness;
  }
}

function syncInvoiceItemMode(row) {
  const mode = row.querySelector(".invoice-mode")?.value || "square";
  row.dataset.mode = mode;
  row.querySelector(".invoice-quantity-field").firstChild.textContent = mode === "piece" || mode === "linear" ? "عدد القطع" : "الأمتار أو عدد القطع";
  row.querySelectorAll(".invoice-linear-extra").forEach(field => field.classList.toggle("hidden", mode !== "linear"));
}

function calculateInvoiceItem(row) {
  const stone = state.stones.find(item => item.id === row.querySelector(".invoice-stone").value);
  if (!stone) return null;
  const calculationType = row.querySelector(".invoice-mode").value;
  const quantity = Number(row.querySelector(".invoice-meters").value || 0);
  const length = Number(row.querySelector(".invoice-length").value || 0);
  const width = Number(row.querySelector(".invoice-width").value || 0);
  const thickness = Number(row.querySelector(".invoice-thickness").value || 0);
  const baseWidth = Number(row.querySelector(".invoice-base-width").value || 60);
  const multiplier = Number(row.querySelector(".invoice-multiplier").value || 1.25);
  const unitPrice = Number(row.querySelector(".invoice-price").value || 0);
  let chargedQuantity = quantity;
  let factor = 1;
  if (calculationType === "square" && length > 0 && width > 0) chargedQuantity = Number((length * width * (quantity || 1)).toFixed(3));
  if (calculationType === "linear") {
    chargedQuantity = length > 0 ? length * (quantity || 1) : quantity;
    const widthCm = width > 0 && width <= 10 ? width * 100 : width;
    factor = widthCm > baseWidth ? Math.max(multiplier, 1) : 1;
  }
  return {
    stone,
    stoneId: stone.id,
    stoneName: stone.name,
    calculationType,
    quantity,
    length,
    width,
    thickness,
    baseWidth,
    multiplier,
    factor,
    meters: chargedQuantity,
    stockImpact: chargedQuantity,
    unitPrice,
    total: chargedQuantity * unitPrice * factor
  };
}

function clearInvoiceItems() {
  document.querySelector("#invoiceItems").innerHTML = "";
  addInvoiceItem();
}

function collectInvoiceItems() {
  return [...document.querySelectorAll(".invoice-item")].map(row => calculateInvoiceItem(row)).filter(Boolean);
}

function updateInvoiceSummary() {
  const form = document.querySelector("#invoiceForm");
  const items = collectInvoiceItems();
  const metersValue = items.reduce((sum, item) => sum + item.stockImpact, 0);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  document.querySelectorAll(".invoice-item").forEach(row => {
    const item = calculateInvoiceItem(row);
    row.querySelector(".invoice-item-total strong").textContent = money(item?.total || 0);
  });
  const status = new FormData(form).get("paymentStatus");
  const deposit = Number(form.deposit.value || 0);
  const paid = status === "paid" ? total : status === "deposit" ? Math.min(deposit, total) : 0;
  const remaining = Math.max(total - paid, 0);

  document.querySelector("#invoiceTotal").textContent = money(total);
  document.querySelector("#summaryMeters").textContent = formatNumber(metersValue, 2, true);
  document.querySelector("#summaryPrice").textContent = `${formatNumber(items.length)} نوع`;
  document.querySelector("#summaryPaid").textContent = money(paid);
  document.querySelector("#summaryRemaining").textContent = money(remaining);
  document.querySelector("#depositField").classList.toggle("hidden", status !== "deposit");
  document.querySelector("#paymentMethodField").classList.toggle("hidden", status === "unpaid");
}

function renderInvoices() {
  const query = document.querySelector("#invoiceSearch").value.trim().toLowerCase();
  const invoices = state.invoices.filter(inv => [inv.customerName, inv.phone, invoiceStoneNames(inv)].join(" ").toLowerCase().includes(query));
  document.querySelector("#invoiceTable").innerHTML = invoices.map(inv => `
    <tr>
      <td>#${inv.number}</td>
      <td>${formatDate(inv.date)}</td>
      <td>${inv.customerName}</td>
      <td>${inv.phone}</td>
      <td>${invoiceStoneNames(inv)}</td>
      <td>${formatNumber(inv.meters, 2, true)}</td>
      <td>${money(inv.total)}</td>
      <td><span class="pay-chip ${inv.paymentStatus}">${paymentLabel(inv.paymentStatus)}</span></td>
      <td>${userLabel(inv.createdBy)}</td>
      <td>
        <button class="ghost-button" data-view-invoice="${inv.id}"><span class="material-symbols-outlined">visibility</span>عرض</button>
        <button class="danger-button" data-delete-invoice="${inv.id}"><span class="material-symbols-outlined">delete</span>حذف</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="10">لا توجد فواتير مطابقة.</td></tr>`;
}

function renderReports() {
  const data = stats();
  const unpaid = state.invoices.filter(inv => inv.paymentStatus !== "paid").reduce((sum, inv) => sum + inv.remaining, 0);
  renderStats(document.querySelector("#reportsStats"), [
    { label: "إجمالي المبيعات", value: money(data.totalSales), icon: "payments" },
    { label: "المحصل فعليًا", value: money(data.paidTotal), icon: "price_check" },
    { label: "المتبقي على العملاء", value: money(unpaid), icon: "pending_actions" },
    { label: "أكثر نوع تم بيعه", value: data.topStone, icon: "workspace_premium" }
  ]);

  document.querySelector("#stockReport").innerHTML = state.stones.map(stone => `
    <tr><td>${stone.name}</td><td>${money(stone.quantity * stone.price)}</td></tr>
  `).join("");

  const customers = Object.values(state.invoices.reduce((acc, inv) => {
    const key = inv.phone || inv.customerName;
    if (!acc[key]) {
      acc[key] = {
        customerName: inv.customerName,
        phone: inv.phone,
        orders: new Set(),
        total: 0,
        paidAmount: 0,
        remaining: 0,
        statuses: new Set(),
        methods: new Set(),
        requests: []
      };
    }
    getInvoiceItems(inv).forEach(item => acc[key].orders.add(`${item.stoneName} (${itemMeasureLabel(item)})`));
    acc[key].total += Number(inv.total || 0);
    acc[key].paidAmount += Number(inv.paidAmount || 0);
    acc[key].remaining += Number(inv.remaining || 0);
    acc[key].statuses.add(paymentLabel(inv.paymentStatus));
    if (inv.paymentStatus !== "unpaid") acc[key].methods.add(paymentMethodLabel(inv.paymentMethod));
    acc[key].requests.push({
      number: inv.number,
      date: inv.date,
      details: inv.workDetails || "لا توجد ملاحظات مسجلة",
      items: invoiceStoneNames(inv)
    });
    return acc;
  }, {}));
  document.querySelector("#customerReport").innerHTML = customers.map(customer => `
    <div class="customer-item customer-card">
      <div class="customer-main">
        <strong>${customer.customerName}</strong>
        <span>${customer.phone}</span>
      </div>
      <div class="customer-detail"><span>الطلب</span><strong>${[...customer.orders].join("، ")}</strong></div>
      <div class="customer-money">
        <div><span>إجمالي الحساب</span><strong>${money(customer.total)}</strong></div>
        <div><span>المدفوع</span><strong>${money(customer.paidAmount)}</strong></div>
        <div><span>المتبقي</span><strong>${money(customer.remaining)}</strong></div>
      </div>
      <div class="customer-detail"><span>حالة الدفع</span><strong>${[...customer.statuses].join("، ")}</strong></div>
      <div class="customer-detail"><span>طريقة الدفع</span><strong>${customer.methods.size ? [...customer.methods].join("، ") : "لم يتم الدفع"}</strong></div>
      <div class="customer-requests">
        <span>ملاحظات الطلبات</span>
        ${customer.requests.map(request => `
          <div class="customer-request">
            <strong>#${request.number} - ${formatDate(request.date, true)}</strong>
            <p>${request.items}</p>
            <p>${request.details}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("") || `<div class="customer-item"><strong>لا توجد بيانات عملاء بعد</strong></div>`;
}

function customerReportRows() {
  const customers = Object.values(state.invoices.reduce((acc, inv) => {
    const key = inv.phone || inv.customerName;
    if (!acc[key]) {
      acc[key] = {
        customerName: inv.customerName,
        phone: inv.phone,
        orders: new Set(),
        total: 0,
        paidAmount: 0,
        remaining: 0,
        statuses: new Set(),
        methods: new Set(),
        requests: []
      };
    }
    getInvoiceItems(inv).forEach(item => acc[key].orders.add(`${item.stoneName} (${itemMeasureLabel(item)})`));
    acc[key].total += Number(inv.total || 0);
    acc[key].paidAmount += Number(inv.paidAmount || 0);
    acc[key].remaining += Number(inv.remaining || 0);
    acc[key].statuses.add(paymentLabel(inv.paymentStatus));
    if (inv.paymentStatus !== "unpaid") acc[key].methods.add(paymentMethodLabel(inv.paymentMethod));
    acc[key].requests.push(`#${inv.number} - ${formatDate(inv.date, true)} - ${inv.workDetails || "لا توجد ملاحظات مسجلة"}`);
    return acc;
  }, {}));
  return customers.map(customer => [
    customer.customerName,
    customer.phone,
    [...customer.orders].join(" | "),
    formatNumber(customer.total, 2),
    formatNumber(customer.paidAmount, 2),
    formatNumber(customer.remaining, 2),
    [...customer.statuses].join(" | "),
    customer.methods.size ? [...customer.methods].join(" | ") : "لم يتم الدفع",
    customer.requests.join(" | ")
  ]);
}

function buildReportCsv(type) {
  if (type === "factory") return buildFactoryReportsCsv();

  if (type === "stock") {
    return toCsv([
      ["الخامة", "سعر المتر المربع", "سعر المتر الطولي", "سعر القطعة", "السمك", "الطول", "العرض", "القيمة المخزنية", "مكان التخزين", "ملاحظات"],
      ...state.stones.map(stone => [
        stone.name,
        formatNumber(stone.price, 2),
        formatNumber(stone.linearPrice || stone.price, 2),
        formatNumber(stone.piecePrice || 0, 2),
        formatNumber(stone.thickness || 0, 2),
        formatNumber(stone.length || 0, 2),
        formatNumber(stone.width || 0, 2),
        formatNumber(Number(stone.quantity || 0) * Number(stone.price || 0), 2),
        stone.location,
        stone.notes || ""
      ])
    ]);
  }

  if (type === "customers") {
    return toCsv([
      ["اسم العميل", "التليفون", "الطلبات", "إجمالي الحساب", "المدفوع", "المتبقي", "حالة الدفع", "طريقة الدفع", "ملاحظات الطلبات"],
      ...customerReportRows()
    ]);
  }

  return toCsv([
    ["رقم الفاتورة", "التاريخ", "العميل", "التليفون", "الخامات", "الكمية", "الإجمالي", "المدفوع", "المتبقي", "حالة الدفع", "طريقة الدفع", "تفاصيل الشغل", "تم بواسطة"],
    ...state.invoices.map(inv => [
      inv.number,
      formatDate(inv.date, true),
      inv.customerName,
      inv.phone,
      invoiceStoneNames(inv),
      formatNumber(inv.meters, 2),
      formatNumber(inv.total, 2),
      formatNumber(inv.paidAmount, 2),
      formatNumber(inv.remaining, 2),
      paymentLabel(inv.paymentStatus),
      inv.paymentStatus === "unpaid" ? "لم يتم الدفع" : paymentMethodLabel(inv.paymentMethod),
      inv.workDetails || "",
      userLabel(inv.createdBy)
    ])
  ]);
}

function downloadSelectedReport() {
  const type = document.querySelector("#reportType").value;
  const labels = { stock: "stock", customers: "customers", invoices: "invoices", factory: "factory-expenses" };
  downloadTextFile(`al-safwa-${labels[type]}-report-${todayKey()}.csv`, buildReportCsv(type), "text/csv;charset=utf-8");
  showToast("تم تنزيل التقرير");
}

function downloadFullBackup() {
  printPdf("system");
  showToast("اختاري حفظ كـ PDF من نافذة الطباعة");
}

function printPdf(mode = "system") {
  document.body.classList.remove("print-invoice", "print-system");
  document.body.classList.add(mode === "invoice" ? "print-invoice" : "print-system");
  if (mode === "invoice") {
    document.querySelector("#invoiceModal")?.scrollTo(0, 0);
    document.querySelector("#invoicePreview")?.scrollTo(0, 0);
  }
  window.scrollTo(0, 0);
  setTimeout(() => window.print(), 120);
}

function factoryReportStats() {
  const reports = state.factoryReports || [];
  const month = monthKey();
  const monthReports = reports.filter(report => report.date?.startsWith(month));
  const total = reports.reduce((sum, report) => sum + Number(report.amount || 0), 0);
  const monthTotal = monthReports.reduce((sum, report) => sum + Number(report.amount || 0), 0);
  const maintenanceTotal = reports.filter(report => report.type === "maintenance").reduce((sum, report) => sum + Number(report.amount || 0), 0);
  const withdrawalsTotal = reports.filter(report => report.type === "withdrawal").reduce((sum, report) => sum + Number(report.amount || 0), 0);
  return { total, monthTotal, maintenanceTotal, withdrawalsTotal };
}

function renderFactoryReports() {
  const data = factoryReportStats();
  renderStats(document.querySelector("#factoryReportStats"), [
    { label: "مصروفات الشهر", value: money(data.monthTotal), icon: "calendar_month" },
    { label: "إجمالي المصروفات", value: money(data.total), icon: "payments" },
    { label: "إجمالي الصيانة", value: money(data.maintenanceTotal), icon: "construction" },
    { label: "سحب من الحساب", value: money(data.withdrawalsTotal), icon: "account_balance" }
  ]);

  document.querySelector("#factoryReportsTable").innerHTML = (state.factoryReports || []).map(report => `
    <tr>
      <td>${formatDate(report.date, true)}</td>
      <td>${factoryReportTypeLabel(report.type)}</td>
      <td>${report.title}</td>
      <td>${money(report.amount)}</td>
      <td>${factoryReportSourceLabel(report.source)}</td>
      <td>${report.notes}</td>
      <td>${userLabel(report.createdBy)}</td>
      <td><button class="danger-button" data-delete-factory-report="${report.id}"><span class="material-symbols-outlined">delete</span>حذف</button></td>
    </tr>
  `).join("") || `<tr><td colspan="8">لا توجد تقارير مصنع مسجلة حتى الآن.</td></tr>`;
}

function setFactoryReportDateDefault() {
  const input = document.querySelector("#factoryReportDate");
  if (!input || input.value) return;
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  input.value = local.toISOString().slice(0, 16);
}

function submitFactoryReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const report = {
    id: crypto.randomUUID(),
    type: data.type,
    amount: Number(data.amount || 0),
    source: data.source,
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    title: data.title.trim(),
    notes: data.notes.trim(),
    createdBy: publicUser(currentUser),
    createdAt: new Date().toISOString()
  };
  state.factoryReports.unshift(report);
  saveState();
  form.reset();
  setFactoryReportDateDefault();
  showToast("تم حفظ تقرير المصنع");
  renderAll();
}

function deleteFactoryReport(id) {
  const report = (state.factoryReports || []).find(item => item.id === id);
  if (!report) return;
  if (!confirm(`هل تريد حذف تقرير: ${report.title}؟`)) return;
  state.factoryReports = state.factoryReports.filter(item => item.id !== id);
  saveState();
  showToast("تم حذف تقرير المصنع");
  renderAll();
}

function buildFactoryReportsCsv() {
  return toCsv([
    ["التاريخ", "نوع التقرير", "العنوان", "المبلغ", "المصدر", "ملاحظات", "تم بواسطة"],
    ...(state.factoryReports || []).map(report => [
      formatDate(report.date, true),
      factoryReportTypeLabel(report.type),
      report.title,
      formatNumber(report.amount, 2),
      factoryReportSourceLabel(report.source),
      report.notes,
      userLabel(report.createdBy)
    ])
  ]);
}

function downloadFactoryReport() {
  downloadTextFile(`al-safwa-factory-expenses-${todayKey()}.csv`, buildFactoryReportsCsv(), "text/csv;charset=utf-8");
  showToast("تم تنزيل تقرير المصنع");
}

function renderUsers() {
  document.querySelector("#usersTable").innerHTML = state.users.map(user => `
    <tr>
      <td>${user.name}</td>
      <td>${user.addedBy || "النظام"}</td>
      <td><button class="danger-button" data-delete-user="${user.id}"><span class="material-symbols-outlined">delete</span>حذف</button></td>
    </tr>
  `).join("");
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderInvoiceStoneOptions();
  renderInvoices();
  renderReports();
  renderFactoryReports();
  renderCalculator();
  renderUsers();
  updateInvoiceSummary();
  setFactoryReportDateDefault();
  showAppForUser();
}

function openStoneModal(stone = null) {
  const form = document.querySelector("#stoneForm");
  form.reset();
  editingStoneId = stone?.id || null;
  document.querySelector("#stoneModalTitle").textContent = stone ? "تعديل نوع خامة" : "إضافة نوع جديد";
  if (stone) {
    Object.entries(stone).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value;
    });
  }
  document.querySelector("#stoneModal").showModal();
}

function submitStone(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const stone = {
    id: editingStoneId || crypto.randomUUID(),
    name: data.name.trim(),
    color: data.color.trim(),
    quantity: Number(data.quantity),
    price: Number(data.price),
    linearPrice: Number(data.linearPrice || data.price || 0),
    piecePrice: Number(data.piecePrice || 0),
    thickness: Number(data.thickness || 0),
    length: Number(data.length || 0),
    width: Number(data.width || 0),
    location: data.location.trim(),
    notes: data.notes.trim(),
    pattern: data.pattern,
    createdBy: editingStoneId ? state.stones.find(item => item.id === editingStoneId)?.createdBy || publicUser(currentUser) : publicUser(currentUser),
    updatedBy: publicUser(currentUser),
    updatedAt: new Date().toISOString()
  };
  if (editingStoneId) {
    state.stones = state.stones.map(item => item.id === editingStoneId ? stone : item);
  } else {
    state.stones.unshift(stone);
  }
  saveState();
  document.querySelector("#stoneModal").close();
  showToast("تم حفظ بيانات الخامة بنجاح");
  renderAll();
}

function submitInvoice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const collectedItems = collectInvoiceItems();
  if (!collectedItems.length) return showToast("ضيفي نوع رخام واحد على الأقل في الفاتورة");
  if (collectedItems.some(item => item.meters <= 0 || item.unitPrice < 0)) return showToast("راجعي الكمية وسعر الوحدة في كل بند");

  const soldByStone = {};
  collectedItems.forEach(item => soldByStone[item.stoneId] = (soldByStone[item.stoneId] || 0) + item.stockImpact);
  const unavailable = Object.entries(soldByStone).map(([stoneId, soldMeters]) => {
    const stone = state.stones.find(item => item.id === stoneId);
    return stone && soldMeters > Number(stone.quantity) ? { stone, soldMeters } : null;
  }).filter(Boolean)[0];
  if (unavailable) return showToast(`الكمية المطلوبة من ${unavailable.stone.name} غير متاحة في المخزون`);

  const items = collectedItems.map(({ stone, ...item }) => item);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const soldMeters = items.reduce((sum, item) => sum + item.stockImpact, 0);
  const paidAmount = data.paymentStatus === "paid" ? total : data.paymentStatus === "deposit" ? Math.min(Number(data.deposit || 0), total) : 0;
  const invoice = {
    id: crypto.randomUUID(),
    number: state.invoices.length + 1001,
    date: new Date().toISOString(),
    customerName: data.customerName.trim(),
    phone: data.phone.trim(),
    address: data.address.trim(),
    items,
    stoneId: items[0].stoneId,
    stoneName: items.map(item => item.stoneName).join("، "),
    meters: soldMeters,
    unitPrice: items.length === 1 ? items[0].unitPrice : 0,
    total,
    paymentStatus: data.paymentStatus,
    paymentMethod: data.paymentStatus === "unpaid" ? "" : data.paymentMethod,
    paidAmount,
    remaining: Math.max(total - paidAmount, 0),
    workDetails: data.workDetails.trim(),
    createdBy: publicUser(currentUser)
  };

  Object.entries(soldByStone).forEach(([stoneId, soldMetersValue]) => {
    const stone = state.stones.find(item => item.id === stoneId);
    stone.quantity = Number((stone.quantity - soldMetersValue).toFixed(2));
    stone.updatedBy = publicUser(currentUser);
    stone.updatedAt = new Date().toISOString();
  });
  state.invoices.unshift(invoice);
  saveState();
  form.reset();
  form.paymentStatus.value = "paid";
  form.paymentMethod.value = "cash";
  clearInvoiceItems();
  showToast("تم حفظ الفاتورة وتحديث المخزون");
  renderAll();
  openInvoicePreview(invoice.id);
}

function invoiceCodePattern(invoice) {
  const seed = `${invoice.number}-${invoice.phone}-${invoice.total}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Array.from({ length: 49 }, (_, index) => {
    const active = index % 8 === 0 || index % 6 === 2 || ((index * seed) % 11) < 5;
    return `<span class="${active ? "is-active" : ""}"></span>`;
  }).join("");
}

function openInvoicePreview(id) {
  const inv = state.invoices.find(item => item.id === id);
  if (!inv) return;
  const preview = document.querySelector("#invoicePreview");
  const invoiceItems = getInvoiceItems(inv);
  preview.innerHTML = `
    <button class="icon-button close-x invoice-close" id="closeInvoiceModal" type="button" aria-label="إغلاق">×</button>
    <section class="safwa-invoice-sheet">
      <header class="invoice-hero">
        <img src="assets/safwa-logo.png" alt="مصنع الصفوة" />
        <div>
          <p>مصنع الصفوة للرخام والجرانيت</p>
          <h2>فاتورة ضريبية مبسطة</h2>
          <span>AL-SAFWA MARBLE & GRANITE</span>
        </div>
      </header>

      <div class="invoice-code-card">
        <a href="${FACTORY_MAPS_URL}" target="_blank" rel="noopener" title="فتح موقع المصنع على الخريطة">
          <img class="invoice-barcode-image" src="assets/safwa-barcode.png" alt="باركود موقع مصنع الصفوة" />
        </a>
        <strong>SAFWA-${inv.number}</strong>
        <small>موقع المصنع على الخريطة</small>
      </div>

      <section class="invoice-section">
        <h3>بيانات الفاتورة</h3>
        <div class="invoice-info-grid">
          <div><span>رقم الفاتورة</span><strong>#${inv.number}</strong></div>
          <div><span>التاريخ</span><strong>${formatDate(inv.date, true)}</strong></div>
          <div><span>حالة الدفع</span><strong>${paymentLabel(inv.paymentStatus)}</strong></div>
          <div><span>طريقة الدفع</span><strong>${inv.paymentStatus === "unpaid" ? "لم يتم الدفع" : paymentMethodLabel(inv.paymentMethod)}</strong></div>
        </div>
      </section>

      <section class="invoice-section">
        <h3>بيانات العميل</h3>
        <div class="invoice-info-grid">
          <div><span>العميل</span><strong>${inv.customerName}</strong></div>
          <div><span>التليفون</span><strong>${inv.phone}</strong></div>
          <div class="wide"><span>العنوان</span><strong>${inv.address || "غير مسجل"}</strong></div>
        </div>
      </section>

      <section class="invoice-section">
        <h3>تفاصيل الخامات</h3>
        <div class="invoice-items-list">
          ${invoiceItems.map(item => `
            <article>
              <div>
                <strong>${item.stoneName}</strong>
                <span>${invoiceCalculationLabel(item.calculationType)} - ${itemMeasureLabel(item)} × ${itemPriceLabel(item)}${item.factor > 1 ? ` × ${formatNumber(item.factor, 2)}` : ""}</span>
              </div>
              <b>${money(item.total)}</b>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="invoice-section">
        <h3>تفاصيل شغل العميل</h3>
        <p class="invoice-work-details">${inv.workDetails}</p>
      </section>

      <section class="invoice-payment-card">
        <h3>تفاصيل الدفع</h3>
        <div><span>الإجمالي</span><strong>${money(inv.total)}</strong></div>
        <div><span>المدفوع</span><strong>${money(inv.paidAmount)}</strong></div>
        <div><span>المتبقي</span><strong>${money(inv.remaining)}</strong></div>
      </section>

      <footer class="invoice-footer">
        <p>شكرًا لاختياركم مصنع الصفوة للرخام والجرانيت</p>
        <strong>AL-SAFWA MARBLE & GRANITE</strong>
      </footer>
    </section>
    <div class="modal-actions">
      <button class="primary-button" id="downloadInvoicePdf" type="button"><span class="material-symbols-outlined">download</span>تنزيل PDF</button>
      <button class="ghost-button" id="printInvoice"><span class="material-symbols-outlined">print</span>طباعة</button>
    </div>
  `;
  document.querySelector("#invoiceModal").showModal();
}

function submitLogin(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const username = normalizeName(data.username);
  const user = state.users.find(item => normalizeName(item.name) === username && item.password === data.password);
  if (!user) {
    showToast("بيانات الدخول غير صحيحة");
    return;
  }
  currentUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser(user)));
  event.currentTarget.reset();
  showToast(`أهلا ${user.name}`);
  renderAll();
}

function logout() {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  navigate("dashboard");
  showAppForUser();
}

function submitUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const name = normalizeName(data.name);
  if (state.users.some(user => normalizeName(user.name) === name)) {
    showToast("اسم المستخدم مسجل بالفعل");
    return;
  }
  state.users.push({
    id: crypto.randomUUID(),
    name,
    email: "",
    password: data.password,
    addedBy: currentUser?.name || "النظام",
    createdAt: new Date().toISOString()
  });
  saveState();
  form.reset();
  showToast("تم إضافة المستخدم بنجاح");
  renderAll();
}

function deleteStone(id) {
  const stone = state.stones.find(item => item.id === id);
  if (!stone) return;
  if (state.invoices.some(invoice => getInvoiceItems(invoice).some(item => item.stoneId === id))) {
    showToast("لا يمكن حذف خامة عليها فواتير محفوظة");
    return;
  }
  if (!confirm(`هل تريد حذف ${stone.name} من المخزون؟`)) return;
  state.stones = state.stones.filter(item => item.id !== id);
  saveState();
  showToast("تم حذف الخامة من المخزون");
  renderAll();
}

function deleteInvoice(id) {
  const invoice = state.invoices.find(item => item.id === id);
  if (!invoice) return;
  if (!confirm(`هل تريد حذف فاتورة #${invoice.number}؟ سيتم تحديث المخزون بعد الحذف.`)) return;
  getInvoiceItems(invoice).forEach(item => {
    const stone = state.stones.find(stoneItem => stoneItem.id === item.stoneId);
    if (stone) {
      stone.quantity = Number((Number(stone.quantity) + Number(item.meters)).toFixed(2));
      stone.updatedBy = publicUser(currentUser);
      stone.updatedAt = new Date().toISOString();
    }
  });
  state.invoices = state.invoices.filter(item => item.id !== id);
  saveState();
  showToast("تم حذف الفاتورة وتحديث المخزون");
  renderAll();
}

function deleteUser(id) {
  const user = state.users.find(item => item.id === id);
  if (!user) return;
  if (user.id === currentUser?.id) {
    showToast("لا يمكن حذف المستخدم الحالي أثناء دخوله");
    return;
  }
  if (state.users.length <= 1) {
    showToast("لا يمكن حذف آخر مستخدم في النظام");
    return;
  }
  if (!confirm(`هل تريد حذف المستخدم ${user.name}؟`)) return;
  state.users = state.users.filter(item => item.id !== id);
  saveState();
  showToast("تم حذف المستخدم");
  renderAll();
}

function formatCalculatorExpression(expression) {
  return String(expression || "").replaceAll("*", "×").replaceAll("/", "÷");
}

function getLinearMeterCalculation() {
  const length = Number(document.querySelector("#linearLength")?.value || 0);
  const price = Number(document.querySelector("#linearPrice")?.value || 0);
  const width = Number(document.querySelector("#linearWidth")?.value || 0);
  const baseWidth = Number(document.querySelector("#linearBaseWidth")?.value || 60);
  const extraMultiplier = Number(document.querySelector("#linearMultiplier")?.value || 1.25);
  const factor = width > baseWidth ? Math.max(extraMultiplier, 1) : 1;
  const total = Number((length * price * factor).toFixed(2));
  const expression = `${formatNumber(length, 2)} متر طولي × ${formatNumber(price, 2)} ج.م${factor > 1 ? ` × ${formatNumber(factor, 2)}` : ""}`;
  return { length, price, width, baseWidth, factor, total, expression };
}

function renderLinearMeterCalculator() {
  const factorElement = document.querySelector("#linearFactor");
  const totalElement = document.querySelector("#linearTotal");
  if (!factorElement || !totalElement) return;
  const calculation = getLinearMeterCalculation();
  factorElement.textContent = formatNumber(calculation.factor, 2);
  totalElement.textContent = money(calculation.total);
}

function saveLinearMeterCalculation() {
  const calculation = getLinearMeterCalculation();
  if (calculation.length <= 0 || calculation.price <= 0) {
    showToast("اكتبي الطول وسعر المتر الطولي");
    return;
  }
  state.calculatorHistory = [{ expression: calculation.expression, result: calculation.total }, ...(state.calculatorHistory || [])].slice(0, 8);
  saveState();
  renderCalculator();
  showToast("تم حفظ عملية المتر الطولي");
}

function calculateExpression(expression) {
  if (!/^[\d+\-*/. ()]+$/.test(expression)) throw new Error("Invalid expression");
  return Function(`"use strict"; return (${expression})`)();
}

function renderCalculator() {
  document.querySelector("#calculatorExpression").textContent = calculatorExpression ? formatCalculatorExpression(calculatorExpression) : "0";
  renderLinearMeterCalculator();
  const history = state.calculatorHistory || [];
  document.querySelector("#calculatorHistory").innerHTML = history.map(item => `
    <div class="calculator-history-item">
      <span>${formatCalculatorExpression(item.expression)}</span>
      <strong>${money(item.result)}</strong>
    </div>
  `).join("") || `<div class="calculator-history-item"><span>لا توجد عمليات محفوظة</span><strong>0</strong></div>`;
}

function handleCalculator(value) {
  if (value === "clear") {
    calculatorExpression = "";
    document.querySelector("#calculatorResult").textContent = "0";
    renderCalculator();
    return;
  }
  if (value === "equals") {
    if (!calculatorExpression) return;
    try {
      const result = Number(calculateExpression(calculatorExpression).toFixed(4));
      document.querySelector("#calculatorResult").textContent = formatNumber(result);
      state.calculatorHistory = [{ expression: calculatorExpression, result }, ...(state.calculatorHistory || [])].slice(0, 8);
      calculatorExpression = String(result);
      saveState();
      renderCalculator();
    } catch {
      showToast("راجعي العملية الحسابية");
    }
    return;
  }
  calculatorExpression += value;
  document.querySelector("#calculatorResult").textContent = formatCalculatorExpression(calculatorExpression);
  renderCalculator();
}

document.addEventListener("click", event => {
  const navButton = event.target.closest("[data-view]");
  const jumpButton = event.target.closest("[data-view-jump]");
  const editButton = event.target.closest("[data-edit-stone]");
  const sellButton = event.target.closest("[data-sell-stone]");
  const invoiceButton = event.target.closest("[data-view-invoice]");
  const deleteStoneButton = event.target.closest("[data-delete-stone]");
  const deleteInvoiceButton = event.target.closest("[data-delete-invoice]");
  const deleteUserButton = event.target.closest("[data-delete-user]");
  const deleteFactoryReportButton = event.target.closest("[data-delete-factory-report]");
  const removeInvoiceItemButton = event.target.closest(".remove-invoice-item");
  const calculatorButton = event.target.closest("[data-calc]");
  const saveLinearCalculationButton = event.target.closest("#saveLinearCalculation");

  if (navButton) navigate(navButton.dataset.view);
  if (jumpButton) navigate(jumpButton.dataset.viewJump);
  if (editButton) openStoneModal(state.stones.find(stone => stone.id === editButton.dataset.editStone));
  if (sellButton) {
    navigate("sales");
    clearInvoiceItems();
    const firstRow = document.querySelector(".invoice-item");
    firstRow.querySelector(".invoice-stone").value = sellButton.dataset.sellStone;
    syncInvoiceItemPrice(firstRow);
    updateInvoiceSummary();
  }
  if (invoiceButton) openInvoicePreview(invoiceButton.dataset.viewInvoice);
  if (deleteStoneButton) deleteStone(deleteStoneButton.dataset.deleteStone);
  if (deleteInvoiceButton) deleteInvoice(deleteInvoiceButton.dataset.deleteInvoice);
  if (deleteUserButton) deleteUser(deleteUserButton.dataset.deleteUser);
  if (deleteFactoryReportButton) deleteFactoryReport(deleteFactoryReportButton.dataset.deleteFactoryReport);
  if (removeInvoiceItemButton) {
    const rows = document.querySelectorAll(".invoice-item");
    if (rows.length <= 1) return showToast("الفاتورة لازم تحتوي على بند واحد على الأقل");
    removeInvoiceItemButton.closest(".invoice-item").remove();
    updateInvoiceSummary();
  }
  if (calculatorButton) handleCalculator(calculatorButton.dataset.calc);
  if (saveLinearCalculationButton) saveLinearMeterCalculation();
  if (event.target.closest("#closeStoneModal")) document.querySelector("#stoneModal").close();
  if (event.target.closest("#closeInvoiceModal")) document.querySelector("#invoiceModal").close();
  if (event.target.closest("#printInvoice")) printPdf("invoice");
  if (event.target.closest("#downloadInvoicePdf")) printPdf("invoice");
  if (event.target.closest("#clearCalculatorHistory")) {
    state.calculatorHistory = [];
    saveState();
    renderCalculator();
  }
});

document.querySelector("#loginForm").addEventListener("submit", submitLogin);
document.querySelector("#logoutBtn").addEventListener("click", logout);
document.querySelector("#userForm").addEventListener("submit", submitUser);
document.querySelector("#factoryReportForm").addEventListener("submit", submitFactoryReport);
document.querySelector("#openStoneModal").addEventListener("click", () => openStoneModal());
document.querySelector("#stoneForm").addEventListener("submit", submitStone);
document.querySelector("#invoiceForm").addEventListener("submit", submitInvoice);
document.querySelector("#addInvoiceItem").addEventListener("click", () => addInvoiceItem());
document.querySelector("#downloadReportBtn").addEventListener("click", downloadSelectedReport);
document.querySelector("#downloadFullBackupBtn").addEventListener("click", downloadFullBackup);
document.querySelector("#downloadFactoryReportBtn").addEventListener("click", downloadFactoryReport);
document.querySelector("#inventorySearch").addEventListener("input", renderInventory);
document.querySelector("#invoiceSearch").addEventListener("input", renderInvoices);
document.querySelector("#linearMeterForm").addEventListener("input", renderLinearMeterCalculator);
document.querySelector("#invoiceForm").addEventListener("input", event => {
  if (event.target.classList.contains("invoice-meters") || event.target.classList.contains("invoice-length") || event.target.classList.contains("invoice-width") || event.target.classList.contains("invoice-thickness") || event.target.classList.contains("invoice-base-width") || event.target.classList.contains("invoice-multiplier")) {
    syncInvoiceItemPrice(event.target.closest(".invoice-item"));
  }
  updateInvoiceSummary();
});
document.querySelector("#invoiceForm").addEventListener("change", event => {
  if (event.target.classList.contains("invoice-stone") || event.target.classList.contains("invoice-mode")) {
    const row = event.target.closest(".invoice-item");
    syncInvoiceItemMode(row);
    syncInvoiceItemPrice(row);
  }
  updateInvoiceSummary();
});
document.querySelector("#resetDemoData").addEventListener("click", () => {
  state = structuredClone(seedData);
  currentUser = state.users.find(user => user.id === currentUser?.id) || state.users[0];
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser(currentUser)));
  saveState();
  document.querySelector("#stoneModal").close();
  showToast("تم استرجاع البيانات التجريبية");
  renderAll();
});
document.querySelector("#exportBtn").addEventListener("click", () => {
  printPdf("system");
});
document.querySelector("#importBtn").addEventListener("click", () => {
  document.querySelector("#importFile").click();
});
document.querySelector("#importFile").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedState = normalizeState(JSON.parse(reader.result));
      if (!confirm("هل تريد استيراد هذه النسخة؟ سيتم استبدال البيانات الحالية.")) return;
      state = importedState;
      currentUser = loadCurrentUser();
      saveState();
      renderAll();
      showToast("تم استيراد النسخة وحفظها بنجاح");
    } catch {
      showToast("ملف النسخة غير صحيح");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
});

window.addEventListener("beforeunload", saveState);
window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-invoice", "print-system");
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveState();
});

requestPersistentStorage();
initializeApp();

async function initializeApp() {
  await loadStateRemote();
  saveState();
  renderAll();
}

