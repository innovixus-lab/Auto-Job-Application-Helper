import OpenAI from 'openai';
import type { ParsedResume, JobDescription } from './matchEngine';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY ?? '',
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return _openai;
}

export class AIServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export interface CoverLetterResult {
  coverLetterText: string;
}

/**
 * Generate a professional cover letter using OpenAI Chat Completions.
 * The letter has three paragraphs:
 *   1. Opening — references the specific role and company.
 *   2. Body — highlights relevant experience and skills.
 *   3. Closing — includes a call to action.
 */
export async function generateCoverLetter(
  resume: ParsedResume,
  jd: JobDescription
): Promise<CoverLetterResult> {
  const role = jd.title ?? 'the advertised position';
  const company = jd.company ?? 'your company';
  const jdBody = jd.body ?? '';

  const systemPrompt = `You are an expert career coach and professional writer.
Write a concise, compelling cover letter in exactly three paragraphs tailored to the SPECIFIC job below:
1. Opening: Express enthusiasm for "${role}" at "${company}" — reference something specific about this role or company.
2. Body: Match the candidate's most relevant experience and skills to the SPECIFIC requirements mentioned in the job description. Be concrete.
3. Closing: Reiterate fit for THIS specific role, invite further conversation, clear call to action.
Return only the cover letter text. No headers, no placeholders, no extra commentary.`;

  const userPrompt = `JOB DESCRIPTION:
Role: ${role} at ${company}
${jdBody}

CANDIDATE:
Name: ${resume.name}
Skills: ${(resume.skills || []).join(', ')}
Work Experience:
${(resume.workExperience || [])
  .map((e) => `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate ?? 'Present'}): ${e.description}`)
  .join('\n') || 'Not provided'}
Education:
${(resume.education || []).map((e) => `- ${e.degree} from ${e.institution}`).join('\n') || 'Not provided'}
Certifications: ${(resume.certifications || []).join(', ') || 'None'}

Write the cover letter now, making sure it directly addresses the requirements of this specific job.`;

  let completion;
  try {
    completion = await getOpenAI().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 600,
    });
  } catch (err) {
    throw new AIServiceError('OpenAI API call failed', err);
  }

  const coverLetterText = completion.choices[0]?.message?.content?.trim() ?? '';
  return { coverLetterText };
}

export interface AnswerResult {
  answers: Array<{ question: string; answer: string }>;
}

/**
 * Generate tailored answers for a list of application questions using OpenAI Chat Completions.
 * Supports motivation, behavioral, and competency question types.
 */
export async function generateAnswers(
  resume: ParsedResume,
  jd: JobDescription,
  questions: string[]
): Promise<AnswerResult> {
  const role = jd.title ?? 'the advertised position';
  const company = jd.company ?? 'your company';
  const jdBody = jd.body ?? '';

  const systemPrompt = `You are an expert career coach helping a candidate answer job application questions.
The candidate is applying for: ${role} at ${company}.

CRITICAL INSTRUCTION: Each answer MUST be tailored to the SPECIFIC JOB REQUIREMENTS from the job description below. 
- First, identify what the job requires for each question.
- Then, show how the candidate's background meets THOSE SPECIFIC requirements.
- Do NOT give generic answers based only on the resume — always connect back to what THIS job needs.

Answer format per question type:
- Motivation ("Why this role/company?"): Reference specific aspects of THIS job/company, then connect to candidate's goals.
- Behavioral ("Tell me about a time..."): Use STAR method with a specific example from the candidate's experience that directly relates to a requirement of THIS job.
- Competency ("What are your strengths?"): Name skills that THIS job description explicitly asks for, backed by candidate's experience.
- General: 2-4 sentences, job-specific, concrete.

Return ONLY a valid JSON array: [{"question": "...", "answer": "..."}, ...]. No extra text.`;

  const userPrompt = `JOB DESCRIPTION FOR ${role.toUpperCase()} AT ${company.toUpperCase()}:
${jdBody || `Title: ${role}, Company: ${company}`}

---
CANDIDATE BACKGROUND (use to support answers, but always tie back to the job above):
Name: ${resume.name}
Skills: ${(resume.skills || []).join(', ')}
Work Experience:
${(resume.workExperience || [])
  .map((e) => `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate ?? 'Present'}): ${e.description}`)
  .join('\n') || 'Not provided'}
Education:
${(resume.education || []).map((e) => `- ${e.degree} from ${e.institution}`).join('\n') || 'Not provided'}

---
QUESTIONS TO ANSWER (tailor each answer to the job description above):
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return JSON array: [{"question": "...", "answer": "..."}, ...]`;

  let completion;
  try {
    completion = await getOpenAI().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });
  } catch (err) {
    throw new AIServiceError('OpenAI API call failed', err);
  }

  let answers: Array<{ question: string; answer: string }>;
  try {
    const raw = completion.choices[0]?.message?.content?.trim() ?? '[]';
    answers = JSON.parse(raw);
  } catch {
    throw new AIServiceError('Failed to parse AI response');
  }

  return { answers };
}
