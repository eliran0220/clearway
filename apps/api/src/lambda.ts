import { streamHandle } from '@hono/aws-lambda';
import { app } from './app';

// Streaming handler for the Lambda Function URL (invoke mode RESPONSE_STREAM, set by sst.config.ts).
export const handler = streamHandle(app);
