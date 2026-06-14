// ADD TO YOUR EXISTING WEBSITE ROUTES FILE
// routes/callbackRoutes.js

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// IMPORTANT: Use your existing igamingService
const IGamingService = require("../services/igamingService");

/**
 * Internal callback endpoint for Callback Hub
 * Receives forwarded callbacks from the hub
 */
router.post("/internal/provider-callback", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  try {
    // Verify secret (prevents unauthorized access)
    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(`[${requestId}] Unauthorized callback attempt`);
      return res.status(401).json({
        credit_amount: -1,
        error: "Unauthorized",
      });
    }

    const callbackData = req.body;
    const { game_round, member_account } = callbackData;

    console.log(
      `[${requestId}] Processing callback: round=${game_round}, member=${member_account}`,
    );

    // CALL YOUR EXISTING handleGameCallback() METHOD
    // This preserves ALL your existing business logic:
    // - Wallet updates
    // - Betting history
    // - Turnover tracking
    // - Everything else
    const result = await IGamingService.handleGameCallback(callbackData);

    const duration = Date.now() - startTime;
    console.log(
      `[${requestId}] Callback processed in ${duration}ms: result=${result?.credit_amount}`,
    );

    // Return in the format provider expects
    return res.status(200).json({
      credit_amount: result?.credit_amount ?? result?.balance ?? 0,
      timestamp: result?.timestamp ?? Date.now(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Callback error after ${duration}ms:`, error);

    // Always return 200 to prevent provider retries
    // Return current balance from database if possible
    let fallbackBalance = 0;
    try {
      const { member_account } = req.body;
      if (member_account) {
        const User = require("../models/User");
        const WalletService = require("../services/walletService");
        const user = await User.findOne({ userId: member_account });
        if (user) {
          const wallet = await WalletService.getWalletBalance(user._id);
          fallbackBalance = wallet?.main || 0;
        }
      }
    } catch (balanceError) {
      // Ignore balance lookup errors
    }

    return res.status(200).json({
      credit_amount: fallbackBalance,
      timestamp: Date.now(),
      error: "Processing error, using fallback balance",
    });
  }
});

/**
 * Balance check endpoint for callback hub fallback
 */
router.get("/internal/balance", async (req, res) => {
  try {
    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { memberAccount } = req.query;
    if (!memberAccount) {
      return res.status(400).json({ error: "memberAccount required" });
    }

    const User = require("../models/User");
    const WalletService = require("../services/walletService");

    const user = await User.findOne({ userId: String(memberAccount) });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const wallet = await WalletService.getWalletBalance(user._id);
    const balance = wallet?.main || 0;

    return res.json({
      balance,
      memberAccount,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Balance endpoint error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
