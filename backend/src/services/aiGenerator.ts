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

export interface ResumeLatexResult {
  latexCode: string;
  missingKeywords: string[];
}

/**
 * Generate an ATS-optimised one-page resume as LaTeX source.
 * Steps:
 *   1. Extract missing keywords from the JD vs the resume.
 *   2. Rewrite bullet points to weave in those keywords naturally.
 *   3. Return the full LaTeX document string.
 */
export async function generateResumeLatex(
  resume: ParsedResume,
  jd: JobDescription,
  missingKeywords: string[]
): Promise<ResumeLatexResult> {
  const role    = jd.title   ?? 'the advertised position';
  const company = jd.company ?? 'the company';
  const jdBody  = jd.body    ?? '';

  const systemPrompt = `Act as a senior technical resume writer and LaTeX expert.
Generate a complete, compilable LaTeX resume that EXACTLY follows the template structure, packages, and custom commands shown below.
Tailor all content to the job description and candidate details provided.

RULES:
- Use ONLY the packages and commands defined in the template — do not add new ones
- Follow the exact section order: Heading → Education → Technical Skills → Professional Experience → Projects → Certifications → Additional Information
- Medium-length bullet points (1–2 lines), technical, practical, impact-driven
- No generic HR-style wording — every bullet must feel like real work
- Use strong action verbs: Developed, Implemented, Designed, Architected, Optimized, Automated, Built
- Naturally weave in ALL of the MISSING KEYWORDS provided
- ATS-friendly: the template already handles formatting — do not add tables, graphics, or tikz
- Additional Information section must include: Year of Graduation, Years of Experience, Work Location preference, Availability note (not part of any other interview process for this company)
- Return ONLY the raw LaTeX code — no markdown fences, no explanation

CRITICAL — BANNED BUZZWORDS (these words lower ATS scores and must NEVER appear in the resume):
The following overused, vague, or HR-cliché terms are banned. Replace them with specific, measurable, technical language:
- "synergy", "synergize", "synergistic"
- "leverage", "leveraged", "leveraging"
- "passionate", "passion", "enthusiastic", "enthusiasm"
- "rockstar", "ninja", "guru", "wizard", "unicorn"
- "thought leader", "thought leadership"
- "innovative", "innovation", "innovator"
- "disruptive", "disruption"
- "dynamic", "results-driven", "results-oriented"
- "self-starter", "go-getter", "team player"
- "detail-oriented", "detail-focused"
- "hardworking", "hard worker", "diligent"
- "proactive", "go-to person"
- "strategic thinker", "strategic thinking"
- "out-of-the-box", "think outside the box"
- "fast-paced environment", "fast-paced"
- "strong communication skills", "excellent communication"
- "interpersonal skills"
- "problem-solver", "problem-solving skills" (use specific examples instead)
- "multitasker", "multitasking"
- "motivated", "highly motivated", "self-motivated"
- "seasoned", "seasoned professional"
- "proven track record"
- "value-add", "value-added"
- "best-in-class", "world-class", "cutting-edge", "state-of-the-art"
- "game-changer", "game-changing"
- "holistic", "holistic approach"
- "ecosystem"
- "bandwidth" (when used metaphorically)
- "circle back", "deep dive", "move the needle", "low-hanging fruit"
- "stakeholder management" (describe the actual stakeholders and outcomes instead)

Instead of these banned words, write concrete bullet points with: specific technologies, measurable outcomes (%, $, time saved, scale), and real actions taken.

LATEX TEMPLATE TO FOLLOW EXACTLY:

%-------------------------
\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{fontawesome5}
\\usepackage[sfdefault]{roboto}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-6pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\\\textit{\\small#3} & \\textit{\\small #4} \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\begin{document}

% HEADING
\\begin{center}
\\textbf{\\Huge \\scshape CANDIDATE NAME} \\\\ \\vspace{4pt}
\\small \\faPhone\\ PHONE $|$ \\href{mailto:EMAIL}{\\faEnvelope\\ EMAIL} $|$ \\href{GITHUB}{\\faGithub\\ GITHUB_HANDLE} $|$ \\href{LINKEDIN}{\\faLinkedin\\ LINKEDIN_HANDLE} \\\\
\\small CITY, STATE, COUNTRY $|$ Willing to relocate to TARGET_LOCATION
\\end{center}

% EDUCATION
\\section{Education}
\\resumeSubHeadingListStart
  \\resumeSubheading{COLLEGE NAME}{LOCATION}{DEGREE, CGPA: X.XX/10.0}{YEAR -- YEAR}
  \\resumeItemListStart
    \\resumeItem{Year of Graduation: YEAR | Relevant Coursework: COURSE1, COURSE2, COURSE3}
  \\resumeItemListEnd
\\resumeSubHeadingListEnd

% TECHNICAL SKILLS
\\section{Technical Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{
  \\textbf{Programming}{: ...} \\\\
  \\textbf{Web Technologies}{: ...} \\\\
  \\textbf{Database}{: ...} \\\\
  \\textbf{Cloud \\& Integration}{: ...} \\\\
  \\textbf{AI \\& Automation}{: ...} \\\\
  \\textbf{Version Control \\& CI/CD}{: ...} \\\\
  \\textbf{Tools}{: ...}
}}
\\end{itemize}

% PROFESSIONAL EXPERIENCE
\\section{Professional Experience}
\\resumeSubHeadingListStart
  \\resumeSubheading{JOB TITLE}{DURATION}{COMPANY}{LOCATION}
  \\resumeItemListStart
    \\resumeItem{...}
    % 6-8 bullets for main role, 2-4 for smaller roles
  \\resumeItemListEnd
\\resumeSubHeadingListEnd

% PROJECTS
\\section{Projects}
\\resumeSubHeadingListStart
  \\resumeProjectHeading{\\textbf{PROJECT NAME} $|$ \\emph{TECH STACK}}{YEAR}
  \\resumeItemListStart
    \\resumeItem{...}
    % 4-6 bullets per project
  \\resumeItemListEnd
\\resumeSubHeadingListEnd

% CERTIFICATIONS
\\section{Certifications}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{CERT1 $|$ CERT2 $|$ CERT3}}
\\end{itemize}

% ADDITIONAL INFORMATION
\\section{Additional Information}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{
  \\textbf{Year of Graduation}{: YEAR} \\\\
  \\textbf{Years of Experience}{: X years} \\\\
  \\textbf{Work Location}{: Willing to relocate and work in TARGET_LOCATION} \\\\
  \\textbf{Availability}{: Not part of any other COMPANY interview process}
}}
\\end{itemize}

\\end{document}

Fill in all placeholders with the actual candidate data and job-tailored content. Return only the completed LaTeX.`;

  const userPrompt = `Job Description:
Role: ${role} at ${company}
${jdBody.slice(0, 2000)}

Missing Keywords to weave in: ${missingKeywords.join(', ')}

Candidate Details:
Name: ${resume.name}
Phone: ${resume.phone}
Email: ${resume.email}
Skills: ${(resume.skills || []).join(', ') || 'Not provided'}
Work Experience:
${(resume.workExperience || [])
  .map((e) => `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate ?? 'Present'})\n  ${e.description}`)
  .join('\n') || 'Not provided'}
Education:
${(resume.education || []).map((e) => `- ${e.degree} from ${e.institution}`).join('\n') || 'Not provided'}
Certifications: ${(resume.certifications || []).join(', ') || 'None'}
Projects:
${((resume as any).projects || []).map((p: any) => `- ${p.name}${p.techStack ? ` | ${p.techStack}` : ''}: ${p.description}`).join('\n') || 'Not provided'}

Generate a complete ATS-optimized LaTeX resume.`;

  let completion;
  try {
    completion = await getOpenAI().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      temperature: 0.4,
      max_tokens: 3500,
    });
  } catch (err) {
    throw new AIServiceError('OpenAI API call failed', err);
  }

  const raw = completion.choices[0]?.message?.content?.trim() ?? '';
  // Strip any accidental markdown fences the model may add
  const latexCode = raw.replace(/^```(?:latex)?\n?/i, '').replace(/\n?```$/i, '').trim();

  return { latexCode, missingKeywords };
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
