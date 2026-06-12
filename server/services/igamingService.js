const mongoose = require("mongoose");
const axios = require("axios");
const EncryptionUtil = require("../utils/encryption");
const GameSession = require("../models/GameSession");
const BettingHistory = require("../models/BettingHistory");
const TurnoverTrackingService = require("./turnoverTrackingService");
const WalletService = require("./walletService");
const TurnoverService = require("./turnoverService");

// Round to 2 decimal places — prevents float drift (e.g. 44.44999999999999)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

class IGamingService {
  constructor() {
    this.apiToken = process.env.IGAMING_API_TOKEN;
    this.baseUrl = process.env.IGAMING_API_URL;
    this.encryptionUtil = new EncryptionUtil(process.env.ENCRYPTION_KEY);

    // Game detail cache — 5 min TTL, avoids repeated DB hits per callback
    this.gameCache = new Map();
    this.gameCacheTTL = 5 * 60 * 1000;
  }

  // ── Game cache lookup ──────────────────────────────────────────────────────
  async getGameSafe(gameId) {
    if (!gameId) return null;
    const key = String(gameId);
    const cached = this.gameCache.get(key);
    if (cached) return cached;

    try {
      const Game = require("../models/Game");
      const game = await Game.findById(gameId).lean();
      if (game) {
        this.gameCache.set(key, game);
        setTimeout(() => this.gameCache.delete(key), this.gameCacheTTL);
      }
      return game;
    } catch {
      return null;
    }
  }

