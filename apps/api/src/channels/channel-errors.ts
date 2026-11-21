import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A request rejected for a channel-specific reason. The body carries a stable
 * machine-readable `error` code next to the human message, e.g.
 * `{ statusCode: 400, error: "RECIPIENT_HAS_NO_PHONE", message: "..." }`.
 */
export class ChannelRequestError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super({ statusCode: status, error: code, message }, status);
  }
}
