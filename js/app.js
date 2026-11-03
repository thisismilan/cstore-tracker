/* =========================================================
   SUPABASE CONFIGURATION
   ========================================================= */
const SUPABASE_URL = "https://ziqnwfawmhbpldpsadzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_qrYg2_WD_PL-3kMk_EOyGw_kITVMCxg";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE_NAME = "daily_reports";
let currentEditingId = null;
let cameFromManager = false;
let currentReports = [];
let inventoryCounts = [];
let inventoryHistoryReports = [];
let inventoryHistoryCounts = [];
let inventoryCountTableAvailable = null;
let calYear, calMonth;
let empCalMonth, empCalYear;

/* =========================================================
   TOAST HELPER
   ========================================================= */
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast px-4 py-3 rounded shadow-lg text-white font-medium " +
    (type === "success" ? "bg-blue-700" : "bg-rose-700");
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

/* =========================================================
   LOGIN / ROLE ROUTING
   ========================================================= */
const loginScreen = document.getElementById("loginScreen");
const topNav = document.getElementById("topNav");
const employeeView = document.getElementById("employeeView");
const managerView = document.getElementById("managerView");
const managerTopbarShell = document.getElementById("managerTopbarShell");
const vendorView = document.getElementById("vendorView");
const navUserInfo = document.getElementById("navUserInfo");
const navRoleBadge = document.getElementById("navRoleBadge");

// Hardcoded user credentials
const USERS = {
  manager: { name: "Manager", password: "Manager123" },
  employee1: { name: "staff", password: "Staff123", role: "employee" },
  employee2: { name: "employee", password: "Employee123", role: "employee" }
};

function validateLogin(name, role, password) {
  if (role === "manager") {
    return name === USERS.manager.name && password === USERS.manager.password;
  }
  if (role === "employee") {
    return (
      (name === USERS.employee1.name && password === USERS.employee1.password) ||
      (name === USERS.employee2.name && password === USERS.employee2.password)
    );
  }
  return false;
}

async function applySession(name, role) {
  navUserInfo.textContent = `Signed in as ${name}`;
  navRoleBadge.textContent = role;
  document.getElementById("managerNavUserInfo").textContent = `Signed in as ${name}`;
  loginScreen.classList.add("hidden");
  topNav.classList.toggle("hidden", role === "manager");
  managerTopbarShell.classList.toggle("hidden", role !== "manager");
  if (role === "manager") {
    document.body.classList.toggle("manager-dark", localStorage.getItem("managerTheme") === "dark");
    updateManagerThemeButton();
  } else {
    document.body.classList.remove("manager-dark");
  }
  vendorView.classList.add("hidden"); // Hide vendor view on login

  // Employee keeps Manage Vendors in the global navigation. Managers access it from the Vendors tab.
  const employeeVendorMgmtBtn = document.getElementById("vendorMgmtBtnEmployee");
  if (role === "employee") {
    employeeVendorMgmtBtn.classList.remove("hidden");
    // Load vendors from Supabase when logging in
    loadVendorsFromSupabase();
  } else {
    employeeVendorMgmtBtn.classList.add("hidden");
    if (role === "manager") loadVendorsFromSupabase();
  }

  if (role === "manager") {
    managerView.classList.remove("hidden");
    employeeView.classList.add("hidden");
    setPeriod("current");
    console.log("Manager login - calling loadDashboardData");
    loadDashboardData().catch(err => console.error("loadDashboardData failed:", err));
  } else if (role === "employee") {
    employeeView.classList.remove("hidden");
    managerView.classList.add("hidden");
    // Set default date to yesterday for employees
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById("reportDate").valueAsDate = yesterday;
    updateReportDayOfWeek();
    // Check if entry exists for yesterday and load it for editing
    checkAndLoadEntryForDate(yesterday.toISOString().split("T")[0]);
    // Load reports data for calendar
    await loadReportsData();
    // Render employee calendar
    renderEmployeeCalendar();
    // Setup auto-clear of "0" values on focus
    setupZeroAutoClear();
  }
  // Update back button visibility based on role
  updateBackButtonVisibility();
}

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("loginName").value.trim();
  const role = document.getElementById("loginRole").value;
  const password = document.getElementById("loginPassword").value;
  if (!name || !role || !password) return;

  if (!validateLogin(name, role, password)) {
    showToast("Invalid name, role, or password", "error");
    return;
  }

  sessionStorage.setItem("cstore_user", JSON.stringify({ name, role }));
  applySession(name, role);
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("cstore_user");
  location.reload();
});

document.getElementById("managerLogoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("cstore_user");
  location.reload();
});

function updateManagerThemeButton() {
  const button = document.getElementById("managerThemeToggle");
  const darkMode = document.body.classList.contains("manager-dark");
  button.textContent = darkMode ? "☀" : "◐";
  button.setAttribute("aria-label", darkMode ? "Switch to light mode" : "Switch to dark mode");
  button.title = darkMode ? "Switch to light mode" : "Switch to dark mode";
}

document.getElementById("managerThemeToggle").addEventListener("click", () => {
  const darkMode = document.body.classList.toggle("manager-dark");
  localStorage.setItem("managerTheme", darkMode ? "dark" : "light");
  updateManagerThemeButton();
});

(function restoreSession() {
  const saved = sessionStorage.getItem("cstore_user");
  if (saved) {
    const { name, role } = JSON.parse(saved);
    applySession(name, role);
  }
})();

/* =========================================================
   REPORT DATE — DAY OF WEEK DISPLAY
   ========================================================= */
function updateReportDayOfWeek() {
  const dateInput = document.getElementById("reportDate");
  const dayEl = document.getElementById("reportDayOfWeek");
  if (!dateInput.value) { dayEl.textContent = ""; return; }
  const d = new Date(dateInput.value + "T00:00:00");
  dayEl.textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" });
}
document.getElementById("reportDate").addEventListener("change", (e) => {
  updateReportDayOfWeek();
  checkAndLoadEntryForDate(e.target.value);
});

/* =========================================================
   SHOW BACK TO DASHBOARD BUTTON IN EMPLOYEE VIEW
   ========================================================= */
function updateBackButtonVisibility() {
  const session = JSON.parse(sessionStorage.getItem("cstore_user") || "{}");
  const backBtn = document.getElementById("backToDashboardBtn");
  const stickyBackBtn = document.getElementById("stickyBackToDashboardBtn");
  if (session.role === "manager") {
    backBtn.classList.remove("hidden");
    stickyBackBtn.classList.remove("hidden");
  } else {
    backBtn.classList.add("hidden");
    stickyBackBtn.classList.add("hidden");
  }
}

/* =========================================================
   CHECK AND LOAD ENTRY FOR EDITING
   ========================================================= */
async function checkAndLoadEntryForDate(dateStr) {
  if (!dateStr) return;
  
  const session = JSON.parse(sessionStorage.getItem("cstore_user") || "{}");
  if (session.role !== "employee" && session.role !== "manager") return;
  
  try {
    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .eq("date", dateStr)
      .single();
    
    if (error && error.code !== "PGRST116") {
      console.error("Error checking entry:", error);
      return;
    }
    
    if (data) {
      loadEntryForEdit(data);
    } else {
      clearEditState();
    }
  } catch (err) {
    console.error("Error checking entry:", err);
  }
}

