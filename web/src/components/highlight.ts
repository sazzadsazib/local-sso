import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';

const langMap: Record<string, string> = {
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  curl: 'bash',
  json: 'json',
  env: 'bash',
};

export function highlightCode(code: string, lang = 'typescript'): string {
  const normalizedLang = langMap[lang.toLowerCase()] || 'typescript';
  const grammar = Prism.languages[normalizedLang] || Prism.languages.javascript;
  if (!grammar) {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  return Prism.highlight(code, grammar, normalizedLang);
}
