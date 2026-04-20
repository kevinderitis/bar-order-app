export const menuPromotions = [
  {
    id: "combo-night",
    title: "Night Combo",
    subtitle: "Burger, fries and signature soda",
    itemId: "classic-smash",
    accent: "orange"
  },
  {
    id: "fresh-duo",
    title: "Fresh Duo",
    subtitle: "Two garden bowls with 15% off",
    itemId: "green-bowl",
    accent: "green"
  },
  {
    id: "sweet-finish",
    title: "Sweet Finish",
    subtitle: "Add dessert to complete pickup",
    itemId: "citrus-tart",
    accent: "red"
  }
];

export const menuItems = [
  {
    id: "classic-smash",
    name: "Classic Smash",
    description: "Double beef, cheddar, pickles and house sauce.",
    category: "Mains",
    price: 12.5,
    discountPercent: 10,
    featured: true
  },
  {
    id: "green-bowl",
    name: "Green Bowl",
    description: "Avocado, grains, herbs, greens and citrus dressing.",
    category: "Mains",
    price: 10.8,
    discountPercent: 0,
    featured: true
  },
  {
    id: "crispy-fries",
    name: "Crispy Fries",
    description: "Golden fries with smoked paprika salt.",
    category: "Sides",
    price: 4.5,
    discountPercent: 0,
    featured: false
  },
  {
    id: "spicy-wings",
    name: "Spicy Wings",
    description: "Glazed wings with soft heat and lime.",
    category: "Sides",
    price: 8.2,
    discountPercent: 5,
    featured: false
  },
  {
    id: "signature-soda",
    name: "Signature Soda",
    description: "House citrus soda with mint.",
    category: "Drinks",
    price: 3.8,
    discountPercent: 0,
    featured: false
  },
  {
    id: "cold-brew",
    name: "Cold Brew",
    description: "Slow brewed coffee over ice.",
    category: "Drinks",
    price: 4.2,
    discountPercent: 0,
    featured: false
  },
  {
    id: "citrus-tart",
    name: "Citrus Tart",
    description: "Bright lemon cream and crisp pastry.",
    category: "Desserts",
    price: 5.4,
    discountPercent: 15,
    featured: true
  }
];

export function findMenuItem(id) {
  return menuItems.find((item) => item.id === id);
}
