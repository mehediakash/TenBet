const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    fullName: {
      type: String,
      trim: true,
      default: "",
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value) => !/\s/.test(value),
        message: "Username cannot contain spaces",
      },
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^01[3-9]\d{8}$/, "Invalid Bangladesh phone number"],
    },
    phones: [
      {
        number: {
          type: String,
          trim: true,
          match: [/^01[3-9]\d{8}$/, "Invalid Bangladesh phone number"],
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },

    // Role & Hierarchy
    role: {
      type: String,
      enum: ["user", "sub_agent", "agent", "master_agent", "admin"],
      default: "user",
    },
    referenceCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referralCodeUsed: {
      type: String,
      default: null,
    },
    hierarchy: {
      masterAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      agent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      subAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    userId: {
      type: Number,
      unique: true,
      index: true,
    },
    // Wallet System
    wallet: {
      main: { type: Number, default: 0, min: 0 },
      bonus: { type: Number, default: 0, min: 0 },
      freeBets: { type: Number, default: 0, min: 0 },
    },

    // Status & Verification
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    isSuspended: { type: Boolean, default: false },

    // Security
    otp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      purpose: {
        type: String,
        enum: ["signup", "reset_password", "email_verification"],
        default: null,
      },
    },
    lastLogin: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // Terms & Conditions
    agreedToTerms: { type: Boolean, default: false },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for referred users count
userSchema.virtual("referredUsersCount", {
  ref: "User",
  localField: "_id",
  foreignField: "referredBy",
  count: true,
});

// Indexes for performance
userSchema.index({ role: 1 });
userSchema.index({ referredBy: 1 });
userSchema.index({ "hierarchy.masterAgent": 1 });
userSchema.index({ "hierarchy.agent": 1 });
userSchema.index({ "hierarchy.subAgent": 1 });
userSchema.index({ "otp.expiresAt": 1 }, { expireAfterSeconds: 0 });

// Generate reference code & sanitize wallet & updatedAt
userSchema.pre("save", function () {
  if (this.isNew && !this.referenceCode) {
    const randomString = Math.random().toString(36).substr(2, 9).toUpperCase();
    this.referenceCode = `REF${randomString}`;
  }

  const normalizedPhones = Array.isArray(this.phones)
    ? this.phones
        .map((entry) => ({
          number: typeof entry?.number === "string" ? entry.number.trim() : "",
          isPrimary: Boolean(entry?.isPrimary),
        }))
        .filter((entry) => entry.number)
    : [];

  if (normalizedPhones.length > 0) {
    const primaryIndex = normalizedPhones.findIndex((entry) => entry.isPrimary);

    const resolvedPhones = normalizedPhones.map((entry, index) => ({
      number: entry.number,
      isPrimary: primaryIndex === -1 ? index === 0 : index === primaryIndex,
    }));

    this.phones = resolvedPhones;
    this.phone =
      resolvedPhones.find((entry) => entry.isPrimary)?.number ||
      resolvedPhones[0].number;
  } else if (typeof this.phone === "string" && this.phone.trim()) {
    this.phone = this.phone.trim();
    this.phones = [{ number: this.phone, isPrimary: true }];
  }

  if (
    this.isModified("wallet.main") ||
    this.isModified("wallet.bonus") ||
    this.isModified("wallet.freeBets")
  ) {
    this.wallet.main = Math.max(0, this.wallet.main);
    this.wallet.bonus = Math.max(0, this.wallet.bonus);
    this.wallet.freeBets = Math.max(0, this.wallet.freeBets);
  }

  this.updatedAt = Date.now();
});

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return this.password === candidatePassword;
};

// Check if account is locked
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
    return this.save();
  }

  this.loginAttempts += 1;

  if (this.loginAttempts >= 5 && !this.isLocked()) {
    this.lockUntil = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
  }

  return this.save();
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = new Date();
  return this.save();
};

// Generate OTP
userSchema.methods.generateOTP = function (purpose) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  this.otp = {
    code: otp,
    expiresAt: expiresAt,
    purpose: purpose,
  };

  return this.save().then(() => otp);
};

// Verify OTP
userSchema.methods.verifyOTP = function (enteredOTP, purpose) {
  if (!this.otp || !this.otp.code || !this.otp.expiresAt) {
    return false;
  }

  const isExpired = this.otp.expiresAt < new Date();
  const isMatch = this.otp.code === enteredOTP;
  const isPurposeMatch = this.otp.purpose === purpose;

  if (isMatch && !isExpired && isPurposeMatch) {
    this.otp = { code: null, expiresAt: null, purpose: null };
    return this.save().then(() => true);
  }

  return false;
};

module.exports = mongoose.model("User", userSchema);