function loadEntryForEdit(report) {
  // Populate form with existing data
  document.getElementById("reportDate").value = report.date;
  document.getElementById("lotteryRing").value = parseFloat(report.lottery_ring) || 0;
  document.getElementById("lotteryActual").value = parseFloat(report.lottery_actual) || 0;
  document.getElementById("lottoRing").value = parseFloat(report.lotto_ring) || 0;
  document.getElementById("lottoActual").value = parseFloat(report.lotto_actual) || 0;
  document.getElementById("totalSales").value = parseFloat(report.total_sales) || 0;
  document.getElementById("salesTax").value = parseFloat(report.sales_tax) || 0;
  document.getElementById("settlement1").value = parseFloat(report.settlement_1) || 0;
  document.getElementById("settlement2").value = parseFloat(report.settlement_2) || 0;
  document.getElementById("lotteryPayout").value = parseFloat(report.lottery_payout) || 0;
  document.getElementById("totalCashPayout").value = parseFloat(report.total_cash_payout) || 0;
  document.getElementById("cashInHand").value = parseFloat(report.cash_in_hand) || 0;
  document.getElementById("shiftNotes").value = report.shift_notes || "";
  
  // Set edit mode
  currentEditingId = report.id;
  // Show existing entry dot
  document.getElementById("existingEntryDot").classList.remove("hidden");
  const editIndicator = document.getElementById("editModeIndicator");
  editIndicator.classList.remove("hidden");
  editIndicator.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
      <span class="text-amber-700 font-medium">Editing entry for ${report.date} — changes will update the existing record</span>
    </div>
  `;
  
  // Populate purchase rows
  const purchases = report.inventory_purchases || [];
  purchaseRowsContainer.innerHTML = "";

  // Store purchase data so we can set vendor values after all async
  // operations (e.g. loadVendorsFromSupabase) complete. Without this,
  // renderVendorDropdowns() can wipe out values we just set.
  window._pendingPurchases = purchases;

  if (purchases.length > 0) {
    purchases.forEach((p, index) => {
      createPurchaseRow(p.vendor || ""); // Pass vendor name so it's set immediately
      const row = purchaseRowsContainer.lastElementChild;
      row.querySelector(".amount-input").value = parseFloat(p.amount) || 0;
      row.dataset.purchaseIndex = index;
    });
  } else {
    createPurchaseRow();
    createPurchaseRow();
  }

  // Recalculate all derived fields
  recalcLottery();
  recalcSales();
  recalcPurchases();
}

function clearEditState() {
  currentEditingId = null;
  cameFromManager = false;
  const editIndicator = document.getElementById("editModeIndicator");
  editIndicator.classList.add("hidden");
  document.getElementById("backToDashboardBtn").classList.add("hidden");
  document.getElementById("existingEntryDot").classList.add("hidden");
  // Clear all form fields
  clearFormFields();
}

function clearFormFields() {
  const setValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setTextContent = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setValue("lotteryRing", 0);
  setValue("lotteryActual", 0);
  setValue("lotteryDiff", 0);
  setValue("lottoRing", 0);
  setValue("lottoActual", 0);
  setValue("lottoDiff", 0);
  setValue("totalSales", 0);
  setValue("salesTax", 0);
  setValue("settlement1", 0);
  setValue("settlement2", 0);
  setValue("lotteryPayout", 0);
  setValue("totalCashPayout", 0);
  setValue("cashInHand", 0);
  setValue("overShort", 0);
  setValue("shiftNotes", "");
  // Clear display-only spans (not inputs)
  setTextContent("grandTotalSales", "$0.00");
  setTextContent("grandTotalSettlements", "$0.00");
  setTextContent("purchasesTotal", "0.00");
  // Clear purchase rows
  const container = document.getElementById("purchaseRows");
  if (container) {
    container.innerHTML = "";
    createPurchaseRow();
    createPurchaseRow();
  }
}

/* =========================================================
   SECTION 01 — LOTTERY & LOTTO CALCULATIONS
   ========================================================= */
function num(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) ? 0 : v;
}

function updateDifference(id, difference) {
  const differenceEl = document.getElementById(id);
  differenceEl.value = difference.toFixed(2);
  differenceEl.classList.toggle("negative-value", difference < 0);
}

function recalcLottery() {
  const lotteryDiff = num("lotteryRing") - num("lotteryActual");
  updateDifference("lotteryDiff", lotteryDiff);

  const lottoDiff = num("lottoRing") - num("lottoActual");
  updateDifference("lottoDiff", lottoDiff);

  const actualLottoLottery = num("lotteryActual") + num("lottoActual");
  document.getElementById("actualLottoLottery").value = actualLottoLottery.toFixed(2);

  recalcSales();
}
document.querySelectorAll(".lotto-input").forEach(el => el.addEventListener("input", recalcLottery));

/* =========================================================
   SECTION 02 — SALES & SETTLEMENTS CALCULATIONS
   ========================================================= */
function recalcSales() {
  const totalSales = num("totalSales");
  const salesTax = num("salesTax");
  const actualLottoLottery = num("lotteryActual") + num("lottoActual");
  const settlement1 = num("settlement1");
  const settlement2 = num("settlement2");
  const lotteryPayout = num("lotteryPayout");
  const totalCashPayout = num("totalCashPayout");
  const cashInHand = num("cashInHand");

  // Grand total for the Sales column
  const grandTotalSales = totalSales + salesTax + actualLottoLottery;
  // Grand total for the Settlements & Cash column
  const grandTotalSettlements = settlement1 + settlement2 + lotteryPayout + totalCashPayout + cashInHand;

  document.getElementById("grandTotalSettlements").textContent = "$" + grandTotalSettlements.toFixed(2);

  // Over/Short = Grand Total Settlements & Cash - Grand Total Sales
  const overShort = grandTotalSettlements - grandTotalSales;

  const overShortEl = document.getElementById("overShort");
  overShortEl.textContent = "$" + Math.abs(overShort).toFixed(2);
  if (overShort < 0) overShortEl.textContent = "-" + overShortEl.textContent;
  overShortEl.classList.remove("text-blue-700", "text-red-600", "text-slate-800");
  if (overShort > 0) overShortEl.classList.add("text-blue-700");
  else if (overShort < 0) overShortEl.classList.add("text-red-600");
  else overShortEl.classList.add("text-slate-800");
}
document.querySelectorAll(".calc-input").forEach(el => el.addEventListener("input", recalcSales));

/* =========================================================
   SECTION 03 — DYNAMIC INVENTORY PURCHASE ROWS
   ========================================================= */
const purchaseRowsContainer = document.getElementById("purchaseRows");

function renumberPurchaseRows() {
  document.querySelectorAll(".purchase-row").forEach((row, idx) => {
    row.querySelector(".purchase-row-number").textContent = "Purchase " + (idx + 1);
  });
}

function createPurchaseRow(vendorName = "") {
  const row = document.createElement("div");
  row.className = "purchase-row";
  row.innerHTML = `
    <div class="purchase-row-label purchase-row-number">Purchase</div>
    <div class="flex gap-3 items-center">
      <select id="vendorSelect" class="vendor-select field-input flex-1 relative">
        <option value="">Select vendor...</option>
        <option value="new" class="new-vendor-option">+ Add New Vendor</option>
      </select>
      <div class="field-wrap w-40">
        <span class="dollar-prefix">$</span>
        <input type="number" step="0.01" placeholder="0.00" value="0" class="amount-input field-input" />
      </div>
      <button type="button" class="remove-row-btn text-slate-400 hover:text-red-600 text-lg leading-none px-1">✕</button>
    </div>
  `;
  
  // Handle vendor selection and add new vendor
  const vendorSelect = row.querySelector("#vendorSelect");
  vendorSelect.addEventListener("change", () => {
    if (vendorSelect.value === "new") {
      addNewVendorRow(vendorSelect, row);
    }
  });
  
  row.querySelector(".amount-input").addEventListener("input", recalcPurchases);
  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    row.remove();
    renumberPurchaseRows();
    recalcPurchases();
  });
  purchaseRowsContainer.appendChild(row);
  renumberPurchaseRows();

  // Populate vendor options after row is created
  renderVendorDropdowns();

  // Set vendor value AFTER renderVendorDropdowns so it isn't wiped out
  if (vendorName) {
    let option = null;
    for (let i = 0; i < vendorSelect.options.length; i++) {
      if (vendorSelect.options[i].value === vendorName) {
        option = vendorSelect.options[i];
        break;
      }
    }
    if (!option) {
      option = document.createElement("option");
      option.value = vendorName;
      option.textContent = vendorName;
      const newOpt = vendorSelect.querySelector(".new-vendor-option");
      if (newOpt) {
        vendorSelect.insertBefore(option, newOpt);
      } else {
        vendorSelect.appendChild(option);
      }
    }
    vendorSelect.value = vendorName;
  }
}

async function addNewVendorRow(selectedSelect, currentRow) {
  const newVendorName = prompt("Enter new vendor name:");
  if (newVendorName && newVendorName.trim()) {
    const trimmedName = newVendorName.trim();
    
    // Save to Supabase
    try {
      const { error } = await supabaseClient
        .from('vendors')
        .insert([{ name: trimmedName, is_active: true }])
        .select();
      
      if (error) {
        // If vendor already exists, that's fine - just continue
        if (error.code !== '23505') {
          showToast('Error saving vendor: ' + error.message, 'error');
          return;
        }
      }
      
      // Add to existing vendors list
      if (!window.existingVendors) window.existingVendors = [];
      if (!window.existingVendors.includes(trimmedName)) {
        window.existingVendors.push(trimmedName);
        // Reload existing rows to include new vendor
        document.querySelectorAll(".purchase-row .vendor-select").forEach(select => {
          const newOption = document.createElement("option");
          newOption.value = trimmedName;
          newOption.textContent = trimmedName;
          select.appendChild(newOption);
        });
      }
      
      showToast(`Vendor "${trimmedName}" saved to database`);
    } catch (err) {
      showToast('Error saving vendor: ' + err.message, 'error');
      return;
    }
    
    // Select the new vendor in current row
    selectedSelect.value = trimmedName;
  }
}

function recalcPurchases() {
  let total = 0;
  document.querySelectorAll(".amount-input").forEach(el => {
    const v = parseFloat(el.value);
    if (!isNaN(v)) total += v;
  });
  document.getElementById("purchasesTotal").textContent = total.toFixed(2);
}

async function getInventoryBeforeDate(dateStr) {
  const [reportResult, countResult] = await Promise.all([
    supabaseClient
      .from(TABLE_NAME)
      .select("date, total_sales, purchases_total, retail_purchased, current_inventory")
      .lt("date", dateStr)
      .order("date", { ascending: false })
      .limit(1),
    supabaseClient
      .from("inventory_counts")
      .select("count_date, physical_inventory")
      .lt("count_date", dateStr)
      .order("count_date", { ascending: false })
      .limit(1)
  ]);
  if (reportResult.error) throw reportResult.error;
  if (countResult.error && !/inventory_counts|schema cache|does not exist/i.test(countResult.error.message)) throw countResult.error;

  const latestReport = reportResult.data?.[0] || null;
  const latestCount = countResult.error ? null : (countResult.data?.[0] || null);
  if (latestCount && (!latestReport || latestCount.count_date >= latestReport.date)) {
    const { data: reportsAfterCount, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("date, total_sales, purchases_total, retail_purchased")
      .gt("date", latestCount.count_date)
      .lt("date", dateStr)
      .order("date", { ascending: true });
    if (error) throw error;
    return (reportsAfterCount || []).reduce((inventory, report) => {
      const retailPurchased = parseFloat(report.retail_purchased) ||
        ((parseFloat(report.purchases_total) || 0) / 0.67);
      return inventory + retailPurchased - (parseFloat(report.total_sales) || 0);
    }, parseFloat(latestCount.physical_inventory) || 0);
  }

  if (latestReport && Number.isFinite(parseFloat(latestReport.current_inventory))) {
    return parseFloat(latestReport.current_inventory);
  }
  return 100000;
}

document.getElementById("addPurchaseRow").addEventListener("click", () => createPurchaseRow());
createPurchaseRow(); // default purchase row 1
createPurchaseRow(); // default purchase row 2

/* =========================================================
   EMPLOYEE FORM SUBMISSION
   ========================================================= */
document.getElementById("dailyReportForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const session = JSON.parse(sessionStorage.getItem("cstore_user") || "{}");

  const purchases = [];
  document.querySelectorAll(".purchase-row").forEach(row => {
    // Get vendor from select dropdown (inventory management)
    let vendor = "";
    const vendorSelect = row.querySelector(".vendor-select");
    const vendorInput = row.querySelector(".vendor-input");
    if (vendorSelect) {
      vendor = vendorSelect.value === "new" ? "" : vendorSelect.value;
    } else if (vendorInput) {
      vendor = vendorInput.value.trim();
    }
    const amount = parseFloat(row.querySelector(".amount-input").value) || 0;
    if (vendor || amount) purchases.push({ vendor, amount });
  });
  const purchasesTotal = purchases.reduce((s, p) => s + p.amount, 0);
  
  const totalSales = num("totalSales");
  const salesTax = num("salesTax");
  const actualLottoLottery = num("lotteryActual") + num("lottoActual");
  const settlement1 = num("settlement1");
  const settlement2 = num("settlement2");
  const lotteryPayout = num("lotteryPayout");
  const totalCashPayout = num("totalCashPayout");
  const cashInHand = num("cashInHand");

  const grandTotalSales = totalSales + salesTax + actualLottoLottery;
  const grandTotalSettlements = settlement1 + settlement2 + lotteryPayout + totalCashPayout + cashInHand;
  // Over/Short = Grand Total Settlements & Cash - Grand Total Sales
  const overShort = grandTotalSettlements - grandTotalSales;
  // Inventory begins from the latest saved report/count before this report date.
  let lastInventory;
  try {
    lastInventory = await getInventoryBeforeDate(document.getElementById("reportDate").value);
  } catch (inventoryError) {
    console.error("Could not calculate inventory before report date:", inventoryError);
    showToast("Could not calculate running inventory. Please retry.", "error");
    return;
  }

  const retailPurchased = purchasesTotal / 0.67; // Convert retail purchase to inventory value
  const dailySales = totalSales; // Retail sales amount
  const newCurrentInventory = lastInventory + retailPurchased - dailySales;
  
  const payload = {
    date: document.getElementById("reportDate").value,
    employee_name: session.name || "Unknown",
    lottery_ring: num("lotteryRing"),
    lottery_actual: num("lotteryActual"),
    lottery_diff: num("lotteryRing") - num("lotteryActual"),
    lotto_ring: num("lottoRing"),
    lotto_actual: num("lottoActual"),
    lotto_diff: num("lottoRing") - num("lottoActual"),
    total_sales: totalSales,
    sales_tax: salesTax,
    actual_lotto_lottery: num("lotteryActual") + num("lottoActual"),
    settlement_1: settlement1,
    settlement_2: settlement2,
    lottery_payout: lotteryPayout,
    total_cash_payout: totalCashPayout,
    cash_in_hand: cashInHand,
    over_short: overShort,
    inventory_purchases: purchases,
    purchases_total: purchasesTotal,
    // Inventory tracking fields
    current_inventory: newCurrentInventory,
    retail_purchased: retailPurchased,
    shift_notes: document.getElementById("shiftNotes").value.trim()
  };

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  
  let result;
  if (currentEditingId) {
    // Update existing entry
    result = await supabaseClient
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", currentEditingId)
      .select();
  } else {
    // Insert new entry
    result = await supabaseClient
      .from(TABLE_NAME)
      .insert([payload])
      .select();
  }
  
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Daily Report";
  
  if (result.error) {
    console.error(result.error);
    showToast("Error saving report: " + result.error.message, "error");
  } else {
    if (currentEditingId) {
      showToast("Daily report updated successfully!");
    } else {
      showToast("Daily report submitted successfully!");
    }
    clearEditState();
    e.target.reset();
    document.getElementById("reportDate").valueAsDate = new Date();
    updateReportDayOfWeek();
    purchaseRowsContainer.innerHTML = "";
    createPurchaseRow();
    createPurchaseRow();
    recalcLottery();
    recalcSales();
    recalcPurchases();
    // Reload entry for this date in case it was just created
    checkAndLoadEntryForDate(document.getElementById("reportDate").value);
    // Reload reports data and refresh calendar
    await loadReportsData();
    renderEmployeeCalendar();
  }
});

/* ---- Expand/collapse report sections (mouse, keyboard, and touch) ---- */
document.querySelectorAll(".report-section.collapsible").forEach(section => {
  const header = section.querySelector(".pos-section-header");
  const toggleSection = () => {
    const collapsed = section.classList.toggle("is-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
  };
  header.setAttribute("aria-expanded", "true");
  header.addEventListener("click", toggleSection);
  header.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSection();
    }
  });
});

/* ---- Sticky Submit Bar Toggle on Scroll ---- */
(function initStickySubmit() {
  const form = document.getElementById("dailyReportForm");
  const sticky = document.getElementById("stickySubmit");
  if (!form || !sticky) return;
  let ticking = false;
  const updateStickyVisibility = () => {
    if (ticking) return;
    window.requestAnimationFrame(() => {
      const formRect = form.getBoundingClientRect();
      const stickyVisible = formRect.top < 0 && formRect.bottom > window.innerHeight;
      sticky.classList.toggle("hidden", !stickyVisible);
      sticky.classList.toggle("visible", stickyVisible);
      ticking = false;
    });
    ticking = true;
  };
  window.addEventListener("scroll", updateStickyVisibility, { passive: true });
  window.addEventListener("resize", updateStickyVisibility);
  updateStickyVisibility();
  setTimeout(() => {
    const formRect = form.getBoundingClientRect();
    const stickyVisible = formRect.bottom < window.innerHeight + 80;
    sticky.classList.toggle("hidden", !stickyVisible);
    sticky.classList.toggle("visible", stickyVisible);
  }, 500);
})();

/* =========================================================
   EDIT REPORT (from manager table)
   ========================================================= */
async function editReport(reportId, reportDate) {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .select("*")
      .eq("id", reportId)
      .single();
    
    if (error) throw error;
    
    // Switch to employee view
    employeeView.classList.remove("hidden");
    managerView.classList.add("hidden");
    
    // Set the date and load entry
    document.getElementById("reportDate").value = reportDate;
    updateReportDayOfWeek();
    loadEntryForEdit(data);
    
    // Focus the date input so manager can change it if needed
    setTimeout(() => {
      document.getElementById("reportDate").focus();
    }, 100);
    
    // Reload reports data and render calendar
    await loadReportsData();
    renderEmployeeCalendar();
    
    // Update back button visibility (will show for managers)
    updateBackButtonVisibility();
  } catch (err) {
    showToast("Error loading report: " + err.message, "error");
  }
}

/* =========================================================
   BACK TO DASHBOARD (Manager only)
   ========================================================= */
async function backToDashboard() {
  // Only allow managers to return to dashboard
  const session = JSON.parse(sessionStorage.getItem("cstore_user") || "{}");
  if (session.role !== "manager") {
    showToast("Access denied: Dashboard is for managers only", "error");
    return;
  }
  try {
    // Clear edit state
    clearEditState();

    // Hide vendor view if open
    vendorView.classList.add("hidden");

    // Switch to manager view
    managerView.classList.remove("hidden");
    employeeView.classList.add("hidden");

    // Reload dashboard data (await to ensure completion)
    await loadDashboardData();

    // Update back button visibility
    updateBackButtonVisibility();
  } catch (err) {
    console.error("Error returning to dashboard:", err);
    showToast("Error loading dashboard: " + err.message, "error");
    // Fallback: ensure manager view is visible
    managerView.classList.remove("hidden");
    employeeView.classList.add("hidden");
    vendorView.classList.add("hidden");
    updateBackButtonVisibility();
  }
}

/* ---- Switch to employee view for a specific date (from calendar click) ---- */
async function switchToEmployeeDate(dateStr) {
  // Clear edit state
  clearEditState();

  // Hide vendor view if open
  vendorView.classList.add("hidden");

  // Switch to employee view
  employeeView.classList.remove("hidden");
  managerView.classList.add("hidden");

  // Set the date and load entry
  document.getElementById("reportDate").value = dateStr;
  updateReportDayOfWeek();
  checkAndLoadEntryForDate(dateStr);

  // Focus the date input so manager can change it if needed
  setTimeout(() => {
    document.getElementById("reportDate").focus();
  }, 100);

  // Render employee calendar
  await loadReportsData();
  renderEmployeeCalendar();
  // Setup auto-clear of "0" values on focus
  setupZeroAutoClear();

  // Update back button visibility
  updateBackButtonVisibility();
}

// Event listener: clicking on the Date cell in the reports table opens that report for editing
document.getElementById("reportsTableBody").addEventListener("click", (e) => {
  const cell = e.target.closest("td");
  if (!cell) return;
  
  // Date column is the first column (cellIndex 0)
  if (cell.cellIndex === 0) {
    const dateText = cell.textContent.trim();
    if (dateText) {
      const report = currentReports.find(r => r.date === dateText);
      if (report) {
        cameFromManager = true;
        editReport(report.id, report.date);
      }
    }
  }
});

/* =========================================================
   LOAD ALL REPORTS DATA (no rendering)
   ========================================================= */
async function loadReportsData() {
  try {
    let query = supabaseClient.from(TABLE_NAME).select("*").order("date", { ascending: true });
    const { data, error } = await query;
    if (error) {
      console.error("Load reports error:", error);
      return;
    }
    currentReports = data || [];
  } catch (err) {
    console.error("Load reports failed:", err);
  }
}

/* =========================================================
   MANAGER DASHBOARD
   ========================================================= */
let salesLineChart, vendorPieChart, inventoryLineChart;
let overviewVendorPieChart;

const managerTabDescriptions = {
  overview: ["Overview", "Sales, inventory and vendor performance for your selected period."],
  vendors: ["Vendors", "Sales, purchases and profit margin for the selected date range."],
  inventory: ["Inventory", "Running inventory estimate and dated physical counts."],
  reports: ["Daily Reports", "Review, edit or delete reports in the selected date range."],
  lottery: ["Lottery", "Lottery and lotto performance for the selected date range."]
};

function setManagerTab(tabName) {
  const knownTab = managerTabDescriptions[tabName] ? tabName : "overview";
  document.querySelectorAll("[data-manager-tab]").forEach(button => {
    const active = button.dataset.managerTab === knownTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".manager-tab-panel").forEach(panel => {
    const active = panel.id === `managerTab-${knownTab}`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  requestAnimationFrame(() => {
    [salesLineChart, inventoryLineChart, vendorPieChart, overviewVendorPieChart]
      .filter(Boolean)
      .forEach(chart => chart.resize());
  });
}

document.querySelectorAll("[data-manager-tab]").forEach(button => {
  button.addEventListener("click", () => setManagerTab(button.dataset.managerTab));
});

/* Human-readable label for the selected period, e.g. "11/01/2026 – 11/03/2026" */
function getPeriodLabel(start, end) {
  if (!start || !end) return "";
  const fmt = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/* ---- Loads every section (cards, charts, table, vendors, calendar) for the top period ---- */
async function loadDashboardData() {
  const start = document.getElementById("filterStart").value;
  const end = document.getElementById("filterEnd").value;
  if (!start || !end) {
    showToast("Please choose both a start and end date", "error");
    return;
  }
  if (start > end) {
    showToast("Start date must be before end date", "error");
    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) {
    console.error("Dashboard load error:", error);
    showToast("Error loading reports: " + error.message, "error");
    return;
  }

  // Comparison period for the % change figures on the summary cards
  const compare = getComparisonRange(start, end);
  const { data: prevData, error: prevError } = await supabaseClient
    .from(TABLE_NAME)
    .select("*")
    .gte("date", compare.start)
    .lte("date", compare.end);
  if (prevError) console.error("Comparison load error:", prevError);

  currentReports = data || [];
  const countsResult = await supabaseClient
    .from("inventory_counts")
    .select("*")
    .gte("count_date", start)
    .lte("count_date", end)
    .order("count_date", { ascending: true });
  inventoryCounts = countsResult.error ? [] : (countsResult.data || []);
  inventoryCountTableAvailable = !countsResult.error;
  const migrationNotice = document.getElementById("inventoryMigrationNotice");
  if (migrationNotice) {
    const migrationMissing = countsResult.error && /inventory_counts|schema cache|does not exist/i.test(countsResult.error.message);
    migrationNotice.classList.toggle("hidden", !migrationMissing);
    migrationNotice.textContent = migrationMissing
      ? "Physical count saving is not set up yet. Run create_inventory_counts_table.sql in your Supabase SQL Editor, then reload the dashboard."
      : "";
  }
  if (countsResult.error && !/inventory_counts|schema cache|does not exist/i.test(countsResult.error.message)) console.error("Load physical inventory counts error:", countsResult.error);

  const historyReportsResult = await supabaseClient
    .from(TABLE_NAME)
    .select("date, total_sales, purchases_total, retail_purchased, current_inventory")
    .lte("date", end)
    .order("date", { ascending: true });
  inventoryHistoryReports = historyReportsResult.error ? currentReports : (historyReportsResult.data || []);

  const historyCountsResult = await supabaseClient
    .from("inventory_counts")
    .select("count_date, physical_inventory, system_inventory, variance, notes")
    .lte("count_date", end)
    .order("count_date", { ascending: true });
  inventoryHistoryCounts = historyCountsResult.error ? inventoryCounts : (historyCountsResult.data || []);
  inventoryCounts = inventoryHistoryCounts;

  // The calendar shows the month the selected period starts in; other panels
  // continue to use the complete shared date range.
  const startDate = parseISODate(start);
  calYear = startDate.getFullYear();
  calMonth = startDate.getMonth();

  renderSummary(currentReports, prevData || [], compare.label);
  renderCharts(currentReports, inventoryHistoryReports, inventoryHistoryCounts);
  renderTable(currentReports);
  renderCalendar();
  renderVendorList("vendorList");
  renderVendorList("overviewVendorList");
  renderVendorMetrics(currentReports);
  renderLotteryMetrics(currentReports);
  renderInventoryPanel(inventoryHistoryReports, inventoryHistoryCounts, start, end);

  const periodLabel = getPeriodLabel(start, end);
  document.getElementById("activePeriodText").textContent = periodLabel;
  document.getElementById("tableMonthLabel").textContent = periodLabel;
  document.getElementById("vendorMonthLabel").textContent = periodLabel;
  document.getElementById("reportsPeriodHeading").textContent = periodLabel;
  document.getElementById("inventoryHistoryRange").textContent = periodLabel;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}-${day}-${year}`; // mm-dd-yyyy format
}

