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
