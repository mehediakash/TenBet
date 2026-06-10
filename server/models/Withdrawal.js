const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  netAmount: {
    type: Number,
    required: true
  },
  processingFee: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['bkash', 'nogod', 'rocket', 'bank_card']
  },
  paymentDetails: {
    toNumber: {
      type: String,
      required: true
    },
    accountName: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      default: null
    },
    branchName: {
      type: String,
      default: null
    }
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  referenceId: {
    type: String,
    unique: true,
    sparse: true
  },
  adminNote: {
    type: String,
    default: null
  },
  transactionId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

withdrawalSchema.pre('save',async  function() {
  if (this.isNew && !this.referenceId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    this.referenceId = `WD${timestamp}${random}`.toUpperCase();
  }
  this.updatedAt = Date.now();

});

withdrawalSchema.index({ user: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);