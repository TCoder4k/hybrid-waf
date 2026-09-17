import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import {
  RequestWithRawBody,
  rawBodyCapture,
} from './raw-body-capture.middleware';

function makeReq(contentType: string | undefined) {
  const req = new EventEmitter() as unknown as RequestWithRawBody;
  req.headers = contentType ? { 'content-type': contentType } : {};
  const destroy = jest.fn();
  req.destroy = destroy;
  return { req, destroy };
}

function makeRes() {
  const status = jest.fn();
  const json = jest.fn();
  status.mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('rawBodyCapture', () => {
  it('skips capture and calls next immediately for application/json', () => {
    const { req } = makeReq('application/json');
    const { res } = makeRes();
    const next = jest.fn();

    rawBodyCapture(1024)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rawBody).toBeUndefined();
  });

  it('skips capture for application/x-www-form-urlencoded', () => {
    const { req } = makeReq('application/x-www-form-urlencoded');
    const { res } = makeRes();
    const next = jest.fn();

    rawBodyCapture(1024)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rawBody).toBeUndefined();
  });

  it('captures the raw bytes for a multipart/form-data request', () => {
    const { req } = makeReq('multipart/form-data; boundary=X');
    const { res } = makeRes();
    const next = jest.fn();

    rawBodyCapture(1024)(req, res, next);
    req.emit('data', Buffer.from('part-1-'));
    req.emit('data', Buffer.from('part-2'));
    req.emit('end');

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rawBody).toEqual(Buffer.from('part-1-part-2'));
  });

  it('captures an empty buffer when there is no body at all', () => {
    const { req } = makeReq(undefined);
    const { res } = makeRes();
    const next = jest.fn();

    rawBodyCapture(1024)(req, res, next);
    req.emit('end');

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.rawBody).toEqual(Buffer.alloc(0));
  });

  it('returns 413 and destroys the request once the byte limit is exceeded, without calling next', () => {
    const { req, destroy } = makeReq('application/octet-stream');
    const { res, status, json } = makeRes();
    const next = jest.fn();

    rawBodyCapture(5)(req, res, next);
    req.emit('data', Buffer.from('0123456789'));

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413 }),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    // A late 'end' after the limit was already hit must not double-call next.
    req.emit('end');
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a stream error to next() instead of hanging', () => {
    const { req } = makeReq('application/octet-stream');
    const { res } = makeRes();
    const next = jest.fn();

    rawBodyCapture(1024)(req, res, next);
    const err = new Error('stream broke');
    req.emit('error', err);

    expect(next).toHaveBeenCalledWith(err);
  });
});
