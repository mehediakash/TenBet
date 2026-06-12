const mongoose = require("mongoose");

const axios = require("axios");
const EncryptionUtil = require("../utils/encryption");
const GameSession = require("../models/GameSession");
const BettingHistory = require("../models/BettingHistory");
const TurnoverTrackingService = require("./turnoverTrackingService");
const WalletService = require("./walletService");
const TurnoverService = require("./turnoverService");

/**
 * ⚠️ CRITICAL ISSUE: SESSION LOOKUP VULNERABILITY
 *
 * Current Problem:
 * - Provider callbacks send member_account but it is NOT used for session lookup
 * - Current fallback: GameSession.findOne({ providerGameCode: game_uid, status: "active" })
 * - When multiple users play the same game simultaneously:
 *   * User A (session created 10:00:00) plays game 1373
 *   * User B (session created 10:00:01) plays game 1373
 *   * B's callback with game_uid=1373 will match B's session (most recent, correct)
 *   * BUT: If callback processing is delayed or sessions overlap, wrong user's wallet could be updated
 *
 * Root Cause:
 * - member_account is available in callback but ignored
 * - providerGameCode is not unique per user (same game code for all users)
 * - Current sort by createdAt is not atomic with lookup
 *
 * Recommended Fix (3-part):
 * 1. Add member_account field to GameSession model:
 *    memberAccount: { type: String, default: null, index: true }
 *
 * 2. In launchGame(), store member_account:
 *    gameSession.memberAccount = String(user.userId) // or user.username
 *
 * 3. In handleGameCallback(), lookup by:
 *    const memberAccountUserId = ... (map member_account to MongoDB user._id)
 *    gameSession = await GameSession.findOne({
 *      user: memberAccountUserId,
 *      providerGameCode: game_uid,
 *      status: "active"
 *    })
 *    // This ensures ONE unique session per (user, gameCode) pair
 *
 * Current diagnostic logs added:
 * - [DEBUG][Launch] logs user.userId, username for member_account correlation
 * - [DEBUG][SessionLookup] logs callback member_account and shows it's unused
 * - [DEBUG][SessionLookup] WARNING when using providerGameCode fallback alone
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

class IGamingService {
  constructor() {
    this.apiToken = process.env.IGAMING_API_TOKEN;
    this.baseUrl = process.env.IGAMING_API_URL;
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.encryptionUtil = new EncryptionUtil(this.encryptionKey);

    // ⚡ Cache game details (5 min TTL) to reduce DB queries
    this.gameCache = new Map();
    this.gameCacheTTL = 5 * 60 * 1000;
  }

  // ⚡ Optimized: Get game from cache or DB
  async getGameSafe(gameId) {
    if (!gameId) return null;
    const cacheKey = String(gameId);
    const cached = this.gameCache.get(cacheKey);
    if (cached) return cached;

    try {
      const Game = require("../models/Game");
      const game = await Game.findById(gameId).lean();
      if (game) {
        this.gameCache.set(cacheKey, game);
        setTimeout(() => this.gameCache.delete(cacheKey), this.gameCacheTTL);
      }
      return game;
    } catch (err) {
      console.error("Game cache error:", err.message);
      return null;
    }
  }

  // Launch a casino game
  async launchGame(user, game, options = {}) {
    try {
      const providerGameCode = String(game.game_code).trim();
      const returnUrl = `${process.env.CLIENT_URL}/casino`;
      const callbackUrl = `${process.env.BASE_URL}/api/games/callback`;

      // 1. ALWAYS USE WALLET AS BALANCE SOURCE
      const wallet = await WalletService.getWalletBalance(user._id);
      console.log("[IGAMING][launchGame] wallet balance fetched", {
        userId: String(user._id),
        walletMain: wallet?.main ?? null,
        providerGameCode,
      });

      const balanceToSend = parseFloat((wallet.main || 0).toFixed(2));

      // 3. BUILD PAYLOAD (NO VALUE NAME CHANGED)
      const payload = {
        user_id: String(user.userId),
        balance: String(balanceToSend),
        game_uid: String(providerGameCode),
        token: this.apiToken,
        timestamp: Date.now(),
        return: returnUrl,
        callback: callbackUrl,
        currency_code: "BDT",
        language: "en",
      };

      // 4. ENCRYPT PAYLOAD
      const encrypted = this.encryptionUtil.encryptPayload(payload);

      const launchUrl = `${this.baseUrl}?payload=${encodeURIComponent(encrypted)}&token=${this.apiToken}`;

      // 5. CALL PROVIDER API
      const response = await axios.get(launchUrl, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      // DEBUG (A): Launch — provider response + launch URL + extracted session id
      console.log("[DEBUG][Launch] provider response", {
        code: response?.data?.code ?? null,
        data: response?.data ?? null,
      });
      console.log("[DEBUG][Launch] fullLaunchUrl", launchUrl);
      console.log(
        "[DEBUG][Launch] user.userId for member_account correlation",
        {
          userId_mongo: String(user._id),
          userId_numeric: user.userId,
          username: user.username,
        },
      );

      if (response.data.code !== 0) {
        throw new Error(response.data.msg || "Launch failed");
      }

      const gameUrl = response.data.data.url;

      let urlParams = null;
      try {
        urlParams = new URL(gameUrl).searchParams;
      } catch (err) {
        urlParams = new URLSearchParams(gameUrl.split("?")[1] || "");
      }

      const sessionId =
        urlParams.get("ssoKey") ||
        urlParams.get("id") ||
        `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Insert AFTER this line:
      console.log("[IGAMING][launchGame] provider session id extracted", {
        sessionId,
        providerGameCode,
        gameUrl,
      });

      console.log("PROVIDER SESSION:", {
        extractedSessionId: sessionId,
        gameUid: providerGameCode,
      });

      // DEBUG (B): Before GameSession create/save
      console.log("[DEBUG][GameSession][BeforeSave]", {
        providerSessionId: sessionId,
        providerGameCode,
        userId: user?._id || user?.id || null,
      });

      await GameSession.updateMany(
        {
          user: user._id,
          providerGameCode,
          status: "active",
        },
        {
          status: "closed",
          endedAt: new Date(),
        },
      );

      const gameSession = await GameSession.create({
        user: user._id,
        game: game._id,
        gameUid:
          `GS${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase(),
        providerGameCode,
        providerSessionId: sessionId,
        status: "active",
        startBalance: balanceToSend,
        endBalance: balanceToSend,
        betAmount: 0,
        winAmount: 0,
        currency: "BDT",
        language: "en",
        launchUrl: gameUrl,
        returnUrl,
        callbackUrl,
        providerData: response.data,
      });

      // DEBUG (C): After GameSession saved
      console.log("[DEBUG][GameSession][Saved]", {
        savedSessionId: gameSession?._id || null,
        savedProviderSessionId: gameSession?.providerSessionId || null,
        savedProviderGameCode: gameSession?.providerGameCode || null,
        userId: user?._id || null,
      });

      if (!IS_PRODUCTION)
        console.log(
          `GAME LAUNCHED → Balance sent: ${balanceToSend} | Game: ${game.game_name}`,
        );

      return {
        success: true,
        gameUrl,
        balanceSent: balanceToSend,
      };
    } catch (error) {
      // Replace/extend existing catch logging:
      console.error("[IGAMING][launchGame] ERROR", {
        message: error.message,
        stack: error.stack,
        userId: user?._id,
        gameId: game?._id,
      });
      throw error;
    }
  }

  // Handle game callback from provider
  async handleGameCallback(callbackData) {
    // Insert BEFORE any processing:
    const callbackStart = Date.now();
    console.log("[IGAMING][handleGameCallback] start", {
      receivedAt: new Date(callbackStart).toISOString(),
      callbackData,
    });

    console.log("[CALLBACK RECEIVED]", callbackData);

    // DEBUG (D): Full callback payload and field list (service level)
    console.log("[DEBUG][Callback] full payload (service)", callbackData);
    console.log(
      "[DEBUG][Callback] payload fields",
      Object.keys(callbackData || {}),
    );
    console.log("[DEBUG][Callback] important fields", {
      serial_number: callbackData?.serial_number ?? null,
      member_account: callbackData?.member_account ?? null,
      game_uid: callbackData?.game_uid ?? null,
      game_round: callbackData?.game_round ?? null,
    });

    const session = await mongoose.startSession();
    let gameSession = null;
    let buildProviderBalanceResponse = null;
    session.startTransaction();

    try {
      const { game_uid, game_round, bet_amount, win_amount, game_name } =
        callbackData;
      const callbackSessionId =
        callbackData.session_id ||
        callbackData.sessionId ||
        callbackData.providerSessionId ||
        callbackData.provider_session_id ||
        callbackData.data?.session_id ||
        callbackData.data?.sessionId ||
        null;

      // Extract member_account (provider's user identifier)
      const memberAccount = callbackData.member_account || null;

      const bet = Number(bet_amount) || 0;
      const win = Number(win_amount) || 0;

      // Insert AFTER parsing callback fields:
      console.log("[IGAMING][handleGameCallback] parsed callback fields", {
        callbackSessionId,
        game_uid,
        game_round,
        bet_amount,
        win_amount,
        game_name,
      });

      // DEBUG (D): Callback parsed identifiers
      console.log(
        "[DEBUG][Callback] parsed callbackSessionId",
        callbackSessionId,
      );
      console.log("[DEBUG][Callback] parsed game_uid/game_round", {
        game_uid,
        game_round,
      });

      // DEBUG: Log member_account for safer lookup correlation
      console.log("[DEBUG][SessionLookup] callback member_account", {
        member_account: memberAccount,
        game_uid,
      });

      console.log("CALLBACK SESSION:", {
        callbackSessionId,
        gameRound: game_round,
      });

      // Session lookup by providerSessionId (if present)
      const q1 = {
        providerSessionId: callbackSessionId,
        status: "active",
      };
      console.log(
        "[DEBUG][SessionLookup] attempting lookup by providerSessionId",
        q1,
      );

      if (callbackSessionId) {
        gameSession = await GameSession.findOne({
          providerSessionId: callbackSessionId,
          status: "active",
        }).session(session);

        console.log(
          "[DEBUG][SessionLookup] result for providerSessionId lookup",
          {
            found: !!gameSession,
            sessionId: gameSession?._id || null,
            providerSessionId: gameSession?.providerSessionId || null,
            providerGameCode: gameSession?.providerGameCode || null,
            matchedUserId: gameSession?.user || null,
          },
        );
      }

      if (!gameSession) {
        const q2 = {
          providerGameCode: game_uid,
          status: "active",
        };
        console.log(
          "[DEBUG][SessionLookup] attempting fallback lookup by providerGameCode ONLY",
          {
            warning:
              "UNSAFE: This lookup ignores member_account and may match wrong user if multiple users play same game",
            query: q2,
          },
        );

        gameSession = await GameSession.findOne({
          providerGameCode: game_uid,
          status: "active",
        })
          .sort({ createdAt: -1 })
          .session(session);

        console.log(
          "[DEBUG][SessionLookup] result for providerGameCode fallback lookup",
          {
            found: !!gameSession,
            sessionId: gameSession?._id || null,
            providerSessionId: gameSession?.providerSessionId || null,
            providerGameCode: gameSession?.providerGameCode || null,
            matchedUserId: gameSession?.user || null,
            riskWarning: memberAccount
              ? "member_account available but NOT used in lookup - potential mismatch!"
              : "member_account not in payload",
          },
        );
      }

      if (!gameSession) throw new Error("Game session not found");

      // Final session info used
      console.log("[DEBUG][SessionLookup] selected gameSession", {
        _id: gameSession._id,
        providerSessionId: gameSession.providerSessionId,
        providerGameCode: gameSession.providerGameCode,
        userId: gameSession.user,
        callbackMemberAccount: memberAccount,
      });

      // ✅ FIX: Persist callback game_round into GameSession
      // Logic unchanged - only store provider round if session doesn't have it yet
      if (game_round && gameSession.gameRound !== String(game_round)) {
        console.log("[DEBUG][GameRound] updating session gameRound", {
          sessionId: gameSession._id,
          previousRound: gameSession.gameRound,
          callbackRound: game_round,
        });

        gameSession.gameRound = String(game_round);

        await gameSession.save({ session });

        console.log("[DEBUG][GameRound] session updated", {
          sessionId: gameSession._id,
          savedRound: gameSession.gameRound,
        });
      }

      buildProviderBalanceResponse = async () => {
        const latestWallet = await WalletService.getWalletBalance(
          gameSession.user,
        );

        // Insert AFTER wallet fetch inside provider response:
        console.log("[IGAMING][handleGameCallback] provider balance response", {
          credit_amount: Number((latestWallet?.main || 0).toFixed(2)),
          walletBalanceUsed: latestWallet?.main ?? null,
          timestamp: Date.now(),
        });

        console.log("PROVIDER BALANCE RESPONSE:", {
          userId: gameSession.user,
          walletBalance: latestWallet?.main,
          sessionBalance: gameSession.endBalance,
          gameRound: game_round,
        });

        return {
          credit_amount: Number((latestWallet?.main || 0).toFixed(2)),
          timestamp: Date.now(),
        };
      };

      const duplicateHistoryQuery = {
        user: gameSession.user,
        gameRound: game_round,
        betAmount: bet,
        winAmount: win,
      };

      // Insert BEFORE duplicate check query use:
      console.log("[IGAMING][handleGameCallback] duplicate check query", {
        user: gameSession?.user,
        gameRound: game_round,
        betAmount: bet,
        winAmount: win,
        providerSessionId: callbackSessionId || gameSession?.providerSessionId,
      });

      const existingProcessedBet = await BettingHistory.findOne(
        duplicateHistoryQuery,
      ).session(session);

      if (existingProcessedBet) {
        console.log("Duplicate provider callback ignored:", game_round);
        await session.abortTransaction();
        return buildProviderBalanceResponse();
      }

      console.log(
        `[Callback] SessionID:${gameSession._id} StartBalance:${gameSession.startBalance} Bet:${bet} Win:${win}`,
      );

      // Insert BEFORE net change calculation:
      console.log("[IGAMING][handleGameCallback] net change", {
        bet,
        win,
        netChange: win - bet,
      });

      const netChange = win - bet;
      console.log("NET CHANGE:", netChange);

      // Update wallet with net change (win - bet)
      let walletUpdateResult = null;
      if (netChange !== 0) {
        const walletBefore = await WalletService.getWalletBalance(
          gameSession.user,
        );

        // Insert AFTER getWalletBalance:
        console.log(
          "[IGAMING][handleGameCallback] getWalletBalance result (before update)",
          {
            userId: String(gameSession.user),
            walletBefore,
          },
        );

        console.log("WALLET BEFORE:", walletBefore?.main || 0);

        // Insert BEFORE updateWallet call:
        console.log("[IGAMING][handleGameCallback] wallet update request", {
          userId: String(gameSession.user),
          netChange,
          direction: netChange > 0 ? "win" : "bet",
          gameRound: game_round,
          gameName: game_name,
          betAmount: bet,
          winAmount: win,
        });

        walletUpdateResult = await WalletService.updateWallet(
          gameSession.user,
          netChange,
          "main",
          netChange > 0 ? "win" : "bet",
          {
            gameRound: game_round,
            gameName: game_name,
            betAmount: bet,
            winAmount: win,
          },
          session,
        );

        // Insert AFTER updateWallet call:
        console.log(
          "[IGAMING][handleGameCallback] wallet update result (after update)",
          {
            userId: String(gameSession.user),
            newBalance: walletUpdateResult?.newBalance ?? null,
            walletBefore: walletBefore?.main ?? null,
          },
        );

        console.log(
          "WALLET AFTER:",
          walletUpdateResult?.newBalance ?? (walletBefore?.main || 0),
        );
      }

      // ⚡ Optimization: Use wallet result instead of fetching again
      const wallet = walletUpdateResult
        ? { main: walletUpdateResult.newBalance }
        : await WalletService.getWalletBalance(gameSession.user);
      const realBalance = wallet.main || 0;

      // Update session endBalance with actual wallet balance
      gameSession.endBalance = realBalance;
      await gameSession.save({ session });

      // 📊 CREATE BETTING HISTORY RECORD
      if (gameSession.gameRound) {
        try {
          // ⚡ Optimization: Fetch game once, reuse for all background tasks
          const fullGame = await this.getGameSafe(gameSession.game);

          const bettingHistoryData = {
            user: gameSession.user,
            gameSession: gameSession._id,
            game: gameSession.game,
            provider: fullGame?.brand || "Unknown",
            category: fullGame?.category || "Slot",
            gameName: fullGame?.game_name || game_name || "Unknown Game",
            providerGameCode: gameSession.providerGameCode,
            gameRound: gameSession.gameRound,
            status: "unsettled",
            betAmount: bet,
            winAmount: win,
            netResult: win - bet,
            turnoverAmount: bet,
            currency: gameSession.currency || "BDT",
            isFreeSpin: gameSession.isFreeSpin || false,
            isBonusBet: gameSession.isBonusBet || false,
            startBalance: gameSession.startBalance,
            endBalance: gameSession.endBalance,
            playedAt: new Date(),
            settledAt: null,
            metadata: {
              providerSessionId: gameSession.providerSessionId,
              sessionId: gameSession._id.toString(),
            },
          };

          await BettingHistory.create([bettingHistoryData], { session });

          let turnoverResult = null;
          if (bet > 0) {
            console.log(
              `[CASINO] 🎯 Bet placed: ${bet} BDT | Provider=${game_uid} | Round=${game_round}`,
            );

            turnoverResult = await TurnoverTrackingService.recordBet(
              gameSession.user,
              fullGame,
              bet,
            );
          }

          console.log(
            `[BettingHistory] ✅ Record created for user:${gameSession.user} round:${gameSession.gameRound}`,
          );

          // 📈 UPDATE PROMOTION TURNOVER PROGRESS
          if (bet > 0) {
            try {
              if (turnoverResult?.success) {
                console.log("[PromotionTurnover] ✅ Progress updated:", {
                  userId: gameSession.user,
                  betAmount: bet,
                  results: turnoverResult.results || [],
                });
              } else {
                console.log("[PromotionTurnover] No active turnover updated:", {
                  userId: gameSession.user,
                  betAmount: bet,
                  message: turnoverResult?.message,
                });
              }
            } catch (turnoverErr) {
              console.error(
                `[PromotionTurnover] ⚠ Failed to update progress: ${turnoverErr.message}`,
              );
            }
          }
        } catch (err) {
          if (err?.code === 11000) {
            console.log("Duplicate callback safely skipped");
            await session.abortTransaction();
            return buildProviderBalanceResponse();
          }

          console.error(
            `[BettingHistory] ⚠ Failed to record betting history: ${err.message}`,
          );
          // Don't throw - allow callback to succeed even if history fails
        }
      }

      console.log(
        `[Callback SUCCESS] NetChange:${netChange} NewBalance:${realBalance}`,
      );

      // ✅ TURNOVER ALREADY RECORDED ABOVE
      // Turnover is recorded directly when bet is placed (bet > 0)
      // Settlement updates handled by TurnoverService.updateTurnoverStatus() if needed

      await session.commitTransaction();

      // Insert BEFORE return:
      console.log("[IGAMING][handleGameCallback] success", {
        gameSessionId: String(gameSession._id),
        providerSessionId: gameSession.providerSessionId,
        gameRound: gameSession.gameRound,
        totalExecutionMs: Date.now() - callbackStart,
      });

      return buildProviderBalanceResponse();
    } catch (err) {
      // Replace/extend existing error logging:
      console.error("[IGAMING][handleGameCallback] ERROR", {
        message: err.message,
        stack: err.stack,
        callbackData,
        elapsedMs: Date.now() - callbackStart,
      });

      await session.abortTransaction();
      console.error("[Callback ERROR]:", err.message);
      if (gameSession?.user) {
        try {
          return await buildProviderBalanceResponse();
        } catch (balanceErr) {
          console.error(
            "[Callback ERROR] Failed to load latest wallet:",
            balanceErr.message,
          );
        }
      }
      return { credit_amount: -1, error: "Failed" };
    } finally {
      // Insert BEFORE session.endSession():
      console.log("[IGAMING][handleGameCallback] end", {
        totalExecutionMs: Date.now() - callbackStart,
        endedAt: new Date().toISOString(),
      });

      session.endSession();
    }
  }

  // Get user game history
  async getUserGameHistory(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      gameId,
      status,
      startDate,
      endDate,
    } = options;

    const query = { user: userId };

    if (gameId) query.game = gameId;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const sessions = await GameSession.find(query)
      .populate("game", "game_name brand category image_url")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await GameSession.countDocuments(query);

    return {
      sessions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    };
  }

  // Get active game sessions
  async getActiveSessions(userId) {
    return await GameSession.find({
      user: userId,
      status: "active",
    })
      .populate("game", "game_name brand category image_url")
      .sort({ createdAt: -1 })
      .exec();
  }
}

module.exports = new IGamingService();
