import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BridgeConfig } from "../config.js";
import type { BridgeGatewayClient } from "../gateway-client.js";
import { asyncHandler } from "../utils.js";

export function agentsRoutes(client: BridgeGatewayClient, config: BridgeConfig): Router {
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
    const { name, workspace, emoji, avatar, installed_skills, model } = req.body;

    try {
      const defaultWorkspace = `~/.openclaw/workspace-${name}`;
      const actualWorkspace = workspace || defaultWorkspace;
      const resolvedWorkspace = actualWorkspace.replace("~", os.homedir());
      const params: Record<string, unknown> = { name, workspace: actualWorkspace };
      if (emoji !== undefined) params.emoji = emoji;
      if (avatar !== undefined) params.avatar = avatar;
      if (model !== undefined) params.model = model;

      const result = await client.request<Record<string, unknown>>("agents.create", params);

      // Install selected curated skills to agent's专属 directory
      if (installed_skills && Array.isArray(installed_skills) && installed_skills.length > 0) {
        // Fetch curated skills from platform to get skill names by ID
        try {
          const gatewayUrl = config.proxyUrl.replace("/llm/v1", "");
          const resp = await fetch(`${gatewayUrl}/api/skills/curated`, {
            headers: { "Authorization": `Bearer ${config.proxyToken}` },
          });
          if (resp.ok) {
            const curatedList: Array<{ id: string; name: string }> = await resp.json();
            const skillIdToName = new Map(curatedList.map(s => [s.id, s.name]));

            const agentSkillsDir = path.join(resolvedWorkspace, "skills");
            fs.mkdirSync(agentSkillsDir, { recursive: true });

            // Curated skills are stored in a Docker volume mounted at /app/curated-skills
            const curatedSkillsBase = "/app/curated-skills";

            for (const skillId of installed_skills) {
              const skillName = skillIdToName.get(skillId);
              if (!skillName) continue;

              const srcDir = path.join(curatedSkillsBase, skillName);
              if (fs.existsSync(srcDir)) {
                const destDir = path.join(agentSkillsDir, skillName);
                fs.cpSync(srcDir, destDir, { recursive: true });
              }
            }
          }
        } catch (err) {
          console.error("Failed to install curated skills:", err);
          // Continue even if skill installation fails - agent is still created
        }
      }

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

  // GET /api/models — list available models from gateway + configured model
  router.get("/models", asyncHandler(async (_req, res) => {
    try {
      // Get models from gateway RPC
      const result = await client.request<{ models: Array<{ id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean }> }>(
        "models.list",
        {},
      );

      // Read openclaw.json to find the configured/default model
      const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
      const configPath = path.join(openclawHome, "openclaw.json");
      let configuredModel = "";
      let configuredProviders: Record<string, unknown> = {};

      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          configuredModel = cfg?.agents?.defaults?.model || "";
          configuredProviders = cfg?.models?.providers || {};
        } catch { /* ignore parse errors */ }
      }

      res.json({
        models: result?.models || [],
        configuredModel,
        configuredProviders,
      });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    }
  }));

  // PUT /api/models/config — update models config in openclaw.json
  router.put("/models/config", asyncHandler(async (req, res) => {
    const { providers, defaultModel } = req.body;

    const openclawHome = process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw");
    const configPath = path.join(openclawHome, "openclaw.json");

    let cfg: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch { /* start fresh */ }
    }

    // Update providers if provided
    if (providers !== undefined) {
      if (!cfg.models || typeof cfg.models !== "object") {
        cfg.models = { mode: "replace", providers: {} };
      }
      (cfg.models as Record<string, unknown>).providers = providers;
    }

    // Update default model if provided
    if (defaultModel !== undefined) {
      if (!cfg.agents || typeof cfg.agents !== "object") {
        cfg.agents = { defaults: {} };
      }
      const agents = cfg.agents as Record<string, unknown>;
      if (!agents.defaults || typeof agents.defaults !== "object") {
        agents.defaults = {};
      }
      (agents.defaults as Record<string, unknown>).model = defaultModel;
    }

    fs.mkdirSync(openclawHome, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    res.json({ ok: true });
  }));

  return router;
}
