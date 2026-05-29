import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const brands = [
  { id: "brand-nike",     name: "Nike",     slug: "nike",     logoUrl: null },
  { id: "brand-zara",     name: "Zara",     slug: "zara",     logoUrl: null },
  { id: "brand-hm",       name: "H&M",      slug: "hm",       logoUrl: null },
  { id: "brand-puma",     name: "Puma",     slug: "puma",     logoUrl: null },
  { id: "brand-adidas",   name: "Adidas",   slug: "adidas",   logoUrl: null },
  { id: "brand-levis",    name: "Levis",    slug: "levis",    logoUrl: null },
  { id: "brand-tommy",    name: "Tommy",    slug: "tommy",    logoUrl: null },
  { id: "brand-arrow",    name: "Arrow",    slug: "arrow",    logoUrl: null },
  { id: "brand-mango",    name: "Mango",    slug: "mango",    logoUrl: null },
  { id: "brand-uniqlo",   name: "Uniqlo",   slug: "uniqlo",   logoUrl: null },
  { id: "brand-fabindia", name: "Fabindia", slug: "fabindia", logoUrl: null },
  { id: "brand-and",      name: "AND",      slug: "and",      logoUrl: null },
  { id: "brand-biba",     name: "Biba",     slug: "biba",     logoUrl: null },
  { id: "brand-roadster", name: "Roadster", slug: "roadster", logoUrl: null },
];

function brandIdFor(name: string): string | undefined {
  return brands.find((b) => b.name === name)?.id;
}

type SkuSeed = { id: string; size: string; color: string; colorHex: string; barcode: string };
type ProductSeed = {
  id: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  price: number;
  mrp: number;
  description: string;
  skus: SkuSeed[];
};

