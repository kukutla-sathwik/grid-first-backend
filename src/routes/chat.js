import express from 'express';
import pool from '../config/db.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// NOTE: Your schema includes chat_sessions, but not chat_messages.
// To support the frontend endpoints, we return in-memory style responses
// and store only sessions in DB. Add chat_messages table later if needed.

// POST /api/chat/sessions - create session
router.post('/sessions', authRequired, async (req, res) => {
  const userId = req.user.id;
  const role_context = req.user.role === 'LAWYER' ? 'LAWYER' : 'CITIZEN';

  const [result] = await pool.query(
    'INSERT INTO chat_sessions (user_id, role_context, session_status) VALUES (?, ?, ?)',
    [userId, role_context, 'ACTIVE'],
  );

  const [rows] = await pool.query('SELECT * FROM chat_sessions WHERE id = ?', [result.insertId]);
  res.status(201).json(rows[0]);
});

// GET /api/chat/sessions - list sessions
router.get('/sessions', authRequired, async (req, res) => {
  const userId = req.user.id;
  const [rows] = await pool.query(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC',
    [userId],
  );
  res.json(rows);
});

// GET /api/chat/sessions/:id/messages - placeholder empty list
router.get('/sessions/:id/messages', authRequired, async (req, res) => {
  // With no chat_messages table, return empty for now
  res.json([]);
});

// POST /api/chat/sessions/:id/messages - mock AI response
router.post('/sessions/:id/messages', authRequired, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ message: 'content is required' });

  // Return ChatMessage shape expected by frontend
  res.status(201).json({
    id: Date.now(),
    session_id: Number(req.params.id),
    sender: 'ai',
    content: `Mock AI response: I understand your question: "${content}". Please consult a licensed lawyer for accurate advice.`,
    timestamp: new Date().toISOString(),
  });
});

export default router;

