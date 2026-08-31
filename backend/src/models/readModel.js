const mongoose = require("mongoose");

const shipmentReadSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    currentStatus: {
      type: String,
      enum: ["CREATED", "IN_TRANSIT", "DELIVERED", "ALERT"],
      default: "CREATED",
      index: true,
    },
    location: {
      type: String,
      required: true,
    },
    temperature: {
      type: Number,
      default: null,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for dashboard queries filtering by status and updated timestamp
shipmentReadSchema.index({ currentStatus: 1, lastUpdated: -1 });

const ShipmentReadModel =
  mongoose.models.ShipmentReadModel ||
  mongoose.model("ShipmentReadModel", shipmentReadSchema);

module.exports = ShipmentReadModel;