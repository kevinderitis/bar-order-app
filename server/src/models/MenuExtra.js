import mongoose from "mongoose";

const menuExtraSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      unique: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
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

export const MenuExtra = mongoose.model("MenuExtra", menuExtraSchema);
