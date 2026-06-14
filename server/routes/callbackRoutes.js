// ADD TO YOUR EXISTING WEBSITE - routes/callbackRoutes.js
const express = require("express");
const router = express.Router();

/**
 * Internal callback endpoint for Callback Hub
 *
 * CRITICAL FIXES:
 * 1. MUST return credit_amount (provider's expected field)
 * 2. MUST NOT modify handleGameCallback() return value
 * 3. Error handler must still return valid credit_amount
 * 4. Log all responses for debugging
 */
router.post("/internal/provider-callback", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const startTime = Date.now();

  try {
    // Verify secret
    const secret = req.headers["x-callback-secret"];
    const expectedSecret = process.env.INTERNAL_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(`[${requestId}] Unauthorized`);
      return res.status(401).json({
        credit_amount: -1,
        error: "Unauthorized",
      });
    }

    const callbackData = req.body;
    const { game_round, member_account, bet_amount, win_amount } = callbackData;

    console.log(
      `[${requestId}] Processing: round=${game_round}, member=${member_account}, bet=${bet_amount}, win=${win_amount}`,
    );

    // CALL YOUR EXISTING handleGameCallback()
    // This method already returns { credit_amount, timestamp }
    const result = await IGamingService.handleGameCallback(callbackData);

    const duration = Date.now() - startTime;

    // CRITICAL: Log the actual balance being returned
    console.log(
      `[${requestId}] handleGameCallback returned: credit_amount=${result?.credit_amount}, duration=${duration}ms`,
    );

    // CRITICAL: Return EXACTLY what handleGameCallback returns
    // DO NOT modify, DO NOT add defaults unless undefined
    if (!result || result.credit_amount === undefined) {
      console.error(
        `[${requestId}] Invalid result from handleGameCallback:`,
        result,
      );

      // Emergency: get balance directly from wallet
      const emergencyBalance = await getEmergencyBalance(member_account);

      return res.status(200).json({
        credit_amount: emergencyBalance,
        timestamp: Date.now(),
        error: "Invalid handler response",
      });
    }

    // SUCCESS: Return the actual balance from your business logic
    return res.status(200).json({
      credit_amount: result.credit_amount,
      timestamp: result.timestamp || Date.now(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Error after ${duration}ms:`, error);

    // CRITICAL: Even on error, try to return actual balance
    let emergencyBalance = 0;
    try {
      const { member_account } = req.body;
      if (member_account) {
        emergencyBalance = await getEmergencyBalance(member_account);
      }
    } catch (balanceError) {
      console.error(`[${requestId}] Emergency balance failed:`, balanceError);
    }

    // Return actual balance, not 0
    return res.status(200).json({
      credit_amount: emergencyBalance,
      timestamp: Date.now(),
      error: error.message,
    });
  }
});

/**
 * Emergency balance retrieval - direct database access
 * This bypasses handleGameCallback() for error scenarios
 */
async function getEmergencyBalance(memberAccount) {
  try {
    const User = require("../models/User");
    const WalletService = require("../services/walletService");

    const user = await User.findOne({ userId: String(memberAccount) });
    if (!user) {
      console.error(`[EmergencyBalance] User not found: ${memberAccount}`);
      return 0;
    }

    const wallet = await WalletService.getWalletBalance(user._id);
    const balance = wallet?.main || 0;

    console.log(
      `[EmergencyBalance] Got balance ${balance} for ${memberAccount}`,
    );
    return balance;
  } catch (error) {
    console.error("[EmergencyBalance] Error:", error);
    return 0;
  }
}

/**
 * Balance check endpoint for callback hub
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

    const balance = await getEmergencyBalance(memberAccount);

    return res.json({
      balance,
      credit_amount: balance, // Include both for compatibility
      memberAccount,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Balance endpoint error:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
