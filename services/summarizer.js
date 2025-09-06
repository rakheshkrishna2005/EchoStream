import dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
});

async function summarizeOnly(fullTranscript) {
  const prompt = `You are a precise audio summarizer. Summarize the FULL transcript in <= 8 sentences.
Return plain text only (no JSON, no code fences).

FULL_TRANSCRIPT:
${fullTranscript}`;
  try {
    const res = await model.generateContent(prompt);
    return (res.response.text() || "").trim();
  } catch (e) {
    console.error("gemini_summary_error", e);
    return "";
  }
}

async function topicsFromSummary(summary) {
  const prompt = `Given the audio summary below, list 3-8 topical tags as comma-separated values.
Plain text only. No quotes, no JSON, no code fences, no escape characters.

SUMMARY:
${summary}`;
  try {
    const res = await model.generateContent(prompt);
    const raw = (res.response.text() || "").trim();
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch (e) {
    console.error("gemini_topics_error", e);
    return [];
  }
}

async function actionItemsFromSummary(summary) {
  const prompt = `From the audio summary below, extract concrete action items as a comma-separated list of short imperative phrases.
Plain text only. No JSON, no code fences, no escape characters.

SUMMARY:
${summary}`;
  try {
    const res = await model.generateContent(prompt);
    const raw = (res.response.text() || "").trim();
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch (e) {
    console.error("gemini_action_items_error", e);
    return [];
  }
}

async function sentimentOnly(fullTranscript) {
  const prompt = `Return ONLY JSON with this exact shape and no extra text:
{"sentiment": {"label": "positive|neutral|negative", "score": 0.0}}
Score must be in [0,1]. No code fences.

FULL_TRANSCRIPT:
${fullTranscript}`;
  try {
    const res = await model.generateContent(prompt);
    let raw = (res.response.text() || "").trim();
    
    // Clean up common Gemini formatting issues
    raw = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    raw = raw.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    const parsed = JSON.parse(raw);
    if (parsed && parsed.sentiment && typeof parsed.sentiment.label === "string") {
      return parsed.sentiment;
    }
    return { label: "neutral", score: 0.5 };
  } catch (e) {
    console.error("gemini_sentiment_error", e);
    return { label: "neutral", score: 0.5 };
  }
}

export async function buildFinalInsights(fullTranscript) {
  try {
    const summary = await summarizeOnly(fullTranscript);
    const [topics, action_items, sentiment] = await Promise.all([
      topicsFromSummary(summary),
      actionItemsFromSummary(summary),
      sentimentOnly(fullTranscript),
    ]);

    return {
      summary,
      topics,
      action_items,
      sentiment,
    };
  } catch (err) {
    console.error("Gemini error:", err);
    return {
      summary: "",
      topics: [],
      action_items: [],
      sentiment: { label: "neutral", score: 0 },
    };
  }
}