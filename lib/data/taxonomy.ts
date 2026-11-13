/**
 * NaijaDeals marketplace taxonomy — authoritative proposal data.
 *
 * This module is the single source of truth for the hierarchical marketplace
 * taxonomy seeded by `scripts/taxonomy-seed.ts`. It contains no database or
 * framework imports so it can be consumed by seeds, dry-runs, APIs and tests.
 *
 * Structure: 5 departments (level 0) -> 17 categories (level 1) -> 51
 * subcategories (level 2). The nine existing active catalogue categories are
 * retained unchanged (id, slug, name, image and demo description) and are
 * reparented under the new departments. Their products are never moved.
 *
 * Inclusion/exclusion wording is original. Regional aliases are search
 * vocabulary only: they do not merge distinct products into synonyms and do
 * not imply an informal-unit conversion.
 */

export type TaxonomyLocale = "en" | "fr" | "pt" | "ar" | "sw";
export type TaxonomyAttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";
export type TaxonomyListingType = "escrow" | "contact";
export type TaxonomyLevel = 0 | 1 | 2;

export interface TaxonomyAlias {
  alias: string;
  locale: TaxonomyLocale;
}

export interface TaxonomyAttribute {
  key: string;
  label: string;
  type: TaxonomyAttributeType;
  required: boolean;
  options?: string[];
}

export interface TaxonomyCountryRule {
  countryCode: string;
  canPublish: boolean;
  note?: string;
}

export interface TaxonomyNode {
  key: string;
  parentKey: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  level: TaxonomyLevel;
  isSelectable: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  /** True for the nine categories that already existed in the catalogue. */
  isExisting: boolean;
  /** When true the seed must not overwrite description, image or isDemo. */
  preserveExistingCategory: boolean;
  allowedListingTypes: TaxonomyListingType[];
  reviewRequired: boolean;
  aliases: TaxonomyAlias[];
  attributes: TaxonomyAttribute[];
  countryRules: TaxonomyCountryRule[];
  notes: string[];
}

type TaxonomyNodeSeed = Omit<
  TaxonomyNode,
  | "isExisting"
  | "preserveExistingCategory"
  | "allowedListingTypes"
  | "reviewRequired"
  | "aliases"
  | "attributes"
  | "countryRules"
  | "notes"
> & {
  imageUrl?: string | null;
  imageAlt?: string | null;
  isExisting?: boolean;
  preserveExistingCategory?: boolean;
  allowedListingTypes?: TaxonomyListingType[];
  reviewRequired?: boolean;
  aliases?: TaxonomyAlias[];
  attributes?: TaxonomyAttribute[];
  countryRules?: TaxonomyCountryRule[];
  notes?: string[];
};

const node = (seed: TaxonomyNodeSeed): TaxonomyNode => ({
  isExisting: false,
  preserveExistingCategory: false,
  allowedListingTypes: ["escrow"],
  reviewRequired: false,
  aliases: [],
  attributes: [],
  countryRules: [],
  notes: [],
  ...seed
});

const alias = (value: string, locale: TaxonomyLocale = "en"): TaxonomyAlias => ({
  alias: value,
  locale
});

const attr = (
  key: string,
  label: string,
  type: TaxonomyAttributeType,
  required = false,
  options?: string[]
): TaxonomyAttribute =>
  options
    ? { key, label, type, required, options }
    : { key, label, type, required };

const text = (key: string, label: string, required = false) =>
  attr(key, label, "TEXT", required);
const number = (key: string, label: string, required = false) =>
  attr(key, label, "NUMBER", required);
const select = (
  key: string,
  label: string,
  options: string[],
  required = true
) => attr(key, label, "SELECT", required, options);

/**
 * The nine categories that were already active in the review catalogue before
 * this taxonomy proposal. Their ids, slugs, names, images and demo
 * descriptions are preserved by the seed.
 */
export const EXISTING_CATEGORY_KEYS = [
  "phones-tablets",
  "computers",
  "home-kitchen",
  "fashion-accessories",
  "beauty-personal-care",
  "groceries-household",
  "power-solar",
  "gaming",
  "electronics-appliances"
] as const;

export type ExistingCategoryKey = (typeof EXISTING_CATEGORY_KEYS)[number];

const EXISTING_NOTE =
  "Existing active category: id, slug, name, image, imageAlt, isDemo and the current demo description are preserved. Existing products stay attached to this category and are never moved by the taxonomy seed.";

const existing = (
  key: ExistingCategoryKey,
  name: string,
  slug: string,
  parentKey: string,
  sortOrder: number
): TaxonomyNode =>
  node({
    key,
    parentKey,
    name,
    slug,
    description: null,
    level: 1,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder,
    isExisting: true,
    preserveExistingCategory: true,
    notes: [EXISTING_NOTE]
  });

/**
 * The proposed tree, flattened. Parents always precede their children so a
 * seed can create nodes in one pass.
 */
