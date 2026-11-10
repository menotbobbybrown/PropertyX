import { isUAE } from "@propertyx/shared";

const PK_CITY_LINKS = [
  { slug: "lahore", name: "Lahore" },
  { slug: "islamabad", name: "Islamabad" },
  { slug: "karachi", name: "Karachi" },
  { slug: "rawalpindi", name: "Rawalpindi" },
  { slug: "multan", name: "Multan" },
  { slug: "faisalabad", name: "Faisalabad" },
  { slug: "gujranwala", name: "Gujranwala" },
  { slug: "peshawar", name: "Peshawar" },
  { slug: "sahiwal", name: "Sahiwal" },
  { slug: "burewala", name: "Burewala" },
  { slug: "vehari", name: "Vehari" },
  { slug: "mian-channu", name: "Mian Channu" },
  { slug: "chichawatni", name: "Chichawatni" },
];

export interface NavItem {
  label: string;
  href: string;
  columns?: { title: string; links: { label: string; href: string }[] }[];
}

const PK_NAV: NavItem[] = [
  {
    label: "Buy",
    href: "/buy",
    columns: [
      { title: "Homes", links: [{ label: "Houses", href: "/buy/house" }, { label: "Flats & Apartments", href: "/buy/flat" }, { label: "Villas", href: "/buy/villa" }, { label: "Penthouses", href: "/buy/penthouse" }, { label: "Farmhouses", href: "/buy/farmhouse" }, { label: "Upper / Lower Portions", href: "/buy/upper-portion" }] },
      { title: "By city", links: PK_CITY_LINKS.map((c) => ({ label: `Houses in ${c.name}`, href: `/buy/house/${c.slug}` })) },
    ],
  },
  {
    label: "Rent",
    href: "/rent",
    columns: [
      { title: "Rentals", links: [{ label: "Houses for rent", href: "/rent/house" }, { label: "Flats for rent", href: "/rent/flat" }, { label: "Portions", href: "/rent/upper-portion" }, { label: "Rooms", href: "/rent/room" }, { label: "Offices", href: "/rent/office" }, { label: "Shops", href: "/rent/shop" }] },
      { title: "By city", links: PK_CITY_LINKS.map((c) => ({ label: `Rent in ${c.name}`, href: `/rent/property/${c.slug}` })) },
    ],
  },
  { label: "Sell", href: "/sell" },
  { label: "Projects", href: "/projects", columns: [{ title: "New projects", links: [{ label: "All projects", href: "/projects" }, ...PK_CITY_LINKS.slice(0, 5).map((c) => ({ label: `Projects in ${c.name}`, href: `/projects/${c.slug}` })), { label: "Developers", href: "/developers" }] }] },
  { label: "Plots", href: "/plots-for-sale", columns: [{ title: "Plots", links: [{ label: "Residential plots", href: "/buy/residential-plot" }, { label: "Commercial plots", href: "/buy/commercial-plot" }, { label: "Plot files", href: "/search?types=plot_file&purpose=sale" }, { label: "Agricultural land", href: "/buy/agricultural-land" }, ...PK_CITY_LINKS.slice(0, 4).map((c) => ({ label: `Plots in ${c.name}`, href: `/plots-for-sale/${c.slug}` }))] }] },
  { label: "Commercial", href: "/commercial-property", columns: [{ title: "Commercial", links: [{ label: "Offices", href: "/buy/office" }, { label: "Shops", href: "/buy/shop" }, { label: "Warehouses", href: "/buy/warehouse" }, { label: "Factories", href: "/buy/factory" }, { label: "Buildings", href: "/buy/building" }, { label: "Commercial for rent", href: "/rent/commercial" }] }] },
  { label: "Agents", href: "/agents", columns: [{ title: "Find professionals", links: [{ label: "Property agents", href: "/agents" }, { label: "Agencies", href: "/agencies" }, { label: "Developers", href: "/developers" }] }] },
  { label: "Invest", href: "/invest", columns: [{ title: "Investing", links: [{ label: "Investment opportunities", href: "/invest" }, { label: "AI investment advisor", href: "/tools/investment" }, { label: "Price index", href: "/price-index" }, { label: "Installment projects", href: "/invest#installments" }] }] },
  { label: "Wanted", href: "/wanted" },
  { label: "Areas", href: "/areas", columns: [{ title: "Area guides", links: [{ label: "All areas", href: "/areas" }, { label: "DHA Lahore", href: "/area/dha-lahore" }, { label: "Bahria Town Lahore", href: "/area/bahria-town-lahore" }, { label: "Gulberg Lahore", href: "/area/gulberg-lahore" }, { label: "F-11 Islamabad", href: "/area/f-11-islamabad" }, { label: "DHA Karachi", href: "/area/dha-karachi" }] }] },
  { label: "Map", href: "/map" },
  {
    label: "Tools",
    href: "/tools",
    columns: [
      {
        title: "Calculators",
        links: [
          { label: "AI property assistant", href: "/ai" },
          { label: "What's my property worth?", href: "/tools/property-value" },
          { label: "Investment advisor", href: "/tools/investment" },
          { label: "Home loan / Islamic finance", href: "/tools/home-loan" },
          { label: "Installment calculator", href: "/tools/installment" },
          { label: "Construction cost", href: "/tools/construction-cost" },
          { label: "Compare properties", href: "/compare" },
        ],
      },
      { title: "Learn", links: [{ label: "Guides & news", href: "/blog" }, { label: "Community forum", href: "/forum" }, { label: "Price index", href: "/price-index" }] },
    ],
  },
];

