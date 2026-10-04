import type { RoadmapDoc } from '../lib/types'

// A small, generic example so a new author sees the shape of a roadmap.
export const SAMPLE: RoadmapDoc = {
  title: 'Programming Fundamentals for New Graduates',
  subtitle: 'From zero to writing small, correct programs. Click any node for details and free resources.',
  changelog: [{ date: new Date().toISOString().slice(0, 10), text: 'First version.' }],
  topics: [
    {
      id: 't1', label: 'How computers run programs', desc: 'Enough of the machine to make the rest make sense.', links: [],
      children: [
        { id: 'c1', label: 'Binary, memory, CPU', type: 'core', side: 'auto', desc: 'What a variable physically is.', links: [{ label: 'CS50 week 0', url: 'https://cs50.harvard.edu/x/' }], children: [] },
        { id: 'c2', label: 'The terminal', type: 'core', side: 'auto', desc: 'Navigating, running a program, reading an error.\n\n```\nls -la\ncd projects\n```', links: [], children: [] },
        { id: 'c3', label: 'How the web loads a page', type: 'optional', side: 'auto', desc: 'Useful context, not required yet.', links: [], children: [] },
      ],
    },
    {
      id: 't2', label: 'A first language', desc: 'Pick one and stay with it for three months.', links: [],
      children: [
        {
          id: 'c4', label: 'Python', type: 'core', side: 'auto', desc: 'The recommended path: readable, everywhere, forgiving.', links: [{ label: 'Official tutorial', url: 'https://docs.python.org/3/tutorial/' }],
          faq: [{ q: 'pip install says permission denied', a: 'Use a virtual environment:\n\n```\npython -m venv .venv\nsource .venv/bin/activate\n```' }],
          children: [
            { id: 'g1', label: 'Variables and types', type: 'core', desc: '', links: [], children: [] },
            { id: 'g2', label: 'Control flow', type: 'core', desc: 'if / for / while, and when each fits.', links: [], children: [] },
            { id: 'g3', label: 'Functions', type: 'core', desc: '', links: [], children: [] },
          ],
        },
        { id: 'c5', label: 'JavaScript', type: 'alt', side: 'auto', desc: 'Fine if you already care about the browser.', links: [], children: [] },
      ],
    },
    {
      id: 't3', label: 'Thinking in data structures', desc: 'Lists, maps, and why choosing the right one matters.', links: [],
      children: [
        { id: 'c6', label: 'Arrays and lists', type: 'core', side: 'auto', desc: '', links: [], children: [] },
        { id: 'c7', label: 'Hash maps', type: 'core', side: 'auto', desc: '', links: [], children: [] },
        { id: 'c8', label: 'Big-O intuition', type: 'optional', side: 'auto', desc: 'Just enough to notice a loop inside a loop.', links: [], children: [] },
      ],
    },
    {
      id: 't4', label: 'Build something', desc: 'A small project you finish beats a big one you abandon.', links: [],
      children: [
        { id: 'c9', label: 'Git and GitHub', type: 'core', side: 'auto', desc: 'commit, push, pull request.', links: [{ label: 'Git book', url: 'https://git-scm.com/book/en/v2' }], children: [] },
        { id: 'c10', label: 'A command-line to-do app', type: 'core', side: 'auto', desc: 'Read and write a file. Handle bad input.', links: [], children: [] },
      ],
    },
  ],
}
