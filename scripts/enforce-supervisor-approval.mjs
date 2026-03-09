const reviewsJson = process.env.PR_REVIEWS_JSON;
const supervisorsJson = process.env.SUPERVISORS_JSON;
const prTitle = process.env.PR_TITLE || '';

if (!prTitle.startsWith('beta-release:')) {
  console.log('Not a beta-release PR, skipping supervisor enforcement.');
  process.exit(0);
}

if (!reviewsJson || !supervisorsJson) {
  throw new Error('Missing PR_REVIEWS_JSON or SUPERVISORS_JSON');
}

const reviews = JSON.parse(reviewsJson);
const supervisors = JSON.parse(supervisorsJson).supervisors || [];

const approvedBySupervisor = reviews.some(
  (review) =>
    review.state === 'APPROVED' &&
    review.user &&
    supervisors.includes(review.user.login)
);

if (!approvedBySupervisor) {
  throw new Error('beta-release PR requires supervisor approval');
}

console.log('Supervisor approval check passed.');
