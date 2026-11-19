// tools/test-register.mjs — P3 (Task 2)
// Entry point for `node --import` in the test:unit script. Registers the
// resolution hooks from ./test-hooks.mjs so extensionless relative
// imports ('./score') resolve to their .ts source files under plain Node.
import { register } from 'node:module';

register('./test-hooks.mjs', import.meta.url);
