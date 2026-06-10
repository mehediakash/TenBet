import React from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
const TransactionDetailsModal = ({ isOpen, onClose, transaction }) => {
  if (!isOpen || !transaction) return null;
  const { t, i18n } = useTranslation();
  return (
    <div className="fixed inset-0 z-10000 bg-black/80 backdrop-blur-md">
      <div className="h-full overflow-y-auto bg-linear-to-b from-[#070707] via-[#111111] to-[#1a1405] p-4 text-white">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-[#ffb80033] pb-4">
          <h2 className="text-[24px] font-extrabold tracking-wide text-[#ffcc33] drop-shadow-[0_0_10px_rgba(255,184,0,0.35)]">
            {t("transactionRecordDetails")}
          </h2>

          <span className="rounded-lg border border-[#ffcc33]/30 bg-linear-to-r from-[#c28a00] to-[#ffcc33] px-4 py-1 text-sm font-bold uppercase tracking-wide text-black shadow-lg shadow-[#ffb80033]">
            {t(transaction.status)}
          </span>
        </div>

        {/* BOX */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#ffb80022] bg-[#111111] shadow-2xl shadow-black/40">
          {[
            [
              t("referenceNumber"),
              transaction.referenceId ||
                transaction.ref ||
                transaction.reference,
            ],
            [t("type"), transaction.type],
            [t("provider"), transaction.provider],
            [t("amount"), `৳${transaction.amount}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-[#ffb80014] bg-linear-to-r from-[#111111] to-[#1a1a1a] px-5 py-4 transition-all duration-200 hover:bg-[#1d1d1d]"
            >
              <span className="font-semibold tracking-wide text-[#ffcc33]">
                {label}
              </span>

              <span className="font-bold text-white">{value ?? "—"}</span>
            </div>
          ))}
        </div>

        {/* TIMELINE */}
        <div className="mt-6 rounded-2xl border border-[#ffb80022] bg-[#0c0c0c] p-5 shadow-xl shadow-black/40">
          <h3 className="mb-5 text-lg font-extrabold tracking-wide text-[#ffcc33]">
            {t("transactionProgress")}
          </h3>

          <div className="space-y-5">
            {(transaction.timeline || []).map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="relative mt-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#ffcc33] shadow-[0_0_15px_rgba(255,204,51,0.7)]">
                  <div className="h-2 w-2 rounded-full bg-black" />
                </div>

                <div>
                  <p className="font-semibold text-white">{step.text}</p>

                  <p className="mt-1 text-sm text-[#c7c7c7]">
                    {step.time ||
                      dayjs(step.at || step.date).format("YYYY-MM-DD HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full rounded-2xl border border-[#ffcc33]/20 bg-linear-to-r from-[#a66d00] via-[#ffb800] to-[#ffcf40] py-4 font-extrabold tracking-wide text-black shadow-lg shadow-[#ffb80033] transition-all duration-200 hover:scale-[1.01] hover:shadow-[#ffb80066]"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
};

export default TransactionDetailsModal;
