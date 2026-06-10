const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config();

// Temporary debug file logging
// console.log = (...args) => {
//   fs.appendFileSync(
//     "/home/kinoycge/gaming.kinobazar.com/debug.log",
//     args
//       .map((arg) =>
//         typeof arg === "string" ? arg : JSON.stringify(arg, null, 2),
//       )
//       .join(" ") + "\n",
//   );
// };

// Import security middleware
const {
  generalLimiter,
  authLimiter,
  // paymentLimiter,
  securityHeaders,
  inputSanitization,
  corsOptions,
  requestLogger,
  ipSecurity,
} = require("./middleware/security");

const app = express();
app.set("trust proxy", 1);

app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
// Security Middleware
app.use(securityHeaders);
app.use(require("cors")(corsOptions));
app.use(requestLogger);
app.use(ipSecurity);

// Rate Limiting
// app.use('/api/auth', authLimiter);
// Payment rate limiting removed per request (was causing 429 on deposit-methods)
// app.use('/api/payments', paymentLimiter);
app.use("/api/", generalLimiter);

// Input Sanitization

// Body Parsing Middleware
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));

// Static Files - Serve uploaded files

// Database Connection
// Optimized connection pooling reduces CPU/memory by reusing connections
mongoose
  .connect(process.env.MONGODB_URI, {
    maxPoolSize: 10, // Limit concurrent connections to reduce memory
    minPoolSize: 2, // Keep minimum connections alive to reduce CPU for new connections
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/wallet-transactions", require("./routes/walletTransactions"));
app.use("/api/games", require("./routes/games"));
app.use("/api/sports", require("./routes/sports"));
app.use("/api/agents", require("./routes/agents"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin-management", require("./routes/adminManagement"));
app.use("/api/promos", require("./routes/publicPromos"));
app.use("/api/promotions", require("./routes/publicPromotions"));
// User-facing promotion endpoints (claim & my lists)
app.use("/api/promotions", require("./routes/promotionUserRoutes"));
app.use("/api/promo-codes", require("./routes/promoCode"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/realtime", require("./routes/realtime"));
app.use("/api/agent-management", require("./routes/agentManagement")); // NEW
app.use("/api/agent-hierarchy", require("./routes/agentHierarchy")); // Agent hierarchy

app.use("/api/agent-financial", require("./routes/agentFinancial"));
app.use("/api/admin-financial", require("./routes/adminFinancial"));
app.use("/api/user-management", require("./routes/userManagement"));
app.use("/api/game-config", require("./routes/gameConfig"));
app.use("/api/agent-transactions", require("./routes/agentTransactions"));
app.use("/api/withdrawal-fees", require("./routes/withdrawalFees"));
app.use("/api/auto-deposit", require("./routes/autoDeposit"));
app.use("/api/fraud-detection", require("./routes/fraudDetection"));
app.use("/api/cms", require("./routes/cms"));
app.use("/api/agent-reports", require("./routes/agentReports"));
app.use("/api/agent-dashboard", require("./routes/agentDashboard"));
app.use("/api/agent-balance", require("./routes/agentBalance"));
app.use("/api/login-logs", require("./routes/loginLogs"));
app.use("/api/provider-health", require("./routes/providerHealth"));
app.use("/api/commission", require("./routes/commissionManagement"));
app.use("/api/auto-promo", require("./routes/autoPromo"));
app.use("/api/seo-settings", require("./routes/seoSettings"));
app.use("/api/agent-permissions", require("./routes/agentPermissions"));
app.use("/api/agent-withdrawals", require("./routes/agentWithdrawals"));
app.use("/api/turnover", require("./routes/turnoverRoutes"));
app.use("/api/turnover-tracking", require("./routes/turnoverTracking"));
app.use("/api/withdrawal-validation", require("./routes/withdrawalValidation"));
app.use("/api/free-spins", require("./routes/freeSpins"));
app.use("/api/betting-records", require("./routes/bettingRecords"));
app.use("/api/admin/promotions", require("./routes/promotions"));

// Add auto-promo to deposit approval
app.post("/api/deposits/:id/approve", async (req, res, next) => {
  try {
    // ... existing approval logic ...

    // Auto-apply promo codes after deposit approval
    const autoPromoService = require("./services/autoPromoService");
    await autoPromoService.autoApplyPromoForDeposit(
      deposit.user._id,
      deposit.amount,
      deposit._id,
    );

    // ... continue with response ...
  } catch (error) {
    next(error);
  }
});

const providerHealthService = require("./services/providerHealthService");
providerHealthService.startHealthChecks();
// Basic Route
app.get("/", (req, res) => {
  res.json({
    message: "Online Betting & Gaming API Server",
    version: "1.0.0",
    status: "Running",
    documentation: "/api/docs",
  });
});

// Health Check
app.get("/health", (req, res) => {
  const healthCheck = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  };

  // Add socket connection count if available
  const socketServer = req.app.get("socketServer");
  if (socketServer) {
    healthCheck.connectedUsers = socketServer.getConnectedUsersCount();
  }

  res.status(200).json(healthCheck);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
    });
  }

  // Multer file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File too large",
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err.message : {},
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 5000;

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
});

// Initialize Socket.IO
const SocketServer = require("./socket/socketServer");
const socketServer = new SocketServer(server);
app.set("socketServer", socketServer);

// Initialize Notification Service
const NotificationService = require("./services/notificationService");
const notificationService = new NotificationService(socketServer);
app.set("notificationService", notificationService);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");

  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = app;
