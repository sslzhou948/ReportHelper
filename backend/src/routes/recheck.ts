import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireSession } from '../services/dev-user.js';
import { getRequestId } from '../utils/request-id.js';

const createRecheckPlanSchema = z.object({
  type: z.string().trim().min(1).max(128),
  date: z.string().trim().min(1),
  timeOfDay: z.string().trim().max(32).optional().nullable(),
  hospital: z.string().trim().min(1).max(128),
  department: z.string().trim().max(128).optional().nullable(),
  doctor: z.string().trim().max(64).optional().nullable(),
  reminderConfig: z.unknown().optional(),
  todos: z.array(z.object({
    text: z.string().trim().min(1).max(256),
    sortOrder: z.number().int().positive().optional(),
    isDone: z.boolean().optional(),
    isTemplate: z.boolean().optional()
  })).optional()
});

const updateRecheckPlanSchema = createRecheckPlanSchema
  .omit({ todos: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

const updateTodoSchema = z.object({
  isDone: z.boolean()
});

const addTodoSchema = z.object({
  text: z.string().trim().min(1).max(256),
  isDone: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  sortOrder: z.number().int().positive().optional()
});

type RecheckPlanShape = {
  id: string;
  profileId: string;
  type: string;
  date: Date;
  timeOfDay: string | null;
  hospital: string;
  department: string | null;
  doctor: string | null;
  status: string;
  reminderConfig: Prisma.JsonValue;
  todos?: RecheckTodoShape[];
};

type RecheckTodoShape = {
  id: string;
  text: string;
  sortOrder: number;
  isDone: boolean;
  isTemplate: boolean;
};

function toDateOnly(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? { advanceDays: [3, 1, 0], subscribeAccepted: false })) as Prisma.InputJsonValue;
}

