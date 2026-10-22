import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** The agent's answer text. Links open in a new tab. */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="md">
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
