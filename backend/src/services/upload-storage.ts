import { randomUUID } from 'node:crypto';

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

class LocalUploadStorageProvider implements UploadStorageProvider {
  async signUpload(input: SignUploadInput): Promise<SignedUploadTarget> {
    const key = objectKey(input.profileId, input.fileName);
    return {
      objectKey: key,
      uploadUrl: `local-upload://${key}`,
      headers: {},
      expiresAt: expiresAt()
    };
  }
}

export function createUploadStorageProvider(): UploadStorageProvider {
  return new LocalUploadStorageProvider();
}
