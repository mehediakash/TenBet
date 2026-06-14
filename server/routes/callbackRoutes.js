// routes/callbackRoutes.js - Add to your existing website
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const IGamingService = require("../services/igamingService");
const GameSession = require("../models/GameSession");
const WalletService = require("../services/walletService");
const User = require("../models/User");

// Emergency balance function
async function getEmergencyBalance(memberAccount) {
  try {
    console.log(`[EmergencyBalance] Looking up user: ${memberAccount}`);

    const user = await User.findOne({
      $or: [
        { userId: String(memberAccount) },
        { userId: Number(memberAccount) },
        { _id: memberAccount },
      ],
    });

    if (!user) {
      console.error(`[EmergencyBalance] User not found: ${memberAccount}`);
      return null;
    }

    const wallet = await WalletService.getWalletBalance(user._id);
    const balance = wallet?.main ?? wallet?.balance ?? 0;

    console.log(
      `[EmergencyBalance] Balance=${balance} for user ${memberAccount}`,
    );

    return typeof balance === "number" ? balance : parseFloat(balance) || 0;
  } catch (error) {
    console.error("[EmergencyBalance] Error:", error);
    return null;
  }
}

// Main callback endpoint for Callback Hub
router.post("/internal/provider-callback", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  console.log(`[${requestId}] ========== CALLBACK RECEIVED ==========`);
  console.log(`[${requestId}] Payload:`, JSON.stringify(req.body, null, 2));

  try {
    // Verify secret
    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(`[${requestId}] Unauthorized - invalid secret`);
      return res.status(401).json({ credit_amount: -1, error: "Unauthorized" });
    }

    const callbackData = req.body;
    const { member_account, game_round, bet_amount, win_amount, game_uid } =
      callbackData;

    console.log(`[${requestId}] Processing callback:`, {
      member: member_account,
      round: game_round,
      game: game_uid,
      bet: bet_amount,
      win: win_amount,
    });

    // Call your existing handleGameCallback
    const result = await IGamingService.handleGameCallback(callbackData);

    const duration = Date.now() - startTime;

    console.log(`[${requestId}] handleGameCallback result:`, {
      credit_amount: result?.credit_amount,
      error: result?.error,
      duration_ms: duration,
    });

    // Validate result
    if (
      !result ||
      result.credit_amount === undefined ||
      result.credit_amount === null
    ) {
      console.error(`[${requestId}] Invalid result from handleGameCallback`);

      const emergencyBalance = await getEmergencyBalance(member_account);
      const finalBalance =
        emergencyBalance !== null && emergencyBalance >= 0
          ? emergencyBalance
          : 0;

      console.log(`[${requestId}] Emergency fallback balance: ${finalBalance}`);

      return res.status(200).json({
        credit_amount: finalBalance,
        timestamp: Date.now(),
        warning: "Using emergency balance",
      });
    }

    // Ensure numeric value
    const creditAmount =
      typeof result.credit_amount === "number"
        ? result.credit_amount
        : parseFloat(result.credit_amount);

    console.log(`[${requestId}] Returning balance: ${creditAmount}`);
    console.log(`[${requestId}] ========== CALLBACK COMPLETE ==========`);

    return res.status(200).json({
      credit_amount: isNaN(creditAmount) ? 0 : creditAmount,
      timestamp: result.timestamp || Date.now(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error after ${duration}ms:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);

    let emergencyBalance = null;
    try {
      const { member_account } = req.body;
      if (member_account) {
        emergencyBalance = await getEmergencyBalance(member_account);
      }
    } catch (balanceError) {
      console.error(`[${requestId}] Emergency balance failed:`, balanceError);
    }

    const finalBalance =
      emergencyBalance !== null && emergencyBalance >= 0 ? emergencyBalance : 0;

    console.log(`[${requestId}] Error response balance: ${finalBalance}`);
    console.log(`[${requestId}] ========== CALLBACK ERROR ==========`);

    return res.status(200).json({
      credit_amount: finalBalance,
      timestamp: Date.now(),
      error: error.message,
    });
  }
});

// Balance check endpoint for Callback Hub
router.get("/internal/balance", async (req, res) => {
  try {
    console.log(`[BalanceEndpoint] Request received:`, req.query);

    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(`[BalanceEndpoint] Unauthorized`);
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { memberAccount } = req.query;
    if (!memberAccount) {
      return res.status(400).json({ error: "memberAccount required" });
    }

    const balance = await getEmergencyBalance(memberAccount);
    const finalBalance = balance !== null && balance >= 0 ? balance : 0;

    console.log(
      `[BalanceEndpoint] Returning balance=${finalBalance} for ${memberAccount}`,
    );

    return res.json({
      balance: finalBalance,
      credit_amount: finalBalance,
      memberAccount,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[BalanceEndpoint] Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Debug endpoint - Check game sessions
router.get("/debug/game-sessions/:memberAccount", async (req, res) => {
  try {
    const { memberAccount } = req.params;

    const sessions = await GameSession.find({
      memberAccount: String(memberAccount),
    })
      .sort({ createdAt: -1 })
      .lean();

    const activeSessions = sessions.filter((s) => s.status === "active");

    res.json({
      memberAccount,
      total: sessions.length,
      active: activeSessions.length,
      sessions: sessions.map((s) => ({
        id: s._id,
        providerSessionId: s.providerSessionId,
        providerGameCode: s.providerGameCode,
        status: s.status,
        createdAt: s.createdAt,
        endBalance: s.endBalance,
        gameRound: s.gameRound,
        memberAccount: s.memberAccount,
      })),
    });
  } catch (error) {
    console.error("[Debug] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get("/internal/health", async (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    website: process.env.WEBSITE_NAME,
  });
});

module.exports = router;
