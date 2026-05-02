import express from 'express';
import pool from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users - list all users (admin)
router.get('/', authRequired, requireRole('ADMIN'), async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.role,
      u.status,
      u.reviewed_by,
      u.reviewed_at,
      u.created_at,
      u.updated_at,
      lp.bar_council_id
    FROM users u
    LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id AND u.role = 'LAWYER'
    ORDER BY u.created_at DESC
    `,
  );
  res.json(rows);
});

// GET /api/users/pending - list pending approval users
router.get('/pending', authRequired, requireRole('ADMIN'), async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.role,
      u.status,
      u.reviewed_by,
      u.reviewed_at,
      u.created_at,
      u.updated_at,
      lp.bar_council_id
    FROM users u
    LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id AND u.role = 'LAWYER'
    WHERE u.status = 'pending_approval'
    ORDER BY u.created_at ASC
    `,
  );
  res.json(rows);
});

async function updateUserStatus(id, status, adminId) {
  await pool.query(
    'UPDATE users SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
    [status, adminId, id],
  );

  const [rows] = await pool.query(
    'SELECT id, full_name, email, role, status, reviewed_by, reviewed_at, created_at, updated_at FROM users WHERE id = ?',
    [id],
  );
  return rows[0] || null;
}

// PATCH /api/users/:id/approve
router.patch('/:id/approve', authRequired, requireRole('ADMIN'), async (req, res) => {
  const { id } = req.params;
  const user = await updateUserStatus(id, 'active', req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// PATCH /api/users/:id/reject
router.patch('/:id/reject', authRequired, requireRole('ADMIN'), async (req, res) => {
  const { id } = req.params;
  const user = await updateUserStatus(id, 'rejected', req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

export default router;

