import React, { useState } from "react";
import { X, Copy, Share2, Gift, Users, Trophy, Lock } from "lucide-react";

const ReferralBonusModal = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState("invite");

  if (!open) return null;

  const dashboardStats = [
    {
      label: "Friends Invited",
      value: 0,
      icon: <Users size={20} />,
    },
    {
      label: "Friends Completed",
      value: 0,
      icon: <Trophy size={20} />,
    },
    {
      label: "Today's Rebate",
      value: "৳ 0",
      icon: <Gift size={20} />,
    },
    {
      label: "Yesterday's Rebate",
      value: "৳ 0",
      icon: <Gift size={20} />,
    },
  ];

  const achievements = [
    {
      level: 4,
      progress: 0,
      reward: "৳ 200",
      locked: false,
    },
    {
      level: 8,
      progress: 0,
      reward: "৳ 400",
      locked: true,
    },
    {
      level: 12,
      progress: 0,
      reward: "৳ 800",
      locked: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-screen max-w-md flex-col overflow-hidden border border-[#ffb80022] bg-gradient-to-b from-[#050505] via-[#0d0d0d] to-[#1a1405] text-white shadow-2xl shadow-black/60">
        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-[#ffb80022] bg-[#0d0d0d]/95 px-4 py-4 backdrop-blur-md">
          <h2 className="text-2xl font-extrabold tracking-wide text-[#ffcc33] drop-shadow-[0_0_12px_rgba(255,184,0,0.35)]">
            Refer Bonus
          </h2>

          <button
            onClick={onClose}
            className="rounded-full border border-[#ffcc33]/20 bg-[#1a1a1a] p-2 text-[#ffcc33] transition-all duration-300 hover:rotate-90 hover:border-[#ffcc33]/40 hover:text-[#ffd95e]"
          >
            <X size={24} />
          </button>
        </div>

        {/* TABS */}

        <div className="relative flex border-b border-[#ffb8001f] bg-[#111111]">
          <button
            onClick={() => setActiveTab("invite")}
            className={`flex-1 py-4 text-lg font-bold transition-all duration-200 ${
              activeTab === "invite" ? "text-[#ffcc33]" : "text-[#d0d0d0]"
            }`}
          >
            Invite
          </button>

          <button
            onClick={() => setActiveTab("details")}
            className={`flex-1 py-4 text-lg font-bold transition-all duration-200 ${
              activeTab === "details" ? "text-[#ffcc33]" : "text-[#d0d0d0]"
            }`}
          >
            Details
          </button>

          <div
            className={`absolute bottom-0 h-[3px] w-1/2 bg-gradient-to-r from-[#a66d00] via-[#ffb800] to-[#ffcf40] shadow-[0_0_12px_rgba(255,184,0,0.5)] transition-all duration-300 ${
              activeTab === "invite" ? "left-0" : "left-1/2"
            }`}
          />
        </div>

        {/* CONTENT */}

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "invite" ? (
            <div className="space-y-5">
              {/* BANNER */}

              <div className="overflow-hidden rounded-2xl border border-[#ffb80022] bg-gradient-to-r from-[#1a1200] to-[#2a1d00]">
                <div className="p-5">
                  <h3 className="text-xl font-extrabold text-[#ffcc33]">
                    Refer Your Friends & Earn
                  </h3>

                  <p className="mt-2 text-sm text-[#d0d0d0]">
                    Invite friends and earn lifetime commissions from their
                    betting activity.
                  </p>
                </div>
              </div>

              {/* QR + LINK */}

              <div className="rounded-2xl border border-[#ffb80022] bg-[#111111] p-4 shadow-lg shadow-black/40">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* QR */}

                  <div className="flex flex-col items-center">
                    <p className="mb-3 text-sm font-bold text-[#ffcc33]">
                      Invitation QR Code
                    </p>

                    <div className="flex h-40 w-40 items-center justify-center rounded-2xl border border-[#ffcc33]/20 bg-white p-3">
                      <div className="flex h-full w-full items-center justify-center rounded-xl bg-black text-black">
                        QR
                      </div>
                    </div>
                  </div>

                  {/* CODE */}

                  <div className="flex flex-col justify-center">
                    <p className="text-sm font-bold text-[#ffcc33]">
                      Invitation URL
                    </p>

                    <div className="mt-2 rounded-xl border border-[#ffb80018] bg-[#1a1a1a] px-3 py-3 text-sm text-[#d0d0d0]">
                      https://TenBet.live/ref/GBX5424
                    </div>

                    <button className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a66d00] via-[#ffb800] to-[#ffcf40] py-3 font-bold text-black shadow-lg shadow-[#ffb80033] transition-all duration-200 hover:scale-[1.02]">
                      <Share2 size={18} />
                      Share
                    </button>

                    <p className="mt-5 text-sm font-bold text-[#ffcc33]">
                      Invitation Code
                    </p>

                    <div className="mt-2 flex items-center justify-between rounded-xl border border-[#ffb80018] bg-[#1a1a1a] px-4 py-3">
                      <span className="font-extrabold tracking-widest text-white">
                        NhHAkf
                      </span>

                      <button className="text-[#ffcc33] transition hover:scale-110">
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* DASHBOARD */}

              <div>
                <h3 className="mb-3 text-lg font-extrabold text-[#ffcc33]">
                  Dashboard
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  {dashboardStats.map((item, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-[#ffb80018] bg-gradient-to-br from-[#111111] to-[#1b1b1b] p-4 shadow-lg shadow-black/30"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[#ffcc33]">{item.icon}</div>

                        <span className="text-2xl font-black text-white">
                          {item.value}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-[#d0d0d0]">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* REBATE BONUS */}

              <div className="rounded-2xl border border-[#ffb80018] bg-[#111111] p-4">
                <h3 className="text-lg font-extrabold text-[#ffcc33]">
                  Rebate Bonus
                </h3>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-[#1a1200] to-[#2a1d00] p-4">
                  <div>
                    <p className="text-sm text-[#d0d0d0]">Available Bonus</p>

                    <h2 className="mt-1 text-3xl font-black text-[#ffcc33]">
                      ৳ 0
                    </h2>
                  </div>

                  <button className="rounded-xl bg-[#2a2a2a] px-5 py-3 font-bold text-[#777]">
                    Claim
                  </button>
                </div>
              </div>

              {/* REQUIREMENT */}

              <div className="rounded-2xl border border-[#ffb80018] bg-[#111111] p-4">
                <h3 className="text-lg font-extrabold text-[#ffcc33]">
                  Requirement
                </h3>

                <div className="mt-4 space-y-3">
                  {[
                    ["Total Deposits", "৳ 2,000"],
                    ["Total Turnover", "৳ 6,000"],
                    ["Within Days", "15"],
                    ["Email", "Verified"],
                    ["Phone", "Verified"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl border border-[#ffb80010] bg-[#1a1a1a] px-4 py-3"
                    >
                      <span className="text-[#d0d0d0]">{label}</span>

                      <span className="font-bold text-[#ffcc33]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACHIEVEMENTS */}

              <div className="rounded-2xl border border-[#ffb80018] bg-[#111111] p-4">
                <h3 className="text-lg font-extrabold text-[#ffcc33]">
                  Monthly Achievement Goals
                </h3>

                <div className="mt-4 space-y-4">
                  {achievements.map((item, index) => (
                    <div
                      key={index}
                      className="relative overflow-hidden rounded-2xl border border-[#ffb80010] bg-gradient-to-r from-[#141414] to-[#1d1d1d] p-4"
                    >
                      {item.locked && (
                        <div className="absolute right-4 top-4 text-[#ffcc33]/50">
                          <Lock size={18} />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-white">
                            Agent Achievement {item.level}
                          </h4>

                          <p className="mt-1 text-sm text-[#bdbdbd]">
                            {item.progress} / {item.level}
                          </p>
                        </div>

                        <div className="text-xl font-black text-[#ffcc33]">
                          {item.reward}
                        </div>
                      </div>

                      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#2a2a2a]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#a66d00] via-[#ffb800] to-[#ffcf40]"
                          style={{
                            width: `${(item.progress / item.level) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COMMISSION TABLE */}

              <div className="rounded-2xl border border-[#ffb80018] bg-[#111111] p-4">
                <h3 className="text-lg font-extrabold text-[#ffcc33]">
                  Daily Commission Table
                </h3>

                <div className="mt-4 overflow-hidden rounded-xl border border-[#ffb80010]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#1a1200] text-[#ffcc33]">
                      <tr>
                        <th className="px-3 py-3 text-left">Turnover</th>
                        <th className="px-3 py-3 text-center">Tier 1</th>
                        <th className="px-3 py-3 text-center">Tier 2</th>
                        <th className="px-3 py-3 text-center">Tier 3</th>
                      </tr>
                    </thead>

                    <tbody>
                      {[
                        ["100 - 10,000", "0.12%", "0.07%", "0.02%"],
                        ["10,001 - 30,000", "0.17%", "0.08%", "0.03%"],
                        ["30,001+", "0.22%", "0.10%", "0.04%"],
                      ].map((row, index) => (
                        <tr
                          key={index}
                          className="border-t border-[#ffb80010] bg-[#161616]"
                        >
                          {row.map((cell, i) => (
                            <td
                              key={i}
                              className="px-3 py-3 text-center text-[#d0d0d0]"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#ffb80018] bg-[#111111] p-4">
              <h3 className="text-lg font-extrabold text-[#ffcc33]">
                Referral Details
              </h3>

              {/* <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="bg-[#1a1200] text-[#ffcc33]">
                    <tr>
                      <th className="px-4 py-3 text-left">Username</th>
                      <th className="px-4 py-3 text-left">Deposit</th>
                      <th className="px-4 py-3 text-left">Turnover</th>
                      <th className="px-4 py-3 text-left">Commission</th>
                      <th className="px-4 py-3 text-left">Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {[1, 2, 3].map((item) => (
                      <tr
                        key={item}
                        className="border-t border-[#ffb80010] bg-[#161616]"
                      >
                        <td className="px-4 py-3">Player{item}</td>
                        <td className="px-4 py-3">৳ 1,000</td>
                        <td className="px-4 py-3">৳ 5,000</td>
                        <td className="px-4 py-3 text-[#ffcc33]">৳ 50</td>
                        <td className="px-4 py-3 text-[#d0d0d0]">2026-05-19</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div> */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferralBonusModal;
