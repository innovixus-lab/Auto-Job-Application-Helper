// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import mammoth from 'mammoth';

export interface WorkEntry {
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  graduationYear: string;
}

export interface ProjectEntry {
  name: string;
  techStack: string;
  description: string;
}

export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  address: string;
  skills: string[];
  workExperience: WorkEntry[];
  education: EducationEntry[];
  certifications: string[];
  projects: ProjectEntry[];
  // Enhanced fields
  degree: string[];
  noOfPages: number;
  experienceLevel: 'Fresher' | 'Intermediate' | 'Experienced' | 'NA';
  resumeScore: number;
  predictedField: string;
  recommendedSkills: string[];
  sectionFlags: {
    hasObjective: boolean;
    hasEducation: boolean;
    hasExperience: boolean;
    hasInternships: boolean;
    hasSkills: boolean;
    hasHobbies: boolean;
    hasInterests: boolean;
    hasAchievements: boolean;
    hasCertifications: boolean;
    hasProjects: boolean;
  };
}

// ── Skill keyword maps (from reference analyzer) ─────────────────────────────

const DS_KEYWORDS = ['tensorflow','keras','pytorch','machine learning','deep learning','flask','streamlit','scikit-learn','pandas','numpy','matplotlib','data science','nlp','computer vision'];
const WEB_KEYWORDS = ['react','django','node js','nodejs','react js','php','laravel','magento','wordpress','javascript','angular js','c#','asp.net','flask','vue','next.js','html','css','typescript'];
const ANDROID_KEYWORDS = ['android','android development','flutter','kotlin','xml','kivy','java','gradle'];
const IOS_KEYWORDS = ['ios','ios development','swift','cocoa','cocoa touch','xcode','objective-c'];
const UIUX_KEYWORDS = ['ux','adobe xd','figma','zeplin','balsamiq','ui','prototyping','wireframes','adobe photoshop','illustrator','after effects','user research','user experience'];

const FIELD_RECOMMENDED_SKILLS: Record<string, string[]> = {
  'Data Science': ['Data Visualization','Predictive Analysis','Statistical Modeling','Data Mining','Clustering & Classification','Data Analytics','Quantitative Analysis','Web Scraping','ML Algorithms','Keras','Pytorch','Probability','Scikit-learn','Tensorflow','Flask','Streamlit'],
  'Web Development': ['React','Django','Node JS','React JS','PHP','Laravel','Magento','WordPress','JavaScript','Angular JS','C#','Flask','SDK'],
  'Android Development': ['Android','Android Development','Flutter','Kotlin','XML','Java','Kivy','GIT','SDK','SQLite'],
  'IOS Development': ['IOS','IOS Development','Swift','Cocoa','Cocoa Touch','Xcode','Objective-C','SQLite','Plist','StoreKit','UI-Kit','AV Foundation','Auto-Layout'],
  'UI-UX Development': ['UI','User Experience','Adobe XD','Figma','Zeplin','Balsamiq','Prototyping','Wireframes','Adobe Photoshop','Editing','Illustrator','After Effects','Premier Pro','Indesign','Wireframe','User Research'],
};

// ── Section detection helpers ─────────────────────────────────────────────────