export const TAXONOMY_NODES: TaxonomyNode[] = [
  // -------------------------------------------------------------------------
  // 1. Electronics & Technology
  // -------------------------------------------------------------------------
  node({
    key: "electronics",
    parentKey: null,
    name: "Electronics & Technology",
    slug: "electronics-technology",
    description:
      "Phones, tablets, computers, gaming and consumer electronics. Excludes farm machinery, industrial processing equipment and business supplies, which sit under Agriculture & Business.",
    imageUrl: "/generated/shop/banner-electronics.webp",
    imageAlt: "Electronics, headphones and computing devices",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 10
  }),
  existing("phones-tablets", "Phones & Tablets", "phones-tablets", "electronics", 10),
  node({
    key: "smartphones",
    parentKey: "phones-tablets",
    name: "Smartphones",
    slug: "smartphones",
    description:
      "Cellular phones with touchscreen or keypad controls, sold new or used. Includes feature phones and smartphones. Excludes tablets, smartwatches, phone accessories and SIM-only airtime.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("mobile phone"),
      alias("handset"),
      alias("téléphone portable", "fr"),
      alias("telemóvel", "pt"),
      alias("simu janja", "sw"),
      alias("هاتف ذكي", "ar")
    ],
    attributes: [
      number("storage_gb", "Storage (GB)", true),
      number("ram_gb", "Memory (GB)"),
      select("network", "Mobile network", ["2G", "3G", "4G", "5G"], true),
      number("screen_inches", "Screen size (inches)")
    ]
  }),
  node({
    key: "phone-accessories",
    parentKey: "phones-tablets",
    name: "Phone Accessories",
    slug: "phone-accessories",
    description:
      "Cases, chargers, cables, screen protectors, mounts and power banks for phones. Excludes complete phones, tablets and standalone solar power systems.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("phone accessories"),
      alias("accessoires de téléphone", "fr"),
      alias("acessórios de telemóvel", "pt"),
      alias("vifaa vya simu", "sw"),
      alias("ملحقات الهاتف", "ar")
    ],
    attributes: [
      select(
        "accessory_type",
        "Accessory type",
        ["Case", "Charger", "Cable", "Screen protector", "Power bank", "Mount", "Other"],
        true
      ),
      text("compatible_brand", "Compatible brand")
    ]
  }),
  node({
    key: "tablets",
    parentKey: "phones-tablets",
    name: "Tablets",
    slug: "tablets",
    description:
      "Tablet computers and e-readers with Wi-Fi or cellular connectivity. Excludes smartphones and convertible laptops.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("tablet computer"),
      alias("tablette", "fr"),
      alias("tablet", "pt"),
      alias("kompyuta kibao", "sw"),
      alias("جهاز لوحي", "ar")
    ],
    attributes: [
      number("storage_gb", "Storage (GB)", true),
      number("screen_inches", "Screen size (inches)", true),
      select("connectivity", "Connectivity", ["Wi-Fi", "Wi-Fi + Cellular"], true)
    ]
  }),
  existing("computers", "Computers", "computers", "electronics", 20),
  node({
    key: "laptops",
    parentKey: "computers",
    name: "Laptops",
    slug: "laptops",
    description:
      "Portable notebook and 2-in-1 computers. Excludes tablets, desktop computers and standalone monitors.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("notebook"),
      alias("notebook computer"),
      alias("ordinateur portable", "fr"),
      alias("portátil", "pt"),
      alias("laptop", "sw"),
      alias("حاسوب محمول", "ar")
    ],
    attributes: [
      text("processor", "Processor", true),
      number("ram_gb", "Memory (GB)", true),
      number("storage_gb", "Storage (GB)", true),
      number("screen_inches", "Screen size (inches)"),
      select("operating_system", "Operating system", [
        "Windows",
        "macOS",
        "Linux",
        "ChromeOS",
        "Other"
      ], false)
    ]
  }),
  node({
    key: "desktop-computers",
    parentKey: "computers",
    name: "Desktop Computers",
    slug: "desktop-computers",
    description:
      "Desktop towers, all-in-one computers and workstation bases. Excludes monitors, keyboards and other peripherals.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("desktop"),
      alias("desktop pc"),
      alias("ordinateur de bureau", "fr"),
      alias("computador de mesa", "pt"),
      alias("kompyuta ya mezani", "sw"),
      alias("حاسوب مكتبي", "ar")
    ],
    attributes: [
      text("processor", "Processor", true),
      number("ram_gb", "Memory (GB)", true),
      number("storage_gb", "Storage (GB)", true),
      select("form_factor", "Form factor", ["Tower", "All-in-one", "Workstation", "Other"], false)
    ]
  }),
  node({
    key: "computer-accessories",
    parentKey: "computers",
    name: "Computer Accessories",
    slug: "computer-accessories",
    description:
      "Keyboards, mice, monitors, docks, hubs, cables and laptop bags. Excludes complete computers and printers.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("computer accessories"),
      alias("accessoires informatiques", "fr"),
      alias("acessórios de informática", "pt"),
      alias("vifaa vya kompyuta", "sw"),
      alias("ملحقات الحاسوب", "ar")
    ],
    attributes: [
      select(
        "accessory_type",
        "Accessory type",
        ["Keyboard", "Mouse", "Monitor", "Dock / hub", "Cable", "Laptop bag", "Other"],
        true
      ),
      text("compatible_brand", "Compatible brand")
    ]
  }),
  existing("gaming", "Gaming", "gaming", "electronics", 30),
  node({
    key: "gaming-consoles",
    parentKey: "gaming",
    name: "Gaming Consoles",
    slug: "gaming-consoles",
    description:
      "Home and handheld game consoles. Excludes games, controllers and gaming PCs.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("game console"),
      alias("console de jeu", "fr"),
      alias("consola de jogos", "pt"),
      alias("konsoli ya michezo", "sw"),
      alias("منصة ألعاب", "ar")
    ],
    attributes: [
      select("platform", "Platform", ["PlayStation", "Xbox", "Nintendo", "PC handheld", "Other"], true),
      number("storage_gb", "Storage (GB)")
    ]
  }),
  node({
    key: "video-games",
    parentKey: "gaming",
    name: "Video Games",
    slug: "video-games",
    description:
      "Physical game discs and cartridges plus digital game codes. Excludes consoles and in-game currency.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("video game"),
      alias("game disc"),
      alias("jeu vidéo", "fr"),
      alias("jogo de vídeo", "pt"),
      alias("mchezo wa video", "sw"),
      alias("لعبة فيديو", "ar")
    ],
    attributes: [
      select("platform", "Platform", ["PlayStation", "Xbox", "Nintendo", "PC", "Other"], true),
      select("format", "Format", ["Physical disc", "Cartridge", "Digital code"], true),
      text("age_rating", "Age rating")
    ]
  }),
  node({
    key: "gaming-accessories",
    parentKey: "gaming",
    name: "Gaming Accessories",
    slug: "gaming-accessories",
    description:
      "Controllers, headsets, gaming mice and keyboards, chairs and streaming accessories. Excludes consoles and games.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("gaming headset"),
      alias("controller"),
      alias("accessoires de jeu", "fr"),
      alias("acessórios de jogos", "pt"),
      alias("vifaa vya michezo", "sw"),
      alias("ملحقات الألعاب", "ar")
    ],
    attributes: [
      select(
        "accessory_type",
        "Accessory type",
        ["Controller", "Headset", "Gaming mouse", "Gaming keyboard", "Chair", "Streaming accessory", "Other"],
        true
      ),
      text("platform", "Compatible platform")
    ]
  }),
  existing(
    "electronics-appliances",
    "Electronics & Appliances",
    "electronics-appliances",
    "electronics",
    40
  ),
  node({
    key: "tvs-home-audio",
    parentKey: "electronics-appliances",
    name: "TVs & Home Audio",
    slug: "tvs-home-audio",
    description:
      "Televisions, soundbars, speakers and home theatre receivers. Excludes computer monitors and car audio.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("television"),
      alias("tv"),
      alias("soundbar"),
      alias("téléviseur", "fr"),
      alias("barre de son", "fr"),
      alias("televisor", "pt"),
      alias("barra de som", "pt"),
      alias("televisheni", "sw"),
      alias("تلفاز", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Television", "Soundbar", "Speaker", "Home theatre receiver", "Other"],
        true
      ),
      number("screen_size_inches", "Screen size (inches)"),
      number("power_watts", "Power (W)")
    ]
  }),
  node({
    key: "kitchen-appliances",
    parentKey: "electronics-appliances",
    name: "Kitchen Appliances",
    slug: "kitchen-appliances",
    description:
      "Refrigerators, cookers, microwaves, dishwashers and large built-in appliances. Excludes small countertop appliances.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("fridge"),
      alias("refrigerator"),
      alias("cooker"),
      alias("appareils de cuisine", "fr"),
      alias("eletrodomésticos de cozinha", "pt"),
      alias("vifaa vya jikoni", "sw"),
      alias("أجهزة المطبخ", "ar")
    ],
    attributes: [
      select(
        "appliance_type",
        "Appliance type",
        ["Refrigerator", "Cooker", "Microwave", "Dishwasher", "Freezer", "Built-in oven", "Other"],
        true
      ),
      number("power_watts", "Power (W)"),
      number("capacity_litres", "Capacity (litres)")
    ]
  }),
  node({
    key: "small-appliances",
    parentKey: "electronics-appliances",
    name: "Small Appliances",
    slug: "small-appliances",
    description:
      "Blenders, kettles, toasters, air fryers, coffee makers and food processors. Excludes large kitchen appliances and cookware.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("blender"),
      alias("kettle"),
      alias("air fryer"),
      alias("petits appareils", "fr"),
      alias("pequenos eletrodomésticos", "pt"),
      alias("vifaa vidogo vya jikoni", "sw"),
      alias("أجهزة صغيرة", "ar")
    ],
    attributes: [
      select(
        "appliance_type",
        "Appliance type",
        ["Blender", "Kettle", "Toaster", "Air fryer", "Coffee maker", "Food processor", "Other"],
        true
      ),
      number("power_watts", "Power (W)")
    ]
  }),

  // -------------------------------------------------------------------------
  // 2. Home & Living
  // -------------------------------------------------------------------------
  node({
    key: "home",
    parentKey: null,
    name: "Home & Living",
    slug: "home-living",
    description:
      "Kitchenware, home textiles, household cleaning and home power. Excludes building materials, furniture installation and commercial catering equipment.",
    imageUrl: "/generated/shop/category-home-kitchen.webp",
    imageAlt: "Home and kitchen goods",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 20
  }),
  existing("home-kitchen", "Home & Kitchen", "home-kitchen", "home", 10),
  node({
    key: "cookware-bakeware",
    parentKey: "home-kitchen",
    name: "Cookware & Bakeware",
    slug: "cookware-bakeware",
    description:
      "Pots, pans, baking trays, casserole dishes and cookware sets. Excludes tableware, cutlery and small appliances.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("pots and pans"),
      alias("bakeware"),
      alias("ustensiles de cuisine", "fr"),
      alias("panelas e assadeiras", "pt"),
      alias("vyombo vya kupikia", "sw"),
      alias("أواني الطهي", "ar")
    ],
    attributes: [
      select(
        "material",
        "Material",
        ["Stainless steel", "Aluminium", "Cast iron", "Ceramic", "Glass", "Non-stick", "Other"],
        true
      ),
      number("piece_count", "Number of pieces")
    ]
  }),
  node({
    key: "tableware-dining",
    parentKey: "home-kitchen",
    name: "Tableware & Dining",
    slug: "tableware-dining",
    description:
      "Plates, bowls, cups, cutlery, serving dishes and dining sets. Excludes cookware and furniture.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("plates"),
      alias("cutlery"),
      alias("dinnerware"),
      alias("vaisselle", "fr"),
      alias("louça", "pt"),
      alias("vyombo vya mezani", "sw"),
      alias("أدوات المائدة", "ar")
    ],
    attributes: [
      select(
        "material",
        "Material",
        ["Ceramic", "Porcelain", "Glass", "Stainless steel", "Plastic", "Other"],
        true
      ),
      number("piece_count", "Number of pieces")
    ]
  }),
  node({
    key: "home-textiles",
    parentKey: "home-kitchen",
    name: "Home Textiles",
    slug: "home-textiles",
    description:
      "Bedding, towels, curtains, rugs and cushion covers. Excludes ready-made clothing and upholstered furniture.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("bedding"),
      alias("towels"),
      alias("curtains"),
      alias("lingerie de maison", "fr"),
      alias("têxteis para o lar", "pt"),
      alias("vitambaa vya nyumbani", "sw"),
      alias("منسوجات منزلية", "ar")
    ],
    attributes: [
      select(
        "textile_type",
        "Textile type",
        ["Bedding", "Towel", "Curtain", "Rug", "Cushion cover", "Other"],
        true
      ),
      text("size", "Size"),
      text("material", "Material")
    ]
  }),
  node({
    key: "storage-organisation",
    parentKey: "home-kitchen",
    name: "Storage & Organisation",
    slug: "storage-organisation",
    description:
      "Storage boxes, baskets, shelving units, wardrobe organisers and kitchen storage. Excludes built-in cabinetry and commercial warehouse racking.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("storage boxes"),
      alias("organiser"),
      alias("rangement", "fr"),
      alias("organização", "pt"),
      alias("uhifadhi wa nyumbani", "sw")
    ],
    attributes: [
      select(
        "storage_type",
        "Storage type",
        ["Box", "Basket", "Shelving unit", "Wardrobe organiser", "Kitchen organiser", "Other"],
        true
      ),
      text("material", "Material")
    ]
  }),
  existing("power-solar", "Power & Solar", "power-solar", "home", 20),
  node({
    key: "solar-panels",
    parentKey: "power-solar",
    name: "Solar Panels",
    slug: "solar-panels",
    description:
      "Photovoltaic panels and mounting kits sold by panel or wattage. Excludes inverters, batteries and complete solar home systems.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("pv panel"),
      alias("photovoltaic panel"),
      alias("panneau solaire", "fr"),
      alias("painel solar", "pt"),
      alias("panel ya jua", "sw"),
      alias("لوح شمسي", "ar")
    ],
    attributes: [
      number("panel_wattage", "Panel wattage (W)", true),
      select(
        "panel_type",
        "Panel type",
        ["Monocrystalline", "Polycrystalline", "Thin-film", "Other"],
        true
      ),
      number("warranty_years", "Warranty (years)")
    ]
  }),
  node({
    key: "inverters-batteries",
    parentKey: "power-solar",
    name: "Inverters & Batteries",
    slug: "inverters-batteries",
    description:
      "Inverters, charge controllers, solar batteries and battery enclosures. Excludes solar panels and generators.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("inverter"),
      alias("solar battery"),
      alias("onduleur", "fr"),
      alias("batterie solaire", "fr"),
      alias("inversor", "pt"),
      alias("bateria solar", "pt"),
      alias("betri ya jua", "sw"),
      alias("عاكس كهربائي", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Inverter", "Charge controller", "Battery", "Battery enclosure", "Other"],
        true
      ),
      number("capacity_va", "Inverter capacity (VA)"),
      number("battery_capacity_ah", "Battery capacity (Ah)"),
      select(
        "battery_chemistry",
        "Battery chemistry",
        ["Lead-acid", "Gel", "Tubular", "Lithium-ion", "Other"],
        false
      )
    ]
  }),
  node({
    key: "generators-backup-power",
    parentKey: "power-solar",
    name: "Generators & Backup Power",
    slug: "generators-backup-power",
    description:
      "Petrol, diesel and gas generators, portable power stations and small backup systems. Excludes solar panels and data-centre UPS installations.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("generator"),
      alias("power station"),
      alias("groupe électrogène", "fr"),
      alias("gerador", "pt"),
      alias("jenereta", "sw"),
      alias("مولد كهرباء", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Generator", "Portable power station", "UPS", "Other"],
        true
      ),
      number("rated_power_kva", "Rated power (kVA)", true),
      select("fuel_type", "Fuel type", ["Petrol", "Diesel", "Gas", "Battery", "Other"], false)
    ]
  }),
  node({
    key: "household-cleaning",
    parentKey: "home",
    name: "Household & Cleaning",
    slug: "household-cleaning",
    description:
      "Cleaning products, laundry care and bathroom consumables for the home. Excludes appliances, cleaning services and industrial chemicals.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "cleaning-supplies",
    parentKey: "household-cleaning",
    name: "Cleaning Supplies",
    slug: "cleaning-supplies",
    description:
      "Detergents, disinfectants, mops, brooms, sponges and surface cleaners. Excludes washing machines and professional cleaning equipment.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("detergent"),
      alias("disinfectant"),
      alias("produits de nettoyage", "fr"),
      alias("produtos de limpeza", "pt"),
      alias("vifaa vya kusafisha", "sw"),
      alias("منظفات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Detergent", "Disinfectant", "Surface cleaner", "Mop / broom", "Sponge / cloth", "Other"],
        true
      ),
      number("volume_ml", "Volume (ml)")
    ]
  }),
  node({
    key: "laundry-bathroom",
    parentKey: "household-cleaning",
    name: "Laundry & Bathroom",
    slug: "laundry-bathroom",
    description:
      "Laundry detergents, fabric softeners, toilet paper, bathroom cleaners and bathroom toiletries. Excludes bathroom fixtures and installation.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("laundry detergent"),
      alias("toilet paper"),
      alias("lessive", "fr"),
      alias("papier toilette", "fr"),
      alias("detergente de roupa", "pt"),
      alias("papel higiénico", "pt"),
      alias("sabuni ya kufulia", "sw"),
      alias("منظفات الحمام", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Laundry detergent", "Fabric softener", "Toilet paper", "Bathroom cleaner", "Toiletry", "Other"],
        true
      ),
      number("pack_count", "Pack count")
    ]
  }),

  // -------------------------------------------------------------------------
  // 3. Fashion & Beauty
  // -------------------------------------------------------------------------
  node({
    key: "fashion",
    parentKey: null,
    name: "Fashion & Beauty",
    slug: "fashion-beauty",
    description:
      "Clothing, footwear, bags, fabrics and personal care. Excludes tailoring services, beauty treatments and fashion rentals.",
    imageUrl: "/generated/shop/category-fashion.webp",
    imageAlt: "Fashion and beauty products",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 30
  }),
  existing(
    "fashion-accessories",
    "Fashion & Accessories",
    "fashion-accessories",
    "fashion",
    10
  ),
  node({
    key: "clothing",
    parentKey: "fashion-accessories",
    name: "Clothing",
    slug: "clothing",
    description:
      "Ready-to-wear clothing for adults and children. Excludes fabric sold by the yard and tailoring services.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("clothes"),
      alias("apparel"),
      alias("vêtements", "fr"),
      alias("roupas", "pt"),
      alias("nguo", "sw"),
      alias("ملابس", "ar")
    ],
    attributes: [
      select(
        "size",
        "Size",
        ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Children", "Other"],
        true
      ),
      select("gender", "Fit", ["Women", "Men", "Unisex", "Girls", "Boys", "Baby"], false),
      text("material", "Material")
    ]
  }),
  node({
    key: "footwear",
    parentKey: "fashion-accessories",
    name: "Footwear",
    slug: "footwear",
    description:
      "Shoes, sandals, boots and slippers. Excludes socks and shoe-care products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("shoes"),
      alias("sandals"),
      alias("chaussures", "fr"),
      alias("calçado", "pt"),
      alias("viatu", "sw"),
      alias("أحذية", "ar")
    ],
    attributes: [
      number("size", "Size (EU)", true),
      select("gender", "Fit", ["Women", "Men", "Unisex", "Girls", "Boys", "Baby"], false),
      select("shoe_type", "Shoe type", ["Sneaker", "Sandal", "Boot", "Slipper", "Formal", "Other"], false),
      text("material", "Material")
    ]
  }),
  node({
    key: "bags-accessories",
    parentKey: "fashion-accessories",
    name: "Bags & Accessories",
    slug: "bags-accessories",
    description:
      "Handbags, backpacks, belts, hats, scarves, watches, jewellery and travel bags. Excludes footwear and phone cases.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("handbag"),
      alias("backpack"),
      alias("jewellery"),
      alias("sacs et accessoires", "fr"),
      alias("bolsas e acessórios", "pt"),
      alias("mikoba na vifaa", "sw"),
      alias("حقائب وإكسسوارات", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Handbag", "Backpack", "Travel bag", "Belt", "Hat", "Scarf", "Watch", "Jewellery", "Other"],
        true
      ),
      text("material", "Material")
    ]
  }),
  node({
    key: "fabrics-textiles",
    parentKey: "fashion",
    name: "Fabrics & Textiles",
    slug: "fabrics-textiles",
    description:
      "Fabric sold by the piece, yard or metre, including printed, woven and dyed African textiles. Excludes finished clothing, soft furnishings and tailoring services.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "african-print-fabrics",
    parentKey: "fabrics-textiles",
    name: "African-Print Fabrics",
    slug: "african-print-fabrics",
    description:
      "Printed cotton fabrics such as ankara/wax print, kitenge/chitenge and shweshwe, sold by the piece, yard or metre. Excludes handwoven kente, aso-oke, adire and bogolan, which are listed under Handwoven & Dyed Fabrics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("ankara"),
      alias("wax print"),
      alias("kitenge"),
      alias("chitenge"),
      alias("shweshwe"),
      alias("pagne", "fr"),
      alias("tissu wax", "fr"),
      alias("capulana", "pt"),
      alias("pano africano", "pt"),
      alias("قماش أفريقي مطبوع", "ar")
    ],
    attributes: [
      select(
        "fabric_style",
        "Fabric style",
        ["Ankara / wax print", "Kitenge / chitenge", "Shweshwe", "Other African print"],
        true
      ),
      number("length_yards", "Length (yards)", true),
      number("width_cm", "Width (cm)"),
      text("material", "Material", true)
    ],
    notes: [
      "Ankara, kitenge/chitenge and shweshwe are distinct print traditions and products; they are search aliases, not interchangeable synonyms."
    ]
  }),
  node({
    key: "handwoven-dyed-fabrics",
    parentKey: "fabrics-textiles",
    name: "Handwoven & Dyed Fabrics",
    slug: "handwoven-dyed-fabrics",
    description:
      "Handwoven or hand-dyed fabrics including kente, aso-oke, adire and bogolan, sold by the piece, yard or metre. Excludes industrially printed ankara, kitenge and shweshwe.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("kente"),
      alias("aso-oke"),
      alias("aso oke"),
      alias("adire"),
      alias("bogolan"),
      alias("mud cloth"),
      alias("kenté", "fr"),
      alias("bogolan", "fr"),
      alias("tissu mud", "fr"),
      alias("kente", "pt"),
      alias("bogolan", "pt"),
      alias("pano de lama", "pt"),
      alias("قماش منسوج يدويًا", "ar")
    ],
    attributes: [
      select(
        "technique",
        "Technique",
        ["Handwoven strip-weave", "Indigo resist-dye", "Mud-resist dye", "Other"],
        true
      ),
      number("length_yards", "Length (yards)", true),
      number("width_cm", "Width (cm)")
    ],
    notes: [
      "Kente and aso-oke are handwoven; adire and bogolan are dyed traditions. Each remains a distinct product, not a synonym for printed ankara."
    ]
  }),
  node({
    key: "lace-embroidered-fabrics",
    parentKey: "fabrics-textiles",
    name: "Lace & Embroidered Fabrics",
    slug: "lace-embroidered-fabrics",
    description:
      "Lace, embroidered and beaded fabrics sold by the piece, yard or metre. Excludes printed African fabrics and finished garments.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("lace"),
      alias("embroidered fabric"),
      alias("dentelle", "fr"),
      alias("tissu brodé", "fr"),
      alias("renda", "pt"),
      alias("tecido bordado", "pt"),
      alias("دانتيل", "ar")
    ],
    attributes: [
      select("fabric_type", "Fabric type", ["Lace", "Embroidered", "Beaded", "Other"], true),
      number("length_yards", "Length (yards)", true),
      text("colour", "Colour")
    ]
  }),
  existing(
    "beauty-personal-care",
    "Beauty & Personal Care",
    "beauty-personal-care",
    "fashion",
    30
  ),
  node({
    key: "skincare",
    parentKey: "beauty-personal-care",
    name: "Skincare",
    slug: "skincare",
    description:
      "Cleansers, moisturisers, serums, sunscreen and face masks. Excludes medicinal treatments and prescription products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("moisturiser"),
      alias("moisturizer"),
      alias("serum"),
      alias("soins de la peau", "fr"),
      alias("cuidados com a pele", "pt"),
      alias("utunzaji wa ngozi", "sw"),
      alias("العناية بالبشرة", "ar")
    ],
    attributes: [
      select(
        "skin_type",
        "Skin type",
        ["All", "Dry", "Oily", "Combination", "Sensitive", "Other"],
        false
      ),
      number("volume_ml", "Volume (ml)"),
      number("spf", "SPF")
    ]
  }),
  node({
    key: "hair-care",
    parentKey: "beauty-personal-care",
    name: "Hair Care",
    slug: "hair-care",
    description:
      "Shampoos, conditioners, oils, treatments and styling products. Excludes wigs, hairpieces and salon services.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("shampoo"),
      alias("conditioner"),
      alias("soins capillaires", "fr"),
      alias("cuidados com o cabelo", "pt"),
      alias("utunzaji wa nywele", "sw"),
      alias("العناية بالشعر", "ar")
    ],
    attributes: [
      select(
        "hair_type",
        "Hair type",
        ["All", "Straight", "Wavy", "Curly", "Coily", "Other"],
        false
      ),
      select(
        "product_type",
        "Product type",
        ["Shampoo", "Conditioner", "Oil", "Treatment", "Styling", "Other"],
        false
      ),
      number("volume_ml", "Volume (ml)")
    ]
  }),
  node({
    key: "bath-body",
    parentKey: "beauty-personal-care",
    name: "Bath & Body",
    slug: "bath-body",
    description:
      "Body wash, lotions, scrubs, deodorants and bath accessories. Excludes laundry soap and medicated products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("body lotion"),
      alias("body wash"),
      alias("soins du corps", "fr"),
      alias("cuidados corporais", "pt"),
      alias("utunzaji wa mwili", "sw"),
      alias("العناية بالجسم", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Body wash", "Lotion", "Scrub", "Deodorant", "Bar soap", "Other"],
        true
      ),
      number("volume_ml", "Volume (ml)")
    ]
  }),
  node({
    key: "natural-traditional-beauty",
    parentKey: "fashion",
    name: "Natural & Traditional Beauty",
    slug: "natural-traditional-beauty",
    description:
      "Traditional soaps, shea products and natural body care. Excludes medicines, supplements and products making unverified therapeutic claims.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 40,
    notes: [
      "Listings must not claim medical treatment or unverified therapeutic benefits."
    ]
  }),
  node({
    key: "shea-natural-butters",
    parentKey: "natural-traditional-beauty",
    name: "Shea & Natural Butters",
    slug: "shea-natural-butters",
    description:
      "Raw, refined and whipped shea butter and similar natural butters sold by weight. Excludes shea-based finished soaps and cosmetics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("shea"),
      alias("shea butter"),
      alias("karite"),
      alias("karité"),
      alias("karité", "fr"),
      alias("beurre de karité", "fr"),
      alias("manteiga de karité", "pt"),
      alias("siagi ya shea", "sw"),
      alias("زبدة الشيا", "ar")
    ],
    attributes: [
      select("form", "Form", ["Raw", "Refined", "Whipped", "Other"], true),
      number("net_weight_kg", "Net weight (kg)", true),
      text("origin_country", "Origin country")
    ],
    notes: [
      "This leaf covers cosmetic-grade shea. Food-grade shea requires a separate food-safety review before listing."
    ]
  }),
  node({
    key: "traditional-cleansers-black-soap",
    parentKey: "natural-traditional-beauty",
    name: "Traditional Cleansers & Black Soap",
    slug: "traditional-cleansers-black-soap",
    description:
      "African black soap and traditional cleansers sold as bars, powder, paste or liquid. Excludes medicated soaps and laundry soap.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("black soap"),
      alias("ose dudu"),
      alias("alata samina"),
      alias("sabulun salo"),
      alias("ncha nkota"),
      alias("savon noir", "fr"),
      alias("sabão negro", "pt"),
      alias("sabuni nyeusi", "sw"),
      alias("صابون أسود", "ar")
    ],
    attributes: [
      select("form", "Form", ["Bar", "Liquid", "Powder", "Paste"], true),
      number("net_weight_g", "Net weight (g)", true)
    ],
    notes: [
      "Ose dudu, alata samina, sabulun salo and ncha nkota are regional names for related traditional soaps; separate products must not be merged into one listing."
    ]
  }),

  // -------------------------------------------------------------------------
  // 4. Food & Everyday Essentials
  // -------------------------------------------------------------------------
  node({
    key: "food",
    parentKey: null,
    name: "Food & Everyday Essentials",
    slug: "food-everyday-essentials",
    description:
      "Grains, flours, oils, seasonings, fresh produce and everyday household consumables. Excludes prepared meals, restaurant delivery and farm inputs.",
    imageUrl: "/generated/shop/category-groceries.webp",
    imageAlt: "Everyday groceries and household essentials",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 40,
    notes: [
      "The existing Groceries & Household Essentials category is retained under this department so its current products do not move."
    ]
  }),
  existing(
    "groceries-household",
    "Groceries & Household Essentials",
    "groceries-household",
    "food",
    10
  ),
  node({
    key: "fresh-produce",
    parentKey: "groceries-household",
    name: "Fresh Produce",
    slug: "fresh-produce",
    description:
      "Fresh vegetables, fruit and herbs sold by weight or piece. Excludes frozen meals, dried produce and farm seedlings.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("vegetables"),
      alias("fruit"),
      alias("fruits"),
      alias("herbs"),
      alias("légumes", "fr"),
      alias("fruits", "fr"),
      alias("legumes", "pt"),
      alias("frutas", "pt"),
      alias("mboga", "sw"),
      alias("matunda", "sw"),
      alias("خضروات وفواكه", "ar")
    ],
    attributes: [
      select("produce_type", "Produce type", ["Vegetables", "Fruit", "Herbs", "Other"], true),
      number("net_weight_kg", "Net weight (kg)"),
      select("unit", "Sold by", ["kg", "g", "bunch", "piece", "head", "Other"], false)
    ]
  }),
  node({
    key: "pantry-staples",
    parentKey: "groceries-household",
    name: "Pantry Staples",
    slug: "pantry-staples",
    description:
      "Shelf-stable rice, pasta, canned goods, sugar, salt and stock cubes. Excludes flours, cassava products, fresh produce and household cleaning goods.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("pantry"),
      alias("canned goods"),
      alias("stock cubes"),
      alias("épicerie", "fr"),
      alias("despensa", "pt"),
      alias("vyakula vya kuhifadhi", "sw"),
      alias("معلبات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Rice", "Pasta", "Canned goods", "Sugar", "Salt", "Stock cubes", "Other"],
        false
      ),
      number("net_weight_kg", "Net weight (kg)"),
      select("packaging", "Packaging", ["Bag", "Sachet", "Tin", "Jar", "Box", "Other"], false)
    ]
  }),
  node({
    key: "household-essentials",
    parentKey: "groceries-household",
    name: "Household Essentials",
    slug: "household-essentials",
    description:
      "Everyday consumables such as tissue, kitchen wrap, foil, matches and batteries. Excludes cleaning products, appliances and food.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("household consumables"),
      alias("tissue"),
      alias("kitchen wrap"),
      alias("produits ménagers", "fr"),
      alias("produtos domésticos", "pt"),
      alias("bidhaa za nyumbani", "sw"),
      alias("مستلزمات منزلية", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Tissue", "Kitchen wrap", "Foil", "Matches", "Batteries", "Other"],
        true
      ),
      number("pack_count", "Pack count")
    ]
  }),
  node({
    key: "grains-flours",
    parentKey: "food",
    name: "Grains & Flours",
    slug: "grains-flours",
    description:
      "Grains, flours and starchy staples sold by weight, including teff, maize, cassava and rice products. Excludes bread, prepared meals and animal feed.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "teff-flour",
    parentKey: "grains-flours",
    name: "Teff Flour",
    slug: "teff-flour",
    description:
      "Flour milled from teff (Eragrostis tef) for injera and gluten-free baking. Excludes whole teff grain, wheat flour and prepared injera.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("teff"),
      alias("tef"),
      alias("teff flour"),
      alias("teff", "fr"),
      alias("mil éthiopien", "fr"),
      alias("teff", "pt"),
      alias("teff", "sw"),
      alias("دقيق التيف", "ar"),
      alias("تيف", "ar")
    ],
    attributes: [
      number("net_weight_kg", "Net weight (kg)", true),
      select("grind", "Grind", ["Fine", "Medium", "Coarse"], true),
      text("origin_country", "Origin country")
    ]
  }),
  node({
    key: "maize-meal-porridge",
    parentKey: "grains-flours",
    name: "Maize Meal & Porridge",
    slug: "maize-meal-porridge",
    description:
      "Maize meal and fermented maize products used for ugali, pap, ogi/akamu and koko. Excludes canned sweetcorn, cornflakes and wheat flour.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("ugali"),
      alias("ugoli"),
      alias("pap"),
      alias("ogi"),
      alias("akamu"),
      alias("koko"),
      alias("maize meal"),
      alias("corn meal"),
      alias("farine de maïs", "fr"),
      alias("bouillie de maïs", "fr"),
      alias("farinha de milho", "pt"),
      alias("xima", "pt"),
      alias("sembe", "sw"),
      alias("uji", "sw"),
      alias("ugali", "sw"),
      alias("دقيق الذرة", "ar")
    ],
    attributes: [
      number("net_weight_kg", "Net weight (kg)", true),
      select(
        "form",
        "Form",
        ["Fine meal", "Coarse meal", "Fermented wet mash", "Instant porridge"],
        true
      ),
      select("grain", "Grain", ["White maize", "Yellow maize", "Other"], false)
    ],
    notes: [
      "Ugali and pap refer to different consistencies and preparations; koko, ogi and akamu are regional names for fermented maize porridge. They remain distinct products."
    ]
  }),
  node({
    key: "cassava-products",
    parentKey: "grains-flours",
    name: "Cassava Products",
    slug: "cassava-products",
    description:
      "Fermented and dried cassava foods such as garri/gari, attiéké, fufu flour and cassava flour. Excludes fresh cassava tubers and cassava-processing equipment.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("garri"),
      alias("gari"),
      alias("attiéké"),
      alias("attieke"),
      alias("fufu"),
      alias("cassava flour"),
      alias("attiéké", "fr"),
      alias("gari", "fr"),
      alias("foutou", "fr"),
      alias("farine de manioc", "fr"),
      alias("farinha de mandioca", "pt"),
      alias("gari", "pt"),
      alias("mandioca", "pt"),
      alias("muhogo", "sw"),
      alias("كسافا", "ar"),
      alias("غاري", "ar")
    ],
    attributes: [
      number("net_weight_kg", "Net weight (kg)", true),
      select(
        "product_form",
        "Product form",
        ["Garri / gari", "Attiéké", "Cassava flour", "Fufu flour", "Dried chips", "Other"],
        true
      ),
      select("fermentation", "Fermentation", ["Fermented", "Unfermented", "Not applicable"], false)
    ],
    notes: [
      "Garri is roasted and attiéké is steamed; they are different cassava products and must not be listed as substitutes or synonyms."
    ]
  }),
  node({
    key: "rice-grains",
    parentKey: "grains-flours",
    name: "Rice & Other Grains",
    slug: "rice-grains",
    description:
      "Rice, millet, sorghum and other whole grains sold by weight. Excludes flours, maize meal and rice-based prepared meals.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("rice"),
      alias("millet"),
      alias("sorghum"),
      alias("riz", "fr"),
      alias("mil", "fr"),
      alias("sorgho", "fr"),
      alias("arroz", "pt"),
      alias("milheto", "pt"),
      alias("sorgo", "pt"),
      alias("mchele", "sw"),
      alias("mtama", "sw"),
      alias("mawele", "sw"),
      alias("أرز", "ar")
    ],
    attributes: [
      select("grain_type", "Grain type", ["Rice", "Millet", "Sorghum", "Other"], true),
      number("net_weight_kg", "Net weight (kg)", true),
      text("variety", "Variety")
    ]
  }),
  node({
    key: "oils-soups-seasonings",
    parentKey: "food",
    name: "Oils, Soups & Seasonings",
    slug: "oils-soups-seasonings",
    description:
      "Cooking oils, soup thickeners and fermented seasonings. Excludes essential oils, stock cubes (see Pantry Staples) and prepared soups.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "palm-cooking-oils",
    parentKey: "oils-soups-seasonings",
    name: "Palm Oil & Cooking Oils",
    slug: "palm-cooking-oils",
    description:
      "Red palm oil and other cooking oils sold by bottle, jerrycan or litre. Excludes essential oils, motor oil and cosmetics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("palm oil"),
      alias("red oil"),
      alias("zomi"),
      alias("huile de palme", "fr"),
      alias("óleo de palma", "pt"),
      alias("azeite de dendê", "pt"),
      alias("mafuta ya mawese", "sw"),
      alias("زيت النخيل", "ar")
    ],
    attributes: [
      select(
        "oil_type",
        "Oil type",
        ["Palm", "Vegetable", "Groundnut", "Sunflower", "Coconut", "Olive", "Other"],
        true
      ),
      number("volume_litres", "Volume (litres)", true),
      select(
        "extraction",
        "Extraction",
        ["Cold-pressed", "Refined", "Unrefined", "Not stated"],
        false
      )
    ]
  }),
  node({
    key: "soup-thickeners-seasonings",
    parentKey: "oils-soups-seasonings",
    name: "Soup Thickeners & Seasonings",
    slug: "soup-thickeners-seasonings",
    description:
      "Egusi (melon seed), ogbono (wild mango seed), iru/dawadawa (fermented locust bean) and similar soup thickeners and seasonings. Excludes stock cubes, fresh vegetables and prepared soup.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("egusi"),
      alias("ogbono"),
      alias("iru"),
      alias("dawadawa"),
      alias("daddawa"),
      alias("soumbala", "fr"),
      alias("néré", "fr"),
      alias("soumbala", "pt"),
      alias("sumbala", "sw")
    ],
    attributes: [
      select(
        "ingredient_type",
        "Ingredient type",
        ["Egusi", "Ogbono", "Iru / dawadawa", "Other"],
        true
      ),
      select("form", "Form", ["Whole", "Ground", "Fermented", "Dried", "Paste"], true),
      number("net_weight_g", "Net weight (g)", true)
    ],
    notes: [
      "Egusi and ogbono are different thickeners; iru/dawadawa is a fermented seasoning. They must not be merged into one product listing."
    ]
  }),

  // -------------------------------------------------------------------------
  // 5. Agriculture & Business
  // -------------------------------------------------------------------------
  node({
    key: "agriculture",
    parentKey: null,
    name: "Agriculture & Business",
    slug: "agriculture-business",
    description:
      "Farm inputs, processing equipment and wholesale business supplies for producers and small businesses. Excludes passenger vehicles, financial services and livestock.",
    imageUrl: "/generated/fresh/cat-grains-beans.webp",
    imageAlt: "Grains, beans and agricultural produce",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 50
  }),
  node({
    key: "farm-inputs",
    parentKey: "agriculture",
    name: "Farm Inputs",
    slug: "farm-inputs",
    description:
      "Seeds, seedlings, growing media, fertilizers and irrigation tools for farms and gardens. Excludes processing machinery, livestock and veterinary products.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "seeds-seedlings",
    parentKey: "farm-inputs",
    name: "Seeds & Seedlings",
    slug: "seeds-seedlings",
    description:
      "Vegetable, cereal, tree and ornamental seeds and seedlings. Excludes unregistered or uncertified seed where certification is required, and live plants sold as food.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("seeds"),
      alias("seedlings"),
      alias("semences", "fr"),
      alias("plants", "fr"),
      alias("sementes", "pt"),
      alias("mudas", "pt"),
      alias("mbegu", "sw"),
      alias("miche", "sw"),
      alias("بذور", "ar"),
      alias("شتلات", "ar")
    ],
    attributes: [
      text("variety", "Variety", true),
      select(
        "seed_class",
        "Seed class",
        ["Certified", "Foundation", "Breeder", "Unclassified"],
        true
      ),
      number("packet_weight_g", "Packet weight (g)", true),
      number("germination_rate", "Germination rate (%)")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Seeds and seedlings are subject to national seed certification and quality-control requirements. Publishing in Nigeria requires verification of registration/certification by the reviewer; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Do not enable until the seller supplies valid certification evidence."
    ]
  }),
  node({
    key: "soil-compost",
    parentKey: "farm-inputs",
    name: "Soil, Compost & Growing Media",
    slug: "soil-compost",
    description:
      "Topsoil, compost, manure, potting mixes and growing media sold by volume or bag. Excludes fertilizers sold by nutrient content and pesticides.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("compost"),
      alias("topsoil"),
      alias("potting mix"),
      alias("compost", "fr"),
      alias("terre végétale", "fr"),
      alias("composto", "pt"),
      alias("terra vegetal", "pt"),
      alias("mboji", "sw"),
      alias("سماد عضوي", "ar")
    ],
    attributes: [
      select(
        "media_type",
        "Growing media type",
        ["Topsoil", "Compost", "Manure", "Potting mix", "Other"],
        true
      ),
      number("volume_litres", "Volume (litres)", true)
    ]
  }),
  node({
    key: "fertilizers-crop-nutrition",
    parentKey: "farm-inputs",
    name: "Fertilizers & Crop Nutrition",
    slug: "fertilizers-crop-nutrition",
    description:
      "Mineral and organic fertilizers and crop nutrition products sold by nutrient content or weight. Excludes compost, pesticides and veterinary products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("fertilizer"),
      alias("fertiliser"),
      alias("npk"),
      alias("engrais", "fr"),
      alias("fertilizante", "pt"),
      alias("mbolea", "sw"),
      alias("سماد", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Mineral fertilizer", "Organic fertilizer", "Foliar feed", "Soil amendment", "Other"],
        true
      ),
      number("net_weight_kg", "Net weight (kg)", true),
      text("nutrient_analysis", "Nutrient analysis"),
      text("registration_number", "Registration number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Fertilizer quality-control and registration requirements apply. Publishing in Nigeria requires reviewer verification of the product registration; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Do not enable until registration evidence is reviewed."
    ]
  }),
  node({
    key: "irrigation-farm-tools",
    parentKey: "farm-inputs",
    name: "Irrigation & Farm Tools",
    slug: "irrigation-farm-tools",
    description:
      "Drip kits, hoses, sprinklers, pumps, sprayers and hand tools. Excludes tractors, processing machinery and construction power tools.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("irrigation"),
      alias("drip irrigation"),
      alias("farm tools"),
      alias("irrigation", "fr"),
      alias("irrigação", "pt"),
      alias("umwagiliaji", "sw"),
      alias("الري", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Drip kit", "Hose", "Sprinkler", "Pump", "Sprayer", "Hand tool", "Other"],
        true
      ),
      select(
        "power_source",
        "Power source",
        ["Manual", "Electric", "Petrol", "Diesel", "Solar", "Other"],
        false
      )
    ]
  }),
  node({
    key: "processing-equipment",
    parentKey: "agriculture",
    name: "Processing Equipment",
    slug: "processing-equipment",
    description:
      "Machines and tools for processing agricultural produce and food. Excludes vehicles, farm inputs and packaging consumables.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "cassava-processing-equipment",
    parentKey: "processing-equipment",
    name: "Cassava Processing Equipment",
    slug: "cassava-processing-equipment",
    description:
      "Cassava graters, presses, sieves, fryers, mills and peeling equipment. Excludes fresh cassava, cassava food products and general kitchen appliances.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("cassava grater"),
      alias("cassava press"),
      alias("garri fryer"),
      alias("rápeuse de manioc", "fr"),
      alias("presse à manioc", "fr"),
      alias("ralador de mandioca", "pt"),
      alias("prensa de mandioca", "pt"),
      alias("kinu cha muhogo", "sw"),
      alias("معدات معالجة الكسافا", "ar")
    ],
    attributes: [
      select(
        "equipment_type",
        "Equipment type",
        ["Grater", "Press", "Sieve", "Fryer", "Mill", "Peeler", "Other"],
        true
      ),
      number("capacity_kg_per_hour", "Capacity (kg/hour)"),
      select("power_source", "Power source", ["Manual", "Electric", "Petrol", "Diesel"], true),
      number("warranty_months", "Warranty (months)")
    ]
  }),
  node({
    key: "grain-milling-equipment",
    parentKey: "processing-equipment",
    name: "Grain Milling Equipment",
    slug: "grain-milling-equipment",
    description:
      "Grain mills, hullers, threshers and milling accessories. Excludes hand kitchen blenders and grain food products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("grain mill"),
      alias("hammer mill"),
      alias("moulin à grains", "fr"),
      alias("moinho de grãos", "pt"),
      alias("kinu cha nafaka", "sw"),
      alias("مطحنة حبوب", "ar")
    ],
    attributes: [
      select("equipment_type", "Equipment type", ["Mill", "Huller", "Thresher", "Accessory", "Other"], true),
      number("capacity_kg_per_hour", "Capacity (kg/hour)"),
      select("power_source", "Power source", ["Manual", "Electric", "Petrol", "Diesel"], true),
      number("warranty_months", "Warranty (months)")
    ]
  }),
  node({
    key: "food-processing-equipment",
    parentKey: "processing-equipment",
    name: "Food Processing Equipment",
    slug: "food-processing-equipment",
    description:
      "Mixers, dryers, roasters, fryers and similar food-processing machines for small businesses. Excludes home kitchen appliances and packaging consumables.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("food processing equipment"),
      alias("food dryer"),
      alias("mixer machine"),
      alias("équipement de transformation alimentaire", "fr"),
      alias("equipamento de processamento de alimentos", "pt"),
      alias("vifaa vya kusindika chakula", "sw"),
      alias("معدات تصنيع الغذاء", "ar")
    ],
    attributes: [
      select("equipment_type", "Equipment type", ["Mixer", "Dryer", "Roaster", "Fryer", "Other"], true),
      number("capacity_kg_per_hour", "Capacity (kg/hour)"),
      select("power_source", "Power source", ["Manual", "Electric", "Petrol", "Diesel"], true),
      number("warranty_months", "Warranty (months)")
    ]
  }),
  node({
    key: "wholesale-business-supplies",
    parentKey: "agriculture",
    name: "Wholesale & Business Supplies",
    slug: "wholesale-business-supplies",
    description:
      "Bulk quantities, packaging and store equipment for businesses. Excludes retail single-unit listings and regulated farm inputs.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "bulk-grains-staples",
    parentKey: "wholesale-business-supplies",
    name: "Bulk Grains & Staples",
    slug: "bulk-grains-staples",
    description:
      "Grains, flours and staples sold in bulk with an explicit minimum order quantity. Excludes single retail packs and prepared foods. Traditional measures such as mudu, paint bucket, basket or bag must be converted by the seller to an explicit metric weight or volume; no automatic conversion is assumed.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("wholesale grains"),
      alias("bulk staples"),
      alias("grains en gros", "fr"),
      alias("grãos a granel", "pt"),
      alias("nafaka kwa jumla", "sw"),
      alias("حبوب بالجملة", "ar")
    ],
    attributes: [
      text("grain_type", "Grain type", true),
      number("net_weight_kg", "Net weight (kg)", true),
      number("minimum_order_quantity", "Minimum order quantity", true),
      select(
        "minimum_order_unit",
        "Minimum order unit",
        ["kg", "sack", "bag", "tonne", "Other"],
        true
      ),
      select("packaging", "Packaging", ["Sack", "Bag", "Bulk", "Other"], false)
    ],
    notes: [
      "Mudu, paint bucket, basket and bag are informal market measures with no standard cross-region conversion. Listings must state the exact metric weight or volume; do not infer a conversion."
    ]
  }),
  node({
    key: "business-packaging-supplies",
    parentKey: "wholesale-business-supplies",
    name: "Business Packaging Supplies",
    slug: "business-packaging-supplies",
    description:
      "Food-grade bags, containers, bottles, labels and cartons sold in business quantities. Excludes processing machinery and retail gift wrapping.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("packaging supplies"),
      alias("food packaging"),
      alias("emballages", "fr"),
      alias("embalagens", "pt"),
      alias("vifaa vya ufungaji", "sw"),
      alias("مستلزمات التعبئة", "ar")
    ],
    attributes: [
      select(
        "packaging_type",
        "Packaging type",
        ["Food-grade bag", "Container", "Bottle", "Label", "Carton", "Other"],
        true
      ),
      text("material", "Material"),
      number("pack_count", "Pack count")
    ]
  }),
  node({
    key: "store-equipment-fixtures",
    parentKey: "wholesale-business-supplies",
    name: "Store Equipment & Fixtures",
    slug: "store-equipment-fixtures",
    description:
      "Shelving, display units, scales, counters and checkout fixtures for shops. Excludes processing machinery and vehicles.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("shop fittings"),
      alias("store fixtures"),
      alias("équipement de magasin", "fr"),
      alias("equipamentos para loja", "pt"),
      alias("vifaa vya duka", "sw"),
      alias("معدات المتاجر", "ar")
    ],
    attributes: [
      select(
        "equipment_type",
        "Equipment type",
        ["Shelving", "Display unit", "Scale", "Counter", "Checkout fixture", "Other"],
        true
      ),
      text("material", "Material")
    ]
  })
];

