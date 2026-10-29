const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const { CLUSTER_RADIUS_METERS, findDuplicateClusters } = require("./civicTwin");
const { buildSlaSnapshot } = require("./sla");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const COOKIE_NAME = "rewacivicai_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const uploadDirectory = path.join(__dirname, "uploads");
const imageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(uploadDirectory, { recursive: true });

const imageStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${imageTypes[file.mimetype]}`);
  },
});
const imageFileFilter = (_req, file, callback) => {
  if (!Object.hasOwn(imageTypes, file.mimetype)) {
    callback(new Error("Upload a JPEG, PNG, or WebP image."));
    return;
  }

  callback(null, true);
};

const upload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter,
});

const resolutionEvidenceUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter,
}).fields([
  { name: "afterPhoto", maxCount: 1 },
]);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const userSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      unique: true,
    },
    phone: { type: String, trim: true, maxlength: 32, default: "" },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["citizen", "admin", "worker"], default: "citizen" },
    mustChangePassword: { type: Boolean, default: false },
    isInitialAdmin: {
      type: Boolean,
      default: false,
      index: {
        unique: true,
        partialFilterExpression: { isInitialAdmin: true },
      },
    },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

const reportActivitySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      enum: ["submitted", "status", "assignment", "evidence", "review"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved"],
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    evidenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const resolutionEvidenceSchema = new mongoose.Schema(
  {
    beforeImageUrl: { type: String, default: null },
    afterImageUrl: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now, required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: false },
);

const reportSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    type: { type: String, enum: ["Garbage", "Pothole"], required: true },
    location: { type: String, required: true, trim: true },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved"],
      default: "Pending",
    },
    imageUrl: { type: String, default: null },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    activity: { type: [reportActivitySchema], default: [] },
    resolutionEvidence: { type: [resolutionEvidenceSchema], default: [] },
  },
  { timestamps: true },
);

const Report = mongoose.model("Report", reportSchema);

const loginEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    loginAt: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);
loginEventSchema.index({ loginAt: -1 });
loginEventSchema.index({ user: 1, loginAt: -1 });

const LoginEvent = mongoose.model("LoginEvent", loginEventSchema);

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function hasSessionSecret() {
  return (
    typeof process.env.JWT_SECRET === "string" &&
    Buffer.byteLength(process.env.JWT_SECRET, "utf8") >= 32
  );
}

function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 10 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

function safeSecretMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string") return false;
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function setSessionCookie(res, user) {
  if (!hasSessionSecret()) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h", issuer: "rewacivicai", audience: "rewacivicai-app" },
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

function publicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
  };
}

function requireDatabase(_req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
    return;
  }

  next();
}

async function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;
  const token = req.cookies[COOKIE_NAME];

  if (!hasSessionSecret()) {
    res.status(503).json({
      success: false,
      message: "Authentication is not configured. Set JWT_SECRET in backend/.env.",
    });
    return;
  }

  if (!token) {
    res.status(401).json({ success: false, message: "Please sign in to continue." });
    return;
  }

  try {
    const payload = jwt.verify(token, secret, {
      issuer: "rewacivicai",
      audience: "rewacivicai-app",
    });
    const user = await User.findById(payload.sub);

    if (!user || user.role !== payload.role) {
      clearSessionCookie(res);
      res.status(401).json({ success: false, message: "Your session is no longer valid. Please sign in again." });
      return;
    }

    if (
      user.mustChangePassword &&
      !["/api/auth/me", "/api/auth/password", "/api/auth/logout"].includes(req.path)
    ) {
      res.status(403).json({
        success: false,
        message: "Change your temporary password before continuing.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      clearSessionCookie(res);
      res.status(401).json({ success: false, message: "Your session expired. Please sign in again." });
      return;
    }

    console.error("Authentication error:", error.message);
    res.status(503).json({ success: false, message: "Unable to verify your session right now." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Administrator access is required." });
    return;
  }

  next();
}

function requireCitizen(req, res, next) {
  if (req.user.role !== "citizen") {
    res.status(403).json({
      success: false,
      message: "Only citizen accounts can submit civic issue reports.",
    });
    return;
  }

  next();
}

function requireWorker(req, res, next) {
  if (req.user.role !== "worker") {
    res.status(403).json({ success: false, message: "Field-worker access is required." });
    return;
  }

  next();
}

async function requireAssignedWorkerReport(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: "Invalid report ID." });
    return;
  }

  try {
    const report = await Report.findOne({
      _id: req.params.id,
      assignedTo: req.user._id,
    });
    if (!report) {
      res.status(404).json({ success: false, message: "Assigned report not found." });
      return;
    }

    req.report = report;
    next();
  } catch (error) {
    console.error("Assigned report lookup error:", error.message);
    res.status(503).json({ success: false, message: "Unable to load assigned report right now." });
  }
}

const registerUser = async (req, res, role) => {
  const { displayName, email, password, phone = "" } = req.body ?? {};

  if (
    typeof displayName !== "string" ||
    displayName.trim().length < 2 ||
    displayName.trim().length > 80 ||
    !isValidEmail(email) ||
    !isValidPassword(password) ||
    typeof phone !== "string" ||
    phone.trim().length > 32
  ) {
    res.status(400).json({
      success: false,
      message: "Enter a name, valid email, password (10–72 bytes), and optional phone number.",
    });
    return;
  }

  if (!hasSessionSecret()) {
    res.status(503).json({
      success: false,
      message: "Authentication is not configured. Set JWT_SECRET in backend/.env.",
    });
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      displayName: displayName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      passwordHash,
      role,
      isInitialAdmin: role === "admin",
    });

    setSessionCookie(res, user);
    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        message: role === "admin"
          ? "Admin setup has already been completed."
          : "An account with that email already exists.",
      });
      return;
    }

    console.error("Account registration error:", error.message);
    res.status(503).json({ success: false, message: "Unable to create account right now." });
  }
};

app.get("/api/auth/admin-setup/status", requireDatabase, async (_req, res) => {
  try {
    const setupKey = process.env.ADMIN_SETUP_KEY;
    const adminExists = await User.exists({ role: "admin" });
    res.json({
      success: true,
      available:
        !adminExists &&
        typeof setupKey === "string" &&
        Buffer.byteLength(setupKey, "utf8") >= 32 &&
        hasSessionSecret(),
    });
  } catch (error) {
    console.error("Admin setup status error:", error.message);
    res.status(503).json({ success: false, message: "Unable to check admin setup right now." });
  }
});

app.post(
  "/api/auth/register",
  authRateLimit,
  async (req, res) => registerUser(req, res, "citizen"),
);

app.post(
  "/api/auth/admin-setup",
  authRateLimit,
  async (req, res) => {
    const setupKey = process.env.ADMIN_SETUP_KEY;
    if (
      typeof setupKey !== "string" ||
      Buffer.byteLength(setupKey, "utf8") < 32 ||
      !safeSecretMatches(req.body?.setupKey, setupKey)
    ) {
      res.status(403).json({ success: false, message: "Admin setup key is invalid or setup is disabled." });
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      res.status(503).json({
        success: false,
        message: "The database is temporarily unavailable. Please try again.",
      });
      return;
    }

    try {
      await User.init();
      if (await User.exists({ role: "admin" })) {
        res.status(409).json({
          success: false,
          message: "Admin setup has already been completed.",
        });
        return;
      }
    } catch (error) {
      console.error("Admin setup check error:", error.message);
      res.status(503).json({
        success: false,
        message: "Unable to verify admin setup right now.",
      });
      return;
    }

    await registerUser(req, res, "admin");
  },
);

app.post(
  "/api/auth/login",
  authRateLimit,
  async (req, res) => {
    const { email, password, role } = req.body ?? {};
    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      Buffer.byteLength(password, "utf8") > 72 ||
      !["citizen", "admin", "worker"].includes(role)
    ) {
      res.status(400).json({ success: false, message: "Enter a valid email and password." });
      return;
    }

    if (!hasSessionSecret()) {
      res.status(503).json({
        success: false,
        message: "Authentication is not configured. Set JWT_SECRET in backend/.env.",
      });
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      res.status(503).json({
        success: false,
        message: "The database is temporarily unavailable. Please try again.",
      });
      return;
    }

    try {
      const user = await User.findOne({ email: email.trim().toLowerCase() })
        .select("+passwordHash");
      if (
        !user ||
        user.role !== role ||
        !(await bcrypt.compare(password, user.passwordHash))
      ) {
        res.status(401).json({ success: false, message: "Invalid email or password." });
        return;
      }

      await LoginEvent.create({ user: user._id });
      setSessionCookie(res, user);
      res.json({ success: true, user: publicUser(user) });
    } catch (error) {
      console.error("Login error:", error.message);
      res.status(503).json({ success: false, message: "Unable to sign in right now." });
    }
  },
);

app.get("/api/auth/me", requireAuth, requireDatabase, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get(
  "/api/admin/users",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Page must be a positive integer and limit must be between 1 and 100.",
        });
        return;
      }

      const query = {};
      const [users, total] = await Promise.all([
        User.find(query)
          .select("displayName email phone role mustChangePassword createdAt")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        User.countDocuments(query),
      ]);
      res.json({
        success: true,
        users,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      });
    } catch (error) {
      console.error("Fetch users error:", error.message);
      res.status(503).json({ success: false, message: "Unable to fetch accounts right now." });
    }
  },
);

app.delete(
  "/api/admin/users/:id",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: "Invalid user ID." });
      return;
    }

    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, message: "User account not found." });
        return;
      }

      if (String(user._id) === String(req.user._id)) {
        res.status(400).json({ success: false, message: "You cannot delete your own account." });
        return;
      }

      if (user.role === "admin" && await User.countDocuments({ role: "admin" }) <= 1) {
        res.status(409).json({
          success: false,
          message: "The last administrator account cannot be deleted.",
        });
        return;
      }

      await Report.updateMany(
        { assignedTo: user._id },
        { $set: { assignedTo: null } },
      );
      await LoginEvent.deleteMany({ user: user._id });
      const result = await User.deleteOne({ _id: user._id });
      if (result.deletedCount !== 1) {
        res.status(404).json({ success: false, message: "User account not found." });
        return;
      }

      res.json({ success: true, id: String(user._id) });
    } catch (error) {
      console.error("Delete user error:", error.message);
      res.status(503).json({ success: false, message: "Unable to delete this account right now." });
    }
  },
);

app.get(
  "/api/admin/login-history",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 50);
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Page must be a positive integer and limit must be between 1 and 100.",
        });
        return;
      }

      const [history, total] = await Promise.all([
        LoginEvent.find()
          .sort({ loginAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate("user", "displayName email role"),
        LoginEvent.countDocuments(),
      ]);
      res.json({
        success: true,
        history,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      });
    } catch (error) {
      console.error("Fetch login history error:", error.message);
      res.status(503).json({ success: false, message: "Unable to fetch login history right now." });
    }
  },
);

app.get(
  "/api/admin/workers",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (_req, res) => {
    try {
      const workers = await User.find({ role: "worker" })
        .select("displayName email phone mustChangePassword createdAt")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      res.json({ success: true, workers });
    } catch (error) {
      console.error("Fetch workers error:", error.message);
      res.status(503).json({ success: false, message: "Unable to fetch workers right now." });
    }
  },
);

app.post(
  "/api/admin/workers",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    const { displayName, email, phone = "", password } = req.body ?? {};
    if (
      typeof displayName !== "string" ||
      displayName.trim().length < 2 ||
      displayName.trim().length > 80 ||
      !isValidEmail(email) ||
      typeof phone !== "string" ||
      phone.trim().length > 32 ||
      !isValidPassword(password)
    ) {
      res.status(400).json({
        success: false,
        message: "Enter a name, valid email, optional phone number, and a password of 10 to 72 UTF-8 bytes.",
      });
      return;
    }

    try {
      const worker = await User.create({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        passwordHash: await bcrypt.hash(password, 12),
        role: "worker",
        mustChangePassword: false,
      });

      res.status(201).json({
        success: true,
        worker: publicUser(worker),
      });
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({
          success: false,
          message: "An account with that email already exists.",
        });
        return;
      }

      console.error("Create worker error:", error.message);
      res.status(503).json({ success: false, message: "Unable to create worker account right now." });
    }
  },
);

app.put(
  "/api/auth/password",
  requireAuth,
  requireDatabase,
  async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!isValidPassword(newPassword)) {
      res.status(400).json({
        success: false,
        message: "New password must be at least 10 characters and no more than 72 UTF-8 bytes.",
      });
      return;
    }

    try {
      const user = await User.findById(req.user.id).select("+passwordHash");
      if (
        !user ||
        (!user.mustChangePassword &&
          (typeof currentPassword !== "string" ||
            !(await bcrypt.compare(currentPassword, user.passwordHash))))
      ) {
        res.status(400).json({ success: false, message: "Current password is incorrect." });
        return;
      }

      user.passwordHash = await bcrypt.hash(newPassword, 12);
      user.mustChangePassword = false;
      await user.save();
      setSessionCookie(res, user);
      res.json({ success: true, user: publicUser(user) });
    } catch (error) {
      console.error("Change password error:", error.message);
      res.status(503).json({ success: false, message: "Unable to change password right now." });
    }
  },
);

async function removeUploadedFile(file) {
  if (!file) return;

  try {
    await fs.promises.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Unable to remove rejected report photo:", error.message);
    }
  }
}

async function hasValidImageSignature(file) {
  const handle = await fs.promises.open(file.path, "r");
  const header = Buffer.alloc(12);

  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (file.mimetype === "image/jpeg") {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
      return (
        bytesRead >= 8 &&
        header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }
    return (
      file.mimetype === "image/webp" &&
      bytesRead >= 12 &&
      header.toString("ascii", 0, 4) === "RIFF" &&
      header.toString("ascii", 8, 12) === "WEBP"
    );
  } finally {
    await handle.close();
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    server: "online",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.get("/api/reports", requireAuth, requireDatabase, async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {}
        : req.user.role === "worker"
          ? { assignedTo: req.user._id }
          : { reporter: req.user._id };
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .populate("assignedTo", "displayName")
      .populate("activity.actor", "displayName")
      .populate("activity.assignedTo", "displayName")
      .populate("resolutionEvidence.submittedBy", "displayName")
      .populate("resolutionEvidence.reviewedBy", "displayName");
    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error("Fetch reports error:", error.message);
    res.status(500).json({ success: false, message: "Unable to fetch reports" });
  }
});

app.get(
  "/api/admin/duplicate-clusters",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (_req, res) => {
    try {
      const reports = await Report.find({
        latitude: { $exists: true },
        longitude: { $exists: true },
      })
        .select("title type location latitude longitude severity status createdAt")
        .sort({ createdAt: -1 })
        .lean();
      const clusters = findDuplicateClusters(reports);
      res.json({
        success: true,
        radiusMeters: CLUSTER_RADIUS_METERS,
        clusterCount: clusters.length,
        clusters,
      });
    } catch (error) {
      console.error("Duplicate report clustering error:", error.message);
      res.status(503).json({
        success: false,
        message: "Unable to find nearby reports right now.",
      });
    }
  },
);

app.get(
  "/api/admin/sla",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (_req, res) => {
    try {
      const reports = await Report.find({ status: { $ne: "Resolved" } })
        .select("title type location severity status createdAt assignedTo")
        .sort({ createdAt: 1 })
        .populate("assignedTo", "displayName")
        .lean();
      res.json({ success: true, ...buildSlaSnapshot(reports) });
    } catch (error) {
      console.error("SLA report calculation error:", error.message);
      res.status(503).json({
        success: false,
        message: "Unable to calculate report deadlines right now.",
      });
    }
  },
);

app.post(
  "/api/reports",
  requireAuth,
  requireDatabase,
  requireCitizen,
  upload.single("photo"),
  async (req, res) => {
  const { title, description = "", type, location, severity, latitude, longitude } = req.body ?? {};
  const hasLatitude = latitude !== undefined && latitude !== "";
  const hasLongitude = longitude !== undefined && longitude !== "";
  const parsedLatitude = hasLatitude ? Number(latitude) : undefined;
  const parsedLongitude = hasLongitude ? Number(longitude) : undefined;

  if (req.file) {
    try {
      if (!(await hasValidImageSignature(req.file))) {
        await removeUploadedFile(req.file);
        res.status(400).json({
          success: false,
          message: "The uploaded file does not match its image format.",
        });
        return;
      }
    } catch (error) {
      await removeUploadedFile(req.file);
      console.error("Unable to validate report photo:", error.message);
      res.status(500).json({
        success: false,
        message: "Unable to validate report photo",
      });
      return;
    }
  }

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 160 ||
    typeof location !== "string" ||
    !location.trim() ||
    location.trim().length > 240 ||
    typeof description !== "string" ||
    description.trim().length > 1000 ||
    hasLatitude !== hasLongitude ||
    (hasLatitude &&
      (!Number.isFinite(parsedLatitude) ||
        parsedLatitude < -90 ||
        parsedLatitude > 90 ||
        !Number.isFinite(parsedLongitude) ||
        parsedLongitude < -180 ||
        parsedLongitude > 180)) ||
    !["Garbage", "Pothole"].includes(type)
  ) {
    await removeUploadedFile(req.file);
    res.status(400).json({
      success: false,
      message: "Enter a title (up to 160 characters), location (up to 240 characters), and valid issue type.",
    });
    return;
  }

  try {
    const report = await Report.create({
      title: title.trim(),
      description: description.trim(),
      type,
      location: location.trim(),
      ...(hasLatitude ? { latitude: parsedLatitude, longitude: parsedLongitude } : {}),
      severity: ["Low", "Medium", "High"].includes(severity)
        ? severity
        : "Medium",
      imageUrl: req.file ? `/uploads/${req.file.filename}` : null,
      reporter: req.user._id,
      activity: [{ event: "submitted", actor: req.user._id }],
    });

    res.status(201).json({ success: true, report });
  } catch (error) {
    await removeUploadedFile(req.file);
    console.error("Create report error:", error.message);
    res.status(500).json({ success: false, message: "Unable to create report" });
  }
  },
);

app.post(
  "/api/reports/:id/resolution-evidence",
  requireAuth,
  requireDatabase,
  requireWorker,
  requireAssignedWorkerReport,
  resolutionEvidenceUpload,
  async (req, res) => {
    const afterPhoto = req.files?.afterPhoto?.[0];
    const uploadedFiles = [afterPhoto].filter(Boolean);

    if (!afterPhoto) {
      await Promise.all(uploadedFiles.map(removeUploadedFile));
      res.status(400).json({
        success: false,
        message: "Upload an after-work photo showing the completed repair.",
      });
      return;
    }

    try {
      const validImages = await Promise.all(uploadedFiles.map(hasValidImageSignature));
      if (validImages.some((valid) => !valid)) {
        await Promise.all(uploadedFiles.map(removeUploadedFile));
        res.status(400).json({
          success: false,
          message: "An uploaded file does not match its image format.",
        });
        return;
      }

      if (req.report.status !== "In Progress") {
        await Promise.all(uploadedFiles.map(removeUploadedFile));
        res.status(409).json({
          success: false,
          message: "Move this report to In Progress before submitting repair evidence.",
        });
        return;
      }

      if (req.report.resolutionEvidence.some((evidence) => evidence.reviewStatus === "pending")) {
        await Promise.all(uploadedFiles.map(removeUploadedFile));
        res.status(409).json({
          success: false,
          message: "This report already has repair evidence waiting for admin review.",
        });
        return;
      }

      req.report.resolutionEvidence.push({
        beforeImageUrl: null,
        afterImageUrl: `/uploads/${afterPhoto.filename}`,
        submittedBy: req.user._id,
        reviewStatus: "pending",
      });
      const evidence = req.report.resolutionEvidence.at(-1);
      req.report.activity.push({
        event: "evidence",
        evidenceId: evidence._id,
        actor: req.user._id,
      });
      await req.report.save();

      await req.report.populate("assignedTo", "displayName");
      await req.report.populate("activity.actor", "displayName");
      await req.report.populate("activity.assignedTo", "displayName");
      await req.report.populate("resolutionEvidence.submittedBy", "displayName");
      await req.report.populate("resolutionEvidence.reviewedBy", "displayName");
      res.status(201).json({ success: true, report: req.report });
    } catch (error) {
      await Promise.all(uploadedFiles.map(removeUploadedFile));
      console.error("Resolution evidence submission error:", error.message);
      res.status(503).json({
        success: false,
        message: "Unable to submit repair evidence right now.",
      });
    }
  },
);

app.patch(
  "/api/reports/:id/resolution-evidence/:evidenceId/review",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    const { id, evidenceId } = req.params;
    const { decision, note = "" } = req.body ?? {};

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(evidenceId)) {
      res.status(400).json({ success: false, message: "Invalid report or evidence ID." });
      return;
    }
    if (
      !["approve", "reject"].includes(decision) ||
      typeof note !== "string" ||
      note.trim().length > 500 ||
      (decision === "reject" && !note.trim())
    ) {
      res.status(400).json({
        success: false,
        message: "Choose approve or reject; a rejection needs a note of up to 500 characters.",
      });
      return;
    }

    try {
      const report = await Report.findById(id);
      if (!report) {
        res.status(404).json({ success: false, message: "Report not found." });
        return;
      }
      const evidence = report.resolutionEvidence.id(evidenceId);
      if (!evidence) {
        res.status(404).json({ success: false, message: "Resolution evidence not found." });
        return;
      }
      if (evidence.reviewStatus !== "pending") {
        res.status(409).json({
          success: false,
          message: "This evidence has already been reviewed.",
        });
        return;
      }

      const previousStatus = report.status;
      evidence.reviewStatus = decision === "approve" ? "approved" : "rejected";
      evidence.reviewedAt = new Date();
      evidence.reviewedBy = req.user._id;
      evidence.reviewNote = note.trim();
      report.activity.push({
        event: "review",
        evidenceId: evidence._id,
        note: note.trim(),
        actor: req.user._id,
      });

      if (decision === "approve") {
        report.status = "Resolved";
        report.activity.push({
          event: "status",
          status: "Resolved",
          actor: req.user._id,
        });
      }
      await report.save();
      await report.populate("assignedTo", "displayName");
      await report.populate("activity.actor", "displayName");
      await report.populate("activity.assignedTo", "displayName");
      await report.populate("resolutionEvidence.submittedBy", "displayName");
      await report.populate("resolutionEvidence.reviewedBy", "displayName");
      res.json({
        success: true,
        report,
        previousStatus,
      });
    } catch (error) {
      console.error("Resolution evidence review error:", error.message);
      res.status(503).json({
        success: false,
        message: "Unable to review repair evidence right now.",
      });
    }
  },
);

app.patch(
  "/api/reports/:id/status",
  requireAuth,
  requireDatabase,
  async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, message: "Invalid report ID" });
    return;
  }

  if (!["Pending", "In Progress", "Resolved"].includes(status)) {
    res.status(400).json({ success: false, message: "Invalid status" });
    return;
  }

  if (
    req.user.role === "citizen" ||
    (req.user.role === "worker" && status !== "In Progress")
  ) {
    res.status(403).json({
      success: false,
      message: req.user.role === "worker"
        ? "Workers can only move assigned reports to In Progress. Resolution requires admin approval of repair evidence."
        : "Administrator access is required.",
    });
    return;
  }

  try {
    const query =
      req.user.role === "worker"
        ? { _id: id, assignedTo: req.user._id }
        : { _id: id };
    const currentReport = await Report.findOne(query);

    if (!currentReport) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    if (
      status === "Resolved" &&
      currentReport.resolutionEvidence.at(-1)?.reviewStatus !== "approved"
    ) {
      res.status(409).json({
        success: false,
        message: "Approve the latest resolution evidence before resolving this report.",
      });
      return;
    }

    if (currentReport.status === status) {
      await currentReport.populate("assignedTo", "displayName");
      await currentReport.populate("activity.actor", "displayName");
      await currentReport.populate("activity.assignedTo", "displayName");
      res.json({ success: true, report: currentReport });
      return;
    }

    const report = await Report.findOneAndUpdate(
      { ...query, status: currentReport.status },
      {
        $set: { status },
        $push: {
          activity: {
            event: "status",
            status,
            actor: req.user._id,
          },
        },
      },
      { new: true, runValidators: true },
    )
      .populate("assignedTo", "displayName")
      .populate("activity.actor", "displayName")
      .populate("activity.assignedTo", "displayName");

    if (!report) {
      res.status(409).json({
        success: false,
        message: "This report changed in another session. Refresh and try again.",
      });
      return;
    }

    res.json({ success: true, report });
  } catch (error) {
    console.error("Update report error:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to update report status",
    });
  }
  },
);

app.patch(
  "/api/reports/:id/assignee",
  requireAuth,
  requireAdmin,
  requireDatabase,
  async (req, res) => {
    const { id } = req.params;
    const { workerId = null } = req.body ?? {};

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid report ID." });
      return;
    }
    if (workerId !== null && !mongoose.isValidObjectId(workerId)) {
      res.status(400).json({ success: false, message: "Invalid worker ID." });
      return;
    }

    try {
      if (workerId && !(await User.exists({ _id: workerId, role: "worker" }))) {
        res.status(404).json({ success: false, message: "Worker not found." });
        return;
      }

      const currentReport = await Report.findById(id);
      if (!currentReport) {
        res.status(404).json({ success: false, message: "Report not found." });
        return;
      }

      const currentAssigneeId = currentReport.assignedTo?._id || currentReport.assignedTo;
      if (String(currentAssigneeId || "") === String(workerId || "")) {
        await currentReport.populate("assignedTo", "displayName");
        await currentReport.populate("activity.actor", "displayName");
        await currentReport.populate("activity.assignedTo", "displayName");
        return res.json({ success: true, report: currentReport });
      }

      const report = await Report.findByIdAndUpdate(
        id,
        {
          $set: { assignedTo: workerId },
          $push: {
            activity: {
              event: "assignment",
              assignedTo: workerId,
              actor: req.user._id,
            },
          },
        },
        { new: true, runValidators: true },
      )
        .populate("assignedTo", "displayName")
        .populate("activity.actor", "displayName")
        .populate("activity.assignedTo", "displayName");

      if (!report) {
        res.status(404).json({ success: false, message: "Report not found." });
        return;
      }

      res.json({ success: true, report });
    } catch (error) {
      console.error("Assign report error:", error.message);
      res.status(503).json({ success: false, message: "Unable to assign report right now." });
    }
  },
);

app.get(
  "/uploads/:filename",
  requireAuth,
  requireDatabase,
  async (req, res) => {
    const { filename } = req.params;
    if (!/^[\da-f-]{36}\.(jpg|png|webp)$/i.test(filename)) {
      res.status(404).json({ success: false, message: "Photo not found." });
      return;
    }

    try {
      const reportAccess =
        req.user.role === "admin"
          ? {}
          : req.user.role === "worker"
            ? { assignedTo: req.user._id }
            : { reporter: req.user._id };
      const report = await Report.findOne({
        $or: [
          { imageUrl: `/uploads/${filename}` },
          { "resolutionEvidence.beforeImageUrl": `/uploads/${filename}` },
          { "resolutionEvidence.afterImageUrl": `/uploads/${filename}` },
        ],
        ...reportAccess,
      }).select("_id");

      if (!report) {
        res.status(404).json({ success: false, message: "Photo not found." });
        return;
      }

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(path.join(uploadDirectory, filename), (error) => {
        if (error && !res.headersSent) {
          console.error("Unable to serve report photo:", error.message);
          res.status(404).json({ success: false, message: "Photo not found." });
        }
      });
    } catch (error) {
      console.error("Report photo access error:", error.message);
      res.status(503).json({ success: false, message: "Unable to load photo right now." });
    }
  },
);

app.use(async (error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    res.status(400).json({ success: false, message: "Request body must contain valid JSON." });
    return;
  }

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      success: false,
      message: "Photo must be 5 MB or smaller.",
    });
    return;
  }

  if (error instanceof multer.MulterError || error.message === "Upload a JPEG, PNG, or WebP image.") {
    res.status(400).json({ success: false, message: error.message });
    return;
  }

  if (error.message === "Origin is not allowed by CORS.") {
    res.status(403).json({ success: false, message: error.message });
    return;
  }

  console.error("Request error:", error.message);
  res.status(error.status === 413 ? 413 : 500).json({
    success: false,
    message: error.status === 413
      ? "Request body must be 1 MB or smaller."
      : "Unable to process request",
  });
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`RewaCivicAI backend running on http://localhost:${PORT}`);

    if (!process.env.MONGODB_URI) {
      console.error("MONGODB_URI missing. Check backend/.env");
      return;
    }

    mongoose
      .connect(process.env.MONGODB_URI)
      .then(() => console.log("MongoDB connected successfully"))
      .catch((error) => console.error("MongoDB connection failed:", error.message));
  });
}

if (require.main === module) {
  startServer();
}

app.locals.models = { User, Report, LoginEvent };
module.exports = app;