function hasSection(text: string, ...keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function computeResumeScore(text: string): { score: number; flags: ParsedResume['sectionFlags'] } {
  const flags: ParsedResume['sectionFlags'] = {
    hasObjective:      hasSection(text, 'Objective', 'OBJECTIVE', 'Summary', 'SUMMARY'),
    hasEducation:      hasSection(text, 'Education', 'EDUCATION', 'School', 'College'),
    hasExperience:     hasSection(text, 'EXPERIENCE', 'Experience', 'WORK EXPERIENCE', 'Work Experience'),
    hasInternships:    hasSection(text, 'INTERNSHIP', 'INTERNSHIPS', 'Internship', 'Internships'),
    hasSkills:         hasSection(text, 'SKILLS', 'SKILL', 'Skills', 'Skill'),
    hasHobbies:        hasSection(text, 'HOBBIES', 'Hobbies'),
    hasInterests:      hasSection(text, 'INTERESTS', 'Interests'),
    hasAchievements:   hasSection(text, 'ACHIEVEMENTS', 'Achievements'),
    hasCertifications: hasSection(text, 'CERTIFICATIONS', 'Certifications', 'Certification'),
    hasProjects:       hasSection(text, 'PROJECTS', 'PROJECT', 'Projects', 'Project'),
  };

  let score = 0;
  if (flags.hasObjective)      score += 6;
  if (flags.hasEducation)      score += 12;
  if (flags.hasExperience)     score += 16;
  if (flags.hasInternships)    score += 6;
  if (flags.hasSkills)         score += 7;
  if (flags.hasHobbies)        score += 4;
  if (flags.hasInterests)      score += 5;
  if (flags.hasAchievements)   score += 13;
  if (flags.hasCertifications) score += 12;
  if (flags.hasProjects)       score += 19;

  return { score, flags };
}

function detectExperienceLevel(text: string, noOfPages: number): ParsedResume['experienceLevel'] {
  if (noOfPages < 1) return 'NA';
  if (hasSection(text, 'INTERNSHIP', 'INTERNSHIPS', 'Internship', 'Internships')) return 'Intermediate';
  if (hasSection(text, 'EXPERIENCE', 'WORK EXPERIENCE', 'Experience', 'Work Experience')) return 'Experienced';
  return 'Fresher';
}

function predictField(skills: string[]): { field: string; recommendedSkills: string[] } {
  const lower = skills.map((s) => s.toLowerCase());
  for (const kw of DS_KEYWORDS)      { if (lower.some((s) => s.includes(kw))) return { field: 'Data Science',       recommendedSkills: FIELD_RECOMMENDED_SKILLS['Data Science'] }; }
  for (const kw of WEB_KEYWORDS)     { if (lower.some((s) => s.includes(kw))) return { field: 'Web Development',    recommendedSkills: FIELD_RECOMMENDED_SKILLS['Web Development'] }; }
  for (const kw of ANDROID_KEYWORDS) { if (lower.some((s) => s.includes(kw))) return { field: 'Android Development',recommendedSkills: FIELD_RECOMMENDED_SKILLS['Android Development'] }; }
  for (const kw of IOS_KEYWORDS)     { if (lower.some((s) => s.includes(kw))) return { field: 'IOS Development',    recommendedSkills: FIELD_RECOMMENDED_SKILLS['IOS Development'] }; }
  for (const kw of UIUX_KEYWORDS)    { if (lower.some((s) => s.includes(kw))) return { field: 'UI-UX Development',  recommendedSkills: FIELD_RECOMMENDED_SKILLS['UI-UX Development'] }; }
  return { field: 'NA', recommendedSkills: [] };
}

// ── Degree extraction ─────────────────────────────────────────────────────────

const DEGREE_PATTERNS = [
  /\b(B\.?Tech|Bachelor of Technology)\b/gi,
  /\b(M\.?Tech|Master of Technology)\b/gi,
  /\b(B\.?E\.?|Bachelor of Engineering)\b/gi,
  /\b(M\.?E\.?|Master of Engineering)\b/gi,
  /\b(B\.?Sc\.?|Bachelor of Science)\b/gi,
  /\b(M\.?Sc\.?|Master of Science)\b/gi,
  /\b(B\.?C\.?A\.?|Bachelor of Computer Applications)\b/gi,
  /\b(M\.?C\.?A\.?|Master of Computer Applications)\b/gi,
  /\b(B\.?B\.?A\.?|Bachelor of Business Administration)\b/gi,
  /\b(M\.?B\.?A\.?|Master of Business Administration)\b/gi,
  /\b(Ph\.?D\.?|Doctor of Philosophy)\b/gi,
  /\b(B\.?A\.?|Bachelor of Arts)\b/gi,
  /\b(M\.?A\.?|Master of Arts)\b/gi,
  /\b(High School Diploma|GED|Associate Degree|Associate of Science|Associate of Arts)\b/gi,
];

function extractDegrees(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of DEGREE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) matches.forEach((m) => found.add(m.trim()));
  }
  return Array.from(found);
}

// ── Skills extraction ─────────────────────────────────────────────────────────