/** Restricted leaves that must not be published in Nigeria yet. */
export const RESTRICTED_CATEGORY_KEYS = [
  "seeds-seedlings",
  "fertilizers-crop-nutrition"
] as const;

export const TAXONOMY_BY_KEY: ReadonlyMap<string, TaxonomyNode> = new Map(
  TAXONOMY_NODES.map((entry) => [entry.key, entry])
);

export function getTaxonomyNode(key: string): TaxonomyNode {
  const found = TAXONOMY_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown taxonomy key: ${key}`);
  return found;
}

export function childrenOf(parentKey: string | null): TaxonomyNode[] {
  return TAXONOMY_NODES.filter((entry) => entry.parentKey === parentKey).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

export interface TaxonomyTreeNode extends TaxonomyNode {
  children: TaxonomyTreeNode[];
}

export function buildTaxonomyTree(): TaxonomyTreeNode[] {
  const attach = (parentKey: string | null): TaxonomyTreeNode[] =>
    childrenOf(parentKey).map((entry) => ({
      ...entry,
      children: attach(entry.key)
    }));
  return attach(null);
}

export function getTaxonomyPath(key: string): TaxonomyNode[] {
  const path: TaxonomyNode[] = [];
  let current: TaxonomyNode | undefined = TAXONOMY_BY_KEY.get(key);
  if (!current) throw new Error(`Unknown taxonomy key: ${key}`);
  while (current) {
    path.unshift(current);
    current = current.parentKey ? TAXONOMY_BY_KEY.get(current.parentKey) : undefined;
  }
  return path;
}

export function taxonomyPathLabel(key: string, separator = " / "): string {
  return getTaxonomyPath(key)
    .map((entry) => entry.name)
    .join(separator);
}

/**
 * Validates the proposal in memory. Throws on duplicate keys, slugs, names or
 * aliases; broken parent/level links; invalid SELECT attributes; and missing
 * mandated paths. Used by the dry-run and seed before any database access.
 */
export function validateTaxonomy(nodes: TaxonomyNode[] = TAXONOMY_NODES): void {
  const keys = new Set<string>();
  const slugs = new Set<string>();
  const names = new Set<string>();
  const aliases = new Set<string>();
  const departmentKeys = new Set<string>();
  const byKey = new Map<string, TaxonomyNode>();

  for (const entry of nodes) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key)) {
      throw new Error(`Invalid taxonomy key: ${entry.key}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
      throw new Error(`Invalid taxonomy slug: ${entry.slug}`);
    }
    if (keys.has(entry.key)) throw new Error(`Duplicate taxonomy key: ${entry.key}`);
    if (slugs.has(entry.slug)) throw new Error(`Duplicate taxonomy slug: ${entry.slug}`);
    if (names.has(entry.name.toLocaleLowerCase())) {
      throw new Error(`Duplicate taxonomy name: ${entry.name}`);
    }
    keys.add(entry.key);
    slugs.add(entry.slug);
    names.add(entry.name.toLocaleLowerCase());
    byKey.set(entry.key, entry);

    if (entry.parentKey === null) {
      if (entry.level !== 0) throw new Error(`${entry.key}: root must be level 0`);
      departmentKeys.add(entry.key);
      if (entry.isSelectable) throw new Error(`${entry.key}: departments must not be selectable`);
      if (!entry.showOnHomepage) throw new Error(`${entry.key}: departments must show on homepage`);
    } else {
      const parent = byKey.get(entry.parentKey);
      if (!parent) throw new Error(`${entry.key}: parent ${entry.parentKey} must be defined first`);
      if (entry.level !== parent.level + 1) {
        throw new Error(`${entry.key}: level ${entry.level} does not follow parent ${parent.key}`);
      }
      if (parent.level >= 2) throw new Error(`${entry.key}: taxonomy must not exceed three levels`);
    }

    if (entry.level > 2) throw new Error(`${entry.key}: taxonomy must not exceed three levels`);
    if (entry.attributes.some((attribute) => attribute.type === "SELECT" && (!attribute.options || attribute.options.length < 2))) {
      throw new Error(`${entry.key}: SELECT attributes need at least two options`);
    }
    const attributeKeys = new Set<string>();
    for (const attribute of entry.attributes) {
      if (attributeKeys.has(attribute.key)) {
        throw new Error(`${entry.key}: duplicate attribute key ${attribute.key}`);
      }
      attributeKeys.add(attribute.key);
    }
    const countryCodes = new Set<string>();
    for (const rule of entry.countryRules) {
      if (!/^[A-Z]{2}$/.test(rule.countryCode)) {
        throw new Error(`${entry.key}: invalid country code ${rule.countryCode}`);
      }
      if (countryCodes.has(rule.countryCode)) {
        throw new Error(`${entry.key}: duplicate country rule ${rule.countryCode}`);
      }
      countryCodes.add(rule.countryCode);
    }
    for (const entryAlias of entry.aliases) {
      const identity = `${entryAlias.locale}:${entryAlias.alias.toLocaleLowerCase()}`;
      if (aliases.has(identity)) {
        throw new Error(`Duplicate alias ${entryAlias.alias} (${entryAlias.locale})`);
      }
      aliases.add(identity);
    }
  }

  if (departmentKeys.size !== 5) {
    throw new Error(`Expected exactly 5 departments, found ${departmentKeys.size}`);
  }
  for (const key of EXISTING_CATEGORY_KEYS) {
    if (!byKey.has(key)) throw new Error(`Missing existing category ${key}`);
  }
  const requiredPaths = [
    ["food", "grains-flours", "teff-flour"],
    ["food", "grains-flours", "cassava-products"],
    ["fashion", "fabrics-textiles", "african-print-fabrics"],
    ["agriculture", "farm-inputs", "seeds-seedlings"],
    ["agriculture", "processing-equipment", "cassava-processing-equipment"]
  ];
  for (const path of requiredPaths) {
    const leafKey = path[path.length - 1];
    const actual = getTaxonomyPath(leafKey).map((entry) => entry.key);
    if (actual.join("/") !== path.join("/")) {
      throw new Error(`Required path missing: ${path.join("/")} (found ${actual.join("/")})`);
    }
  }
  for (const key of RESTRICTED_CATEGORY_KEYS) {
    const entry = byKey.get(key);
    if (!entry) throw new Error(`Missing restricted leaf ${key}`);
    if (!entry.countryRules.some((rule) => rule.countryCode === "NG" && !rule.canPublish)) {
      throw new Error(`${key}: restricted leaf must set canPublish=false for NG`);
    }
  }
}
