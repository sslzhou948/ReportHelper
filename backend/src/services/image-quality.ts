export type ImageMetadata = {
  format: 'jpeg' | 'png' | 'webp' | 'unknown';
  width?: number;
  height?: number;
  sizeBytes: number;
};

export type PhotoQualityWarning = {
  code: string;
  message: string;
  severity: 'info' | 'warning';
  details?: Record<string, unknown>;
};

const MIN_DENSE_TABLE_MEGAPIXELS = 3;
const MIN_DENSE_TABLE_SHORT_EDGE = 1600;
const MAX_EXTREME_ASPECT_RATIO = 2.2;
const MIN_EXTREME_ASPECT_RATIO = 1 / MAX_EXTREME_ASPECT_RATIO;

function parseJpegDimensions(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
    const isSof = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + segmentLength;
  }
  return {};
}

function parsePngDimensions(bytes: Buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) return {};
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function parseWebpDimensions(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return {};
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3)
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  return {};
}

export function readImageMetadata(bytes: Buffer): ImageMetadata {
  const sizeBytes = bytes.length;
  const jpeg = parseJpegDimensions(bytes);
  if (jpeg.width && jpeg.height) return { format: 'jpeg', sizeBytes, ...jpeg };
  const png = parsePngDimensions(bytes);
  if (png.width && png.height) return { format: 'png', sizeBytes, ...png };
  const webp = parseWebpDimensions(bytes);
  if (webp.width && webp.height) return { format: 'webp', sizeBytes, ...webp };
  return { format: 'unknown', sizeBytes };
}

export function assessOcrImageQuality(bytes: Buffer, context: { photoId?: string; objectKey?: string } = {}) {
  const metadata = readImageMetadata(bytes);
  const warnings: PhotoQualityWarning[] = [];
  if (!metadata.width || !metadata.height) return warnings;

  const pixels = metadata.width * metadata.height;
  const megapixels = pixels / 1_000_000;
  const shortEdge = Math.min(metadata.width, metadata.height);
  const aspectRatio = metadata.width / metadata.height;
  const baseDetails = {
    photoId: context.photoId,
    objectKey: context.objectKey,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    megapixels: Number(megapixels.toFixed(2)),
    sizeBytes: metadata.sizeBytes
  };

  if (megapixels < MIN_DENSE_TABLE_MEGAPIXELS || shortEdge < MIN_DENSE_TABLE_SHORT_EDGE) {
    warnings.push({
      code: 'OCR_IMAGE_LOW_RESOLUTION',
      severity: 'warning',
      message: `图片分辨率 ${metadata.width}x${metadata.height}（${megapixels.toFixed(1)}MP，短边 ${shortEdge}px）偏低，小字表格可能识别不准。建议靠近重拍或上传原始扫描件。`,
      details: {
        ...baseDetails,
        shortEdge,
        thresholdMegapixels: MIN_DENSE_TABLE_MEGAPIXELS,
        thresholdShortEdge: MIN_DENSE_TABLE_SHORT_EDGE
      }
    });
  }

  if (aspectRatio > MAX_EXTREME_ASPECT_RATIO || aspectRatio < MIN_EXTREME_ASPECT_RATIO) {
    warnings.push({
      code: 'OCR_IMAGE_EXTREME_ASPECT_RATIO',
      severity: 'info',
      message: '图片宽高比例较极端，可能包含长表格或裁切区域。保存前请重点核对是否漏行、串列。',
      details: {
        ...baseDetails,
        aspectRatio: Number(aspectRatio.toFixed(3))
      }
    });
  }

  return warnings;
}
