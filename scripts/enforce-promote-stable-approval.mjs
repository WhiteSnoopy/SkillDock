import fs from 'node:fs';

const prTitle = process.env.PR_TITLE || '';
if (!prTitle.startsWith('promote-stable:')) {
  console.log('Not a promote-stable PR. Skip.');
  process.exit(0);
}

const prAuthor = process.env.PR_AUTHOR;
const reviewsJson = process.env.PR_REVIEWS_JSON;
const supervisors = JSON.parse(fs.readFileSync('.github/supervisors.json', 'utf8')).supervisors || [];
const owners = JSON.parse(fs.readFileSync('.github/skill-owners.json', 'utf8')).owners || {};

const match = prTitle.match(/^promote-stable:\s*([a-z0-9-]+)@/);
if (!match) {
  throw new Error('Invalid promote-stable PR title format');
}

const skillId = match[1];
const expectedOwner = owners[skillId];
if (!expectedOwner) {
  throw new Error(`No owner configured for ${skillId}`);
}

if (prAuthor !== expectedOwner) {
  throw new Error(`promote-stable PR must be opened by owner ${expectedOwner}`);
}

const reviews = JSON.parse(reviewsJson || '[]');
const supervisorApproved = reviews.some(
  (r) => r.state === 'APPROVED' && r.user && supervisors.includes(r.user.login)
);
if (!supervisorApproved) {
  throw new Error('promote-stable PR requires supervisor approval');
}

console.log('Promote-stable owner/supervisor checks passed.');
