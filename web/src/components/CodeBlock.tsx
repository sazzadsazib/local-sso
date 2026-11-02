import React, { useState } from 'react';
import { highlightCode } from './highlight';
import { Icon } from './icons';
import { showToast } from './toast';

export interface CodeBlockProps {
  title?: string;
  code: string;
  lang?: string;
  className?: string;
  showWindowButtons?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  title,
  code,
  lang = 'typescript',
  className = '',
  showWindowButtons = true,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    showToast('Copied code to clipboard!', 'success');
    setTimeout(() => setCopied(false), 1600);
  };

  const highlightedHtml = highlightCode(code, lang);

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/90 overflow-hidden shadow-xl ${className}`}>
      {(title || showWindowButtons) && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            {showWindowButtons && (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </>
            )}
            {title && <span className="ml-2 font-mono text-xs font-semibold text-slate-300">{title}</span>}
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 uppercase">
              {lang}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700/60 transition shadow-sm cursor-pointer"
            aria-label="Copy code snippet"
          >
            <Icon name={copied ? 'check' : 'copy'} className={`w-3.5 h-3.5 ${copied ? 'text-emerald-400' : 'text-orange-400'}`} />
            <span className={copied ? 'text-emerald-400' : ''}>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed scrollbar-thin">
        <code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
};
