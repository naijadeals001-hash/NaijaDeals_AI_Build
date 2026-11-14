/**
 * NaijaDeals marketplace taxonomy — authoritative proposal data.
 *
 * This module is the single source of truth for the hierarchical marketplace
 * taxonomy seeded by `scripts/taxonomy-seed.ts`. It contains no database or
 * framework imports so it can be consumed by seeds, dry-runs, APIs and tests.
 *
 * Structure: 11 departments (level 0) -> 37 categories (level 1) -> 111
 * subcategories (level 2). The nine existing active catalogue categories are
 * retained unchanged (id, slug, name, image and demo description) and are
 * reparented under the first five departments. Their products are never moved.
 *
 * Departments 6-11 (Health & Wellness; Baby, Kids & Toys; Sports & Outdoors;
 * Automotive & Motorcycle; Tools & Building Materials; Books & Stationery)
 * were added on 2026-11-13 to cover the agreed marketplace breadth. Regulated
 * items are modelled as leaves that are not publishable until country review is
 * recorded; wholesale remains a purchasing mode, not a department, and
 * origin/material/style remain attributes rather than extra departments.
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
 * The proposal's department keys, in display order. Validation requires the
 * root set to match exactly so an accidental extra root cannot slip in.
 */
export const DEPARTMENT_KEYS = [
  "electronics",
  "home",
  "fashion",
  "food",
  "agriculture",
  "health-wellness",
  "baby-kids-toys",
  "sports-outdoors",
  "automotive-motorcycle",
  "tools-building",
  "books-stationery"
] as const;

