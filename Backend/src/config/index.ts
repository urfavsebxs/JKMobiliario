import dotenv from "dotenv";
dotenv.config();

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  // Interfaz en la que se escucha. Por defecto SOLO loopback, nunca 0.0.0.0.
  //
  // El backend vive detrás de Caddy, que reenvía a `localhost:4000`, así que
  // atarlo a todas las interfaces no aporta nada y sí expone: el puerto quedaba
  // alcanzable desde Internet en claro y sin pasar por Caddy, es decir, sin TLS,
  // sin sus cabeceras y sin las reglas que él aplica. Comprobado: en el servidor
  // de producción `:4000` respondía al mundo mientras el propio
  // `docker-compose.yml` de este repo ya publicaba `127.0.0.1:4000:4000` — la
  // intención siempre fue loopback; el proceso suelto de pm2 era el que se salía.
  //
  // 0.0.0.0 se sigue pudiendo pedir con HOST, y ahí sí hace falta el cortafuegos
  // delante. El caso real es un contenedor con el backend en otra red: dentro de
  // uno, el proxy entra por la IP del bridge (172.17.0.1), que no es loopback.
  host: process.env.HOST?.trim() || "127.0.0.1",
  mongoUri: requireEnv("MONGODB_URI"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [],
  adminEmail: requireEnv("ADMIN_EMAIL"),
  adminPassword: requireEnv("ADMIN_PASSWORD"),
  minio: {
    endPoint: requireEnv("MINIO_ENDPOINT"),
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: requireEnv("MINIO_ACCESS_KEY"),
    secretKey: requireEnv("MINIO_SECRET_KEY"),
  },
  minioBucket: requireEnv("MINIO_BUCKET"),
  // Bucket PRIVADO de los comprobantes de pago. Separado del bucket de
  // productos a propósito: `ensureBucket` aplica lectura pública a todos los
  // objetos de `minioBucket`, así que un comprobante ahí (monto, fecha, banco
  // y nombre del cliente) quedaría visible para cualquiera que tenga la URL.
  minioBucketComprobantes: process.env.MINIO_BUCKET_COMPROBANTES?.trim() || "comprobantes",
  // URL pública HTTPS de MinIO (p. ej. https://api.dominio.com/media, proxied
  // por Caddy). Opcional: si no se define, se conserva la URL directa
  // http(s)://MINIO_ENDPOINT:MINIO_PORT (comportamiento anterior).
  minioPublicUrl: process.env.MINIO_PUBLIC_URL?.trim().replace(/\/+$/, "") || "",
  // Clave compartida con n8n para las rutas de servicio (ingesta de
  // comprobantes). Opcional a propósito: si falta, el servidor arranca igual
  // pero esas rutas quedan cerradas (fail-closed, ver accessControl).
  jkServiceKey: process.env.JK_SERVICE_KEY?.trim() || "",
  // Webhook de n8n que avisa al cliente cuando un trabajador revisa su
  // comprobante. Opcional: sin él, la revisión se guarda pero no se notifica.
  n8nWebhookUrl: process.env.JK_N8N_WEBHOOK_URL?.trim() || "",
};
