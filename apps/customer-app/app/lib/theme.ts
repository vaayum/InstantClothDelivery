export const T = {
  // Brand
  pink:       "#FF3F6C",
  pinkLight:  "#FFF0F3",
  pinkDark:   "#E8204A",
  // Text
  dark:       "#282C3F",
  mid:        "#535766",
  gray:       "#94969F",
  // Surfaces
  white:      "#FFFFFF",
  lightBg:    "#F4F4F5",
  border:     "#EAEAEC",
  // Semantic
  green:      "#03A685",
  greenLight: "#E8F7F4",
  red:        "#FF0000",
  orange:     "#FF7E00",
  // Typography weights (kept for backward compat — prefer T.font.* going forward)
  bold:       "700" as const,
  semi:       "600" as const,
  regular:    "400" as const,
  // Poppins font family names (loaded in _layout.tsx)
  font: {
    regular: "Poppins_400Regular",
    semi:    "Poppins_600SemiBold",
    bold:    "Poppins_700Bold",
  } as const,
  // Spacing
  radius:     4,
  radiusMd:   8,
  radiusLg:   12,
};
