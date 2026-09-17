import { Product, IProduct, IProductVariant, IProductColor } from "../../models/Product";
import {
  minioClient,
  config,
  ensureBucket,
  publicObjectUrl,
  objectKeyFromUrl,
} from "../../config/minio";
import { AppError } from "../../middlewares/errorHandler";

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
  const ext = file.originalname.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const fileName = `products/${productId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  await minioClient.putObject(config.minioBucket, fileName, file.buffer, file.size, {
    "Content-Type": file.mimetype,
  });

  return publicObjectUrl(fileName);
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

const createAppError = (message: string, statusCode: number): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
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
    throw createAppError("Product not found", 404);
  }
  return product;
};

export const updateProduct = async (id: string, data: UpdateProductDTO, files?: Express.Multer.File[]): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw createAppError("Product not found", 404);
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

export const addImage = async (id: string, file: Express.Multer.File): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw createAppError("Product not found", 404);
  }

  const url = await uploadImage(file, product._id.toString());
  product.images.push(url);
  await product.save();
  return product;
};

export const deleteProduct = async (id: string): Promise<void> => {
  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    throw createAppError("Product not found", 404);
  }
  await deleteProductImages(id);
};

/**
 * Atomic stock update using MongoDB $inc operator.
 * Prevents race conditions from concurrent requests.
 */
export const updateStock = async (id: string, quantity: number): Promise<IProduct> => {
  // Use atomic $inc with a condition to prevent negative stock
  const product = await Product.findOneAndUpdate(
    { _id: id, stock: { $gte: -quantity } }, // Only if stock won't go negative
    { $inc: { stock: quantity } },
    { new: true }
  );

  if (!product) {
    // Check if product exists at all to distinguish "not found" from "insufficient stock"
    const exists = await Product.exists({ _id: id });
    if (!exists) {
      throw createAppError("Product not found", 404);
    }
    throw createAppError("Insufficient stock", 400);
  }

  return product;
};

/**
 * Remove image: parses the object key from the URL and deletes from MinIO.
 * imageUrl is passed as a query parameter.
 */
export const removeImage = async (id: string, imageUrl: string): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw createAppError("Product not found", 404);
  }

  const imageIndex = product.images.indexOf(imageUrl);
  if (imageIndex === -1) {
    throw createAppError("Image not found in product", 404);
  }

  // Extrae el object key tanto de la URL directa como de la URL pública HTTPS.
  const objectKey = objectKeyFromUrl(imageUrl);
  if (objectKey) {
    await minioClient.removeObject(config.minioBucket, objectKey);
  }

  product.images.splice(imageIndex, 1);
  await product.save();
  return product;
};

/**
 * Sube (o reemplaza) el modelo 3D .glb del producto.
 * El objeto anterior se borra después de subir el nuevo para no dejar huérfanos.
 */
export const uploadModel = async (id: string, file: Express.Multer.File): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw createAppError("Product not found", 404);
  }

  const fileName = `products/${product._id.toString()}/model/${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}.glb`;

  await minioClient.putObject(config.minioBucket, fileName, file.buffer, file.size, {
    "Content-Type": "model/gltf-binary",
  });

  // Reemplazo: borrar el modelo anterior (mejor esfuerzo; un fallo aquí no
  // invalida la subida y queda registrado en el log).
  const anterior = product.model3d ? objectKeyFromUrl(product.model3d) : null;
  if (anterior && anterior !== fileName) {
    try {
      await minioClient.removeObject(config.minioBucket, anterior);
    } catch (error) {
      console.error(
        `[minio] No se pudo borrar el modelo anterior (${anterior}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  product.model3d = publicObjectUrl(fileName);
  await product.save();
  return product;
};

/**
 * Elimina el modelo 3D del producto y su objeto en MinIO.
 * Es idempotente: si el objeto ya no existe, MinIO no falla y el producto
 * queda sin `model3d`.
 */
export const deleteModel = async (id: string): Promise<IProduct> => {
  const product = await Product.findById(id);
  if (!product) {
    throw createAppError("Product not found", 404);
  }

  const objectKey = product.model3d ? objectKeyFromUrl(product.model3d) : null;
  if (objectKey) {
    try {
      await minioClient.removeObject(config.minioBucket, objectKey);
    } catch (error) {
      console.error(
        `[minio] No se pudo borrar el modelo (${objectKey}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  product.model3d = undefined;
  await product.save();
  return product;
};
