import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SkuSeed = { id: string; size: string; color: string; barcode: string };
type ProductSeed = {
  id: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  price: number;
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
    skus: [
      { id: "sku-os-s", size: "S", color: "White", barcode: "HMOS-WHT-S" },
      { id: "sku-os-m", size: "M", color: "White", barcode: "HMOS-WHT-M" },
      { id: "sku-os-l", size: "L", color: "White", barcode: "HMOS-WHT-L" },
    ],
  },
  {
    id: "prod-slim-chinos",
    name: "Slim Fit Chinos",
    brand: "Zara",
    category: "Trousers",
    gender: "Men",
    price: 199900,
    skus: [
      { id: "sku-sc-30", size: "30", color: "Navy", barcode: "ZARC-NAV-30" },
      { id: "sku-sc-32", size: "32", color: "Navy", barcode: "ZARC-NAV-32" },
    ],
  },
  {
    id: "prod-floral-dress",
    name: "Floral Wrap Dress",
    brand: "Mango",
    category: "Dresses",
    gender: "Women",
    price: 249900,
    skus: [
      { id: "sku-fd-s", size: "S", color: "Floral Print", barcode: "MNFD-FLR-S" },
      { id: "sku-fd-m", size: "M", color: "Floral Print", barcode: "MNFD-FLR-M" },
    ],
  },
  {
    id: "prod-crew-tee",
    name: "Crew Neck T-Shirt",
    brand: "Uniqlo",
    category: "T-Shirts",
    gender: "Unisex",
    price: 99900,
    skus: [
      { id: "sku-ct-m", size: "M", color: "Black", barcode: "UNBT-BLK-M" },
      { id: "sku-ct-l", size: "L", color: "Black", barcode: "UNBT-BLK-L" },
      { id: "sku-ct-xl", size: "XL", color: "Black", barcode: "UNBT-BLK-XL" },
    ],
  },
  {
    id: "prod-linen-kurta",
    name: "Linen Straight Kurta",
    brand: "Fabindia",
    category: "Ethnic",
    gender: "Men",
    price: 179900,
    skus: [
      { id: "sku-lk-s", size: "S", color: "Beige", barcode: "FABK-BEI-S" },
      { id: "sku-lk-m", size: "M", color: "Beige", barcode: "FABK-BEI-M" },
    ],
  },
  {
    id: "prod-dark-jeans",
    name: "High-Rise Skinny Jeans",
    brand: "Levis",
    category: "Jeans",
    gender: "Women",
    price: 299900,
    skus: [
      { id: "sku-dj-28", size: "28", color: "Dark Blue", barcode: "LEVJ-DBL-28" },
      { id: "sku-dj-30", size: "30", color: "Dark Blue", barcode: "LEVJ-DBL-30" },
    ],
  },
  {
    id: "prod-maxi-dress",
    name: "Printed Maxi Dress",
    brand: "AND",
    category: "Dresses",
    gender: "Women",
    price: 229900,
    skus: [
      { id: "sku-md-m", size: "M", color: "Geometric Print", barcode: "ANDM-GEO-M" },
      { id: "sku-md-l", size: "L", color: "Geometric Print", barcode: "ANDM-GEO-L" },
    ],
  },
  {
    id: "prod-polo-shirt",
    name: "Classic Polo Shirt",
    brand: "Arrow",
    category: "T-Shirts",
    gender: "Men",
    price: 179900,
    skus: [
      { id: "sku-ps-m", size: "M", color: "Grey", barcode: "ARRP-GRY-M" },
      { id: "sku-ps-l", size: "L", color: "Grey", barcode: "ARRP-GRY-L" },
      { id: "sku-ps-xl", size: "XL", color: "Grey", barcode: "ARRP-GRY-XL" },
    ],
  },
  {
    id: "prod-salwar-suit",
    name: "Embroidered Salwar Suit Set",
    brand: "Biba",
    category: "Ethnic",
    gender: "Women",
    price: 349900,
    skus: [
      { id: "sku-ss-s", size: "S", color: "Turquoise", barcode: "BIBS-TRQ-S" },
      { id: "sku-ss-m", size: "M", color: "Turquoise", barcode: "BIBS-TRQ-M" },
    ],
  },
  {
    id: "prod-cargo-shorts",
    name: "Utility Cargo Shorts",
    brand: "Roadster",
    category: "Shorts",
    gender: "Men",
    price: 149900,
    skus: [
      { id: "sku-cs-30", size: "30", color: "Olive", barcode: "RDCS-OLV-30" },
      { id: "sku-cs-32", size: "32", color: "Olive", barcode: "RDCS-OLV-32" },
    ],
  },
];

async function main(): Promise<void> {
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
      update: { category: p.category, gender: p.gender },
      create: {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        gender: p.gender,
        price: p.price,
        images: [],
      },
    });

    for (const s of p.skus) {
      const sku = await prisma.sku.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          productId: product.id,
          size: s.size,
          color: s.color,
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
