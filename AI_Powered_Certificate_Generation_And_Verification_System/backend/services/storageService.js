const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2BucketName = process.env.R2_BUCKET_NAME;

const isR2Configured = Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName);

let s3Client = null;
if (isR2Configured) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey
    }
  });
}

/**
 * Uploads a PDF to R2 (or saves locally if R2 is not configured)
 * @param {string} localDirectory - Fallback local directory
 * @param {string} fileName - E.g. "recordId.pdf"
 * @param {Buffer} buffer - The PDF buffer
 * @returns {Promise<string>} The storage path/URI saved in the DB
 */
async function uploadPdf(localDirectory, fileName, buffer) {
  if (isR2Configured) {
    const key = `certificates/${fileName}`;
    const command = new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf'
    });
    await s3Client.send(command);
    return `r2://${key}`;
  } else {
    // Local Fallback
    if (!fs.existsSync(localDirectory)) {
      fs.mkdirSync(localDirectory, { recursive: true });
    }
    const filePath = path.join(localDirectory, fileName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer, { flag: 'wx', mode: 0o600 });
    }
    return filePath;
  }
}

/**
 * Downloads a PDF stream from R2 (or streams from local file system)
 * @param {string} storagePath - The path saved in DB (either "r2://..." or local absolute path)
 * @returns {Promise<{ stream: import('stream').Readable, length: number }>}
 */
async function downloadPdfStream(storagePath) {
  if (storagePath.startsWith('r2://')) {
    if (!isR2Configured) throw new Error('R2 is not configured but a cloud certificate was requested.');
    
    const key = storagePath.replace('r2://', '');
    const command = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: key
    });
    const response = await s3Client.send(command);
    return { stream: response.Body, length: response.ContentLength };
  } else {
    // Local Fallback
    if (!fs.existsSync(storagePath)) {
      throw new Error('Local certificate PDF not found.');
    }
    const stats = fs.statSync(storagePath);
    const stream = fs.createReadStream(storagePath);
    return { stream, length: stats.size };
  }
}

/**
 * Checks if a PDF already exists in R2 (or locally)
 * @param {string} localDirectory 
 * @param {string} fileName 
 */
async function checkPdfExists(localDirectory, fileName) {
  if (isR2Configured) {
    try {
      const key = `certificates/${fileName}`;
      const command = new GetObjectCommand({ Bucket: r2BucketName, Key: key });
      await s3Client.send(command);
      return { exists: true, path: `r2://${key}` };
    } catch (e) {
      return { exists: false };
    }
  } else {
    const filePath = path.join(localDirectory, fileName);
    if (fs.existsSync(filePath)) return { exists: true, path: filePath };
    return { exists: false };
  }
}

/**
 * Gets a buffer of an existing PDF (used by the email service)
 * @param {string} storagePath 
 * @returns {Promise<Buffer>}
 */
async function getPdfBuffer(storagePath) {
  if (storagePath.startsWith('r2://')) {
    if (!isR2Configured) throw new Error('R2 is not configured.');
    const key = storagePath.replace('r2://', '');
    const command = new GetObjectCommand({ Bucket: r2BucketName, Key: key });
    const response = await s3Client.send(command);
    return Buffer.from(await response.Body.transformToByteArray());
  } else {
    return fs.readFileSync(storagePath);
  }
}

module.exports = {
  uploadPdf,
  downloadPdfStream,
  checkPdfExists,
  getPdfBuffer,
  isR2Configured
};
