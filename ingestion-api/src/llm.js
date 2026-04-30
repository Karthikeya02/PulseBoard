const provider = (process.env.LLM_PROVIDER || "mock").toLowerCase();
const model = process.env.LLM_MODEL || "gpt-4o-mini";

export async function summarizeRootCause({ service, cpu, memory, zScore, logLines }) {
  const prompt = buildPrompt(service, cpu, memory, zScore, logLines);

  try {
    if (provider === "openai") {
      return await callOpenAI(prompt, model);
    }

    if (provider === "anthropic") {
      return await callAnthropic(prompt, model);
    }

    if (provider === "gemini") {
      return await callGemini(prompt, model);
    }
  } catch (error) {
    console.error("LLM call failed", error);
  }

  return mockSummary(service, cpu, memory, logLines);
}

function buildPrompt(service, cpu, memory, zScore, logLines) {
  const lines = logLines && logLines.length > 0 ? logLines.join("\n") : "(no recent logs)";

  return [
    "You are an SRE assistant. Provide a single-sentence root-cause summary.",
    "Be concrete and mention the service and symptoms.",
    `Service: ${service}`,
    `CPU spike: ${cpu.toFixed(1)}% (z-score ${zScore.toFixed(2)})`,
    `Memory: ${memory.toFixed(1)}%`,
    "Recent logs:",
    lines
  ].join("\n");
}

async function callOpenAI(prompt, modelName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: "system", content: "You are a concise SRE assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 60,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  return content || "Spike likely linked to recent error patterns.";
}

async function callAnthropic(prompt, modelName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 60,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();
  return content || "Spike likely linked to recent error patterns.";
}

async function callGemini(prompt, modelName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 60
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return content || "Spike likely linked to recent error patterns.";
}

function mockSummary(service, cpu, memory, logLines) {
  const hint = logLines.find((line) => line.startsWith("ERROR")) || "No explicit errors found";
  return `${service} CPU spike (${cpu.toFixed(1)}%, mem ${memory.toFixed(1)}%) likely tied to: ${hint}.`;
}
