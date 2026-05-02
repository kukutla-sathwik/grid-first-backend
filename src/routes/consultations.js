import express from 'express';
import pool from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = express.Router();

async function getConsultationHydratedById(id) {
  const [rows] = await pool.query(
    `
    SELECT
      c.*,
      cu.id AS citizen_id2, cu.full_name AS citizen_full_name, cu.email AS citizen_email, cu.role AS citizen_role,
      cu.status AS citizen_status, cu.reviewed_by AS citizen_reviewed_by, cu.reviewed_at AS citizen_reviewed_at,
      cu.created_at AS citizen_created_at, cu.updated_at AS citizen_updated_at,
      lu.id AS lawyer_id2, lu.full_name AS lawyer_full_name, lu.email AS lawyer_email, lu.role AS lawyer_role,
      lu.status AS lawyer_status, lu.reviewed_by AS lawyer_reviewed_by, lu.reviewed_at AS lawyer_reviewed_at,
      lu.created_at AS lawyer_created_at, lu.updated_at AS lawyer_updated_at,
      lp.id AS lp_id, lp.user_id AS lp_user_id, lp.profile_photo_url AS lp_profile_photo_url,
      lp.specialization AS lp_specialization, lp.sub_specializations AS lp_sub_specializations,
      lp.credentials AS lp_credentials, lp.bar_council_id AS lp_bar_council_id, lp.years_of_experience AS lp_years_of_experience,
      lp.practice_court AS lp_practice_court, lp.languages_spoken AS lp_languages_spoken,
      lp.consultation_fee AS lp_consultation_fee, lp.bio AS lp_bio, lp.availability_mode AS lp_availability_mode,
      lp.created_at AS lp_created_at, lp.updated_at AS lp_updated_at
    FROM consultations c
    JOIN users cu ON cu.id = c.citizen_id
    JOIN users lu ON lu.id = c.lawyer_id
    LEFT JOIN lawyer_profiles lp ON lp.user_id = c.lawyer_id
    WHERE c.id = ?
    LIMIT 1
    `,
    [id],
  );

  if (!rows.length) return null;
  const r = rows[0];

  return {
    id: r.id,
    citizen_id: r.citizen_id,
    lawyer_id: r.lawyer_id,
    status: r.status,
    requested_at: r.requested_at,
    responded_at: r.responded_at,
    citizen: {
      id: r.citizen_id2,
      full_name: r.citizen_full_name,
      email: r.citizen_email,
      role: r.citizen_role,
      status: r.citizen_status,
      reviewed_by: r.citizen_reviewed_by,
      reviewed_at: r.citizen_reviewed_at,
      created_at: r.citizen_created_at,
      updated_at: r.citizen_updated_at,
    },
    lawyer: {
      id: r.lawyer_id2,
      full_name: r.lawyer_full_name,
      email: r.lawyer_email,
      role: r.lawyer_role,
      status: r.lawyer_status,
      reviewed_by: r.lawyer_reviewed_by,
      reviewed_at: r.lawyer_reviewed_at,
      created_at: r.lawyer_created_at,
      updated_at: r.lawyer_updated_at,
    },
    lawyer_profile: r.lp_id
      ? {
          id: r.lp_id,
          user_id: r.lp_user_id,
          profile_photo_url: r.lp_profile_photo_url,
          specialization: r.lp_specialization,
          sub_specializations: r.lp_sub_specializations,
          credentials: r.lp_credentials,
          bar_council_id: r.lp_bar_council_id,
          years_of_experience: r.lp_years_of_experience,
          practice_court: r.lp_practice_court,
          languages_spoken: r.lp_languages_spoken,
          consultation_fee: r.lp_consultation_fee != null ? Number(r.lp_consultation_fee) : null,
          bio: r.lp_bio,
          availability_mode: r.lp_availability_mode,
          created_at: r.lp_created_at,
          updated_at: r.lp_updated_at,
        }
      : null,
  };
}

// POST /api/consultations - request consultation (citizen)
router.post('/', authRequired, requireRole('CITIZEN'), async (req, res) => {
  const citizenId = req.user.id;
  const { lawyer_id } = req.body || {};
  if (!lawyer_id) return res.status(400).json({ message: 'lawyer_id is required' });

  // Lawyer must be active
  const [lawyerRows] = await pool.query(
    "SELECT id FROM users WHERE id = ? AND role = 'LAWYER' AND status = 'active' LIMIT 1",
    [lawyer_id],
  );
  if (!lawyerRows.length) return res.status(404).json({ message: 'Lawyer not found' });

  const [result] = await pool.query(
    'INSERT INTO consultations (citizen_id, lawyer_id, status) VALUES (?, ?, ?)',
    [citizenId, lawyer_id, 'REQUESTED'],
  );

  const hydrated = await getConsultationHydratedById(result.insertId);
  res.status(201).json(hydrated);
});

