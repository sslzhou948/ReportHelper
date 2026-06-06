import assert from 'node:assert/strict';
import { assessOcrImageQuality, readImageMetadata } from './image-quality.js';

function minimalJpeg(width: number, height: number) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
    0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9
  ]);
}

const lowResolutionPhoto = minimalJpeg(1279, 1706);
const lowResolutionMetadata = readImageMetadata(lowResolutionPhoto);
assert.equal(lowResolutionMetadata.format, 'jpeg');
assert.equal(lowResolutionMetadata.width, 1279);
assert.equal(lowResolutionMetadata.height, 1706);

const lowResolutionWarnings = assessOcrImageQuality(lowResolutionPhoto, {
  photoId: 'sample_2',
  objectKey: 'sample-2.jpg'
});
assert.equal(lowResolutionWarnings.length, 1);
assert.equal(lowResolutionWarnings[0].code, 'OCR_IMAGE_LOW_RESOLUTION');
assert.equal(lowResolutionWarnings[0].severity, 'warning');
assert.match(lowResolutionWarnings[0].message, /1279x1706/);
assert.equal((lowResolutionWarnings[0].details as any).photoId, 'sample_2');

const highResolutionPhoto = minimalJpeg(2400, 1800);
assert.deepEqual(assessOcrImageQuality(highResolutionPhoto), []);

const narrowDenseTablePhoto = minimalJpeg(1500, 2400);
const narrowDenseTableWarnings = assessOcrImageQuality(narrowDenseTablePhoto);
assert.equal(narrowDenseTableWarnings.length, 1);
assert.equal(narrowDenseTableWarnings[0].code, 'OCR_IMAGE_LOW_RESOLUTION');
assert.equal((narrowDenseTableWarnings[0].details as any).shortEdge, 1500);
assert.equal((narrowDenseTableWarnings[0].details as any).thresholdShortEdge, 1600);

const wideTablePhoto = minimalJpeg(2600, 900);
const wideWarnings = assessOcrImageQuality(wideTablePhoto);
assert.equal(wideWarnings.some((warning) => warning.code === 'OCR_IMAGE_EXTREME_ASPECT_RATIO'), true);

assert.deepEqual(assessOcrImageQuality(Buffer.from('not an image')), []);

console.log('Image quality checks passed');
