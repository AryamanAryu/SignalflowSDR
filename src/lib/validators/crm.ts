import { z } from "zod";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

// Accepts a date string (or empty -> null). Coerces to a Date.
const optionalDate = z.preprocess(
  emptyToNull,
  z.coerce.date().nullable().optional()
);

export const pipelineStageEnum = z.enum([
  "NOT_REACHED_OUT",
  "REACHED_OUT",
  "REPLIED",
  "MEETING_BOOKED",
  "CLOSED_WON",
  "CLOSED_LOST",
]);

export const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const updateStageSchema = z.object({
  stage: pipelineStageEnum,
});

export const addNoteSchema = z.object({
  body: z.string().trim().min(1, "Note can't be empty").max(5000),
});

export const updateCrmSchema = z.object({
  priority: priorityEnum.optional(),
  sdrOwnerId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  nextFollowUpAt: optionalDate,
  meetingAt: optionalDate,
  meetingLink: z.preprocess(
    emptyToNull,
    z.string().url("Must be a valid URL").max(500).nullable().optional()
  ),
  notes: z.preprocess(
    emptyToNull,
    z.string().max(5000).nullable().optional()
  ),
});

export type UpdateCrmInput = z.infer<typeof updateCrmSchema>;
