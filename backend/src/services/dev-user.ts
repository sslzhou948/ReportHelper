import type { PrismaClient, Profile, User } from '@prisma/client';

export type DevSession = {
  user: User;
  profile: Profile;
};

export async function ensureDevSession(prisma: PrismaClient): Promise<DevSession> {
  const user = await prisma.user.upsert({
    where: { wxOpenid: 'dev_openid_healthhelper' },
    update: {},
    create: {
      wxOpenid: 'dev_openid_healthhelper',
      status: 'active'
    }
  });

  const existingProfile = await prisma.profile.findFirst({
    where: {
      userId: user.id,
      deletedAt: null
    },
    orderBy: { createdAt: 'asc' }
  });

  if (existingProfile) {
    return { user, profile: existingProfile };
  }

  const profile = await prisma.profile.create({
    data: {
      userId: user.id,
      relation: '妈妈',
      realName: '王芬',
      gender: 'F',
      diseaseType: '乳腺癌',
      stage: 'IIA 期',
      treatmentPhase: 'recovery',
      primaryHospital: '协和医院',
      primaryDoctor: '李医生',
      primaryDepartment: '肿瘤科'
    }
  });

  return { user, profile };
}
