import express from 'express';
import pool from '../config/db.js';
import { authRequired, loadCurrentUser } from '../middleware/auth.js';

const router = express.Router();

// GET /api/profile - current user basic profile
router.get('/', authRequired, loadCurrentUser, (req, res) => {
  res.json(req.currentUser);
});

// PUT /api/profile - update current user basic profile (name/email)
router.put('/', authRequired, async (req, res) => {
  const userId = req.user.id;
  const { full_name, email } = req.body || {};

  if (!full_name && !email) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  const fields = [];
  const values = [];

  if (full_name) {
    fields.push('full_name = ?');
    values.push(full_name);
  }
  if (email) {
    fields.push('email = ?');
    values.push(email);
  }

  values.push(userId);

  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, status, reviewed_by, reviewed_at, created_at, updated_at FROM users WHERE id = ?',
    [userId],
  );

  res.json(rows[0]);
});

export default router;