function calculateInventoryEstimate(dateStr, reports = currentReports, counts = inventoryCounts, includeReportOnCountDate = false) {
  const sortedReports = reports
    .filter(report => report && report.date && report.date <= dateStr)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const sortedCounts = counts
    .filter(count => count && count.count_date <= dateStr)
    .slice()
    .sort((a, b) => a.count_date.localeCompare(b.count_date));
  const latestCount = sortedCounts[sortedCounts.length - 1];
  const latestReport = sortedReports[sortedReports.length - 1];

  if (latestCount) {
    const laterReports = sortedReports.filter(report =>
      report.date > latestCount.count_date || (includeReportOnCountDate && report.date === dateStr)
    );
    return laterReports.reduce((inventory, report) => {
      const retailPurchased = parseFloat(report.retail_purchased) ||
        ((parseFloat(report.purchases_total) || 0) / 0.67);
      return inventory + retailPurchased - (parseFloat(report.total_sales) || 0);
    }, parseFloat(latestCount.physical_inventory) || 0);
  }

  if (latestReport && Number.isFinite(parseFloat(latestReport.current_inventory))) {
    return parseFloat(latestReport.current_inventory);
  }

  const openingDate = "2026-10-01";
  if (dateStr < openingDate) return 100000;
  return sortedReports.reduce((inventory, report) => {
    const retailPurchased = parseFloat(report.retail_purchased) ||
      ((parseFloat(report.purchases_total) || 0) / 0.67);
    return inventory + retailPurchased - (parseFloat(report.total_sales) || 0);
  }, 100000);
}

