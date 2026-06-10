const Deposit = require("../models/Deposit");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Promotion = require("../models/Promotion");
const WalletService = require("../services/walletService");
const promotionService = require("../services/promotionService");
const {
  createPayment,
  verifyPayment,
  getErrorMessage,
} = require("../services/uddoktaPayService");

const isSuccessStatus = (payload) => {
  const candidates = [
    payload?.status,
    payload?.payment_status,
    payload?.paymentStatus,
    payload?.invoice_status,
    payload?.invoiceStatus,
    payload?.paid_status,
    payload?.paidStatus,
    payload?.data?.status,
    payload?.data?.payment_status,
    payload?.data?.paymentStatus,
    payload?.data?.invoice_status,
    payload?.data?.paid_status,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return candidates.some((value) =>
    ["success", "paid", "completed", "complete", "verified", "valid"].includes(
      value,
    ),
  );
};

const extractInvoiceId = (payload) => {
  return (
    payload?.invoice_id ||
    payload?.invoiceId ||
    payload?.data?.invoice_id ||
    payload?.data?.invoiceId ||
    payload?.metadata?.invoice_id ||
    payload?.metadata?.invoiceId ||
    null
  );
};

const extractPaymentMethod = (payload) => {
  return (
    payload?.payment_method ||
    payload?.paymentMethod ||
    payload?.data?.payment_method ||
    payload?.data?.paymentMethod ||
    null
  );
};

const extractMetadata = (payload) => {
  return (
    payload?.metadata ||
    payload?.data?.metadata ||
    payload?.result?.metadata ||
    payload?.data?.result?.metadata ||
    null
  );
};

const extractSelectedPromotionId = (payload) => {
  const metadata = extractMetadata(payload);

  return (
    metadata?.selectedPromotionId ||
    metadata?.promotionId ||
    metadata?.promotion ||
    payload?.selectedPromotionId ||
    payload?.promotionId ||
    payload?.promotion ||
    null
  );
};

const extractDepositId = (payload) => {
  const metadata = extractMetadata(payload);

  return metadata?.depositId || metadata?.deposit_id || null;
};

const resolveDepositIdFromInvoice = async (invoiceId, userId = null) => {
  if (!invoiceId) {
    return null;
  }

  const query = {
    $or: [
      { "propayDetails.orderNo": invoiceId },
      { "propayDetails.gatewayResponse.invoice_id": invoiceId },
      { "propayDetails.gatewayResponse.invoiceId": invoiceId },
      { "propayDetails.gatewayResponse.data.invoice_id": invoiceId },
      { "propayDetails.gatewayResponse.data.invoiceId": invoiceId },
    ],
  };

  if (userId) {
    query.user = userId;
  }

  const deposit = await Deposit.findOne(query).select("_id propayDetails");

  return deposit?._id?.toString() || null;
};

const applySelectedPromotionIfNeeded = async (deposit, source = "payment") => {
  const resolvedPromotionId =
    deposit?.promotion ||
    deposit?.propayDetails?.gatewayResponse?.metadata?.selectedPromotionId ||
    deposit?.propayDetails?.gatewayResponse?.metadata?.promotionId ||
    deposit?.propayDetails?.gatewayResponse?.selectedPromotionId ||
    null;

  if (!resolvedPromotionId) {
    return { applied: false, skipped: true };
  }

  const promotionAppliedAt =
    deposit.promotionAppliedAt ||
    deposit.propayDetails?.gatewayResponse?.promotionAppliedAt ||
    null;

  if (promotionAppliedAt) {
    return { applied: true, alreadyApplied: true };
  }

  const result = await promotionService.applyDepositPromotion(
    deposit.user.toString(),
    resolvedPromotionId.toString(),
    Number(deposit.amount || 0),
    deposit._id.toString(),
  );

  if (!result.success) {
    return {
      applied: false,
      skipped: false,
      success: false,
      message: result.message || "Failed to apply selected promotion",
    };
  }

  deposit.promotionAppliedAt = new Date();
  deposit.propayDetails = deposit.propayDetails || {};
  deposit.propayDetails.gatewayResponse = {
    ...(deposit.propayDetails.gatewayResponse || {}),
    promotionAppliedAt: deposit.promotionAppliedAt,
    promotionResult: {
      source,
      bonusAmount: result.bonusAmount,
      turnoverRequired: result.turnoverRequired,
      promotionTurnoverId: result.promotionTurnoverId,
      userPromotionId: result.userPromotionId,
    },
  };

  await deposit.save();

  return {
    applied: true,
    success: true,
    result,
  };
};

const buildFrontendUrl = (path, params = {}) => {
  const baseUrl = "http://tenbet.live";
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, value);
  });
  return url.toString();
};

