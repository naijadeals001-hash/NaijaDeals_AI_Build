/**
 * West African dishes outside Nigeria: Ghanaian, Senegalese, Ivorian,
 * Beninese, Togolese, Gambian, Liberian and Sierra Leonean traditions.
 */
import type { DocumentedDish } from "./types";

export const WEST_AFRICAN_DISHES: DocumentedDish[] = [
  // Ghana
  { slug: "waakye", name: "Waakye", country: "GH", cuisine: "west-african", category: "rice-dishes", description: "Rice and beans cooked together with sorghum leaves, served with stew and egg.", ingredients: ["rice", "beans", "sorghum leaves"], keywords: ["waakye", "ghana"] },
  { slug: "banku", name: "Banku", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Fermented corn and cassava dough swallow, usually with tilapia.", ingredients: ["maize", "cassava"] },
  { slug: "kenkey", name: "Kenkey", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Steamed fermented maize dough wrapped in leaves.", ingredients: ["maize"] },
  { slug: "red-red", name: "Red Red", country: "GH", cuisine: "west-african", category: "stews", description: "Fried bean stew with palm oil, served with fried plantain.", ingredients: ["beans", "palm oil", "plantain"] },
  { slug: "fufu-light-soup", name: "Fufu and Light Soup", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Pounded cassava and plantain fufu with a clear spicy soup.", ingredients: ["cassava", "plantain", "tomato"] },
  { slug: "groundnut-soup-gh", name: "Groundnut Soup", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Peanut-based soup with chicken or goat.", ingredients: ["groundnut", "chicken"], allergens: ["peanuts"] },
  { slug: "jollof-gh", name: "Ghanaian Jollof", country: "GH", cuisine: "west-african", category: "jollof-rice", description: "Ghanaian jollof rice with a lighter, separately-cooked style.", ingredients: ["rice", "tomato", "pepper"] },
  { slug: "kelewele", name: "Kelewele", country: "GH", cuisine: "west-african", category: "akara-snacks", description: "Spiced fried plantain cubes.", ingredients: ["plantain", "ginger", "pepper"] },
  { slug: "gari-and-beans", name: "Gari and Beans", localNames: ["Gob3"], country: "GH", cuisine: "west-african", category: "stews", description: "Cassava gari with bean stew and palm oil.", ingredients: ["gari", "beans", "palm oil"] },
  { slug: "tilapia-banku", name: "Grilled Tilapia with Banku", country: "GH", cuisine: "west-african", category: "grills-bbq", description: "Whole grilled tilapia with banku and pepper.", ingredients: ["tilapia", "maize", "pepper"], allergens: ["fish"] },
  { slug: "kontomire-stew", name: "Kontomire Stew", localNames: ["Palava sauce"], country: "GH", cuisine: "west-african", category: "stews", description: "Cocoyam leaf stew with palm oil and fish.", ingredients: ["cocoyam leaves", "palm oil", "fish"] },
  { slug: "fante-fante", name: "Fante Fante", country: "GH", cuisine: "west-african", category: "stews", description: "Coastal fish stew with palm oil and small fish.", ingredients: ["fish", "palm oil", "tomato"], allergens: ["fish"] },
  // Senegal
  { slug: "thieboudienne", name: "Thieboudienne", localNames: ["Ceebu Jën"], country: "SN", cuisine: "west-african", category: "rice-dishes", description: "Senegalese fish and rice cooked in tomato, the national dish.", ingredients: ["rice", "fish", "tomato", "vegetables"], allergens: ["fish"] },
  { slug: "yassa-poulet", name: "Yassa Poulet", country: "SN", cuisine: "west-african", category: "grills-bbq", description: "Chicken with onion and lemon Yassa sauce.", ingredients: ["chicken", "onion", "lemon", "mustard"] },
  { slug: "mafe", name: "Mafé", country: "SN", cuisine: "west-african", category: "stews", description: "Peanut stew with lamb or beef over rice.", ingredients: ["peanut", "meat", "rice"], allergens: ["peanuts"] },
  { slug: "thiakry", name: "Thiakry", country: "SN", cuisine: "west-african", category: "desserts", description: "Sweet millet couscous dessert with milk.", ingredients: ["millet", "milk"], allergens: ["milk"] },
  { slug: "accara", name: "Accara", country: "SN", cuisine: "west-african", category: "akara-snacks", description: "Senegalese black-eyed pea fritters.", ingredients: ["black-eyed peas", "onion"] },
  // Côte d'Ivoire
  { slug: "attieke", name: "Attiéké with Grilled Fish", country: "CI", cuisine: "west-african", category: "grills-bbq", description: "Fermented cassava couscous with grilled fish and pepper.", ingredients: ["cassava", "fish", "pepper"], allergens: ["fish"] },
  { slug: "kedjenou", name: "Kedjenou", country: "CI", cuisine: "west-african", category: "stews", description: "Slow-cooked chicken or guinea fowl with tomato and aubergine.", ingredients: ["chicken", "tomato", "aubergine"] },
  { slug: "garba", name: "Garba", country: "CI", cuisine: "west-african", category: "rice-dishes", description: "Ivorian street dish of attiéké with fried tuna.", ingredients: ["attiéké", "tuna", "pepper"], allergens: ["fish"] },
  { slug: "alloco", name: "Alloco", country: "CI", cuisine: "west-african", category: "akara-snacks", description: "Fried ripe plantain with chilli sauce.", ingredients: ["plantain", "chilli"] },
  { slug: "foutou", name: "Foutou", country: "CI", cuisine: "west-african", category: "swallows-and-soups", description: "Pounded cassava and plantain swallow with sauce graine.", ingredients: ["cassava", "plantain"] },
  // Benin and Togo
  { slug: "wagasi", name: "Wagasi", country: "BJ", cuisine: "west-african", category: "grills-bbq", description: "Beninese grilled cheese, often fried and served with pepper.", ingredients: ["cheese"], allergens: ["milk"] },
  { slug: "akassa", name: "Akassa", country: "BJ", cuisine: "west-african", category: "swallows-and-soups", description: "Fermented maize dough swallowed with sauce.", ingredients: ["maize"] },
  { slug: "fufu-togo", name: "Togolese Fufu", country: "TG", cuisine: "west-african", category: "swallows-and-soups", description: "Yam or cassava fufu with peanut sauce.", ingredients: ["yam", "peanut"], allergens: ["peanuts"] },
  // Gambia, Liberia, Sierra Leone
  { slug: "domoda", name: "Domoda", country: "GM", cuisine: "west-african", category: "stews", description: "Gambian groundnut stew with rice.", ingredients: ["peanut", "meat", "rice"], allergens: ["peanuts"] },
  { slug: "benachin", name: "Benachin", country: "GM", cuisine: "west-african", category: "rice-dishes", description: "Gambian one-pot rice with fish or meat and vegetables.", ingredients: ["rice", "fish", "vegetables"] },
  { slug: "plasas", name: "Plasas", country: "SL", cuisine: "west-african", category: "stews", description: "Sierra Leonean leafy green stew with palm oil and fish.", ingredients: ["greens", "palm oil", "fish"] },
  { slug: "cassava-leaf-stew", name: "Cassava Leaf Stew", country: "LR", cuisine: "west-african", category: "stews", description: "Liberian stew of pounded cassava leaves with palm oil and fish.", ingredients: ["cassava leaves", "palm oil", "fish"] },
  { slug: "jollof-ghana-regional", name: "Rice and Stew", country: "GH", cuisine: "west-african", category: "rice-dishes", description: "Plain rice with Ghanaian tomato stew and chicken.", ingredients: ["rice", "tomato", "chicken"] },
  { slug: "pepper-soup-west", name: "West African Pepper Soup", country: "SN", cuisine: "west-african", category: "pepper-soup", description: "Spicy fish or meat broth common across the region.", ingredients: ["pepper", "fish", "spices"], allergens: ["fish"] },
  { slug: "grilled-fish-west", name: "Regional Grilled Fish", country: "SN", cuisine: "west-african", category: "grills-bbq", description: "Whole fish grilled with pepper and lemon.", ingredients: ["fish", "pepper", "lemon"], allergens: ["fish"] },
  { slug: "bissap", name: "Bissap", country: "SN", cuisine: "west-african", category: "drinks", description: "Hibiscus drink sweetened with mint, common in Senegal.", ingredients: ["hibiscus", "mint"] },
  { slug: "ginger-juice", name: "Ginger Juice", country: "GH", cuisine: "west-african", category: "drinks", description: "Spicy sweetened ginger drink.", ingredients: ["ginger", "pineapple"] },
  { slug: "hinlo", name: "Hinlo", country: "SL", cuisine: "west-african", category: "stews", description: "Sierra Leonean mixed vegetable and meat stew.", ingredients: ["vegetables", "meat", "palm oil"] },
  { slug: "fufu-sierra", name: "Sierra Leonean Fufu", country: "SL", cuisine: "west-african", category: "swallows-and-soups", description: "Rice-flour fufu with groundnut soup.", ingredients: ["rice flour", "peanut"], allergens: ["peanuts"] },
  { slug: "groundnut-rice", name: "Groundnut Rice", country: "GM", cuisine: "west-african", category: "rice-dishes", description: "Rice cooked with groundnut sauce and meat.", ingredients: ["rice", "peanut", "meat"], allergens: ["peanuts"] },
  { slug: "poulet-yassa-rice", name: "Yassa Rice", country: "SN", cuisine: "west-african", category: "rice-dishes", description: "Rice with onion-lemon Yassa sauce.", ingredients: ["rice", "onion", "lemon"] },
  { slug: "akpan", name: "Akpan", country: "BJ", cuisine: "west-african", category: "breakfast", description: "Beninese corn dough with milk, eaten as breakfast.", ingredients: ["maize", "milk"], allergens: ["milk"] },
  { slug: "wagashi-fried", name: "Fried Wagashi", country: "GH", cuisine: "west-african", category: "akara-snacks", description: "Fried cheese cubes with pepper sauce.", ingredients: ["cheese"], allergens: ["milk"] },
  { slug: "rice-balls", name: "Rice Balls with Soup", country: "LR", cuisine: "west-african", category: "swallows-and-soups", description: "Boiled rice balls served with palm-butter soup.", ingredients: ["rice", "palm butter"] },

  { slug: "zowey", name: "Zowey", country: "GH", cuisine: "west-african", category: "akara-snacks", description: "Sweet shredded coconut and rice snack.", ingredients: ["coconut", "rice"] },
  { slug: "koko-gh", name: "Koko with Koose", country: "GH", cuisine: "west-african", category: "breakfast", description: "Fermented millet porridge with fried bean cakes.", ingredients: ["millet", "beans"] },
  { slug: "shito", name: "Shito", country: "GH", cuisine: "west-african", category: "stews", description: "Ghanaian black pepper condiment with dried fish and shrimp.", ingredients: ["dried fish", "shrimp", "pepper"], allergens: ["fish", "shellfish"] },
  { slug: "omo-tuo", name: "Omo Tuo", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Rice balls served with groundnut soup.", ingredients: ["rice", "peanut"], allergens: ["peanuts"] },
  { slug: "tuo-zaafi", name: "Tuo Zaafi", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Northern Ghanaian millet swallow with ayoyo soup.", ingredients: ["millet", "ayoyo"] },
  { slug: "ayoyo-soup", name: "Ayoyo Soup", country: "GH", cuisine: "west-african", category: "swallows-and-soups", description: "Jute-leaf soup eaten with tuo zaafi.", ingredients: ["jute leaves", "palm oil"] }
];
