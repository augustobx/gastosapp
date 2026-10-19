import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Custom caching header logic for PWA
app.use((req, res, next) => {
  if (req.path === '/sw.js' || req.path === '/manifest.json') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  etag: true
}));

// --- Healthcheck ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'gastosapp',
    timestamp: new Date().toISOString()
  });
});

// --- Settings & Salary ---
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// --- Financial Summary ---
app.get('/api/summary', (req, res) => {
  try {
    const { month } = req.query;
    const summary = db.getSummary(month);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Expenses ---
app.get('/api/expenses', (req, res) => {
  try {
    const { month, category, isFixed, isPaid, search } = req.query;
    const expenses = db.getExpenses({ month, category, isFixed, isPaid, search });
    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const expense = db.addExpense(req.body);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/expenses/:id', (req, res) => {
  try {
    const updated = db.updateExpense(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 1-Click Toggle Paid status
app.patch('/api/expenses/:id/toggle-pay', (req, res) => {
  try {
    const updated = db.toggleExpensePaid(req.params.id, req.body.isPaid);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const ok = db.deleteExpense(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' });
    }
    res.json({ success: true, message: 'Gasto eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Incomes ---
app.get('/api/incomes', (req, res) => {
  try {
    const { month, category, search } = req.query;
    const incomes = db.getIncomes({ month, category, search });
    res.json({ success: true, count: incomes.length, data: incomes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/incomes', (req, res) => {
  try {
    const income = db.addIncome(req.body);
    res.status(201).json({ success: true, data: income });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/incomes/:id', (req, res) => {
  try {
    const updated = db.updateIncome(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ingreso no encontrado' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/incomes/:id', (req, res) => {
  try {
    const ok = db.deleteIncome(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Ingreso no encontrado' });
    }
    res.json({ success: true, message: 'Ingreso eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Export & Backup ---
app.get('/api/export', (req, res) => {
  try {
    const data = db.exportAll();
    res.setHeader('Content-Disposition', `attachment; filename="gastosapp_backup_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/import', (req, res) => {
  try {
    const data = db.importAll(req.body);
    res.json({ success: true, message: 'Datos importados con éxito', data });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GastosApp corriendo en http://0.0.0.0:${PORT}`);
});
