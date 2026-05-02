import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`JusMate backend listening on port ${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${PORT} is already in use. Stop the other process or start with a different PORT (example: PORT=4001 npm start).`,
    );
    process.exit(1);
  }
  throw err;
});