function renderSummary(reports, prevReports, compareLabel) {
  // Filter out null entries to prevent "Cannot read properties of null" errors
  const validReports = reports.filter(r => r != null);
  const totalSales = validReports.reduce((s, r) => s + (parseFloat(r.total_sales) || 0), 0);
  const totalPurchases = validReports.reduce((s, r) => s + (parseFloat(r.purchases_total) || 0), 0);
  const avgSales = validReports.length ? totalSales / validReports.length : 0;
  const selectedEnd = document.getElementById("filterEnd").value;
  const currentInventory = selectedEnd
    ? calculateInventoryEstimate(selectedEnd, inventoryHistoryReports, inventoryHistoryCounts)
    : 100000;

  // % change compares the selected period with the comparison period (see getComparisonRange)
  const lastMonthReports = prevReports.filter(r => r != null);

  const lastTotalSales = lastMonthReports.reduce((s, r) => s + (parseFloat(r.total_sales) || 0), 0);
  const lastAvgSales = lastMonthReports.length ? lastTotalSales / lastMonthReports.length : 0;
  const lastTotalPurchases = lastMonthReports.reduce((s, r) => s + (parseFloat(r.purchases_total) || 0), 0);

  const pct = (cur, prev) => {
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
  };

  const showChanges = {
    sumTotalSalesChange: { cur: totalSales, prev: lastTotalSales },
    sumPurchasesChange: { cur: totalPurchases, prev: lastTotalPurchases },
    sumAvgSalesChange: { cur: avgSales, prev: lastAvgSales }
  };

  Object.entries(showChanges).forEach(([id, vals]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const p = pct(vals.cur, vals.prev);
    if (p === null) {
      el.textContent = "";
      el.classList.remove("text-green-600", "text-red-600");
      return;
    }
    const sign = p >= 0 ? "+" : "";
    el.textContent = ` ${sign}${p.toFixed(0)}% ${compareLabel}`;
    el.classList.toggle("text-green-600", p >= 0);
    el.classList.toggle("text-red-600", p < 0);
  });

  // Hide change elements for inventory, which is an end-of-period balance.
  const hideIds = ["sumCurrentInventoryChange"];
  hideIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = "";
      el.classList.remove("text-green-600", "text-red-600");
    }
  });

  // Update stat values
  document.getElementById("sumTotalSales").textContent = "$" + totalSales.toFixed(2);
  document.getElementById("sumPurchases").textContent = "$" + totalPurchases.toFixed(2);
  document.getElementById("sumAvgSales").textContent = "$" + avgSales.toFixed(2);
  document.getElementById("sumCurrentInventory").textContent = "$" + currentInventory.toFixed(2);
}