const isValidEmail = (value) => {
  if (!value || typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

const resolveGatewayEmail = (user) => {
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (isValidEmail(email)) {
    return email.toLowerCase();
  }

  const phone = String(user?.phone || "")
    .replace(/\D/g, "")
    .trim();

  if (phone) {
    return `${phone}@dexwine.local`;
  }

  return `${user?._id || "user"}@dexwine.local`;
};

exports.createPaymentController = async (req, res) => {
  try {
    const { amount } = req.body;
    const selectedPromotionId =
      req.body.selectedPromotionId ||
      req.body.promotionId ||
      req.body.promotion ||
      null;

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const user = await User.findById(req.user.id).select(
      "_id fullName email phone",
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (selectedPromotionId) {
      const promotion = await Promotion.findById(selectedPromotionId);
      if (promotion) {
        const eligibility = await promotionService.validatePromotionEligibility(
          req.user.id,
          promotion,
        );

        if (!eligibility.isEligible) {
          return res.status(400).json({
            success: false,
            message: eligibility.reason,
          });
        }
      }
    }

    console.log("PROMOTION ID:", selectedPromotionId);

    const deposit = await Deposit.create({
      user: user._id,
      amount: Number(amount),
      paymentMethod: "uddoktapay",
      promotion: selectedPromotionId || null,
      status: "processing",
      propayDetails: {
        gatewayStatus: "initiated",
        initiatedAt: new Date(),
      },
    });

    try {
      const metadata = {
        userId: user._id.toString(),
        depositId: deposit._id.toString(),
        selectedPromotionId: selectedPromotionId
          ? String(selectedPromotionId)
          : null,
      };

      console.log("PAYMENT METADATA:", metadata);

      const payment = await createPayment({
        fullName: user.fullName,
        email: resolveGatewayEmail(user),
        amount: Number(amount),
        metadata,
        redirectUrl: buildFrontendUrl("/payment/success"),
        cancelUrl: buildFrontendUrl("/payment/cancel", {
          referenceId: deposit.referenceId,
        }),
        webhookUrl: `${process.env.BASE_URL || "http://localhost:5000"}/api/payments/webhook`,
      });

      const invoiceId = payment.invoiceId || extractInvoiceId(payment.raw);

      if (invoiceId) {
        deposit.propayDetails.orderNo = invoiceId;
      }

      deposit.propayDetails.gatewayStatus = "pending";
      deposit.propayDetails.gatewayResponse = {
        ...payment.raw,
        invoice_id: invoiceId,
        payment_url: payment.paymentUrl,
        metadata: metadata,
      };
      await deposit.save();

      return res.status(200).json({
        success: true,
        message: "Payment initiated successfully",
        data: {
          depositId: deposit._id,
          paymentUrl: payment.paymentUrl,
          invoiceId: invoiceId,
          referenceId: deposit.referenceId,
        },
      });
    } catch (paymentError) {
      deposit.status = "rejected";
      deposit.rejectionReason = getErrorMessage(paymentError);
      deposit.propayDetails.gatewayStatus = "failed";
      deposit.propayDetails.gatewayResponse = {
        error: getErrorMessage(paymentError),
      };
      await deposit.save();

      return res.status(502).json({
        success: false,
        message: getErrorMessage(paymentError),
      });
    }
  } catch (error) {
    console.error("Create payment controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating payment",
    });
  }
};

exports.verifyPaymentController = async (req, res) => {
  try {
    const invoiceId = req.body.invoice_id || req.body.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "invoice_id is required",
      });
    }

    console.log("🔍 VERIFY PAYMENT: Verifying invoice_id:", invoiceId);

    const verifyResult = await verifyPayment(invoiceId);
    const verifyData = verifyResult.raw || {};

    console.log("VERIFY RESPONSE:", verifyData);
    console.log("VERIFY METADATA:", extractMetadata(verifyData));
    console.log(
      "VERIFY SELECTED PROMOTION ID:",
      extractSelectedPromotionId(verifyData),
    );

    const depositIdFromMetadata = extractDepositId(verifyData);
    let depositId = depositIdFromMetadata;

    console.log("DEPOSIT ID:", depositId);

    if (!depositId) {
      depositId = await resolveDepositIdFromInvoice(invoiceId, req.user?.id);
      console.log("DEPOSIT ID (fallback):", depositId);
    }

    if (!depositId) {
      return res.status(400).json({
        success: false,
        message: "Missing depositId in verification response",
      });
    }

    let deposit = await Deposit.findById(depositId);

    console.log("FOUND PAYMENT:", deposit);
    console.log("DEPOSIT RECORD:", deposit);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found",
      });
    }

    // Verify the deposit belongs to the current user
    if (deposit.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this deposit",
      });
    }

    if (!deposit.promotion) {
      const fallbackPromotionId =
        extractSelectedPromotionId(verifyData) ||
        deposit?.propayDetails?.gatewayResponse?.metadata
          ?.selectedPromotionId ||
        deposit?.propayDetails?.gatewayResponse?.selectedPromotionId ||
        null;

      if (fallbackPromotionId) {
        deposit.promotion = fallbackPromotionId;
      }
    }

    // We'll perform an atomic update later to avoid races during wallet update

    if (!isSuccessStatus(verifyData)) {
      deposit.status = "rejected";
      deposit.propayDetails.gatewayStatus = "failed";
      deposit.propayDetails.completedAt = new Date();
      deposit.propayDetails.gatewayResponse = {
        ...deposit.propayDetails.gatewayResponse,
        verifyResponse: verifyData,
      };
      deposit.rejectionReason =
        verifyData?.message || "Payment verification failed";
      await deposit.save();

      return res.status(400).json({
        success: false,
        message: verifyData?.message || "Payment verification failed",
      });
    }

    const verifiedProvider = extractPaymentMethod(verifyData);

    const newGatewayResponse = {
      ...(deposit.propayDetails?.gatewayResponse || {}),
      verifyResponse: verifyData,
      invoice_id: invoiceId,
    };

    const updateFields = {
      status: "completed",
      completedAt: new Date(),
      approvedAt: new Date(),
      "propayDetails.gatewayStatus": "completed",
      "propayDetails.completedAt": new Date(),
      "propayDetails.gatewayResponse": newGatewayResponse,
    };

    if (verifiedProvider) {
      updateFields.provider = String(verifiedProvider).toLowerCase();
    } else {
      updateFields.provider = null;
    }

    // Atomic update: only one concurrent handler will succeed updating status to completed
    const updated = await Deposit.findOneAndUpdate(
      { _id: deposit._id, status: { $ne: "completed" } },
      { $set: updateFields },
      { new: true },
    );

    if (!updated) {
      // Another process already completed this deposit
      console.log(
        "⚠️ DEPOSIT ALREADY COMPLETED DURING RACE - aborting wallet update",
      );
      return res.status(200).json({
        success: true,
        message: "Payment already verified and processed",
        data: {
          depositId: deposit._id,
          invoiceId,
          alreadyProcessed: true,
        },
      });
    }

    deposit = updated;

    console.log(
      "✅ DEPOSIT UPDATED - status: completed, provider:",
      deposit.provider,
    );

    // Check if transaction already exists
    const existingTransaction = await Transaction.findOne({
      user: deposit.user,
      type: "deposit",
      status: "completed",
      "metadata.depositId": depositId,
    }).lean();

    if (!existingTransaction) {
      // Update wallet using WalletService
      console.log(
        "💰 UPDATING WALLET - amount:",
        deposit.amount,
        "user:",
        deposit.user,
      );

      await WalletService.updateWallet(
        deposit.user,
        deposit.amount,
        "main",
        "deposit",
        {
          description: `UddoktaPay Deposit - Invoice: ${invoiceId}`,
          depositId: deposit._id.toString(),
          invoiceId: invoiceId,
          paymentMethod: "uddoktapay",
          provider: deposit.provider || "uddoktapay",
        },
      );

      console.log("✅ WALLET UPDATED SUCCESSFULLY");
    } else {
      console.log("⚠️ TRANSACTION ALREADY EXISTS - skipping wallet update");
    }

    const promotionResult = await applySelectedPromotionIfNeeded(
      deposit,
      "verify",
    );
    if (promotionResult?.success === false) {
      console.warn(
        "⚠️ VERIFY: promotion apply failed",
        promotionResult.message,
      );
    } else if (promotionResult?.applied) {
      console.log("✅ VERIFY: selected promotion applied successfully");
    }

    const finalUserAfterVerify = await User.findById(deposit.user)
      .select("wallet")
      .lean();
    console.log("FINAL USER WALLET:", finalUserAfterVerify?.wallet);

    return res.status(200).json({
      success: true,
      message: "Payment verified and wallet updated successfully",
      data: {
        depositId: deposit._id,
        invoiceId: invoiceId,
        promotionApplied: !!promotionResult?.applied,
      },
    });
  } catch (error) {
    console.error("❌ Verify payment controller error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error while verifying payment",
    });
  }
};

