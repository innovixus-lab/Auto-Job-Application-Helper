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
Write a concise, compelling cover letter in exactly three paragraphs:
1. Opening paragraph: Express enthusiasm for the specific role ("${role}") at "${company}" and briefly state why you are a strong fit.
2. Body paragraph: Highlight the candidate's most relevant work experience and skills that match the job requirements.
3. Closing paragraph: Reiterate interest, invite further conversation, and include a clear call to action.
Return only the cover letter text with no additional commentary, headers, or sign-off placeholders.`;

  const userPrompt = `Job Description:
${jdBody}

Candidate Resume:
Name: ${resume.name}
Email: ${resume.email}
Skills: ${resume.skills.join(', ')}
Work Experience:
${resume.workExperience
  .map(
    (e) =>
      `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate ?? 'Present'}): ${e.description}`
  )
  .join('\n')}
Education:
${resume.education.map((e) => `- ${e.degree} from ${e.institution}`).join('\n')}
Certifications: ${resume.certifications.join(', ')}

Write the cover letter now.`;

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
For each question provided, write a concise, tailored answer (2-4 sentences) that:
- For motivation questions (e.g. "Why do you want this job?"): references the specific role and company, and connects to the candidate's goals.
- For behavioral questions (e.g. "Describe a challenge you overcame"): uses the STAR method (Situation, Task, Action, Result) drawing from the candidate's experience.
- For competency questions (e.g. "What are your strengths?"): highlights relevant skills and experience from the resume that match the job requirements.
Return ONLY a valid JSON array with objects having "question" and "answer" fields. No additional text.`;

  const userPrompt = `Job: ${role} at ${company}
Job Description:
${jdBody}

Candidate Resume:
Name: ${resume.name}
Skills: ${resume.skills.join(', ')}
Work Experience:
${resume.workExperience
  .map(
    (e) =>
      `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate ?? 'Present'}): ${e.description}`
  )
  .join('\n')}
Education:
${resume.education.map((e) => `- ${e.degree} from ${e.institution}`).join('\n')}

Questions to answer:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return a JSON array like: [{"question": "...", "answer": "..."}, ...]`;

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