function renderVendorMetrics(reports) {
  const validReports = reports.filter(report => report != null);
  const totalSales = validReports.reduce((sum, report) => sum + (parseFloat(report.total_sales) || 0), 0);
  const totalPurchases = validReports.reduce((sum, report) => sum + (parseFloat(report.purchases_total) || 0), 0);
  const profitMargin = totalSales > 0 ? ((totalSales - totalPurchases) / totalSales) * 100 : null;
  document.getElementById("vendorsTotalSales").textContent = `$${totalSales.toFixed(2)}`;
  document.getElementById("vendorsTotalPurchases").textContent = `$${totalPurchases.toFixed(2)}`;
  document.getElementById("vendorsProfitMargin").textContent = profitMargin === null ? "—" : `${profitMargin.toFixed(2)}%`;
}

function renderLotteryMetrics(reports) {
  const validReports = reports.filter(report => report != null);
  const sum = field => validReports.reduce((total, report) => total + (parseFloat(report[field]) || 0), 0);
  document.getElementById("lotteryTotalSales").textContent = `$${sum("lottery_actual").toFixed(2)}`;
  document.getElementById("lottoTotalSales").textContent = `$${sum("lotto_actual").toFixed(2)}`;
  const combinedLotterySales = sum("lottery_actual") + sum("lotto_actual");
  document.getElementById("lotteryOverallSales").textContent = `$${combinedLotterySales.toFixed(2)}`;
  document.getElementById("lotteryPayoutTotal").textContent = `$${sum("lottery_payout").toFixed(2)}`;
}

