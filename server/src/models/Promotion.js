import mongoose from "mongoose";

export const PROMOTION_ACCENTS = ["orange", "green", "red"];

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 220
    },
    time: {
      type: String,
      trim: true,
      default: "",
      maxlength: 80
    },
    availableFrom: {
      type: String,
      trim: true,
      default: "",
      match: /^$|^([01]\d|2[0-3]):[0-5]\d$/
    },
    availableUntil: {
      type: String,
      trim: true,
      default: "",
      match: /^$|^([01]\d|2[0-3]):[0-5]\d$/
    },
    itemId: {
      type: String,
      trim: true,
      default: ""
    },
    kind: {
      type: String,
      enum: ["", "free_thai_food", "bucket_bogo", "pizza_soft_drink"],
      default: ""
    },
    imageDataUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2500000
    },
    accent: {
      type: String,
      enum: PROMOTION_ACCENTS,
      default: "orange"
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

promotionSchema.index({ active: 1, sortOrder: 1 });

export const Promotion = mongoose.model("Promotion", promotionSchema);
