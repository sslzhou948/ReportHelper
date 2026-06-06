import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession } from '../services/dev-user.js';
import { createUploadStorageProvider } from '../services/upload-storage.js';
import { getRequestId } from '../utils/request-id.js';

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif'
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_COUNT = 9;
const MULTIPART_BOUNDARY_PREFIX = 'boundary=';

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

function normalizeMimeType(mimeType: string) {
  const value = mimeType.trim().toLowerCase();
  if (value === 'image/jpg') return 'image/jpeg';
  return value;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value || '');
}

function boundaryFromContentType(contentType: string) {
  const boundaryPart = contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(MULTIPART_BOUNDARY_PREFIX));
  if (!boundaryPart) return '';
  return boundaryPart.slice(MULTIPART_BOUNDARY_PREFIX.length).replace(/^"|"$/g, '');
}

function extractMultipartFile(body: Buffer, contentType: string) {
  const boundary = boundaryFromContentType(contentType);
  if (!boundary) throw new Error('missing multipart boundary');

  const marker = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from('\r\n\r\n');
  let cursor = body.indexOf(marker);
  while (cursor >= 0) {
    let partStart = cursor + marker.length;
    if (body.subarray(partStart, partStart + 2).toString() === '--') break;
    if (body.subarray(partStart, partStart + 2).toString() === '\r\n') partStart += 2;

    const headerEnd = body.indexOf(headerSeparator, partStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(partStart, headerEnd).toString('utf8');
    const contentStart = headerEnd + headerSeparator.length;
    const nextMarker = body.indexOf(marker, contentStart);
    if (nextMarker < 0) break;

    let contentEnd = nextMarker;
    if (body[contentEnd - 2] === 13 && body[contentEnd - 1] === 10) contentEnd -= 2;
    if (/content-disposition/i.test(headers) && (/filename=/i.test(headers) || /name="file"/i.test(headers))) {
      return body.subarray(contentStart, contentEnd);
    }
    cursor = nextMarker;
  }

  throw new Error('missing multipart file');
}

function extractUploadBody(body: unknown, contentType: string) {
  if (!Buffer.isBuffer(body)) throw new Error('upload body must be a buffer');
  if (/^multipart\/form-data/i.test(contentType)) return extractMultipartFile(body, contentType);
  if (/^image\//i.test(contentType) || contentType === 'application/octet-stream') return body;
  throw new Error('unsupported local upload content type');
}

export async function registerUploadRoutes(app: FastifyInstance) {
  const storageProvider = createUploadStorageProvider(app.env);

  app.addContentTypeParser(/^multipart\/form-data/i, { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser(/^image\//i, { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post<{ Params: { photoId: string } }>('/api/uploads/local/:photoId', async (request, reply) => {
    const requestId = getRequestId(request);
    if (!storageProvider.writeObject) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Local upload endpoint is unavailable'
        },
        requestId
      });
    }

    const token = headerValue(request.headers['x-upload-token']);
    if (!token) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Upload token is missing'
        },
        requestId
      });
    }

    let payload: { sub: string; typ?: string; photoId?: string; profileId?: string };
    try {
      payload = app.jwt.verify(token);
      if (payload.typ !== 'upload' || payload.photoId !== request.params.photoId) throw new Error('invalid upload token');
    } catch {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Upload token is invalid'
        },
        requestId
      });
    }

    const photo = await app.prisma.reportPhoto.findMany({
      where: {
        id: { in: [request.params.photoId] },
        profileId: payload.profileId,
        userId: payload.sub,
        status: { in: ['signed'] }
      }
    });
    if (photo.length !== 1) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Upload photo not found'
        },
        requestId
      });
    }

    let bytes: Buffer;
    try {
      bytes = extractUploadBody(request.body, headerValue(request.headers['content-type']));
    } catch (error) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Upload body is invalid'
        },
        requestId
      });
    }

    if (bytes.length <= 0 || bytes.length > MAX_FILE_SIZE_BYTES) {
      return reply.status(bytes.length > MAX_FILE_SIZE_BYTES ? 413 : 400).send({
        error: {
          code: bytes.length > MAX_FILE_SIZE_BYTES ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED',
          message: bytes.length > MAX_FILE_SIZE_BYTES ? 'Image file is too large' : 'Image file is empty'
        },
        requestId
      });
    }

    await storageProvider.writeObject(photo[0].objectKey, bytes);
    return {
      data: {
        ok: true,
        photoId: photo[0].id,
        objectKey: photo[0].objectKey,
        sizeBytes: bytes.length
      },
      requestId
    };
  });

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

    const unsupported = parsed.data.files.find((file) => !SUPPORTED_IMAGE_TYPES.has(normalizeMimeType(file.mimeType)));
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
      const signedUpload = await storageProvider.signUpload({
        profileId: profile.id,
        fileName: file.fileName
      });
      const photo = await app.prisma.reportPhoto.create({
        data: {
          profileId: profile.id,
          userId: user.id,
          objectKey: signedUpload.objectKey,
          thumbnailObjectKey: null,
          mimeType: normalizeMimeType(file.mimeType),
          sizeBytes: BigInt(file.size),
          status: 'signed'
        }
      });
      const uploadToken = app.jwt.sign({
        sub: user.id,
        typ: 'upload',
        photoId: photo.id,
        profileId: profile.id
      }, { expiresIn: '15m' });
      const uploadTarget = storageProvider.prepareUploadTarget
        ? storageProvider.prepareUploadTarget(signedUpload, {
          publicBaseUrl: app.env.BACKEND_PUBLIC_BASE_URL,
          photoId: photo.id,
          uploadToken
        })
        : signedUpload;
      uploads.push({
        clientFileId: file.clientFileId,
        photoId: photo.id,
        objectKey: uploadTarget.objectKey,
        uploadUrl: uploadTarget.uploadUrl,
        headers: uploadTarget.headers,
        expiresAt: uploadTarget.expiresAt
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

    if (storageProvider.objectExists) {
      const missingPhoto = await (async () => {
        for (const photo of availablePhotos) {
          if (!(await storageProvider.objectExists!(photo.objectKey))) return photo;
        }
        return null;
      })();
      if (missingPhoto) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some uploads have not been transferred yet'
          },
          requestId
        });
      }
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
