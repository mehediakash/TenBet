import api from "../axios/axios";

export const getMyBonuses = () => api.get("/api/promotions/my-bonuses");

export const getMyFreeSpins = () => api.get("/api/promotions/my-free-spins");

export const claimBonus = (turnoverId) =>
  api.post(`/api/promotions/claim-bonus/${turnoverId}`);

export const claimFreeSpins = (promotionId) =>
  api.post(`/api/promotions/claim-free-spins/${promotionId}`);

export default {
  getMyBonuses,
  getMyFreeSpins,
  claimBonus,
  claimFreeSpins,
};
