const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// If the address asks for SSL, use it without strict certificate checks
const wantsSsl = /sslmode=(require|verify-ca|verify-full|prefer)/.test(rawUrl);
const connectionString = rawUrl.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
const pool = new Pool({
  connectionString,
  ssl: wantsSsl ? { rejectUnauthorized: false } : false,
  max: 5
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const toNote = r => ({ id: r.id, text: r.text, createdAt: r.created_at });

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'notes', endpoints: ['GET /api/notes', 'POST /api/notes', 'DELETE /api/notes/:id'] });
});

app.get('/api/notes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, text, created_at FROM notes ORDER BY created_at DESC, id DESC LIMIT 500');
    res.json(rows.map(toNote));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load notes.' });
  }
});

app.post('/api/notes', async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: 'A note needs some text.' });
  try {
    const { rows } = await pool.query('INSERT INTO notes (text) VALUES ($1) RETURNING id, text, created_at', [text]);
    res.status(201).json(toNote(rows[0]));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save the note.' });
  }
});

app.delete('/api/notes/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid note id.' });
  try {
    const { rowCount } = await pool.query('DELETE FROM notes WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Note not found.' });
    res.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not delete the note.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Notes API listening on ${PORT}`));
