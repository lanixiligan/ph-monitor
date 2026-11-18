// The upload time on its own row under a headline or stream:
// "Uploaded 4 hours ago · Nov 18, 2026, 2:26 PM".
// Each half stays in one piece; a narrow panel breaks the row at the dot.

import { formatTime, uploadedAgo } from '../format.ts';

type Props = { iso: string; now: number };

export function UploadedTime({ iso, now }: Props) {
  return (
    <div className="uploaded">
      <span className="uploaded-ago">{uploadedAgo(iso, now)}</span>
      {' · '}
      {/* <time> tells browsers and screen readers the exact moment. */}
      <time className="uploaded-at" dateTime={iso}>
        {formatTime(iso)}
      </time>
    </div>
  );
}
