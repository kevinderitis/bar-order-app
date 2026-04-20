import { defaultMenuItems, defaultPromotions } from "../data/menu.js";
import { MenuItem } from "../models/MenuItem.js";
import { Promotion } from "../models/Promotion.js";

export async function seedMenuIfEmpty() {
  const [menuItemCount, promotionCount] = await Promise.all([
    MenuItem.estimatedDocumentCount(),
    Promotion.estimatedDocumentCount()
  ]);

  if (menuItemCount === 0) {
    await MenuItem.insertMany(defaultMenuItems, { ordered: false });
    console.log(`Seeded ${defaultMenuItems.length} menu items`);
  }

  if (promotionCount === 0) {
    await Promotion.insertMany(defaultPromotions, { ordered: false });
    console.log(`Seeded ${defaultPromotions.length} promotions`);
  }
}
