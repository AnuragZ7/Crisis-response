import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { connectDB, isMemoryDB } from './db.js';
import { seedDB } from './seed.js';
import { startSimulation } from './services/simulation.js';

import facilitiesRouter from './routes/facilities.js';
import requestsRouter from './routes/requests.js';
import geocodeRouter from './routes/geocode.js';
import blockagesRouter from './routes/blockages.js';
import routeRouter from './routes/route.js';
import disasterRouter from './routes/disaster.js';
import adminRouter from './routes/admin.js';
import missionsRouter from './routes/missions.js';
import { initRoadGraph } from './routing/roadGraph.js';

const PORT = process.env.PORT || 3001;

async function main() {
  // ── Database ───────────────────────────────────────────────────────
  await connectDB();

  // Initialize road graph
  initRoadGraph();

  // Auto-seed when using in-memory DB
  if (isMemoryDB()) {
    console.log('[server] In-memory DB detected — auto-seeding...');
    await seedDB();
  }

  // ── Express ────────────────────────────────────────────────────────
  const app = express();
  const server = http.createServer(app);

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());

  // Global rate limit: 100 req/min per IP
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // ── Socket.IO ──────────────────────────────────────────────────────
  const io = new SocketIOServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  app.set('io', io);

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    socket.on('join', (requestId) => {
      socket.join(`request:${requestId}`);
      console.log(`[socket] ${socket.id} joined room request:${requestId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });

  // ── Routes ─────────────────────────────────────────────────────────
  app.use('/api/facilities', facilitiesRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/blockages', blockagesRouter);
  app.use('/api', geocodeRouter);
  app.use('/api', routeRouter);
  app.use('/api', disasterRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/missions', missionsRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Simulation ─────────────────────────────────────────────────────
  startSimulation(io);

  // ── Start ──────────────────────────────────────────────────────────
  server.listen(PORT, () => {
    console.log(`[server] Tumakuru Rapid Response running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