exports.handlePaymentWebhookController = async (req, res) => {
  try {
    const invoiceId =
      req.body.invoice_id ||
      req.body.invoiceId ||
      req.body?.data?.invoice_id ||
      req.body?.data?.invoiceId;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "invoice_id is required",
      });
    }

    console.log("🔔 WEBHOOK: Received invoice_id:", invoiceId);

    const verifyResult = await verifyPayment(invoiceId);
    const verifyData = verifyResult.raw || {};

    console.log("WEBHOOK VERIFY RESPONSE:", verifyData);
    console.log("WEBHOOK METADATA:", extractMetadata(verifyData));
    console.log(
      "WEBHOOK SELECTED PROMOTION ID:",
      extractSelectedPromotionId(verifyData),
    );

    let depositId = extractDepositId(verifyData);

    console.log("WEBHOOK DEPOSIT ID:", depositId);

    if (!depositId) {
      depositId = await resolveDepositIdFromInvoice(invoiceId);
      console.log("WEBHOOK DEPOSIT ID (fallback):", depositId);
    }

    if (!depositId) {
      console.warn("⚠️ WEBHOOK: Missing metadata or depositId");
      return res.status(200).json({
        success: true,
        message: "Webhook received (metadata missing)",
      });
    }

    // Find deposit by _id using the depositId from metadata
    let deposit = await Deposit.findById(depositId);

    console.log("WEBHOOK FOUND PAYMENT:", deposit);
    console.log("DEPOSIT RECORD:", deposit);

    if (!deposit) {
      console.warn("⚠️ WEBHOOK: Deposit not found for depositId:", depositId);
      return res.status(200).json({
        success: true,
        message: "Webhook received (deposit not found)",
      });
    }

    if (!isSuccessStatus(verifyData)) {
      console.log("⚠️ WEBHOOK: Payment status not successful");
      deposit.status = "rejected";
      deposit.propayDetails.gatewayStatus = "failed";
      deposit.propayDetails.completedAt = new Date();
      deposit.propayDetails.gatewayResponse = {
        ...deposit.propayDetails.gatewayResponse,
        verifyResponse: verifyData,
      };
      deposit.rejectionReason =
        verifyData?.message || "Payment verification failed";
      await deposit.save();

      return res.status(200).json({
        success: true,
        message: "Webhook received",
      });
    }

    if (!deposit.promotion) {
      const fallbackPromotionId =
        extractSelectedPromotionId(verifyData) ||
        deposit?.propayDetails?.gatewayResponse?.metadata
          ?.selectedPromotionId ||
        deposit?.propayDetails?.gatewayResponse?.selectedPromotionId ||
        null;

      if (fallbackPromotionId) {
        deposit.promotion = fallbackPromotionId;
      }
    }

    // Check if already completed - allow promotion replay if it was missed earlier
    const alreadyCompleted = deposit.status === "completed";

    // Extract payment method from verified data
    const verifiedProvider = extractPaymentMethod(verifyData);

    // Prepare atomic update payload
    const newGatewayResponse = {
      ...(deposit.propayDetails?.gatewayResponse || {}),
      verifyResponse: verifyData,
      invoice_id: invoiceId,
    };

    const updateFields = {
      status: "completed",
      completedAt: new Date(),
      approvedAt: new Date(),
      "propayDetails.gatewayStatus": "completed",
      "propayDetails.completedAt": new Date(),
      "propayDetails.gatewayResponse": newGatewayResponse,
    };

    if (verifiedProvider) {
      updateFields.provider = String(verifiedProvider).toLowerCase();
    } else {
      updateFields.provider = null;
    }

    let updated = deposit;
    if (!alreadyCompleted) {
      updated = await Deposit.findOneAndUpdate(
        { _id: deposit._id, status: { $ne: "completed" } },
        { $set: updateFields },
        { new: true },
      );

      if (!updated) {
        console.log(
          "⚠️ WEBHOOK: Deposit already completed during race - continuing with post-processing",
        );
        const refreshedDeposit = await Deposit.findById(deposit._id);
        if (refreshedDeposit) {
          deposit = refreshedDeposit;
        }
      } else {
        deposit = updated;
      }
    } else {
      console.log("⚠️ WEBHOOK: Deposit already completed");
    }

    console.log(
      "✅ WEBHOOK: Deposit updated - status: completed, provider:",
      deposit.provider,
    );

    // Check if transaction already exists
    const existingTransaction = await Transaction.findOne({
      user: deposit.user,
      type: "deposit",
      status: "completed",
      "metadata.depositId": depositId,
    }).lean();

    if (!existingTransaction) {
      // Update wallet using WalletService
      console.log(
        "💰 WEBHOOK: Updating wallet - amount:",
        deposit.amount,
        "user:",
        deposit.user,
      );

      await WalletService.updateWallet(
        deposit.user,
        deposit.amount,
        "main",
        "deposit",
        {
          description: `UddoktaPay Deposit - Invoice: ${invoiceId}`,
          depositId: deposit._id.toString(),
          invoiceId: invoiceId,
          paymentMethod: "uddoktapay",
          provider: deposit.provider || "uddoktapay",
        },
      );

      console.log("✅ WEBHOOK: Wallet updated successfully");
    } else {
      console.log(
        "⚠️ WEBHOOK: Transaction already exists - skipping wallet update",
      );
    }

    const promotionResult = await applySelectedPromotionIfNeeded(
      deposit,
      "webhook",
    );
    if (promotionResult?.success === false) {
      console.warn(
        "⚠️ WEBHOOK: promotion apply failed",
        promotionResult.message,
      );
    } else if (promotionResult?.applied) {
      console.log("✅ WEBHOOK: selected promotion applied successfully");
    }

    const finalUserAfterWebhook = await User.findById(deposit.user)
      .select("wallet")
      .lean();
    console.log("FINAL USER WALLET:", finalUserAfterWebhook?.wallet);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: {
        promotionApplied: !!promotionResult?.applied,
        alreadyCompleted,
        alreadyProcessed: !!existingTransaction,
      },
    });
  } catch (error) {
    console.error("❌ Webhook payment controller error:", error);
    return res.status(200).json({
      success: true,
      message: "Webhook received (error occurred)",
    });
  }
};

