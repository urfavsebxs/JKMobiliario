import { Product, IProduct, IProductVariant, IProductColor } from "../../models/Product";
import { minioClient, config, ensureBucket } from "../../config/minio";

interface CreateProductDTO {
  name: string;
  description: string;
  dimensions: string;
  price: number;
  stock: number;
  category?: string;
  sizes?: string[];
  colors?: IProductColor[];
  variants?: IProductVariant[];
}

interface UpdateProductDTO extends Partial<CreateProductDTO> {}

const uploadImage = async (file: Express.Multer.File, productId: string): Promise<string> => {
  const ext = file.originalname.split(".").pop();
  const fileName = `products/${productId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  await minioClient.putObject(config.minioBucket, fileName, file.buffer, file.size, {
    "Content-Type": file.mimetype,
  });

  const protocol = config.minio.useSSL ? "https" : "http";
  return `${protocol}://${config.minio.endPoint}:${config.minio.port}/${config.minioBucket}/${fileName}`;
};

const deleteProductImages = async (productId: string): Promise<void> => {
  const objectsList: string[] = [];
  const objectsStream = minioClient.listObjects(config.minioBucket, `products/${productId}/`, true);

  await new Promise<void>((resolve, reject) => {
    objectsStream.on("data", (obj) => {
      if (obj.name) objectsList.push(obj.name);
    });
    objectsStream.on("end", resolve);
    objectsStream.on("error", reject);
  });

  if (objectsList.length > 0) {
    await minioClient.removeObjects(config.minioBucket, objectsList);
  }
};

const parseJsonField = <T>(value: unknown, fallback: T): T => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
};

export const createProduct = async (data: CreateProductDTO, files?: Express.Multer.File[]): Promise<IProduct> => {
  data.colors = parseJsonField<IProductColor[]>(data.colors, []);
  data.variants = parseJsonField<IProductVariant[]>(data.variants, []);
  data.sizes = parseJsonField<string[]>(data.sizes, []);

  const product = await Product.create(data);

  const images: string[] = [];
  if (files && files.length > 0) {
    for (const file of files) {
      const url = await uploadImage(file, product._id.toString());
      images.push(url);
    }
    product.images = images;
    await product.save();
  }

  return product;
};

export const getProducts = async (page = 1, limit = 10): Promise<{ products: IProduct[]; total: number }> => {
  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
    Product.countDocuments(),
  ]);
  return { products, total };
};

export const getProductById = async (id: string): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
  return product;
};

export const updateProduct = async (id: string, data: UpdateProductDTO, files?: Express.Multer.File[]): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  if (data.colors !== undefined) data.colors = parseJsonField<IProductColor[]>(data.colors, []);
  if (data.variants !== undefined) data.variants = parseJsonField<IProductVariant[]>(data.variants, []);
  if (data.sizes !== undefined) data.sizes = parseJsonField<string[]>(data.sizes, []);

  if (files && files.length > 0) {
    const newImages: string[] = [];
    for (const file of files) {
      const url = await uploadImage(file, product._id.toString());
      newImages.push(url);
    }
    product.images = [...product.images, ...newImages];
  }

  Object.assign(product, data);
  await product.save();
  return product;
};

export const deleteProduct = async (id: string): Promise<void> => {
  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }
  await deleteProductImages(id);
};

export const updateStock = async (id: string, quantity: number): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  product.stock += quantity;
  if (product.stock < 0) {
    throw Object.assign(new Error("Stock cannot be negative"), { statusCode: 400 });
  }

  await product.save();
  return product;
};

export const removeImage = async (id: string, imageUrl: string): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw Object.assign(new Error("Product not found"), { statusCode: 404 });
  }

  const imageIndex = product.images.indexOf(imageUrl);
  if (imageIndex === -1) {
    throw Object.assign(new Error("Image not found in product"), { statusCode: 404 });
  }

  // Extract object key from URL
  const urlParts = imageUrl.split(`/${config.minioBucket}/`);
  if (urlParts.length === 2) {
    const objectKey = urlParts[1];
    await minioClient.removeObject(config.minioBucket, objectKey);
  }

  product.images.splice(imageIndex, 1);
  await product.save();
  return product;
};

export const seedProductsFromInternet = async (count = 8): Promise<IProduct[]> => {
  await ensureBucket();

  const sampleProducts = [
    {
      name: "Sofá Modular Contemporáneo",
      description: "Sofá modular de 3 piezas tapizado en tela lino de alta resistencia, diseño moderno y cómodo.",
      dimensions: "240cm x 90cm x 85cm",
      price: 850.0,
      stock: 15,
      category: "Sofás",
    },
    {
      name: "Mesa de Comedor Extensible",
      description: "Mesa de comedor fabricada en madera de roble macizo con sistema extensible para hasta 8 personas.",
      dimensions: "160-220cm x 90cm x 75cm",
      price: 620.0,
      stock: 10,
      category: "Comedores",
    },
    {
      name: "Silla Ergonómica Ejecutiva",
      description: "Silla de oficina ergonómica con soporte lumbar ajustable, malla respirable y base metálica.",
      dimensions: "65cm x 60cm x 110-120cm",
      price: 210.0,
      stock: 30,
      category: "Oficina",
    },
    {
      name: "Escritorio Minimalista en L",
      description: "Escritorio en L con estructura de acero y superficie de madera tratada, ideal para home office.",
      dimensions: "140cm x 120cm x 75cm",
      price: 340.0,
      stock: 12,
      category: "Oficina",
    },
    {
      name: "Cama King Size Tapizada",
      description: "Cama matrimonial tamaño King con cabecera capitonada y estructura interna de madera reforzada.",
      dimensions: "200cm x 210cm x 120cm",
      price: 950.0,
      stock: 8,
      category: "Dormitorios",
    },
    {
      name: "Librero Estantería Industrial",
      description: "Librero de 5 niveles con diseño industrial combinando metal negro y repisas de madera rústica.",
      dimensions: "90cm x 30cm x 180cm",
      price: 180.0,
      stock: 25,
      category: "Almacenamiento",
    },
    {
      name: "Cómoda 6 Cajones Nórdica",
      description: "Cómoda estilo escandinavo con 6 cajones amplios y patas de madera clara.",
      dimensions: "120cm x 45cm x 80cm",
      price: 420.0,
      stock: 14,
      category: "Dormitorios",
    },
    {
      name: "Mesa de Centro de Vidrio y Madera",
      description: "Mesa de centro moderna con superficie de vidrio templado y base cruzada de madera de nogal.",
      dimensions: "110cm x 60cm x 45cm",
      price: 250.0,
      stock: 20,
      category: "Salas",
    },
  ];

  const createdProducts: IProduct[] = [];
  const itemsToSeed = sampleProducts.slice(0, count);

  for (let i = 0; i < itemsToSeed.length; i++) {
    const data = itemsToSeed[i];
    const product = await Product.create(data);

    const imageUrlSource = `https://picsum.photos/seed/jkmobiliario-api-${i + 1}-${Date.now()}/800/600`;
    try {
      const response = await fetch(imageUrlSource);
      if (response.ok) {
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
      }
    } catch (err) {
      console.error(`Failed to download/upload image for seeded product ${product.name}:`, err);
    }

    createdProducts.push(product);
  }

  return createdProducts;
};
