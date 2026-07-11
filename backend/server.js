//server.js


import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const OLLAMA_BASE_URL = "http://localhost:11434"; // Default Ollama URL
let OLLAMA_MODEL = "mistral";                       // Change to whichever model you have pulled
const UPLOAD_FOLDER = "./uploads";
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);
const MAX_CONTENT_LENGTH = 20 * 1024 * 1024; // 20 MB max upload

if (!fsSync.existsSync(UPLOAD_FOLDER)) {
  fsSync.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

const app = express();
app.use(cors()); 
app.use(express.json());

// ─── UPLOAD HANDLING ─────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_FOLDER),
  filename: (req, file, cb) => {
    const safeName = secureFilename(file.originalname);
    const unique = crypto.randomBytes(8).toString("hex");
    cb(null, `${unique}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_CONTENT_LENGTH },
  fileFilter: (req, file, cb) => {
    if (allowedFile(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`));
    }
  },
});

// ─── HELPERS ───────────────────────────────────────────────────────────────
function secureFilename(filename) {
  return filename
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "");
}

function allowedFile(filename) {
  const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  return ALLOWED_EXTENSIONS.has(ext);
}

// Extract raw text from PDF, DOCX, or TXT. 
async function extractText(filepath, ext) {
  if (ext === "pdf") {
    const buffer = await fs.readFile(filepath);
    const data = await pdfParse(buffer);
    return data.text || "";
  }

  if (ext === "docx") {
    const buffer = await fs.readFile(filepath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (ext === "txt") {
    return fs.readFile(filepath, "utf-8");
  }

  return "";
}

async function queryOllama(prompt, system = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 120s timeout

  try {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        system,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Ollama returned status ${resp.status}`);
    }

    const data = await resp.json();
    return (data.response || "").trim();
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("Ollama request timed out. Try a shorter contract or faster model.");
      e.status = 504;
      throw e;
    }
    if (err.cause?.code === "ECONNREFUSED" || err.message?.includes("fetch failed")) {
      const e = new Error("Cannot connect to Ollama. Make sure it is running: `ollama serve`");
      e.status = 503;
      throw e;
    }
    err.status = err.status || 502;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRiskAnalysisPrompt(contractText) {
  const systemPrompt = `You are a senior legal and commercial contract risk analyst with 20+ years of experience.
Your job is to read contracts and identify risks clearly and actionably.
Always respond with ONLY a valid JSON object — no markdown fences, no preamble, no explanation outside the JSON.
The JSON must strictly follow the schema provided by the user.`;

  const userPrompt = `Analyze the following contract and return a JSON risk analysis report.

CONTRACT TEXT:
"""
${contractText.slice(0, 12000)}
"""

Return ONLY a JSON object with this exact schema:
{
  "contract_summary": "2-3 sentence summary of what this contract is about",
  "overall_risk_level": "Low | Medium | High | Critical",
  "overall_risk_score": <integer 1-100>,
  "key_parties": ["Party A", "Party B"],
  "contract_type": "e.g. Service Agreement, NDA, Lease, Employment, etc.",
  "effective_date": "extracted date or null",
  "expiry_date": "extracted date or null",
  "risks": [
    {
      "id": 1,
      "category": "e.g. Liability | Payment | Termination | IP | Confidentiality | Compliance | Indemnity | Force Majeure | Dispute Resolution | Other",
      "title": "Short risk title",
      "description": "Clear explanation of the risk",
      "severity": "Low | Medium | High | Critical",
      "severity_score": <integer 1-100>,
      "clause_reference": "Clause/Section number if identifiable, else null",
      "recommendation": "Actionable recommendation to mitigate this risk"
    }
  ],
  "missing_clauses": ["List any important clauses that are absent, e.g. Limitation of Liability, Governing Law, etc."],
  "favorable_terms": ["List any terms that are notably favorable"],
  "red_flags": ["List any immediate red flags or urgent concerns"],
  "negotiation_points": ["Top 3-5 points to negotiate before signing"]
}`;

  return { systemPrompt, userPrompt };
}

/** Robustly extract JSON from LLM response (handles stray text/fences). */
function parseLlmJson(raw) {
  const clean = raw.replace(/```(?:json)?/g, "").trim().replace(/`+$/, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
  }

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
    }
  }

  return {
    error: "Could not parse AI response as JSON.",
    raw_response: raw.slice(0, 2000),
  };
}

async function cleanupFile(filepath) {
  try {
    await fs.unlink(filepath);
  } catch {
    // File may already be gone — ignore
  }
}

// ─── ROUTES ────────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await resp.json();
    const models = (data.models || []).map((m) => m.name);
    res.json({ status: "ok", ollama: "connected", available_models: models });
  } catch (err) {
    res.status(200).json({ status: "ok", ollama: "unreachable", error: err.message });
  }
});

/**
 * Accepts a contract file (PDF / DOCX / TXT) via multipart/form-data.
 * Field name: 'contract'
 * Returns a structured JSON risk analysis.
 */
app.post("/analyze", (req, res) => {
  upload.single("contract")(req, res, async (uploadErr) => {
    if (uploadErr) {
      const status = uploadErr instanceof multer.MulterError ? 400 : 400;
      return res.status(status).json({ error: uploadErr.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded. Use field name 'contract'." });
    }

    const filepath = req.file.path;
    const originalName = req.file.originalname;
    const ext = originalName.split(".").pop().toLowerCase();

    try {
      const contractText = await extractText(filepath, ext);
      if (!contractText.trim()) {
        return res
          .status(422)
          .json({ error: "Could not extract text from the file. Is it a scanned PDF?" });
      }
      const { systemPrompt, userPrompt } = buildRiskAnalysisPrompt(contractText);
      const rawResponse = await queryOllama(userPrompt, systemPrompt);

      
      const analysis = parseLlmJson(rawResponse);

     
      analysis.filename = originalName;
      analysis.characters_analyzed = contractText.length;

      res.json(analysis);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || "Unexpected error" });
    } finally {
     
      await cleanupFile(filepath);
    }
  });
});


app.get("/models", async (req, res) => {
  try {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await resp.json();
    const models = (data.models || []).map((m) => m.name);
    res.json({ models });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});


app.post("/set-model", (req, res) => {
  const { model } = req.body || {};
  if (!model) {
    return res.status(400).json({ error: "Provide { 'model': 'model_name' }" });
  }
  OLLAMA_MODEL = model;
  res.json({ message: `Model switched to ${OLLAMA_MODEL}` });
});

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Contract Risk Analyzer running at http://localhost:${PORT}`);
  console.log(`🤖 Using Ollama model: ${OLLAMA_MODEL}`);
  console.log(`📁 Upload folder: ${UPLOAD_FOLDER}`);
}) ;