import { Router } from "express";

const router = Router();

// Payment-gated endpoint
router.get("/api/paid", (_req, res) => {
  res.json({
    message: "Paid content delivered",
    data: { value: 42, timestamp: new Date().toISOString() },
  });
});

// Reputation-gated endpoint
router.get("/api/trusted", (req, res) => {
  const agentAddress = req.headers["x-agent-address"] as string;
  res.json({
    message: "Trusted content delivered",
    agent: agentAddress,
    data: { secret: "only-for-reputable-agents", timestamp: new Date().toISOString() },
  });
});

// Combined (reputation + payment) endpoint
router.get("/api/flex", (req, res) => {
  const agentAddress = req.headers["x-agent-address"] as string;
  res.json({
    message: "Flexible content delivered",
    agent: agentAddress,
    data: { premium: true, timestamp: new Date().toISOString() },
  });
});

// Health check (no gating)
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
