// zod for the forms, set up for our Content Security Policy: by default zod tests whether it may
// compile code at run time (eval), which the policy refuses (a console error, no harm). jitless
// skips that test; the forms are small, so the speed-up it would give does not matter.
import { z } from 'zod';

z.config({ jitless: true });

export { z };
