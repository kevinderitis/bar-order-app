import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 240
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    options: {
      type: [String],
      default: []
    },
    optionGroups: {
      type: [
        {
          name: {
            type: String,
            required: true,
            trim: true
          },
          values: {
            type: [String],
            default: []
          }
        }
      ],
      default: []
    },
    ingredients: {
      type: [String],
      default: []
    },
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    featured: {
      type: Boolean,
      default: false
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

menuItemSchema.index({ category: 1, sortOrder: 1, name: 1 });

export const MenuItem = mongoose.model("MenuItem", menuItemSchema);
