const User = require("../models/User");
const Transaction = require("../models/Transaction");
const TurnoverService = require("./turnoverService");

class WalletService {
  // Update user wallet balance
  static async updateWallet(
    userId,
    amount,
    walletType = "main",
    transactionType,
    metadata = {},
    session = null,
  ) {
    try {
      // Insert BEFORE amount normalization:
      console.log("[WALLET][updateWallet] start", {
        userId: String(userId),
        amount,
        walletType,
        transactionType,
        hasSession: !!session,
        metadata,
      });

      // 🔧 FIX: Coerce and round to 2 decimal places to prevent floating point bugs
      amount = Math.round(Number(amount) * 100) / 100;
      if (!isFinite(amount)) {
        throw new Error("Invalid amount");
      }

      // Insert AFTER normalization:
      console.log("[WALLET][updateWallet] normalized amount", {
        userId: String(userId),
        amount,
        walletType,
        transactionType,
      });

      // Validate wallet type
      const validWallets = ["main", "bonus", "freeBets"];
      if (!validWallets.includes(walletType)) {
        throw new Error(
          `Invalid wallet type. Valid values: ${validWallets.join(", ")}`,
        );
      }

      const absAmount = Math.abs(amount);

      let updatedUser = null;
      let previousBalance = null;
      let newBalance = null;

      const updateOptions = {
        new: true,
        runValidators: true,
      };
      if (session) updateOptions.session = session;

      // Insert BEFORE DB update:
      console.log("[WALLET][updateWallet] db update request", {
        userId: String(userId),
        amount,
        absAmount,
        walletType,
        transactionType,
        hasSession: !!session,
      });

      if (amount < 0) {
        updatedUser = await User.findOneAndUpdate(
          { _id: userId, [`wallet.${walletType}`]: { $gte: absAmount } },
          { $inc: { [`wallet.${walletType}`]: amount } },
          updateOptions,
        );
        if (!updatedUser) {
          // Insert before throwing:
          console.log("[WALLET][updateWallet] insufficient balance or user not matched", {
            userId: String(userId),
            amount,
            walletType,
            absAmount,
          });
          throw new Error("Insufficient balance");
        }
      } else {
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $inc: { [`wallet.${walletType}`]: amount } },
          updateOptions,
        );
        if (!updatedUser) {
          console.log("[WALLET][updateWallet] user not found during credit update", {
            userId: String(userId),
            amount,
            walletType,
          });
          throw new Error("User not found during wallet update");
        }
      }

      // Compute previous and new balances from the updated document
      newBalance =
        Math.round(Number(updatedUser.wallet[walletType] ?? 0) * 100) / 100;
      previousBalance = Math.round((newBalance - amount) * 100) / 100;

      // Insert AFTER balance calculation:
      console.log("[WALLET][updateWallet] balance calculation", {
        userId: String(userId),
        walletType,
        amount,
        previousBalance,
        newBalance,
        netChange: amount,
      });

      console.log("💼 [WALLET] Updating wallet:", {
        userId,
        walletType,
        amount,
        previousBalance,
        newBalance,
      });

      // Ensure final stored value is rounded
      updatedUser.wallet[walletType] = newBalance;

      // Insert AFTER wallet object assignment:
      console.log("[WALLET][updateWallet] wallet object after assignment", {
        userId: String(userId),
        main: Math.round(updatedUser.wallet.main * 100) / 100,
        bonus: Math.round(updatedUser.wallet.bonus * 100) / 100,
        freeBets: Math.round(updatedUser.wallet.freeBets * 100) / 100,
      });

      console.log("💼 [WALLET] After update, user.wallet:", {
        main: Math.round(updatedUser.wallet.main * 100) / 100,
        bonus: Math.round(updatedUser.wallet.bonus * 100) / 100,
        freeBets: Math.round(updatedUser.wallet.freeBets * 100) / 100,
      });

      const txData = {
        user: userId,
        type: transactionType,
        amount: Math.round(Math.abs(amount) * 100) / 100,
        walletType: walletType,
        previousBalance: previousBalance,
        newBalance: newBalance,
        status: "completed",
        paymentMethod: metadata.paymentMethod || "system",
        description: metadata.description || "",
        gameRound: metadata.gameRound || null,
        gameUid: metadata.gameUid || null,
        metadata: metadata,
      };

      // Insert BEFORE transaction create:
      console.log("[WALLET][updateWallet] transaction payload", {
        userId: String(userId),
        txData,
      });

      let transaction;
      if (session) {
        const created = await Transaction.create([txData], { session });
        transaction = created[0];
      } else {
        transaction = await Transaction.create(txData);
      }

      // Insert AFTER transaction create:
      console.log("[WALLET][updateWallet] transaction created", {
        userId: String(userId),
        transactionId: String(transaction._id),
        type: transactionType,
        amount: txData.amount,
        newBalance,
      });

      // ✅ UNIVERSAL TURNOVER TRIGGER
      // Record turnover for ANY betting transaction from ANY provider
      if (transactionType === "bet" && Math.abs(amount) > 0) {
        console.log(
          `[WALLET] 🎯 Triggering universal turnover for bet: ${Math.abs(amount)} BDT | User=${userId} | Tx=${transaction._id}`,
        );

        // Non-blocking turnover recording (doesn't fail if turnover fails)
        TurnoverService.recordTurnoverFromTransaction(userId, transaction, {
          betSource: metadata.betSource || "unknown",
          gameType: metadata.gameType,
          provider: metadata.provider,
          ...metadata,
        }).catch((err) => {
          console.error(
            `[WALLET] ⚠ Turnover recording failed (non-blocking): ${err.message}`,
          );
          // Don't fail the wallet update - betting continues
        });
      }