const products: ProductSeed[] = [
  {
    id: "prod-oxford-shirt",
    name: "Classic Oxford Shirt",
    brand: "H&M",
    category: "Shirts",
    gender: "Men",
    price: 149900,
    mrp: 199900,
    description: "A timeless Oxford shirt crafted from 100% pure cotton. Features a button-down collar, chest pocket, and relaxed fit perfect for both casual and smart-casual occasions.",
    skus: [
      { id: "sku-os-s", size: "S", color: "White", colorHex: "#FFFFFF", barcode: "HMOS-WHT-S" },
      { id: "sku-os-m", size: "M", color: "White", colorHex: "#FFFFFF", barcode: "HMOS-WHT-M" },
      { id: "sku-os-l", size: "L", color: "White", colorHex: "#FFFFFF", barcode: "HMOS-WHT-L" },
    ],
  },
  {
    id: "prod-slim-chinos",
    name: "Slim Fit Chinos",
    brand: "Zara",
    category: "Trousers",
    gender: "Men",
    price: 199900,
    mrp: 249900,
    description: "Tailored slim-fit chinos in a stretch cotton blend for all-day comfort. Mid-rise waistband with five-pocket styling. Pairs effortlessly with shirts or casual tees.",
    skus: [
      { id: "sku-sc-30", size: "30", color: "Navy", colorHex: "#1B2A4A", barcode: "ZARC-NAV-30" },
      { id: "sku-sc-32", size: "32", color: "Navy", colorHex: "#1B2A4A", barcode: "ZARC-NAV-32" },
    ],
  },
  {
    id: "prod-floral-dress",
    name: "Floral Wrap Dress",
    brand: "Mango",
    category: "Dresses",
    gender: "Women",
    price: 249900,
    mrp: 624900,
    description: "A feminine wrap dress in a vibrant floral print. V-neckline, adjustable tie waist, and flowy midi-length skirt. Made from lightweight viscose for a breezy, comfortable feel.",
    skus: [
      { id: "sku-fd-s", size: "S", color: "Floral Print", colorHex: "#E91E8C", barcode: "MNFD-FLR-S" },
      { id: "sku-fd-m", size: "M", color: "Floral Print", colorHex: "#E91E8C", barcode: "MNFD-FLR-M" },
    ],
  },
  {
    id: "prod-crew-tee",
    name: "Crew Neck T-Shirt",
    brand: "Uniqlo",
    category: "T-Shirts",
    gender: "Unisex",
    price: 99900,
    mrp: 199900,
    description: "Supima cotton crew neck tee with a smooth, soft finish. A versatile wardrobe essential available in a relaxed, everyday fit. Pre-washed to reduce shrinkage.",
    skus: [
      { id: "sku-ct-m", size: "M", color: "Black", colorHex: "#1C1C1C", barcode: "UNBT-BLK-M" },
      { id: "sku-ct-l", size: "L", color: "Black", colorHex: "#1C1C1C", barcode: "UNBT-BLK-L" },
      { id: "sku-ct-xl", size: "XL", color: "Black", colorHex: "#1C1C1C", barcode: "UNBT-BLK-XL" },
    ],
  },
  {
    id: "prod-linen-kurta",
    name: "Linen Straight Kurta",
    brand: "Fabindia",
    category: "Ethnic",
    gender: "Men",
    price: 179900,
    mrp: 249900,
    description: "Handcrafted straight-cut kurta in pure linen. Features subtle texture weave, mandarin collar, and side slits for ease of movement. Perfect for festive and everyday Indian wear.",
    skus: [
      { id: "sku-lk-s", size: "S", color: "Beige", colorHex: "#D4B896", barcode: "FABK-BEI-S" },
      { id: "sku-lk-m", size: "M", color: "Beige", colorHex: "#D4B896", barcode: "FABK-BEI-M" },
    ],
  },
  {
    id: "prod-dark-jeans",
    name: "High-Rise Skinny Jeans",
    brand: "Levis",
    category: "Jeans",
    gender: "Women",
    price: 299900,
    mrp: 399900,
    description: "High-rise skinny jeans in dark indigo denim. Super-stretch fabric sculpts and moves with you. Classic five-pocket design with Levi's signature back patch.",
    skus: [
      { id: "sku-dj-28", size: "28", color: "Dark Blue", colorHex: "#1A237E", barcode: "LEVJ-DBL-28" },
      { id: "sku-dj-30", size: "30", color: "Dark Blue", colorHex: "#1A237E", barcode: "LEVJ-DBL-30" },
    ],
  },
  {
    id: "prod-maxi-dress",
    name: "Printed Maxi Dress",
    brand: "AND",
    category: "Dresses",
    gender: "Women",
    price: 229900,
    mrp: 299900,
    description: "Bold geometric print maxi dress with a relaxed silhouette. Sleeveless design with a round neckline and concealed back zipper. Ideal for summer evenings and occasions.",
    skus: [
      { id: "sku-md-m", size: "M", color: "Geometric Print", colorHex: "#7B5EA7", barcode: "ANDM-GEO-M" },
      { id: "sku-md-l", size: "L", color: "Geometric Print", colorHex: "#7B5EA7", barcode: "ANDM-GEO-L" },
    ],
  },
  {
    id: "prod-polo-shirt",
    name: "Classic Polo Shirt",
    brand: "Arrow",
    category: "T-Shirts",
    gender: "Men",
    price: 179900,
    mrp: 249900,
    description: "Premium piqué cotton polo with a two-button placket and ribbed collar and cuffs. Subtle embroidered logo at chest. A refined take on the casual classic.",
    skus: [
      { id: "sku-ps-m", size: "M", color: "Grey", colorHex: "#9E9E9E", barcode: "ARRP-GRY-M" },
      { id: "sku-ps-l", size: "L", color: "Grey", colorHex: "#9E9E9E", barcode: "ARRP-GRY-L" },
      { id: "sku-ps-xl", size: "XL", color: "Grey", colorHex: "#9E9E9E", barcode: "ARRP-GRY-XL" },
    ],
  },
  {
    id: "prod-salwar-suit",
    name: "Embroidered Salwar Suit Set",
    brand: "Biba",
    category: "Ethnic",
    gender: "Women",
    price: 349900,
    mrp: 499900,
    description: "Three-piece salwar suit set with intricate embroidery on the kurta. Includes matching churidar and dupatta. Crafted in soft art silk for a graceful, festive look.",
    skus: [
      { id: "sku-ss-s", size: "S", color: "Turquoise", colorHex: "#1ABC9C", barcode: "BIBS-TRQ-S" },
      { id: "sku-ss-m", size: "M", color: "Turquoise", colorHex: "#1ABC9C", barcode: "BIBS-TRQ-M" },
    ],
  },
  {
    id: "prod-cargo-shorts",
    name: "Utility Cargo Shorts",
    brand: "Roadster",
    category: "Shorts",
    gender: "Men",
    price: 149900,
    mrp: 249900,
    description: "Rugged cargo shorts with multiple utility pockets. Drawstring waist and mid-thigh length. Durable twill construction that's built for outdoor adventures and casual outings.",
    skus: [
      { id: "sku-cs-30", size: "30", color: "Olive", colorHex: "#808000", barcode: "RDCS-OLV-30" },
      { id: "sku-cs-32", size: "32", color: "Olive", colorHex: "#808000", barcode: "RDCS-OLV-32" },
    ],
  },
];

