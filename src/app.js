import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import profileRoutes from './routes/profile.js';
import lawyersRoutes from './routes/lawyers.js';
import consultationsRoutes from './routes/consultations.js';
import casesRoutes from './routes/cases.js';
import caseTypesRoutes from './routes/caseTypes.js';
import chatRoutes from './routes/chat.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: '*',
    credentials: true,
  }),
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/lawyers', lawyersRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/case-types', caseTypesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(errorHandler);

export default app;

