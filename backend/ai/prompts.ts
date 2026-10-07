// The ONLY AI feature left in the app: given a crawled topic, Gemini describes
// what kind of image would fit the post and hands back copy-ready prompts the
// user can paste into any image tool. Gemini never writes the post and never
// generates images.

import type { ImageBrief } from '../../src/shared/types'

export function buildImageBriefPrompt(topic: string): string {
  return [
    'You are a visual director who writes copy-ready prompts for AI image tools.',
    `A creator is writing a manual post about this topic:\n"${topic}"`,
    '',
    'The house style is ONE thing: a clean, beginner-friendly EDUCATIONAL INFOGRAPHIC.',
    'Every prompt you write must teach the topic visually — real wording and simple',
    'diagrams ON the image (this is NOT text-free art). Follow the template below.',
    '',
    'Reply with ONLY a JSON object (no prose, no code fences) shaped exactly like:',
    '{',
    '  "visualDescription": "2-3 sentences: the teaching angle for this topic, the chosen layout, the color/mood, and why it fits a beginner audience.",',
    '  "prompts": ["prompt 1", "prompt 2", "prompt 3"]',
    '}',
    '',
    'Write 2-3 prompts. Each is ONE complete infographic brief as a single string',
    '(use \n for line breaks). Each must include, in this order:',
    '1. Open with: "Create a clean, beginner-friendly educational infographic about: <topic, phrased as a clear teaching question or comparison>".',
    '2. "Main teaching idea:" — 1-2 plain sentences explaining the core concept.',
    '3. A layout that fits the topic. For comparison topics use "Create a clear two-side comparison" with "LEFT SIDE:" and "RIGHT SIDE:" each showing a short heading, a one-line summary, a vertical list of actions joined by arrows (-> and down-arrow), and a concrete mini-example. For process topics use numbered step boxes joined by arrows. For myth-vs-fact use two contrasting panels.',
    '4. A simple bottom comparison row (two short labels side by side).',
    '5. "Add a final takeaway:" — one memorable equation-style line (X = ... / Y = ...).',
    '6. A "Small supporting line:" — one calm explanatory sentence.',
    '7. These exact closing constraints: "Keep everything extremely simple and beginner-friendly. Use a visual contrast between the ideas. Do not add company names, product logos, pricing, release dates, code snippets, hashtags, unrelated AI concepts, or technical jargon. Do not make the image look like an advertisement. Use only topic-related text and visuals. Make all text large, clean, readable, well-spaced, and easy for a beginner to understand."',
    '8. End with the format line: "Format: Instagram portrait post, 1080 x 1350 pixels (4:5 ratio)."',
    '',
    'Vary the layout/angle between prompts but keep every one in this style.',
    'All wording must be specific to THIS concrete topic, never generic tech art.',
    'IMPORTANT JSON safety: never use a double-quote character inside a prompt string —',
    'use single quotes for any in-image example wording — and keep each prompt on a',
    'logical line set joined by \n so the JSON stays strictly valid.',
    '',
    'STYLE REFERENCE (mimic this structure and tone, but for the actual topic):',
    '---',
    'Create a clean, beginner-friendly educational infographic about: AI Coding Assistant vs Coding Agent',
    'Main teaching idea: A coding assistant mainly helps you write code. A coding agent can take a coding task and work through multiple steps to complete it.',
    'Create a clear two-side comparison.',
    'LEFT SIDE: AI CODING ASSISTANT — You write the code -> AI helps you. Actions: Suggests code / Completes code / Explains code / Fixes a small error. Example: Developer: "Write a function to sort users" -> Assistant: suggests the code -> Developer: reviews and uses it.',
    'RIGHT SIDE: AI CODING AGENT — You give the task -> Agent works through it. Actions: Plans -> Reads the codebase -> Edits files -> Runs tests -> Finds errors -> Fixes problems -> Checks the result. Example: Developer: "Add user authentication" -> Agent: reads project -> plans -> edits -> runs tests -> fixes errors -> checks result -> Completed task.',
    'Bottom comparison: ASSISTANT = Helps you code  |  AGENT = Works on the task.',
    'Add a final takeaway: Assistant = suggests and supports; Agent = plans, acts, tests, and iterates.',
    'Small supporting line: The key difference is how much of the coding workflow the AI can handle on its own.',
    'Keep everything extremely simple and beginner-friendly. Use a visual contrast between the two workflows. Do not add company names, product logos, pricing, release dates, code snippets, hashtags, unrelated AI concepts, or technical jargon. Do not make the image look like an advertisement. Use only topic-related text and visuals. Make all text large, clean, readable, well-spaced, and easy for a beginner to understand.',
    'Format: Instagram portrait post, 1080 x 1350 pixels (4:5 ratio).'
  ].join('\n')
}

/** Pulls the first JSON object out of a model reply; small models love to
 *  wrap it in prose or code fences. Throws when nothing parseable is found. */
function extractJson(raw: string): any {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object in reply')
  return JSON.parse(body.slice(start, end + 1))
}

/** Parses the image-brief JSON, with a regex salvage path for slightly
 *  malformed replies (trailing commas, unescaped newlines). */
export function parseImageBrief(raw: string, topic: string): ImageBrief {
  let visualDescription = ''
  let prompts: string[] = []
  try {
    const obj = extractJson(raw)
    visualDescription = String(obj?.visualDescription ?? '').trim()
    if (Array.isArray(obj?.prompts)) prompts = obj.prompts.map((p: unknown) => String(p).trim()).filter(Boolean)
  } catch {
    // Salvage: grab the two fields by hand from the raw text.
    const vd = /"visualDescription"\s*:\s*"([\s\S]*?)"\s*,?\s*"/.exec(raw)
    visualDescription = vd ? vd[1].replace(/\\n/g, ' ').trim() : ''
    const pr = /"prompts"\s*:\s*\[([\s\S]*?)\]/.exec(raw)
    prompts = pr
      ? [...pr[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\n/g, ' ').trim()).filter(Boolean)
      : []
  }
  if (!visualDescription && !prompts.length) throw new Error('AI reply was not usable')
  return { topic, visualDescription, prompts: prompts.slice(0, 4) }
}
