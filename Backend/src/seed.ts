import { connectDB } from "./config/database";
import { ensureBucket, minioClient, config } from "./config/minio";
import { Product } from "./models/Product";
import { User } from "./models/User";

// Re-export config to ensure env vars are loaded
const { adminEmail, adminPassword } = config;

const sampleProducts = [
  {
    name: "Sofá Modular Contemporáneo",
    description: "Sofá modular de 3 piezas tapizado en tela lino de alta resistencia, diseño moderno y cómodo.",
    dimensions: "240cm x 90cm x 85cm",
    price: 850.00,
    stock: 15,
    category: "Sofás",
    sizes: ["240cm x 90cm x 85cm", "180cm x 90cm x 85cm", "300cm x 90cm x 85cm"],
    colors: [
      { name: "Gris", hex: "#808080" },
      { name: "Beige", hex: "#F5F5DC" },
      { name: "Negro", hex: "#1A1A1A" },
    ],
    variants: [
      { size: "240cm x 90cm x 85cm", color: "Gris", colorHex: "#808080", stock: 5 },
      { size: "240cm x 90cm x 85cm", color: "Beige", colorHex: "#F5F5DC", stock: 3 },
      { size: "240cm x 90cm x 85cm", color: "Negro", colorHex: "#1A1A1A", stock: 2 },
      { size: "180cm x 90cm x 85cm", color: "Gris", colorHex: "#808080", stock: 4 },
      { size: "180cm x 90cm x 85cm", color: "Beige", colorHex: "#F5F5DC", stock: 1 },
      { size: "300cm x 90cm x 85cm", color: "Gris", colorHex: "#808080", stock: 0 },
    ],
  },
  {
    name: "Mesa de Comedor Extensible",
    description: "Mesa de comedor fabricada en madera de roble macizo con sistema extensible para hasta 8 personas.",
    dimensions: "160-220cm x 90cm x 75cm",
    price: 620.00,
    stock: 10,
    category: "Comedores",
    sizes: ["160cm x 90cm x 75cm", "200cm x 90cm x 75cm"],
    colors: [
      { name: "Roble Natural", hex: "#C4A77D" },
      { name: "Nogal", hex: "#5D4037" },
    ],
    variants: [
      { size: "160cm x 90cm x 75cm", color: "Roble Natural", colorHex: "#C4A77D", stock: 4 },
      { size: "160cm x 90cm x 75cm", color: "Nogal", colorHex: "#5D4037", stock: 3 },
      { size: "200cm x 90cm x 75cm", color: "Roble Natural", colorHex: "#C4A77D", stock: 2 },
      { size: "200cm x 90cm x 75cm", color: "Nogal", colorHex: "#5D4037", stock: 1 },
    ],
  },
  {
    name: "Silla Ergonómica Ejecutiva",
    description: "Silla de oficina ergonómica con soporte lumbar ajustable, malla respirable y base metálica.",
    dimensions: "65cm x 60cm x 110-120cm",
    price: 210.00,
    stock: 30,
    category: "Oficina",
    sizes: ["Estándar"],
    colors: [
      { name: "Negro", hex: "#1A1A1A" },
      { name: "Gris Oscuro", hex: "#4A4A4A" },
    ],
    variants: [
      { size: "Estándar", color: "Negro", colorHex: "#1A1A1A", stock: 15 },
      { size: "Estándar", color: "Gris Oscuro", colorHex: "#4A4A4A", stock: 15 },
    ],
  },
  {
    name: "Escritorio Minimalista en L",
    description: "Escritorio en L con estructura de acero y superficie de madera tratada, ideal para home office.",
    dimensions: "140cm x 120cm x 75cm",
    price: 340.00,
    stock: 12,
    category: "Oficina",
    sizes: ["140cm x 120cm x 75cm", "160cm x 140cm x 75cm"],
    colors: [
      { name: "Blanco", hex: "#FFFFFF" },
      { name: "Negro", hex: "#1A1A1A" },
    ],
    variants: [
      { size: "140cm x 120cm x 75cm", color: "Blanco", colorHex: "#FFFFFF", stock: 3 },
      { size: "140cm x 120cm x 75cm", color: "Negro", colorHex: "#1A1A1A", stock: 4 },
      { size: "160cm x 140cm x 75cm", color: "Blanco", colorHex: "#FFFFFF", stock: 2 },
      { size: "160cm x 140cm x 75cm", color: "Negro", colorHex: "#1A1A1A", stock: 3 },
    ],
  },
  {
    name: "Cama King Size Tapizada",
    description: "Cama matrimonial tamaño King con cabecera capitonada y estructura interna de madera reforzada.",
    dimensions: "200cm x 210cm x 120cm",
    price: 950.00,
    stock: 8,
    category: "Dormitorios",
    sizes: ["King Size (200x210)", "Queen Size (160x200)"],
    colors: [
      { name: "Gris", hex: "#808080" },
      { name: "Blanco", hex: "#FFFFFF" },
      { name: "Beige", hex: "#F5F5DC" },
    ],
    variants: [
      { size: "King Size (200x210)", color: "Gris", colorHex: "#808080", stock: 2 },
      { size: "King Size (200x210)", color: "Blanco", colorHex: "#FFFFFF", stock: 1 },
      { size: "King Size (200x210)", color: "Beige", colorHex: "#F5F5DC", stock: 2 },
      { size: "Queen Size (160x200)", color: "Gris", colorHex: "#808080", stock: 1 },
      { size: "Queen Size (160x200)", color: "Beige", colorHex: "#F5F5DC", stock: 2 },
    ],
  },
  {
    name: "Librero Estantería Industrial",
    description: "Librero de 5 niveles con diseño industrial combinando metal negro y repisas de madera rústica.",
    dimensions: "90cm x 30cm x 180cm",
    price: 180.00,
    stock: 25,
    category: "Almacenamiento",
    sizes: ["5 Niveles", "4 Niveles"],
    colors: [
      { name: "Negro/Madera", hex: "#1A1A1A" },
    ],
    variants: [
      { size: "5 Niveles", color: "Negro/Madera", colorHex: "#1A1A1A", stock: 15 },
      { size: "4 Niveles", color: "Negro/Madera", colorHex: "#1A1A1A", stock: 10 },
    ],
  },
  {
    name: "Cómoda 6 Cajones Nórdica",
    description: "Cómoda estilo escandinavo con 6 cajones amplios y patas de madera clara.",
    dimensions: "120cm x 45cm x 80cm",
    price: 420.00,
    stock: 14,
    category: "Dormitorios",
    sizes: ["6 Cajones", "4 Cajones"],
    colors: [
      { name: "Blanco", hex: "#FFFFFF" },
      { name: "Gris Claro", hex: "#D3D3D3" },
    ],
    variants: [
      { size: "6 Cajones", color: "Blanco", colorHex: "#FFFFFF", stock: 4 },
      { size: "6 Cajones", color: "Gris Claro", colorHex: "#D3D3D3", stock: 3 },
      { size: "4 Cajones", color: "Blanco", colorHex: "#FFFFFF", stock: 4 },
      { size: "4 Cajones", color: "Gris Claro", colorHex: "#D3D3D3", stock: 3 },
    ],
  },
  {
    name: "Mesa de Centro de Vidrio y Madera",
    description: "Mesa de centro moderna con superficie de vidrio templado y base cruzada de madera de nogal.",
    dimensions: "110cm x 60cm x 45cm",
    price: 250.00,
    stock: 20,
    category: "Salas",
    sizes: ["110cm x 60cm", "130cm x 70cm"],
    colors: [
      { name: "Vidrio/Nogal", hex: "#C4A77D" },
      { name: "Vidrio/Negro", hex: "#1A1A1A" },
    ],
    variants: [
      { size: "110cm x 60cm", color: "Vidrio/Nogal", colorHex: "#C4A77D", stock: 6 },
      { size: "110cm x 60cm", color: "Vidrio/Negro", colorHex: "#1A1A1A", stock: 5 },
      { size: "130cm x 70cm", color: "Vidrio/Nogal", colorHex: "#C4A77D", stock: 5 },
      { size: "130cm x 70cm", color: "Vidrio/Negro", colorHex: "#1A1A1A", stock: 4 },
    ],
  },
];

