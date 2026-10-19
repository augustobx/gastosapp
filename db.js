import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'gastosapp.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_STATE = {
  settings: {
    salary: 0,
    currency: '$',
    currencyCode: 'ARS',
    updatedAt: new Date().toISOString()
  },
  expenses: [],
  incomes: []
};

// In-memory cache synced to disk
let dbState = null;

function loadDatabase() {
  if (dbState) return dbState;

  if (!fs.existsSync(DATA_FILE)) {
    saveDatabase(DEFAULT_STATE);
    dbState = structuredClone(DEFAULT_STATE);
    return dbState;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    dbState = {
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      incomes: Array.isArray(parsed.incomes) ? parsed.incomes : []
    };
    return dbState;
  } catch (err) {
    console.error('Error reading database file, creating backup and starting fresh:', err);
    try {
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt.${Date.now()}`);
      }
    } catch {}
    dbState = structuredClone(DEFAULT_STATE);
    saveDatabase(dbState);
    return dbState;
  }
}

function saveDatabase(state = dbState) {
  if (!state) return;
  const tmpFile = `${DATA_FILE}.tmp.${Date.now()}`;
  const serialized = JSON.stringify(state, null, 2);
  fs.writeFileSync(tmpFile, serialized, 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
  dbState = state;
}

// Helper: generate unique id
function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Check if fixed expense applies to month YYYY-MM
function doesFixedExpenseApplyToMonth(expense, targetMonth) {
  if (!expense.isFixed) {
    return (expense.date || '').startsWith(targetMonth);
  }

  const expDate = expense.date || '';
  const expMonth = expDate.substring(0, 7); // 'YYYY-MM'
  if (!expMonth) return false;

  // If before expense started, does not apply
  if (targetMonth < expMonth) return false;

  const fixedType = expense.fixedType || 'permanente';
  const duration = parseInt(expense.fixedDuration, 10) || 0;

  if (fixedType === 'permanente') {
    return targetMonth >= expMonth;
  }

  if (fixedType === 'meses') {
    if (duration <= 0) return targetMonth === expMonth;
    // Calculate months difference
    const [startYear, startM] = expMonth.split('-').map(Number);
    const [targetYear, targetM] = targetMonth.split('-').map(Number);
    const monthDiff = (targetYear - startYear) * 12 + (targetM - startM);
    return monthDiff >= 0 && monthDiff < duration;
  }

  if (fixedType === 'dias' || fixedType === 'semanas') {
    // For days and weeks, calculate date range
    const startObj = new Date(`${expDate}T00:00:00`);
    let endObj = new Date(startObj);
    if (fixedType === 'dias') {
      endObj.setDate(endObj.getDate() + (duration || 30));
    } else {
      endObj.setDate(endObj.getDate() + ((duration || 4) * 7));
    }

    const [tY, tM] = targetMonth.split('-').map(Number);
    const monthStart = new Date(tY, tM - 1, 1);
    const monthEnd = new Date(tY, tM, 0, 23, 59, 59);

    // Overlaps if start <= monthEnd and end >= monthStart
    return startObj <= monthEnd && endObj >= monthStart;
  }

  return (expense.date || '').startsWith(targetMonth);
}

export const db = {
  getSettings() {
    const state = loadDatabase();
    return { ...state.settings };
  },

  updateSettings(updates) {
    const state = loadDatabase();
    if (typeof updates.salary !== 'undefined') {
      const parsedSalary = Number.parseFloat(updates.salary);
      state.settings.salary = Number.isNaN(parsedSalary) ? 0 : Math.max(0, parsedSalary);
    }
    if (typeof updates.currency === 'string') {
      state.settings.currency = updates.currency.trim() || '$';
    }
    if (typeof updates.currencyCode === 'string') {
      state.settings.currencyCode = updates.currencyCode.trim().toUpperCase() || 'ARS';
    }
    state.settings.updatedAt = new Date().toISOString();
    saveDatabase(state);
    return { ...state.settings };
  },

  getExpenses({ month, category, isFixed, search } = {}) {
    const state = loadDatabase();
    let list = [...state.expenses];

    if (month) {
      list = list.filter(exp => doesFixedExpenseApplyToMonth(exp, month));
    }

    if (category && category !== 'all') {
      list = list.filter(exp => exp.category === category);
    }

    if (typeof isFixed !== 'undefined' && isFixed !== null) {
      const fixedBool = isFixed === true || isFixed === 'true' || isFixed === '1';
      list = list.filter(exp => Boolean(exp.isFixed) === fixedBool);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(exp =>
        (exp.title || '').toLowerCase().includes(q) ||
        (exp.category || '').toLowerCase().includes(q) ||
        (exp.notes || '').toLowerCase().includes(q)
      );
    }

    // Sort by date descending
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
    return list;
  },

  getExpenseById(id) {
    const state = loadDatabase();
    return state.expenses.find(e => e.id === id) || null;
  },

  addExpense(data) {
    const state = loadDatabase();
    const amount = Number.parseFloat(data.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('El monto debe ser un número positivo mayor a 0');
    }

    const now = new Date().toISOString();
    const expense = {
      id: generateId(),
      date: data.date || now.split('T')[0],
      title: (data.title || 'Gasto sin título').trim(),
      amount: Math.round(amount * 100) / 100,
      category: data.category || 'Otros',
      isFixed: Boolean(data.isFixed),
      fixedType: data.fixedType || 'meses',
      fixedDuration: data.fixedDuration !== undefined ? data.fixedDuration : '1',
      notes: (data.notes || '').trim(),
      createdAt: now,
      updatedAt: now
    };

    state.expenses.unshift(expense);
    saveDatabase(state);
    return expense;
  },

  updateExpense(id, data) {
    const state = loadDatabase();
    const index = state.expenses.findIndex(e => e.id === id);
    if (index === -1) return null;

    const current = state.expenses[index];
    const amount = data.amount !== undefined ? Number.parseFloat(data.amount) : current.amount;
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('El monto debe ser un número positivo mayor a 0');
    }

    const updated = {
      ...current,
      date: data.date !== undefined ? data.date : current.date,
      title: data.title !== undefined ? data.title.trim() : current.title,
      amount: Math.round(amount * 100) / 100,
      category: data.category !== undefined ? data.category : current.category,
      isFixed: data.isFixed !== undefined ? Boolean(data.isFixed) : current.isFixed,
      fixedType: data.fixedType !== undefined ? data.fixedType : current.fixedType,
      fixedDuration: data.fixedDuration !== undefined ? data.fixedDuration : current.fixedDuration,
      notes: data.notes !== undefined ? data.notes.trim() : current.notes,
      updatedAt: new Date().toISOString()
    };

    state.expenses[index] = updated;
    saveDatabase(state);
    return updated;
  },

  deleteExpense(id) {
    const state = loadDatabase();
    const index = state.expenses.findIndex(e => e.id === id);
    if (index === -1) return false;
    state.expenses.splice(index, 1);
    saveDatabase(state);
    return true;
  },

  getIncomes({ month, category, search } = {}) {
    const state = loadDatabase();
    let list = [...state.incomes];

    if (month) {
      list = list.filter(inc => (inc.date || '').startsWith(month));
    }

    if (category && category !== 'all') {
      list = list.filter(inc => inc.category === category);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(inc =>
        (inc.title || '').toLowerCase().includes(q) ||
        (inc.category || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
    return list;
  },

  getIncomeById(id) {
    const state = loadDatabase();
    return state.incomes.find(i => i.id === id) || null;
  },

  addIncome(data) {
    const state = loadDatabase();
    const amount = Number.parseFloat(data.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('El monto del ingreso debe ser un número positivo mayor a 0');
    }

    const now = new Date().toISOString();
    const income = {
      id: generateId(),
      date: data.date || now.split('T')[0],
      title: (data.title || 'Ingreso extra').trim(),
      amount: Math.round(amount * 100) / 100,
      category: data.category || 'Extra',
      notes: (data.notes || '').trim(),
      createdAt: now,
      updatedAt: now
    };

    state.incomes.unshift(income);
    saveDatabase(state);
    return income;
  },

  updateIncome(id, data) {
    const state = loadDatabase();
    const index = state.incomes.findIndex(i => i.id === id);
    if (index === -1) return null;

    const current = state.incomes[index];
    const amount = data.amount !== undefined ? Number.parseFloat(data.amount) : current.amount;
    if (Number.isNaN(amount) || amount <= 0) {
      throw new Error('El monto del ingreso debe ser un número positivo mayor a 0');
    }

    const updated = {
      ...current,
      date: data.date !== undefined ? data.date : current.date,
      title: data.title !== undefined ? data.title.trim() : current.title,
      amount: Math.round(amount * 100) / 100,
      category: data.category !== undefined ? data.category : current.category,
      notes: data.notes !== undefined ? data.notes.trim() : current.notes,
      updatedAt: new Date().toISOString()
    };

    state.incomes[index] = updated;
    saveDatabase(state);
    return updated;
  },

  deleteIncome(id) {
    const state = loadDatabase();
    const index = state.incomes.findIndex(i => i.id === id);
    if (index === -1) return false;
    state.incomes.splice(index, 1);
    saveDatabase(state);
    return true;
  },

  getSummary(targetMonth) {
    const state = loadDatabase();
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = targetMonth || currentMonthStr;

    const [yearNum, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

    // Calculate days remaining
    let daysRemaining = 0;
    if (month === currentMonthStr) {
      daysRemaining = Math.max(1, daysInMonth - now.getDate() + 1);
    } else if (month > currentMonthStr) {
      daysRemaining = daysInMonth;
    } else {
      daysRemaining = 0;
    }

    const salary = state.settings.salary || 0;

    // Extra incomes for this month
    const monthIncomes = state.incomes.filter(inc => (inc.date || '').startsWith(month));
    const extraIncomesTotal = monthIncomes.reduce((acc, inc) => acc + (inc.amount || 0), 0);
    const totalIncome = salary + extraIncomesTotal;

    // Expenses for this month
    const monthExpenses = state.expenses.filter(exp => doesFixedExpenseApplyToMonth(exp, month));

    let fixedExpensesTotal = 0;
    let variableExpensesTotal = 0;
    const categoryTotals = {};

    for (const exp of monthExpenses) {
      const amt = exp.amount || 0;
      if (exp.isFixed) {
        fixedExpensesTotal += amt;
      } else {
        variableExpensesTotal += amt;
      }

      const cat = exp.category || 'Otros';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    }

    const totalExpenses = fixedExpensesTotal + variableExpensesTotal;
    const balance = totalIncome - totalExpenses;

    const spentPercentage = totalIncome > 0 ? Math.min(100, Math.round((totalExpenses / totalIncome) * 100)) : (totalExpenses > 0 ? 100 : 0);
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((balance / totalIncome) * 100)) : 0;

    const dailyBudget = daysRemaining > 0 && balance > 0 ? Math.round((balance / daysRemaining) * 100) / 100 : 0;

    // Format categories
    const categoriesList = Object.entries(categoryTotals)
      .map(([name, total]) => ({
        name,
        total: Math.round(total * 100) / 100,
        percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    return {
      month,
      currency: state.settings.currency || '$',
      currencyCode: state.settings.currencyCode || 'ARS',
      salary,
      extraIncomesTotal: Math.round(extraIncomesTotal * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      fixedExpensesTotal: Math.round(fixedExpensesTotal * 100) / 100,
      variableExpensesTotal: Math.round(variableExpensesTotal * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      spentPercentage,
      savingsRate,
      daysInMonth,
      daysRemaining,
      dailyBudget,
      categories: categoriesList,
      totalExpenseCount: monthExpenses.length,
      totalIncomeCount: monthIncomes.length + (salary > 0 ? 1 : 0)
    };
  },

  exportAll() {
    return loadDatabase();
  },

  importAll(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Formato de datos no válido');
    }
    const state = {
      settings: { ...DEFAULT_STATE.settings, ...(payload.settings || {}) },
      expenses: Array.isArray(payload.expenses) ? payload.expenses : [],
      incomes: Array.isArray(payload.incomes) ? payload.incomes : []
    };
    saveDatabase(state);
    return state;
  }
};