// GET /api/consultations - list my consultations
router.get('/', authRequired, async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let where = '';
  let params = [];

  if (role === 'CITIZEN') {
    where = 'c.citizen_id = ?';
    params = [userId];
  } else if (role === 'LAWYER') {
    where = 'c.lawyer_id = ?';
    params = [userId];
  } else if (role === 'ADMIN') {
    where = '1=1';
    params = [];
  } else {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const [rows] = await pool.query(
    `
    SELECT
      c.*,
      cu.id AS citizen_id2, cu.full_name AS citizen_full_name, cu.email AS citizen_email, cu.role AS citizen_role,
      cu.status AS citizen_status, cu.reviewed_by AS citizen_reviewed_by, cu.reviewed_at AS citizen_reviewed_at,
      cu.created_at AS citizen_created_at, cu.updated_at AS citizen_updated_at,
      lu.id AS lawyer_id2, lu.full_name AS lawyer_full_name, lu.email AS lawyer_email, lu.role AS lawyer_role,
      lu.status AS lawyer_status, lu.reviewed_by AS lawyer_reviewed_by, lu.reviewed_at AS lawyer_reviewed_at,
      lu.created_at AS lawyer_created_at, lu.updated_at AS lawyer_updated_at,
      lp.id AS lp_id, lp.user_id AS lp_user_id, lp.profile_photo_url AS lp_profile_photo_url,
      lp.specialization AS lp_specialization, lp.sub_specializations AS lp_sub_specializations,
      lp.credentials AS lp_credentials, lp.bar_council_id AS lp_bar_council_id, lp.years_of_experience AS lp_years_of_experience,
      lp.practice_court AS lp_practice_court, lp.languages_spoken AS lp_languages_spoken,
      lp.consultation_fee AS lp_consultation_fee, lp.bio AS lp_bio, lp.availability_mode AS lp_availability_mode,
      lp.created_at AS lp_created_at, lp.updated_at AS lp_updated_at
    FROM consultations c
    JOIN users cu ON cu.id = c.citizen_id
    JOIN users lu ON lu.id = c.lawyer_id
    LEFT JOIN lawyer_profiles lp ON lp.user_id = c.lawyer_id
    WHERE ${where}
    ORDER BY c.requested_at DESC
    `,
    params,
  );

  const mapped = rows.map((r) => ({
    id: r.id,
    citizen_id: r.citizen_id,
    lawyer_id: r.lawyer_id,
    status: r.status,
    requested_at: r.requested_at,
    responded_at: r.responded_at,
    citizen: {
      id: r.citizen_id2,
      full_name: r.citizen_full_name,
      email: r.citizen_email,
      role: r.citizen_role,
      status: r.citizen_status,
      reviewed_by: r.citizen_reviewed_by,
      reviewed_at: r.citizen_reviewed_at,
      created_at: r.citizen_created_at,
      updated_at: r.citizen_updated_at,
    },
    lawyer: {
      id: r.lawyer_id2,
      full_name: r.lawyer_full_name,
      email: r.lawyer_email,
      role: r.lawyer_role,
      status: r.lawyer_status,
      reviewed_by: r.lawyer_reviewed_by,
      reviewed_at: r.lawyer_reviewed_at,
      created_at: r.lawyer_created_at,
      updated_at: r.lawyer_updated_at,
    },
    lawyer_profile: r.lp_id
      ? {
          id: r.lp_id,
          user_id: r.lp_user_id,
          profile_photo_url: r.lp_profile_photo_url,
          specialization: r.lp_specialization,
          sub_specializations: r.lp_sub_specializations,
          credentials: r.lp_credentials,
          bar_council_id: r.lp_bar_council_id,
          years_of_experience: r.lp_years_of_experience,
          practice_court: r.lp_practice_court,
          languages_spoken: r.lp_languages_spoken,
          consultation_fee: r.lp_consultation_fee != null ? Number(r.lp_consultation_fee) : null,
          bio: r.lp_bio,
          availability_mode: r.lp_availability_mode,
          created_at: r.lp_created_at,
          updated_at: r.lp_updated_at,
        }
      : null,
  }));

  res.json(mapped);
});

async function ensureConsultationForLawyer(id, lawyerId) {
  const [rows] = await pool.query('SELECT * FROM consultations WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return { ok: false, status: 404, message: 'Consultation not found' };
  const c = rows[0];
  if (Number(c.lawyer_id) !== Number(lawyerId)) return { ok: false, status: 403, message: 'Forbidden' };
  return { ok: true, consultation: c };
}

// PATCH /api/consultations/:id/accept - accept (lawyer)
router.patch('/:id/accept', authRequired, requireRole('LAWYER'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid id' });

  const check = await ensureConsultationForLawyer(id, req.user.id);
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  if (check.consultation.status !== 'REQUESTED') {
    return res.status(409).json({ message: 'Consultation is not in REQUESTED state' });
  }

  await pool.query(
    "UPDATE consultations SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ?",
    [id],
  );
  const hydrated = await getConsultationHydratedById(id);
  res.json(hydrated);
});

// PATCH /api/consultations/:id/reject - reject (lawyer)
router.patch('/:id/reject', authRequired, requireRole('LAWYER'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid id' });

  const check = await ensureConsultationForLawyer(id, req.user.id);
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  if (check.consultation.status !== 'REQUESTED') {
    return res.status(409).json({ message: 'Consultation is not in REQUESTED state' });
  }

  await pool.query(
    "UPDATE consultations SET status = 'REJECTED', responded_at = NOW() WHERE id = ?",
    [id],
  );
  const hydrated = await getConsultationHydratedById(id);
  res.json(hydrated);
});

export default router;

