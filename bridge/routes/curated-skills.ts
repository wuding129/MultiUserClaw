import { Router } from "express";
import multer from "multer";
import type { BridgeConfig } from "../config.js";
import { asyncHandler } from "../utils.js";

/**
 * Bridge routes that proxy curated-skills requests to the Platform Gateway.
 *
 * The bridge authenticates to the gateway using its container_token
 * (the same token used for LLM proxy). The gateway's `get_user_flexible`
 * dependency accepts both JWT and container_token.
 */
export function curatedSkillsRoutes(config: BridgeConfig): Router {
  const router = Router();
  const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

  // Derive gateway base URL from the LLM proxy URL
  // proxyUrl is like "http://gateway:8080/llm/v1" → base is "http://gateway:8080"
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

  // GET /api/curated-skills — list curated skills with install status
  router.get("/curated-skills", asyncHandler(async (_req, res) => {
    const resp = await gatewayFetch("/api/skills/curated");
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  // POST /api/curated-skills/:id/install — install a curated skill
  router.post("/curated-skills/:id/install", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const resp = await gatewayFetch(`/api/skills/curated/${encodeURIComponent(id)}/install`, {
      method: "POST",
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  // POST /api/curated-skills/submit — submit a skill for review
  router.post("/curated-skills/submit", asyncHandler(async (req, res) => {
    const resp = await gatewayFetch("/api/skills/submit", {
      method: "POST",
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  // GET /api/curated-skills/submissions/mine — list my submissions
  router.get("/curated-skills/submissions/mine", asyncHandler(async (_req, res) => {
    const resp = await gatewayFetch("/api/skills/submissions/mine");
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json(data);
      return;
    }
    res.json(data);
  }));

  // POST /api/curated-skills/submit/upload — submit a skill with file upload
  router.post("/curated-skills/submit/upload", upload.single("file"), asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ detail: "No file provided" });
      return;
    }

    const { skill_name, description, source_url } = req.body;
    const formData = new FormData();
    formData.append("skill_name", skill_name || "");
    formData.append("description", description || "");
    if (source_url) formData.append("source_url", source_url);

    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append("file", blob, file.originalname);

    const base = gatewayBase();
    const resp = await fetch(`${base}/api/skills/submit/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.proxyToken}`,
      },
      body: formData,
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
