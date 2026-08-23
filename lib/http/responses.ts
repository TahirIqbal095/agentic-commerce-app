export type HttpError = {
  code: string;
  message: string;
  details: Record<string, unknown>;
};

export function dataResponse<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function errorResponse(error: HttpError, status: number): Response {
  return Response.json({ error }, { status });
}

export function unexpectedErrorResponse(): Response {
  return errorResponse(
    {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      details: {},
    },
    500,
  );
}