function renderInventoryPanel(reports, counts, start, end) {
  const endInventory = calculateInventoryEstimate(end, reports, counts);
  const latestCount = counts
    .filter(count => count.count_date <= end)
    .slice()
    .sort((a, b) => b.count_date.localeCompare(a.count_date))[0];

  document.getElementById("inventoryRunningValue").textContent = `$${endInventory.toFixed(2)}`;
  document.getElementById("inventoryAsOf").textContent = `System estimate as of ${formatDate(end)}`;
  document.getElementById("inventoryPhysicalValue").textContent = latestCount
    ? `$${(parseFloat(latestCount.physical_inventory) || 0).toFixed(2)}`
    : "—";
  document.getElementById("inventoryPhysicalDate").textContent = latestCount
    ? `Counted ${formatDate(latestCount.count_date)}`
    : "No physical count recorded in this period";

  const tableBody = document.getElementById("inventoryCountsBody");
  const visibleCounts = counts
    .filter(count => count.count_date >= start && count.count_date <= end)
    .slice()
    .sort((a, b) => b.count_date.localeCompare(a.count_date));

  if (!visibleCounts.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-400 py-5">No physical counts recorded in this date range.</td></tr>';
    return;
  }

  tableBody.innerHTML = visibleCounts.map(count => {
    const variance = parseFloat(count.variance) || 0;
    const varianceClass = variance < 0 ? "text-red-600" : "text-green-600";
    const varianceLabel = variance < 0 ? "Short" : "Over";
    return `<tr class="border-b border-slate-100">
      <td class="py-2 pr-4">${formatDate(count.count_date)}</td>
      <td class="py-2 pr-4">$${(parseFloat(count.physical_inventory) || 0).toFixed(2)}</td>
      <td class="py-2 pr-4">$${(parseFloat(count.system_inventory) || 0).toFixed(2)}</td>
      <td class="py-2 pr-4 ${varianceClass} font-semibold">${variance < 0 ? "-" : "+"}$${Math.abs(variance).toFixed(2)} ${varianceLabel}</td>
      <td class="py-2 pr-4 text-slate-500">${escapeHTML(count.notes || "")}</td>
    </tr>`;
  }).join("");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

document.getElementById("inventoryCountForm").addEventListener("submit", async event => {
  event.preventDefault();
  const countDate = document.getElementById("inventoryCountDate").value;
  const physicalInventory = parseFloat(document.getElementById("inventoryCountAmount").value);
  const notes = document.getElementById("inventoryCountNotes").value.trim();
  if (!countDate || !Number.isFinite(physicalInventory) || physicalInventory < 0) {
    showToast("Enter a valid count date and non-negative inventory amount", "error");
    return;
  }
  if (inventoryCountTableAvailable === false) {
    showToast("Run create_inventory_counts_table.sql in Supabase before saving counts", "error");
    return;
  }

  const submitButton = document.getElementById("saveInventoryCountBtn");
  submitButton.disabled = true;
  try {
    const [reportHistoryResult, countsHistoryResult] = await Promise.all([supabaseClient
      .from(TABLE_NAME)
      .select("date, total_sales, purchases_total, retail_purchased, current_inventory")
      .lte("date", countDate)
      .order("date", { ascending: true }),
    supabaseClient
      .from("inventory_counts")
      .select("count_date, physical_inventory")
      .lt("count_date", countDate)
      .order("count_date", { ascending: true })]);
    if (reportHistoryResult.error) throw reportHistoryResult.error;
    if (countsHistoryResult.error && !/inventory_counts|schema cache|does not exist/i.test(countsHistoryResult.error.message)) {
      throw countsHistoryResult.error;
    }
    const countsBeforeDate = countsHistoryResult.error ? [] : (countsHistoryResult.data || []);
    const systemInventory = calculateInventoryEstimate(countDate, reportHistoryResult.data || [], countsBeforeDate, true);
    const variance = physicalInventory - systemInventory;
    const { error } = await supabaseClient
      .from("inventory_counts")
      .upsert({
        count_date: countDate,
        physical_inventory: physicalInventory,
        system_inventory: systemInventory,
        variance,
        notes
      }, { onConflict: "count_date" });
    if (error) throw error;

    showToast(`Physical count saved. ${variance < 0 ? "Short" : "Over"} by $${Math.abs(variance).toFixed(2)}.`);
    document.getElementById("inventoryCountForm").reset();
    await loadDashboardData();
  } catch (error) {
    console.error("Save physical inventory count error:", error);
    if (/inventory_counts|schema cache|does not exist/i.test(error.message || "")) {
      inventoryCountTableAvailable = false;
      const notice = document.getElementById("inventoryMigrationNotice");
      notice.textContent = "Physical count saving is not set up yet. Run create_inventory_counts_table.sql in your Supabase SQL Editor, then reload the dashboard.";
      notice.classList.remove("hidden");
    }
    showToast("Could not save physical count: " + error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

function renderCharts(reports, historyReports = reports, historyCounts = inventoryCounts) {
  // Filter out null entries to prevent "Cannot read properties of null" errors
  const validReports = reports.filter(r => r != null);
  const labels = validReports.map(r => r.date);
  const salesData = validReports.map(r => parseFloat(r.total_sales) || 0);

  const vendorTotals = {};
  validReports.forEach(r => {
    (r.inventory_purchases || []).forEach(p => {
      const vendor = p.vendor || "Unknown";
      vendorTotals[vendor] = (vendorTotals[vendor] || 0) + (parseFloat(p.amount) || 0);
    });
  });
  const vendorLabels = Object.keys(vendorTotals);
  const vendorData = Object.values(vendorTotals);

  if (salesLineChart) salesLineChart.destroy();
  if (vendorPieChart) vendorPieChart.destroy();
  if (overviewVendorPieChart) overviewVendorPieChart.destroy();
  if (inventoryLineChart) inventoryLineChart.destroy();

  salesLineChart = new Chart(document.getElementById("salesLineChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Total Sales ($)",
        data: validReports.map((report, index) =>
          validReports.slice(0, index + 1).reduce((total, item) => total + (parseFloat(item.total_sales) || 0), 0)
        ),
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29,78,216,0.1)",
        tension: 0.3,
        fill: true
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  inventoryLineChart = new Chart(document.getElementById("inventoryLineChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Current Inventory ($)",
        data: validReports.map(r => calculateInventoryEstimate(r.date, historyReports, historyCounts)),
        borderColor: "#16a34a",
        backgroundColor: "rgba(22,163,74,0.1)",
        tension: 0.3,
        fill: true
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  const vendorChartConfig = {
    type: "doughnut",
    data: {
      labels: vendorLabels,
      datasets: [{
        data: vendorData,
        backgroundColor: ["#1d4ed8","#16a34a","#dc2626","#ca8a04","#9333ea","#0891b2","#ea580c","#4b5563"]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        // The adjacent vendor list already provides the legend; keeping a
        // second wrapped legend can squeeze the doughnut into an ellipse.
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const amount = Number(context.parsed) || 0;
              return `${context.label}: ${new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD"
              }).format(amount)}`;
            }
          }
        }
      }
    }
  };
  vendorPieChart = new Chart(document.getElementById("vendorPieChart"), vendorChartConfig);
  overviewVendorPieChart = new Chart(document.getElementById("overviewVendorPieChart"), {
    ...vendorChartConfig,
    data: {
      ...vendorChartConfig.data,
      datasets: vendorChartConfig.data.datasets.map(dataset => ({ ...dataset }))
    }
  });
}

function renderTable(reports) {
  console.log("=== renderTable START ===");
  console.log("Reports count:", reports?.length || 0);
  const tbody = document.getElementById("reportsTableBody");
  console.log("tbody element found:", !!tbody);
  if (!tbody) {
    console.error("reportsTableBody element NOT FOUND!");
    return;
  }
  tbody.innerHTML = "";
  // Show every report in the selected period; filter out null entries first
  const validReports = reports.filter(r => r != null);
  validReports.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 hover:bg-slate-50";
    tr.innerHTML = `
      <td class="py-2 pr-4">${formatDate(r.date)}</td>
      <td class="py-2 pr-4">${r.employee_name ?? ""}</td>
      <td class="py-2 pr-4">$${(parseFloat(r.total_sales) || 0).toFixed(2)}</td>
      <td class="py-2 pr-4 ${parseFloat(r.over_short) < 0 ? "text-red-600" : "text-blue-700"} font-medium">${parseFloat(r.over_short) < 0 ? "-" : ""}$${Math.abs(parseFloat(r.over_short) || 0).toFixed(2)}</td>
      <td class="py-2 pr-4">$${(parseFloat(r.purchases_total) || 0).toFixed(2)}</td>
      <td class="py-2 pr-4 text-slate-500">${r.shift_notes ?? ""}</td>
      ${r.id ? `
            <td class="py-2 pr-4">
              <div class="flex gap-1">
                <button class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-xs" onclick="cameFromManager=true; editReport('${r.id}', '${r.date}')">Edit</button>
                <button class="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-3 rounded text-xs" onclick="deleteReport('${r.id}', '${r.date}')">Delete</button>
              </div>
            </td>
          ` : ""}
    `;
    tbody.appendChild(tr);
  });
  console.log("renderTable DONE - tbody innerHTML length:", tbody.innerHTML.length);
  console.log("=== renderTable END ===");
}

/* =========================================================
   DELETE REPORT (Manager only)
   ========================================================= */
async function deleteReport(reportId, reportDate) {
  if (!confirm('Are you sure you want to delete this daily report?')) return;
  
  try {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .delete()
      .eq('id', reportId);
    
    if (error) throw error;
    
    showToast('Daily report deleted successfully!');
    
    // Reload dashboard data
    loadDashboardData();
  } catch (err) {
    showToast('Error deleting report: ' + err.message, 'error');
  }
}

/* =========================================================
   RENDER CALENDAR
   ========================================================= */
function renderCalendar() {
  const calGrid = document.getElementById("calendarGrid");
  calGrid.innerHTML = "";
  const calMonthYear = document.getElementById("calMonthYear");
  const start = parseISODate(document.getElementById("filterStart").value);
  const end = parseISODate(document.getElementById("filterEnd").value);
  calMonthYear.textContent = getPeriodLabel(document.getElementById("filterStart").value, document.getElementById("filterEnd").value);
  const monthSales = {};
  const monthReportIds = {};
  currentReports.filter(report => report != null).forEach(report => {
    monthSales[report.date] = (monthSales[report.date] || 0) + (parseFloat(report.total_sales) || 0);
    monthReportIds[report.date] = report.id;
  });

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [];
  let monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (monthCursor <= lastMonth) {
    months.push(new Date(monthCursor));
    monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  }

  calGrid.innerHTML = months.map(monthDate => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let daysHtml = weekdays.map(day => `<div class="calendar-weekday">${day}</div>`).join("");
    for (let blank = 0; blank < firstWeekday; blank++) daysHtml += '<div class="calendar-day calendar-day-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dateIsSelected = dateStr >= document.getElementById("filterStart").value && dateStr <= document.getElementById("filterEnd").value;
      const hasData = dateIsSelected && monthSales[dateStr] !== undefined;
      const reportId = monthReportIds[dateStr];
      const clickHandler = reportId
        ? `cameFromManager=true; editReport('${reportId}', '${dateStr}')`
        : `switchToEmployeeDate('${dateStr}')`;
      daysHtml += `<button type="button" class="calendar-day ${dateIsSelected ? "calendar-day-selected" : "calendar-day-outside"} ${hasData ? "calendar-day-has-data" : ""}" onclick="${clickHandler}" ${dateIsSelected ? "" : "disabled"}><span>${day}</span><strong>${hasData ? `$${monthSales[dateStr].toFixed(0)}` : "—"}</strong></button>`;
    }
    return `<section class="calendar-month"><h4>${monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h4><div class="calendar-grid">${daysHtml}</div></section>`;
  }).join("");
}

/* =========================================================
   EMPLOYEE MONTHLY SALES CALENDAR
   ========================================================= */
function renderEmployeeCalendar() {
  const calGrid = document.getElementById("empCalendarGrid");
  calGrid.innerHTML = "";
  const calMonthYear = document.getElementById("empCalMonthYear");
  const now = new Date();
  const viewYear = empCalYear || now.getFullYear();
  const viewMonth = empCalMonth ?? now.getMonth(); // 0-indexed, default to current month
  calMonthYear.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDay = firstDay.getDay();

  const monthSales = {};
  const monthReportIds = {};
  // Filter out null entries to prevent "Cannot read properties of null" errors
  const validCurrentReports = currentReports.filter(r => r != null);
  validCurrentReports.forEach(r => {
    const d = new Date(r.date + "T00:00:00");
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      const key = r.date;
      monthSales[key] = (monthSales[key] || 0) + (parseFloat(r.total_sales) || 0);
      monthReportIds[key] = r.id;
    }
  });

  let html = "";
  for (let i = 0; i < startDay; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasData = monthSales[dateStr] !== undefined;
    const sales = monthSales[dateStr] || 0;
    const reportId = monthReportIds[dateStr] || "";
    const clickHandler = reportId
      ? `cameFromManager=true; editReport('${reportId}', '${dateStr}')`
      : `switchToEmployeeDate('${dateStr}')`;
    html += `<div class="p-2 rounded text-xs cursor-pointer hover:bg-blue-100 ${hasData ? "bg-blue-50 text-blue-900 font-semibold" : "text-slate-500"}" onclick="${clickHandler}">${d}<div class="text-[10px]">$${sales.toFixed(0)}</div></div>`;
  }
  calGrid.innerHTML = html;
}

document.getElementById("empCalPrevMonth").addEventListener("click", () => {
  empCalMonth = (empCalMonth ?? new Date().getMonth()) - 1;
  if (empCalMonth < 0) { empCalMonth = 11; empCalYear = (empCalYear ?? new Date().getFullYear()) - 1; }
  renderEmployeeCalendar();
});

document.getElementById("empCalNextMonth").addEventListener("click", () => {
  empCalMonth = (empCalMonth ?? new Date().getMonth()) + 1;
  if (empCalMonth > 11) { empCalMonth = 0; empCalYear = (empCalYear ?? new Date().getFullYear()) + 1; }
  renderEmployeeCalendar();
});

/* =========================================================
   AUTO-CLEAR "0" ON INPUT FOCUS
   ========================================================= */
function setupZeroAutoClear() {
  const zeroInputs = document.querySelectorAll('input[type="number"][value="0"]');
  zeroInputs.forEach(input => {
    input.addEventListener("focus", function() {
      if (this.value === "0" || this.value === "0.00") {
        this.value = "";
      }
    });
  });
}




function renderVendorList(elementId = "vendorList") {
  const vendorListEl = document.getElementById(elementId);
  if (!vendorListEl) return;

  // Collect vendor totals for every report in the selected period
  const vendorTotals = {};
  // Filter out null entries to prevent "Cannot read properties of null" errors
  const validCurrentReports = currentReports.filter(r => r != null);
  validCurrentReports.forEach(r => {
    (r.inventory_purchases || []).forEach(p => {
      const vendor = p.vendor || "Unknown";
      vendorTotals[vendor] = (vendorTotals[vendor] || 0) + (parseFloat(p.amount) || 0);
    });
  });
  
  // Sort by amount descending
  const sortedVendors = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1]);
  
  if (sortedVendors.length === 0) {
    vendorListEl.innerHTML = '<div class="p-4 text-slate-400 text-sm text-center">No purchases in this period</div>';
    return;
  }
  
  vendorListEl.innerHTML = sortedVendors.map(([vendor, amount]) => `
    <div class="flex justify-between items-center p-2 border-b border-slate-100 text-sm">
      <span class="font-medium text-slate-800">${escapeHTML(vendor)}</span>
      <span class="font-bold text-slate-900">$${amount.toFixed(2)}</span>
    </div>
  `).join('');
}



