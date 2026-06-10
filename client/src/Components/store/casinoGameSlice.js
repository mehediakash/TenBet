import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../axios/axios";

const STORAGE_KEY = "dexwine_casino_game_v1";

const emptyState = {
  isOpen: false,
  gameUrl: "",
  currentGame: null,
  loading: false,
  isClosing: false,
  launchError: null,
  isFullscreen: false,
  lastOpenedAt: null,
};

const safeStorage = {
  get() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (e) {}
  },
  remove() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  },
};

const persistSession = (state) => {
  if (!state.isOpen) {
    safeStorage.remove();
    return;
  }

  safeStorage.set({
    isOpen: true,
    gameUrl: state.gameUrl || "",
    currentGame: state.currentGame || null,
    isFullscreen: Boolean(state.isFullscreen),
    lastOpenedAt: state.lastOpenedAt || Date.now(),
  });
};

const hydrateSession = () => {
  const raw = safeStorage.get();
  if (!raw) return { ...emptyState };

  try {
    const parsed = JSON.parse(raw);
    return {
      ...emptyState,
      isOpen: Boolean(parsed?.isOpen),
      gameUrl: parsed?.gameUrl || "",
      currentGame: parsed?.currentGame || null,
      isFullscreen: Boolean(parsed?.isFullscreen),
      lastOpenedAt: parsed?.lastOpenedAt || null,
    };
  } catch (e) {
    return { ...emptyState };
  }
};

export const launchCasinoGame = createAsyncThunk(
  "casinoGame/launchCasinoGame",
  async ({ game }, { getState, rejectWithValue }) => {
    if (!game?.id) {
      return rejectWithValue("Missing game id.");
    }

    const casinoGame = getState()?.casinoGame;
    // Don't check `loading` here because the `pending` action is dispatched
    // before this payload runs, which would make `loading` true for the
    // same request and always reject. Only block launches when a close is
    // actively in progress.
    if (casinoGame?.isClosing) {
      return rejectWithValue("Game is closing.");
    }

    try {
      // Add a timeout/abort so a hanging network request doesn't leave `loading` stuck.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await api.post(
        `/api/games/launch/${game.id}`,
        {
          currency: "BDT",
          language: "en",
        },
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      const gameUrl = response?.data?.data?.gameUrl || response?.data?.gameUrl;

      if (!gameUrl) {
        return rejectWithValue("Game URL missing. Please try again.");
      }

      if (getState()?.casinoGame?.isClosing) {
        return rejectWithValue("Game is closing.");
      }

      return {
        game,
        gameUrl,
        lastOpenedAt: Date.now(),
      };
    } catch (error) {
      // Normalize abort errors
      if (error && error.name === "CanceledError") {
        return rejectWithValue("Game launch timed out. Please try again.");
      }

      return rejectWithValue(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          (error?.message === "canceled"
            ? "Game launch timed out. Please try again."
            : "Failed to launch game. Please try again."),
      );
    }
  },
);

export const closeCasinoGame = createAsyncThunk(
  "casinoGame/closeCasinoGame",
  async () => {
    try {
      await api.post("/api/games/close-all-sessions");
    } catch (error) {
      console.error("Failed to close game sessions:", error);
    }

    return { closedAt: Date.now() };
  },
);

const casinoGameSlice = createSlice({
  name: "casinoGame",
  initialState: hydrateSession(),
  reducers: {
    restoreCasinoSession: () => hydrateSession(),
    clearCasinoLaunchError: (state) => {
      state.launchError = null;
    },
    setCasinoFullscreen: (state, action) => {
      state.isFullscreen = Boolean(action.payload);
      persistSession(state);
    },
    syncCasinoSession: (state, action) => {
      const payload = action.payload || {};
      state.isOpen = Boolean(payload.isOpen);
      state.gameUrl = payload.gameUrl || "";
      state.currentGame = payload.currentGame || null;
      state.isFullscreen = Boolean(payload.isFullscreen);
      state.lastOpenedAt = payload.lastOpenedAt || null;
      state.loading = false;
      state.isClosing = false;
      state.launchError = null;
      persistSession(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(launchCasinoGame.pending, (state, action) => {
        state.loading = true;
        state.isOpen = true;
        state.isClosing = false;
        state.launchError = null;
        state.currentGame = action.meta.arg?.game || state.currentGame;
      })
      .addCase(launchCasinoGame.fulfilled, (state, action) => {
        state.loading = false;
        state.isOpen = true;
        state.isClosing = false;
        state.launchError = null;
        state.gameUrl = action.payload.gameUrl;
        state.currentGame = action.payload.game;
        state.lastOpenedAt = action.payload.lastOpenedAt || Date.now();
        persistSession(state);
      })
      .addCase(launchCasinoGame.rejected, (state, action) => {
        state.loading = false;
        state.isOpen = false;
        state.isClosing = false;
        state.launchError = action.payload || "Failed to launch game.";
      })
      .addCase(closeCasinoGame.pending, (state) => {
        state.isClosing = true;
        state.launchError = null;
      })
      .addCase(closeCasinoGame.fulfilled, (state) => {
        state.isOpen = false;
        state.loading = false;
        state.isClosing = false;
        state.launchError = null;
        state.isFullscreen = false;
        state.currentGame = null;
        safeStorage.remove();

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("gameSessionsClosed"));
        }
      });
  },
});

export const {
  restoreCasinoSession,
  clearCasinoLaunchError,
  setCasinoFullscreen,
  syncCasinoSession,
} = casinoGameSlice.actions;

export const selectCasinoGame = (state) => state.casinoGame || emptyState;
export const selectCasinoGameLoading = (state) =>
  Boolean(state.casinoGame?.loading || state.casinoGame?.isClosing);

export default casinoGameSlice.reducer;
