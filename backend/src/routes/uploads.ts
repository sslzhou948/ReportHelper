import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp'
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 9;

const signUploadsSchema = z.object({
  profileId: z.string().uuid(),
  files: z.array(z.object({
    clientFileId: z.string().trim().min(1).max(128),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(64),
    size: z.number().int().positive()
  })).min(1).max(MAX_FILE_COUNT)
});

const completeUploadsSchema = z.object({
  profileId: z.string().uuid(),
  uploads: z.array(z.object({
    photoId: z.string().uuid(),
    sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional()
  })).min(1).max(MAX_FILE_COUNT)
});

function objectKey(profileId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'report-image';
  return `profiles/${profileId}/reports/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
}

function expiresAt() {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post('/api/uploads/sign', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = signUploadsSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Upload sign payload is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;

    const oversized = parsed.data.files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      return reply.status(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Image file is too large',
          details: {
            clientFileId: oversized.clientFileId,
            maxSizeBytes: MAX_FILE_SIZE_BYTES
          }
        },
        requestId
      });
    }

    const unsupported = parsed.data.files.find((file) => !SUPPORTED_IMAGE_TYPES.has(file.mimeType));
    if (unsupported) {
      return reply.status(415).send({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Image file type is unsupported',
          details: {
            clientFileId: unsupported.clientFileId,
            supportedMimeTypes: Array.from(SUPPORTED_IMAGE_TYPES)
          }
        },
        requestId
      });
    }

    const profile = await app.prisma.profile.findFirst({
      where: {
        id: parsed.data.profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile not found'
        },
        requestId
      });
    }

    const uploads = [];
    for (const file of parsed.data.files) {
      const key = objectKey(profile.id, file.fileName);
      const photo = await app.prisma.reportPhoto.create({
        data: {
          profileId: profile.id,
          userId: user.id,
          objectKey: key,
          thumbnailObjectKey: null,
          mimeType: file.mimeType,
          sizeBytes: BigInt(file.size),
          status: 'signed'
        }
      });
      uploads.push({
        clientFileId: file.clientFileId,
        photoId: photo.id,
        objectKey: key,
        uploadUrl: `local-upload://${key}`,
        headers: {},
        expiresAt: expiresAt()
      });
    }

    return {
      data: { uploads },
      requestId
    };
  });

  app.post('/api/uploads/complete', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = completeUploadsSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Upload complete payload is invalid',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;

    const profile = await app.prisma.profile.findFirst({
      where: {
        id: parsed.data.profileId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!profile) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Profile not found'
        },
        requestId
      });
    }

    const uniquePhotoIds = Array.from(new Set(parsed.data.uploads.map((upload) => upload.photoId)));
    const availablePhotos = await app.prisma.reportPhoto.findMany({
      where: {
        id: { in: uniquePhotoIds },
        profileId: profile.id,
        userId: user.id,
        status: { in: ['signed', 'uploaded'] }
      }
    });

    if (availablePhotos.length !== uniquePhotoIds.length) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some uploads are unavailable for completion'
        },
        requestId
      });
    }

    const shaByPhotoId = parsed.data.uploads.reduce<Record<string, string | undefined>>((acc, upload) => {
      acc[upload.photoId] = upload.sha256;
      return acc;
    }, {});

    const photos = await app.prisma.$transaction(async (tx) => {
      const updated = [];
      for (const photoId of uniquePhotoIds) {
        updated.push(await tx.reportPhoto.update({
          where: { id: photoId },
          data: {
            status: 'uploaded',
            ...(shaByPhotoId[photoId] ? { sha256: shaByPhotoId[photoId] } : {})
          }
        }));
      }
      return updated;
    });

    return {
      data: {
        photos: photos.map((photo) => ({
          photoId: photo.id,
          objectKey: photo.objectKey,
          status: photo.status,
          sha256: photo.sha256 || null
        }))
      },
      requestId
    };
  });
}
