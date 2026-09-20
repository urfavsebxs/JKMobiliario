import express from "express";
import multer from "multer";

const storage = multer.memoryStorage();

/** Límite de las imágenes de producto (4MB). */
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Límite de los modelos 3D .glb (25MB). */
export const MODEL_MAX_BYTES = 25 * 1024 * 1024;
export const MODEL_MAX_MB = MODEL_MAX_BYTES / (1024 * 1024);

/**
 * Error operativo 400 para que el errorHandler global devuelva el mensaje
 * claro al cliente en lugar de un 500 genérico.
 */
const badRequest = (message: string): Error => {
  const error = new Error(message) as Error & { statusCode: number; isOperational: boolean };
  error.statusCode = 400;
  error.isOperational = true;
  return error;
};

export const upload = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG and WebP images are allowed"));
    }
  },
});

/**
 * Multer para modelos 3D en formato GLTF binario (.glb).
 * - `memoryStorage`: el buffer se envía directo a MinIO.
 * - Acepta `model/gltf-binary` y, como algunos navegadores no lo declaran,
 *   `application/octet-stream` (siempre exigiendo la extensión `.glb`).
 */
export const uploadModel = multer({
  storage,
  limits: { fileSize: MODEL_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const extensionValida = file.originalname.toLowerCase().endsWith(".glb");
    const mimeValido =
      file.mimetype === "model/gltf-binary" ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "model/gltf+json";

    if (extensionValida && mimeValido) {
      cb(null, true);
      return;
    }

    cb(badRequest("Only .glb 3D models (model/gltf-binary) are allowed"));
  },
});

/** Límite del comprobante (4MB, igual que las imágenes de producto). */
const COMPROBANTE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Parser del comprobante que sube n8n.
 *
 * NO usa multer: el nodo HTTP Request de n8n, con `contentType: "binaryData"`,
 * manda el archivo **crudo** como cuerpo, sin `multipart/form-data` y por tanto
 * sin nombre de campo que `upload.single()` pueda buscar. `express.raw` deja el
 * cuerpo íntegro en `req.body` como Buffer.
 *
 * El `type` es una función que acepta todo a propósito: n8n puede declarar
 * `application/octet-stream`, `image/jpeg` o lo que el paso anterior dejara.
 * El tipo real se decide por los bytes mágicos del archivo (ver
 * `detectarMime`), no por lo que diga el llamador.
 */
export const rawComprobante = express.raw({
  type: () => true,
  limit: COMPROBANTE_MAX_BYTES,
});
