import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export function getRequestId(request: FastifyRequest): string {
  const value = request.headers['x-request-id'];
  if (Array.isArray(value)) return value[0] || randomUUID();
  return value || randomUUID();
}
