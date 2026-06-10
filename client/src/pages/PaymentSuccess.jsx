import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import paymentService from "../Components/services/paymentService";

const PaymentSuccess = () => {
  const location = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const invoiceId =
    searchParams.get("invoice_id") || searchParams.get("invoiceId");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Verifying your payment...");

  useEffect(() => {
    let mounted = true;

    const verify = async () => {
      if (!invoiceId) {
        if (mounted) {
          setStatus("error");
          setMessage("Missing invoice_id in the payment return URL.");
        }
        return;
      }

      try {
        const response = await paymentService.verifyPayment({
          invoice_id: invoiceId,
        });
        const responseMessage =
          response?.data?.message ||
          response?.data?.data?.message ||
          (response?.data?.data?.alreadyProcessed
            ? "Payment was already verified and processed."
            : "Payment verified successfully.");

        if (mounted) {
          setStatus("success");
          setMessage(responseMessage);
        }
      } catch (error) {
        const errorMessage =
          error?.response?.data?.message ||
          "We could not verify this payment automatically. Please contact support if your wallet was not updated.";
        if (mounted) {
          setStatus("error");
          setMessage(errorMessage);
        }
      }
    };

    verify();

    return () => {
      mounted = false;
    };
  }, [invoiceId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-gray-800 bg-gray-900 p-8 shadow-2xl text-center">
        {status === "loading" && (
          <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent" />
        )}
        {status === "success" && (
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-3xl">
            ✓
          </div>
        )}
        {status === "error" && (
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-3xl">
            !
          </div>
        )}

        <h1 className="text-3xl font-bold mb-3">
          {status === "success"
            ? "Payment Successful"
            : status === "error"
              ? "Payment Verification Issue"
              : "Processing Payment"}
        </h1>
        <p className="text-gray-300 mb-6">{message}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/deposit"
            className="rounded-xl bg-yellow-500 px-5 py-3 font-semibold text-gray-950 hover:bg-yellow-400"
          >
            Back to Deposit
          </Link>
          <Link
            to="/"
            className="rounded-xl border border-gray-700 px-5 py-3 font-semibold text-white hover:bg-gray-800"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
