// WEBSITE: routes/callbackRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// FIXED: Emergency balance function that actually works
async function getEmergencyBalance(memberAccount) {
  try {
    console.log(`[EmergencyBalance] Looking up user: ${memberAccount}`);

    const User = require("../models/User");
    const WalletService = require("../services/walletService");

    // FIXED: Handle both number and string userId
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

    // FIXED: Return number, not string
    return typeof balance === "number" ? balance : parseFloat(balance) || 0;
  } catch (error) {
    console.error("[EmergencyBalance] Error:", error);
    return null;
  }
}

router.post("/internal/provider-callback", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  console.log(`[${requestId}] Callback received:`, {
    member: req.body.member_account,
    round: req.body.game_round,
    bet: req.body.bet_amount,
    win: req.body.win_amount,
  });

  try {
    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(`[${requestId}] Unauthorized`);
      return res.status(401).json({ credit_amount: -1, error: "Unauthorized" });
    }

    const callbackData = req.body;
    const { member_account, game_round } = callbackData;

    // Call your existing handleGameCallback
    const result = await IGamingService.handleGameCallback(callbackData);

    const duration = Date.now() - startTime;

    console.log(`[${requestId}] handleGameCallback result:`, {
      credit_amount: result?.credit_amount,
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

      // FIXED: Return emergency balance only if valid
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

    // FIXED: Ensure numeric value
    const creditAmount =
      typeof result.credit_amount === "number"
        ? result.credit_amount
        : parseFloat(result.credit_amount);

    console.log(`[${requestId}] Returning balance: ${creditAmount}`);

    return res.status(200).json({
      credit_amount: isNaN(creditAmount) ? 0 : creditAmount,
      timestamp: result.timestamp || Date.now(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error after ${duration}ms:`, error);

    // FIXED: Try to get emergency balance
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

    return res.status(200).json({
      credit_amount: finalBalance,
      timestamp: Date.now(),
      error: error.message,
    });
  }
});

// FIXED: Balance endpoint - returns proper number
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

    // FIXED: Use same emergency balance function
    const balance = await getEmergencyBalance(memberAccount);

    // FIXED: Return proper number, not string
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

module.exports = router;
