// ========================================================
// GastosApp Client Controller - NanoLabs
// Smart Financial Assistant & Payment Tracking Engine
// ========================================================

const CATEGORY_ICONS = {
  Servicios: '💡',
  Alquiler: '🏠',
  Comida: '🍔',
  Transporte: '🚗',
  Tarjetas: '💳',
  Salud: '💊',
  Ocio: '🎉',
  Educación: '📚',
  Otros: '📦',
  Sueldo: '💼',
  Extra: '💵',
  Freelance: '💻',
  Ventas: '🛒',
  Inversión: '📈',
  Regalo: '🎁'
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

class GastosApp {
  constructor() {
    const today = new Date();
    this.currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    this.settings = { salary: 0, currency: '$', currencyCode: 'ARS' };
    this.summary = null;
    this.expenses = [];
    this.incomes = [];
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.deferredPrompt = null;

    this.initElements();
    this.bindEvents();
    this.initPwa();
    this.initBrowserNotifications();
    this.loadAll();
  }

  getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  initElements() {
    // Header & Navigation
    this.elMonthLabel = document.getElementById('currentMonthLabel');
    this.elMonthPicker = document.getElementById('monthPickerInput');
    this.btnPrevMonth = document.getElementById('btnPrevMonth');
    this.btnNextMonth = document.getElementById('btnNextMonth');

    // Assistant Hero
    this.elAssistantBanner = document.getElementById('assistantHeroBanner');
    this.elAssistantAvatar = document.getElementById('assistantAvatar');
    this.elAssistantStatusChip = document.getElementById('assistantStatusChip');
    this.elAssistantHeadline = document.getElementById('assistantHeadline');
    this.elAssistantDetail = document.getElementById('assistantDetail');
    this.elAssistantProgressPct = document.getElementById('assistantProgressPct');
    this.btnViewPendingAlerts = document.getElementById('btnViewPendingAlerts');
    this.btnAlertsText = document.getElementById('btnAlertsText');

    // Master KPIs
    this.elBalance = document.getElementById('balanceAmount');
    this.elBalanceCurrency = document.getElementById('balanceCurrency');
    this.elBalanceStatusPill = document.getElementById('balanceStatusPill');
    this.elProgressBar = document.getElementById('budgetProgressBar');
    this.elSpentPercentage = document.getElementById('spentPercentageLabel');
    this.elDailyBudget = document.getElementById('dailyBudgetLabel');

    this.elTotalIncome = document.getElementById('kpiTotalIncome');
    this.elSalarySub = document.getElementById('kpiSalarySub');
    this.elExtraIncomeSub = document.getElementById('kpiExtraIncomeSub');

    this.elTotalPaid = document.getElementById('kpiTotalPaid');
    this.elCashOnHand = document.getElementById('kpiCashOnHand');
    this.elPaidPct = document.getElementById('kpiPaidPct');
    this.elBadgePaidCount = document.getElementById('badgePaidCount');

    this.elTotalPending = document.getElementById('kpiTotalPending');
    this.elFixedPendingSub = document.getElementById('kpiFixedPendingSub');
    this.elVarPendingSub = document.getElementById('kpiVarPendingSub');
    this.elBadgePendingCount = document.getElementById('badgePendingCount');

    // Columns & Lists
    this.elPendingList = document.getElementById('pendingExpensesList');
    this.elPendingEmpty = document.getElementById('pendingEmptyState');
    this.elPanelPendingTotal = document.getElementById('panelPendingTotal');

    this.elPaidList = document.getElementById('paidExpensesList');
    this.elPaidEmpty = document.getElementById('paidEmptyState');
    this.elPanelPaidTotal = document.getElementById('panelPaidTotal');

    this.elIncomesList = document.getElementById('incomesList');
    this.elIncomesEmpty = document.getElementById('incomesEmptyState');
    this.elSalaryDisplayBig = document.getElementById('salaryDisplayBig');

    // Stats
    this.elCategoryBars = document.getElementById('categoryBreakdownList');
    this.elBarCompFixed = document.getElementById('barCompFixed');
    this.elBarCompVar = document.getElementById('barCompVar');
    this.elCompRatioLabel = document.getElementById('compRatioLabel');
    this.elLegendFixedVal = document.getElementById('legendFixedVal');
    this.elLegendVarVal = document.getElementById('legendVarVal');

    // Mobile badges
    this.elMBadgePending = document.getElementById('mBadgePending');
    this.elMBadgePaid = document.getElementById('mBadgePaid');

    // Notifications
    this.btnNotifications = document.getElementById('btnNotifications');
    this.elNotificationBadge = document.getElementById('notificationBadge');
    this.modalNotificationsBackdrop = document.getElementById('modalNotificationsBackdrop');
    this.btnCloseNotificationsModal = document.getElementById('btnCloseNotificationsModal');
    this.elNotificationsList = document.getElementById('notificationsItemsList');
    this.btnEnableBrowserNotifications = document.getElementById('btnEnableBrowserNotifications');

    // Modals & Sheets
    this.modalExpenseBackdrop = document.getElementById('modalExpenseBackdrop');
    this.modalIncomeBackdrop = document.getElementById('modalIncomeBackdrop');
    this.modalSalaryBackdrop = document.getElementById('modalSalaryBackdrop');

    // Forms
    this.formExpense = document.getElementById('formExpense');
    this.formIncome = document.getElementById('formIncome');
    this.formSalary = document.getElementById('formSalary');

    // Inputs inside expense modal
    this.inputExpenseDate = document.getElementById('expenseDate');
    this.inputExpenseDueDate = document.getElementById('expenseDueDate');
    this.inputExpenseAmount = document.getElementById('expenseAmount');
    this.inputExpenseTitle = document.getElementById('expenseTitle');
    this.inputExpenseCategory = document.getElementById('expenseCategory');
    this.inputExpenseIsFixed = document.getElementById('expenseIsFixed');
    this.inputExpenseFixedType = document.getElementById('expenseFixedType');
    this.inputExpenseFixedDuration = document.getElementById('expenseFixedDuration');
    this.inputExpenseNotes = document.getElementById('expenseNotes');
    this.panelFixedDetails = document.getElementById('fixedDetailsPanel');
    this.groupFixedDuration = document.getElementById('groupFixedDuration');
    this.fixedDurationHint = document.getElementById('fixedDurationHint');

    // PWA & Export
    this.btnPwaInstall = document.getElementById('btnPwaInstall');
    this.btnExport = document.getElementById('btnExport');
  }

  bindEvents() {
    // Month navigation
    this.btnPrevMonth.addEventListener('click', () => this.shiftMonth(-1));
    this.btnNextMonth.addEventListener('click', () => this.shiftMonth(1));
    this.elMonthPicker.addEventListener('change', (e) => {
      if (e.target.value) {
        this.currentMonth = e.target.value;
        this.loadAll();
      }
    });

    // Mobile View Tabs
    document.querySelectorAll('.m-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.m-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.column-panel').forEach(p => p.classList.remove('active-mobile'));
        btn.classList.add('active');
        const targetViewId = btn.getAttribute('data-view');
        const targetPanel = document.getElementById(targetViewId);
        if (targetPanel) targetPanel.classList.add('active-mobile');
      });
    });

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.getAttribute('data-filter');
        this.renderAllExpenses();
      });
    });

    // Search input
    const searchInput = document.getElementById('expenseSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderAllExpenses();
      });
    }

    // Modal Triggers: Expense
    document.querySelectorAll('.open-expense-modal').forEach(btn => {
      btn.addEventListener('click', () => this.openExpenseModal());
    });
    document.getElementById('btnCloseExpenseModal').addEventListener('click', () => this.closeExpenseModal());
    document.getElementById('btnCancelExpense').addEventListener('click', () => this.closeExpenseModal());
    this.modalExpenseBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalExpenseBackdrop) this.closeExpenseModal();
    });

    // Modal Triggers: Income
    document.querySelectorAll('.open-income-modal').forEach(btn => {
      btn.addEventListener('click', () => this.openIncomeModal());
    });
    document.getElementById('btnCloseIncomeModal').addEventListener('click', () => this.closeIncomeModal());
    document.getElementById('btnCancelIncome').addEventListener('click', () => this.closeIncomeModal());
    this.modalIncomeBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalIncomeBackdrop) this.closeIncomeModal();
    });

    // Modal Triggers: Salary
    const openSalary = () => this.openSalaryModal();
    document.getElementById('btnQuickEditSalary').addEventListener('click', openSalary);
    document.getElementById('btnEditSalaryCard').addEventListener('click', openSalary);
    document.getElementById('btnCloseSalaryModal').addEventListener('click', () => this.closeSalaryModal());
    document.getElementById('btnCancelSalary').addEventListener('click', () => this.closeSalaryModal());
    this.modalSalaryBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalSalaryBackdrop) this.closeSalaryModal();
    });

    // Modal Triggers: Notifications
    const openNotifications = () => this.openNotificationsModal();
    this.btnNotifications.addEventListener('click', openNotifications);
    this.btnViewPendingAlerts.addEventListener('click', openNotifications);
    this.btnCloseNotificationsModal.addEventListener('click', () => this.closeNotificationsModal());
    this.modalNotificationsBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalNotificationsBackdrop) this.closeNotificationsModal();
    });

    // Browser Notification Toggle
    this.btnEnableBrowserNotifications.addEventListener('click', () => this.requestNotificationPermission());

    // Fixed expense toggle listener
    this.inputExpenseIsFixed.addEventListener('change', () => {
      this.panelFixedDetails.style.display = this.inputExpenseIsFixed.checked ? 'block' : 'none';
      // When fixed is enabled, default initial status to unpaid/pending
      if (this.inputExpenseIsFixed.checked && !document.getElementById('expenseEditId').value) {
        document.getElementById('statusUnpaid').checked = true;
      }
    });

    this.inputExpenseFixedType.addEventListener('change', () => {
      const type = this.inputExpenseFixedType.value;
      if (type === 'permanente') {
        this.groupFixedDuration.style.display = 'none';
      } else {
        this.groupFixedDuration.style.display = 'flex';
        this.fixedDurationHint.textContent = `Se repetirá durante esa cantidad de ${type}`;
      }
    });

    // Link date changes to due date if not manually diverged
    this.inputExpenseDate.addEventListener('change', () => {
      if (!this.inputExpenseDueDate.value || this.inputExpenseDueDate.value === this.getTodayDateString()) {
        this.inputExpenseDueDate.value = this.inputExpenseDate.value;
      }
    });

    // Forms
    this.formExpense.addEventListener('submit', (e) => this.handleExpenseSubmit(e));
    this.formIncome.addEventListener('submit', (e) => this.handleIncomeSubmit(e));
    this.formSalary.addEventListener('submit', (e) => this.handleSalarySubmit(e));

    // Export
    this.btnExport.addEventListener('click', () => {
      window.location.href = '/api/export';
      this.showToast('Descargando copia de seguridad...', 'success');
    });
  }

  shiftMonth(offset) {
    const [year, month] = this.currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    this.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.loadAll();
  }

  updateMonthDisplay() {
    const [year, month] = this.currentMonth.split('-').map(Number);
    const monthName = MONTH_NAMES[month - 1] || '';
    this.elMonthLabel.textContent = `${monthName} ${year}`;
    this.elMonthPicker.value = this.currentMonth;
  }

  async loadAll() {
    this.updateMonthDisplay();
    try {
      const [sumRes, expRes, incRes, setRes] = await Promise.all([
        fetch(`/api/summary?month=${this.currentMonth}`).then(r => r.json()),
        fetch(`/api/expenses?month=${this.currentMonth}`).then(r => r.json()),
        fetch(`/api/incomes?month=${this.currentMonth}`).then(r => r.json()),
        fetch('/api/settings').then(r => r.json())
      ]);

      if (setRes.success) this.settings = setRes.data;
      if (sumRes.success) this.summary = sumRes.data;
      if (expRes.success) this.expenses = expRes.data;
      if (incRes.success) this.incomes = incRes.data;

      this.renderAssistant();
      this.renderMasterKpis();
      this.renderAllExpenses();
      this.renderIncomes();
      this.renderStats();
    } catch (err) {
      console.error('Error cargando datos:', err);
      this.showToast('Error al conectar con el servidor', 'error');
    }
  }

  formatMoney(num) {
    const val = Number(num) || 0;
    return val.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  // ==========================================
  // RENDER: SMART FINANCIAL ASSISTANT
  // ==========================================
  renderAssistant() {
    if (!this.summary || !this.summary.assistant) return;
    const s = this.summary;
    const a = s.assistant;

    // Set tone styling
    this.elAssistantBanner.className = `assistant-hero-banner ${a.tone}`;
    
    // Status chip
    this.elAssistantStatusChip.className = `assistant-status-chip ${a.tone}`;
    if (a.tone === 'danger') {
      this.elAssistantStatusChip.textContent = 'Déficit proyectado';
      this.elAssistantAvatar.textContent = '🚨';
    } else if (a.tone === 'warning') {
      this.elAssistantStatusChip.textContent = 'Atención requerida';
      this.elAssistantAvatar.textContent = '⚠️';
    } else if (s.totalPending === 0 && s.totalExpenses > 0) {
      this.elAssistantStatusChip.textContent = '100% al día';
      this.elAssistantAvatar.textContent = '🎯';
    } else {
      this.elAssistantStatusChip.textContent = 'Bajo control';
      this.elAssistantAvatar.textContent = '🧠';
    }

    this.elAssistantHeadline.textContent = a.headline;
    this.elAssistantDetail.textContent = a.detail;
    this.elAssistantProgressPct.textContent = `${s.paidPercentage}%`;

    // Alerts button & notification badge
    const alertCount = (a.overdueCount || 0) + (a.dueSoonCount || 0);
    if (alertCount > 0) {
      this.btnViewPendingAlerts.style.display = 'inline-flex';
      this.btnAlertsText.textContent = `${alertCount} ${alertCount === 1 ? 'alerta de pago' : 'alertas de pago'}`;
      this.elNotificationBadge.style.display = 'flex';
      this.elNotificationBadge.textContent = alertCount;
    } else if (s.pendingCount > 0) {
      this.btnViewPendingAlerts.style.display = 'none';
      this.elNotificationBadge.style.display = 'flex';
      this.elNotificationBadge.textContent = s.pendingCount;
    } else {
      this.btnViewPendingAlerts.style.display = 'none';
      this.elNotificationBadge.style.display = 'none';
    }

    // Populate notifications list in modal
    this.renderNotificationsModal(a.notifications);
  }

  renderNotificationsModal(notifications = []) {
    this.elNotificationsList.innerHTML = '';
    if (!notifications || notifications.length === 0) {
      this.elNotificationsList.innerHTML = `
        <div class="empty-state-panel">
          <div class="empty-state-icon">✅</div>
          <h4 class="empty-state-title">Sin alertas pendientes</h4>
          <p class="empty-state-desc">Tus cuentas y compromisos están al día.</p>
        </div>
      `;
      return;
    }

    notifications.forEach(n => {
      const item = document.createElement('div');
      item.className = `notification-item-card ${n.type}`;
      const icon = n.type === 'danger' ? '🚨' : (n.type === 'warning' ? '⚠️' : 'ℹ️');
      item.innerHTML = `
        <span class="notification-icon">${icon}</span>
        <div class="notification-text">
          <strong>${this.escapeHtml(n.title)}</strong>
          <p>${this.escapeHtml(n.message)}</p>
        </div>
      `;
      this.elNotificationsList.appendChild(item);
    });
  }

  // ==========================================
  // RENDER: 4 MASTER KPIS
  // ==========================================
  renderMasterKpis() {
    if (!this.summary) return;
    const s = this.summary;
    const cur = s.currency || '$';

    // 1. Saldo Neto Proyectado
    this.elBalanceCurrency.textContent = cur;
    this.elBalance.textContent = this.formatMoney(s.balance);

    this.elBalanceStatusPill.className = 'status-pill';
    if (s.balance < 0) {
      this.elBalanceStatusPill.textContent = 'Déficit';
      this.elBalanceStatusPill.classList.add('danger');
    } else if (s.spentPercentage > 85) {
      this.elBalanceStatusPill.textContent = 'Ajustado';
      this.elBalanceStatusPill.classList.add('warning');
    } else {
      this.elBalanceStatusPill.textContent = 'Superávit';
    }

    const pct = Math.min(100, Math.max(0, s.spentPercentage));
    this.elProgressBar.style.width = `${pct}%`;
    this.elProgressBar.className = 'progress-bar-fill';
    if (pct >= 90) this.elProgressBar.classList.add('danger');
    else if (pct >= 75) this.elProgressBar.classList.add('warning');

    this.elSpentPercentage.textContent = `${pct}% gastado`;

    if (s.daysRemaining > 0 && s.balance > 0) {
      this.elDailyBudget.textContent = `Restan ${s.daysRemaining} días (~${cur}${this.formatMoney(s.dailyBudget)}/día)`;
    } else if (s.daysRemaining > 0 && s.balance <= 0) {
      this.elDailyBudget.textContent = `Restan ${s.daysRemaining} días (Sin saldo libre)`;
    } else {
      this.elDailyBudget.textContent = 'Mes cerrado';
    }

    // 2. Ingresos Totales
    this.elTotalIncome.textContent = this.formatMoney(s.totalIncome);
    this.elSalarySub.textContent = `${cur}${this.formatMoney(s.salary)}`;
    this.elExtraIncomeSub.textContent = `${cur}${this.formatMoney(s.extraIncomesTotal)}`;
    this.elSalaryDisplayBig.textContent = `${cur}${this.formatMoney(s.salary)}`;

    // 3. Ya Pagado
    this.elTotalPaid.textContent = this.formatMoney(s.totalPaid);
    this.elCashOnHand.textContent = `${cur}${this.formatMoney(s.cashOnHand)}`;
    this.elPaidPct.textContent = `${s.paidPercentage}% del total`;
    this.elBadgePaidCount.textContent = `${s.paidCount} pagas`;

    // 4. Por Pagar
    this.elTotalPending.textContent = this.formatMoney(s.totalPending);
    this.elBadgePendingCount.textContent = `${s.pendingCount} pendientes`;
    this.elBadgePendingCount.className = s.pendingCount > 0 ? 'badge-count badge-pending' : 'badge-count badge-paid';

    // Headers inside tracking panels
    this.elPanelPendingTotal.textContent = `${cur}${this.formatMoney(s.totalPending)}`;
    this.elPanelPaidTotal.textContent = `${cur}${this.formatMoney(s.totalPaid)}`;

    // Mobile Badges
    this.elMBadgePending.textContent = s.pendingCount;
    this.elMBadgePaid.textContent = s.paidCount;
  }

  // ==========================================
  // RENDER: EXPENSES (POR PAGAR & YA PAGADAS)
  // ==========================================
  renderAllExpenses() {
    let list = [...this.expenses];

    // Search query
    if (this.searchQuery) {
      list = list.filter(e =>
        (e.title || '').toLowerCase().includes(this.searchQuery) ||
        (e.category || '').toLowerCase().includes(this.searchQuery) ||
        (e.notes || '').toLowerCase().includes(this.searchQuery)
      );
    }

    // Filter pills
    if (this.activeFilter === 'pending') {
      list = list.filter(e => !e.isPaid);
    } else if (this.activeFilter === 'paid') {
      list = list.filter(e => e.isPaid);
    } else if (this.activeFilter === 'fixed') {
      list = list.filter(e => e.isFixed);
    } else if (this.activeFilter === 'variable') {
      list = list.filter(e => !e.isFixed);
    }

    const pendingItems = list.filter(e => !e.isPaid);
    const paidItems = list.filter(e => e.isPaid);

    // Render Pending List
    this.renderExpenseList(pendingItems, this.elPendingList, this.elPendingEmpty, false);

    // Render Paid List
    this.renderExpenseList(paidItems, this.elPaidList, this.elPaidEmpty, true);
  }

  renderExpenseList(items, containerEl, emptyStateEl, isPaidList) {
    containerEl.innerHTML = '';
    if (items.length === 0) {
      emptyStateEl.style.display = 'block';
      return;
    }
    emptyStateEl.style.display = 'none';

    const todayStr = this.getTodayDateString();

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `tracking-card ${item.isPaid ? 'is-paid' : 'is-unpaid'}`;

      const icon = CATEGORY_ICONS[item.category] || '📦';
      const fixedTag = item.isFixed ? `
        <span class="fixed-badge">Fijo ${item.fixedType === 'permanente' ? 'Permanente' : `(${item.fixedDuration} ${item.fixedType})`}</span>
      ` : '';

      // Due date & status calculation
      const dDate = item.dueDate || item.date || todayStr;
      let dateStatusChip = '';

      if (item.isPaid) {
        const paidDateFormatted = this.formatDate(item.paidAt ? item.paidAt.split('T')[0] : item.date);
        dateStatusChip = `<span class="chip-status chip-paid-date">✓ Pagado ${paidDateFormatted}</span>`;
      } else {
        if (dDate < todayStr) {
          card.classList.add('is-overdue');
          dateStatusChip = `<span class="chip-status chip-overdue">⚠️ Vencido (${this.formatDate(dDate)})</span>`;
        } else if (dDate === todayStr) {
          card.classList.add('is-due-soon');
          dateStatusChip = `<span class="chip-status chip-due-soon">🔔 Vence Hoy</span>`;
        } else {
          dateStatusChip = `<span class="chip-status">Vence: ${this.formatDate(dDate)}</span>`;
        }
      }

      // 1-Click Pay or Unpay Button
      const payButtonHtml = item.isPaid
        ? `<button class="btn-unpay-action toggle-pay-btn" title="Desmarcar pago y volver a pendiente" data-id="${item.id}">↩ Desmarcar</button>`
        : `<button class="btn-pay-action toggle-pay-btn" title="Marcar como pagada" data-id="${item.id}">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
               <polyline points="20 6 9 17 4 12"></polyline>
             </svg>
             <span>Pagar</span>
           </button>`;

      card.innerHTML = `
        <div class="card-left-col">
          <div class="card-cat-emoji">${icon}</div>
          <div class="card-info-col">
            <div class="card-title-row">
              <span class="card-main-title">${this.escapeHtml(item.title)}</span>
              ${fixedTag}
            </div>
            <div class="card-date-chips">
              <span>${item.category}</span>
              <span>•</span>
              ${dateStatusChip}
              ${item.notes ? `<span>• <em>${this.escapeHtml(item.notes)}</em></span>` : ''}
            </div>
          </div>
        </div>

        <div class="card-right-col">
          <div class="card-amount-box">
            <span class="card-amount-val ${item.isPaid ? 'paid' : 'unpaid'}">
              ${this.settings.currency || '$'}${this.formatMoney(item.amount)}
            </span>
          </div>

          ${payButtonHtml}

          <div class="card-ops">
            <button class="btn-op edit-expense" title="Editar gasto" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-op delete delete-expense" title="Eliminar gasto" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      // 1-Click Payment Toggle Event
      card.querySelector('.toggle-pay-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePay(item.id, item.isPaid);
      });

      card.querySelector('.edit-expense').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openExpenseModal(item);
      });

      card.querySelector('.delete-expense').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteExpense(item.id);
      });

      containerEl.appendChild(card);
    });
  }

  // 1-Click Pay/Unpay Handler
  async togglePay(id, currentPaidStatus) {
    try {
      const res = await fetch(`/api/expenses/${id}/toggle-pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaid: !currentPaidStatus })
      }).then(r => r.json());

      if (res.success) {
        const msg = !currentPaidStatus ? '✅ Marcada como pagada' : '⏳ Marcada como pendiente';
        this.showToast(msg, 'success');
        this.loadAll();
      } else {
        this.showToast('Error al actualizar estado', 'error');
      }
    } catch {
      this.showToast('Error de red al actualizar', 'error');
    }
  }

  // ==========================================
  // RENDER: INCOMES
  // ==========================================
  renderIncomes() {
    const list = this.incomes;
    this.elIncomesList.innerHTML = '';

    if (list.length === 0) {
      this.elIncomesEmpty.style.display = 'block';
      return;
    }
    this.elIncomesEmpty.style.display = 'none';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'tracking-card';

      const icon = CATEGORY_ICONS[item.category] || '💵';
      const formattedDate = this.formatDate(item.date);

      card.innerHTML = `
        <div class="card-left-col">
          <div class="card-cat-emoji">${icon}</div>
          <div class="card-info-col">
            <span class="card-main-title">${this.escapeHtml(item.title)}</span>
            <div class="card-date-chips">
              <span>${item.category}</span>
              <span>•</span>
              <span>${formattedDate}</span>
            </div>
          </div>
        </div>

        <div class="card-right-col">
          <span class="card-amount-val income">+${this.settings.currency || '$'}${this.formatMoney(item.amount)}</span>
          <div class="card-ops">
            <button class="btn-op delete delete-income" title="Eliminar ingreso" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.delete-income').addEventListener('click', () => {
        this.deleteIncome(item.id);
      });

      this.elIncomesList.appendChild(card);
    });
  }

  // ==========================================
  // RENDER: STATS & CATEGORIES
  // ==========================================
  renderStats() {
    if (!this.summary) return;
    const s = this.summary;
    const cur = s.currency || '$';

    this.elCategoryBars.innerHTML = '';
    if (!s.categories || s.categories.length === 0) {
      this.elCategoryBars.innerHTML = '<p class="empty-state-desc">Sin datos suficientes para este mes.</p>';
    } else {
      s.categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-bar-item';
        item.innerHTML = `
          <div class="cat-bar-header">
            <span>${CATEGORY_ICONS[cat.name] || '📦'} ${cat.name} (${cat.percentage}%)</span>
            <strong>${cur}${this.formatMoney(cat.total)}</strong>
          </div>
          <div class="cat-progress-track">
            <div class="cat-progress-fill" style="width: ${cat.percentage}%;"></div>
          </div>
        `;
        this.elCategoryBars.appendChild(item);
      });
    }

    const fixed = s.fixedExpensesTotal || 0;
    const variable = s.variableExpensesTotal || 0;
    const total = fixed + variable;

    let fixedPct = 50;
    let varPct = 50;
    if (total > 0) {
      fixedPct = Math.round((fixed / total) * 100);
      varPct = 100 - fixedPct;
    }

    this.elBarCompFixed.style.width = `${fixedPct}%`;
    this.elBarCompVar.style.width = `${varPct}%`;
    this.elCompRatioLabel.textContent = `${fixedPct}% Fijo / ${varPct}% Var`;
    this.elLegendFixedVal.textContent = `${cur}${this.formatMoney(fixed)} (${fixedPct}%)`;
    this.elLegendVarVal.textContent = `${cur}${this.formatMoney(variable)} (${varPct}%)`;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const today = this.getTodayDateString();
    if (dateStr === today) return 'Hoy';

    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const monthIdx = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      return `${day} ${MONTH_NAMES[monthIdx]?.substring(0, 3).toLowerCase()}`;
    }
    return dateStr;
  }

  // ==========================================
  // MODAL CONTROLS & SUBMISSIONS
  // ==========================================
  openExpenseModal(editItem = null) {
    this.formExpense.reset();
    const editIdInput = document.getElementById('expenseEditId');
    const modalTitle = document.getElementById('modalExpenseTitle');
    const today = this.getTodayDateString();

    if (editItem) {
      modalTitle.textContent = 'Editar Gasto';
      editIdInput.value = editItem.id;
      this.inputExpenseAmount.value = editItem.amount;
      this.inputExpenseTitle.value = editItem.title;
      this.inputExpenseDate.value = editItem.date;
      this.inputExpenseDueDate.value = editItem.dueDate || editItem.date;
      this.inputExpenseCategory.value = editItem.category || 'Otros';
      this.inputExpenseIsFixed.checked = Boolean(editItem.isFixed);
      this.inputExpenseFixedType.value = editItem.fixedType || 'meses';
      this.inputExpenseFixedDuration.value = editItem.fixedDuration || '1';
      this.inputExpenseNotes.value = editItem.notes || '';

      if (editItem.isPaid) {
        document.getElementById('statusPaid').checked = true;
      } else {
        document.getElementById('statusUnpaid').checked = true;
      }
    } else {
      modalTitle.textContent = 'Registrar Gasto';
      editIdInput.value = '';
      this.inputExpenseDate.value = today;
      this.inputExpenseDueDate.value = today;
      this.inputExpenseCategory.value = 'Servicios';
      this.inputExpenseIsFixed.checked = false;
      this.inputExpenseFixedType.value = 'meses';
      this.inputExpenseFixedDuration.value = '1';
      document.getElementById('statusUnpaid').checked = true; // Default to unpaid for tracking!
    }

    this.panelFixedDetails.style.display = this.inputExpenseIsFixed.checked ? 'block' : 'none';
    this.modalExpenseBackdrop.classList.add('active');
    setTimeout(() => this.inputExpenseAmount.focus(), 150);
  }

  closeExpenseModal() {
    this.modalExpenseBackdrop.classList.remove('active');
  }

  async handleExpenseSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('expenseEditId').value;
    const isPaid = document.getElementById('statusPaid').checked;

    const payload = {
      amount: parseFloat(this.inputExpenseAmount.value),
      title: this.inputExpenseTitle.value.trim(),
      date: this.inputExpenseDate.value || this.getTodayDateString(),
      dueDate: this.inputExpenseDueDate.value || this.inputExpenseDate.value || this.getTodayDateString(),
      category: this.inputExpenseCategory.value,
      isFixed: this.inputExpenseIsFixed.checked,
      fixedType: this.inputExpenseFixedType.value,
      fixedDuration: this.inputExpenseFixedDuration.value,
      isPaid,
      notes: this.inputExpenseNotes.value.trim()
    };

    try {
      let res;
      if (editId) {
        res = await fetch(`/api/expenses/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      } else {
        res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(r => r.json());
      }

      if (res.success) {
        this.closeExpenseModal();
        this.showToast(editId ? 'Gasto modificado' : 'Gasto registrado con éxito', 'success');
        this.loadAll();
      } else {
        this.showToast(res.error || 'Error al guardar gasto', 'error');
      }
    } catch {
      this.showToast('Error de red al guardar', 'error');
    }
  }

  async deleteExpense(id) {
    if (!confirm('¿Seguro que deseás eliminar este gasto?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        this.showToast('Gasto eliminado', 'success');
        this.loadAll();
      }
    } catch {
      this.showToast('Error al eliminar', 'error');
    }
  }

  openIncomeModal() {
    this.formIncome.reset();
    document.getElementById('incomeEditId').value = '';
    this.inputIncomeDate.value = this.getTodayDateString();
    this.inputIncomeCategory.value = 'Extra';
    this.modalIncomeBackdrop.classList.add('active');
    setTimeout(() => this.inputIncomeAmount.focus(), 150);
  }

  closeIncomeModal() {
    this.modalIncomeBackdrop.classList.remove('active');
  }

  async handleIncomeSubmit(e) {
    e.preventDefault();
    const payload = {
      amount: parseFloat(this.inputIncomeAmount.value),
      title: this.inputIncomeTitle.value.trim(),
      date: this.inputIncomeDate.value || this.getTodayDateString(),
      category: this.inputIncomeCategory.value
    };

    try {
      const res = await fetch('/api/incomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (res.success) {
        this.closeIncomeModal();
        this.showToast('Ingreso registrado en tu saldo', 'success');
        this.loadAll();
      }
    } catch {
      this.showToast('Error de red al guardar', 'error');
    }
  }

  async deleteIncome(id) {
    if (!confirm('¿Seguro que deseás eliminar este ingreso?')) return;
    try {
      const res = await fetch(`/api/incomes/${id}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        this.showToast('Ingreso eliminado', 'success');
        this.loadAll();
      }
    } catch {
      this.showToast('Error al eliminar', 'error');
    }
  }

  openSalaryModal() {
    document.getElementById('inputSalaryAmount').value = this.settings.salary || '';
    document.getElementById('inputCurrencySymbol').value = this.settings.currency || '$';
    this.modalSalaryBackdrop.classList.add('active');
    setTimeout(() => document.getElementById('inputSalaryAmount').focus(), 150);
  }

  closeSalaryModal() {
    this.modalSalaryBackdrop.classList.remove('active');
  }

  async handleSalarySubmit(e) {
    e.preventDefault();
    const salary = parseFloat(document.getElementById('inputSalaryAmount').value) || 0;
    const currency = document.getElementById('inputCurrencySymbol').value;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salary, currency })
      }).then(r => r.json());

      if (res.success) {
        this.settings = res.data;
        this.closeSalaryModal();
        this.showToast('Sueldo actualizado exitosamente', 'success');
        this.loadAll();
      }
    } catch {
      this.showToast('Error al guardar sueldo', 'error');
    }
  }

  openNotificationsModal() {
    this.modalNotificationsBackdrop.classList.add('active');
  }

  closeNotificationsModal() {
    this.modalNotificationsBackdrop.classList.remove('active');
  }

  // ==========================================
  // BROWSER NOTIFICATIONS & PWA
  // ==========================================
  initBrowserNotifications() {
    if (!('Notification' in window)) {
      this.btnEnableBrowserNotifications.style.display = 'none';
      return;
    }

    if (Notification.permission === 'granted') {
      this.btnEnableBrowserNotifications.textContent = '✓ Activadas';
      this.btnEnableBrowserNotifications.disabled = true;
    }
  }

  async requestNotificationPermission() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      this.btnEnableBrowserNotifications.textContent = '✓ Activadas';
      this.btnEnableBrowserNotifications.disabled = true;
      this.showToast('Notificaciones activadas', 'success');
      new Notification('GastosApp - Asistente Financiero', {
        body: 'Te avisaremos cuando tengas cuentas próximas a vencer o pendientes de pago.',
        icon: '/icons/icon.svg'
      });
    }
  }

  initPwa() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .catch(err => console.warn('Service Worker:', err));
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.btnPwaInstall.style.display = 'inline-flex';
    });

    this.btnPwaInstall.addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          this.btnPwaInstall.style.display = 'none';
          this.showToast('¡Gracias por instalar GastosApp!', 'success');
        }
        this.deferredPrompt = null;
      }
    });

    window.addEventListener('appinstalled', () => {
      this.btnPwaInstall.style.display = 'none';
      this.showToast('GastosApp instalada como aplicación nativa', 'success');
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${this.escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
  window.app = new GastosApp();
});