async function seed() {
  try {
    console.log("Connecting to Database...");
    await connectDB();

    console.log("Ensuring MinIO bucket...");
    await ensureBucket();

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await User.create({
        name: "Admin JKMobiliario",
        email: adminEmail,
        password: adminPassword,
        role: "admin",
      });
      console.log(`Admin user created: ${adminEmail}`);
    } else {
      console.log(`Admin user already exists: ${adminEmail}`);
    }

    console.log("Clearing existing products...");
    await Product.deleteMany({});

    console.log("Seeding products with random images from internet and uploading to MinIO...");

    for (let i = 0; i < sampleProducts.length; i++) {
      const data = sampleProducts[i];
      const product = await Product.create(data);

      const imageUrlSource = `https://picsum.photos/seed/jkmobiliario-${i + 1}/800/600`;
      console.log(`Downloading image for "${product.name}" from ${imageUrlSource}...`);

      const response = await fetch(imageUrlSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from ${imageUrlSource}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const size = buffer.length;
      const contentType = response.headers.get("content-type") || "image/jpeg";

      const fileName = `products/${product._id.toString()}/${Date.now()}.jpg`;

      await minioClient.putObject(config.minioBucket, fileName, buffer, size, {
        "Content-Type": contentType,
      });

      const protocol = config.minio.useSSL ? "https" : "http";
      const minioUrl = `${protocol}://${config.minio.endPoint}:${config.minio.port}/${config.minioBucket}/${fileName}`;

      product.images = [minioUrl];
      await product.save();

      console.log(`Created product "${product.name}" with image in MinIO: ${minioUrl}`);
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  }
}

seed();
