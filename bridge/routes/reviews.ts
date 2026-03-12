/**
 * Review task API for skill-reviewer agent.
 *
 * This API allows the skill-reviewer agent to:
 * 1. Poll for pending review tasks
 * 2. Submit review results
 */

import { Router } from "express";
import type { BridgeConfig } from "../config.js";
import { asyncHandler } from "../utils.js";

export function reviewRoutes(config: BridgeConfig): Router {
  const router = Router();

  // Derive gateway base URL from the LLM proxy URL
  function gatewayBase(): string {
    const url = config.proxyUrl;
    const idx = url.indexOf("/llm/v1");
    return idx >= 0 ? url.slice(0, idx) : url.replace(/\/+$/, "");
  }

  async function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
    const base = gatewayBase();
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.proxyToken}`,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  }

  // GET /api/reviews/pending - Get next pending review task
  router.get("/reviews/pending", asyncHandler(async (_req, res) => {
    const resp = await gatewayFetch("/api/skills/reviews/pending");
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  // POST /api/reviews/result - Submit review result
  router.post("/reviews/result", asyncHandler(async (req, res) => {
    const { task_id, review_result, error } = req.body;

    const resp = await gatewayFetch("/api/skills/reviews/result", {
      method: "POST",
      body: JSON.stringify({ task_id, review_result, error }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  return router;
}
