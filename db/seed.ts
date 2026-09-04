import { sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema/catalog";
import { brands } from "@/db/schema/identity";
import type { NewProduct } from "@/db/schema/types";

export const DEMO_BRAND_ID = "11111111-1111-4111-8111-111111111111";

const CORE_DEMO_PRODUCTS = [
  {
    id: "21000000-0000-4000-8000-000000000001",
    name: "StrideFlow Daily Running Shoes",
    slug: "strideflow-daily-running-shoes",
    description:
      "Lightweight road-running shoes for daily training, with responsive cushioning and a breathable mesh upper.",
    category: "Footwear",
    priceMinor: 399900,
    currency: "INR",
    stock: 32,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Midnight Blue", "Cloud White"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["road running", "daily training"],
      surface: "Road",
      cushioning: "Responsive",
      support: "Neutral",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000002",
    name: "TrailCrest Grip Running Shoes",
    slug: "trailcrest-grip-running-shoes",
    description:
      "Protective trail-running shoes with deep-lug grip, a rock plate, and stable cushioning for uneven terrain.",
    category: "Footwear",
    priceMinor: 549900,
    currency: "INR",
    stock: 18,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Forest Green", "Charcoal"],
      sizes: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["trail running", "hiking"],
      surface: "Trail",
      cushioning: "Stable",
      support: "Neutral",
      waterResistant: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000003",
    name: "CloudStep Walking Shoes",
    slug: "cloudstep-walking-shoes",
    description:
      "Soft, wide-fit walking shoes with plush cushioning for commuting, travel, and all-day comfort.",
    category: "Footwear",
    priceMinor: 279900,
    currency: "INR",
    stock: 0,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Stone Grey", "Navy"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["walking", "travel", "all-day wear"],
      cushioning: "Plush",
      fit: "Wide",
      support: "Neutral",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000004",
    name: "FlexForge Training Shoes",
    slug: "flexforge-training-shoes",
    description:
      "Stable gym trainers with a flat heel, flexible forefoot, and lateral support for strength and circuit workouts.",
    category: "Footwear",
    priceMinor: 429900,
    currency: "INR",
    stock: 21,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Black", "Gum"],
      sizes: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["gym training", "strength training", "circuit workouts"],
      cushioning: "Firm",
      support: "Lateral",
      heelDropMm: 4,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000005",
    name: "CourtLine Casual Sneakers",
    slug: "courtline-casual-sneakers",
    description:
      "Clean low-top sneakers with a cushioned footbed for casual outfits, college, and everyday city wear.",
    category: "Footwear",
    priceMinor: 349900,
    currency: "INR",
    stock: 27,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["White", "Black"],
      sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["casual wear", "college", "everyday wear"],
      material: "Synthetic leather",
      cushioning: "Moderate",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000006",
    name: "Heritage Oxford Formal Shoes",
    slug: "heritage-oxford-formal-shoes",
    description:
      "Polished lace-up Oxford shoes in full-grain leather for office wear, interviews, and formal occasions.",
    category: "Footwear",
    priceMinor: 499900,
    currency: "INR",
    stock: 14,
    active: true,
    attributes: {
      audience: "Men",
      colors: ["Black", "Dark Brown"],
      sizes: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: ["office wear", "formal occasions"],
      material: "Full-grain leather",
      closure: "Lace-up",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000007",
    name: "Everyday Comfort Sandals",
    slug: "everyday-comfort-sandals",
    description:
      "Adjustable everyday sandals with a contoured footbed and grippy sole for errands and warm-weather travel.",
    category: "Footwear",
    priceMinor: 189900,
    currency: "INR",
    stock: 19,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Tan", "Black"],
      sizes: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10"],
      useCases: ["casual wear", "travel"],
      closure: "Adjustable straps",
      waterResistant: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000008",
    name: "Performance Ankle Socks",
    slug: "performance-ankle-socks",
    description:
      "Three pairs of breathable ankle socks with arch support and moisture-wicking yarn for running and training.",
    category: "Socks",
    priceMinor: 69900,
    currency: "INR",
    stock: 48,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Black", "White", "Grey"],
      sizes: ["S-M", "L-XL"],
      useCases: ["running", "gym training"],
      packSize: 3,
      moistureWicking: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000009",
    name: "Cushioned Crew Socks",
    slug: "cushioned-crew-socks",
    description:
      "Two pairs of soft crew socks with heel and toe cushioning for walking shoes, sneakers, and boots.",
    category: "Socks",
    priceMinor: 59900,
    currency: "INR",
    stock: 36,
    active: true,
    attributes: {
      audience: "Unisex",
      colors: ["Navy", "Oatmeal"],
      sizes: ["S-M", "L-XL"],
      useCases: ["walking", "everyday wear"],
      packSize: 2,
      cushioning: "Heel and toe",
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000010",
    name: "Support Gel Insoles",
    slug: "support-gel-insoles",
    description:
      "Trim-to-fit gel insoles with heel cushioning and medium arch support for walking, work, and everyday shoes.",
    category: "Insoles",
    priceMinor: 99900,
    currency: "INR",
    stock: 25,
    active: true,
    attributes: {
      audience: "Unisex",
      sizes: ["UK 4-7", "UK 8-11"],
      useCases: ["walking", "all-day wear"],
      archSupport: "Medium",
      trimToFit: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000011",
    name: "Reflective Running Laces",
    slug: "reflective-running-laces",
    description:
      "Reflective replacement laces that improve visibility during early-morning and evening road runs.",
    category: "Laces",
    priceMinor: 34900,
    currency: "INR",
    stock: 42,
    active: true,
    attributes: {
      colors: ["Volt Yellow", "Silver"],
      useCases: ["road running", "low-light running"],
      lengthCm: 120,
      reflective: true,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000012",
    name: "Complete Shoe Care Kit",
    slug: "complete-shoe-care-kit",
    description:
      "A gentle cleaner, brush, microfiber cloth, and protector spray for sneakers and everyday footwear.",
    category: "Shoe Care",
    priceMinor: 129900,
    currency: "INR",
    stock: 16,
    active: true,
    attributes: {
      useCases: ["shoe cleaning", "shoe protection"],
      suitableMaterials: ["Mesh", "Canvas", "Synthetic leather"],
      pieceCount: 4,
    },
  },
  {
    id: "21000000-0000-4000-8000-000000000013",
    name: "TempoLite Racing Shoes",
    slug: "tempolite-racing-shoes",
    description:
      "Archived lightweight racing shoes retained to verify that inactive products stay out of the live catalog.",
    category: "Footwear",
    priceMinor: 649900,
    currency: "INR",
    stock: 5,
    active: false,
    attributes: {
      audience: "Unisex",
      useCases: ["road racing"],
      surface: "Road",
    },
  },
] satisfies NewProduct[];

type FootwearDefinition = {
  name: string;
  slug: string;
  useCases: string[];
  priceMinor: number;
  audience?: "Men" | "Women" | "Kids" | "Unisex";
  features?: string[];
};

const FOOTWEAR_DEFINITIONS = [
  { name: "AeroPulse Tempo Running Shoes", slug: "aeropulse-tempo-running-shoes", useCases: ["tempo running", "road running"], priceMinor: 479900, features: ["responsive foam", "breathable mesh"] },
  { name: "BalanceArc Stability Running Shoes", slug: "balancearc-stability-running-shoes", useCases: ["stability running", "daily training"], priceMinor: 529900, features: ["medial support", "wide platform"] },
  { name: "NimbusMax Cushioned Running Shoes", slug: "nimbusmax-cushioned-running-shoes", useCases: ["long-distance running", "recovery runs"], priceMinor: 599900, features: ["max cushioning", "rocker sole"] },
  { name: "Velocity Carbon Racing Shoes", slug: "velocity-carbon-racing-shoes", useCases: ["road racing", "marathon"], priceMinor: 899900, features: ["carbon plate", "race foam"] },
  { name: "RapidTrack Sprint Spikes", slug: "rapidtrack-sprint-spikes", useCases: ["track sprinting"], priceMinor: 449900, features: ["six-pin plate", "snug fit"] },
  { name: "Meadow XC Cross-Country Spikes", slug: "meadow-xc-cross-country-spikes", useCases: ["cross-country running"], priceMinor: 469900, features: ["replaceable spikes", "mud grip"] },
  { name: "RidgeLite Trail Running Shoes", slug: "ridgelite-trail-running-shoes", useCases: ["trail running", "fast hiking"], priceMinor: 519900, features: ["trail lugs", "toe guard"] },
  { name: "StormPath Waterproof Trail Shoes", slug: "stormpath-waterproof-trail-shoes", useCases: ["trail running", "monsoon running"], priceMinor: 649900, features: ["waterproof membrane", "rock plate"] },
  { name: "CityGlide Walking Shoes", slug: "cityglide-walking-shoes", useCases: ["walking", "commuting"], priceMinor: 299900, features: ["flex grooves", "cushioned footbed"] },
  { name: "EasyStride Wide Walking Shoes", slug: "easystride-wide-walking-shoes", useCases: ["walking", "all-day wear"], priceMinor: 329900, features: ["wide fit", "padded collar"] },
  { name: "AlignCare Support Walking Shoes", slug: "aligncare-support-walking-shoes", useCases: ["supported walking", "all-day wear"], priceMinor: 459900, features: ["firm heel counter", "removable insole"] },
  { name: "RestoreStep Recovery Shoes", slug: "restorestep-recovery-shoes", useCases: ["post-workout recovery", "walking"], priceMinor: 279900, features: ["soft foam", "easy slip-on"] },
  { name: "PivotPro Gym Training Shoes", slug: "pivotpro-gym-training-shoes", useCases: ["gym training", "circuit workouts"], priceMinor: 419900, features: ["lateral support", "flexible forefoot"] },
  { name: "IronBase Weightlifting Shoes", slug: "ironbase-weightlifting-shoes", useCases: ["weightlifting", "strength training"], priceMinor: 579900, features: ["raised heel", "midfoot strap"] },
  { name: "MetconCore Cross-Training Shoes", slug: "metconcore-cross-training-shoes", useCases: ["cross training", "rope climbs"], priceMinor: 549900, features: ["stable heel", "rope guard"] },
  { name: "SkyDunk High-Top Basketball Shoes", slug: "skydunk-high-top-basketball-shoes", useCases: ["basketball", "indoor court"], priceMinor: 599900, features: ["ankle support", "impact cushioning"] },
  { name: "QuickCut Low Basketball Shoes", slug: "quickcut-low-basketball-shoes", useCases: ["basketball", "quick cuts"], priceMinor: 529900, features: ["court grip", "responsive cushioning"] },
  { name: "Baseline Hard-Court Tennis Shoes", slug: "baseline-hard-court-tennis-shoes", useCases: ["tennis", "hard court"], priceMinor: 489900, features: ["durable toe", "lateral stability"] },
  { name: "ClaySlide Tennis Shoes", slug: "clayslide-tennis-shoes", useCases: ["tennis", "clay court"], priceMinor: 499900, features: ["herringbone tread", "slide control"] },
  { name: "ShuttleFlex Badminton Shoes", slug: "shuttleflex-badminton-shoes", useCases: ["badminton", "indoor court"], priceMinor: 379900, features: ["gum rubber sole", "lightweight upper"] },
  { name: "WallDrive Squash Shoes", slug: "walldrive-squash-shoes", useCases: ["squash", "indoor court"], priceMinor: 389900, features: ["non-marking sole", "lateral support"] },
  { name: "BlockJump Volleyball Shoes", slug: "blockjump-volleyball-shoes", useCases: ["volleyball", "indoor court"], priceMinor: 439900, features: ["landing cushioning", "court traction"] },
  { name: "PitchMaster Firm-Ground Football Boots", slug: "pitchmaster-firm-ground-football-boots", useCases: ["football", "firm ground"], priceMinor: 459900, features: ["moulded studs", "touch upper"] },
  { name: "TurfControl Artificial-Grass Football Boots", slug: "turfcontrol-artificial-grass-football-boots", useCases: ["football", "artificial grass"], priceMinor: 429900, features: ["turf studs", "reinforced toe"] },
  { name: "FutsalTouch Indoor Football Shoes", slug: "futsaltouch-indoor-football-shoes", useCases: ["futsal", "indoor football"], priceMinor: 349900, features: ["flat gum sole", "ball-control upper"] },
  { name: "CreaseGuard Cricket Spikes", slug: "creaseguard-cricket-spikes", useCases: ["cricket", "grass pitch"], priceMinor: 499900, features: ["metal spikes", "reinforced forefoot"] },
  { name: "FairwayGrip Golf Shoes", slug: "fairwaygrip-golf-shoes", useCases: ["golf", "wet grass"], priceMinor: 559900, features: ["water-resistant upper", "soft spikes"] },
  { name: "Cadence Road Cycling Shoes", slug: "cadence-road-cycling-shoes", useCases: ["road cycling"], priceMinor: 649900, features: ["three-bolt cleat", "stiff sole"] },
  { name: "Switchback MTB Cycling Shoes", slug: "switchback-mtb-cycling-shoes", useCases: ["mountain biking", "bike commuting"], priceMinor: 599900, features: ["two-bolt cleat", "walkable tread"] },
  { name: "SummitGuard Hiking Boots", slug: "summitguard-hiking-boots", useCases: ["hiking", "backpacking"], priceMinor: 699900, features: ["ankle support", "waterproof membrane"] },
  { name: "DayTrek Mid Hiking Boots", slug: "daytrek-mid-hiking-boots", useCases: ["day hiking", "travel"], priceMinor: 549900, features: ["grippy outsole", "protective toe"] },
  { name: "ExpeditionPro Trekking Boots", slug: "expeditionpro-trekking-boots", useCases: ["trekking", "backpacking"], priceMinor: 799900, features: ["full rand", "load support"] },
  { name: "ForgeSafe Steel-Toe Work Boots", slug: "forgesafe-steel-toe-work-boots", useCases: ["work", "industrial safety"], priceMinor: 599900, features: ["steel toe", "oil-resistant sole"], audience: "Men" },
  { name: "Monsoon Tall Rain Boots", slug: "monsoon-tall-rain-boots", useCases: ["rain", "gardening"], priceMinor: 249900, features: ["waterproof rubber", "easy-clean tread"] },
  { name: "Metro Chelsea Boots", slug: "metro-chelsea-boots", useCases: ["office wear", "casual wear"], priceMinor: 549900, features: ["elastic gusset", "leather upper"] },
  { name: "Weekender Chukka Boots", slug: "weekender-chukka-boots", useCases: ["smart casual wear", "travel"], priceMinor: 489900, features: ["suede upper", "cushioned footbed"] },
  { name: "DuneWalk Desert Boots", slug: "dunewalk-desert-boots", useCases: ["casual wear", "office wear"], priceMinor: 459900, features: ["crepe sole", "suede upper"] },
  { name: "Regent Cap-Toe Oxford Shoes", slug: "regent-cap-toe-oxford-shoes", useCases: ["formal occasions", "office wear"], priceMinor: 579900, features: ["leather upper", "closed lacing"], audience: "Men" },
  { name: "Classic Plain-Toe Derby Shoes", slug: "classic-plain-toe-derby-shoes", useCases: ["formal occasions", "office wear"], priceMinor: 529900, features: ["open lacing", "leather lining"], audience: "Men" },
  { name: "Signature Double-Monk Shoes", slug: "signature-double-monk-shoes", useCases: ["formal occasions", "occasion wear"], priceMinor: 599900, features: ["double buckle", "leather upper"], audience: "Men" },
  { name: "Wingtip Brogue Shoes", slug: "wingtip-brogue-shoes", useCases: ["smart casual wear", "office wear"], priceMinor: 569900, features: ["brogue detailing", "wingtip toe"], audience: "Men" },
  { name: "Campus Penny Loafers", slug: "campus-penny-loafers", useCases: ["college", "smart casual wear"], priceMinor: 399900, features: ["slip-on fit", "penny strap"] },
  { name: "Club Tassel Loafers", slug: "club-tassel-loafers", useCases: ["occasion wear", "smart casual wear"], priceMinor: 449900, features: ["tassel detail", "padded footbed"] },
  { name: "Roadster Driving Moccasins", slug: "roadster-driving-moccasins", useCases: ["driving", "casual wear"], priceMinor: 379900, features: ["pebbled sole", "flexible leather"] },
  { name: "Harbour Deck Boat Shoes", slug: "harbour-deck-boat-shoes", useCases: ["travel", "casual wear"], priceMinor: 369900, features: ["siped sole", "rawhide laces"] },
  { name: "RetroCourt Leather Sneakers", slug: "retrocourt-leather-sneakers", useCases: ["casual wear", "everyday wear"], priceMinor: 429900, features: ["leather upper", "cupsole"] },
  { name: "StreetRise High-Top Sneakers", slug: "streetrise-high-top-sneakers", useCases: ["streetwear", "casual wear"], priceMinor: 399900, features: ["ankle collar", "rubber toe cap"] },
  { name: "CanvasDay Low-Top Sneakers", slug: "canvasday-low-top-sneakers", useCases: ["college", "casual wear"], priceMinor: 249900, features: ["canvas upper", "vulcanised sole"] },
  { name: "RailGrind Skate Shoes", slug: "railgrind-skate-shoes", useCases: ["skateboarding", "streetwear"], priceMinor: 389900, features: ["reinforced ollie zone", "grippy sole"] },
  { name: "Breeze Slip-On Sneakers", slug: "breeze-slip-on-sneakers", useCases: ["travel", "everyday wear"], priceMinor: 279900, features: ["stretch panels", "lightweight sole"] },
  { name: "Scholar Lace-Up School Shoes", slug: "scholar-lace-up-school-shoes", useCases: ["school", "daily wear"], priceMinor: 229900, features: ["scuff-resistant upper", "non-marking sole"], audience: "Kids" },
  { name: "Scholar Mary Jane School Shoes", slug: "scholar-mary-jane-school-shoes", useCases: ["school", "daily wear"], priceMinor: 219900, features: ["hook-and-loop strap", "non-marking sole"], audience: "Kids" },
  { name: "Poise Ballet Flats", slug: "poise-ballet-flats", useCases: ["office wear", "everyday wear"], priceMinor: 269900, features: ["flexible sole", "cushioned heel"], audience: "Women" },
  { name: "Gallery Block-Heel Shoes", slug: "gallery-block-heel-shoes", useCases: ["office wear", "occasion wear"], priceMinor: 379900, features: ["block heel", "padded forefoot"], audience: "Women" },
  { name: "Terrace Wedge Sandals", slug: "terrace-wedge-sandals", useCases: ["occasion wear", "casual wear"], priceMinor: 349900, features: ["wedge heel", "adjustable strap"], audience: "Women" },
  { name: "Studio Backless Mules", slug: "studio-backless-mules", useCases: ["office wear", "smart casual wear"], priceMinor: 329900, features: ["backless fit", "low heel"], audience: "Women" },
  { name: "Coastline Espadrilles", slug: "coastline-espadrilles", useCases: ["holiday wear", "casual wear"], priceMinor: 299900, features: ["jute wrap", "canvas upper"] },
  { name: "RiverCross Sport Sandals", slug: "rivercross-sport-sandals", useCases: ["hiking", "water crossings"], priceMinor: 289900, features: ["quick-dry straps", "toe protection"] },
  { name: "Crafted Leather Sandals", slug: "crafted-leather-sandals", useCases: ["casual wear", "traditional wear"], priceMinor: 259900, features: ["leather straps", "contoured footbed"] },
  { name: "Poolside Comfort Slides", slug: "poolside-comfort-slides", useCases: ["poolside", "post-workout recovery"], priceMinor: 149900, features: ["one-piece foam", "water friendly"] },
  { name: "BeachWalk Flip-Flops", slug: "beachwalk-flip-flops", useCases: ["beach", "casual wear"], priceMinor: 89900, features: ["soft toe post", "textured footbed"] },
  { name: "GardenEase Utility Clogs", slug: "gardenease-utility-clogs", useCases: ["gardening", "casual wear"], priceMinor: 179900, features: ["washable foam", "heel strap"] },
  { name: "ReefRunner Water Shoes", slug: "reefrunner-water-shoes", useCases: ["water sports", "beach"], priceMinor: 199900, features: ["drainage ports", "grippy rubber"] },
  { name: "TinySteps First-Walker Shoes", slug: "tinysteps-first-walker-shoes", useCases: ["first walking", "play"], priceMinor: 169900, features: ["wide toe box", "flexible sole"], audience: "Kids" },
] satisfies FootwearDefinition[];

type AccessoryDefinition = {
  name: string;
  slug: string;
  category: "Socks" | "Laces" | "Insoles" | "Shoe Care" | "Shoe Accessories";
  description: string;
  priceMinor: number;
  stock: number;
  attributes: Record<string, unknown>;
};

const ACCESSORY_DEFINITIONS = [
  { name: "No-Show Sneaker Socks", slug: "no-show-sneaker-socks", category: "Socks", description: "Three pairs of low-profile socks with heel grips for sneakers and loafers.", priceMinor: 64900, stock: 44, attributes: { packSize: 3, sizes: ["S-M", "L-XL"], useCases: ["sneakers", "loafers"] } },
  { name: "Merino Hiking Socks", slug: "merino-hiking-socks", category: "Socks", description: "Temperature-regulating crew socks with mapped cushioning for hiking boots.", priceMinor: 89900, stock: 31, attributes: { material: "Merino blend", sizes: ["S-M", "L-XL"], useCases: ["hiking", "trekking"] } },
  { name: "Compression Running Socks", slug: "compression-running-socks", category: "Socks", description: "Knee-high graduated compression socks for long runs and recovery.", priceMinor: 99900, stock: 28, attributes: { compression: "Graduated", sizes: ["S-M", "L-XL"], useCases: ["running", "recovery"] } },
  { name: "Quarter Training Socks", slug: "quarter-training-socks", category: "Socks", description: "Four pairs of moisture-wicking quarter socks for training shoes.", priceMinor: 74900, stock: 52, attributes: { packSize: 4, moistureWicking: true, useCases: ["gym training"] } },
  { name: "Formal Mercerised Socks", slug: "formal-mercerised-socks", category: "Socks", description: "Two pairs of fine-gauge socks shaped for formal shoes and office wear.", priceMinor: 79900, stock: 36, attributes: { packSize: 2, material: "Mercerised cotton", useCases: ["formal wear"] } },
  { name: "Cushioned Football Socks", slug: "cushioned-football-socks", category: "Socks", description: "Over-calf sports socks with shin-guard room for football boots.", priceMinor: 54900, stock: 47, attributes: { length: "Over-calf", sizes: ["S-M", "L-XL"], useCases: ["football"] } },
  { name: "Court Crew Socks", slug: "court-crew-socks", category: "Socks", description: "Cushioned crew socks with ventilated zones for court shoes.", priceMinor: 64900, stock: 41, attributes: { cushioning: "Medium", useCases: ["basketball", "tennis"] } },
  { name: "Kids Everyday Shoe Socks", slug: "kids-everyday-shoe-socks", category: "Socks", description: "Five pairs of soft everyday socks sized for children's school shoes.", priceMinor: 69900, stock: 39, attributes: { audience: "Kids", packSize: 5, sizes: ["Kids S", "Kids M"] } },
  { name: "Thermal Boot Socks", slug: "thermal-boot-socks", category: "Socks", description: "Thick brushed socks that add warmth inside winter and work boots.", priceMinor: 84900, stock: 26, attributes: { warmth: "High", useCases: ["winter boots", "work boots"] } },
  { name: "Toe-Separated Running Socks", slug: "toe-separated-running-socks", category: "Socks", description: "Blister-reducing toe socks made for long-distance running shoes.", priceMinor: 74900, stock: 29, attributes: { toeSeparated: true, moistureWicking: true, useCases: ["running"] } },
  { name: "Classic Flat Sneaker Laces", slug: "classic-flat-sneaker-laces", category: "Laces", description: "Cotton-blend flat replacement laces for low-top and high-top sneakers.", priceMinor: 24900, stock: 70, attributes: { lengthsCm: [100, 120, 140], colors: ["White", "Black", "Navy"] } },
  { name: "Round Waxed Formal Laces", slug: "round-waxed-formal-laces", category: "Laces", description: "Slim waxed replacement laces for Oxford, Derby, and brogue shoes.", priceMinor: 29900, stock: 62, attributes: { lengthsCm: [75, 90], colors: ["Black", "Dark Brown"] } },
  { name: "Heavy-Duty Boot Laces", slug: "heavy-duty-boot-laces", category: "Laces", description: "Abrasion-resistant round laces for hiking and work boots.", priceMinor: 39900, stock: 55, attributes: { lengthsCm: [140, 160, 180], abrasionResistant: true } },
  { name: "Elastic No-Tie Laces", slug: "elastic-no-tie-laces", category: "Laces", description: "Stretch laces with locking toggles that turn lace-up shoes into slip-ons.", priceMinor: 44900, stock: 49, attributes: { elastic: true, lockingToggle: true, lengthCm: 110 } },
  { name: "Trail Lock Performance Laces", slug: "trail-lock-performance-laces", category: "Laces", description: "Textured laces that resist loosening in trail running shoes.", priceMinor: 34900, stock: 46, attributes: { lengthsCm: [120, 140], slipResistant: true } },
  { name: "Kids Bright Shoe Laces", slug: "kids-bright-shoe-laces", category: "Laces", description: "Colourful flat laces sized for children's sneakers and school shoes.", priceMinor: 19900, stock: 64, attributes: { audience: "Kids", lengthCm: 80, colors: ["Red", "Blue", "Rainbow"] } },
  { name: "Leather Boat Shoe Laces", slug: "leather-boat-shoe-laces", category: "Laces", description: "Supple leather replacement laces made for boat shoes and moccasins.", priceMinor: 49900, stock: 33, attributes: { material: "Leather", lengthCm: 90, colors: ["Tan", "Brown"] } },
  { name: "Memory Foam Comfort Insoles", slug: "memory-foam-comfort-insoles", category: "Insoles", description: "Trim-to-fit memory foam insoles for casual and walking shoes.", priceMinor: 79900, stock: 38, attributes: { material: "Memory foam", sizes: ["UK 4-7", "UK 8-11"], trimToFit: true } },
  { name: "High-Arch Support Insoles", slug: "high-arch-support-insoles", category: "Insoles", description: "Firm full-length insoles shaped for high arches and everyday shoes.", priceMinor: 119900, stock: 27, attributes: { archSupport: "High", sizes: ["UK 4-7", "UK 8-11"] } },
  { name: "Work Boot Impact Insoles", slug: "work-boot-impact-insoles", category: "Insoles", description: "Shock-absorbing insoles with a reinforced heel for work boots.", priceMinor: 109900, stock: 32, attributes: { cushioning: "High impact", useCases: ["work boots"] } },
  { name: "Running Performance Insoles", slug: "running-performance-insoles", category: "Insoles", description: "Lightweight insoles with heel control and rebound foam for running shoes.", priceMinor: 129900, stock: 34, attributes: { support: "Dynamic", useCases: ["running"] } },
  { name: "Warm Felt Boot Insoles", slug: "warm-felt-boot-insoles", category: "Insoles", description: "Insulating felt insoles that add warmth to rain and winter boots.", priceMinor: 69900, stock: 29, attributes: { material: "Felt", warmth: "High" } },
  { name: "Slim Formal Shoe Insoles", slug: "slim-formal-shoe-insoles", category: "Insoles", description: "Low-volume leather-topped insoles for close-fitting formal shoes.", priceMinor: 89900, stock: 25, attributes: { profile: "Slim", material: "Leather and foam" } },
  { name: "Everyday Sneaker Cleaning Foam", slug: "everyday-sneaker-cleaning-foam", category: "Shoe Care", description: "Gentle foaming shoe care cleaner for mesh, canvas, and synthetic sneakers.", priceMinor: 54900, stock: 43, attributes: { volumeMl: 150, suitableMaterials: ["Mesh", "Canvas", "Synthetic"] } },
  { name: "Suede and Nubuck Shoe Care Brush", slug: "suede-nubuck-shoe-care-brush", category: "Shoe Care", description: "Multi-sided brush for lifting dirt and restoring suede and nubuck shoes.", priceMinor: 44900, stock: 35, attributes: { suitableMaterials: ["Suede", "Nubuck"], sides: 4 } },
  { name: "Leather Shoe Conditioning Cream", slug: "leather-shoe-conditioning-cream", category: "Shoe Care", description: "Neutral conditioning shoe care cream for smooth leather shoes and boots.", priceMinor: 59900, stock: 37, attributes: { volumeMl: 75, suitableMaterials: ["Smooth leather"] } },
  { name: "Black Shoe Polish Wax", slug: "black-shoe-polish-wax", category: "Shoe Care", description: "High-shine wax shoe polish for black formal shoes and leather boots.", priceMinor: 29900, stock: 58, attributes: { color: "Black", suitableMaterials: ["Smooth leather"] } },
  { name: "Waterproof Shoe Protector Spray", slug: "waterproof-shoe-protector-spray", category: "Shoe Care", description: "Invisible shoe care spray that helps repel rain and stains from footwear.", priceMinor: 69900, stock: 40, attributes: { volumeMl: 200, waterRepellent: true } },
  { name: "White Sole Cleaning Kit", slug: "white-sole-cleaning-kit", category: "Shoe Care", description: "Targeted shoe care kit with sole cleaner, stiff brush, and cloth.", priceMinor: 84900, stock: 30, attributes: { pieceCount: 3, useCases: ["rubber sole cleaning"] } },
  { name: "Shoe Freshener Deodorising Spray", slug: "shoe-freshener-deodorising-spray", category: "Shoe Care", description: "Quick-drying deodorising spray for sports shoes, boots, and everyday footwear.", priceMinor: 39900, stock: 51, attributes: { volumeMl: 120, fragrance: "Fresh citrus" } },
  { name: "Cedar Shoe Trees", slug: "cedar-shoe-trees", category: "Shoe Accessories", description: "Adjustable aromatic cedar shoe trees that help formal shoes retain their shape.", priceMinor: 169900, stock: 24, attributes: { material: "Cedar wood", sizes: ["UK 6-8", "UK 9-11"] } },
  { name: "Travel Shoe Bags", slug: "travel-shoe-bags", category: "Shoe Accessories", description: "Two ventilated drawstring bags that keep shoes separate inside luggage.", priceMinor: 49900, stock: 45, attributes: { packSize: 2, waterResistant: true } },
  { name: "Long-Handle Shoe Horn", slug: "long-handle-shoe-horn", category: "Shoe Accessories", description: "A sturdy long shoe horn for putting on boots and formal shoes without bending.", priceMinor: 59900, stock: 34, attributes: { lengthCm: 55, material: "Stainless steel" } },
  { name: "Self-Adhesive Heel Grips", slug: "self-adhesive-heel-grips", category: "Shoe Accessories", description: "Soft heel grips that improve fit and reduce rubbing in loose shoes.", priceMinor: 34900, stock: 57, attributes: { packSize: 2, material: "Suede-touch foam" } },
  { name: "Sneaker Crease Protectors", slug: "sneaker-crease-protectors", category: "Shoe Accessories", description: "Ventilated inserts that help sneaker toe boxes resist creasing.", priceMinor: 44900, stock: 48, attributes: { packSize: 2, sizes: ["S-M", "L-XL"] } },
  { name: "Ice Grip Shoe Cleats", slug: "ice-grip-shoe-cleats", category: "Shoe Accessories", description: "Stretch-on traction cleats that fit over walking shoes and boots on ice.", priceMinor: 89900, stock: 22, attributes: { sizes: ["S-M", "L-XL"], spikes: 10 } },
] satisfies AccessoryDefinition[];

function demoProductId(sequence: number): string {
  return `21000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`;
}

const ADDITIONAL_FOOTWEAR = FOOTWEAR_DEFINITIONS.map(
  (definition, index): NewProduct => ({
    id: demoProductId(101 + index),
    name: definition.name,
    slug: definition.slug,
    description: `${definition.name} designed for ${definition.useCases.join(" and ")}, with ${definition.features?.join(" and ") ?? "dependable comfort"}.`,
    category: "Footwear",
    priceMinor: definition.priceMinor,
    currency: "INR",
    stock: 12 + ((index * 7) % 37),
    active: true,
    attributes: {
      audience: definition.audience ?? "Unisex",
      colors: ["Core Black", "Arc White"],
      sizes:
        definition.audience === "Kids"
          ? ["UK 10 Kids", "UK 11 Kids", "UK 12 Kids", "UK 13 Kids", "UK 1", "UK 2"]
          : ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
      useCases: definition.useCases,
      features: definition.features ?? [],
    },
  }),
);

const ADDITIONAL_ACCESSORIES = ACCESSORY_DEFINITIONS.map(
  (definition, index): NewProduct => ({
    id: demoProductId(201 + index),
    ...definition,
    currency: "INR",
    active: true,
  }),
);

const DEMO_PRODUCTS = [
  ...CORE_DEMO_PRODUCTS,
  ...ADDITIONAL_FOOTWEAR,
  ...ADDITIONAL_ACCESSORIES,
] satisfies NewProduct[];

export async function seedDemoCatalog(): Promise<void> {
  const now = new Date();

  await db.transaction(async (transaction) => {
    await transaction
      .insert(brands)
      .values({
        id: DEMO_BRAND_ID,
        name: "Arc",
        slug: "arc",
        description:
          "Everyday footwear and accessories, discovered with the Arc Commerce Agent.",
        logoUrl: null,
        currency: "INR",
      })
      .onConflictDoUpdate({
        target: brands.singletonKey,
        set: {
          name: "Arc",
          slug: "arc",
          description:
            "Everyday footwear and accessories, discovered with the Arc Commerce Agent.",
          logoUrl: null,
          currency: "INR",
          updatedAt: now,
        },
      });

    await transaction
      .update(products)
      .set({ active: false, updatedAt: now });

    await transaction
      .insert(products)
      .values(DEMO_PRODUCTS)
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          priceMinor: sql`excluded.price_minor`,
          currency: sql`excluded.currency`,
          stock: sql`excluded.stock`,
          active: sql`excluded.active`,
          attributes: sql`excluded.attributes`,
          updatedAt: now,
        },
      });
  });
}
