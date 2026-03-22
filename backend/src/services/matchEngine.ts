export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  workExperience: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }>;
  education: Array<{ degree: string; institution: string }>;
  certifications: string[];
}

export interface JobDescription {
  platform: string;
  sourceUrl: string;
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  body: string | null;
}

export interface MatchResult {
  score: number;
  missingKeywords: string[];
}

/** Tokenize text into lowercase words, stripping punctuation */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Build a set of unique tokens from an array of strings */
function tokenSet(items: string[]): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    for (const token of tokenize(item)) {
      result.add(token);
    }
  }
  return result;
}

/** Jaccard-like overlap ratio between two sets */
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (b.size === 0) return 0;
  let matches = 0;
  for (const token of b) {
    if (a.has(token)) matches++;
  }
  return matches / b.size;
}

/** Extract years of experience from work experience entries */
function extractYearsOfExperience(
  workExperience: ParsedResume['workExperience']
): number {
  let totalMonths = 0;
  const now = new Date();

  for (const entry of workExperience) {
    try {
      const start = new Date(entry.startDate);
      const end = entry.endDate ? new Date(entry.endDate) : now;
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
        const months =
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth());
        totalMonths += months;
      }
    } catch {
      // skip unparseable dates
    }
  }

  return totalMonths / 12;
}

/** Extract years required from JD body text (e.g. "5+ years", "3 years") */
function extractRequiredYears(body: string): number {
  const match = body.match(/(\d+)\+?\s*years?/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Compute match score between a parsed resume and a job description.
 * Weights: skills 40%, job titles 30%, experience years 20%, keywords 10%.
 * Score is always an integer in [0, 100].
 */
export function computeMatch(
  resume: ParsedResume,
  jd: JobDescription
): MatchResult {
  const jdBody = jd.body ?? '';
  const jdTitle = jd.title ?? '';

  // --- Skills score (40%) ---
  const resumeSkillTokens = tokenSet(resume.skills);
  const jdBodyTokens = tokenSet([jdBody]);
  const jdSkillTokens = new Set<string>();
  for (const token of jdBodyTokens) {
    if (resumeSkillTokens.has(token) || jdBodyTokens.has(token)) {
      jdSkillTokens.add(token);
    }
  }
  // Skills: overlap of resume skills against JD body tokens
  const skillsScore = overlapRatio(jdBodyTokens, resumeSkillTokens);

  // --- Job titles score (30%) ---
  const resumeTitles = resume.workExperience.map((e) => e.title);
  const resumeTitleTokens = tokenSet(resumeTitles);
  const jdTitleTokens = tokenSet([jdTitle, jdBody]);
  const titlesScore = overlapRatio(resumeTitleTokens, tokenSet([jdTitle]));

  // --- Experience years score (20%) ---
  const resumeYears = extractYearsOfExperience(resume.workExperience);
  const requiredYears = extractRequiredYears(jdBody);
  let yearsScore: number;
  if (requiredYears === 0) {
    yearsScore = resumeYears > 0 ? 1 : 0.5;
  } else {
    yearsScore = Math.min(resumeYears / requiredYears, 1);
  }

  // --- Keywords score (10%) ---
  const resumeAllTokens = tokenSet([
    resume.name,
    resume.email,
    ...resume.skills,
    ...resume.workExperience.map((e) => `${e.title} ${e.company} ${e.description}`),
    ...resume.education.map((e) => `${e.degree} ${e.institution}`),
    ...resume.certifications,
  ]);
  const jdKeywords = tokenSet([jdBody, jdTitle]);
  const keywordsScore = overlapRatio(resumeAllTokens, jdKeywords);

  // --- Weighted total ---
  const raw =
    skillsScore * 0.4 +
    titlesScore * 0.3 +
    yearsScore * 0.2 +
    keywordsScore * 0.1;

  const score = Math.min(100, Math.max(0, Math.round(raw * 100)));

  // --- Missing keywords (6.3) ---
  const missingKeywords = extractMissingKeywords(resume, jd);

  return { score, missingKeywords };
}

/**
 * Extract top N JD keywords absent from resume text.
 * Default N = 10.
 */
export function extractMissingKeywords(
  resume: ParsedResume,
  jd: JobDescription,
  topN = 10
): string[] {
  const jdBody = jd.body ?? '';
  const jdTitle = jd.title ?? '';

  const resumeAllTokens = tokenSet([
    resume.name,
    resume.email,
    ...resume.skills,
    ...resume.workExperience.map((e) => `${e.title} ${e.company} ${e.description}`),
    ...resume.education.map((e) => `${e.degree} ${e.institution}`),
    ...resume.certifications,
  ]);

  // Collect all JD tokens not in resume
  const jdTokens = tokenize(`${jdTitle} ${jdBody}`);

  // Count frequency of each missing token
  const freq = new Map<string, number>();
  for (const token of jdTokens) {
    if (!resumeAllTokens.has(token)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  // Sort by frequency descending, return top N
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([token]) => token);
}

/**
 * Map a score to a color indicator.
 * red: 0–39, yellow: 40–69, green: 70–100
 */
export function scoreToColor(score: number): 'red' | 'yellow' | 'green' {
  if (score <= 39) return 'red';
  if (score <= 69) return 'yellow';
  return 'green';
}
