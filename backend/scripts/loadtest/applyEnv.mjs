// Imported FIRST by the load-test scripts, so the app's settings module sees the load-test
// database and queue names (modules are evaluated in import order).
import { loadEnv } from './env.mjs';

Object.assign(process.env, loadEnv);
