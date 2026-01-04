import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find server root by looking for package.json
let currentDir = __dirname;
let serverRoot = currentDir;
while (currentDir !== '/') {
  if (fs.existsSync(path.join(currentDir, 'package.json'))) {
    serverRoot = currentDir;
    break;
  }
  currentDir = path.dirname(currentDir);
}

const envPath = path.join(serverRoot, '.env');
console.log(`Loading config from: ${envPath}`);
const result = config({ path: envPath });

if (result.error) {
  console.error('Dotenv error:', result.error);
}

export interface IConfig {
  get(key: string): string | undefined;
}

export class EnvConfig implements IConfig {
  get(key: string): string | undefined {
    const val = process.env[key];
    if (!val) {
      console.warn(`Config warning: Key ${key} not found in environment`);
    }
    return val;
  }
}

export class ConfigStub implements IConfig {
  get(key: string): string | undefined {
    return process.env[key];
  }
}