export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

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
  node({
    key: "smartwatches-wearables",
    parentKey: "phones-tablets",
    name: "Smartwatches & Wearables",
    slug: "smartwatches-wearables",
    description:
      "Smartwatches, fitness trackers and smart bands with companion apps. Excludes traditional watches and complete smartphones.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [alias("smartwatch"), alias("smart watch"), alias("fitness tracker"), alias("smart band")],
    attributes: [
      select("device_type", "Device type", ["Smartwatch", "Fitness tracker", "Smart band", "Other"], true),
      number("display_size_inches", "Display size (inches)"),
      text("strap_material", "Strap material"),
      text("water_resistance", "Water resistance")
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
    key: "headphones-personal-audio",
    parentKey: "electronics-appliances",
    name: "Headphones & Personal Audio",
    slug: "headphones-personal-audio",
    description:
      "Over-ear and in-ear headphones, earbuds, portable speakers and personal audio players. Excludes televisions, home theatre systems and phone accessories.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [alias("headphone"), alias("earphones"), alias("earbuds"), alias("portable speaker")],
    attributes: [
      select("product_type", "Product type", ["Headphones", "Earphones", "Portable speaker", "Player"], true),
      select("connectivity", "Connectivity", ["Bluetooth", "Wired", "Wireless", "Other"], true),
      number("battery_life_hours", "Battery life (hours)")
    ]
  }),
  node({
    key: "cameras-photography",
    parentKey: "electronics-appliances",
    name: "Cameras & Photography",
    slug: "cameras-photography",
    description:
      "Digital cameras, lenses, tripods and photography accessories. Excludes camera phones, dash cameras and security cameras.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 50,
    aliases: [alias("camera"), alias("DSLR"), alias("mirrorless"), alias("lens"), alias("tripod")],
    attributes: [
      select("camera_type", "Camera type", ["DSLR", "Mirrorless", "Compact", "Action", "Other"], true),
      text("sensor_type", "Sensor type"),
      number("megapixels", "Megapixels"),
      text("lens_mount", "Lens mount")
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
    key: "fragrance-perfume",
    parentKey: "beauty-personal-care",
    name: "Fragrance & Perfume",
    slug: "fragrance-perfume",
    description:
      "Perfume, eau de parfum, cologne, attar and fragrance gift sets. Excludes body lotions and medicated products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [alias("perfume"), alias("fragrance"), alias("eau de parfum"), alias("cologne"), alias("attar")],
    attributes: [
      select("fragrance_family", "Fragrance family", ["Floral", "Woody", "Oriental", "Fresh", "Citrus", "Other"], false),
      select("concentration", "Concentration", ["Eau de toilette", "Eau de parfum", "Parfum", "Cologne", "Attar", "Other"], false),
      number("volume_ml", "Volume (ml)"),
      select("target_gender", "Target", ["Women", "Men", "Unisex"], false)
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
    key: "pesticides-crop-protection",
    parentKey: "farm-inputs",
    name: "Pesticides & Crop Protection",
    slug: "pesticides-crop-protection",
    description:
      "Herbicides, insecticides, fungicides and other crop-protection chemicals sold in sealed, labelled packs. Excludes veterinary medicines, household insecticides, fertilizers and unregistered or decanted products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 35,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("pesticide"),
      alias("herbicide"),
      alias("insecticide"),
      alias("fungicide"),
      alias("pesticide", "fr"),
      alias("herbicide", "fr"),
      alias("pesticida", "pt"),
      alias("herbicida", "pt"),
      alias("dawa ya wadudu", "sw"),
      alias("مبيدات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Herbicide", "Insecticide", "Fungicide", "Nematicide", "Other"],
        true
      ),
      text("active_ingredient", "Active ingredient", true),
      select("formulation", "Formulation", ["Liquid", "Granule", "Powder", "Other"], true),
      number("pack_size_litres", "Pack size (litres)"),
      text("registration_number", "Registration number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Pesticides are regulated and require registration. Publishing in Nigeria requires reviewer verification of the registration, approved label and sealed retail packaging; decanted or unregistered products are not permitted. This leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Hazard class, PPE guidance and re-entry intervals must be shown; no household or veterinary use claims."
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
  }),

  // -------------------------------------------------------------------------
  // 6. Health & Wellness
  // -------------------------------------------------------------------------
  node({
    key: "health-wellness",
    parentKey: null,
    name: "Health & Wellness",
    slug: "health-wellness",
    description:
      "Medicines, supplements, monitoring devices and first-aid supplies. Excludes beauty cosmetics (Beauty & Personal Care), fitness equipment (Sports & Outdoors) and prepared meals. Regulated leaves are not publishable until the country review is recorded.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 60
  }),
  node({
    key: "medicines-treatments",
    parentKey: "health-wellness",
    name: "Medicines & Treatments",
    slug: "medicines-treatments",
    description:
      "Over-the-counter medicines and topical treatments. Excludes prescription-only medicines, unregistered products and veterinary medicines.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "otc-medicines-treatments",
    parentKey: "medicines-treatments",
    name: "Over-the-Counter Medicines",
    slug: "otc-medicines-treatments",
    description:
      "Non-prescription pain relievers, antimalarials, antihistamines, cough remedies and topical treatments sold in their original sealed pack. Excludes prescription-only medicines, injectables, veterinary medicines and unregistered products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("over-the-counter medicine"),
      alias("pain relievers"),
      alias("antimalarials"),
      alias("médicaments en vente libre", "fr"),
      alias("antipaludiques", "fr"),
      alias("medicamentos sem receita", "pt"),
      alias("antimaláricos", "pt"),
      alias("dawa za kupunguza maumivu", "sw"),
      alias("أدوية بدون وصفة", "ar")
    ],
    attributes: [
      select(
        "dosage_form",
        "Dosage form",
        ["Tablet", "Capsule", "Syrup", "Suspension", "Cream", "Ointment", "Other"],
        true
      ),
      text("active_ingredient", "Active ingredient", true),
      text("pack_size", "Pack size", true),
      text("registration_number", "Registration number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Medicines are regulated by NAFDAC. Publishing in Nigeria requires reviewer verification of product registration, sealed retail packaging and permitted import status; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. No therapeutic claims beyond the approved label; prescription-only medicines are not permitted."
    ]
  }),
  node({
    key: "vitamins-supplements",
    parentKey: "health-wellness",
    name: "Vitamins & Supplements",
    slug: "vitamins-supplements",
    description:
      "Dietary supplements, vitamins, minerals and herbal products. Excludes medicines, prescription nutrition and products making unverified therapeutic claims.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "vitamins-minerals-supplements",
    parentKey: "vitamins-supplements",
    name: "Vitamins & Minerals",
    slug: "vitamins-minerals-supplements",
    description:
      "Multivitamins, single vitamins, minerals and sports-nutrition supplements in sealed retail packs. Excludes medicines, infant formula and injectable products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("vitamins"),
      alias("multivitamins"),
      alias("dietary supplements"),
      alias("vitamines", "fr"),
      alias("compléments alimentaires", "fr"),
      alias("vitaminas", "pt"),
      alias("suplementos alimentares", "pt"),
      alias("vitamini", "sw"),
      alias("فيتامينات", "ar")
    ],
    attributes: [
      select(
        "supplement_type",
        "Supplement type",
        ["Multivitamin", "Single vitamin", "Mineral", "Sports nutrition", "Other"],
        true
      ),
      text("active_ingredient", "Active ingredient", true),
      number("servings", "Servings per pack"),
      text("registration_number", "Registration number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Supplements are regulated and require registration before sale in Nigeria. Publishing requires reviewer verification; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Health claims must not exceed the approved label."
    ]
  }),
  node({
    key: "herbal-traditional-remedies",
    parentKey: "vitamins-supplements",
    name: "Herbal & Traditional Remedies",
    slug: "herbal-traditional-remedies",
    description:
      "Herbal powders, teas, bitters and traditional preparations sold as wellness products. Excludes medicines, raw agricultural produce and products claiming to cure disease.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("herbal remedy"),
      alias("herbal medicine"),
      alias("traditional remedy"),
      alias("remèdes à base de plantes", "fr"),
      alias("remédios à base de plantas", "pt"),
      alias("dawa za mitishamba", "sw"),
      alias("أدوية عشبية", "ar")
    ],
    attributes: [
      select("form", "Form", ["Powder", "Tea", "Bitters", "Capsule", "Paste", "Other"], true),
      text("botanical_ingredients", "Botanical ingredients", true),
      number("net_weight_g", "Net weight (g)")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Herbal preparations with health claims are regulated in Nigeria. Publishing requires reviewer verification and must not claim to cure disease; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. No disease-treatment claims; pregnancy and interaction warnings are required from the seller."
    ]
  }),
  node({
    key: "medical-devices-aids",
    parentKey: "health-wellness",
    name: "Medical Devices & Aids",
    slug: "medical-devices-aids",
    description:
      "Home monitoring devices, mobility aids and first-aid supplies. Excludes medicines, hospital-grade equipment and implanted devices.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "health-monitors",
    parentKey: "medical-devices-aids",
    name: "Health Monitors",
    slug: "health-monitors",
    description:
      "Blood-pressure monitors, thermometers, pulse oximeters and glucose meters for home use. Excludes hospital-grade monitors, test strips sold alone and implanted devices.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("blood pressure monitor"),
      alias("thermometer"),
      alias("pulse oximeter"),
      alias("glucose meter"),
      alias("tensiomètre", "fr"),
      alias("thermomètre", "fr"),
      alias("medidor de pressão", "pt"),
      alias("termómetro", "pt"),
      alias("kipimo cha shinikizo la damu", "sw"),
      alias("جهاز قياس ضغط الدم", "ar")
    ],
    attributes: [
      select(
        "device_type",
        "Device type",
        ["Blood-pressure monitor", "Thermometer", "Pulse oximeter", "Glucose meter", "Other"],
        true
      ),
      select("power_source", "Power source", ["Battery", "Mains", "Rechargeable", "Other"], false),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Medical devices are regulated by NAFDAC. Publishing in Nigeria requires reviewer verification of the device registration; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Readings are not a diagnosis; listings must not claim to replace clinical advice."
    ]
  }),
  node({
    key: "mobility-support-aids",
    parentKey: "medical-devices-aids",
    name: "Mobility & Support Aids",
    slug: "mobility-support-aids",
    description:
      "Wheelchairs, walking frames, crutches, canes and orthopaedic supports. Excludes physiotherapy services and custom-fitted prosthetics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("wheelchair"),
      alias("crutches"),
      alias("walking frame"),
      alias("fauteuil roulant", "fr"),
      alias("béquilles", "fr"),
      alias("cadeira de rodas", "pt"),
      alias("muletas", "pt"),
      alias("kiti cha magurudumu", "sw"),
      alias("كرسي متحرك", "ar")
    ],
    attributes: [
      select(
        "aid_type",
        "Aid type",
        ["Wheelchair", "Walking frame", "Crutches", "Cane", "Orthopaedic support", "Other"],
        true
      ),
      number("max_user_weight_kg", "Maximum user weight (kg)"),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Medical devices and assistive products are regulated in Nigeria. Publishing requires reviewer verification; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Sizing and maximum user weight must be stated explicitly."
    ]
  }),
  node({
    key: "first-aid-supplies",
    parentKey: "medical-devices-aids",
    name: "First-Aid Supplies",
    slug: "first-aid-supplies",
    description:
      "Non-medicated bandages, dressings, plasters, gauze, slings and first-aid kits. Excludes antiseptics, medicated creams and medicines, which belong to Over-the-Counter Medicines.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("first aid kit"),
      alias("bandages"),
      alias("plasters"),
      alias("gauze"),
      alias("trousse de premiers secours", "fr"),
      alias("pansements", "fr"),
      alias("kit de primeiros socorros", "pt"),
      alias("ligaduras", "pt"),
      alias("vifaa vya huduma ya kwanza", "sw"),
      alias("إسعافات أولية", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["First-aid kit", "Bandage", "Plaster", "Gauze / dressing", "Sling", "Other"],
        true
      ),
      number("pack_count", "Pack count"),
      select("sterility", "Sterility", ["Sterile", "Non-sterile", "Not stated"], false)
    ],
    notes: [
      "Non-medicated supplies only. Antiseptics and medicated creams must be listed under the restricted Over-the-Counter Medicines leaf."
    ]
  }),

  // -------------------------------------------------------------------------
  // 7. Baby, Kids & Toys
  // -------------------------------------------------------------------------
  node({
    key: "baby-kids-toys",
    parentKey: null,
    name: "Baby, Kids & Toys",
    slug: "baby-kids-toys",
    description:
      "Nursery gear, feeding, hygiene and toys for babies and children. Excludes children's clothing and footwear, which remain under Fashion & Accessories, and school books, which belong to Books & Stationery.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 70
  }),
  node({
    key: "baby-gear-nursery",
    parentKey: "baby-kids-toys",
    name: "Baby Gear & Nursery",
    slug: "baby-gear-nursery",
    description:
      "Strollers, child car seats, cots and nursery furniture. Excludes toys, feeding products and children's clothing.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "strollers-prams",
    parentKey: "baby-gear-nursery",
    name: "Strollers & Prams",
    slug: "strollers-prams",
    description:
      "Pushchairs, strollers, prams and travel systems. Excludes child car seats and ride-on toys.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("stroller"),
      alias("pram"),
      alias("pushchair"),
      alias("buggy"),
      alias("poussette", "fr"),
      alias("carrinho de bebé", "pt"),
      alias("kigari cha mtoto", "sw"),
      alias("عربة أطفال", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Stroller", "Pram", "Pushchair", "Travel system", "Other"],
        true
      ),
      select("folding", "Folding", ["One-hand fold", "Two-hand fold", "Not folding"], false),
      number("max_child_weight_kg", "Maximum child weight (kg)")
    ],
    notes: [
      "Safety harness and brake condition must be stated for used items; the seller is responsible for compliance with applicable child-product standards."
    ]
  }),
  node({
    key: "car-seats-boosters",
    parentKey: "baby-gear-nursery",
    name: "Child Car Seats & Boosters",
    slug: "car-seats-boosters",
    description:
      "Infant carriers, child car seats and booster cushions for vehicle use. Excludes strollers and general vehicle parts.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("child car seat"),
      alias("booster seat"),
      alias("infant carrier"),
      alias("siège auto", "fr"),
      alias("rehausseur", "fr"),
      alias("cadeira auto", "pt"),
      alias("assento elevatório", "pt"),
      alias("kiti cha gari cha mtoto", "sw"),
      alias("مقعد سيارة للأطفال", "ar")
    ],
    attributes: [
      select(
        "seat_group",
        "Seat group",
        ["Group 0+", "Group 1", "Group 2", "Group 3", "Combination", "Other"],
        true
      ),
      select("installation", "Installation", ["ISOFIX", "Seat belt", "Both", "Other"], true),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Child restraint systems are safety-critical products. Publishing in Nigeria requires reviewer verification of a recognised safety standard marking and the absence of crash damage; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used seats must disclose age, history and any damage; no seat with an unknown crash history may be listed."
    ]
  }),
  node({
    key: "cots-nursery-furniture",
    parentKey: "baby-gear-nursery",
    name: "Cots & Nursery Furniture",
    slug: "cots-nursery-furniture",
    description:
      "Cots, cribs, bedside sleepers, changing tables and nursery storage. Excludes mattresses sold as general bedding and adult bedroom furniture.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("cot"),
      alias("crib"),
      alias("changing table"),
      alias("lit bébé", "fr"),
      alias("table à langer", "fr"),
      alias("berço", "pt"),
      alias("trocador", "pt"),
      alias("kitanda cha mtoto", "sw"),
      alias("سرير أطفال", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Cot", "Crib", "Bedside sleeper", "Changing table", "Nursery storage", "Other"],
        true
      ),
      select("material", "Material", ["Wood", "Metal", "MDF", "Plastic", "Other"], false),
      text("assembled_dimensions", "Assembled dimensions (L x W x H)")
    ]
  }),
  node({
    key: "baby-feeding-care",
    parentKey: "baby-kids-toys",
    name: "Baby Feeding & Care",
    slug: "baby-feeding-care",
    description:
      "Infant formula, bottles, sterilising, nappies and baby hygiene. Excludes medicines, children's clothing and nursery furniture.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "infant-formula",
    parentKey: "baby-feeding-care",
    name: "Infant Formula",
    slug: "infant-formula",
    description:
      "First infant formula, follow-on formula and specialised formula in sealed retail packaging. Excludes breast-milk substitutes marketed for children over 36 months, medicines and homemade preparations.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("baby formula"),
      alias("follow-on formula"),
      alias("lait infantile", "fr"),
      alias("lait en poudre pour bébé", "fr"),
      alias("leite em pó infantil", "pt"),
      alias("leite de fórmula", "pt"),
      alias("maziwa ya watoto", "sw"),
      alias("حليب الأطفال", "ar")
    ],
    attributes: [
      select(
        "formula_stage",
        "Formula stage",
        ["Stage 1 (0-6 months)", "Stage 2 (6-12 months)", "Stage 3 (12+ months)", "Specialised", "Other"],
        true
      ),
      number("net_weight_g", "Net weight (g)", true),
      text("batch_number", "Batch number"),
      text("expiry_date", "Expiry date")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Infant formula is a regulated food for special nutritional use. Publishing in Nigeria requires reviewer verification of NAFDAC registration, batch traceability and an unbroken sealed pack; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Listings must not discourage breastfeeding or make unapproved health claims; batch and expiry evidence are required."
    ]
  }),
  node({
    key: "bottles-teats-sterilisers",
    parentKey: "baby-feeding-care",
    name: "Bottles, Teats & Sterilisers",
    slug: "bottles-teats-sterilisers",
    description:
      "Baby bottles, teats, breast pumps, sterilisers and bottle-cleaning accessories. Excludes infant formula and general kitchen appliances.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("baby bottle"),
      alias("teat"),
      alias("steriliser"),
      alias("breast pump"),
      alias("biberon", "fr"),
      alias("stérilisateur", "fr"),
      alias("biberão", "pt"),
      alias("esterilizador", "pt"),
      alias("chupa ya mtoto", "sw"),
      alias("زجاجة رضاعة", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Bottle", "Teat", "Steriliser", "Breast pump", "Cleaning accessory", "Other"],
        true
      ),
      select("material", "Material", ["BPA-free plastic", "Glass", "Silicone", "Stainless steel", "Other"], false),
      number("capacity_ml", "Capacity (ml)")
    ],
    notes: [
      "Materials must be food-contact safe and BPA status stated where applicable."
    ]
  }),
  node({
    key: "nappies-wipes",
    parentKey: "baby-feeding-care",
    name: "Nappies & Baby Wipes",
    slug: "nappies-wipes",
    description:
      "Disposable and reusable nappies, nappy liners and baby wipes. Excludes medicated nappy-rash creams and adult incontinence products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("nappies"),
      alias("diapers"),
      alias("baby wipes"),
      alias("couches bébé", "fr"),
      alias("lingettes bébé", "fr"),
      alias("fraldas", "pt"),
      alias("toalhetes de bebé", "pt"),
      alias("nebi", "sw"),
      alias("حفاضات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Disposable nappy", "Reusable nappy", "Nappy liner", "Baby wipes", "Other"],
        true
      ),
      select("size", "Size", ["Newborn", "S", "M", "L", "XL", "Other"], false),
      number("pack_count", "Pack count")
    ]
  }),
  node({
    key: "baby-bathing-skincare",
    parentKey: "baby-feeding-care",
    name: "Baby Bathing & Skincare",
    slug: "baby-bathing-skincare",
    description:
      "Baby wash, shampoo, lotion, barrier balm and bathing accessories formulated for infants. Excludes medicated creams and adult cosmetics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("baby wash"),
      alias("baby lotion"),
      alias("baby shampoo"),
      alias("gel lavant bébé", "fr"),
      alias("lotion bébé", "fr"),
      alias("gel de banho bebé", "pt"),
      alias("loção para bebé", "pt"),
      alias("sabuni ya mtoto", "sw"),
      alias("مستلزمات استحمام الأطفال", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Baby wash", "Baby shampoo", "Baby lotion", "Barrier balm", "Bathing accessory", "Other"],
        true
      ),
      select("suitability", "Suitability", ["Newborn", "Sensitive skin", "All ages", "Other"], false),
      number("volume_ml", "Volume (ml)")
    ],
    notes: [
      "No unverified therapeutic claims. Medicated nappy-rash products belong under medicines and remain restricted."
    ]
  }),
  node({
    key: "toys-play",
    parentKey: "baby-kids-toys",
    name: "Toys & Play",
    slug: "toys-play",
    description:
      "Toys, games and play equipment for babies and children. Excludes video games and consoles, which belong to Gaming, and collectible adult models sold as decorative items.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "baby-toddler-toys",
    parentKey: "toys-play",
    name: "Baby & Toddler Toys",
    slug: "baby-toddler-toys",
    description:
      "Teething toys, rattles, stacking toys and soft play for children under three. Excludes small-parts toys unsuitable for young children.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("baby toys"),
      alias("teething toys"),
      alias("stacking toys"),
      alias("jouets pour bébé", "fr"),
      alias("jouets d'éveil", "fr"),
      alias("brinquedos para bebé", "pt"),
      alias("vifaa vya kuchezea vya watoto wachanga", "sw"),
      alias("ألعاب أطفال صغار", "ar")
    ],
    attributes: [
      select(
        "toy_type",
        "Toy type",
        ["Teether", "Rattle", "Stacking toy", "Soft play", "Activity centre", "Other"],
        true
      ),
      number("recommended_age_months", "Recommended age (months)", true),
      text("safety_marking", "Safety marking")
    ],
    notes: [
      "Choking-hazard warnings and recommended age are mandatory. No loose small parts for children under three."
    ]
  }),
  node({
    key: "educational-stem-toys",
    parentKey: "toys-play",
    name: "Educational & STEM Toys",
    slug: "educational-stem-toys",
    description:
      "Building blocks, puzzles, science kits and learning toys. Excludes school textbooks and classroom furniture.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("stem toys"),
      alias("building blocks"),
      alias("learning toys"),
      alias("jouets éducatifs", "fr"),
      alias("jouets de construction", "fr"),
      alias("brinquedos educativos", "pt"),
      alias("blocos de construção", "pt"),
      alias("vifaa vya kuchezea vya kuelimisha", "sw"),
      alias("ألعاب تعليمية", "ar")
    ],
    attributes: [
      select(
        "toy_type",
        "Toy type",
        ["Building blocks", "Puzzle", "Science kit", "Learning toy", "Other"],
        true
      ),
      number("recommended_age_years", "Recommended age (years)", true),
      number("piece_count", "Number of pieces")
    ]
  }),
  node({
    key: "ride-on-toys",
    parentKey: "toys-play",
    name: "Ride-On Toys",
    slug: "ride-on-toys",
    description:
      "Balance bikes, tricycles, pedal cars and ride-on toys for children. Excludes adult bicycles and motorised road vehicles.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("ride-on car"),
      alias("balance bike"),
      alias("tricycle"),
      alias("porteur enfant", "fr"),
      alias("tricycle enfant", "fr"),
      alias("triciclo infantil", "pt"),
      alias("baiskeli ya mtoto", "sw"),
      alias("دراجة أطفال", "ar")
    ],
    attributes: [
      select(
        "toy_type",
        "Toy type",
        ["Balance bike", "Tricycle", "Pedal car", "Ride-on", "Other"],
        true
      ),
      number("max_child_weight_kg", "Maximum child weight (kg)"),
      select("power", "Power", ["Manual", "Battery", "Other"], true)
    ],
    notes: [
      "Battery-powered ride-ons must state voltage and charger requirements; helmets are not included unless explicitly listed."
    ]
  }),
  node({
    key: "dolls-plush-toys",
    parentKey: "toys-play",
    name: "Dolls & Plush Toys",
    slug: "dolls-plush-toys",
    description:
      "Dolls, action figures, teddy bears and soft toys. Excludes video games, collectible display models and pet toys.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("doll"),
      alias("teddy bear"),
      alias("soft toy"),
      alias("action figure"),
      alias("poupée", "fr"),
      alias("peluche", "fr"),
      alias("boneca", "pt"),
      alias("peluche", "pt"),
      alias("doli", "sw"),
      alias("دمية", "ar")
    ],
    attributes: [
      select(
        "toy_type",
        "Toy type",
        ["Doll", "Action figure", "Teddy bear", "Plush toy", "Other"],
        true
      ),
      number("height_cm", "Height (cm)"),
      select("recommended_age", "Recommended age", ["0-3", "3-6", "6-12", "12+", "Not stated"], false)
    ]
  }),

  // -------------------------------------------------------------------------
  // 8. Sports & Outdoors
  // -------------------------------------------------------------------------
  node({
    key: "sports-outdoors",
    parentKey: null,
    name: "Sports & Outdoors",
    slug: "sports-outdoors",
    description:
      "Fitness equipment, ball and racquet sports, camping gear and cycling. Excludes sportswear and footwear, which remain under Fashion & Accessories, and fitness services or coaching.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 80
  }),
  node({
    key: "fitness-strength",
    parentKey: "sports-outdoors",
    name: "Fitness & Strength",
    slug: "fitness-strength",
    description:
      "Home gym equipment, free weights and exercise accessories. Excludes sportswear, gym memberships and commercial gym installations.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "home-gym-weights",
    parentKey: "fitness-strength",
    name: "Home Gym & Weights",
    slug: "home-gym-weights",
    description:
      "Dumbbells, barbells, kettlebells, weight plates and benches for home training. Excludes cardio machines and commercial gym equipment.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("dumbbells"),
      alias("barbell"),
      alias("kettlebell"),
      alias("weight plates"),
      alias("haltères", "fr"),
      alias("barre de musculation", "fr"),
      alias("halteres", "pt"),
      alias("pesos de ginásio", "pt"),
      alias("vyuma vya mazoezi", "sw"),
      alias("أثقال رياضية", "ar")
    ],
    attributes: [
      select(
        "equipment_type",
        "Equipment type",
        ["Dumbbell", "Barbell", "Kettlebell", "Weight plate", "Bench", "Set", "Other"],
        true
      ),
      number("total_weight_kg", "Total weight (kg)", true),
      select("adjustable", "Adjustable", ["Yes", "No"], false)
    ],
    notes: [
      "Actual total weight must be stated; nominal plate sizes alone are not sufficient."
    ]
  }),
  node({
    key: "yoga-fitness-accessories",
    parentKey: "fitness-strength",
    name: "Yoga & Fitness Accessories",
    slug: "yoga-fitness-accessories",
    description:
      "Yoga mats, resistance bands, exercise balls, skipping ropes and small fitness accessories. Excludes weights, cardio machines and clothing.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("yoga mat"),
      alias("resistance bands"),
      alias("exercise ball"),
      alias("tapis de yoga", "fr"),
      alias("bandes de résistance", "fr"),
      alias("tapete de ioga", "pt"),
      alias("bandas de resistência", "pt"),
      alias("mkeka wa yoga", "sw"),
      alias("سجادة يوغا", "ar")
    ],
    attributes: [
      select(
        "accessory_type",
        "Accessory type",
        ["Yoga mat", "Resistance band", "Exercise ball", "Skipping rope", "Other"],
        true
      ),
      select("material", "Material", ["PVC", "TPE", "Rubber", "Fabric", "Other"], false),
      number("thickness_mm", "Thickness (mm)")
    ]
  }),
  node({
    key: "cardio-machines",
    parentKey: "fitness-strength",
    name: "Cardio Machines",
    slug: "cardio-machines",
    description:
      "Treadmills, exercise bikes, rowing machines and elliptical trainers for home use. Excludes commercial gym installations and outdoor bicycles.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("treadmill"),
      alias("exercise bike"),
      alias("rowing machine"),
      alias("elliptical trainer"),
      alias("tapis de course", "fr"),
      alias("vélo d'appartement", "fr"),
      alias("passadeira de corrida", "pt"),
      alias("bicicleta estática", "pt"),
      alias("mashine ya kukimbia", "sw"),
      alias("جهاز مشي رياضي", "ar")
    ],
    attributes: [
      select(
        "machine_type",
        "Machine type",
        ["Treadmill", "Exercise bike", "Rowing machine", "Elliptical", "Other"],
        true
      ),
      number("max_user_weight_kg", "Maximum user weight (kg)"),
      select("power_source", "Power source", ["Manual", "Mains", "Battery", "Other"], true)
    ],
    notes: [
      "Assembly requirements and maximum user weight must be stated. Electrical machines require a compatible plug and voltage disclosure."
    ]
  }),
  node({
    key: "ball-racquet-sports",
    parentKey: "sports-outdoors",
    name: "Ball & Racquet Sports",
    slug: "ball-racquet-sports",
    description:
      "Football, basketball, tennis, badminton and table-tennis equipment. Excludes sportswear, footwear and spectator merchandise.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "football-basketball-equipment",
    parentKey: "ball-racquet-sports",
    name: "Football & Basketball",
    slug: "football-basketball-equipment",
    description:
      "Footballs, basketballs, goal posts, nets, pumps and training equipment. Excludes sportswear, footwear and stadium installations.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("football"),
      alias("soccer ball"),
      alias("basketball"),
      alias("goal posts"),
      alias("ballon de football", "fr"),
      alias("ballon de basket", "fr"),
      alias("bola de futebol", "pt"),
      alias("bola de basquetebol", "pt"),
      alias("mpira wa miguu", "sw"),
      alias("كرة قدم", "ar")
    ],
    attributes: [
      select(
        "equipment_type",
        "Equipment type",
        ["Football", "Basketball", "Goal post", "Net", "Pump", "Training aid", "Other"],
        true
      ),
      select("size", "Size", ["Size 3", "Size 4", "Size 5", "Size 6", "Size 7", "Other"], false),
      select("surface", "Surface", ["Indoor", "Outdoor", "All-weather", "Not stated"], false)
    ]
  }),
  node({
    key: "racquet-sports-equipment",
    parentKey: "ball-racquet-sports",
    name: "Racquet Sports",
    slug: "racquet-sports-equipment",
    description:
      "Tennis, badminton, squash and table-tennis racquets, bats, nets and balls. Excludes court construction and apparel.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("tennis racket"),
      alias("badminton"),
      alias("table tennis"),
      alias("squash racket"),
      alias("raquette de tennis", "fr"),
      alias("badminton", "fr"),
      alias("tenis de mesa", "pt"),
      alias("raquete de ténis", "pt"),
      alias("raketi ya tenisi", "sw"),
      alias("مضرب تنس", "ar")
    ],
    attributes: [
      select(
        "sport",
        "Sport",
        ["Tennis", "Badminton", "Squash", "Table tennis", "Other"],
        true
      ),
      select(
        "item_type",
        "Item type",
        ["Racket", "Bat", "Net", "Ball / shuttlecock", "Accessory", "Other"],
        true
      ),
      text("grip_size", "Grip size")
    ]
  }),
  node({
    key: "outdoor-camping",
    parentKey: "sports-outdoors",
    name: "Outdoor & Camping",
    slug: "outdoor-camping",
    description:
      "Tents, sleeping gear, camp cooking and outdoor accessories. Excludes hiking clothing and footwear, and vehicle camping equipment.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "tents-sleeping-bags",
    parentKey: "outdoor-camping",
    name: "Tents & Sleeping Gear",
    slug: "tents-sleeping-bags",
    description:
      "Tents, sleeping bags, sleeping mats and camping furniture. Excludes awnings and vehicle roof tents.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("tent"),
      alias("sleeping bag"),
      alias("camping chair"),
      alias("tente de camping", "fr"),
      alias("sac de couchage", "fr"),
      alias("tenda de campismo", "pt"),
      alias("saco-cama", "pt"),
      alias("hema ya kambi", "sw"),
      alias("خيمة تخييم", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Tent", "Sleeping bag", "Sleeping mat", "Camping chair", "Other"],
        true
      ),
      number("capacity_persons", "Capacity (persons)"),
      select("season_rating", "Season rating", ["1-season", "2-season", "3-season", "4-season", "Not stated"], false)
    ]
  }),
  node({
    key: "camping-cooking-coolers",
    parentKey: "outdoor-camping",
    name: "Camping Cooking & Coolers",
    slug: "camping-cooking-coolers",
    description:
      "Portable camping stoves, cool boxes, flasks, water containers and outdoor cookware. Excludes home kitchen appliances and fuel sold separately.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("camping stove"),
      alias("cool box"),
      alias("flask"),
      alias("réchaud de camping", "fr"),
      alias("glacière", "fr"),
      alias("fogão de campismo", "pt"),
      alias("geleira portátil", "pt"),
      alias("jiko la kambi", "sw"),
      alias("موقد تخييم", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Stove", "Cool box", "Flask", "Water container", "Outdoor cookware", "Other"],
        true
      ),
      select("fuel_type", "Fuel type", ["Gas", "Petrol", "Electric", "Charcoal", "Not applicable"], false),
      number("capacity_litres", "Capacity (litres)")
    ],
    notes: [
      "Fuel is not included unless explicitly listed. Gas canisters must state compatibility and safety markings."
    ]
  }),
  node({
    key: "cycling-scooters",
    parentKey: "sports-outdoors",
    name: "Cycling & Scooters",
    slug: "cycling-scooters",
    description:
      "Bicycles, cycling helmets, protection and cycling accessories. Excludes motorcycles and motorised road vehicles, which belong to Automotive & Motorcycle.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 40
  }),
  node({
    key: "bicycles",
    parentKey: "cycling-scooters",
    name: "Bicycles",
    slug: "bicycles",
    description:
      "Mountain, road, hybrid and children's bicycles sold complete. Excludes motorcycle parts, electric scooters and ride-on toys for toddlers.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("bicycle"),
      alias("bike"),
      alias("mountain bike"),
      alias("road bike"),
      alias("vélo", "fr"),
      alias("vélo tout-terrain", "fr"),
      alias("bicicleta", "pt"),
      alias("bicicleta de montanha", "pt"),
      alias("baiskeli", "sw"),
      alias("دراجة هوائية", "ar")
    ],
    attributes: [
      select(
        "bike_type",
        "Bike type",
        ["Mountain", "Road", "Hybrid", "Children's", "Folding", "Other"],
        true
      ),
      number("wheel_size_inches", "Wheel size (inches)"),
      number("frame_size_cm", "Frame size (cm)"),
      select("condition", "Condition", ["New", "Used"], true)
    ],
    notes: [
      "Used bicycles must disclose frame damage, brake condition and wheel trueness."
    ]
  }),
  node({
    key: "cycling-helmets-protection",
    parentKey: "cycling-scooters",
    name: "Cycling Helmets & Protection",
    slug: "cycling-helmets-protection",
    description:
      "Cycling helmets, knee pads, elbow pads and reflective protection. Excludes motorcycle helmets and general workwear.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    reviewRequired: true,
    aliases: [
      alias("cycling helmet"),
      alias("knee pads"),
      alias("elbow pads"),
      alias("casque de vélo", "fr"),
      alias("genouillères", "fr"),
      alias("capacete de bicicleta", "pt"),
      alias("joelheiras", "pt"),
      alias("kofia ya baiskeli", "sw"),
      alias("خوذة دراجة", "ar")
    ],
    attributes: [
      select(
        "protection_type",
        "Protection type",
        ["Helmet", "Knee pad", "Elbow pad", "Reflective vest", "Other"],
        true
      ),
      text("size", "Size"),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: true,
        note:
          "Publishable, but helmet listings must state a recognised safety-standard marking and must not offer a helmet with unknown crash history."
      }
    ],
    notes: [
      "Safety equipment: a recognised standards marking is mandatory in the listing description."
    ]
  }),
  node({
    key: "cycling-accessories",
    parentKey: "cycling-scooters",
    name: "Cycling Accessories",
    slug: "cycling-accessories",
    description:
      "Bike pumps, locks, lights, saddles, racks and repair kits. Excludes complete bicycles and motorcycle accessories.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("bike pump"),
      alias("bike lock"),
      alias("bicycle lights"),
      alias("bike saddle"),
      alias("antivol vélo", "fr"),
      alias("pompe à vélo", "fr"),
      alias("cadeado de bicicleta", "pt"),
      alias("bomba de ar para bicicleta", "pt"),
      alias("kufuli ya baiskeli", "sw"),
      alias("ملحقات الدراجة", "ar")
    ],
    attributes: [
      select(
        "accessory_type",
        "Accessory type",
        ["Pump", "Lock", "Light", "Saddle", "Rack", "Repair kit", "Other"],
        true
      ),
      text("compatible_bike_type", "Compatible bike type")
    ]
  }),

  // -------------------------------------------------------------------------
  // 9. Automotive & Motorcycle
  // -------------------------------------------------------------------------
  node({
    key: "automotive-motorcycle",
    parentKey: null,
    name: "Automotive & Motorcycle",
    slug: "automotive-motorcycle",
    description:
      "Car and motorcycle parts, riding protection, care products and in-car accessories. Excludes complete vehicles, vehicle sales, ride-hailing services and generators, which belong to Power & Solar.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 90
  }),
  node({
    key: "car-parts",
    parentKey: "automotive-motorcycle",
    name: "Car Parts",
    slug: "car-parts",
    description:
      "Mechanical, electrical and body parts for passenger cars and light commercial vehicles. Excludes complete vehicles, motorcycle parts and heavy-truck components.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "brake-system-parts",
    parentKey: "car-parts",
    name: "Brake System Parts",
    slug: "brake-system-parts",
    description:
      "Brake pads, discs, shoes, drums, callipers, brake fluid and brake lines. Excludes tyres and suspension components.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("brake pads"),
      alias("brake discs"),
      alias("brake shoes"),
      alias("brake fluid"),
      alias("plaquettes de frein", "fr"),
      alias("disques de frein", "fr"),
      alias("pastilhas de travão", "pt"),
      alias("discos de travão", "pt"),
      alias("pedi za breki", "sw"),
      alias("فحمات فرامل", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Brake pad", "Brake disc", "Brake shoe", "Drum", "Calliper", "Brake fluid", "Brake line", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility", true),
      text("part_number", "Part number"),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Braking components are safety-critical. Publishing in Nigeria requires reviewer verification of vehicle compatibility and a recognised standards marking; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used brake parts are not permitted."
    ]
  }),
  node({
    key: "suspension-steering-parts",
    parentKey: "car-parts",
    name: "Suspension & Steering Parts",
    slug: "suspension-steering-parts",
    description:
      "Shock absorbers, struts, control arms, ball joints, tie rods and steering racks. Excludes brake components, tyres and wheels.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("shock absorbers"),
      alias("control arms"),
      alias("tie rod"),
      alias("ball joint"),
      alias("amortisseurs", "fr"),
      alias("rotules de direction", "fr"),
      alias("amortecedores", "pt"),
      alias("braços de suspensão", "pt"),
      alias("vifaa vya kusimamisha gari", "sw"),
      alias("قطع نظام التعليق", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Shock absorber", "Strut", "Control arm", "Ball joint", "Tie rod", "Steering rack", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility", true),
      text("part_number", "Part number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Suspension and steering components are safety-critical. Publishing in Nigeria requires reviewer verification of compatibility and standards marking; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used safety-critical steering parts are not permitted."
    ]
  }),
  node({
    key: "tyres-tubes",
    parentKey: "car-parts",
    name: "Tyres & Tubes",
    slug: "tyres-tubes",
    description:
      "Passenger-car and light-truck tyres, inner tubes and wheel valves. Excludes motorcycle tyres and complete wheels with damaged rims.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("tyre"),
      alias("tire"),
      alias("inner tube"),
      alias("pneu", "fr"),
      alias("chambre à air", "fr"),
      alias("pneu", "pt"),
      alias("câmara de ar", "pt"),
      alias("tairi", "sw"),
      alias("إطار سيارة", "ar")
    ],
    attributes: [
      select("product_type", "Product type", ["Tyre", "Inner tube", "Valve", "Other"], true),
      text("tyre_size", "Tyre size", true),
      number("load_index", "Load index"),
      select("condition", "Condition", ["New", "Used"], true),
      number("tread_depth_mm", "Tread depth (mm)")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Tyres are safety-critical. Publishing in Nigeria requires reviewer verification of size, load rating and remaining tread; retreaded or damaged tyres are not permitted. This leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used tyres must state exact tread depth and inspection result."
    ]
  }),
  node({
    key: "engine-filters-fluids",
    parentKey: "car-parts",
    name: "Engine Filters & Fluids",
    slug: "engine-filters-fluids",
    description:
      "Oil, air and fuel filters, engine oil, coolant and transmission fluid. Excludes brake fluid, fuel sold as a commodity and industrial lubricants.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("oil filter"),
      alias("air filter"),
      alias("engine oil"),
      alias("coolant"),
      alias("filtre à huile", "fr"),
      alias("huile moteur", "fr"),
      alias("filtro de óleo", "pt"),
      alias("óleo do motor", "pt"),
      alias("chujio cha mafuta", "sw"),
      alias("فلاتر المحرك", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Oil filter", "Air filter", "Fuel filter", "Engine oil", "Coolant", "Transmission fluid", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility"),
      number("volume_litres", "Volume (litres)"),
      text("specification", "Specification / viscosity grade")
    ],
    notes: [
      "Fluids must state the specification grade. Hazard symbols and safe-handling information are required for chemical products."
    ]
  }),
  node({
    key: "auto-electrical-lighting",
    parentKey: "car-parts",
    name: "Auto Electrical & Lighting",
    slug: "auto-electrical-lighting",
    description:
      "Car batteries, alternators, starters, bulbs, headlamps and wiring. Excludes in-car entertainment, dash cameras and vehicle audio upgrades.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 50,
    aliases: [
      alias("car battery"),
      alias("headlight"),
      alias("alternator"),
      alias("spark plug"),
      alias("batterie de voiture", "fr"),
      alias("phare de voiture", "fr"),
      alias("bateria de automóvel", "pt"),
      alias("farol de carro", "pt"),
      alias("betri ya gari", "sw"),
      alias("كهرباء السيارة", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Battery", "Alternator", "Starter", "Bulb", "Headlamp", "Wiring", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility"),
      text("voltage", "Voltage / capacity")
    ],
    notes: [
      "Batteries must state voltage and capacity. Used batteries must disclose age and test result."
    ]
  }),
  node({
    key: "body-exterior-parts",
    parentKey: "car-parts",
    name: "Body & Exterior Parts",
    slug: "body-exterior-parts",
    description:
      "Bumpers, mirrors, grilles, wipers, doors and exterior trim. Excludes structural chassis repair parts and paint, which belongs to Paints & Coatings.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 60,
    aliases: [
      alias("bumper"),
      alias("side mirror"),
      alias("windscreen wiper"),
      alias("grille"),
      alias("pare-chocs", "fr"),
      alias("rétroviseur", "fr"),
      alias("para-choques", "pt"),
      alias("espelho retrovisor", "pt"),
      alias("bampa ya gari", "sw"),
      alias("قطع هيكل السيارة", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Bumper", "Mirror", "Grille", "Wiper", "Door", "Trim", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility"),
      select("condition", "Condition", ["New", "Used"], true)
    ]
  }),
  node({
    key: "motorcycle-parts",
    parentKey: "automotive-motorcycle",
    name: "Motorcycle Parts & Gear",
    slug: "motorcycle-parts",
    description:
      "Motorcycle mechanical parts, tyres, helmets and riding protection. Excludes complete motorcycles, bicycle parts and car parts.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "motorcycle-brakes-safety",
    parentKey: "motorcycle-parts",
    name: "Motorcycle Brakes",
    slug: "motorcycle-brakes-safety",
    description:
      "Motorcycle brake pads, discs, shoes, cables and brake fluid. Excludes car brake parts and motorcycle engine components.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("motorcycle brake pads"),
      alias("motorcycle brake disc"),
      alias("plaquettes de frein moto", "fr"),
      alias("disque de frein moto", "fr"),
      alias("pastilhas de travão para mota", "pt"),
      alias("travão de mota", "pt"),
      alias("breki za pikipiki", "sw"),
      alias("فرامل دراجة نارية", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Brake pad", "Brake disc", "Brake shoe", "Brake cable", "Brake fluid", "Other"],
        true
      ),
      text("motorcycle_compatibility", "Motorcycle compatibility", true),
      text("part_number", "Part number")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Motorcycle braking components are safety-critical. Publishing in Nigeria requires reviewer verification of compatibility and standards marking; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used brake components are not permitted."
    ]
  }),
  node({
    key: "motorcycle-tyres-wheels",
    parentKey: "motorcycle-parts",
    name: "Motorcycle Tyres & Wheels",
    slug: "motorcycle-tyres-wheels",
    description:
      "Motorcycle tyres, inner tubes, rims and spokes. Excludes car tyres and complete motorcycles.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("motorcycle tyre"),
      alias("motorcycle rim"),
      alias("pneu de moto", "fr"),
      alias("jante de moto", "fr"),
      alias("pneu de mota", "pt"),
      alias("jante de mota", "pt"),
      alias("tairi la pikipiki", "sw"),
      alias("إطار دراجة نارية", "ar")
    ],
    attributes: [
      select("product_type", "Product type", ["Tyre", "Inner tube", "Rim", "Spoke set", "Other"], true),
      text("tyre_size", "Tyre size", true),
      select("condition", "Condition", ["New", "Used"], true),
      number("tread_depth_mm", "Tread depth (mm)")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Motorcycle tyres are safety-critical. Publishing in Nigeria requires reviewer verification of size and remaining tread; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Used tyres must state exact tread depth."
    ]
  }),
  node({
    key: "motorcycle-engine-drive-parts",
    parentKey: "motorcycle-parts",
    name: "Motorcycle Engine & Drive Parts",
    slug: "motorcycle-engine-drive-parts",
    description:
      "Chains, sprockets, pistons, clutch plates, carburettors and engine gaskets. Excludes brake components and complete engines.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("motorcycle chain"),
      alias("sprocket"),
      alias("piston kit"),
      alias("clutch plate"),
      alias("chaîne de moto", "fr"),
      alias("pignon de moto", "fr"),
      alias("corrente de mota", "pt"),
      alias("kit de pistão", "pt"),
      alias("mnyororo wa pikipiki", "sw"),
      alias("قطع محرك الدراجة النارية", "ar")
    ],
    attributes: [
      select(
        "part_type",
        "Part type",
        ["Chain", "Sprocket", "Piston kit", "Clutch plate", "Carburettor", "Gasket", "Other"],
        true
      ),
      text("motorcycle_compatibility", "Motorcycle compatibility", true),
      text("part_number", "Part number")
    ]
  }),
  node({
    key: "motorcycle-helmets-protection",
    parentKey: "motorcycle-parts",
    name: "Motorcycle Helmets & Riding Gear",
    slug: "motorcycle-helmets-protection",
    description:
      "Motorcycle helmets, riding gloves, jackets, boots and reflective protection. Excludes bicycle helmets and general workwear.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("motorcycle helmet"),
      alias("riding gloves"),
      alias("riding jacket"),
      alias("casque de moto", "fr"),
      alias("gants de moto", "fr"),
      alias("capacete de mota", "pt"),
      alias("luvas de mota", "pt"),
      alias("kofia ya pikipiki", "sw"),
      alias("خوذة دراجة نارية", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Helmet", "Gloves", "Jacket", "Boots", "Reflective protection", "Other"],
        true
      ),
      text("size", "Size", true),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Motorcycle helmets and protective gear are safety equipment. Publishing in Nigeria requires reviewer verification of a recognised standards marking and the absence of crash damage; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Helmets with unknown crash history are not permitted."
    ]
  }),
  node({
    key: "car-care-accessories",
    parentKey: "automotive-motorcycle",
    name: "Car Care & Accessories",
    slug: "car-care-accessories",
    description:
      "Cleaning and care products, interior accessories and in-car electronics. Excludes mechanical parts, tyres and vehicle audio systems requiring professional installation.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "car-care-cleaning",
    parentKey: "car-care-accessories",
    name: "Car Care & Cleaning",
    slug: "car-care-cleaning",
    description:
      "Car shampoo, wax, polish, degreasers, microfibre cloths and washing accessories. Excludes industrial workshop chemicals and paint refinishing.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("car shampoo"),
      alias("car wax"),
      alias("car polish"),
      alias("microfibre cloth"),
      alias("shampooing auto", "fr"),
      alias("cire de voiture", "fr"),
      alias("champô automóvel", "pt"),
      alias("cera para carro", "pt"),
      alias("sabuni ya gari", "sw"),
      alias("منتجات تنظيف السيارات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Shampoo", "Wax", "Polish", "Degreaser", "Microfibre cloth", "Washing accessory", "Other"],
        true
      ),
      number("volume_ml", "Volume (ml)"),
      select("surface", "Surface", ["Paint", "Glass", "Interior", "Wheels", "All surfaces"], false)
    ],
    notes: [
      "Chemical products must state hazard symbols and safe-handling information."
    ]
  }),
  node({
    key: "car-interior-accessories",
    parentKey: "car-care-accessories",
    name: "Car Interior Accessories",
    slug: "car-interior-accessories",
    description:
      "Seat covers, floor mats, steering covers, sunshades and organisers. Excludes in-car electronics and complete seat replacement.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("seat cover"),
      alias("floor mats"),
      alias("steering cover"),
      alias("housse de siège", "fr"),
      alias("tapis de voiture", "fr"),
      alias("capas de assentos", "pt"),
      alias("tapetes de carro", "pt"),
      alias("vifuniko vya viti", "sw"),
      alias("إكسسوارات داخلية للسيارة", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Seat cover", "Floor mat", "Steering cover", "Sunshade", "Organiser", "Other"],
        true
      ),
      text("vehicle_compatibility", "Vehicle compatibility"),
      text("material", "Material")
    ],
    notes: [
      "Seat covers must not obstruct airbags; the seller must state airbag compatibility."
    ]
  }),
  node({
    key: "in-car-electronics",
    parentKey: "car-care-accessories",
    name: "In-Car Electronics",
    slug: "in-car-electronics",
    description:
      "Dash cameras, reverse cameras, car chargers, phone holders and portable stereos. Excludes engine electrics and professionally installed audio systems.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("dash camera"),
      alias("car charger"),
      alias("reverse camera"),
      alias("car stereo"),
      alias("caméra de tableau de bord", "fr"),
      alias("chargeur de voiture", "fr"),
      alias("câmara de tablier", "pt"),
      alias("carregador de carro", "pt"),
      alias("kamera ya gari", "sw"),
      alias("إلكترونيات السيارة", "ar")
    ],
    attributes: [
      select(
        "device_type",
        "Device type",
        ["Dash camera", "Reverse camera", "Charger", "Phone holder", "Portable stereo", "Other"],
        true
      ),
      select("power_source", "Power source", ["12V socket", "USB", "Hardwired", "Battery", "Other"], false),
      text("vehicle_compatibility", "Vehicle compatibility")
    ]
  }),

  // -------------------------------------------------------------------------
  // 10. Tools & Building Materials
  // -------------------------------------------------------------------------
  node({
    key: "tools-building",
    parentKey: null,
    name: "Tools & Building Materials",
    slug: "tools-building-materials",
    description:
      "Power tools, hand tools, construction materials and workplace safety equipment. Excludes farm tools (Agriculture & Business), kitchen appliances and industrial production machinery.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 100
  }),
  node({
    key: "power-tools",
    parentKey: "tools-building",
    name: "Power Tools",
    slug: "power-tools",
    description:
      "Electric and battery-powered drills, grinders, saws and planers. Excludes industrial production machinery and petrol-powered garden equipment.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "drills-drivers",
    parentKey: "power-tools",
    name: "Drills & Drivers",
    slug: "drills-drivers",
    description:
      "Corded and cordless drills, impact drivers, hammer drills and drill bit sets. Excludes rotary hammers sold for industrial demolition and bench drills.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("drill"),
      alias("impact driver"),
      alias("cordless drill"),
      alias("perceuse", "fr"),
      alias("visseuse", "fr"),
      alias("berbequim", "pt"),
      alias("aparafusadora", "pt"),
      alias("drili", "sw"),
      alias("مثقاب كهربائي", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Drill", "Impact driver", "Hammer drill", "Drill bit set", "Other"],
        true
      ),
      select("power_source", "Power source", ["Corded electric", "Battery", "Other"], true),
      text("voltage", "Voltage / power rating"),
      select("battery_included", "Battery included", ["Yes", "No", "Not applicable"], false)
    ],
    notes: [
      "Battery platform and whether a battery or charger is included must be stated explicitly."
    ]
  }),
  node({
    key: "grinders-cutters",
    parentKey: "power-tools",
    name: "Grinders & Cutters",
    slug: "grinders-cutters",
    description:
      "Angle grinders, bench grinders, cut-off machines and cutting discs. Excludes industrial fixed machinery and welding equipment.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("angle grinder"),
      alias("cut-off saw"),
      alias("grinding disc"),
      alias("meuleuse d'angle", "fr"),
      alias("disque à tronçonner", "fr"),
      alias("rebarbadora", "pt"),
      alias("disco de corte", "pt"),
      alias("mashine ya kusaga", "sw"),
      alias("جلاخة زاوية", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Angle grinder", "Bench grinder", "Cut-off machine", "Cutting disc", "Other"],
        true
      ),
      select("power_source", "Power source", ["Corded electric", "Battery", "Other"], true),
      number("disc_diameter_mm", "Disc diameter (mm)")
    ],
    notes: [
      "Disc maximum speed must match the tool rating; eye and hearing protection requirements must be stated."
    ]
  }),
  node({
    key: "saws-planers",
    parentKey: "power-tools",
    name: "Saws & Planers",
    slug: "saws-planers",
    description:
      "Circular saws, jigsaws, mitre saws, reciprocating saws and planers. Excludes chainsaws and industrial sawmill equipment.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("circular saw"),
      alias("jigsaw"),
      alias("planer"),
      alias("mitre saw"),
      alias("scie circulaire", "fr"),
      alias("scie sauteuse", "fr"),
      alias("serra circular", "pt"),
      alias("serra tico-tico", "pt"),
      alias("msumeno wa umeme", "sw"),
      alias("منشار كهربائي", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Circular saw", "Jigsaw", "Mitre saw", "Reciprocating saw", "Planer", "Other"],
        true
      ),
      select("power_source", "Power source", ["Corded electric", "Battery", "Other"], true),
      number("blade_diameter_mm", "Blade diameter (mm)")
    ]
  }),
  node({
    key: "hand-tools",
    parentKey: "tools-building",
    name: "Hand Tools",
    slug: "hand-tools",
    description:
      "Spanners, sockets, hammers, measuring tools and screwdrivers. Excludes power tools, farm hand tools and automotive diagnostic equipment.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "spanners-sockets",
    parentKey: "hand-tools",
    name: "Spanners & Socket Sets",
    slug: "spanners-sockets",
    description:
      "Combination spanners, socket sets, adjustable wrenches, torque wrenches and pliers sets. Excludes power tools and plumbing-specific tools.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("spanner"),
      alias("socket set"),
      alias("adjustable wrench"),
      alias("torque wrench"),
      alias("clé à molette", "fr"),
      alias("jeu de douilles", "fr"),
      alias("chave inglesa", "pt"),
      alias("conjunto de chaves de caixa", "pt"),
      alias("spana", "sw"),
      alias("مفاتيح ربط", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Spanner", "Socket set", "Adjustable wrench", "Torque wrench", "Pliers set", "Other"],
        true
      ),
      select("measurement_system", "Measurement system", ["Metric", "Imperial", "Both", "Not stated"], false),
      number("piece_count", "Number of pieces")
    ]
  }),
  node({
    key: "hammers-measuring-tools",
    parentKey: "hand-tools",
    name: "Hammers & Measuring Tools",
    slug: "hammers-measuring-tools",
    description:
      "Hammers, mallets, tape measures, spirit levels, squares and screwdriver sets. Excludes power tools and precision laboratory instruments.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("hammer"),
      alias("tape measure"),
      alias("spirit level"),
      alias("screwdriver set"),
      alias("marteau", "fr"),
      alias("mètre ruban", "fr"),
      alias("martelo", "pt"),
      alias("fita métrica", "pt"),
      alias("nyundo", "sw"),
      alias("مطرقة", "ar")
    ],
    attributes: [
      select(
        "tool_type",
        "Tool type",
        ["Hammer", "Mallet", "Tape measure", "Spirit level", "Square", "Screwdriver set", "Other"],
        true
      ),
      text("size", "Size / length"),
      number("piece_count", "Number of pieces")
    ]
  }),
  node({
    key: "building-materials",
    parentKey: "tools-building",
    name: "Building Materials",
    slug: "building-materials",
    description:
      "Cement, aggregates, roofing, timber, paint, plumbing and electrical installation materials. Excludes complete buildings, professional installation labour and industrial plant.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "cement-blocks-aggregates",
    parentKey: "building-materials",
    name: "Cement, Blocks & Aggregates",
    slug: "cement-blocks-aggregates",
    description:
      "Cement bags, sand, gravel, crushed stone and blocks sold in bulk or by truckload. Excludes decorative stone and ready-mix concrete requiring plant delivery.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("cement"),
      alias("sand"),
      alias("gravel"),
      alias("concrete blocks"),
      alias("cinder blocks"),
      alias("ciment", "fr"),
      alias("sable", "fr"),
      alias("cimento", "pt"),
      alias("areia", "pt"),
      alias("saruji", "sw"),
      alias("أسمنت", "ar")
    ],
    attributes: [
      select(
        "material_type",
        "Material type",
        ["Cement", "Sand", "Gravel", "Crushed stone", "Block", "Other"],
        true
      ),
      number("quantity", "Quantity per order", true),
      select("unit", "Unit", ["bag", "tonne", "truckload", "piece", "Other"], true),
      text("delivery_area", "Delivery area")
    ],
    notes: [
      "Delivery cost and area are quoted by the seller; the listing must state the exact quantity and unit. No automatic truckload conversion is assumed."
    ]
  }),
  node({
    key: "roofing-sheets-timber",
    parentKey: "building-materials",
    name: "Roofing, Timber & Boards",
    slug: "roofing-sheets-timber",
    description:
      "Roofing sheets, timber, plywood, ceiling boards and roofing accessories. Excludes structural steel beams and complete roofing installation.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    allowedListingTypes: ["escrow", "contact"],
    aliases: [
      alias("roofing sheet"),
      alias("timber"),
      alias("plywood"),
      alias("ceiling board"),
      alias("tôle de toiture", "fr"),
      alias("bois de construction", "fr"),
      alias("chapa de cobertura", "pt"),
      alias("madeira de construção", "pt"),
      alias("bati la paa", "sw"),
      alias("ألواح تسقيف", "ar")
    ],
    attributes: [
      select(
        "material_type",
        "Material type",
        ["Roofing sheet", "Timber", "Plywood", "Ceiling board", "Roofing accessory", "Other"],
        true
      ),
      text("dimensions", "Dimensions", true),
      number("quantity", "Quantity per order"),
      select("unit", "Unit", ["piece", "bundle", "cubic metre", "Other"], false)
    ]
  }),
  node({
    key: "paints-coatings",
    parentKey: "building-materials",
    name: "Paints & Coatings",
    slug: "paints-coatings",
    description:
      "Emulsion and gloss wall paint, primers, undercoats, varnish and wood stain. Excludes automotive refinishing paint and artist materials.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("wall paint"),
      alias("emulsion paint"),
      alias("primer"),
      alias("wood varnish"),
      alias("peinture murale", "fr"),
      alias("sous-couche", "fr"),
      alias("tinta de parede", "pt"),
      alias("verniz para madeira", "pt"),
      alias("rangi ya ukuta", "sw"),
      alias("دهانات", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Emulsion paint", "Gloss paint", "Primer", "Undercoat", "Varnish", "Wood stain", "Other"],
        true
      ),
      number("volume_litres", "Volume (litres)", true),
      text("colour", "Colour"),
      select("finish", "Finish", ["Matt", "Satin", "Gloss", "Not stated"], false)
    ],
    notes: [
      "Chemical products must state hazard symbols, ventilation guidance and safe disposal."
    ]
  }),
  node({
    key: "plumbing-fittings",
    parentKey: "building-materials",
    name: "Plumbing & Fittings",
    slug: "plumbing-fittings",
    description:
      "PVC and PPR pipes, taps, valves, connectors and cistern fittings. Excludes complete sanitaryware suites and professional installation.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("pvc pipe"),
      alias("tap"),
      alias("valve"),
      alias("pipe fitting"),
      alias("tuyau pvc", "fr"),
      alias("robinet", "fr"),
      alias("tubo pvc", "pt"),
      alias("torneira", "pt"),
      alias("bomba za maji", "sw"),
      alias("تجهيزات السباكة", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Pipe", "Tap", "Valve", "Connector", "Cistern fitting", "Other"],
        true
      ),
      text("diameter", "Diameter / size", true),
      text("material", "Material")
    ],
    notes: [
      "Potable-water applications require the seller to state food-grade suitability."
    ]
  }),
  node({
    key: "electrical-installation-materials",
    parentKey: "building-materials",
    name: "Electrical Installation Materials",
    slug: "electrical-installation-materials",
    description:
      "Electrical cable, conduits, distribution boards, sockets and switches for fixed installation. Excludes generators, solar systems and consumer electronics.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 50,
    allowedListingTypes: ["escrow", "contact"],
    reviewRequired: true,
    aliases: [
      alias("electrical cable"),
      alias("distribution board"),
      alias("socket outlet"),
      alias("conduit"),
      alias("câble électrique", "fr"),
      alias("tableau électrique", "fr"),
      alias("cabo elétrico", "pt"),
      alias("quadro elétrico", "pt"),
      alias("waya za umeme", "sw"),
      alias("مواد كهربائية", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Cable", "Conduit", "Distribution board", "Socket outlet", "Switch", "Other"],
        true
      ),
      text("rating", "Current / voltage rating", true),
      text("certification", "Certification / standards marking")
    ],
    countryRules: [
      {
        countryCode: "NG",
        canPublish: false,
        note:
          "Fixed-installation electrical materials are safety-critical and subject to standards certification. Publishing in Nigeria requires reviewer verification of the standards marking; this leaf is not publishable until that review is recorded."
      }
    ],
    notes: [
      "Restricted leaf: canPublish is false for NG. Unmarked or undersized cable is not permitted."
    ]
  }),
  node({
    key: "workplace-safety",
    parentKey: "tools-building",
    name: "Workplace Safety",
    slug: "workplace-safety",
    description:
      "Personal protective equipment and site safety supplies. Excludes fire-fighting systems and medical first-aid supplies.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 40
  }),
  node({
    key: "ppe-workwear",
    parentKey: "workplace-safety",
    name: "PPE & Workwear",
    slug: "ppe-workwear",
    description:
      "Safety gloves, safety boots, hard hats, reflective vests, goggles and hearing protection. Excludes fashion clothing and motorcycle riding gear.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("safety gloves"),
      alias("safety boots"),
      alias("hard hat"),
      alias("reflective vest"),
      alias("gants de sécurité", "fr"),
      alias("chaussures de sécurité", "fr"),
      alias("luvas de segurança", "pt"),
      alias("botas de segurança", "pt"),
      alias("glavu za usalama", "sw"),
      alias("معدات الوقاية الشخصية", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Gloves", "Boots", "Hard hat", "Reflective vest", "Goggles", "Hearing protection", "Other"],
        true
      ),
      text("size", "Size"),
      text("certification", "Certification / standards marking")
    ],
    notes: [
      "PPE listings must state the protection standard and size; decorative clothing is not PPE."
    ]
  }),

  // -------------------------------------------------------------------------
  // 11. Books & Stationery
  // -------------------------------------------------------------------------
  node({
    key: "books-stationery",
    parentKey: null,
    name: "Books & Stationery",
    slug: "books-stationery",
    description:
      "Physical books, paper, writing supplies, office consumables and art materials. Excludes digital subscriptions, software licences, school uniforms and furniture.",
    level: 0,
    isSelectable: false,
    showOnHomepage: true,
    sortOrder: 110
  }),
  node({
    key: "books",
    parentKey: "books-stationery",
    name: "Books",
    slug: "books",
    description:
      "Printed textbooks, fiction, religious books and children's books. Excludes e-books, audiobook subscriptions and magazines sold as advertising space.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 10
  }),
  node({
    key: "textbooks-education",
    parentKey: "books",
    name: "Textbooks & Education",
    slug: "textbooks-education",
    description:
      "Primary, secondary, university and professional textbooks, workbooks and revision guides. Excludes past examination papers sold by unauthorised providers and digital course access.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("textbook"),
      alias("school textbook"),
      alias("university textbook"),
      alias("manuel scolaire", "fr"),
      alias("livre universitaire", "fr"),
      alias("manual escolar", "pt"),
      alias("livro universitário", "pt"),
      alias("kitabu cha masomo", "sw"),
      alias("كتاب مدرسي", "ar")
    ],
    attributes: [
      select(
        "education_level",
        "Education level",
        ["Primary", "Secondary", "Tertiary", "Professional", "Other"],
        true
      ),
      text("subject", "Subject"),
      text("isbn", "ISBN"),
      select("condition", "Condition", ["New", "Used"], true)
    ],
    notes: [
      "Used textbooks must disclose highlighting, missing pages and cover damage."
    ]
  }),
  node({
    key: "fiction-literature",
    parentKey: "books",
    name: "Fiction & Literature",
    slug: "fiction-literature",
    description:
      "Novels, poetry, short-story collections, plays and literary criticism. Excludes textbooks and children's picture books.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("novel"),
      alias("poetry"),
      alias("short stories"),
      alias("roman", "fr"),
      alias("poésie", "fr"),
      alias("romance", "pt"),
      alias("poesia", "pt"),
      alias("riwaya", "sw"),
      alias("رواية", "ar")
    ],
    attributes: [
      select(
        "genre",
        "Genre",
        ["Literary fiction", "Crime", "Romance", "Science fiction", "Poetry", "Drama", "Other"],
        true
      ),
      text("author", "Author"),
      text("isbn", "ISBN"),
      select("language", "Language", ["English", "French", "Portuguese", "Arabic", "Swahili", "Other"], false)
    ]
  }),
  node({
    key: "religious-inspirational-books",
    parentKey: "books",
    name: "Religious & Inspirational Books",
    slug: "religious-inspirational-books",
    description:
      "Bibles, Qur'ans, devotionals and inspirational titles. Excludes religious artefacts, apparel and audio subscriptions.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("bible"),
      alias("quran"),
      alias("devotional"),
      alias("bible", "fr"),
      alias("coran", "fr"),
      alias("bíblia", "pt"),
      alias("alcorão", "pt"),
      alias("biblia", "sw"),
      alias("كتب دينية", "ar")
    ],
    attributes: [
      select(
        "book_type",
        "Book type",
        ["Bible", "Qur'an", "Devotional", "Inspirational", "Other"],
        true
      ),
      select("language", "Language", ["English", "French", "Portuguese", "Arabic", "Swahili", "Other"], false),
      text("isbn", "ISBN")
    ]
  }),
  node({
    key: "childrens-books",
    parentKey: "books",
    name: "Children's Books",
    slug: "childrens-books",
    description:
      "Picture books, early readers, storybooks and activity books for children. Excludes school textbooks and toys.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("storybook"),
      alias("picture book"),
      alias("children's book"),
      alias("livre pour enfants", "fr"),
      alias("album jeunesse", "fr"),
      alias("livro infantil", "pt"),
      alias("livro de histórias", "pt"),
      alias("kitabu cha watoto", "sw"),
      alias("كتب أطفال", "ar")
    ],
    attributes: [
      select(
        "book_type",
        "Book type",
        ["Picture book", "Early reader", "Storybook", "Activity book", "Other"],
        true
      ),
      number("recommended_age_years", "Recommended age (years)"),
      text("isbn", "ISBN")
    ]
  }),
  node({
    key: "stationery-office",
    parentKey: "books-stationery",
    name: "Stationery & Office",
    slug: "stationery-office",
    description:
      "Paper products, writing instruments, office consumables and printer supplies. Excludes furniture, printers and software.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 20
  }),
  node({
    key: "notebooks-paper",
    parentKey: "stationery-office",
    name: "Notebooks & Paper",
    slug: "notebooks-paper",
    description:
      "Exercise books, notebooks, printing paper, notepads and envelopes. Excludes books and paper towels.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("exercise book"),
      alias("jotter"),
      alias("printing paper"),
      alias("cahier", "fr"),
      alias("papier d'impression", "fr"),
      alias("caderno", "pt"),
      alias("papel de impressão", "pt"),
      alias("daftari", "sw"),
      alias("دفاتر", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Exercise book", "Notebook", "Printing paper", "Notepad", "Envelope", "Other"],
        true
      ),
      select("ruling", "Ruling", ["Ruled", "Plain", "Squared", "Not applicable"], false),
      number("sheets", "Sheets per pack"),
      text("paper_size", "Paper size")
    ]
  }),
  node({
    key: "writing-drawing-instruments",
    parentKey: "stationery-office",
    name: "Writing & Drawing Instruments",
    slug: "writing-drawing-instruments",
    description:
      "Pens, pencils, markers, highlighters, rulers and geometry sets. Excludes printer ink, art paint and office machines.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("pen"),
      alias("pencil"),
      alias("marker"),
      alias("ruler"),
      alias("stylo", "fr"),
      alias("crayon", "fr"),
      alias("caneta", "pt"),
      alias("lápis", "pt"),
      alias("kalamu", "sw"),
      alias("أقلام", "ar")
    ],
    attributes: [
      select(
        "instrument_type",
        "Instrument type",
        ["Pen", "Pencil", "Marker", "Highlighter", "Ruler", "Geometry set", "Other"],
        true
      ),
      select("ink_type", "Ink type", ["Ballpoint", "Gel", "Fountain", "Permanent", "Not applicable"], false),
      number("pack_count", "Pack count")
    ]
  }),
  node({
    key: "office-school-supplies",
    parentKey: "stationery-office",
    name: "Office & School Supplies",
    slug: "office-school-supplies",
    description:
      "Staplers, scissors, glue, files, folders, calculators and desk organisers. Excludes furniture, computers and cleaning products.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 30,
    aliases: [
      alias("stapler"),
      alias("scissors"),
      alias("glue"),
      alias("file folder"),
      alias("agrafeuse", "fr"),
      alias("ciseaux", "fr"),
      alias("agrafador", "pt"),
      alias("tesoura", "pt"),
      alias("kifaa cha kudubinia", "sw"),
      alias("مستلزمات مكتبية", "ar")
    ],
    attributes: [
      select(
        "item_type",
        "Item type",
        ["Stapler", "Scissors", "Glue", "File / folder", "Calculator", "Desk organiser", "Other"],
        true
      ),
      number("pack_count", "Pack count")
    ]
  }),
  node({
    key: "printer-ink-toner",
    parentKey: "stationery-office",
    name: "Printer Ink & Toner",
    slug: "printer-ink-toner",
    description:
      "Ink cartridges, toner cartridges and refill kits for home and office printers. Excludes printers, paper and photocopiers.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 40,
    aliases: [
      alias("ink cartridge"),
      alias("toner cartridge"),
      alias("cartouche d'encre", "fr"),
      alias("toner", "fr"),
      alias("cartucho de tinta", "pt"),
      alias("toner", "pt"),
      alias("katriji ya wino", "sw"),
      alias("حبر الطابعة", "ar")
    ],
    attributes: [
      select("product_type", "Product type", ["Ink cartridge", "Toner cartridge", "Refill kit", "Other"], true),
      text("printer_compatibility", "Printer compatibility", true),
      select("authenticity", "Authenticity", ["Original", "Compatible", "Refilled", "Not stated"], false),
      text("yield_pages", "Approximate yield (pages)")
    ],
    notes: [
      "Compatible and refilled cartridges must be identified as such; no counterfeit original branding."
    ]
  }),
  node({
    key: "art-craft",
    parentKey: "books-stationery",
    name: "Art & Craft",
    slug: "art-craft",
    description:
      "Art materials and craft supplies for drawing, painting and handmade work. Excludes dressmaking fabric and industrial equipment.",
    level: 1,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 30
  }),
  node({
    key: "art-supplies",
    parentKey: "art-craft",
    name: "Art Supplies",
    slug: "art-supplies",
    description:
      "Acrylic and watercolour paint, brushes, canvas, sketchbooks and drawing media. Excludes wall paint and industrial coatings.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 10,
    aliases: [
      alias("acrylic paint"),
      alias("paint brush"),
      alias("canvas"),
      alias("sketchbook"),
      alias("peinture acrylique", "fr"),
      alias("pinceau", "fr"),
      alias("tinta acrílica", "pt"),
      alias("pincel", "pt"),
      alias("rangi za kuchora", "sw"),
      alias("أدوات فنية", "ar")
    ],
    attributes: [
      select(
        "product_type",
        "Product type",
        ["Acrylic paint", "Watercolour", "Brush", "Canvas", "Sketchbook", "Drawing medium", "Other"],
        true
      ),
      number("volume_ml", "Volume (ml)"),
      text("colour", "Colour")
    ]
  }),
  node({
    key: "craft-materials",
    parentKey: "art-craft",
    name: "Craft Materials",
    slug: "craft-materials",
    description:
      "Beads, craft glue, felt, ribbon and handmade-project supplies. Excludes dressmaking fabric, tools and finished jewellery.",
    level: 2,
    isSelectable: true,
    showOnHomepage: false,
    sortOrder: 20,
    aliases: [
      alias("beads"),
      alias("craft glue"),
      alias("felt"),
      alias("ribbon"),
      alias("perles", "fr"),
      alias("colle artisanale", "fr"),
      alias("missangas", "pt"),
      alias("cola artesanal", "pt"),
      alias("shanga", "sw"),
      alias("مواد حرفية", "ar")
    ],
    attributes: [
      select(
        "material_type",
        "Material type",
        ["Beads", "Craft glue", "Felt", "Ribbon", "Other"],
        true
      ),
      number("pack_count", "Pack count"),
      text("colour", "Colour")
    ]
  })
];

