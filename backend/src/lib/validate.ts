import { z } from 'zod';
import { badRequest } from './httpError.js';

/** Checks request input against a zod schema; on failure answers 400 with the field problems. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join('.') || '_', issue.message]),
    );
    throw badRequest('invalid_input', 'Some details are missing or not valid.', { fields });
  }
  return result.data;
}

export const uuid = z.uuid();
export const idParam = z.object({ id: z.uuid() });

/** Page number for lists (20 items per page). */
export const pageQuery = z.coerce.number().int().min(1).max(1000).default(1);
export const PAGE_SIZE = 20;
