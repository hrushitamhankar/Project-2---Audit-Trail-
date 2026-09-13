const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
  {
    aggregateId: {
      type: String,
      required: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    version: {
      type: Number,
      required: true,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("AuditEvent", auditEventSchema);