      return {
        success: true,
        previousBalance,
        newBalance,
        transactionId: transaction._id,
      };
    } catch (error) {
      // Replace/extend catch:
      console.error("[WALLET][updateWallet] ERROR", {
        message: error.message,
        stack: error.stack,
        userId: String(userId),
        amount,
        walletType,
        transactionType,
        metadata,
        hasSession: !!session,
      });
      throw error;
    }
  }

  // Get wallet balance
  static async getWalletBalance(userId) {
    // Insert BEFORE query:
    console.log("[WALLET][getWalletBalance] start", {
      userId: String(userId),
    });

    const user = await User.findById(userId).select("wallet");
    if (!user) {
      console.log("[WALLET][getWalletBalance] user not found", {
        userId: String(userId),
      });
      throw new Error("User not found");
    }

    // Insert BEFORE return:
    console.log("[WALLET][getWalletBalance] result", {
      userId: String(userId),
      wallet: user.wallet,
    });

    return user.wallet;
  }

  // Transfer between wallets (main to bonus or vice versa)
  static async transferBetweenWallets(userId, fromWallet, toWallet, amount) {
    // Insert BEFORE validation:
    console.log("[WALLET][transferBetweenWallets] start", {
      userId: String(userId),
      fromWallet,
      toWallet,
      amount,
    });

    if (fromWallet === toWallet) {
      throw new Error("Cannot transfer to same wallet");
    }

    const validWallets = ["main", "bonus"];
    if (
      !validWallets.includes(fromWallet) ||
      !validWallets.includes(toWallet)
    ) {
      throw new Error("Invalid wallet type");
    }

    const session = await User.startSession();
    session.startTransaction();

    try {
      const user = await User.findById(userId).session(session);
      if (!user) {
        console.log("[WALLET][transferBetweenWallets] user not found", {
          userId: String(userId),
        });
        throw new Error("User not found");
      }

      // Insert AFTER user fetch:
      console.log("[WALLET][transferBetweenWallets] user fetched", {
        userId: String(userId),
        fromBalance: user.wallet[fromWallet],
        toBalance: user.wallet[toWallet],
      });

      // Check if source wallet has sufficient balance
      if (user.wallet[fromWallet] < amount) {
        throw new Error(`Insufficient balance in ${fromWallet} wallet`);
      }

      const fromPrevious = user.wallet[fromWallet];
      const toPrevious = user.wallet[toWallet];

      // Update balances
      user.wallet[fromWallet] = fromPrevious - amount;
      user.wallet[toWallet] = toPrevious + amount;

      await user.save({ session });

      // Create transaction records
      const debitTransaction = new Transaction({
        user: userId,
        type: "transfer",
        amount: amount,
        walletType: fromWallet,
        previousBalance: fromPrevious,
        newBalance: user.wallet[fromWallet],
        status: "completed",
        description: `Transfer to ${toWallet} wallet`,
      });

      const creditTransaction = new Transaction({
        user: userId,
        type: "transfer",
        amount: amount,
        walletType: toWallet,
        previousBalance: toPrevious,
        newBalance: user.wallet[toWallet],
        status: "completed",
        description: `Transfer from ${fromWallet} wallet`,
      });

      await Promise.all([
        debitTransaction.save({ session }),
        creditTransaction.save({ session }),
      ]);

      await session.commitTransaction();
      session.endSession();

      // Insert BEFORE return:
      console.log("[WALLET][transferBetweenWallets] success", {
        userId: String(userId),
        fromWallet,
        toWallet,
        amount,
        newFromBalance: user.wallet[fromWallet],
        newToBalance: user.wallet[toWallet],
      });

      return {
        success: true,
        fromWallet: {
          previous: fromPrevious,
          new: user.wallet[fromWallet],
        },
        toWallet: {
          previous: toPrevious,
          new: user.wallet[toWallet],
        },
      };
    } catch (error) {
      // Replace/extend catch:
      console.error("[WALLET][transferBetweenWallets] ERROR", {
        message: error.message,
        stack: error.stack,
        userId: String(userId),
        fromWallet,
        toWallet,
        amount,
      });
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  // Get transaction history
  static async getTransactionHistory(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      type,
      walletType,
      status,
      startDate,
      endDate,
    } = options;

    const query = { user: userId };

    if (type) query.type = type;
    if (walletType) query.walletType = walletType;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Transform transactions to add clarity for bet types
    const transformedTransactions = transactions.map((tx) => {
      const txObj = tx.toObject();

      // Handle "bet" type transactions - these represent player losses
      if (txObj.type === "bet") {
        txObj.displayType = "Player Loss (Bet)";
        txObj.displayDescription =
          txObj.description ||
          `Player lost ${txObj.amount} BDT on ${txObj.gameRound ? "game round " + txObj.gameRound : "betting"}`;
        txObj.isLoss = true;
      } else if (txObj.type === "win") {
        txObj.displayType = "Player Win";
        txObj.displayDescription =
          txObj.description ||
          `Player won ${txObj.amount} BDT on ${txObj.gameRound ? "game round " + txObj.gameRound : "betting"}`;
        txObj.isLoss = false;
      } else {
        txObj.displayType =
          txObj.type.charAt(0).toUpperCase() + txObj.type.slice(1);
        txObj.displayDescription = txObj.description;
        txObj.isLoss = ["withdrawal", "bet", "transfer"].includes(txObj.type);
      }

      return txObj;
    });

    const total = await Transaction.countDocuments(query);

    return {
      transactions: transformedTransactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    };
  }
}

module.exports = WalletService;
