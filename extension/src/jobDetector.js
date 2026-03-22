/**
 * JobDetector — detects whether the current URL is a supported job listing page.
 */

export class JobDetector {
  /**
   * @param {string} url
   * @returns {{ detected: boolean, platform: string | null }}
   */
  detect(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { detected: false, platform: null };
    }

    const { hostname, pathname, search } = parsed;

    // LinkedIn: linkedin.com + /jobs/view/ in path
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) {
      return { detected: true, platform: 'linkedin' };
    }

    // Indeed: indeed.com + /viewjob in path or search
    if (hostname.includes('indeed.com') && (pathname.includes('/viewjob') || search.includes('/viewjob'))) {
      return { detected: true, platform: 'indeed' };
    }

    // Greenhouse: boards.greenhouse.io + /*/jobs/* path pattern
    if (hostname === 'boards.greenhouse.io') {
      const parts = pathname.split('/').filter(Boolean);
      // expects: [org, 'jobs', jobId, ...]
      if (parts.length >= 3 && parts[1] === 'jobs') {
        return { detected: true, platform: 'greenhouse' };
      }
    }

    // Lever: jobs.lever.co + /*/*  path pattern
    if (hostname === 'jobs.lever.co') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { detected: true, platform: 'lever' };
      }
    }

    // Workday: *.myworkdayjobs.com
    if (hostname.endsWith('.myworkdayjobs.com')) {
      return { detected: true, platform: 'workday' };
    }

    // iCIMS: *.icims.com + /jobs/ in path
    if (hostname.endsWith('.icims.com') && pathname.includes('/jobs/')) {
      return { detected: true, platform: 'icims' };
    }

    return { detected: false, platform: null };
  }
}
