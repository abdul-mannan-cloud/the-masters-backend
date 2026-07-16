// Canonical list of ProductType categories. Adding a new category (e.g.
// "Bridal", "Uniform") only requires appending here — no schema change,
// since ProductType.category is a plain validated string, not a Mongoose enum.
export const PRODUCT_CATEGORIES = ["Men", "Women", "Unisex", "Kids"];

// Maps a Customer.gender to the categories they should see when an employee
// is adding garments for them. Unisex is always included for every gender;
// "other" only sees Unisex, since no gendered category can be assumed for them.
export const GENDER_CATEGORY_MAP = {
  male: ["Men", "Unisex"],
  female: ["Women", "Unisex"],
  other: ["Unisex"],
};

export default PRODUCT_CATEGORIES;
