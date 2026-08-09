// Fixed genre list — multi-select per the spec ("decide during build").
// Multi-select because plenty of books straddle genres (e.g. "Sci-Fi" + "Romance").
export const GENRES = [
  "Fiction",
  "Non-Fiction",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Thriller",
  "Romance",
  "Horror",
  "Biography",
  "History",
  "Young Adult",
  "Children's",
  "Poetry",
  "Self-Help",
  "Classics",
  "Graphic Novel",
  "Other",
] as const;

// Fixed shelf location list — single-select, a book only lives in one place.
export const LOCATIONS = ["Office", "Living Room", "Bedroom", "Office Closet", "Kid's Room", "Basement"] as const;
