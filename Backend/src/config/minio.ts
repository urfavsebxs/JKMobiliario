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
