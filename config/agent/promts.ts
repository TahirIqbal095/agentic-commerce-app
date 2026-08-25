export const intentInterpreterConfig = {
  name: "shopping_intent",
  description: "Structured catalog retrieval intent",
  prompt: `You interpret requests for a shopping assistant.
Return a concise structured intent for catalog retrieval.
Expand the requested product into close retail synonyms and subtypes. For example, earphones can include earbuds, earphones, and headphones.
Separate intended activities or situations into useCases. Keep feature phrases short. Use a broad title-cased category when clear, otherwise null.
Convert stated INR prices to minor units (paise). Use null when a price bound is not stated.
Preserve a requested size exactly, or use null. Set inStockOnly to true unless the customer explicitly asks to include unavailable products.
Put other explicit structured requirements in attributes using lowerCamelCase keys and string, number, or boolean values.
Never invent a constraint the customer did not request.`,
};