/** Restricted leaves that must not be published in Nigeria yet. */
export const RESTRICTED_CATEGORY_KEYS = [
  "seeds-seedlings",
  "fertilizers-crop-nutrition",
  "pesticides-crop-protection",
  "otc-medicines-treatments",
  "vitamins-minerals-supplements",
  "herbal-traditional-remedies",
  "health-monitors",
  "mobility-support-aids",
  "car-seats-boosters",
  "infant-formula",
  "brake-system-parts",
  "suspension-steering-parts",
  "tyres-tubes",
  "motorcycle-brakes-safety",
  "motorcycle-tyres-wheels",
  "motorcycle-helmets-protection",
  "electrical-installation-materials"
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

  if (departmentKeys.size !== DEPARTMENT_KEYS.length) {
    throw new Error(
      `Expected exactly ${DEPARTMENT_KEYS.length} departments, found ${departmentKeys.size}`
    );
  }
  for (const key of DEPARTMENT_KEYS) {
    if (!departmentKeys.has(key)) throw new Error(`Missing department ${key}`);
  }
  for (const key of EXISTING_CATEGORY_KEYS) {
    if (!byKey.has(key)) throw new Error(`Missing existing category ${key}`);
  }
  const requiredPaths = [
    ["food", "grains-flours", "teff-flour"],
    ["food", "grains-flours", "cassava-products"],
    ["fashion", "fabrics-textiles", "african-print-fabrics"],
    ["agriculture", "farm-inputs", "seeds-seedlings"],
    ["agriculture", "farm-inputs", "pesticides-crop-protection"],
    ["agriculture", "processing-equipment", "cassava-processing-equipment"],
    ["health-wellness", "medicines-treatments", "otc-medicines-treatments"],
    ["health-wellness", "medical-devices-aids", "first-aid-supplies"],
    ["baby-kids-toys", "baby-feeding-care", "infant-formula"],
    ["baby-kids-toys", "toys-play", "educational-stem-toys"],
    ["sports-outdoors", "fitness-strength", "home-gym-weights"],
    ["sports-outdoors", "cycling-scooters", "bicycles"],
    ["automotive-motorcycle", "car-parts", "brake-system-parts"],
    ["automotive-motorcycle", "motorcycle-parts", "motorcycle-helmets-protection"],
    ["tools-building", "building-materials", "cement-blocks-aggregates"],
    ["tools-building", "workplace-safety", "ppe-workwear"],
    ["books-stationery", "books", "textbooks-education"],
    ["books-stationery", "art-craft", "art-supplies"]
  ];
  for (const path of requiredPaths) {
    const leafKey = path[path.length - 1];
    const actual = getTaxonomyPath(leafKey).map((entry) => entry.key);
    if (actual.join("/") !== path.join("/")) {
      throw new Error(`Required path missing: ${path.join("/")} (found ${actual.join("/")})`);
    }
  }
  const restricted = new Set<string>(RESTRICTED_CATEGORY_KEYS);
  for (const key of restricted) {
    const entry = byKey.get(key);
    if (!entry) throw new Error(`Missing restricted leaf ${key}`);
    if (entry.level !== 2 || !entry.isSelectable) {
      throw new Error(`${key}: restricted leaves must be selectable level-2 nodes`);
    }
    if (!entry.countryRules.some((rule) => rule.countryCode === "NG" && !rule.canPublish)) {
      throw new Error(`${key}: restricted leaf must set canPublish=false for NG`);
    }
  }
  for (const entry of nodes) {
    const blockedInNg = entry.countryRules.some(
      (rule) => rule.countryCode === "NG" && !rule.canPublish
    );
    if (blockedInNg && !restricted.has(entry.key)) {
      throw new Error(`${entry.key}: canPublish=false for NG must be listed in RESTRICTED_CATEGORY_KEYS`);
    }
  }
}
