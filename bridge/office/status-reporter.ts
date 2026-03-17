/**
 * Office Status Reporter - monitors OpenClaw events and reports agent status to Gateway.
 */

import type { BridgeGatewayClient, GatewayEvent } from "../gateway-client.js";
import type { BridgeConfig } from "../config.js";

/** Event to status mapping */
const EVENT_TO_STATUS: Record<string, string> = {
  "chat.message.received": "writing",
  "agent.tool.call": "executing",
  "agent.thinking": "researching",
  "agent.file.write": "writing",
  "agent.sync": "syncing",
  "agent.error": "error",
  "chat.stream.delta": "writing",
  "chat.stream.end": "idle",
  "agent.idle": "idle",
};

/** Status labels for display */
const STATUS_LABELS: Record<string, string> = {
  idle: "空闲",
  writing: "编写中",
  researching: "研究中",
  executing: "执行中",
  syncing: "同步中",
  error: "错误",
};

interface AgentState {
  agent_id: string;
  agent_name: string;
  status: string;
  emoji: string | null;
  position: { x: number; y: number };
  last_activity: Date;
  current_task: string | null;
}

interface StatusReport {
  user_id: string;
  agents: AgentState[];
}

export class OfficeStatusReporter {
  private agents: Map<string, AgentState> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly gatewayUrl: string;
  private readonly containerToken: string;

  constructor(
    private client: BridgeGatewayClient,
    private config: BridgeConfig,
    private userId: string,
    options?: { intervalMs?: number }
  ) {
    this.intervalMs = options?.intervalMs ?? 2000;
    // Gateway URL for status reporting
    this.gatewayUrl = process.env.PLATFORM_GATEWAY_URL || "http://localhost:8080";
    // Container token for internal API authentication
    this.containerToken = config.proxyToken;
  }

  /**
   * Start the status reporter.
   * Listens for OpenClaw events and periodically reports to Gateway.
   */
  start(): void {
    console.log(`[office] Starting OfficeStatusReporter (interval: ${this.intervalMs}ms)`);

    // 1. Listen for OpenClaw events
    this.client.onEvent((evt) => this.handleEvent(evt));

    // 2. Periodic status report
    this.intervalId = setInterval(() => {
      this.reportStatus().catch((err) => {
        console.error("[office] Failed to report status:", err);
      });
    }, this.intervalMs);

    // Initial report
    this.reportStatus().catch((err) => {
      console.error("[office] Failed to send initial status report:", err);
    });
  }

  /**
   * Stop the status reporter.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[office] OfficeStatusReporter stopped");
  }

  /**
   * Handle an OpenClaw gateway event.
   */
  private handleEvent(evt: GatewayEvent): void {
    const eventName = evt.event;
    const payload = evt.payload || {};

    // Extract agent info from event
    const agentId = this.extractAgentId(evt);
    if (!agentId) return;

    // Get or create agent state
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        agent_id: agentId,
        agent_name: this.extractAgentName(evt, agentId),
        status: "idle",
        emoji: this.extractAgentEmoji(evt, agentId),
        position: this.generatePosition(),
        last_activity: new Date(),
        current_task: null,
      };
      this.agents.set(agentId, agent);
    }

    // Map event to status
    const newStatus = EVENT_TO_STATUS[eventName];
    if (newStatus) {
      agent.status = newStatus;
      agent.last_activity = new Date();
      agent.current_task = this.extractCurrentTask(evt, eventName);
    }

    // Auto-reset to idle after a period of inactivity
    this.scheduleIdleReset(agentId);
  }

  /**
   * Extract agent ID from event.
   */
  private extractAgentId(evt: GatewayEvent): string | null {
    const payload = evt.payload || {};
    // Try various possible locations for agent ID
    if (payload.agent_id) return String(payload.agent_id);
    if (payload.agentId) return String(payload.agentId);
    if (payload.sessionKey) {
      // Session key might contain agent ID
      const parts = String(payload.sessionKey).split(":");
      if (parts.length > 0) return parts[0];
    }
    // Default agent
    return "default";
  }

  /**
   * Extract agent name from event.
   */
  private extractAgentName(evt: GatewayEvent, agentId: string): string {
    const payload = evt.payload || {};
    if (payload.agent_name) return String(payload.agent_name);
    if (payload.agentName) return String(payload.agentName);
    if (payload.name) return String(payload.name);
    return agentId === "default" ? "Default Agent" : `Agent ${agentId}`;
  }

  /**
   * Extract agent emoji from event.
   */
  private extractAgentEmoji(evt: GatewayEvent, agentId: string): string | null {
    const payload = evt.payload || {};
    if (payload.emoji) return String(payload.emoji);
    if (payload.icon) return String(payload.icon);
    return null;
  }

  /**
   * Extract current task description from event.
   */
  private extractCurrentTask(evt: GatewayEvent, eventName: string): string | null {
    const payload = evt.payload || {};

    switch (eventName) {
      case "chat.message.received":
        return "Processing message";
      case "agent.tool.call":
        const toolName = payload.tool || payload.toolName || "unknown tool";
        return `Using ${toolName}`;
      case "agent.thinking":
        return "Analyzing";
      case "agent.file.write":
        const filePath = payload.path || payload.filePath || "file";
        return `Writing ${filePath}`;
      case "agent.sync":
        return "Synchronizing";
      case "agent.error":
        return `Error: ${payload.message || payload.error || "Unknown error"}`;
      default:
        return null;
    }
  }

  /**
   * Generate a random position for agent avatar.
   */
  private generatePosition(): { x: number; y: number } {
    return {
      x: Math.random() * 800,
      y: Math.random() * 600,
    };
  }

  /**
   * Schedule auto-reset to idle status after inactivity.
   */
  private idleResetTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scheduleIdleReset(agentId: string): void {
    // Clear existing timer
    const existing = this.idleResetTimers.get(agentId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer (reset to idle after 5 seconds of no activity)
    const timer = setTimeout(() => {
      const agent = this.agents.get(agentId);
      if (agent && agent.status !== "idle") {
        agent.status = "idle";
        agent.current_task = null;
        agent.last_activity = new Date();
      }
      this.idleResetTimers.delete(agentId);
    }, 5000);

    this.idleResetTimers.set(agentId, timer);
  }

  /**
   * Report current agent status to Gateway.
   */
  private async reportStatus(): Promise<void> {
    const agents = Array.from(this.agents.values()).map((a) => ({
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      status: a.status,
      emoji: a.emoji,
      position: a.position,
      current_task: a.current_task,
    }));

    const report: StatusReport = {
      user_id: this.userId,
      agents,
    };

    try {
      const response = await fetch(`${this.gatewayUrl}/api/internal/office/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Container-Token": this.containerToken,
        },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        throw new Error(`Status report failed: ${response.status}`);
      }
    } catch (err) {
      // Don't spam logs for connection errors during startup
      if ((err as Error).message?.includes("ECONNREFUSED")) {
        return;
      }
      throw err;
    }
  }

  /**
   * Add or update an agent manually (e.g., from agent list).
   */
  updateAgent(agentId: string, data: Partial<AgentState>): void {
    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        agent_id: agentId,
        agent_name: data.agent_name || `Agent ${agentId}`,
        status: data.status || "idle",
        emoji: data.emoji || null,
        position: data.position || this.generatePosition(),
        last_activity: new Date(),
        current_task: data.current_task || null,
      };
      this.agents.set(agentId, agent);
    } else {
      Object.assign(agent, data, { last_activity: new Date() });
    }
  }

  /**
   * Remove an agent.
   */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }
}
