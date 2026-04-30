import mongoose from "mongoose";
import { env } from "./env.js";
import { MenuExtra } from "../models/MenuExtra.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order } from "../models/Order.js";
import { Promotion } from "../models/Promotion.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { User } from "../models/User.js";
import { seedMenuIfEmpty } from "../utils/seedMenu.js";

async function dropLegacyStatusIndexIfNeeded() {
  const indexes = await Order.collection.indexes();
  const legacyStatusIndex = indexes.find(
    (index) =>
      index.name === "status_1" &&
      index.key?.status === 1 &&
      !index.unique &&
      !index.partialFilterExpression
  );

  if (legacyStatusIndex) {
    await Order.collection.dropIndex("status_1");
    console.log("Dropped legacy non-unique orders.status index");
  }
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  await dropLegacyStatusIndexIfNeeded();
  await MenuExtra.init();
  await MenuItem.init();
  await Order.init();
  await Promotion.init();
  await PushSubscription.init();
  await User.init();
  await seedMenuIfEmpty();
  console.log("MongoDB connected");
}
