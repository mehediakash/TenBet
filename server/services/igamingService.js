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

      // 1. ALWAYS USE WALLET AS BALANCE SOURCE
      const wallet = await WalletService.getWalletBalance(user._id);
      const balanceToSend = r2(wallet.main || 0);

      // 2. BUILD PAYLOAD
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

      // 3. ENCRYPT PAYLOAD
      const encrypted = this.encryptionUtil.encryptPayload(payload);
      const launchUrl = `${this.baseUrl}?payload=${encodeURIComponent(encrypted)}&token=${this.apiToken}`;

      // 4. CALL PROVIDER API
      const response = await axios.get(launchUrl, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });

      if (response.data.code !== 0) {
        throw new Error(response.data.msg || "Launch failed");
      }

      const gameUrl = response.data.data.url;

      // 5. EXTRACT SESSION ID FROM PROVIDER URL
      // Provider URL format: https://...?ssoKey=XXXX&lang=en-US&...
      let urlParams;
      try {
        urlParams = new URL(gameUrl).searchParams;
      } catch {
        urlParams = new URLSearchParams(gameUrl.split("?")[1] || "");
      }
      const sessionId =
        urlParams.get("ssoKey") ||
        urlParams.get("id") ||
        `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 6. CLOSE PREVIOUS ACTIVE SESSIONS FOR THIS USER + GAME
      await GameSession.updateMany(
        { user: user._id, providerGameCode, status: "active" },
        { status: "closed", endedAt: new Date() },
      );

      // 7. CREATE FRESH SESSION — store memberAccount for safe callback lookup
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
    const session = await mongoose.startSession();
    let gameSession = null;
    let buildProviderBalanceResponse = null; // defined inside try to close over gameSession
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

      const memberAccount = callbackData.member_account || null;

      // Round immediately — prevents float drift in all downstream math
      const bet = r2(Number(bet_amount) || 0);
      const win = r2(Number(win_amount) || 0);

      // ── Session lookup ─────────────────────────────────────────────────────
      // Tier 1: exact ssoKey + status:active (original behavior)
      if (callbackSessionId) {
        gameSession = await GameSession.findOne({
          providerSessionId: callbackSessionId,
          status: "active",
        }).session(session);
      }

      // Tier 2: memberAccount + gameCode + status:active (original fallback)
      if (!gameSession) {
        gameSession = await GameSession.findOne({
          providerGameCode: game_uid,
          memberAccount: String(memberAccount),
          status: "active",
        })
          .sort({ createdAt: -1 })
          .session(session);
      }

      if (!gameSession) throw new Error("Game session not found");

      // ── Persist game_round into session if changed (original behavior) ─────
      if (game_round && gameSession.gameRound !== String(game_round)) {
        gameSession.gameRound = String(game_round);
        await gameSession.save({ session });
      }

      // ── Balance response builder — closes over gameSession ─────────────────
      buildProviderBalanceResponse = async () => {
        const latestWallet = await WalletService.getWalletBalance(
          gameSession.user,
        );
        return {
          credit_amount: r2(latestWallet?.main || 0),
          timestamp: Date.now(),
        };
      };

      // ── Duplicate round guard (original query — no metadata filter) ────────
      const duplicateHistoryQuery = {
        user: gameSession.user,
        gameRound: game_round,
        betAmount: bet,
        winAmount: win,
      };

      const existingProcessedBet = await BettingHistory.findOne(
        duplicateHistoryQuery,
      ).session(session);

      if (existingProcessedBet) {
        await session.abortTransaction();
        return buildProviderBalanceResponse();
      }

      // ── Wallet update ──────────────────────────────────────────────────────
      const netChange = r2(win - bet);

      let walletUpdateResult = null;
      if (netChange !== 0) {
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
      }

      // Reuse wallet result — avoids a redundant DB round-trip (perf keep)
      const wallet = walletUpdateResult
        ? { main: walletUpdateResult.newBalance }
        : await WalletService.getWalletBalance(gameSession.user);
      const realBalance = r2(wallet.main || 0);

      gameSession.endBalance = realBalance;
      await gameSession.save({ session });

      // ── Betting history + turnover ─────────────────────────────────────────
      if (gameSession.gameRound) {
        try {
          // Fetch game once, reuse below (perf keep)
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
                  providerSessionId: gameSession.providerSessionId,
                  sessionId: gameSession._id.toString(),
                },
              },
            ],
            { session },
          );

          // ORIGINAL: turnover is awaited (not fire-and-forget)
          let turnoverResult = null;
          if (bet > 0) {
            turnoverResult = await TurnoverTrackingService.recordBet(
              gameSession.user,
              fullGame,
              bet,
            );
          }

          // ORIGINAL: promotion turnover progress check after recordBet
          if (bet > 0) {
            try {
              if (turnoverResult?.success) {
                // turnover updated successfully
              }
            } catch (turnoverErr) {
              // non-blocking — never fails the callback
            }
          }
        } catch (err) {
          if (err?.code === 11000) {
            // Parallel callback already handled this round
            await session.abortTransaction();
            return buildProviderBalanceResponse();
          }
          // History failure must not fail the callback
        }
      }

      await session.commitTransaction();

      return buildProviderBalanceResponse();
    } catch (err) {
      await session.abortTransaction();
      if (gameSession?.user) {
        try {
          return await buildProviderBalanceResponse();
        } catch {}
      }
      return { credit_amount: -1, error: "Failed" }; // original: no timestamp
    } finally {
      session.endSession();
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

    // Parallel fetch — sessions + count in one round-trip (perf keep)
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
      .lean(); // lean = ~40% less memory (perf keep)
  }
}

module.exports = new IGamingService();
