/** Generate shared/menu.json for Musa Cafe from the printed menus. */
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ph = "/products/placeholder.svg";

const cid = (n) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pid = (n) =>
  `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const categories = [
  { id: cid(1), name: "Deals", slug: "deals", image: "/products/deals/deal-1.webp", displayOrder: 1 },
  { id: cid(2), name: "Shawarma", slug: "shawarma", image: "/products/rolls/malai-boti.webp", displayOrder: 2 },
  { id: cid(3), name: "Spin Roll", slug: "spin-roll", image: "/products/rolls/spin.webp", displayOrder: 3 },
  { id: cid(4), name: "Paratha Roll", slug: "paratha-roll", image: "/products/rolls/chicken-patty.webp", displayOrder: 4 },
  { id: cid(5), name: "Tortilla Wraps", slug: "tortilla-wraps", image: "/products/rolls/arabic.webp", displayOrder: 5 },
  { id: cid(6), name: "Burgers", slug: "burgers", image: "/products/burgers/zinger.webp", displayOrder: 6 },
  { id: cid(7), name: "Sandwiches", slug: "sandwiches", image: "/products/sandwiches/bbq.webp", displayOrder: 7 },
  { id: cid(8), name: "Regular Pizza", slug: "standard-pizza", image: "/products/pizzas/chicken-tika.webp", displayOrder: 8 },
  { id: cid(9), name: "Special Pizza", slug: "special-pizza", image: "/products/pizzas/legend-malai.webp", displayOrder: 9 },
  { id: cid(10), name: "Stuffed & Crust Pizza", slug: "stuffed-crust-pizza", image: "/products/pizzas/crown-crush.webp", displayOrder: 10 },
  { id: cid(11), name: "Fried", slug: "fried", image: "/products/fried-chicken/hot-wings.webp", displayOrder: 11 },
  { id: cid(12), name: "Fries", slug: "fries", image: "/products/fries/salted.webp", displayOrder: 12 },
  { id: cid(13), name: "Pasta", slug: "pasta", image: "/products/pasta/creamy.webp", displayOrder: 13 },
  { id: cid(14), name: "Broast", slug: "broast", image: "/products/fried-chicken/chicken-drum.webp", displayOrder: 14 },
  { id: cid(15), name: "Salad Bar", slug: "salad-bar", image: "/products/salad-bar/category.webp", displayOrder: 15 },
  { id: cid(16), name: "Shakes", slug: "shakes", image: "/products/shakes/mango-shake.webp", displayOrder: 16 },
  { id: cid(17), name: "Ice Cream", slug: "ice-cream", image: "/products/ice-cream/rabri-dodh.webp", displayOrder: 17 },
  { id: cid(18), name: "Cold Drinks", slug: "cold-drinks", image: "/products/cold-drinks/category.webp", displayOrder: 18 },
  { id: cid(19), name: "Musa Specials", slug: "musa-specials", image: "/products/musa-specials/category.webp", displayOrder: 19 },
];

let n = 0;
const products = [];

function add(category, name, description, sizes, image = ph, featured = false) {
  n += 1;
  products.push({
    id: pid(n),
    category,
    name,
    description,
    image,
    featured,
    sizes,
  });
}

const one = (price) => [{ name: "Regular", price }];
const smLg = (s, l) => [
  { name: "Small", price: s },
  { name: "Large", price: l },
];

const REG_PIZZA = [
  { name: "Small", price: 599 },
  { name: "Medium", price: 899 },
  { name: "Large", price: 1250 },
  { name: "XL", price: 1799 },
];
const REG_PIZZA_LOVER = [
  { name: "Small", price: 599 },
  { name: "Medium", price: 999 },
  { name: "Large", price: 1350 },
  { name: "XL", price: 1799 },
];
const REG_PIZZA_BBQ = [
  { name: "Small", price: 699 },
  { name: "Medium", price: 999 },
  { name: "Large", price: 1399 },
  { name: "XL", price: 1799 },
];
const REG_PIZZA_VEG = [
  { name: "Small", price: 649 },
  { name: "Medium", price: 949 },
  { name: "Large", price: 1250 },
  { name: "XL", price: 1799 },
];
const SPEC_PIZZA = [
  { name: "Medium", price: 1099 },
  { name: "Large", price: 1350 },
  { name: "XL", price: 1899 },
];
const CRUST_PIZZA = [
  { name: "Medium", price: 1199 },
  { name: "Large", price: 1450 },
  { name: "XL", price: 1999 },
];

// —— Deals ——
add(
  "deals",
  "Burger Deal 450",
  "Plain fries + 1 zinger burger + cold drink 250ml.",
  one(450),
  "/products/deals/deal-1.webp",
  true,
);
add(
  "deals",
  "Burger Deal 999",
  "2 zinger burgers + 2 broast legs.",
  one(999),
  "/products/deals/deal-2.webp",
  true,
);
add(
  "deals",
  "Burger Deal 1299",
  "Plain fries + 3 zinger burgers + alfredo pasta small + cold drink 1.5 Ltr.",
  one(1299),
  "/products/deals/deal-3.webp",
  true,
);
add(
  "deals",
  "Burger Deal 1999",
  "Fries + 4 zinger burgers + nuggets 8 pcs + 1 club sandwich + cold drink 2.25 Ltr.",
  one(1999),
  "/products/deals/deal-4.webp",
  true,
);
add(
  "deals",
  "Pizza Deal 1",
  "Fries + 1 small pizza + cold drink 350ml.",
  one(650),
  "/products/deals/deal-1.webp",
  true,
);
add(
  "deals",
  "Pizza Deal 2",
  "Fries + 1 small pizza + crispy wings 3 pcs + cold drink 1.5 Ltr.",
  one(950),
  "/products/deals/deal-2.webp",
);
add(
  "deals",
  "Pizza Deal 3",
  "Fries + 1 medium pizza + crispy wings 6 pcs + cold drink 1 Ltr.",
  one(1550),
  "/products/deals/deal-3.webp",
  true,
);
add(
  "deals",
  "Pizza Deal 4",
  "Fries + 1 large pizza + 1 club sandwich + crispy wings 6 pcs + cold drink 1.5 Ltr.",
  one(2150),
  "/products/deals/deal-4.webp",
  true,
);
add(
  "deals",
  "Pizza Deal 5",
  "1 xl pizza + spin roll 4 pcs + alfredo pasta + nuggets 6 pcs + wings 6 pcs + cold drink 2.25 Ltr.",
  one(3750),
  "/products/deals/deal-5.webp",
  true,
);

// —— Shawarma ——
add("shawarma", "Shawarma", "Classic shawarma.", one(150), "/products/rolls/tika.webp");
add("shawarma", "Special Shawarma", "Special shawarma.", one(250), "/products/rolls/malai-boti.webp", true);
add("shawarma", "Zinger Shawarma", "Crispy zinger shawarma.", one(280), "/products/rolls/twister-patty.webp");
add("shawarma", "Malai Boti Shawarma", "Malai boti shawarma.", one(350), "/products/rolls/malai-boti.webp", true);
add("shawarma", "Platter Shawarma", "Shawarma platter.", one(300), "/products/rolls/shahi.webp");
add("shawarma", "Pizza Shawarma", "Pizza-style shawarma.", one(450), "/products/rolls/totla.webp");
add("shawarma", "Turkish Shawarma", "Turkish-style shawarma.", one(500), "/products/rolls/arabic.webp", true);

// —— Spin Roll ——
add("spin-roll", "Kabab Roll", "Kabab spin roll.", one(400), "/products/rolls/spin.webp", true);
add("spin-roll", "Behari Roll", "Behari spin roll.", one(430), "/products/rolls/bihari.webp");
add("spin-roll", "Garlic Roll", "Garlic spin roll.", one(450), "/products/rolls/spin.webp");
add("spin-roll", "Malai Boti Roll", "Malai boti spin roll.", one(450), "/products/rolls/malai-boti.webp", true);
add("spin-roll", "Cheese Roll", "Cheese spin roll.", one(500), "/products/rolls/spin.webp");

// —— Paratha Roll ——
add("paratha-roll", "Chicken Paratha Roll", "Chicken paratha roll.", one(300), "/products/rolls/chicken-patty.webp", true);
add("paratha-roll", "Twister Roll", "Twister paratha roll.", one(350), "/products/rolls/twister-patty.webp");
add("paratha-roll", "Kabab Paratha Roll", "Kabab paratha roll.", one(300), "/products/rolls/chapli.webp");
add("paratha-roll", "Malai Boti Paratha Roll", "Malai boti paratha roll.", one(350), "/products/rolls/malai-boti.webp");
add("paratha-roll", "Cheese Paratha Roll", "Cheese paratha roll.", one(350), "/products/rolls/chicken-patty.webp");
add("paratha-roll", "Pizza Paratha Roll", "Pizza paratha roll.", one(400), "/products/rolls/totla.webp");

// —— Tortilla Wraps ——
add("tortilla-wraps", "Zinger Wrap", "Zinger tortilla wrap.", one(400), "/products/rolls/kruncher-raps.webp", true);
add("tortilla-wraps", "Malai Boti Wrap", "Malai boti wrap.", one(450), "/products/rolls/malai-boti.webp");
add("tortilla-wraps", "Grill Wrap", "Grill wrap.", one(450), "/products/rolls/chicken-raps.webp");
add("tortilla-wraps", "Arabic Wrap", "Arabic wrap.", one(450), "/products/rolls/arabic.webp", true);

// —— Burgers ——
add("burgers", "Shami Burger", "Shami burger.", one(120), "/products/burgers/chicken-patty.webp");
add("burgers", "Double Anda Burger", "Double egg burger.", one(150), "/products/burgers/chicken-patty.webp");
add("burgers", "Chicken Burger", "Chicken burger.", one(180), "/products/burgers/chicken-patty.webp");
add("burgers", "Patty Burger", "Chicken patty burger.", one(200), "/products/burgers/chicken-patty.webp");
add("burgers", "Crispy Burger", "Crispy burger.", one(250), "/products/burgers/jalapeno-zinger.webp");
add("burgers", "Tikka Burger", "Chicken tikka burger.", one(280), "/products/burgers/tikka.webp");
add("burgers", "Zinger Burger", "Crispy zinger burger.", one(280), "/products/burgers/zinger.webp", true);
add("burgers", "Mighty Burger", "Mighty burger (Mayte on printed menu).", one(300), "/products/burgers/mighty-zinger.webp", true);
add("burgers", "Chapli Burger", "Chapli burger.", one(400), "/products/burgers/chapli.webp");
add("burgers", "Pizza Burger", "Pizza burger.", one(450), "/products/burgers/pizza.webp");
add("burgers", "Tower Burger", "Tower burger.", one(500), "/products/burgers/mighty-zinger.webp", true);
add("burgers", "Grill Burger", "Grill burger.", one(500), "/products/burgers/tikka.webp");

// —— Sandwiches ——
add("sandwiches", "Chicken Sandwich", "Chicken sandwich.", one(380), "/products/sandwiches/bbq.webp");
add("sandwiches", "Special Sandwich", "Special sandwich.", one(430), "/products/sandwiches/kruncher-salad.webp");
add("sandwiches", "Grill Sandwich", "Grill sandwich.", one(450), "/products/sandwiches/bbq.webp", true);
add("sandwiches", "Tikka Sandwich", "Tikka sandwich.", one(450), "/products/sandwiches/bbq.webp");
add("sandwiches", "Fajita Sandwich", "Fajita sandwich.", one(450), "/products/sandwiches/mexican.webp");
add("sandwiches", "Club Sandwich", "Club sandwich.", one(500), "/products/sandwiches/kruncher-salad.webp", true);
add("sandwiches", "Crispy Nachos", "Crispy nachos (listed with sandwiches).", one(650), ph);
add("sandwiches", "Mexican Sandwich", "Mexican sandwich.", one(700), "/products/sandwiches/mexican.webp", true);
add("sandwiches", "Crunch Sandwich", "Crunch sandwich.", one(750), "/products/sandwiches/kruncher-salad.webp");
add("sandwiches", "Musa Special Sandwich", "Musa Cafe signature sandwich.", one(1199), "/products/sandwiches/mexican.webp", true);

// —— Regular Pizza ——
add("standard-pizza", "CH-Tikka Pizza", "Chicken tikka pizza.", REG_PIZZA, "/products/pizzas/chicken-tika.webp", true);
add("standard-pizza", "CH-Fajita Pizza", "Chicken fajita pizza.", REG_PIZZA, "/products/pizzas/chicken-fajita.webp", true);
add("standard-pizza", "CH-Lover Pizza", "Chicken lover pizza.", REG_PIZZA_LOVER, "/products/pizzas/chicken-lover.webp");
add("standard-pizza", "CH-Tandoori Pizza", "Chicken tandoori pizza.", REG_PIZZA_LOVER, "/products/pizzas/mughlai.webp");
add("standard-pizza", "CH-Supreme Pizza", "Chicken supreme pizza.", REG_PIZZA_LOVER, "/products/pizzas/fifty-fifty.webp");
add("standard-pizza", "BAR-B-Q Pizza", "BBQ pizza.", REG_PIZZA_BBQ, "/products/pizzas/bbq-pizza.webp", true);
add("standard-pizza", "VEG Lover Pizza", "Vegetable lover pizza.", REG_PIZZA_VEG, "/products/pizzas/vege-lover.webp");
add("standard-pizza", "Hot & Spicy Pizza", "Hot and spicy pizza.", REG_PIZZA_BBQ, "/products/pizzas/hot-and-spicy.webp");

// —— Special Pizza ——
add("special-pizza", "Malai Boti Pizza", "Malai boti special pizza.", SPEC_PIZZA, "/products/pizzas/legend-malai.webp", true);
add("special-pizza", "Behari Kabab Pizza", "Behari kabab pizza.", SPEC_PIZZA, "/products/pizzas/bihari-kabab.webp");
add("special-pizza", "Legend Malai Pizza", "Legend malai pizza.", SPEC_PIZZA, "/products/pizzas/legend-malai.webp", true);
add("special-pizza", "Peri Peri Pizza", "Peri peri pizza.", SPEC_PIZZA, "/products/pizzas/hot-and-spicy.webp");
add("special-pizza", "Lazania Pizza", "Lazania pizza.", SPEC_PIZZA, "/products/pizzas/lazania.webp");

// —— Stuffed & Crust ——
add("stuffed-crust-pizza", "Crown Crust Pizza", "Crown crust pizza.", CRUST_PIZZA, "/products/pizzas/crown-crush.webp", true);
add("stuffed-crust-pizza", "Kabab Crust Pizza", "Kabab crust pizza.", CRUST_PIZZA, "/products/pizzas/kababish.webp");
add("stuffed-crust-pizza", "Royal Crust Pizza", "Royal crust pizza.", CRUST_PIZZA, "/products/pizzas/rose-crown.webp");
add("stuffed-crust-pizza", "Kabab Stuff Pizza", "Kabab stuffed pizza.", CRUST_PIZZA, "/products/pizzas/kabab-stuff.webp", true);
add("stuffed-crust-pizza", "Cheese Stuff Pizza", "Cheese stuffed pizza.", CRUST_PIZZA, "/products/pizzas/chicken-lover.webp");
add(
  "stuffed-crust-pizza",
  "Double Layer Pizza",
  "Double layer pizza.",
  [
    { name: "Medium", price: 1399 },
    { name: "Large", price: 1650 },
    { name: "XL", price: 2250 },
  ],
  "/products/pizzas/kelazone.webp",
  true,
);
add(
  "stuffed-crust-pizza",
  "Musa Special Pizza",
  "Musa Cafe signature pizza.",
  [
    { name: "Large", price: 1900 },
    { name: "XL", price: 2400 },
  ],
  "/products/pizzas/krunchies-special.webp",
  true,
);

// —— Fried ——
add("fried", "Nuggets", "Chicken nuggets (6 pcs).", one(280), "/products/fried-chicken/chicken-nuggets.webp", true);
add("fried", "Hot Wings", "Hot wings (6 pcs).", one(300), "/products/fried-chicken/hot-wings.webp", true);
add("fried", "Crispy Wings", "Crispy wings (6 pcs).", one(300), "/products/fried-chicken/bbq-wings.webp");
add("fried", "Oven Baked Wing", "Oven baked wings (3 pcs).", one(350), "/products/fried-chicken/bbq-wings.webp");
add("fried", "Hot Shot", "Hot shots (10 pcs).", one(400), "/products/fried-chicken/hotshots.webp");
add("fried", "Drumsticks", "Chicken drumsticks (3 pcs).", one(450), "/products/fried-chicken/chicken-drum.webp");

// —— Fries ——
add("fries", "French Fries", "Salted french fries.", smLg(150, 280), "/products/fries/salted.webp", true);
add("fries", "Masala Fries", "Masala fries.", smLg(150, 280), "/products/fries/masala.webp");
add("fries", "Mayo Fries", "Mayo fries.", smLg(150, 280), "/products/fries/salted.webp");
add("fries", "Loaded Fries", "Loaded fries.", smLg(400, 500), "/products/fries/loaded.webp", true);
add("fries", "Matka Fries", "Matka fries.", one(450), "/products/fries/loaded.webp");
add("fries", "Pizza Fries", "Pizza fries.", one(450), "/products/fries/pizza.webp", true);

// —— Pasta ——
add("pasta", "Macaroni Pasta", "Macaroni pasta.", smLg(300, 550), "/products/pasta/spegiti.webp");
add("pasta", "Creamy Pasta", "Creamy pasta.", smLg(300, 550), "/products/pasta/creamy.webp", true);
add("pasta", "Crispy Pasta", "Crispy pasta.", smLg(300, 550), "/products/pasta/chicken.webp");
add("pasta", "Alfredo Pasta", "Alfredo pasta.", smLg(300, 550), "/products/pasta/creamy.webp", true);
add("pasta", "Loaded Pasta", "Loaded pasta.", smLg(300, 550), "/products/pasta/loaded.webp");
add("pasta", "Oven Baked Pasta", "Oven baked pasta.", smLg(300, 550), "/products/pasta/kala-mada.webp");

// —— Broast ——
add("broast", "Broast Leg", "Broast leg piece.", one(300), "/products/fried-chicken/chicken-drum.webp", true);
add("broast", "Broast Chest", "Broast chest piece.", one(400), "/products/fried-chicken/chicken-drum.webp");
add("broast", "Fried Chicken", "Fried chicken (3 pcs).", one(700), "/products/fried-chicken/chicken-drum.webp", true);
add("broast", "Full Chargha", "Full chargha.", one(1500), "/products/fried-chicken/chicken-drum.webp", true);

// —— Salad Bar ——
add("salad-bar", "Dahi Bhalla", "Dahi bhalla.", one(150), "/products/salad-bar/dahi-bhalla.webp");
add("salad-bar", "Musa Special Dahi Bhalla", "Musa special dahi bhalla.", one(200), "/products/salad-bar/dahi-bhalla.webp", true);
add("salad-bar", "Gol Gappay 6 PCS", "Gol gappay (6 pcs).", one(120), "/products/salad-bar/gol-gappay.webp");
add("salad-bar", "Gol Gappay 12 PCS", "Gol gappay (12 pcs).", one(240), "/products/salad-bar/gol-gappay.webp");
add("salad-bar", "Chana Chat", "Chana chat.", one(200), "/products/salad-bar/chana-chat.webp");
add("salad-bar", "Fruit Chat", "Fruit chat.", one(250), "/products/salad-bar/fruit-chat.webp");
add("salad-bar", "Cream Chat", "Cream chat.", one(300), "/products/salad-bar/cream-chat.webp");
add("salad-bar", "Russian Salad", "Russian salad.", one(400), "/products/salad-bar/russian-salad.webp", true);

// —— Shakes ——
add("shakes", "Mint Margarita", "Mint margarita.", one(180), "/products/shakes/mint-margretta.webp", true);
add("shakes", "Apple Shake", "Apple shake.", one(180), "/products/shakes/apple-shake.webp");
add("shakes", "Banana Shake", "Banana shake.", one(180), "/products/shakes/banana-shake.webp");
add("shakes", "Mango Shake", "Mango shake.", one(180), "/products/shakes/mango-shake.webp", true);
add("shakes", "Lemonade", "Fresh lemonade.", one(100), "/products/shakes/lemonade.webp");
add("shakes", "Blue Berry", "Blueberry shake.", one(250), "/products/shakes/blue-berry.webp");
add("shakes", "Caramel Shake", "Caramel shake.", one(250), "/products/shakes/caramel.webp");
add("shakes", "Strawberry Shake", "Strawberry shake.", one(250), "/products/shakes/strawberry.webp");
add("shakes", "Pink Lady", "Pink lady shake.", one(250), "/products/shakes/pink-lady.webp");
add("shakes", "Vanilla Shake", "Vanilla shake.", one(200), "/products/shakes/ice-cream-shake.webp");
add("shakes", "Ice Cream Shake", "Ice cream shake.", one(200), "/products/shakes/ice-cream-shake.webp");
add("shakes", "Oreo Shake", "Oreo shake.", one(200), "/products/shakes/oreo.webp");
add("shakes", "Khoya Khajoor", "Khoya khajoor shake.", one(280), "/products/shakes/khoya-khajoor.webp", true);
add("shakes", "Pina Colada", "Pina colada.", one(350), "/products/shakes/pino-colaudo.webp");
add("shakes", "Power Shake", "Power shake.", one(400), "/products/shakes/apple-banana.webp");
add("shakes", "Mix Dry Fruit", "Mix dry fruit shake.", one(400), "/products/shakes/khajoor-shake.webp", true);

// —— Ice Cream ——
add(
  "ice-cream",
  "Ice Cream Scoop",
  "Per scoop — Kulfa, Mango, Pista, Chocolate, Strawberry.",
  [
    { name: "Kulfa", price: 80 },
    { name: "Mango", price: 80 },
    { name: "Pista", price: 80 },
    { name: "Chocolate", price: 80 },
    { name: "Strawberry", price: 80 },
  ],
  "/products/shakes/ice-cream-shake.webp",
  true,
);
add("ice-cream", "Half Litre Ice Cream", "Half litre ice cream.", one(250), "/products/shakes/ice-cream-shake.webp");
add("ice-cream", "Full Litre Ice Cream", "Full litre ice cream.", one(450), "/products/shakes/ice-cream-shake.webp");
add("ice-cream", "Rabri Bottle", "Rabri bottle.", one(200), "/products/ice-cream/rabri-bottle.webp");
add("ice-cream", "Rabri Dodh", "Rabri dodh.", one(200), "/products/ice-cream/rabri-dodh.webp");

// —— Cold Drinks ——
add(
  "cold-drinks",
  "Soft Drink",
  "Bottled soft drink — choose flavour at checkout.",
  [
    { name: "500ml", price: 120 },
    { name: "1 Ltr", price: 200 },
    { name: "1.5 Ltr", price: 250 },
    { name: "2.25 Ltr", price: 300 },
  ],
  "/products/cold-drinks/soft-drink.webp",
  true,
);
add("cold-drinks", "Mineral Water Small", "Small mineral water.", one(80), "/products/cold-drinks/mineral-water-small.webp");
add("cold-drinks", "Mineral Water Large", "Large mineral water.", one(150), "/products/cold-drinks/mineral-water-large.webp");

// —— Musa Specials ——
add("musa-specials", "Tea", "Hot tea.", one(50), "/products/musa-specials/tea.webp", true);
add("musa-specials", "Samosa", "Samosa.", one(30), "/products/musa-specials/samosa.webp", true);

const menu = {
  restaurant: {
    name: "Musa Cafe",
    tagline: "Taste With Quality",
    phone: "03095997786",
    alternatePhone: "",
    whatsapp: "923095997786",
    openingTime: "10:00 AM",
    closingTime: "12:00 AM",
    currency: "Rs",
    address: "Waan Wala Pul, Musa Khel",
    deliveryNote: "Express delivery available — call now",
    thankYouNote: "THANK YOU FOR CHOOSING MUSA CAFE!",
  },
  promotions: [],
  notes: [
    "Menu taken from Musa Cafe Pizza Hut printed flyers (Waan Wala Pul, Musa Khel).",
    "Mighty Burger matches printed 'Mayte Burger'. Crispy Nachos listed under Sandwiches as on the flyer.",
    "Crispy Nachos still needs a product photo (placeholder).",
  ],
  locations: [
    {
      id: "50000000-0000-4000-8000-000000000000",
      name: "In Store (Walk-in)",
      deliveryCharge: 0,
    },
    {
      id: "50000000-0000-4000-8000-000000000001",
      name: "Local Delivery",
      deliveryCharge: 0,
    },
  ],
  categories,
  products,
};

writeFileSync(join(root, "shared", "menu.json"), `${JSON.stringify(menu, null, 2)}\n`);
writeFileSync(join(root, "website", "src", "data", "menu.json"), `${JSON.stringify(menu, null, 2)}\n`);
writeFileSync(join(root, "pos", "src", "data", "menu.json"), `${JSON.stringify(menu, null, 2)}\n`);
const shopSrc = join(root, "shared", "shop.json");
copyFileSync(shopSrc, join(root, "website", "src", "data", "shop.json"));
copyFileSync(shopSrc, join(root, "pos", "src", "data", "shop.json"));
copyFileSync(shopSrc, join(root, "admin", "src", "data", "shop.json"));
console.log(
  `Wrote Musa Cafe menu (${products.length} products, ${categories.length} categories)`,
);
console.log("Copied shared/shop.json into website, pos, and admin.");
