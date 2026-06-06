import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';

export type SignUploadInput = {
  profileId: string;
  fileName: string;
};

export type SignedUploadTarget = {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
};

export type UploadStorageProvider = {
  signUpload(input: SignUploadInput): Promise<SignedUploadTarget>;
  prepareUploadTarget?(target: SignedUploadTarget, context: {
    publicBaseUrl: string;
    photoId: string;
    uploadToken: string;
  }): SignedUploadTarget;
  writeObject?(objectKey: string, data: Buffer): Promise<void>;
  objectExists?(objectKey: string): Promise<boolean>;
  getLocalPath?(objectKey: string): string;
};

function safeObjectName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'report-image';
}

function objectKey(profileId: string, fileName: string) {
  return `profiles/${profileId}/reports/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeObjectName(fileName)}`;
}

function expiresAt() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

function safeObjectKeyPath(rootDir: string, key: string) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    throw new Error('invalid object key path');
  }
  return target;
}

class LocalUploadStorageProvider implements UploadStorageProvider {
  constructor(private readonly rootDir: string) {}

  async signUpload(input: SignUploadInput): Promise<SignedUploadTarget> {
    const key = objectKey(input.profileId, input.fileName);
    return {
      objectKey: key,
      uploadUrl: `local-upload://${key}`,
      headers: {},
      expiresAt: expiresAt()
    };
  }

  prepareUploadTarget(target: SignedUploadTarget, context: { publicBaseUrl: string; photoId: string; uploadToken: string }): SignedUploadTarget {
    return {
      ...target,
      uploadUrl: `${context.publicBaseUrl.replace(/\/$/, '')}/api/uploads/local/${context.photoId}`,
      headers: {
        ...target.headers,
        'x-upload-token': context.uploadToken
      }
    };
  }

  async writeObject(objectKey: string, data: Buffer): Promise<void> {
    const target = safeObjectKeyPath(this.rootDir, objectKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await fs.access(safeObjectKeyPath(this.rootDir, objectKey));
      return true;
    } catch {
      return false;
    }
  }

  getLocalPath(objectKey: string): string {
    return safeObjectKeyPath(this.rootDir, objectKey);
  }
}

export function createUploadStorageProvider(env?: Pick<Env, 'LOCAL_OBJECT_STORAGE_DIR' | 'UPLOAD_STORAGE_PROVIDER'>): UploadStorageProvider {
  if (env?.UPLOAD_STORAGE_PROVIDER && env.UPLOAD_STORAGE_PROVIDER !== 'local') {
    throw new Error(`Upload storage provider ${env.UPLOAD_STORAGE_PROVIDER} is not implemented in this self-hosted build`);
  }
  const rootDir = path.resolve(process.cwd(), env?.LOCAL_OBJECT_STORAGE_DIR || '../local-object-storage');
  return new LocalUploadStorageProvider(rootDir);
}
