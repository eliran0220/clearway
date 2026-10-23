import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** The agent's answer text. Links open in a new tab. */
export function AnswerText({ text }: { text: string }) {
  return (
    // dir="auto": an answer in Hebrew or Arabic lays out right to left.
    <div className="md" dir="auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
