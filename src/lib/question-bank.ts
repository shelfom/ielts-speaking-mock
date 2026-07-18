import type { TestSet } from './types';

/**
 * Placeholder question bank — will be replaced with the full 128-test set
 * provided by the user. Each test set follows the real IELTS speaking format:
 * - Part 1: 3 short questions on familiar topics
 * - Part 2: 1 cue card with topic + 4 bullets + follow-ups
 * - Part 3: 3 abstract/discussion questions linked to Part 2 topic
 */
export const QUESTION_BANK: TestSet[] = [
  {
    id: 'test-001',
    name: 'Hometown & Accommodation',
    part1Questions: [
      'Let\'s talk about your hometown. Where is your hometown located?',
      'What do you like most about your hometown?',
      'Is there anything you would like to change about your hometown?',
    ],
    part2: {
      topic: 'Describe a place you visited that you found interesting',
      bullets: [
        'where this place is',
        'when you went there',
        'what you did there',
        'and explain why you found it interesting',
      ],
      followUps: [
        'Do you think it\'s important to visit historical places?',
        'How do tourists usually choose their travel destinations?',
      ],
    },
    part3Questions: [
      'How has tourism changed in your country over the past decade?',
      'Do you think international tourism will continue to grow in the future?',
      'What are the environmental impacts of mass tourism?',
    ],
  },
  {
    id: 'test-002',
    name: 'Work & Study',
    part1Questions: [
      'Do you work or are you a student?',
      'What do you enjoy most about your work/studies?',
      'How do you usually manage your time between work/study and personal life?',
    ],
    part2: {
      topic: 'Describe a skill you would like to learn in the future',
      bullets: [
        'what the skill is',
        'why you want to learn it',
        'how you would go about learning it',
        'and explain how this skill would benefit you',
      ],
      followUps: [
        'Do you think schools should teach more practical skills?',
        'How has technology changed the way people learn new skills?',
      ],
    },
    part3Questions: [
      'What skills do you think will be most important in the future job market?',
      'Is it better to be a generalist or a specialist in today\'s world?',
      'How can adults continue to develop new skills throughout their careers?',
    ],
  },
  {
    id: 'test-003',
    name: 'Technology & Daily Life',
    part1Questions: [
      'How often do you use technology in your daily life?',
      'What is your favourite piece of technology that you own?',
      'Are there any technologies you find difficult to use?',
    ],
    part2: {
      topic: 'Describe a piece of technology that has changed the way you live',
      bullets: [
        'what the technology is',
        'when you first started using it',
        'how it has changed your daily routine',
        'and explain whether you think this change is positive or negative',
      ],
      followUps: [
        'Do you think older generations struggle more with new technology?',
        'How might technology change education in the next 20 years?',
      ],
    },
    part3Questions: [
      'What are the main advantages and disadvantages of relying heavily on technology?',
      'Should governments regulate the use of artificial intelligence?',
      'How can we ensure that technology benefits everyone in society?',
    ],
  },
];

export function getRandomTestSet(): TestSet {
  const index = Math.floor(Math.random() * QUESTION_BANK.length);
  return QUESTION_BANK[index];
}

export function getTestSetById(id: string): TestSet | undefined {
  return QUESTION_BANK.find((t) => t.id === id);
}
