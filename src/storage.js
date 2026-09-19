import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function configured() {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

function s3() {
  if (!configured()) throw new Error('Object storage is not configured');
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || 'false').toLowerCase() === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
}

export function storageReady() {
  return configured();
}

export async function presignUpload({ key, contentType }) {
  return getSignedUrl(s3(), new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType
  }), { expiresIn: 900 });
}