/* ---- Period selection: Prev / Current / Next / Custom (one source for every section) ---- */
// Declared as function declarations (not const) so they are safe to call during startup
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toISODate(first), end: toISODate(last) };
}

/* Comparison period for the % change figures: the previous calendar month when the
   range is a full month, otherwise the same number of days immediately before it. */
function getComparisonRange(start, end) {
  const s = parseISODate(start);
  const e = parseISODate(end);
  const lastDayOfStartMonth = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  const isFullMonth =
    s.getDate() === 1 &&
    e.getFullYear() === s.getFullYear() &&
    e.getMonth() === s.getMonth() &&
    e.getDate() === lastDayOfStartMonth;

  if (isFullMonth) {
    return {
      start: toISODate(new Date(s.getFullYear(), s.getMonth() - 1, 1)),
      end: toISODate(new Date(s.getFullYear(), s.getMonth(), 0)),
      label: "vs last month"
    };
  }

  const days = Math.round((e - s) / 86400000) + 1;
  return {
    start: toISODate(new Date(s.getFullYear(), s.getMonth(), s.getDate() - days)),
    end: toISODate(new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1)),
    label: "vs previous period"
  };
}

function highlightPeriodButtons(mode) {
  document.querySelectorAll(".period-btn").forEach(btn => {
    const active = btn.dataset.period === mode;
    btn.classList.toggle("bg-indigo-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-indigo-600", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("text-slate-700", !active);
    btn.classList.toggle("border-slate-300", !active);
  });
}

function setPeriod(period) {
  const customRange = document.getElementById("customRange");
  if (period === "custom") {
    customRange.style.display = "flex";
    highlightPeriodButtons("custom");
    return;
  }
  customRange.style.display = "none";

  let base = new Date();
  if (period === "prev" || period === "next") {
    // Move one month from the month currently shown in the Start Date
    const shown = document.getElementById("filterStart").value;
    if (shown) base = parseISODate(shown);
    base = new Date(base.getFullYear(), base.getMonth() + (period === "next" ? 1 : -1), 1);
  }

  const range = monthRange(base);
  document.getElementById("filterStart").value = range.start;
  document.getElementById("filterEnd").value = range.end;
  highlightPeriodButtons(period === "current" ? "current" : "none");
}

document.querySelectorAll(".period-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    setPeriod(btn.dataset.period);
    if (btn.dataset.period !== "custom") loadDashboardData();
  });
});

document.getElementById("applyFilterBtn").addEventListener("click", loadDashboardData);

/* =========================================================
   EXCEL EXPORT (SheetJS)
   ========================================================= */
document.getElementById("exportExcelBtn").addEventListener("click", () => {
  // Filter out null entries to prevent "Cannot read properties of null" errors
  const validReports = currentReports.filter(r => r != null);
  if (!validReports.length) {
    showToast("No data to export", "error");
    return;
  }
  const exportData = validReports.map(r => ({
    Date: r.date,
    Employee: r.employee_name,
    "Lottery Ring": r.lottery_ring,
    "Lottery Actual": r.lottery_actual,
    "Lottery Diff": r.lottery_diff,
    "Lotto Ring": r.lotto_ring,
    "Lotto Actual": r.lotto_actual,
    "Lotto Diff": r.lotto_diff,
    "Total Sales": r.total_sales,
    "Sales Tax": r.sales_tax,
    "Settlement 1": r.settlement_1,
    "Settlement 2": r.settlement_2,
    "Lottery Payout": r.lottery_payout,
    "Total Cash Payout": r.total_cash_payout,
    "Cash in Hand": r.cash_in_hand,
    "Over/Short": r.over_short,
    "Purchases Total": r.purchases_total,
    "Shift Notes": r.shift_notes
  }));
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily Reports");
  XLSX.writeFile(wb, `daily_reports_${document.getElementById("filterStart").value}_to_${document.getElementById("filterEnd").value}.xlsx`);
});

/* =========================================================
   VENDOR DATABASE - LOAD FROM SUPABASE
   ========================================================= */
async function loadVendorsFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from('vendors')
      .select('name, id')
      .order('name', { ascending: true });
    
    if (error) throw error;
    window.existingVendors = data ? data.map(v => v.name) : [];
    renderVendorDropdowns();
    showToast(`Loaded ${window.existingVendors.length} vendors from database`);
  } catch (err) {
    console.error('Error loading vendors:', err);
    showToast('Error loading vendors: ' + err.message, 'error');
  }
}

