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
      const callbackUrl = `${process.env.CALLBACK_HUB_URL}/api/games/callback`;

      // 1. ALWAYS USE WALLET AS BALANCE SOURCE
      const wallet = await WalletService.getWalletBalance(user._id);
      const balanceToSend = r2(wallet.main || 0);

      console.log(
        `[LaunchGame] Starting launch for user ${user.userId}, game ${providerGameCode}, balance ${balanceToSend}`,
      );

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

      console.log(`[LaunchGame] Extracted sessionId: ${sessionId}`);

      // 6. CLOSE PREVIOUS ACTIVE SESSIONS FOR THIS USER + GAME
      const closedCount = await GameSession.updateMany(
        { user: user._id, providerGameCode, status: "active" },
        { status: "closed", endedAt: new Date() },
      );

      console.log(
        `[LaunchGame] Closed ${closedCount.modifiedCount} previous active sessions`,
      );

      // 7. CREATE FRESH SESSION
      const newSession = await GameSession.create({
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

      console.log(`[LaunchGame] Created new session:`, {
        id: newSession._id,
        providerSessionId: sessionId,
        memberAccount: String(user.userId),
        status: newSession.status,
        startBalance: newSession.startBalance,
      });

      // 8. REGISTER WITH CALLBACK HUB
      await this.registerSessionWithHub({
        memberAccount: String(user.userId),
        providerSessionId: sessionId,
        gameUid: providerGameCode,
        gameName: game.game_name,
      });

      return { success: true, gameUrl, balanceSent: balanceToSend };
    } catch (error) {
      console.error(`[LaunchGame] Error:`, error);
      throw error;
    }
  }

  async registerSessionWithHub({
    memberAccount,
    providerSessionId,
    gameUid,
    gameName,
  }) {
    try {
      const hubUrl = process.env.CALLBACK_HUB_URL;

      console.log(`[RegisterWithHub] Registering session:`, {
        memberAccount,
        providerSessionId,
        gameUid,
        gameName,
      });

      await axios.post(
        `${hubUrl}/internal/register`,
        {
          memberAccount: String(memberAccount),
          website: process.env.WEBSITE_NAME,
          providerSessionId: String(providerSessionId),
          gameUid: String(gameUid),
          gameName: gameName || null,
        },
        {
          timeout: 3000,
          headers: { "Content-Type": "application/json" },
        },
      );

      console.log(
        `[RegisterWithHub] Session registered successfully: ${providerSessionId}`,
      );
    } catch (error) {
      console.error(
        "[RegisterWithHub] Failed to register session with hub:",
        error.message,
      );
      // Non-blocking - don't break game launch
    }
  }

  // ── Handle provider game callback ──────────────────────────────────────────
  async handleGameCallback(callbackData) {
    // LOG ENTRY
    console.log(`[handleGameCallback] START:`, {
      game_round: callbackData.game_round,
      member_account: callbackData.member_account,
      game_uid: callbackData.game_uid,
      bet_amount: callbackData.bet_amount,
      win_amount: callbackData.win_amount,
      timestamp: new Date().toISOString(),
    });

    const session = await mongoose.startSession();
    let gameSession = null;
    let buildProviderBalanceResponse = null;
    session.startTransaction();

    try {
      const { game_uid, game_round, bet_amount, win_amount, game_name } =
        callbackData;
      const memberAccount = callbackData.member_account || null;

      // LOG: Looking for session
      console.log(`[handleGameCallback] Looking for session:`, {
        memberAccount,
        game_uid,
        hasCallbackSessionId: !!(
          callbackData.session_id || callbackData.providerSessionId
        ),
      });

      // Round amounts
      const bet = r2(Number(bet_amount) || 0);
      const win = r2(Number(win_amount) || 0);

      // Session lookup - TIER 1 (rare, only if provider sends session ID)
      const callbackSessionId =
        callbackData.session_id ||
        callbackData.sessionId ||
        callbackData.providerSessionId ||
        callbackData.provider_session_id ||
        callbackData.data?.session_id ||
        callbackData.data?.sessionId ||
        null;

      if (callbackSessionId) {
        console.log(
          `[handleGameCallback] TIER 1 lookup with sessionId: ${callbackSessionId}`,
        );
        gameSession = await GameSession.findOne({
          providerSessionId: callbackSessionId,
          status: "active",
        }).session(session);

        if (gameSession) {
          console.log(
            `[handleGameCallback] TIER 1 found session: ${gameSession._id}`,
          );
        }
      }

      // Session lookup - TIER 2 (primary for provider callbacks)
      if (!gameSession) {
        console.log(
          `[handleGameCallback] TIER 2 lookup with member=${memberAccount}, game=${game_uid}`,
        );

        gameSession = await GameSession.findOne({
          providerGameCode: game_uid,
          memberAccount: String(memberAccount),
          status: "active",
        })
          .sort({ createdAt: -1 })
          .session(session);

        if (gameSession) {
          console.log(`[handleGameCallback] TIER 2 found session:`, {
            id: gameSession._id,
            providerSessionId: gameSession.providerSessionId,
            providerGameCode: gameSession.providerGameCode,
            memberAccount: gameSession.memberAccount,
            status: gameSession.status,
            currentBalance: gameSession.endBalance,
            gameRound: gameSession.gameRound,
          });
        } else {
          console.error(
            `[handleGameCallback] NO SESSION FOUND for member=${memberAccount}, game=${game_uid}`,
          );

          // Log all sessions for this user for debugging
          const allSessions = await GameSession.find({
            memberAccount: String(memberAccount),
            providerGameCode: game_uid,
          }).lean();

          console.error(
            `[handleGameCallback] Existing sessions:`,
            allSessions.map((s) => ({
              id: s._id,
              status: s.status,
              createdAt: s.createdAt,
              endBalance: s.endBalance,
              providerSessionId: s.providerSessionId,
            })),
          );
        }
      }

      if (!gameSession) {
        console.error(`[handleGameCallback] FATAL: Game session not found`);
        throw new Error("Game session not found");
      }

      // Update game round
      if (game_round && gameSession.gameRound !== String(game_round)) {
        console.log(
          `[handleGameCallback] Updating gameRound: ${gameSession.gameRound} -> ${game_round}`,
        );
        gameSession.gameRound = String(game_round);
        await gameSession.save({ session });
      }

      // Balance response builder
      buildProviderBalanceResponse = async () => {
        const latestWallet = await WalletService.getWalletBalance(
          gameSession.user,
        );
        const balance = r2(latestWallet?.main || 0);
        console.log(
          `[handleGameCallback] buildProviderBalanceResponse returning: ${balance}`,
        );
        return {
          credit_amount: balance,
          timestamp: Date.now(),
        };
      };

      // Duplicate check
      console.log(
        `[handleGameCallback] Checking duplicate for round: ${game_round}`,
      );

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
        console.log(
          `[handleGameCallback] DUPLICATE detected for round: ${game_round}, returning existing balance`,
        );
        await session.abortTransaction();
        return buildProviderBalanceResponse();
      }

      // Wallet update
      const netChange = r2(win - bet);
      console.log(
        `[handleGameCallback] Net change: ${netChange} (bet=${bet}, win=${win})`,
      );

      let walletUpdateResult = null;
      if (netChange !== 0) {
        console.log(`[handleGameCallback] Updating wallet by ${netChange}`);
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

        console.log(
          `[handleGameCallback] Wallet update result:`,
          walletUpdateResult,
        );
      }

      // Get final balance
      const wallet = walletUpdateResult
        ? { main: walletUpdateResult.newBalance }
        : await WalletService.getWalletBalance(gameSession.user);
      const realBalance = r2(wallet.main || 0);

      console.log(
        `[handleGameCallback] Final balance after update: ${realBalance}`,
      );

      gameSession.endBalance = realBalance;
      await gameSession.save({ session });

      // Betting history creation
      if (gameSession.gameRound) {
        try {
          const fullGame = await this.getGameSafe(gameSession.game);

          console.log(
            `[handleGameCallback] Creating betting history for round: ${game_round}`,
          );

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
          };

          await BettingHistory.create([bettingHistoryData], { session });

          console.log(`[handleGameCallback] Betting history created`);

          if (bet > 0) {
            await TurnoverTrackingService.recordBet(
              gameSession.user,
              fullGame,
              bet,
            );
            console.log(`[handleGameCallback] Turnover recorded: ${bet}`);
          }
        } catch (err) {
          if (err?.code === 11000) {
            console.log(
              `[handleGameCallback] Duplicate betting history, aborting`,
            );
            await session.abortTransaction();
            return buildProviderBalanceResponse();
          }
          console.error(`[handleGameCallback] Betting history error:`, err);
          // Don't throw - continue processing
        }
      }

      await session.commitTransaction();

      const finalResponse = await buildProviderBalanceResponse();
      console.log(
        `[handleGameCallback] SUCCESS - Returning balance: ${finalResponse.credit_amount}`,
      );

      return finalResponse;
    } catch (err) {
      console.error(`[handleGameCallback] ERROR:`, {
        message: err.message,
        stack: err.stack,
        callbackData: callbackData,
      });

      await session.abortTransaction();

      if (gameSession?.user) {
        try {
          console.log(
            `[handleGameCallback] Attempting emergency balance for user: ${gameSession.user}`,
          );
          const emergencyBalance = await buildProviderBalanceResponse();
          console.log(
            `[handleGameCallback] Emergency balance: ${emergencyBalance.credit_amount}`,
          );
          return emergencyBalance;
        } catch (emergencyErr) {
          console.error(
            `[handleGameCallback] Emergency balance failed:`,
            emergencyErr,
          );
        }
      }

      console.error(`[handleGameCallback] Returning -1 (error)`);
      return {
        credit_amount: -1,
        error: err.message,
      };
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
