import api from "../axios/axios";

// Return an aggregated summary for active + pending turnovers
export const getActiveBonus = async () => {
  // Fetch all turnovers (backend provides status per turnover)
  const resp = await api.get("/api/turnover-tracking/status");
  const payload = resp?.data?.data ?? resp?.data;

  if (
    !payload ||
    !Array.isArray(payload.turnovers) ||
    payload.turnovers.length === 0
  ) {
    return { data: null };
  }

  const lockedTurnovers = payload.turnovers.filter(
    (t) => t.status === "active" || t.status === "pending",
  );

  if (!lockedTurnovers.length) return { data: null };

  const lockedBonus = lockedTurnovers.reduce(
    (sum, t) => sum + (t.bonusAmount || t.bonus || 0),
    0,
  );

  const remainingTurnover = lockedTurnovers.reduce(
    (sum, t) => sum + (t.remainingTurnover || t.remaining || 0),
    0,
  );

  const totalTurnover = lockedTurnovers.reduce(
    (sum, t) =>
      sum + (t.turnoverRequired || t.requiredAmount || t.turnover || 0),
    0,
  );

  const withdrawBlocked = lockedTurnovers.some((t) => !!t.withdrawLocked);

  const bonusStatus = lockedTurnovers.some((t) => t.status === "active")
    ? "active"
    : "pending";

  const data = {
    bonusAmount: lockedBonus,
    remainingTurnover,
    totalTurnover,
    withdrawBlocked,
    bonusStatus,
  };

  return { data };
};

export default {
  getActiveBonus,
};
