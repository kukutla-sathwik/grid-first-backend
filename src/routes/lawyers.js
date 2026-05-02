import express from 'express';
import pool from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/lawyers - list approved lawyers (public)
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT
      lp.*,
      u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email, u.role AS u_role, u.status AS u_status,
      u.reviewed_by AS u_reviewed_by, u.reviewed_at AS u_reviewed_at, u.created_at AS u_created_at, u.updated_at AS u_updated_at
    FROM lawyer_profiles lp
    JOIN users u ON u.id = lp.user_id
    WHERE u.status = 'active' AND u.role = 'LAWYER'
    ORDER BY u.full_name ASC
    `,
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    profile_photo_url: r.profile_photo_url,
    specialization: r.specialization,
    sub_specializations: r.sub_specializations,
    credentials: r.credentials,
    bar_council_id: r.bar_council_id,
    years_of_experience: r.years_of_experience,
    practice_court: r.practice_court,
    languages_spoken: r.languages_spoken,
    consultation_fee: r.consultation_fee != null ? Number(r.consultation_fee) : null,
    bio: r.bio,
    availability_mode: r.availability_mode,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: {
      id: r.u_id,
      full_name: r.u_full_name,
      email: r.u_email,
      role: r.u_role,
      status: r.u_status,
      reviewed_by: r.u_reviewed_by,
      reviewed_at: r.u_reviewed_at,
      created_at: r.u_created_at,
      updated_at: r.u_updated_at,
    },
  }));

  res.json(mapped);
});

// GET /api/lawyers/:id - lawyer profile detail (by user id)
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid lawyer id' });

  const [rows] = await pool.query(
    `
    SELECT
      lp.*,
      u.id AS u_id, u.full_name AS u_full_name, u.email AS u_email, u.role AS u_role, u.status AS u_status,
      u.reviewed_by AS u_reviewed_by, u.reviewed_at AS u_reviewed_at, u.created_at AS u_created_at, u.updated_at AS u_updated_at
    FROM lawyer_profiles lp
    JOIN users u ON u.id = lp.user_id
    WHERE (lp.user_id = ? OR lp.id = ?) AND u.status = 'active' AND u.role = 'LAWYER'
    LIMIT 1
    `,
    [id, id],
  );

  if (!rows.length) return res.status(404).json({ message: 'Lawyer not found' });

  const r = rows[0];
  res.json({
    id: r.id,
    user_id: r.user_id,
    profile_photo_url: r.profile_photo_url,
    specialization: r.specialization,
    sub_specializations: r.sub_specializations,
    credentials: r.credentials,
    bar_council_id: r.bar_council_id,
    years_of_experience: r.years_of_experience,
    practice_court: r.practice_court,
    languages_spoken: r.languages_spoken,
    consultation_fee: r.consultation_fee != null ? Number(r.consultation_fee) : null,
    bio: r.bio,
    availability_mode: r.availability_mode,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: {
      id: r.u_id,
      full_name: r.u_full_name,
      email: r.u_email,
      role: r.u_role,
      status: r.u_status,
      reviewed_by: r.u_reviewed_by,
      reviewed_at: r.u_reviewed_at,
      created_at: r.u_created_at,
      updated_at: r.u_updated_at,
    },
  });
});

// PUT /api/lawyers/profile - update own lawyer profile
router.put('/profile', authRequired, requireRole('LAWYER'), async (req, res) => {
  const userId = req.user.id;

  const allowed = [
    'profile_photo_url',
    'specialization',
    'sub_specializations',
    'credentials',
    'bar_council_id',
    'years_of_experience',
    'practice_court',
    'languages_spoken',
    'consultation_fee',
    'bio',
    'availability_mode',
  ];

  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      updates.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }

  if (!updates.length) return res.status(400).json({ message: 'Nothing to update' });

  // Ensure exists
  const [existing] = await pool.query('SELECT id FROM lawyer_profiles WHERE user_id = ?', [userId]);
  if (!existing.length) {
    // create with required specialization if missing
    const specialization = req.body?.specialization || 'General Practice';
    await pool.query(
      'INSERT INTO lawyer_profiles (user_id, specialization, availability_mode) VALUES (?, ?, ?)',
      [userId, specialization, req.body?.availability_mode || 'SIMPLE_STATUS'],
    );
  }

  values.push(userId);
  await pool.query(`UPDATE lawyer_profiles SET ${updates.join(', ')} WHERE user_id = ?`, values);

  const [rows] = await pool.query('SELECT * FROM lawyer_profiles WHERE user_id = ? LIMIT 1', [userId]);
  res.json({
    ...rows[0],
    consultation_fee: rows[0].consultation_fee != null ? Number(rows[0].consultation_fee) : null,
  });
});

// GET /api/lawyers/:id/availability - get lawyer availability
router.get('/:id/availability', async (req, res) => {
  const lawyerId = Number(req.params.id);
  if (!lawyerId) return res.status(400).json({ message: 'Invalid lawyer id' });

  const [rows] = await pool.query(
    'SELECT id, lawyer_id, day_of_week, start_time, end_time, is_active FROM lawyer_availability WHERE lawyer_id = ? ORDER BY FIELD(day_of_week, "MON","TUE","WED","THU","FRI","SAT","SUN"), start_time ASC',
    [lawyerId],
  );
  res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
});

// PUT /api/lawyers/availability - update own availability (replace all)
router.put('/availability', authRequired, requireRole('LAWYER'), async (req, res) => {
  const lawyerId = req.user.id;
  const slots = Array.isArray(req.body) ? req.body : null;
  if (!slots) return res.status(400).json({ message: 'Expected array of availability slots' });

  // Replace-all for simplicity
  await pool.query('DELETE FROM lawyer_availability WHERE lawyer_id = ?', [lawyerId]);

  for (const s of slots) {
    const { day_of_week, start_time, end_time, is_active } = s || {};
    if (!day_of_week || !start_time || !end_time) continue;
    await pool.query(
      'INSERT INTO lawyer_availability (lawyer_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, ?)',
      [lawyerId, day_of_week, start_time, end_time, is_active !== false],
    );
  }

  const [rows] = await pool.query(
    'SELECT id, lawyer_id, day_of_week, start_time, end_time, is_active FROM lawyer_availability WHERE lawyer_id = ? ORDER BY FIELD(day_of_week, "MON","TUE","WED","THU","FRI","SAT","SUN"), start_time ASC',
    [lawyerId],
  );

  res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
});

export default router;

