import * as Minio from "minio";
import { config } from "./index";

export { config };

export const minioClient = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

export const ensureBucket = async (): Promise<void> => {
  const exists = await minioClient.bucketExists(config.minioBucket);
  if (!exists) {
    await minioClient.makeBucket(config.minioBucket, "us-east-1");
    console.log(`Bucket "${config.minioBucket}" created`);
  } else {
    console.log(`Bucket "${config.minioBucket}" already exists`);
  }

  // Siempre aplicar política de lectura pública
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${config.minioBucket}/*`],
      },
    ],
  });
  await minioClient.setBucketPolicy(config.minioBucket, policy);
  console.log(`Bucket "${config.minioBucket}" policy set to public read`);
};

/**
 * Crea el bucket PRIVADO de comprobantes de pago.
 *
 * Deliberadamente NO llama a `setBucketPolicy`: a diferencia de `ensureBucket`,
 * aquí el bucket debe quedar cerrado. Si se le aplicara la política de lectura
 * pública del bucket de productos, cualquier persona con la URL vería el monto,
 * la fecha, el banco y el nombre del cliente de cada comprobante.
 *
 * Para dejarlo explícito (y protegerse de una política heredada de una versión
 * anterior), se fija una política que NIEGA toda lectura anónima.
 */
export const ensurePrivateBucket = async (): Promise<void> => {
  const bucket = config.minioBucketComprobantes;

  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
    console.log(`Bucket "${bucket}" created`);
  } else {
    console.log(`Bucket "${bucket}" already exists`);
  }

  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Deny",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
  await minioClient.setBucketPolicy(bucket, policy);
  console.log(`Bucket "${bucket}" policy set to private (anonymous read denied)`);
};

/** Sube un objeto al bucket privado de comprobantes y devuelve su object key. */
export const putPrivateObject = async (
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> => {
  await minioClient.putObject(config.minioBucketComprobantes, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return key;
};

/**
 * Abre el stream de un comprobante del bucket privado.
 * El llamador debe consumirlo o destruirlo; solo se sirve por una ruta
 * autenticada (nunca por una URL pública).
 */
export const getPrivateObjectStream = (key: string): Promise<NodeJS.ReadableStream> =>
  minioClient.getObject(config.minioBucketComprobantes, key);

/** Metadatos de un comprobante del bucket privado (tamaño y content-type). */
export const statPrivateObject = (key: string) =>
  minioClient.statObject(config.minioBucketComprobantes, key);

/** Borra un comprobante del bucket privado (idempotente). */
export const removePrivateObject = async (key: string): Promise<void> => {
  try {
    await minioClient.removeObject(config.minioBucketComprobantes, key);
  } catch (error) {
    // Best-effort: si el objeto ya no está, no es un error para el llamador.
    console.error(
      `[minio] No se pudo borrar el comprobante ${key}:`,
      error instanceof Error ? error.message : error
    );
  }
};

/**
 * URL pública de un objeto del bucket.
 *
 * Si `MINIO_PUBLIC_URL` está definida (p. ej. https://api.jkmobiliario.digital/media,
 * proxy HTTPS de Caddy hacia MinIO), las URLs nuevas se construyen por HTTPS y
 * el navegador puede descargarlas desde el sitio sin *mixed content* ni CORS.
 * Si no, se conserva el formato histórico http(s)://endpoint:puerto/bucket/key
 * (las URLs viejas siguen funcionando con el proxy de imágenes de Astro).
 */
export const publicObjectUrl = (objectName: string): string => {
  if (config.minioPublicUrl) {
    return `${config.minioPublicUrl}/${config.minioBucket}/${objectName}`;
  }

  const protocol = config.minio.useSSL ? "https" : "http";
  return `${protocol}://${config.minio.endPoint}:${config.minio.port}/${config.minioBucket}/${objectName}`;
};

/**
 * Extrae el object key de una URL pública (soporta tanto el formato HTTPS
 * proxied como el formato histórico). Devuelve null si no pertenece al bucket.
 */
export const objectKeyFromUrl = (url: string): string | null => {
  const marker = `/${config.minioBucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  const key = url.slice(index + marker.length).split("?")[0]?.trim();
  return key ? decodeURIComponent(key) : null;
};