function serializePlan(plan: RecheckPlanShape) {
  return {
    id: plan.id,
    profileId: plan.profileId,
    type: plan.type,
    date: toDateOnly(plan.date),
    timeOfDay: plan.timeOfDay || '',
    hospital: plan.hospital,
    department: plan.department || '',
    doctor: plan.doctor || '',
    status: plan.status,
    reminderConfig: plan.reminderConfig,
    todos: (plan.todos || [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((todo) => ({
        id: todo.id,
        text: todo.text,
        isDone: todo.isDone,
        isTemplate: todo.isTemplate,
        sortOrder: todo.sortOrder
      }))
  };
}

async function ensureProfile(app: FastifyInstance, profileId: string, userId: string) {
  return app.prisma.profile.findFirst({
    where: {
      id: profileId,
      userId,
      deletedAt: null
    }
  });
}

async function findPlanForUser(app: FastifyInstance, planId: string, userId: string) {
  return app.prisma.recheckPlan.findFirst({
    where: {
      id: planId,
      deletedAt: null,
      profile: {
        userId,
        deletedAt: null
      }
    },
    include: {
      todos: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
}

export async function registerRecheckRoutes(app: FastifyInstance) {
  app.get<{ Params: { profileId: string } }>('/api/profiles/:profileId/recheck-plans', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const profile = await ensureProfile(app, request.params.profileId, user.id);
    if (!profile) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    const plans = await app.prisma.recheckPlan.findMany({
      where: {
        profileId: profile.id,
        deletedAt: null
      },
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    });
    const serialized = (plans as unknown as RecheckPlanShape[]).map(serializePlan);
    const pending = serialized.filter((plan) => plan.status === 'pending');

    return {
      data: {
        nextPlan: pending[0] || null,
        otherPlans: pending.slice(1),
        doneCount: serialized.filter((plan) => plan.status === 'done').length
      },
      requestId
    };
  });

  app.post<{ Params: { profileId: string } }>('/api/profiles/:profileId/recheck-plans', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = createRecheckPlanSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid recheck plan parameters',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const dateOnly = toDateOnly(parsed.data.date);
    if (!isValidDateOnly(dateOnly) || dateOnly < todayDateOnly()) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Recheck date must be today or later',
          details: {
            fieldErrors: {
              date: 'Date must be today or later'
            }
          }
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const profile = await ensureProfile(app, request.params.profileId, user.id);
    if (!profile) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Profile not found' },
        requestId
      });
    }

    const plan = await app.prisma.recheckPlan.create({
      data: {
        profileId: profile.id,
        type: parsed.data.type,
        date: new Date(`${dateOnly}T00:00:00.000Z`),
        timeOfDay: parsed.data.timeOfDay || '',
        hospital: parsed.data.hospital,
        department: parsed.data.department || '',
        doctor: parsed.data.doctor || '',
        status: 'pending',
        reminderConfig: toInputJson(parsed.data.reminderConfig),
        todos: {
          create: (parsed.data.todos || []).map((todo, index) => ({
            text: todo.text,
            sortOrder: todo.sortOrder || index + 1,
            isDone: !!todo.isDone,
            isTemplate: todo.isTemplate !== false
          }))
        }
      },
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      data: serializePlan(plan as unknown as RecheckPlanShape),
      requestId
    };
  });

  app.patch<{ Params: { planId: string } }>('/api/recheck-plans/:planId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = updateRecheckPlanSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid recheck plan parameters',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    let dateOnly = '';
    if (parsed.data.date !== undefined) {
      dateOnly = toDateOnly(parsed.data.date);
      if (!isValidDateOnly(dateOnly) || dateOnly < todayDateOnly()) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Recheck date must be today or later',
            details: {
              fieldErrors: {
                date: 'Date must be today or later'
              }
            }
          },
          requestId
        });
      }
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const plan = await findPlanForUser(app, request.params.planId, user.id);
    if (!plan) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Recheck plan not found' },
        requestId
      });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.type !== undefined) data.type = parsed.data.type;
    if (parsed.data.date !== undefined) data.date = new Date(`${dateOnly}T00:00:00.000Z`);
    if (parsed.data.timeOfDay !== undefined) data.timeOfDay = parsed.data.timeOfDay || '';
    if (parsed.data.hospital !== undefined) data.hospital = parsed.data.hospital;
    if (parsed.data.department !== undefined) data.department = parsed.data.department || '';
    if (parsed.data.doctor !== undefined) data.doctor = parsed.data.doctor || '';
    if (parsed.data.reminderConfig !== undefined) data.reminderConfig = toInputJson(parsed.data.reminderConfig);

    const updated = await app.prisma.recheckPlan.update({
      where: { id: plan.id },
      data,
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      data: serializePlan(updated as unknown as RecheckPlanShape),
      requestId
    };
  });

  app.patch<{ Params: { planId: string; todoId: string } }>('/api/recheck-plans/:planId/todos/:todoId', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = updateTodoSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid recheck todo parameters',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const plan = await findPlanForUser(app, request.params.planId, user.id);
    if (!plan || !(plan.todos || []).some((todo) => todo.id === request.params.todoId)) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Recheck plan not found' },
        requestId
      });
    }

    await app.prisma.recheckTodo.update({
      where: { id: request.params.todoId },
      data: { isDone: parsed.data.isDone }
    });

    const updated = await findPlanForUser(app, request.params.planId, user.id);
    return {
      data: serializePlan(updated as unknown as RecheckPlanShape),
      requestId
    };
  });

  app.post<{ Params: { planId: string } }>('/api/recheck-plans/:planId/todos', async (request, reply) => {
    const requestId = getRequestId(request);
    const parsed = addTodoSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid recheck todo parameters',
          details: parsed.error.flatten()
        },
        requestId
      });
    }

    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const plan = await findPlanForUser(app, request.params.planId, user.id);
    if (!plan) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Recheck plan not found' },
        requestId
      });
    }

    const nextSortOrder = parsed.data.sortOrder || ((plan.todos || []).reduce((max, todo) => Math.max(max, todo.sortOrder), 0) + 1);
    await app.prisma.recheckTodo.create({
      data: {
        planId: plan.id,
        text: parsed.data.text,
        sortOrder: nextSortOrder,
        isDone: !!parsed.data.isDone,
        isTemplate: parsed.data.isTemplate === true
      }
    });

    const updated = await findPlanForUser(app, request.params.planId, user.id);
    return {
      data: serializePlan(updated as unknown as RecheckPlanShape),
      requestId
    };
  });

  app.post<{ Params: { planId: string } }>('/api/recheck-plans/:planId/complete', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const plan = await findPlanForUser(app, request.params.planId, user.id);
    if (!plan) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Recheck plan not found' },
        requestId
      });
    }

    const unfinishedTodos = (plan.todos || []).filter((todo) => !todo.isDone);
    if (unfinishedTodos.length) {
      return reply.status(409).send({
        error: {
          code: 'RECHECK_TODOS_NOT_READY',
          message: 'Please complete all recheck todos first',
          details: {
            unfinishedTodoIds: unfinishedTodos.map((todo) => todo.id)
          }
        },
        requestId
      });
    }

    const updated = await app.prisma.recheckPlan.update({
      where: { id: plan.id },
      data: { status: 'done' },
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      data: serializePlan(updated as unknown as RecheckPlanShape),
      requestId
    };
  });

  app.post<{ Params: { planId: string } }>('/api/recheck-plans/:planId/cancel', async (request, reply) => {
    const requestId = getRequestId(request);
    const session = await requireSession(app, request, reply);
    if (!session) return;
    const { user } = session;
    const plan = await findPlanForUser(app, request.params.planId, user.id);
    if (!plan) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Recheck plan not found' },
        requestId
      });
    }

    const updated = await app.prisma.recheckPlan.update({
      where: { id: plan.id },
      data: { status: 'cancelled' },
      include: {
        todos: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    return {
      data: serializePlan(updated as unknown as RecheckPlanShape),
      requestId
    };
  });
}