exports.cancelPaymentController = async (req, res) => {
  try {
    const referenceId = req.body.referenceId;

    console.log("CANCEL REFERENCE ID:", referenceId);

    if (!referenceId) {
      return res.status(400).json({
        success: false,
        message: "referenceId is required",
      });
    }

    const deposit = await Deposit.findOne({
      referenceId,
      user: req.user?.id || undefined,
    });

    console.log("FOUND PAYMENT:", deposit);

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    if (["approved", "completed"].includes(deposit.status)) {
      return res.status(200).json({
        success: true,
        message: "Payment already completed",
        data: {
          alreadyCompleted: true,
          depositId: deposit._id,
          referenceId,
        },
      });
    }

    if (deposit.status === "cancelled") {
      return res.status(200).json({
        success: true,
        message: "Payment already cancelled",
        data: {
          alreadyCancelled: true,
          depositId: deposit._id,
          referenceId,
        },
      });
    }

    deposit.status = "cancelled";
    deposit.cancelledAt = new Date();
    deposit.propayDetails = deposit.propayDetails || {};
    deposit.propayDetails.gatewayStatus = "cancelled";
    deposit.propayDetails.gatewayResponse = {
      ...(deposit.propayDetails.gatewayResponse || {}),
      cancelResponse: {
        referenceId,
        cancelled_at: new Date().toISOString(),
      },
    };

    await deposit.save();

    return res.status(200).json({
      success: true,
      message: "Payment cancelled successfully",
      data: {
        depositId: deposit._id,
        referenceId,
        cancelledAt: deposit.cancelledAt,
      },
    });
  } catch (error) {
    console.error("Cancel payment controller error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error while cancelling payment",
    });
  }
};
