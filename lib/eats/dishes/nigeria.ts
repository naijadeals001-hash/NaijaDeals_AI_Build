/**
 * Nigerian dish catalogue.
 *
 * Each entry is a documented dish with its local name, the country it belongs
 * to, a dish category that matches the storefront rails, and search keywords.
 * Descriptions are factual and deliberately short — they describe what the dish
 * is, not a restaurant's marketing copy.
 */
import type { DocumentedDish } from "./types";

export const NIGERIAN_DISHES: DocumentedDish[] = [
  // Rice
  { slug: "jollof-rice", name: "Jollof Rice", localNames: ["Jollof"], country: "NG", cuisine: "nigerian", category: "jollof-rice", description: "Tomato-and-pepper rice simmered in one pot with a smoky base.", ingredients: ["rice", "tomato", "red pepper", "onion", "seasoning"], keywords: ["jollof", "party rice"] },
  { slug: "party-jollof", name: "Party Jollof", localNames: ["Firewood jollof"], country: "NG", cuisine: "nigerian", category: "jollof-rice", description: "Jollof cooked over firewood in large batches, giving a smoky flavour.", ingredients: ["rice", "tomato", "pepper", "smoke"], keywords: ["party jollof", "smoky"] },
  { slug: "fried-rice", name: "Nigerian Fried Rice", country: "NG", cuisine: "nigerian", category: "rice-dishes", description: "Rice stir-fried with vegetables, liver and curry-style seasoning.", ingredients: ["rice", "carrot", "peas", "sweetcorn", "liver"], keywords: ["fried rice"] },
  { slug: "coconut-rice", name: "Coconut Rice", country: "NG", cuisine: "nigerian", category: "rice-dishes", description: "Rice cooked in coconut milk with peppers and dried fish.", ingredients: ["rice", "coconut milk", "pepper", "fish"] },
  { slug: "ofada-rice", name: "Ofada Rice", country: "NG", cuisine: "nigerian", category: "rice-dishes", description: "Unpolished local rice served with ayamase (green pepper) stew.", ingredients: ["ofada rice", "palm oil", "green pepper", "assorted meat"], keywords: ["ofada", "ayamase"] },
  { slug: "native-rice", name: "Native Rice", localNames: ["Palm oil rice"], country: "NG", cuisine: "nigerian", category: "rice-dishes", description: "Rice cooked down with palm oil, smoked fish and local spices.", ingredients: ["rice", "palm oil", "smoked fish", "crayfish"] },
  { slug: "asunarice-bowl", name: "Asun Rice Bowl", country: "NG", cuisine: "nigerian", category: "rice-dishes", description: "Peppered goat meat served over rice.", ingredients: ["rice", "goat meat", "pepper", "onion"] },
  { slug: "tuwo-shinkafa", name: "Tuwo Shinkafa", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Northern rice pudding swallow eaten with miyan kuka or taushe.", ingredients: ["rice flour"], keywords: ["tuwo", "northern swallow"] },

  // Swallows and soups
  { slug: "egusi-soup", name: "Egusi Soup", localNames: ["Melon soup"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Thick soup of ground melon seeds, leafy greens and palm oil.", ingredients: ["melon seeds", "spinach", "palm oil", "assorted meat"], allergens: ["nuts"] },
  { slug: "efo-riro", name: "Efo Riro", country: "NG", cuisine: "nigerian", category: "stews", description: "Yoruba spinach stew with peppers, palm oil and assorted meat.", ingredients: ["spinach", "palm oil", "pepper", "locust bean"], keywords: ["efo", "spinach stew"] },
  { slug: "edikang-ikong", name: "Edikang Ikong", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Efik soup of waterleaf and ugu with dried fish and periwinkle.", ingredients: ["waterleaf", "ugwu", "dried fish", "periwinkle"], keywords: ["edikang ikong"] },
  { slug: "afang-soup", name: "Afang Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Afang leaf soup with waterleaf, dried fish and meat.", ingredients: ["afang leaves", "waterleaf", "fish", "palm oil"] },
  { slug: "ogbono-soup", name: "Ogbono Soup", localNames: ["Draw soup"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Draw soup made from wild mango seed with meat and fish.", ingredients: ["ogbono seed", "palm oil", "meat", "fish"] },
  { slug: "okra-soup", name: "Okra Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Fresh okra cooked down into a viscous soup with fish or meat.", ingredients: ["okra", "palm oil", "fish"] },
  { slug: "oha-soup", name: "Oha Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Igbo soup of oha leaves with cocoyam thickener and assorted meat.", ingredients: ["oha leaves", "cocoyam", "assorted meat"] },
  { slug: "bitterleaf-soup", name: "Bitterleaf Soup", localNames: ["Ofe Onugbu"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Washed bitterleaf soup with cocoyam and meat.", ingredients: ["bitterleaf", "cocoyam", "palm oil", "meat"] },
  { slug: "banga-soup", name: "Banga Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Delta palm-fruit soup spiced with beletete leaves and catfish.", ingredients: ["palm fruit", "beletete", "catfish"] },
  { slug: "nsala-soup", name: "Nsala Soup", localNames: ["White soup"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Pale Igbo soup of catfish with utazi and no palm oil.", ingredients: ["catfish", "utazi", "yam thickener"] },
  { slug: "fufu", name: "Fufu", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Pounded cassava swallow served with soups.", ingredients: ["cassava"] },
  { slug: "pounded-yam", name: "Pounded Yam", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Smooth pounded yam swallow.", ingredients: ["yam"] },
  { slug: "amala", name: "Amala", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Yoruba swallow made from dried yam flour.", ingredients: ["yam flour"], keywords: ["amala", "elubo"] },
  { slug: "eba", name: "Eba", localNames: ["Garri"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Cassava garri swallow.", ingredients: ["garri"] },
  { slug: "semovita", name: "Semovita", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Semolina-style swallow served with soups.", ingredients: ["semolina"] },
  { slug: "wheat-swallow", name: "Wheat Swallow", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Wholewheat swallow, often chosen as a lower-carb option.", ingredients: ["wheat"] },
  { slug: "abula", name: "Abula", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Combination of gbegiri, ewedu and stew, eaten with amala.", ingredients: ["beans", "ewedu", "stew"], keywords: ["abula", "gbegiri ewedu"] },
  { slug: "gbegiri", name: "Gbegiri Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Yoruba bean soup cooked smooth with palm oil.", ingredients: ["beans", "palm oil"] },
  { slug: "ewedu", name: "Ewedu Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Jute leaf soup blended drawn.", ingredients: ["ewedu leaves"] },

  // Grills, pepper soup and meats
  { slug: "suya", name: "Suya", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Spiced grilled beef skewers with yaji pepper and onion.", ingredients: ["beef", "yaji spice", "onion"], allergens: ["peanuts"] },
  { slug: "kilishi", name: "Kilishi", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Thin dried spiced beef strips from northern Nigeria.", ingredients: ["beef", "spice paste"], allergens: ["peanuts"] },
  { slug: "asun", name: "Asun", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Peppered goat meat grilled and tossed in scotch bonnet.", ingredients: ["goat meat", "scotch bonnet", "onion"] },
  { slug: "nkwobi", name: "Nkwobi", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Spiced cow foot in palm oil, utazi and potash emulsion.", ingredients: ["cow foot", "palm oil", "utazi"] },
  { slug: "isi-ewu", name: "Isi Ewu", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Spiced goat head, the goat counterpart to nkwobi.", ingredients: ["goat head", "palm oil", "utazi"] },
  { slug: "pepper-soup", name: "Pepper Soup", country: "NG", cuisine: "nigerian", category: "pepper-soup", description: "Thin, peppery broth with meat or fish and local spices.", ingredients: ["pepper", "spice blend", "meat or fish"] },
  { slug: "peppered-goat-meat", name: "Peppered Goat Meat", country: "NG", cuisine: "nigerian", category: "pepper-soup", description: "Goat meat stewed in a hot pepper sauce.", ingredients: ["goat meat", "pepper", "onion"] },
  { slug: "grilled-tilapia", name: "Grilled Tilapia", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Whole tilapia grilled with pepper and served with plantain.", ingredients: ["tilapia", "pepper", "plantain"], allergens: ["fish"] },
  { slug: "beef-suya-wrap", name: "Beef Suya Wrap", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Suya strips wrapped in flatbread with onions and tomato.", ingredients: ["beef", "flatbread", "onion"], allergens: ["peanuts", "gluten"] },

  // Snacks and breakfast
  { slug: "akara", name: "Akara", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Deep-fried bean cakes.", ingredients: ["peeled beans", "onion", "palm oil"] },
  { slug: "moi-moi", name: "Moi Moi", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Steamed bean pudding with pepper and fish or egg.", ingredients: ["beans", "pepper", "egg"] },
  { slug: "puff-puff", name: "Puff-Puff", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Sweet fried dough balls.", ingredients: ["flour", "sugar", "yeast"], allergens: ["gluten"] },
  { slug: "buns", name: "Buns", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Fried sweet dough, firmer than puff-puff.", ingredients: ["flour", "sugar"], allergens: ["gluten"] },
  { slug: "masa", name: "Masa", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Northern fermented rice cakes, pan-fried.", ingredients: ["rice", "yeast"] },
  { slug: "kosai", name: "Kosai", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Northern fried bean cakes, similar to akara.", ingredients: ["beans", "pepper"] },
  { slug: "nigerian-breakfast", name: "Nigerian Breakfast Plate", country: "NG", cuisine: "nigerian", category: "breakfast", description: "Akara, fried yam, scrambled eggs and tea.", ingredients: ["beans", "yam", "egg", "tea"] },
  { slug: "boli", name: "Boli", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Roasted plantain served with groundnut.", ingredients: ["plantain", "groundnut"], allergens: ["peanuts"] },
  { slug: "roasted-corn", name: "Roasted Corn", localNames: ["Epa"], country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Charcoal-roasted maize, often sold with coconut.", ingredients: ["maize"] },
  { slug: "yam-porridge", name: "Yam Porridge", localNames: ["Asaro"], country: "NG", cuisine: "nigerian", category: "stews", description: "Yam simmered in pepper and palm oil until soft.", ingredients: ["yam", "palm oil", "pepper"] },
  { slug: "beans-porridge", name: "Beans Porridge", localNames: ["Ewa agoyin style"], country: "NG", cuisine: "nigerian", category: "stews", description: "Slow-cooked beans stew with pepper and onion.", ingredients: ["beans", "pepper", "palm oil"] },
  { slug: "dodo", name: "Dodo", localNames: ["Fried Plantain"], country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Ripe plantain fried until caramelised.", ingredients: ["plantain"] },

  // Salads, drinks and desserts
  { slug: "nigerian-salad", name: "Nigerian Salad", country: "NG", cuisine: "nigerian", category: "salads-healthy", description: "Cabbage, carrot, cucumber and egg salad with dressing.", ingredients: ["cabbage", "carrot", "egg"] },
  { slug: "zobo", name: "Zobo", country: "NG", cuisine: "nigerian", category: "drinks", description: "Hibiscus drink with ginger and pineapple.", ingredients: ["hibiscus", "ginger"] },
  { slug: "chapman", name: "Chapman", country: "NG", cuisine: "nigerian", category: "drinks", description: "Red mocktail with bitters, citrus and cucumber.", ingredients: ["juice", "bitters", "cucumber"] },
  { slug: "kunu", name: "Kunu", country: "NG", cuisine: "nigerian", category: "drinks", description: "Northern millet or sorghum drink.", ingredients: ["millet"] },
  { slug: "palm-wine", name: "Palm Wine", country: "NG", cuisine: "nigerian", category: "drinks", description: "Fermented palm sap served fresh.", ingredients: ["palm sap"], allergens: ["alcohol"] },
  { slug: "chin-chin", name: "Chin Chin", country: "NG", cuisine: "nigerian", category: "desserts", description: "Crunchy fried pastry cubes.", ingredients: ["flour", "sugar", "milk"], allergens: ["gluten", "milk"] },
  { slug: "puff-puff-dessert", name: "Coconut Candy", country: "NG", cuisine: "nigerian", category: "desserts", description: "Caramelised coconut sweets.", ingredients: ["coconut", "sugar"] },
  { slug: "akamu", name: "Akamu", localNames: ["Pap"], country: "NG", cuisine: "nigerian", category: "breakfast", description: "Fermented corn pap served with milk and sugar.", ingredients: ["maize", "milk"], allergens: ["milk"] },

  { slug: "ofe-nsala-utazi", name: "Utazi Soup", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Peppery soup seasoned with utazi leaves.", ingredients: ["utazi", "fish", "pepper"] },
  { slug: "mpon-ikong", name: "Mfi Ng'oko", localNames: ["Pumpkin seed soup"], country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Efik pumpkin-seed soup with leaves and meat.", ingredients: ["pumpkin seeds", "palm oil", "meat"] },
  { slug: "akidi", name: "Akidi", country: "NG", cuisine: "nigerian", category: "stews", description: "Igbo black bean stew cooked with palm oil.", ingredients: ["black beans", "palm oil"] },
  { slug: "ewedi", name: "Ofe Nsala Fish", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Catfish white soup with utazi and yam.", ingredients: ["catfish", "yam"], allergens: ["fish"] },
  { slug: "tuwon-dawa", name: "Tuwon Dawa", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Northern guinea-corn swallow.", ingredients: ["guinea corn"] },
  { slug: "fura-da-nunu", name: "Fura da Nono", country: "NG", cuisine: "nigerian", category: "drinks", description: "Millet balls in soured milk, a northern drink.", ingredients: ["millet", "milk"], allergens: ["milk"] },
  { slug: "kilishi-pepper", name: "Peppered Kilishi", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Spiced dried beef snack with extra pepper.", ingredients: ["beef", "pepper"], allergens: ["peanuts"] },
  { slug: "balangu", name: "Balangu", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Northern roasted ram meat, grilled with spice.", ingredients: ["ram meat", "spices"] },
  { slug: "dan-wake", name: "Dan Wake", country: "NG", cuisine: "nigerian", category: "swallows-and-soups", description: "Northern bean-flour dumplings in pepper sauce.", ingredients: ["beans", "pepper"] },
  { slug: "peppered-gizzard", name: "Peppered Gizzard", country: "NG", cuisine: "nigerian", category: "grills-bbq", description: "Chicken gizzard tossed in pepper sauce.", ingredients: ["gizzard", "pepper"] },
  { slug: "kuli-kuli", name: "Kuli Kuli", country: "NG", cuisine: "nigerian", category: "akara-snacks", description: "Fried groundnut paste snack.", ingredients: ["groundnut"], allergens: ["peanuts"] },
  { slug: "shuku-shuku", name: "Shuku Shuku", country: "NG", cuisine: "nigerian", category: "desserts", description: "Coconut and milk sweet balls.", ingredients: ["coconut", "milk"], allergens: ["milk"] }
];