  // ── Launch a casino game ───────────────────────────────────────────────────
  async launchGame(user, game, options = {}) {
    try {
      const providerGameCode = String(game.game_code).trim();
      const returnUrl = `${process.env.CLIENT_URL}/casino`;
      const callbackUrl = `${process.env.BASE_URL}/api/games/callback`;

      // Always read live wallet — never use stale session balance on launch
      const wallet = await WalletService.getWalletBalance(user._id);
      const balanceToSend = r2(wallet.main || 0);

      if (balanceToSend <= 0 && providerGameCode !== "7004") {
        throw new Error("Insufficient balance. Please deposit to play.");
      }

      // Build & encrypt provider payload
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
      const encrypted = this.encryptionUtil.encryptPayload(payload);
      const launchUrl = `${this.baseUrl}?payload=${encodeURIComponent(encrypted)}&token=${this.apiToken}`;

      // Call provider
      const response = await axios.get(launchUrl, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.msg || "Launch failed");
      }

      const gameUrl = response.data.data.url;

      // Extract ssoKey from provider URL — this becomes providerSessionId
      // Provider URL format: https://...?ssoKey=XXXX&lang=en-US&...
      let sessionId = null;
      try {
        const u = new URL(gameUrl);
        sessionId = u.searchParams.get("ssoKey") || u.searchParams.get("id");
      } catch {
        const qs = new URLSearchParams(gameUrl.split("?")[1] || "");
        sessionId = qs.get("ssoKey") || qs.get("id");
      }
      // Fallback only if provider gives nothing (should not happen in production)
      if (!sessionId) {
        sessionId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Close any lingering active sessions for this user + game
      await GameSession.updateMany(
        { user: user._id, providerGameCode, status: "active" },
        { status: "closed", endedAt: new Date() },
      );

      // Create fresh session — store memberAccount for safe callback lookup
      await GameSession.create({
        user: user._id,
        game: game._id,
        memberAccount: String(user.userId),
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

      return { success: true, gameUrl, balanceSent: balanceToSend };
    } catch (error) {
      throw error;
    }
  }

  // ── Handle provider game callback ──────────────────────────────────────────
  async handleGameCallback(callbackData) {
    const mongoSession = await mongoose.startSession();
    let gameSession = null;

    // Always return fresh wallet balance to provider — never a cached value
    const buildResponse = async (userId) => {
      try {
        const w = await WalletService.getWalletBalance(userId);
        return { credit_amount: r2(w?.main || 0), timestamp: Date.now() };
      } catch {
        return { credit_amount: -1, timestamp: Date.now() };
      }
    };

    mongoSession.startTransaction();

    try {
      const { game_uid, game_round, bet_amount, win_amount, game_name } =
        callbackData;

      // Support every field name the provider might use for session id
      const callbackSessionId =
        callbackData.session_id ||
        callbackData.sessionId ||
        callbackData.providerSessionId ||
        callbackData.provider_session_id ||
        callbackData.data?.session_id ||
        callbackData.data?.sessionId ||
        null;

      const memberAccount = callbackData.member_account || null;

      // Round immediately — prevent float drift in all downstream math
      const bet = r2(Number(bet_amount) || 0);
      const win = r2(Number(win_amount) || 0);

      // ── Session lookup (3-tier, safest first) ─────────────────────────────
      // Tier 1: exact ssoKey match — unique per session, most reliable
      if (callbackSessionId) {
        gameSession = await GameSession.findOne({
          providerSessionId: callbackSessionId,
          // No status filter — provider may callback after session closes
        }).session(mongoSession);
      }

      // Tier 2: memberAccount + gameCode — user-scoped, safe for multi-user games
      if (!gameSession && memberAccount && game_uid) {
        gameSession = await GameSession.findOne({
          providerGameCode: game_uid,
          memberAccount: String(memberAccount),
          status: { $in: ["active", "closed"] },
        })
          .sort({ createdAt: -1 })
          .session(mongoSession);
      }

      // Tier 3: gameCode only — last resort (single-user games only)
      if (!gameSession && game_uid) {
        gameSession = await GameSession.findOne({
          providerGameCode: game_uid,
          status: { $in: ["active", "closed"] },
        })
          .sort({ createdAt: -1 })
          .session(mongoSession);
      }

      if (!gameSession) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return {
          credit_amount: -1,
          timestamp: Date.now(),
          error: "Session not found",
        };
      }

      // ── Duplicate round guard ──────────────────────────────────────────────
      const duplicate = await BettingHistory.findOne({
        user: gameSession.user,
        gameRound: game_round,
        betAmount: bet,
        winAmount: win,
        "metadata.providerSessionId":
          callbackSessionId || gameSession.providerSessionId,
      }).session(mongoSession);

      if (duplicate) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return buildResponse(gameSession.user);
      }

      // ── Update session totals ──────────────────────────────────────────────
      gameSession.betAmount = r2(gameSession.betAmount + bet);
      gameSession.winAmount = r2(gameSession.winAmount + win);
      gameSession.gameRound = game_round;

      const netChange = r2(win - bet);

      // ── Atomic wallet update (inside transaction) ──────────────────────────
      let walletResult = null;
      if (netChange !== 0) {
        walletResult = await WalletService.updateWallet(
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
          mongoSession,
        );
      }

      // Use wallet result directly — avoids a second DB round-trip
      const realBalance = walletResult
        ? r2(walletResult.newBalance)
        : r2(
            (await WalletService.getWalletBalance(gameSession.user))?.main || 0,
          );

      gameSession.endBalance = realBalance;
      await gameSession.save({ session: mongoSession });

      // ── Betting history + turnover (non-critical, must not fail callback) ──
      if (gameSession.gameRound) {
        try {
          const fullGame = await this.getGameSafe(gameSession.game);

          await BettingHistory.create(
            [
              {
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
                netResult: r2(win - bet),
                turnoverAmount: bet,
                currency: gameSession.currency || "BDT",
                isFreeSpin: gameSession.isFreeSpin || false,
                isBonusBet: gameSession.isBonusBet || false,
                startBalance: gameSession.startBalance,
                endBalance: gameSession.endBalance,
                playedAt: new Date(),
                settledAt: null,
                metadata: {
                  providerSessionId:
                    callbackSessionId || gameSession.providerSessionId,
                  sessionId: gameSession._id.toString(),
                },
              },
            ],
            { session: mongoSession },
          );

          // Turnover — fire-and-forget, never blocks the callback response
          if (bet > 0) {
            TurnoverTrackingService.recordBet(
              gameSession.user,
              fullGame,
              bet,
            ).catch(() => {});
          }
        } catch (err) {
          if (err?.code === 11000) {
            // Parallel callback already handled this round
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return buildResponse(gameSession.user);
          }
          // History failure must not fail the callback — provider must get balance
        }
      }

      await mongoSession.commitTransaction();
      mongoSession.endSession();

      return buildResponse(gameSession.user);
    } catch (err) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();

      if (gameSession?.user) {
        try {
          return await buildResponse(gameSession.user);
        } catch {}
      }
      return { credit_amount: -1, timestamp: Date.now(), error: "Failed" };
    }
  }

  // ── User game history ──────────────────────────────────────────────────────
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

    const [sessions, total] = await Promise.all([
      GameSession.find(query)
        .populate("game", "game_name brand category image_url")
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((page - 1) * limit)
        .lean(),
      GameSession.countDocuments(query),
    ]);

    return {
      sessions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    };
  }

  // ── Active sessions ────────────────────────────────────────────────────────
  async getActiveSessions(userId) {
    return GameSession.find({ user: userId, status: "active" })
      .populate("game", "game_name brand category image_url")
      .sort({ createdAt: -1 })
      .lean();
  }
}

module.exports = new IGamingService();
