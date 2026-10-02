import { useEffect, useState } from 'react';
import { formatCount, PROOF_BASE, startTicking } from '../../lib/proof-counter';
import { UsersIcon } from './SignupIcons';

// React twin of ProofCounter.astro. Rendered only when variant === 'counter', so control HTML has
// no counter DOM. Simulated figure: see lib/proof-counter.ts.
export default function ProofCounter() {
  const [count, setCount] = useState(PROOF_BASE);
  useEffect(() => startTicking(() => setCount((c) => c + 1)), []);
  return (
    <p data-exp="funnel_proof_v1" data-variant="counter" className="proof-counter">
      <UsersIcon className="proof-counter__icon" />
      <span>
        {/* A new key remounts the digit, which replays the CSS roll-up animation. The first paint has
            no animation: it matches the server-rendered HTML. */}
        <span className="proof-counter__num">
          <span key={count} className={count === PROOF_BASE ? undefined : 'proof-counter__digit'}>
            {formatCount(count)}
          </span>
        </span>{' '}
        traders have created a free account
      </span>
    </p>
  );
}