async function main(): Promise<void> {
  for (const b of brands) {
    await prisma.brand.upsert({ where: { id: b.id }, update: {}, create: b });
  }
  console.log("Brands seeded:", brands.length);

  const zone = await prisma.zone.upsert({
    where: { id: "zone-bengaluru-central" },
    update: {},
    create: {
      id: "zone-bengaluru-central",
      name: "Bengaluru Central",
      centerLat: 12.9716,
      centerLng: 77.5946,
      radiusKm: 5.0,
    },
  });
  console.log("Zone:", zone.name);

  const warehouse = await prisma.warehouse.upsert({
    where: { id: "wh-hsr-layout" },
    update: {},
    create: {
      id: "wh-hsr-layout",
      name: "ThreadDash HSR Hub",
      zoneId: zone.id,
      lat: 12.9116,
      lng: 77.6389,
      address: "23 HSR Layout Sector 6, Bengaluru 560102",
      capacitySqFt: 4000,
    },
  });
  console.log("Warehouse:", warehouse.name);

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { id: p.id },
      update: { category: p.category, gender: p.gender, mrp: p.mrp, description: p.description },
      create: {
        id: p.id,
        name: p.name,
        brand: p.brand,
        brandId: brandIdFor(p.brand),
        category: p.category,
        gender: p.gender,
        price: p.price,
        mrp: p.mrp,
        description: p.description,
        images: [],
      },
    });

    for (const s of p.skus) {
      const sku = await prisma.sku.upsert({
        where: { id: s.id },
        update: { colorHex: s.colorHex },
        create: {
          id: s.id,
          productId: product.id,
          size: s.size,
          color: s.color,
          colorHex: s.colorHex,
          barcode: s.barcode,
        },
      });

      await prisma.inventory.upsert({
        where: { skuId_warehouseId: { skuId: sku.id, warehouseId: warehouse.id } },
        update: {},
        create: {
          skuId: sku.id,
          warehouseId: warehouse.id,
          quantityAvailable: 8,
          quantityReserved: 0,
          reorderThreshold: 3,
        },
      });
    }

    console.log(`  Product seeded: ${product.name} [${p.gender}]`);
  }

  const bannerData = [
    {
      id: "banner-sale",
      title: "UP TO 70% OFF",
      subtitle: "Best of Fashion",
      bgColor: "#FF3F6C",
      textColor: "#FFFFFF",
      actionType: "discount",
      actionValue: "20",
      isActive: true,
      sortOrder: 0,
    },
    {
      id: "banner-new",
      title: "NEW ARRIVALS",
      subtitle: "Fresh Styles Daily",
      bgColor: "#282C3F",
      textColor: "#FFFFFF",
      actionType: "sort",
      actionValue: "new_arrivals",
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "banner-trendy",
      title: "TRENDY PICKS",
      subtitle: "Curated For You",
      bgColor: "#282C3F",
      textColor: "#FF3F6C",
      actionType: "discount",
      actionValue: "10",
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const b of bannerData) {
    await prisma.banner.upsert({
      where: { id: b.id },
      update: {
        title: b.title,
        subtitle: b.subtitle,
        bgColor: b.bgColor,
        textColor: b.textColor,
        actionType: b.actionType,
        actionValue: b.actionValue,
        isActive: b.isActive,
        sortOrder: b.sortOrder,
      },
      create: b,
    });
    console.log(`  Banner seeded: ${b.title}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nSeed complete.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