function extractSkills(text: string): string[] {
  const skills: string[] = [];

  // 1. Try to find a Skills section block — handles multi-line, bullet, comma, pipe separated
  const sectionMatch = text.match(
    /(?:skills?|technical skills?|core competencies|technologies|tools)[:\s]*\n([\s\S]*?)(?:\n{2,}|\n(?:education|experience|work|employment|projects?|certifications?|achievements?|awards?|interests?|hobbies?|references?|summary|objective|profile)\b)/i
  );
  if (sectionMatch) {
    const block = sectionMatch[1];
    block
      .split(/[,\n•|\-–·▪▸►✓✔]/)
      .map((s) => s.replace(/^\s*[-•*▪►✓✔]\s*/, '').trim())
      .filter((s) => s.length > 1 && s.length < 60)
      .forEach((s) => skills.push(s));
  }

  // 2. Scan full text for known tech keywords regardless of section
  const allKeywords = [...DS_KEYWORDS, ...WEB_KEYWORDS, ...ANDROID_KEYWORDS, ...IOS_KEYWORDS, ...UIUX_KEYWORDS];
  const lowerText = text.toLowerCase();
  for (const kw of allKeywords) {
    if (lowerText.includes(kw)) {
      const formatted = kw.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!skills.map((s) => s.toLowerCase()).includes(kw)) {
        skills.push(formatted);
      }
    }
  }

  return [...new Set(skills.filter((s) => s.length > 0))];
}

// ── Work experience extraction ────────────────────────────────────────────────

function extractWorkExperience(text: string): WorkEntry[] {
  const entries: WorkEntry[] = [];

  // Match section with flexible heading variants
  const sectionMatch = text.match(
    /(?:work experience|professional experience|employment history|experience)[:\s]*\n([\s\S]*?)(?:\n{2,}(?:education|skills?|projects?|certifications?|achievements?|awards?|interests?|hobbies?|references?|summary|objective|profile)\b|$)/i
  );
  if (!sectionMatch) return entries;

  const block = sectionMatch[1];
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Patterns for date ranges: "Jan 2020 – Mar 2022", "2019 - Present", "2018–2020"
  const datePattern = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}\s*[-–—]\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}\s*[-–—]\s*(?:present|current|now)/i;

  let current: Partial<WorkEntry> | null = null;

  const flush = () => {
    if (current && current.title) {
      entries.push({
        title: current.title,
        company: current.company ?? '',
        startDate: current.startDate ?? '',
        endDate: current.endDate ?? null,
        description: (current.description ?? '').trim(),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      // Date line — parse start/end
      const parts = dateMatch[0].split(/[-–—]/);
      const start = parts[0].trim();
      const end = parts[1]?.trim() ?? null;
      const isPresent = end && /present|current|now/i.test(end);

      if (current && current.title) {
        // Update dates on existing entry if title already set
        current.startDate = start;
        current.endDate = isPresent ? null : (end ?? null);
      } else {
        flush();
        current = { startDate: start, endDate: isPresent ? null : (end ?? null), description: '' };
      }
    } else if (!current) {
      // First non-date line starts a new entry
      current = { title: line, description: '' };
    } else if (!current.title) {
      current.title = line;
    } else if (!current.company && !/^[-•*▪►]/.test(line)) {
      current.company = line;
    } else {
      // Bullet or description line
      const cleaned = line.replace(/^[-•*▪►✓✔]\s*/, '');
      current.description = ((current.description ?? '') + ' ' + cleaned).trim();
    }
  }
  flush();

  return entries;
}

// ── Education extraction ──────────────────────────────────────────────────────

function extractEducation(text: string): EducationEntry[] {
  const entries: EducationEntry[] = [];

  const eduSectionMatch = text.match(
    /(?:education|academic background|qualifications?)[:\s]*\n([\s\S]*?)(?:\n{2,}(?:experience|work|employment|skills?|projects?|certifications?|achievements?|awards?|interests?|hobbies?|references?)\b|$)/i
  );
  if (!eduSectionMatch) return entries;

  const block = eduSectionMatch[1];
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const yearPattern = /\b(19|20)\d{2}\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const degrees = extractDegrees(line);

    if (degrees.length > 0) {
      // Look ahead for institution name (next non-empty line that isn't a year/date)
      let institution = '';
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (!yearPattern.test(lines[j]) && lines[j].length > 2) {
          institution = lines[j];
          break;
        }
      }
      const yearMatch = (line + ' ' + institution + ' ' + (lines[i + 2] ?? '')).match(yearPattern);
      entries.push({ degree: degrees[0], institution, graduationYear: yearMatch ? yearMatch[0] : '' });
    } else if (/university|college|institute|school|academy/i.test(line) && entries.length === 0) {
      // Institution line without a degree line above — create a bare entry
      const yearMatch = line.match(yearPattern);
      entries.push({ degree: '', institution: line, graduationYear: yearMatch ? yearMatch[0] : '' });
    }
  }

  return entries;
}

