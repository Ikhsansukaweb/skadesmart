import { Request, Response, NextFunction } from "express";

/**
 * Security Audit Logging Middleware
 * Logs security-relevant events for monitoring and incident response
 */

interface AuditEvent {
  event: string;
  severity: "low" | "medium" | "high" | "critical";
  ip: string;
  userAgent: string | undefined;
  userId?: number;
  nisn?: string;
  role?: string;
  path: string;
  method: string;
  details?: Record<string, any>;
  timestamp: string;
}

function logAuditEvent(event: AuditEvent) {
  // In production, send to centralized logging (ELK, Datadog, etc.)
  // For now, structured console logging
  const logLine = JSON.stringify(event);
  if (event.severity === "critical" || event.severity === "high") {
    console.error(`[AUDIT] ${logLine}`);
  } else {
    console.warn(`[AUDIT] ${logLine}`);
  }
}

export function securityAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;
  const startTime = Date.now();

  res.send = function (body?: any): Response {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log authentication/authorization events
    if (req.path.startsWith("/api/auth")) {
      let event: AuditEvent | null = null;

      if (req.path === "/login" && req.method === "POST") {
        if (statusCode === 200) {
          event = {
            event: "LOGIN_SUCCESS",
            severity: "low",
            ip: req.ip || "unknown",
            userAgent: req.get("user-agent"),
            path: req.path,
            method: req.method,
            details: { duration },
            timestamp: new Date().toISOString(),
          };
        } else if (statusCode === 401 || statusCode === 404) {
          event = {
            event: "LOGIN_FAILED",
            severity: "medium",
            ip: req.ip || "unknown",
            userAgent: req.get("user-agent"),
            nisn: req.body?.nisn,
            path: req.path,
            method: req.method,
            details: { statusCode, duration },
            timestamp: new Date().toISOString(),
          };
        } else if (statusCode === 429) {
          event = {
            event: "LOGIN_RATE_LIMITED",
            severity: "high",
            ip: req.ip || "unknown",
            userAgent: req.get("user-agent"),
            nisn: req.body?.nisn,
            path: req.path,
            method: req.method,
            details: { duration },
            timestamp: new Date().toISOString(),
          };
        }
      } else if (req.path === "/logout" && req.method === "POST") {
        event = {
          event: "LOGOUT",
          severity: "low",
          ip: req.ip || "unknown",
          userAgent: req.get("user-agent"),
          userId: req.user?.user_id,
          path: req.path,
          method: req.method,
          details: { duration },
          timestamp: new Date().toISOString(),
        };
      } else if (req.path === "/firebase-token" && req.method === "GET") {
        if (statusCode === 200) {
          event = {
            event: "FIREBASE_TOKEN_REFRESH",
            severity: "low",
            ip: req.ip || "unknown",
            userAgent: req.get("user-agent"),
            userId: req.user?.user_id,
            path: req.path,
            method: req.method,
            details: { duration },
            timestamp: new Date().toISOString(),
          };
        }
      }

      if (event) logAuditEvent(event);
    }

    // Log admin actions
    if (req.path.startsWith("/api/admin") && req.user) {
      const adminEvents: Array<{
        path: string;
        method: string;
        event: string;
        severity?: "low" | "medium" | "high" | "critical";
      }> = [
        { path: "/users", method: "GET", event: "ADMIN_LIST_USERS" },
        { path: "/users", method: "PUT", event: "ADMIN_UPDATE_USER_ROLE" },
        { path: "/users", method: "DELETE", event: "ADMIN_DELETE_USER", severity: "high" },
        { path: "/transactions", method: "GET", event: "ADMIN_VIEW_TRANSACTIONS" },
        { path: "/dashboard/summary", method: "GET", event: "ADMIN_VIEW_DASHBOARD" },
        { path: "/app-config", method: "PUT", event: "ADMIN_UPDATE_CONFIG", severity: "medium" },
      ];

      const match = adminEvents.find((e) => req.path.startsWith(e.path) && req.method === e.method);
      if (match) {
        logAuditEvent({
          event: match.event,
          severity: match.severity || "medium",
          ip: req.ip || "unknown",
          userAgent: req.get("user-agent"),
          userId: req.user.user_id,
          role: req.user.role,
          path: req.path,
          method: req.method,
          details: { duration, statusCode },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Log role changes (via admin or direct)
    if (req.path.includes("/role") && req.method === "PUT" && req.user) {
      logAuditEvent({
        event: "ROLE_CHANGE_ATTEMPT",
        severity: "high",
        ip: req.ip || "unknown",
        userAgent: req.get("user-agent"),
        userId: req.user.user_id,
        role: req.user.role,
        path: req.path,
        method: req.method,
        details: { targetUserId: req.params.id, newRole: req.body?.role, statusCode },
        timestamp: new Date().toISOString(),
      });
    }

    // Log upload attempts
    if (req.path.startsWith("/api/upload") && req.method === "POST") {
      logAuditEvent({
        event: "FILE_UPLOAD_ATTEMPT",
        severity: statusCode >= 400 ? "medium" : "low",
        ip: req.ip || "unknown",
        userAgent: req.get("user-agent"),
        userId: req.user?.user_id,
        path: req.path,
        method: req.method,
        details: { statusCode, duration, fileSize: req.headers["content-length"] },
        timestamp: new Date().toISOString(),
      });
    }

    // Log suspicious patterns
    if (statusCode === 403 || statusCode === 401) {
      logAuditEvent({
        event: "ACCESS_DENIED",
        severity: "medium",
        ip: req.ip || "unknown",
        userAgent: req.get("user-agent"),
        userId: req.user?.user_id,
        role: req.user?.role,
        path: req.path,
        method: req.method,
        details: { statusCode, duration },
        timestamp: new Date().toISOString(),
      });
    }

    // Log CSRF failures
    if (res.getHeader("X-CSRF-Error") === "true") {
      logAuditEvent({
        event: "CSRF_FAILURE",
        severity: "high",
        ip: req.ip || "unknown",
        userAgent: req.get("user-agent"),
        userId: req.user?.user_id,
        path: req.path,
        method: req.method,
        details: { duration },
        timestamp: new Date().toISOString(),
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

export { logAuditEvent, type AuditEvent };