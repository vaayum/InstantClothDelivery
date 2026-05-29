/**
 * Generates a human-readable, unique SKU barcode.
 * Format: {BRAND3}-{CAT2}{SUBCAT1}-{COLOR3}-{SIZE4}-{EPOCH4}
 * Examples:
 *   Zara, "T-Shirt", "MEN",     Navy,  M  → "ZAR-TSM-NAV-M-K3P2"
 *   H&M,  "Jeans",   "WOMEN",   Blue,  28 → "HM-JEW-BLU-28-K3P3"
 *   Fabindia, "Kurta", "UNISEX", Beige, L  → "FAB-KUU-BEI-L-K3P4"
 *
 * category    = Product.category (e.g. "T-Shirt" → "TS", "Jeans" → "JE", "Kurta" → "KU")
 * subcategory = Product.gender   (e.g. "MEN" → "M", "WOMEN" → "W", "KIDS" → "K", "UNISEX" → "U")
 *
 * Uniqueness from base-36 timestamp suffix; caller should retry on DB P2002.
 */
export function generateSkuBarcode(
  brand: string,
  category: string,
  subcategory: string,
  color: string,
  size: string,
): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const brandPart  = clean(brand).slice(0, 3).padEnd(1, 'X')
  const catPart    = clean(category).slice(0, 2).padEnd(1, 'X')    // "T-Shirt" → "TS"
  const subcatPart = clean(subcategory).slice(0, 1).padEnd(1, 'X') // "MEN" → "M"
  const colorPart  = clean(color).slice(0, 3).padEnd(1, 'X')
  const sizePart   = clean(size).slice(0, 4).padEnd(1, 'X')
  const suffix     = Date.now().toString(36).slice(-4).toUpperCase()
  return `${brandPart}-${catPart}${subcatPart}-${colorPart}-${sizePart}-${suffix}`
}
