export const restaurantName = "Phangan Arena Bar";

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function item(name, category, price, extra = {}) {
  return {
    slug: extra.slug || slugify(`${category}-${name}`),
    name,
    category,
    price,
    description: extra.description || "",
    options: extra.options || [],
    optionGroups: extra.optionGroups || [],
    ingredients: extra.ingredients || [],
    discountPercent: extra.discountPercent || 0,
    active: extra.active ?? true,
    featured: extra.featured || false,
    sortOrder: extra.sortOrder || 0
  };
}

const thaiCategories = [
  {
    category: "Noodle Dishes",
    items: ["Pad Thai", "Pad See Ew", "Rad Na", "Chicken Noodles Soup"]
  },
  {
    category: "Curries & Soups",
    items: ["Panang Curry", "Massaman Curry", "Khao Soi", "Coconut Soup"]
  },
  {
    category: "Rice & Salad",
    items: [
      "Fried Rice",
      "Basil Chicken",
      "Fried Garlic Pepper",
      "Fried Mixed Vegetables",
      "Glass Noodles Salad",
      "Larb Gai"
    ]
  }
];

const thaiItems = thaiCategories.flatMap((group, groupIndex) =>
  group.items.map((name, itemIndex) =>
    item(name, group.category, 90, {
      description: "Thai kitchen favorite",
      sortOrder: groupIndex * 100 + itemIndex
    })
  )
);

