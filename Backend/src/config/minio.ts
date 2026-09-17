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
