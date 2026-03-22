// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
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

export interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  address: string;
  skills: string[];
  workExperience: WorkEntry[];
  education: EducationEntry[];
  certifications: string[];
}

function parseText(text: string): ParsedResume {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // name: first non-empty line
  const name = lines[0] ?? '';

  // email
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : '';

  // phone: digits, dashes, parens, spaces, dots, plus
  const phoneMatch = text.match(/[\+\(]?[\d][\d\s\-\(\)\.]{7,}[\d]/);
  const phone = phoneMatch ? phoneMatch[0].trim() : '';

  // address: not extracted in MVP
  const address = '';

  // skills: look for a "Skills" section header
  const skills: string[] = [];
  const skillsSectionMatch = text.match(/skills[:\s]*\n([\s\S]*?)(?:\n\n|\n[A-Z][a-zA-Z ]+:|\n[A-Z][a-zA-Z ]+\n|$)/i);
  if (skillsSectionMatch) {
    const skillsBlock = skillsSectionMatch[1];
    const items = skillsBlock
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    skills.push(...items);
  }

  // workExperience: return empty array per MVP scope
  const workExperience: WorkEntry[] = [];

  // education: return empty array per MVP scope
  const education: EducationEntry[] = [];

  // certifications: return empty array per MVP scope
  const certifications: string[] = [];

  return { name, email, phone, address, skills, workExperience, education, certifications };
}

export async function parsePDF(buffer: Buffer): Promise<ParsedResume> {
  const result = await pdfParse(buffer);
  return parseText(result.text);
}

export async function parseDOCX(buffer: Buffer): Promise<ParsedResume> {
  const result = await mammoth.extractRawText({ buffer });
  return parseText(result.value);
}
