import { createServerFn } from "@tanstack/react-start";
import EventForm from "@/models/event-form";

/**
 * Get all event forms
 * @returns {Promise<EventForm.EncodedT[]>} - The list of event forms
 */
export const getEventForms = createServerFn({ method: "GET" })
  .validator(() => {})
  .handler(async (): Promise<EventForm.EncodedT[]> => {
    const result = await EventForm.API.getAll();
    return result || [];
  });

/**
 * Get an event form by ID
 * @param id - The ID of the event form
 * @returns {Promise<EventForm.EncodedT | null>} - The event form or null if not found
 */
export const getEventFormById = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<EventForm.EncodedT | null> => {
    const result = await EventForm.API.getById(data.id);
    return result || null;
  });
