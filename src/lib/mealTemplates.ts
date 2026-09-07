// Plantillas de comidas COMPLETAS para "💡 Sugerencias". Cada plantilla es un combo de 2-6
// alimentos del catálogo builtin (referenciados por `name` exacto) con gramos base ~1 porción
// razonable. El servicio (`getMealSuggestions` en nutrition.service.ts) las resuelve contra
// food_items, escala el combo entero para acercarlo a las kcal / al reparto de macros que le
// faltan a la comida, y las rankea por encaje.
//
// `food` tiene que matchear EXACTO el `name` de un food_items con source='builtin'
// (ver migración nutrition_phase1_seed_builtin_foods). Si algún alimento de la plantilla no
// está en el catálogo, la plantilla se descarta en silencio.

export type MealTemplateTag = "desayuno" | "almuerzo" | "merienda" | "cena" | "snack";

export interface MealTemplateItem {
  food: string;
  grams: number;
}

export interface MealTemplate {
  title: string;
  tags: MealTemplateTag[];
  items: MealTemplateItem[];
}

export const MEAL_TEMPLATES: MealTemplate[] = [
  // ---------------------------------------------------------------- Desayuno / Merienda
  {
    title: "Tostadas con jamón y queso",
    tags: ["desayuno", "merienda"],
    items: [
      { food: "Pan lactal blanco", grams: 56 },
      { food: "Jamón cocido", grams: 30 },
      { food: "Queso port salut", grams: 30 },
      { food: "Café con leche", grams: 200 },
    ],
  },
  {
    title: "Avena con leche y banana",
    tags: ["desayuno", "merienda"],
    items: [
      { food: "Avena en hojuelas", grams: 40 },
      { food: "Leche descremada", grams: 200 },
      { food: "Banana", grams: 120 },
    ],
  },
  {
    title: "Yogur griego con frutillas y avena",
    tags: ["desayuno", "merienda", "snack"],
    items: [
      { food: "Yogur griego", grams: 150 },
      { food: "Frutillas", grams: 100 },
      { food: "Avena en hojuelas", grams: 20 },
      { food: "Miel", grams: 15 },
    ],
  },
  {
    title: "Tostada con palta y huevo",
    tags: ["desayuno", "merienda"],
    items: [
      { food: "Pan integral", grams: 40 },
      { food: "Palta", grams: 60 },
      { food: "Huevo entero", grams: 100 },
    ],
  },
  {
    title: "Licuado proteico con avena",
    tags: ["desayuno", "merienda", "snack"],
    items: [
      { food: "Proteína en polvo (whey)", grams: 30 },
      { food: "Leche descremada", grams: 250 },
      { food: "Banana", grams: 100 },
      { food: "Avena en hojuelas", grams: 25 },
    ],
  },
  {
    title: "Pan con queso crema y mermelada",
    tags: ["desayuno", "merienda"],
    items: [
      { food: "Pan francés / de mesa", grams: 50 },
      { food: "Queso crema untable", grams: 30 },
      { food: "Mermelada", grams: 20 },
      { food: "Café con leche", grams: 200 },
    ],
  },
  {
    title: "Huevos revueltos con tostada",
    tags: ["desayuno"],
    items: [
      { food: "Huevo entero", grams: 100 },
      { food: "Clara de huevo", grams: 66 },
      { food: "Pan integral", grams: 40 },
      { food: "Café con leche", grams: 200 },
    ],
  },
  {
    title: "Yogur con frutos secos y banana",
    tags: ["desayuno", "merienda", "snack"],
    items: [
      { food: "Yogur natural entero", grams: 190 },
      { food: "Mix de frutos secos", grams: 20 },
      { food: "Banana", grams: 120 },
      { food: "Avena en hojuelas", grams: 15 },
    ],
  },
  {
    title: "Tostadas con dulce de leche",
    tags: ["merienda", "desayuno"],
    items: [
      { food: "Pan lactal blanco", grams: 56 },
      { food: "Dulce de leche", grams: 30 },
      { food: "Café con leche", grams: 200 },
    ],
  },
  {
    title: "Galletas de arroz con pavita y queso",
    tags: ["merienda", "snack"],
    items: [
      { food: "Galletas de arroz", grams: 18 },
      { food: "Pavita / lomito fiambre", grams: 40 },
      { food: "Queso port salut", grams: 30 },
    ],
  },

  // ---------------------------------------------------------------- Almuerzo / Cena
  {
    title: "Pollo con arroz y ensalada",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Pechuga de pollo (cocida)", grams: 150 },
      { food: "Arroz blanco (cocido)", grams: 150 },
      { food: "Ensalada mixta (sin aderezo)", grams: 150 },
      { food: "Aceite de oliva", grams: 8 },
    ],
  },
  {
    title: "Bife con puré y ensalada",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Bife de lomo (cocido)", grams: 150 },
      { food: "Puré de papa", grams: 200 },
      { food: "Ensalada mixta (sin aderezo)", grams: 100 },
    ],
  },
  {
    title: "Merluza con papa y brócoli",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Merluza (cocida)", grams: 160 },
      { food: "Papa hervida", grams: 180 },
      { food: "Brócoli", grams: 120 },
      { food: "Aceite de oliva", grams: 6 },
    ],
  },
  {
    title: "Fideos con carne y queso",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Fideos secos (cocidos)", grams: 200 },
      { food: "Carne picada común (cocida)", grams: 90 },
      { food: "Tomate", grams: 120 },
      { food: "Queso rallado", grams: 15 },
    ],
  },
  {
    title: "Milanesa con puré",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Milanesa de carne (frita)", grams: 130 },
      { food: "Puré de papa", grams: 180 },
      { food: "Tomate", grams: 120 },
    ],
  },
  {
    title: "Ensalada completa de atún y huevo",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Atún al natural (lata, escurrido)", grams: 80 },
      { food: "Huevo entero", grams: 100 },
      { food: "Papa hervida", grams: 120 },
      { food: "Choclo (grano)", grams: 70 },
      { food: "Ensalada mixta (sin aderezo)", grams: 100 },
    ],
  },
  {
    title: "Guiso de lentejas con pan",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Guiso de lentejas (porción)", grams: 350 },
      { food: "Pan francés / de mesa", grams: 30 },
    ],
  },
  {
    title: "Salmón con quinoa y espinaca",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Salmón (cocido)", grams: 130 },
      { food: "Quinoa (cocida)", grams: 150 },
      { food: "Espinaca", grams: 90 },
      { food: "Aceite de oliva", grams: 5 },
    ],
  },
  {
    title: "Pollo al wok con vegetales y arroz",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Pata/muslo de pollo (cocido)", grams: 150 },
      { food: "Zanahoria", grams: 80 },
      { food: "Morrón / pimiento", grams: 90 },
      { food: "Cebolla", grams: 60 },
      { food: "Arroz integral (cocido)", grams: 130 },
      { food: "Aceite de oliva", grams: 6 },
    ],
  },
  {
    title: "Carne con batata y chauchas",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Nalga / cuadril (cocido)", grams: 150 },
      { food: "Batata hervida", grams: 180 },
      { food: "Chauchas", grams: 120 },
    ],
  },
  {
    title: "Tarta de verdura con ensalada",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Tarta de verdura (porción)", grams: 200 },
      { food: "Ensalada mixta (sin aderezo)", grams: 150 },
      { food: "Aceite de oliva", grams: 6 },
    ],
  },
  {
    title: "Omelette de queso con ensalada y pan",
    tags: ["almuerzo", "cena"],
    items: [
      { food: "Huevo entero", grams: 150 },
      { food: "Queso muzzarella / cremoso", grams: 40 },
      { food: "Tomate", grams: 120 },
      { food: "Pan integral", grams: 40 },
    ],
  },

  // ---------------------------------------------------------------- Snack
  {
    title: "Yogur con manzana",
    tags: ["snack"],
    items: [
      { food: "Yogur descremado", grams: 190 },
      { food: "Manzana", grams: 150 },
    ],
  },
  {
    title: "Frutos secos con banana",
    tags: ["snack", "merienda"],
    items: [
      { food: "Mix de frutos secos", grams: 30 },
      { food: "Banana", grams: 120 },
    ],
  },
  {
    title: "Galletas de arroz con queso",
    tags: ["snack"],
    items: [
      { food: "Galletas de arroz", grams: 18 },
      { food: "Queso port salut", grams: 30 },
    ],
  },
  {
    title: "Almendras y mandarina",
    tags: ["snack", "merienda"],
    items: [
      { food: "Almendras", grams: 25 },
      { food: "Mandarina", grams: 100 },
    ],
  },
  {
    title: "Huevo duro con fruta",
    tags: ["snack"],
    items: [
      { food: "Huevo entero", grams: 100 },
      { food: "Manzana", grams: 150 },
    ],
  },
  {
    title: "Yogur griego con miel",
    tags: ["snack", "merienda"],
    items: [
      { food: "Yogur griego", grams: 170 },
      { food: "Miel", grams: 15 },
    ],
  },
  {
    title: "Mini sándwich de pavita",
    tags: ["snack", "merienda"],
    items: [
      { food: "Pan lactal blanco", grams: 56 },
      { food: "Pavita / lomito fiambre", grams: 40 },
      { food: "Queso port salut", grams: 20 },
    ],
  },
];