function renderVendorDropdowns() {
  const vendorOptions = window.existingVendors 
    ? window.existingVendors.map(v => `<option value="${v}">${v}</option>`).join('')
    : '';
  
  const newVendorOption = '<option value="new" class="new-vendor-option">+ Add New Vendor</option>';
  
  document.querySelectorAll('.vendor-select').forEach(select => {
    const currentValue = select.value; // Preserve already-set vendor values
    const innerHTML = '<option value="">Select vendor...</option>' + vendorOptions + newVendorOption;
    select.innerHTML = innerHTML;
    // Restore current value if it exists as an option
    if (currentValue) {
      const existingOption = Array.from(select.options).find(o => o.value === currentValue);
      if (existingOption) {
        select.value = currentValue;
      } else {
        // Add custom option for vendor names not in the standard list
        const option = document.createElement("option");
        option.value = currentValue;
        option.textContent = currentValue;
        const newOpt = select.querySelector(".new-vendor-option");
        if (newOpt) {
          select.insertBefore(option, newOpt);
        } else {
          select.appendChild(option);
        }
        select.value = currentValue;
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const session = JSON.parse(sessionStorage.getItem('cstore_user') || '{}');
  if (session.role === 'employee' || session.role === 'manager') {
    loadVendorsFromSupabase();
  }
});

function openVendorModal() {
  // Legacy modal - kept for compatibility
  document.getElementById('vendorModal').classList.remove('hidden');
  loadExistingVendorsForModal();
}

function closeVendorModal() {
  document.getElementById('vendorModal').classList.add('hidden');
}

/* =========================================================
   NEW VENDOR VIEW FUNCTIONS
   ========================================================= */

function openVendorView() {
  // Hide current view
  document.getElementById('employeeView').classList.add('hidden');
  document.getElementById('managerView').classList.add('hidden');
  // Show vendor view
  document.getElementById('vendorView').classList.remove('hidden');
  // Load vendors
  loadVendorsForView();
}

function backToMainView() {
  document.getElementById('vendorView').classList.add('hidden');
  const session = JSON.parse(sessionStorage.getItem('cstore_user') || '{}');
  if (session.role === 'manager') {
    document.getElementById('managerView').classList.remove('hidden');
  } else {
    document.getElementById('employeeView').classList.remove('hidden');
  }
}

async function loadVendorsForView() {
  try {
    const { data, error } = await supabaseClient
      .from('vendors')
      .select('name, representative, phone, id')
      .order('name', { ascending: true });

    if (error) throw error;

    const tbody = document.getElementById('vendorsTableBody');
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-4">No vendors found. Add one above!</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(v => `
      <tr class="border-b border-slate-100" data-vendor-id="${v.id}">
        <td class="py-2 pr-4 vendor-name-cell">${v.name || ''}</td>
        <td class="py-2 pr-4 vendor-rep-cell">${v.representative || '—'}</td>
        <td class="py-2 pr-4 vendor-phone-cell">${v.phone || '—'}</td>
        <td class="py-2 pr-4">
          <div class="flex gap-1">
            <button type="button" onclick="startEditVendor('${v.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-xs">Edit</button>
            <button type="button" onclick="deleteVendorInline('${v.id}', '${(v.name || '').replace(/'/g, "\\'")}')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1 px-3 rounded text-xs">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading vendors:', err);
    showToast('Error loading vendors: ' + err.message, 'error');
  }
}

function startEditVendor(vendorId) {
  const row = document.querySelector(`tr[data-vendor-id="${vendorId}"]`);
  if (!row) return;

  const name = row.querySelector('.vendor-name-cell').textContent;
  const rep = row.querySelector('.vendor-rep-cell').textContent;
  const phone = row.querySelector('.vendor-phone-cell').textContent;

  row.innerHTML = `
    <td class="py-2 pr-4">
      <input type="text" id="editName_${vendorId}" value="${name}" class="field-input w-full text-sm" />
    </td>
    <td class="py-2 pr-4">
      <input type="text" id="editRep_${vendorId}" value="${rep === '—' ? '' : rep}" class="field-input w-full text-sm" />
    </td>
    <td class="py-2 pr-4">
      <input type="text" id="editPhone_${vendorId}" value="${phone === '—' ? '' : phone}" class="field-input w-full text-sm" />
    </td>
    <td class="py-2 pr-4">
      <div class="flex gap-1">
        <button type="button" onclick="saveVendorEdit('${vendorId}')" class="bg-blue-700 hover:bg-blue-800 text-white font-bold py-1 px-3 rounded text-xs">Save</button>
        <button type="button" onclick="cancelVendorEdit('${vendorId}')" class="bg-slate-300 hover:bg-slate-400 text-slate-700 font-bold py-1 px-3 rounded text-xs">Cancel</button>
      </div>
    </td>
  `;
}

async function saveVendorEdit(vendorId) {
  const name = document.getElementById(`editName_${vendorId}`).value.trim();
  const representative = document.getElementById(`editRep_${vendorId}`).value.trim();
  const phone = document.getElementById(`editPhone_${vendorId}`).value.trim();

  if (!name) {
    showToast('Vendor name is required', 'error');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('vendors')
      .update({ name, representative, phone })
      .eq('id', vendorId);

    if (error) throw error;

    showToast('Vendor updated successfully!');
    loadVendorsForView();
  } catch (err) {
    showToast('Error updating vendor: ' + err.message, 'error');
  }
}

function cancelVendorEdit(vendorId) {
  loadVendorsForView();
}

async function deleteVendorInline(vendorId, vendorName) {
  if (!confirm(`Are you sure you want to delete "${vendorName}"?`)) return;

  try {
    const { error } = await supabaseClient
      .from('vendors')
      .delete()
      .eq('id', vendorId);

    if (error) throw error;

    showToast('Vendor deleted successfully!');
    loadVendorsForView();
  } catch (err) {
    showToast('Error deleting vendor: ' + err.message, 'error');
  }
}

async function addVendor() {
  const name = document.getElementById('vendorName').value.trim();
  const representative = document.getElementById('vendorRep').value.trim();
  const phone = document.getElementById('vendorPhone').value.trim();

  if (!name) {
    showToast('Vendor name is required', 'error');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('vendors')
      .insert([{ name, representative, phone, is_active: true }]);

    if (error) throw error;

    showToast(`Vendor "${name}" added successfully!`);

    // Clear form
    document.getElementById('vendorName').value = '';
    document.getElementById('vendorRep').value = '';
    document.getElementById('vendorPhone').value = '';

    // Reload vendor list
    loadVendorsForView();
    loadVendorsFromSupabase(); // Also refresh dropdowns
  } catch (err) {
    showToast('Error adding vendor: ' + err.message, 'error');
  }
}

async function loadExistingVendorsForModal() {
  try {
    const { data, error } = await supabaseClient
      .from('vendors')
      .select('name, representative, phone, id')
      .order('name', { ascending: true });
    
    if (error) throw error;
    
    // Populate edit vendor dropdown
    const editSelect = document.getElementById('vendorToEdit');
    editSelect.innerHTML = '<option value="">Select vendor to edit...</option>';
    if (data) {
      data.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = v.name;
        editSelect.appendChild(option);
      });
      
      // Show existing vendors list
      const vendorsList = document.getElementById('existingVendorsList');
      vendorsList.innerHTML = data.map(v => `
        <div class="flex justify-between items-center p-2 border-b border-slate-100 text-sm">
          <span>${v.name}</span>
          <span class="text-slate-500">${v.representative || '—'} • ${v.phone || '—'}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading vendors for modal:', err);
    showToast('Error loading vendors: ' + err.message, 'error');
  }
}

async function addNewVendor() {
  const name = document.getElementById('newVendorName').value.trim();
  const representative = document.getElementById('newRepName').value.trim();
  const phone = document.getElementById('newPhone').value.trim();
  
  if (!name) {
    showToast('Vendor name is required', 'error');
    return;
  }
  
  try {
    const { error } = await supabaseClient
      .from('vendors')
      .insert([{ name, representative, phone, is_active: true }]);
    
    if (error) throw error;
    
    showToast(`Vendor "${name}" added successfully!`);
    
    // Clear form
    document.getElementById('newVendorName').value = '';
    document.getElementById('newRepName').value = '';
    document.getElementById('newPhone').value = '';
    
    // Reload vendors
    loadVendorsFromSupabase();
    loadExistingVendorsForModal();
  } catch (err) {
    showToast('Error adding vendor: ' + err.message, 'error');
  }
}

async function editVendor() {
  const vendorId = document.getElementById('vendorToEdit').value;
  const name = document.getElementById('newVendorNameEdit').value.trim();
  const representative = document.getElementById('newRepNameEdit').value.trim();
  const phone = document.getElementById('newPhoneEdit').value.trim();
  
  if (!vendorId) {
    showToast('Please select a vendor to edit', 'error');
    return;
  }
  
  try {
    const { error } = await supabaseClient
      .from('vendors')
      .update({ name, representative, phone })
      .eq('id', vendorId);
    
    if (error) throw error;
    
    showToast(`Vendor updated successfully!`);
    
    // Clear form
    document.getElementById('vendorToEdit').value = '';
    document.getElementById('newVendorNameEdit').value = '';
    document.getElementById('newRepNameEdit').value = '';
    document.getElementById('newPhoneEdit').value = '';
    
    // Reload vendors
    loadVendorsFromSupabase();
    loadExistingVendorsForModal();
  } catch (err) {
    showToast('Error updating vendor: ' + err.message, 'error');
  }
}

async function deleteVendor() {
  const vendorId = document.getElementById('vendorToEdit').value;
  
  if (!vendorId) {
    showToast('Please select a vendor to delete', 'error');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this vendor?')) return;
  
  try {
    const { error } = await supabaseClient
      .from('vendors')
      .delete()
      .eq('id', vendorId);
    
    if (error) throw error;
    
    showToast('Vendor deleted successfully!');
    
    // Clear form
    document.getElementById('vendorToEdit').value = '';
    document.getElementById('newVendorNameEdit').value = '';
    document.getElementById('newRepNameEdit').value = '';
    document.getElementById('newPhoneEdit').value = '';
    
    // Reload vendors
    loadVendorsFromSupabase();
    loadExistingVendorsForModal();
  } catch (err) {
    showToast('Error deleting vendor: ' + err.message, 'error');
  }
}

