import { Router } from "express";
import type { BridgeGatewayClient } from "../gateway-client.js";
import { asyncHandler } from "../utils.js";

export function agentsRoutes(client: BridgeGatewayClient): Router {
  const router = Router();

  // GET /api/agents — list agents
  router.get("/agents", asyncHandler(async (_req, res) => {
    try {
      const result = await client.request<unknown[]>("agents.list", {});
      res.json(result || []);
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // POST /api/agents — create agent
  router.post("/agents", asyncHandler(async (req, res) => {
    const { name, workspace, emoji, avatar } = req.body;

    try {
      const defaultWorkspace = `~/.openclaw/workspace-${name}`;
      const params: Record<string, unknown> = { name, workspace: workspace || defaultWorkspace };
      if (emoji !== undefined) params.emoji = emoji;
      if (avatar !== undefined) params.avatar = avatar;

      const result = await client.request<Record<string, unknown>>("agents.create", params);
      res.json(result);
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // PUT /api/agents/:agentId — update agent
  router.put("/agents/:agentId", asyncHandler(async (req, res) => {
    const { name, workspace, model, avatar } = req.body;

    try {
      const params: Record<string, unknown> = { agentId: req.params.agentId };
      if (name !== undefined) params.name = name;
      if (workspace !== undefined) params.workspace = workspace;
      if (model !== undefined) params.model = model;
      if (avatar !== undefined) params.avatar = avatar;

      const result = await client.request<Record<string, unknown>>("agents.update", params);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // DELETE /api/agents/:agentId — delete agent
  router.delete("/agents/:agentId", asyncHandler(async (req, res) => {
    const deleteFiles = req.query.delete_files === "true";

    try {
      await client.request("agents.delete", {
        agentId: req.params.agentId,
        deleteFiles,
      });
      res.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // GET /api/agents/:agentId/files — list agent files
  router.get("/agents/:agentId/files", asyncHandler(async (req, res) => {
    try {
      const result = await client.request<unknown[]>("agents.files.list", {
        agentId: req.params.agentId,
      });
      res.json(result || []);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // GET /api/agents/:agentId/files/:name — get agent file
  router.get("/agents/:agentId/files/:name", asyncHandler(async (req, res) => {
    try {
      const result = await client.request<Record<string, unknown>>("agents.files.get", {
        agentId: req.params.agentId,
        name: req.params.name,
      });
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "File not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  // PUT /api/agents/:agentId/files/:name — set agent file
  router.put("/agents/:agentId/files/:name", asyncHandler(async (req, res) => {
    const { content } = req.body;

    try {
      const result = await client.request<Record<string, unknown>>("agents.files.set", {
        agentId: req.params.agentId,
        name: req.params.name,
        content,
      });
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("not found")) {
        res.status(404).json({ detail: "Agent not found" });
      } else {
        res.status(500).json({ detail: msg });
      }
    }
  }));

  return router;
}
