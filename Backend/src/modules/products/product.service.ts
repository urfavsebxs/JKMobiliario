import { Product, IProduct, IProductVariant, IProductColor } from "../../models/Product";
import { minioClient, config, ensureBucket } from "../../config/minio";
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