// ── Certifications extraction ─────────────────────────────────────────────────

function extractCertifications(text: string): string[] {
  const certMatch = text.match(
    /(?:certifications?|licenses?|credentials?|courses?)[:\s]*\n([\s\S]*?)(?:\n{2,}(?:experience|work|employment|skills?|projects?|education|achievements?|awards?|interests?|hobbies?|references?)\b|$)/i
  );
  if (!certMatch) return [];
  return certMatch[1]
    .split('\n')
    .map((l) => l.replace(/^[-•*▪►✓✔]\s*/, '').trim())
    .filter((l) => l.length > 2 && l.length < 120);
}

// ── Projects extraction ───────────────────────────────────────────────────────

function extractProjects(text: string): ProjectEntry[] {
  const entries: ProjectEntry[] = [];

  const sectionMatch = text.match(
    /(?:projects?|personal projects?|academic projects?|side projects?)[:\s]*\n([\s\S]*?)(?:\n{2,}(?:experience|work|employment|skills?|education|certifications?|achievements?|awards?|interests?|hobbies?|references?|core competencies)\b|$)/i
  );
  if (!sectionMatch) return entries;

  const block = sectionMatch[1];
  const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let current: Partial<ProjectEntry> | null = null;

  const flush = () => {
    if (current?.name) {
      entries.push({
        name: current.name,
        techStack: current.techStack ?? '',
        description: (current.description ?? '').trim(),
      });
    }
    current = null;
  };

  for (const line of lines) {
    // Lines like "Project Name | Tech Stack | Year" or "Project Name – Tech Stack"
    const headerMatch = line.match(/^(.+?)\s*[|–\-]\s*(.+?)(?:\s*[|–\-]\s*\d{4})?$/);
    const isBullet = /^[-•*▪►✓✔]/.test(line);

    if (!isBullet && headerMatch && line.length < 120) {
      flush();
      current = {
        name: headerMatch[1].replace(/\*\*/g, '').trim(),
        techStack: headerMatch[2].trim(),
        description: '',
      };
    } else if (!isBullet && !current) {
      // Plain project name line
      flush();
      current = { name: line.replace(/\*\*/g, '').trim(), techStack: '', description: '' };
    } else if (current) {
      const cleaned = line.replace(/^[-•*▪►✓✔]\s*/, '');
      current.description = ((current.description ?? '') + ' ' + cleaned).trim();
    }
  }
  flush();

  return entries;
}

// ── Main parse function ───────────────────────────────────────────────────────

function parseText(text: string, noOfPages = 1): ParsedResume {
  // Normalise line endings and collapse excessive blank lines
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  const lines = normalised.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Name: first non-empty line that isn't an email/phone/URL and is reasonably short
  const nameLine = lines.find((l) =>
    l.length > 1 && l.length < 60 &&
    !l.includes('@') &&
    !/^[\d\s\+\-\(\)]+$/.test(l) &&
    !/^https?:\/\//i.test(l)
  ) ?? '';

  const emailMatch = normalised.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // Phone: handles +91, (123) 456-7890, 123.456.7890, etc.
  const phoneMatch = normalised.match(/(?:\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';

  const skills = extractSkills(normalised);
  const workExperience = extractWorkExperience(normalised);
  const education = extractEducation(normalised);
  const certifications = extractCertifications(normalised);
  const projects = extractProjects(normalised);
  const degree = extractDegrees(normalised);
  const experienceLevel = detectExperienceLevel(normalised, noOfPages);
  const { score: resumeScore, flags: sectionFlags } = computeResumeScore(normalised);
  const { field: predictedField, recommendedSkills } = predictField(skills);

  return {
    name: nameLine,
    email,
    phone,
    address: '',
    skills,
    workExperience,
    education,
    certifications,
    projects,
    degree,
    noOfPages,
    experienceLevel,
    resumeScore,
    predictedField,
    recommendedSkills,
    sectionFlags,
  };
}

export async function parsePDF(buffer: Buffer): Promise<ParsedResume> {
  const result = await pdfParse(buffer);
  return parseText(result.text, result.numpages ?? 1);
}

export async function parseDOCX(buffer: Buffer): Promise<ParsedResume> {
  const result = await mammoth.extractRawText({ buffer });
  return parseText(result.value, 1);
}
