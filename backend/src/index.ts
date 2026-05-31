import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import syncRoutes from "./routes/sync";
import webhookRoutes from "./routes/webhooks";
import mappingRoutes from "./routes/mapping";
import formRoutes from "./routes/forms";
import healthRoutes from "./routes/health";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, mobile apps)
      if (!origin) return callback(null, true);
      // Allow localhost for development
      if (origin.includes("localhost")) return callback(null, true);
      // Allow all Vercel preview and production domains
      if (origin.includes("vercel.app")) return callback(null, true);
      // Allow the explicit frontend URL
      if (origin === process.env.FRONTEND_URL) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-wix-instance",
      "x-sync-source",
    ],
  }),
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP",
});
app.use("/api/", limiter);

// ─── Request Parsing ───────────────────────────────────────────────────────────
// Raw body for webhook signature verification (must come before json parser)
app.use("/api/webhooks", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging ───────────────────────────────────────────────────────────────────
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === "/api/health",
  }),
);

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/mapping", mappingRoutes);
app.use("/api/forms", formRoutes);

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Wix-HubSpot Sync backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
