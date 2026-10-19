// ========================================================
// GastosApp Client Controller - NanoLabs
// ========================================================

const CATEGORY_ICONS = {
  Comida: '🍔',
  Servicios: '💡',
  Alquiler: '🏠',
  Transporte: '🚗',
  Salud: '💊',
  Ocio: '🎉',
  Tarjetas: '💳',
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
    this.loadAll();
  }

  // Helper: get today's date formatted as YYYY-MM-DD
  getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  initElements() {
    // Month picker
    this.elMonthLabel = document.getElementById('currentMonthLabel');
    this.elMonthPicker = document.getElementById('monthPickerInput');
    this.btnPrevMonth = document.getElementById('btnPrevMonth');
    this.btnNextMonth = document.getElementById('btnNextMonth');

    // Balance & KPIs
    this.elBalance = document.getElementById('balanceAmount');
    this.elBalanceCurrency = document.getElementById('balanceCurrency');
    this.elBalanceStatusPill = document.getElementById('balanceStatusPill');
    this.elProgressBar = document.getElementById('budgetProgressBar');
    this.elSpentPercentage = document.getElementById('spentPercentageLabel');
    this.elDailyBudget = document.getElementById('dailyBudgetLabel');

    this.elTotalIncome = document.getElementById('kpiTotalIncome');
    this.elSalarySub = document.getElementById('kpiSalarySub');
    this.elTotalExpenses = document.getElementById('kpiTotalExpenses');
    this.elFixedSub = document.getElementById('kpiFixedSub');
    this.elVarSub = document.getElementById('kpiVarSub');

    // Badges & lists
    this.elExpensesBadge = document.getElementById('expensesBadge');
    this.elIncomesBadge = document.getElementById('incomesBadge');
    this.elExpensesList = document.getElementById('expensesList');
    this.elExpensesEmpty = document.getElementById('expensesEmptyState');
    this.elIncomesList = document.getElementById('incomesList');
    this.elIncomesEmpty = document.getElementById('incomesEmptyState');
    this.elSalaryDisplayBig = document.getElementById('salaryDisplayBig');

    // Stats
    this.elCategoryBars = document.getElementById('categoryBreakdownList');
    this.elBarCompFixed = document.getElementById('barCompFixed');
    this.elBarCompVar = document.getElementById('barCompVar');
    this.elLegendFixedVal = document.getElementById('legendFixedVal');
    this.elLegendVarVal = document.getElementById('legendVarVal');

    // Modals
    this.modalExpenseBackdrop = document.getElementById('modalExpenseBackdrop');
    this.modalIncomeBackdrop = document.getElementById('modalIncomeBackdrop');
    this.modalSalaryBackdrop = document.getElementById('modalSalaryBackdrop');

    // Forms
    this.formExpense = document.getElementById('formExpense');
    this.formIncome = document.getElementById('formIncome');
    this.formSalary = document.getElementById('formSalary');

    // Inputs inside expense modal
    this.inputExpenseDate = document.getElementById('expenseDate');
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

    // Inputs inside income modal
    this.inputIncomeDate = document.getElementById('incomeDate');
    this.inputIncomeAmount = document.getElementById('incomeAmount');
    this.inputIncomeTitle = document.getElementById('incomeTitle');
    this.inputIncomeCategory = document.getElementById('incomeCategory');

    // Inputs inside salary modal
    this.inputSalaryAmount = document.getElementById('inputSalaryAmount');
    this.inputCurrencySymbol = document.getElementById('inputCurrencySymbol');

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

    // View tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
      });
    });

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.getAttribute('data-filter');
        this.renderExpenses();
      });
    });

    // Search
    const searchInput = document.getElementById('expenseSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.renderExpenses();
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

    // Fixed expense toggle listener
    this.inputExpenseIsFixed.addEventListener('change', () => {
      this.panelFixedDetails.style.display = this.inputExpenseIsFixed.checked ? 'block' : 'none';
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

    // Form Submissions
    this.formExpense.addEventListener('submit', (e) => this.handleExpenseSubmit(e));
    this.formIncome.addEventListener('submit', (e) => this.handleIncomeSubmit(e));
    this.formSalary.addEventListener('submit', (e) => this.handleSalarySubmit(e));

    // Export backup
    this.btnExport.addEventListener('click', () => {
      window.location.href = '/api/export';
      this.showToast('Descargando copia de seguridad...', 'success');
    });
  }

  // Shift month by offset (-1 or +1)
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

  // Load summary, expenses, incomes & settings
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

      this.renderSummary();
      this.renderExpenses();
      this.renderIncomes();
      this.renderStats();
    } catch (err) {
      console.error('Error cargando datos:', err);
      this.showToast('Error al conectar con el servidor', 'error');
    }
  }

  // Format currency
  formatMoney(num) {
    const val = Number(num) || 0;
    return val.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  // Render Hero & KPIs
  renderSummary() {
    if (!this.summary) return;
    const s = this.summary;
    const cur = s.currency || '$';

    this.elBalanceCurrency.textContent = cur;
    this.elBalance.textContent = this.formatMoney(s.balance);

    // Balance Status
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

    // Progress Bar
    const pct = Math.min(100, Math.max(0, s.spentPercentage));
    this.elProgressBar.style.width = `${pct}%`;
    this.elProgressBar.className = 'progress-bar-fill';
    if (pct >= 90) {
      this.elProgressBar.classList.add('danger');
    } else if (pct >= 75) {
      this.elProgressBar.classList.add('warning');
    }

    this.elSpentPercentage.textContent = `${pct}% del presupuesto gastado`;

    if (s.daysRemaining > 0 && s.balance > 0) {
      this.elDailyBudget.textContent = `Restan ${s.daysRemaining} días (~${cur}${this.formatMoney(s.dailyBudget)}/día)`;
    } else if (s.daysRemaining > 0 && s.balance <= 0) {
      this.elDailyBudget.textContent = `Restan ${s.daysRemaining} días (Sin saldo disponible)`;
    } else {
      this.elDailyBudget.textContent = 'Mes cerrado';
    }

    // Totals
    this.elTotalIncome.textContent = `${cur}${this.formatMoney(s.totalIncome)}`;
    this.elSalarySub.textContent = `${cur}${this.formatMoney(s.salary)}`;

    this.elTotalExpenses.textContent = `${cur}${this.formatMoney(s.totalExpenses)}`;
    this.elFixedSub.textContent = `${cur}${this.formatMoney(s.fixedExpensesTotal)}`;
    this.elVarSub.textContent = `${cur}${this.formatMoney(s.variableExpensesTotal)}`;

    this.elSalaryDisplayBig.textContent = `${cur}${this.formatMoney(s.salary)}`;
  }

  // Render Expenses List
  renderExpenses() {
    let list = [...this.expenses];

    // Filter
    if (this.activeFilter === 'fixed') {
      list = list.filter(e => e.isFixed);
    } else if (this.activeFilter === 'variable') {
      list = list.filter(e => !e.isFixed);
    }

    // Search
    if (this.searchQuery) {
      list = list.filter(e =>
        (e.title || '').toLowerCase().includes(this.searchQuery) ||
        (e.category || '').toLowerCase().includes(this.searchQuery)
      );
    }

    this.elExpensesBadge.textContent = list.length;
    this.elExpensesList.innerHTML = '';

    if (list.length === 0) {
      this.elExpensesEmpty.style.display = 'block';
      return;
    }

    this.elExpensesEmpty.style.display = 'none';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'finance-item-card';

      const icon = CATEGORY_ICONS[item.category] || '📦';
      const fixedTag = item.isFixed ? `
        <span class="fixed-badge">Fijo ${item.fixedType === 'permanente' ? 'Permanente' : `(${item.fixedDuration} ${item.fixedType})`}</span>
      ` : '';

      const formattedDate = this.formatItemDate(item.date);

      card.innerHTML = `
        <div class="item-left">
          <div class="item-category-icon">${icon}</div>
          <div class="item-meta">
            <div class="item-title-row">
              <span class="item-title">${this.escapeHtml(item.title)}</span>
              ${fixedTag}
            </div>
            <div class="item-sub-info">
              <span>${item.category}</span>
              <span>•</span>
              <span>${formattedDate}</span>
              ${item.notes ? `<span>• <em>${this.escapeHtml(item.notes)}</em></span>` : ''}
            </div>
          </div>
        </div>

        <div class="item-right">
          <span class="item-amount expense-amount-val">-${this.settings.currency || '$'}${this.formatMoney(item.amount)}</span>
          <div class="item-actions">
            <button class="btn-item-action edit-expense" title="Editar gasto" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-item-action delete delete-expense" title="Eliminar gasto" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      card.querySelector('.delete-expense').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteExpense(item.id);
      });

      card.querySelector('.edit-expense').addEventListener('click', (e) => {
        e.stopPropagation();
        this.editExpense(item);
      });

      this.elExpensesList.appendChild(card);
    });
  }

  // Render Incomes List
  renderIncomes() {
    const list = this.incomes;
    this.elIncomesBadge.textContent = list.length + (this.settings.salary > 0 ? 1 : 0);
    this.elIncomesList.innerHTML = '';

    if (list.length === 0) {
      this.elIncomesEmpty.style.display = 'block';
      return;
    }

    this.elIncomesEmpty.style.display = 'none';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'finance-item-card';

      const icon = CATEGORY_ICONS[item.category] || '💵';
      const formattedDate = this.formatItemDate(item.date);

      card.innerHTML = `
        <div class="item-left">
          <div class="item-category-icon">${icon}</div>
          <div class="item-meta">
            <span class="item-title">${this.escapeHtml(item.title)}</span>
            <div class="item-sub-info">
              <span>${item.category}</span>
              <span>•</span>
              <span>${formattedDate}</span>
            </div>
          </div>
        </div>

        <div class="item-right">
          <span class="item-amount income-amount-val">+${this.settings.currency || '$'}${this.formatMoney(item.amount)}</span>
          <div class="item-actions">
            <button class="btn-item-action delete delete-income" title="Eliminar ingreso" data-id="${item.id}">
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

  // Render Stats Tab
  renderStats() {
    if (!this.summary) return;
    const s = this.summary;
    const cur = s.currency || '$';

    // Categories
    this.elCategoryBars.innerHTML = '';
    if (!s.categories || s.categories.length === 0) {
      this.elCategoryBars.innerHTML = '<p class="empty-subtitle">Sin datos suficientes para este mes.</p>';
    } else {
      s.categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-bar-item';
        item.innerHTML = `
          <div class="cat-bar-header">
            <span class="cat-name">${CATEGORY_ICONS[cat.name] || '📦'} ${cat.name} (${cat.percentage}%)</span>
            <span class="cat-amount">${cur}${this.formatMoney(cat.total)}</span>
          </div>
          <div class="cat-progress-track">
            <div class="cat-progress-fill" style="width: ${cat.percentage}%;"></div>
          </div>
        `;
        this.elCategoryBars.appendChild(item);
      });
    }

    // Comparison Fijos vs Variables
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
    this.elLegendFixedVal.textContent = `${cur}${this.formatMoney(fixed)} (${fixedPct}%)`;
    this.elLegendVarVal.textContent = `${cur}${this.formatMoney(variable)} (${varPct}%)`;
  }

  formatItemDate(dateStr) {
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

  // ================= MODAL CONTROLS =================

  openExpenseModal(editItem = null) {
    this.formExpense.reset();
    const editIdInput = document.getElementById('expenseEditId');
    const modalTitle = document.getElementById('modalExpenseTitle');

    if (editItem) {
      modalTitle.textContent = 'Editar Gasto';
      editIdInput.value = editItem.id;
      this.inputExpenseAmount.value = editItem.amount;
      this.inputExpenseTitle.value = editItem.title;
      this.inputExpenseDate.value = editItem.date;
      this.inputExpenseCategory.value = editItem.category || 'Otros';
      this.inputExpenseIsFixed.checked = Boolean(editItem.isFixed);
      this.inputExpenseFixedType.value = editItem.fixedType || 'meses';
      this.inputExpenseFixedDuration.value = editItem.fixedDuration || '1';
      this.inputExpenseNotes.value = editItem.notes || '';
    } else {
      modalTitle.textContent = 'Registrar Gasto';
      editIdInput.value = '';
      // AUTOMATICALLY SET TO TODAY'S DATE
      this.inputExpenseDate.value = this.getTodayDateString();
      this.inputExpenseCategory.value = 'Comida';
      this.inputExpenseIsFixed.checked = false;
      this.inputExpenseFixedType.value = 'meses';
      this.inputExpenseFixedDuration.value = '1';
    }

    this.panelFixedDetails.style.display = this.inputExpenseIsFixed.checked ? 'block' : 'none';
    this.modalExpenseBackdrop.classList.add('active');
    setTimeout(() => this.inputExpenseAmount.focus(), 150);
  }

  closeExpenseModal() {
    this.modalExpenseBackdrop.classList.remove('active');
  }

  editExpense(item) {
    this.openExpenseModal(item);
  }

  async handleExpenseSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('expenseEditId').value;
    const payload = {
      amount: parseFloat(this.inputExpenseAmount.value),
      title: this.inputExpenseTitle.value.trim(),
      date: this.inputExpenseDate.value || this.getTodayDateString(),
      category: this.inputExpenseCategory.value,
      isFixed: this.inputExpenseIsFixed.checked,
      fixedType: this.inputExpenseFixedType.value,
      fixedDuration: this.inputExpenseFixedDuration.value,
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
        this.showToast(editId ? 'Gasto modificado' : 'Gasto guardado', 'success');
        this.loadAll();
      } else {
        this.showToast(res.error || 'Error al guardar gasto', 'error');
      }
    } catch (err) {
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
    // AUTOMATICALLY SET TO TODAY'S DATE
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
      } else {
        this.showToast(res.error || 'Error al guardar ingreso', 'error');
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
    this.inputSalaryAmount.value = this.settings.salary || '';
    this.inputCurrencySymbol.value = this.settings.currency || '$';
    this.modalSalaryBackdrop.classList.add('active');
    setTimeout(() => this.inputSalaryAmount.focus(), 150);
  }

  closeSalaryModal() {
    this.modalSalaryBackdrop.classList.remove('active');
  }

  async handleSalarySubmit(e) {
    e.preventDefault();
    const salary = parseFloat(this.inputSalaryAmount.value) || 0;
    const currency = this.inputCurrencySymbol.value;

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

  // ================= PWA & NOTIFICATIONS =================

  initPwa() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(reg => console.log('Service Worker registrado:', reg.scope))
          .catch(err => console.warn('Service Worker falló:', err));
      });
    }

    // Capture install prompt
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

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new GastosApp();
});
