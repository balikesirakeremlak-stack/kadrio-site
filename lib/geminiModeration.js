const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const PROCESSING_POLL_MS = 2000;
const MAX_PROCESSING_POLLS = 30;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseVerdict(text) {
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '');
    return {
      safe: parsed.safe === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : ''
    };
  } catch (error) {
    return null;
  }
}

async function moderateVideo(filePath, metadata = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { enabled: false, safe: true, reason: 'AI moderation disabled' };

  const ai = new GoogleGenAI({ apiKey });
  const uploadedFile = await ai.files.upload({
    file: filePath,
    config: { mimeType: metadata.mimeType || 'video/mp4' }
  });

  try {
    let file = uploadedFile;
    for (let poll = 0; poll < MAX_PROCESSING_POLLS && file.state === 'PROCESSING'; poll += 1) {
      await delay(PROCESSING_POLL_MS);
      file = await ai.files.get({ name: file.name });
    }

    if (file.state !== 'ACTIVE' || !file.uri) {
      throw new Error(`Gemini file processing failed: ${file.state || 'unknown state'}`);
    }

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: [{
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: file.uri,
              mimeType: file.mimeType || metadata.mimeType || 'video/mp4'
            }
          },
          {
            text: `Moderate this uploaded social video for publication. Reject sexual content, nudity, graphic violence, gore, weapons used for harm, illegal activity, hateful abuse, or dangerous instructions. Return JSON only: {"safe":true|false,"reason":"brief reason"}. Metadata: ${JSON.stringify(metadata)}`
          }
        ]
      }]
    });

    const verdict = parseVerdict(response.text || '');
    if (!verdict) throw new Error('Gemini returned an invalid moderation verdict');
    return { enabled: true, ...verdict };
  } finally {
    if (uploadedFile.name) {
      await ai.files.delete({ name: uploadedFile.name }).catch(() => {});
    }
  }
}

module.exports = { moderateVideo };
