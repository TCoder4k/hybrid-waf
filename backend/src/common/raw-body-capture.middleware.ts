import type { NextFunction, Request, Response } from 'express';

// Nest's default body parsers (app.useBodyParser('json'/'urlencoded') in
// main.ts) only ever consume the request stream when Content-Type matches
// application/json or application/x-www-form-urlencoded — for anything else
// (multipart/form-data, images, arbitrary binary, no Content-Type at all)
// the stream is left completely untouched and req.body stays undefined.
//
// UpstreamProxyService (Phase P2, docs/architecture.md §21) needs the exact
// original bytes for those cases to forward them transparently instead of
// silently dropping the body (the pre-P2 behavior) — this middleware
// captures them into req.rawBody. It deliberately does nothing for
// json/urlencoded requests: those already get a correctly-typed req.body
// from Nest's parsers, and UpstreamProxyService re-serializes from that
// instead (see its content-type-aware body-building logic).
//
// Scope boundary, stated plainly: a captured rawBody is used ONLY for
// forwarding fidelity. It is never read by RequestNormalizerService or
// passed to Rule/ML detection — inspecting the contents of multipart/binary
// bodies for SQLi/XSS is out of scope for this phase (detection continues
// to operate on query params + parsed JSON/urlencoded body values, exactly
// as before).
const PARSED_BY_NEST_CONTENT_TYPES =
  /^application\/(json|x-www-form-urlencoded)\b/i;

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function rawBodyCapture(maxBytes: number) {
  return (req: RequestWithRawBody, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'] ?? '';
    if (PARSED_BY_NEST_CONTENT_TYPES.test(contentType)) {
      next();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        res.status(413).json({
          statusCode: 413,
          error: 'Payload Too Large',
          message: `Request body exceeds the ${maxBytes}-byte limit`,
        });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      req.rawBody = Buffer.concat(chunks);
      next();
    });

    req.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      next(err);
    });
  };
}