export const defaultMenuItems = [
  ...thaiItems,
  item("Club Sandwich", "Western Food", 190, {
    options: ["Tomato + Mozzarella", "Chicken", "Ham", "Beef"],
    description: "Choose your filling",
    featured: true,
    sortOrder: 10
  }),
  item("Panini", "Western Food", 189, { sortOrder: 20 }),
  item("Caesar Salad Chicken", "Western Food", 199, { sortOrder: 30 }),
  item("Spaghetti", "Western Food", 199, {
    options: ["Pomodoro", "Carbonara", "Chicken Steak", "Bolognese"],
    description: "Choose your sauce",
    sortOrder: 40
  }),
  item("Chicken Nuggets", "Western Food", 179, { sortOrder: 50 }),
  item("Chicken Wings", "Western Food", 179, { sortOrder: 60 }),
  item("Cheese Burger", "Western Food", 199, { featured: true, sortOrder: 70 }),
  item("Burrito", "Western Food", 199, {
    options: ["Chicken", "Veggie", "Beef"],
    description: "Choose your filling",
    sortOrder: 80
  }),
  item("Quesadilla", "Western Food", 220, {
    options: ["Chicken", "Veggie", "Beef"],
    description: "Choose your filling",
    sortOrder: 90
  }),
  item("Margherita", "Pizza", 199, {
    ingredients: ["Tomato", "Cheese", "Oregano"],
    description: "Tomato, cheese and oregano",
    featured: true,
    sortOrder: 10
  }),
  item("Regina", "Pizza", 210, {
    ingredients: ["Tomato", "Cheese", "Ham", "Mushroom", "Oregano", "Olive"],
    description: "Ham, mushroom and olive",
    sortOrder: 20
  }),
  item("Veggie", "Pizza", 210, {
    ingredients: ["Tomato", "Cheese", "Onion", "Mushroom", "Pepper", "Paprika", "Olive"],
    description: "Onion, mushroom, pepper and olive",
    sortOrder: 30
  }),
  item("Texas", "Pizza", 240, {
    ingredients: ["Tomato", "Cheese", "Bacon", "Cheddar", "Egg", "Onion"],
    description: "Bacon, cheddar, egg and onion",
    sortOrder: 40
  }),
  item("Cancun", "Pizza", 260, {
    ingredients: ["Tomato", "Cheese", "Chicken", "Pepper", "Oregano", "Olive"],
    description: "Chicken, pepper and olive",
    sortOrder: 50
  }),
  item("Singha Beer", "Bottles", 140, { featured: true, sortOrder: 10 }),
  item("Chang Beer", "Bottles", 100, { sortOrder: 20 }),
  item("Leo Beer", "Bottles", 90, { sortOrder: 30 }),
  item("Leo Big Bottle", "Bottles", 130, { sortOrder: 40 }),
  item("Soju", "Bottles", 130, { sortOrder: 50 }),
  item("Bam Beer", "Bottles", 70, { sortOrder: 60 }),
  item("Bucket (Beers)", "Bottles", 380, { sortOrder: 70 }),
  item("Water Small", "Soft Drinks", 20, { sortOrder: 10 }),
  item("Water Big", "Soft Drinks", 40, { sortOrder: 20 }),
  item("Soft Drinks (Coke, Sprite, Fanta)", "Soft Drinks", 40, { sortOrder: 30 }),
  item("Fruit Shake", "Soft Drinks", 70, { sortOrder: 40 }),
  item("Mixed Fruit Shake", "Soft Drinks", 90, { sortOrder: 50 }),
  item("Apple Juice", "Soft Drinks", 60, { sortOrder: 60 }),
  item("Orange Juice", "Soft Drinks", 60, { sortOrder: 70 }),
  item("Fresh Fruit Juice", "Soft Drinks", 70, { sortOrder: 80 }),
  ...[
    "Mai Thai",
    "Margarita",
    "Mojito",
    "Screw Driver",
    "Pineapple Sunset",
    "Pina Colada",
    "Sex on the Beach",
    "Cuba Libre",
    "Tequila Sunrise",
    "Long Island Iced Tea"
  ].map((name, index) => item(name, "Cocktails", 160, { sortOrder: index + 1 })),
  item("Cocktail Bucket", "Cocktails", 400, {
    options: [
      "Mai Thai",
      "Margarita",
      "Mojito",
      "Screw Driver",
      "Pineapple Sunset",
      "Pina Colada",
      "Sex on the Beach",
      "Cuba Libre",
      "Tequila Sunrise",
      "Long Island Iced Tea"
    ],
    description: "Choose your cocktail bucket",
    sortOrder: 90
  }),
  item("Build Your Own Bucket", "Buckets", 300, {
    optionGroups: [
      {
        name: "Alcohol",
        values: ["Vodka", "Gin", "Rum", "Tequila", "Whiskey"]
      },
      {
        name: "Mixer",
        values: ["Red Bull", "Cola", "Sprite", "Tonic", "Fruit Juice"]
      }
    ],
    description: "Choose your alcohol and mixer",
    featured: true,
    sortOrder: 10
  }),
  item("Shot x1", "Shots", 80, { sortOrder: 10 }),
  item("Shots x2", "Shots", 150, { sortOrder: 20 }),
  item("Shots x3", "Shots", 220, { sortOrder: 30 }),
  item("Joss Shot", "Shots", 100, { sortOrder: 40 }),
  item("Long Drink", "Long Drinks", 140, {
    description: "1 glass alcohol + mixer",
    sortOrder: 10
  })
];

export const defaultExtras = [
  { name: "Fried egg", price: 25, active: true, sortOrder: 10 },
  { name: "Chicken", price: 40, active: true, sortOrder: 20 },
  { name: "Vegetables", price: 30, active: true, sortOrder: 30 },
  { name: "Cheese", price: 35, active: true, sortOrder: 40 },
  { name: "Extra rice", price: 30, active: true, sortOrder: 50 }
];

export const defaultPromotions = [
  {
    title: "Free Thai Food",
    description: "Buy 1 big Singha and get FREE Thai food",
    time: "7 - 8 PM",
    availableFrom: "19:00",
    availableUntil: "20:00",
    itemId: "bottles-singha-beer",
    kind: "free_thai_food",
    accent: "orange",
    active: true,
    sortOrder: 10
  },
  {
    title: "Happy Hour",
    description: "Buy 1 bucket get 1 free",
    time: "10 - 11 PM",
    availableFrom: "22:00",
    availableUntil: "23:00",
    itemId: "bottles-bucket-beers",
    kind: "bucket_bogo",
    accent: "red",
    active: true,
    sortOrder: 20
  },
  {
    title: "Pizza Combo",
    description: "Any pizza + soft drink",
    time: "All day",
    itemId: "pizza-margherita",
    kind: "pizza_soft_drink",
    accent: "green",
    active: true,
    sortOrder: 30
  }
];
