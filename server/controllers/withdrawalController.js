const Withdrawal = require("../models/Withdrawal");
const PaymentMethod = require("../models/PaymentMethod");
const WalletService = require("../services/walletService");
const withdrawalValidationService = require("../services/withdrawalValidationService");
const User = require("../models/User");

// @desc    Get withdrawal methods
// @route   GET /api/payments/withdrawal-methods
// @access  Private
exports.getWithdrawalMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({
      isActive: true,
    }).select("-createdBy -updatedAt");

    const methods = paymentMethods.map((item) => ({
      id: String(item.provider || item.name || item._id).toLowerCase(),
      name:
        item.displayName ||
        item.name ||
        String(item.provider || "").replace(/^\w/, (c) => c.toUpperCase()),
      image: item.image || item.logo || item.icon || "",
    }));

    res.status(200).json({
      success: true,
      data: methods,
    });
  } catch (error) {
    console.error("Get withdrawal methods error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching withdrawal methods",
    });
  }
};

// @desc    Create withdrawal request
// @route   POST /api/payments/withdraw
// @access  Private
//
// WALLET STRUCTURE & RULES:
// ========================
// wallet.main      = Withdrawable balance (deposits + completed bonuses)
// wallet.bonus     = Locked promotional balance (requires turnover completion)
// wallet.freeBets  = Free spin/freebet balance
//
// WITHDRAWAL RULES:
// 1. ONLY wallet.main can be withdrawn
// 2. If active turnover exists: REJECT withdrawal
// 3. If wallet.bonus > 0: REJECT withdrawal (turnover not yet completed)
// 4. When turnover completes: bonus moves from wallet.bonus → wallet.main
// 5. Free spin winnings go to wallet.bonus (requires turnover before withdrawal)
exports.createWithdrawal = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    console.log("WITHDRAW BODY:", req.body);

    const { amount, provider, accountNumber } = req.body;
    const withdrawAmount = Number(amount);
    const normalizedProvider = String(provider || "")
      .toLowerCase()
      .trim();
    const trimmedAccountNumber = String(accountNumber || "").trim();

    if (!amount || !provider || !accountNumber) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (!Number.isFinite(withdrawAmount) || withdrawAmount < 200) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdraw amount is 200 BDT",
      });
    }

    // ✅ CHECK WITHDRAWAL LOCK - Reject if user has active turnover
    const withdrawalCheck =
      await withdrawalValidationService.checkWithdrawalLock(req.user.id);

    if (withdrawalCheck.isLocked) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Complete turnover requirement first",
        locked: true,
        turnoverDetails: withdrawalCheck.turnover,
      });
    }

    const paymentMethodDoc = await PaymentMethod.findOne({
      $or: [
        { provider: normalizedProvider },
        { name: new RegExp("^" + normalizedProvider + "$", "i") },
        { id: normalizedProvider },
      ],
      isActive: true,
    }).session(session);

    if (!paymentMethodDoc) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (withdrawAmount < paymentMethodDoc.minWithdraw) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ${paymentMethodDoc.minWithdraw}`,
      });
    }

    if (withdrawAmount > paymentMethodDoc.maxWithdraw) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: `Maximum withdrawal amount is ${paymentMethodDoc.maxWithdraw}`,
      });
    }

    let processingFee = paymentMethodDoc.processingFee;
    if (paymentMethodDoc.processingFeeType === "percentage") {
      processingFee = (withdrawAmount * processingFee) / 100;
    }

    const netAmount = withdrawAmount - processingFee;

    if (netAmount < 0) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Amount too small after processing fee",
      });
    }

    const user = await User.findById(req.user.id).session(session);
    const currentBalance =
      Number(user?.mainWallet ?? user?.wallet?.main ?? 0) || 0;

    if (currentBalance < withdrawAmount) {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    if (user.wallet && typeof user.wallet.main === "number") {
      user.wallet.main -= withdrawAmount;
    }
    if (typeof user.mainWallet === "number") {
      user.mainWallet -= withdrawAmount;
    }

    await user.save({ session });

    const withdrawal = await Withdrawal.create(
      [
        {
          user: req.user.id,
          amount: withdrawAmount,
          netAmount,
          processingFee,
          paymentMethod: normalizedProvider,
          provider: normalizedProvider,
          status: "pending",
          paymentDetails: {
            toNumber: trimmedAccountNumber,
            accountNumber: trimmedAccountNumber,
            accountName: trimmedAccountNumber,
            bankName: null,
            branchName: null,
          },
        },
      ],
      { session },
    );

    const Transaction = require("../models/Transaction");
    await Transaction.create(
      [
        {
          user: req.user.id,
          type: "withdrawal",
          amount: withdrawAmount,
          walletType: "main",
          previousBalance: currentBalance,
          newBalance: currentBalance - withdrawAmount,
          status: "pending",
          description: `Withdrawal request - ${normalizedProvider}`,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: {
        withdrawalId: withdrawal[0]._id,
        referenceId: withdrawal[0].referenceId,
        amount: withdrawal[0].amount,
        netAmount: withdrawal[0].netAmount,
        processingFee: withdrawal[0].processingFee,
        status: withdrawal[0].status,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Create withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating withdrawal request",
    });
  }
};

// @desc    Get user withdrawal history
// @route   GET /api/payments/withdrawals
// @access  Private
exports.getWithdrawalHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    // Allow admins to fetch all withdrawals across users when scope=all
    const isAdminAll = req.user?.role === "admin" && req.query.scope === "all";
    const query = isAdminAll ? {} : { user: req.user.id };
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query)
      .populate("user", "fullName email phone")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-__v");

    const total = await Withdrawal.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        withdrawals,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      },
    });
  } catch (error) {
    console.error("Get withdrawal history error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching withdrawal history",
    });
  }
};

// @desc    Get withdrawal details
// @route   GET /api/payments/withdrawals/:id
// @access  Private
exports.getWithdrawalDetails = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal not found",
      });
    }

    res.status(200).json({
      success: true,
      data: withdrawal,
    });
  } catch (error) {
    console.error("Get withdrawal details error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching withdrawal details",
    });
  }
};

// @desc    Cancel pending withdrawal
// @route   PUT /api/payments/withdrawals/:id/cancel
// @access  Private
exports.cancelWithdrawal = async (req, res) => {
  const session = await User.startSession();
  session.startTransaction();

  try {
    const withdrawal = await Withdrawal.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: "Withdrawal not found",
      });
    }

    if (withdrawal.status !== "pending") {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Only pending withdrawals can be cancelled",
      });
    }

    // Refund amount to user's wallet
    const user = await User.findById(req.user.id).session(session);
    user.wallet.main += withdrawal.amount;
    await user.save({ session });

    // Update withdrawal status
    withdrawal.status = "rejected";
    withdrawal.rejectionReason = "Cancelled by user";
    await withdrawal.save({ session });

    // Create transaction record for refund
    const Transaction = require("../models/Transaction");
    await Transaction.create(
      [
        {
          user: req.user.id,
          type: "refund",
          amount: withdrawal.amount,
          walletType: "main",
          previousBalance: user.wallet.main - withdrawal.amount,
          newBalance: user.wallet.main,
          status: "completed",
          description: "Withdrawal cancellation refund",
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Withdrawal cancelled successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Cancel withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while cancelling withdrawal",
    });
  }
};