/* ---------------- UAE ---------------- */

const AE_CITY_LINKS = [
  { slug: "dubai", name: "Dubai" },
  { slug: "abu-dhabi", name: "Abu Dhabi" },
  { slug: "sharjah", name: "Sharjah" },
  { slug: "ajman", name: "Ajman" },
  { slug: "ras-al-khaimah", name: "Ras Al Khaimah" },
  { slug: "al-ain", name: "Al Ain" },
  { slug: "fujairah", name: "Fujairah" },
  { slug: "umm-al-quwain", name: "Umm Al Quwain" },
];

const AE_NAV: NavItem[] = [
  {
    label: "Buy",
    href: "/buy",
    columns: [
      { title: "Homes", links: [{ label: "Apartments", href: "/buy/apartment" }, { label: "Villas", href: "/buy/villa" }, { label: "Penthouses", href: "/buy/penthouse" }, { label: "Houses", href: "/buy/house" }, { label: "Off-plan properties", href: "/buy?completion=off_plan" }, { label: "Off-plan projects", href: "/projects" }] },
      { title: "By emirate", links: AE_CITY_LINKS.map((c) => ({ label: `Property in ${c.name}`, href: `/buy/property/${c.slug}` })) },
    ],
  },
  {
    label: "Rent",
    href: "/rent",
    columns: [
      { title: "Rentals", links: [{ label: "Apartments for rent", href: "/rent/apartment" }, { label: "Villas for rent", href: "/rent/villa" }, { label: "Rooms", href: "/rent/room" }, { label: "Offices", href: "/rent/office" }, { label: "Shops", href: "/rent/shop" }] },
      { title: "By emirate", links: AE_CITY_LINKS.map((c) => ({ label: `Rent in ${c.name}`, href: `/rent/property/${c.slug}` })) },
    ],
  },
  { label: "Sell", href: "/sell" },
  { label: "Projects", href: "/projects", columns: [{ title: "New projects", links: [{ label: "All projects", href: "/projects" }, ...AE_CITY_LINKS.slice(0, 4).map((c) => ({ label: `Projects in ${c.name}`, href: `/projects/${c.slug}` })), { label: "Developers", href: "/developers" }] }] },
  { label: "Plots", href: "/plots-for-sale", columns: [{ title: "Land", links: [{ label: "Residential plots", href: "/buy/residential-plot" }, { label: "Commercial plots", href: "/buy/commercial-plot" }, ...AE_CITY_LINKS.slice(0, 3).map((c) => ({ label: `Plots in ${c.name}`, href: `/plots-for-sale/${c.slug}` }))] }] },
  { label: "Commercial", href: "/commercial-property", columns: [{ title: "Commercial", links: [{ label: "Offices", href: "/buy/office" }, { label: "Shops", href: "/buy/shop" }, { label: "Warehouses", href: "/buy/warehouse" }, { label: "Buildings", href: "/buy/building" }, { label: "Commercial for rent", href: "/rent/commercial" }] }] },
  { label: "Agents", href: "/agents", columns: [{ title: "Find professionals", links: [{ label: "Property agents", href: "/agents" }, { label: "Agencies", href: "/agencies" }, { label: "Developers", href: "/developers" }] }] },
  { label: "Invest", href: "/invest", columns: [{ title: "Investing", links: [{ label: "Investment opportunities", href: "/invest" }, { label: "AI investment advisor", href: "/tools/investment" }, { label: "Price index", href: "/price-index" }, { label: "Payment-plan projects", href: "/invest#installments" }] }] },
  { label: "Wanted", href: "/wanted" },
  { label: "Areas", href: "/areas", columns: [{ title: "Area guides", links: [{ label: "All areas", href: "/areas" }, { label: "Dubai Marina", href: "/area/dubai-marina" }, { label: "Downtown Dubai", href: "/area/downtown-dubai" }, { label: "Business Bay", href: "/area/business-bay-dubai" }, { label: "Jumeirah Village Circle", href: "/area/jumeirah-village-circle-dubai" }, { label: "Al Reem Island", href: "/area/al-reem-island-abu-dhabi" }] }] },
  { label: "Map", href: "/map" },
  {
    label: "Tools",
    href: "/tools",
    columns: [
      {
        title: "Calculators",
        links: [
          { label: "AI property assistant", href: "/ai" },
          { label: "What's my property worth?", href: "/tools/property-value" },
          { label: "Investment advisor", href: "/tools/investment" },
          { label: "Mortgage calculator", href: "/tools/home-loan" },
          { label: "Payment plan calculator", href: "/tools/installment" },
          { label: "Area converter", href: "/tools/area-unit-converter" },
          { label: "Compare properties", href: "/compare" },
        ],
      },
      { title: "Learn", links: [{ label: "Guides & news", href: "/blog" }, { label: "Community forum", href: "/forum" }, { label: "Price index", href: "/price-index" }] },
    ],
  },
];

/** Cities / emirates shown in menus, search and footers for this deployment's country. */
export const CITY_LINKS = isUAE ? AE_CITY_LINKS : PK_CITY_LINKS;
export const NAV: NavItem[] = isUAE ? AE_NAV : PK_NAV;
