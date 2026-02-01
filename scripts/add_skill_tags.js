// Script to add skill_tag to all questions in questions.json
const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '..', 'content', 'questions.json');
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

// Skill tag definitions per topic
const SKILL_TAGS = {
  fractions: ['frac_same_denom', 'frac_unlike_denom', 'frac_equivalence'],
  negatives: ['neg_add', 'neg_sub', 'neg_mul'],
  'linear-equations': ['lin_one_step', 'lin_two_step'],
  'mixed-review': ['mixed']
};

// Helper functions to determine skill tag
function getFractionSkillTag(question) {
  const { prompt, difficulty } = question;
  
  // Check for equivalence patterns (unsimplified fractions like 2/6, 3/9, 4/10)
  const hasEquivalence = /[2-9]\/[2-9]|[0-9]{2}\/[0-9]{2}/.test(prompt) && 
    (/[24680]\/[246810]|[369]\/[369]|[5]\/[510]|[48]\/[1248]/.test(prompt) || difficulty >= 6);
  
  // Check if denominators are different (unlike denominators)
  const fractionMatches = prompt.match(/(\d+)\/(\d+)/g);
  if (fractionMatches && fractionMatches.length >= 2) {
    const denoms = fractionMatches.map(f => parseInt(f.split('/')[1]));
    const hasDifferentDenoms = new Set(denoms).size > 1;
    
    // Difficulty 6+ typically involves equivalence (simplifying)
    if (difficulty >= 6) {
      return 'frac_equivalence';
    }
    
    if (hasDifferentDenoms) {
      return 'frac_unlike_denom';
    }
    
    return 'frac_same_denom';
  }
  
  // Default based on difficulty
  if (difficulty <= 2) return 'frac_same_denom';
  if (difficulty <= 5) return 'frac_unlike_denom';
  return 'frac_equivalence';
}

function getNegativesSkillTag(question) {
  const { prompt, difficulty } = question;
  
  // Check for multiplication/division first (includes "*" or "/")
  if (/\*|\//.test(prompt)) {
    return 'neg_mul';
  }
  
  // Check for subtraction (look for "- (" or " - " pattern that's subtraction, not part of negative number)
  // A subtraction would be like "5 - (-3)" or "-4 - 6" (space before minus)
  if (/\s-\s|\s-\(|^-\d+\s*-\s/.test(prompt)) {
    return 'neg_sub';
  }
  
  // Default to addition
  return 'neg_add';
}

function getLinearEquationsSkillTag(question) {
  const { prompt, difficulty } = question;
  
  // Check for coefficient on x (like "2x", "3x", etc.) - indicates two-step
  if (/[2-9]x|[0-9]{2}x/.test(prompt)) {
    return 'lin_two_step';
  }
  
  // One-step equations: "x + N = M" or "x - N = M"
  return 'lin_one_step';
}

function getMixedReviewSkillTag(question) {
  // For mixed review, determine based on the underlying topic in the prompt
  const { prompt, topic: originalTopic } = question;
  
  // Try to infer the skill
  if (/fraction|\/\d+/.test(prompt.toLowerCase())) {
    return getFractionSkillTag(question);
  }
  if (/solve for x/i.test(prompt)) {
    return getLinearEquationsSkillTag(question);
  }
  if (/\(-\d+\)|negative|-\d+/i.test(prompt)) {
    return getNegativesSkillTag(question);
  }
  
  return 'mixed';
}

function getSkillTag(question) {
  const { topic } = question;
  
  switch (topic) {
    case 'fractions':
      return getFractionSkillTag(question);
    case 'negatives':
      return getNegativesSkillTag(question);
    case 'linear-equations':
      return getLinearEquationsSkillTag(question);
    case 'mixed-review':
      return getMixedReviewSkillTag(question);
    default:
      return 'unknown';
  }
}

// Process all questions
const updatedQuestions = {};
let counts = {};

for (const [topic, topicQuestions] of Object.entries(questions)) {
  updatedQuestions[topic] = topicQuestions.map(q => {
    const skillTag = getSkillTag(q);
    
    // Count for stats
    counts[skillTag] = (counts[skillTag] || 0) + 1;
    
    return {
      ...q,
      skill_tag: skillTag
    };
  });
}

// Write updated questions
fs.writeFileSync(questionsPath, JSON.stringify(updatedQuestions, null, 2));

console.log('Skill tags added to questions.json');
console.log('Counts per skill tag:');
console.log(JSON.stringify(counts, null, 2));
