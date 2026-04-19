import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

export function requireAdmin(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return next(httpError(401, "Authentication required"));
  }

  try {
    req.admin = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return next(httpError(401, "Invalid or expired session"));
  }
}
