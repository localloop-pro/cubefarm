import type http from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './httpError.ts';

export function createRequestBoundary(port: number, sessionToken: string) {
  const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
  const allowedOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

  const validateOrigin = (req: Request, _res: Response, next: NextFunction) => {
    if (req.headers.host && !allowedHosts.includes(req.headers.host)) throw new HttpError(403, 'Invalid Host header');
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) throw new HttpError(403, 'Invalid Origin');
    next();
  };

  const requireSessionToken = (req: Request, _res: Response, next: NextFunction) => {
    if (req.headers['x-session-token'] === sessionToken) return next();
    throw new HttpError(401, 'Missing or invalid session token');
  };

  const validateWebSocketUpgrade = (req: http.IncomingMessage): boolean => {
    if (!req.headers.host || !allowedHosts.includes(req.headers.host)) return false;
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return false;
    return new URL(req.url ?? '', 'http://localhost').searchParams.get('token') === sessionToken;
  };

  return { validateOrigin, requireSessionToken, validateWebSocketUpgrade };
}
