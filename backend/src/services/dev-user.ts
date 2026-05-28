import type { PrismaClient, Profile, User } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getRequestId } from '../utils/request-id.js';

export type DevSession = {
  user: User;
  profile: Profile | null;
};

type ProfileSeed = {
  relation: string;
  realName: string;
  gender?: string;
  diseaseType?: string;
  stage?: string;
  treatmentPhase?: string;
  primaryHospital?: string;
  primaryDoctor?: string;
  primaryDepartment?: string;
};

async function ensureFirstProfile(prisma: PrismaClient, user: User, fallback: ProfileSeed): Promise<Profile> {
  const existingProfile = await prisma.profile.findFirst({
    where: {
      userId: user.id,
      deletedAt: null
    },
    orderBy: { createdAt: 'asc' }
  });

  if (existingProfile) return existingProfile;

  return prisma.profile.create({
    data: {
      ...fallback,
      userId: user.id
    }
  });
}

async function findFirstProfile(prisma: PrismaClient, user: User): Promise<Profile | null> {
  return prisma.profile.findFirst({
    where: {
      userId: user.id,
      deletedAt: null
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function ensureDevSession(prisma: PrismaClient): Promise<DevSession> {
  const user = await prisma.user.upsert({
    where: { wxOpenid: 'dev_openid_healthhelper' },
    update: {},
    create: {
      wxOpenid: 'dev_openid_healthhelper',
      status: 'active'
    }
  });

  const profile = await ensureFirstProfile(prisma, user, {
    relation: '妈妈',
    realName: '王芬',
    gender: 'F',
    diseaseType: '乳腺癌',
    stage: 'IIA 期',
    treatmentPhase: 'recovery',
    primaryHospital: '协和医院',
    primaryDoctor: '李医生',
    primaryDepartment: '肿瘤科'
  });

  return { user, profile };
}

export async function getCurrentSession(app: FastifyInstance, request: FastifyRequest): Promise<DevSession | null> {
  const authHeader = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (match) {
    try {
      const payload = app.jwt.verify<{ sub: string; typ?: string }>(match[1]);
      if (payload.typ !== 'access') throw new Error('invalid token type');
      const user = await app.prisma.user.findUnique({
        where: { id: payload.sub }
      });
      if (!user || user.status !== 'active') throw new Error('user unavailable');
      const profile = await findFirstProfile(app.prisma, user);
      return { user, profile };
    } catch (error) {
      return null;
    }
  }

  if (app.env.NODE_ENV === 'production') return null;
  return ensureDevSession(app.prisma);
}

export async function requireSession(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<DevSession | null> {
  const session = await getCurrentSession(app, request);
  if (session) return session;
  reply.status(401).send({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Unauthorized'
    },
    requestId: getRequestId(request)
  });
  return null;
}
