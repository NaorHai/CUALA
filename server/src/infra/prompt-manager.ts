import fs from 'fs';
import path from 'path';
import Mustache from 'mustache';

export class PromptManager {
  private static instance: PromptManager;
  private promptDir: string;

  private constructor() {
    this.promptDir = path.join(process.cwd(), 'src', 'prompts');
  }

  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  public render(templateName: string, data: any): string {
    const filePath = path.join(this.promptDir, `${templateName}.mustache`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt template not found: ${filePath}`);
    }
    const template = fs.readFileSync(filePath, 'utf-8');
    return Mustache.render(template, data);
  }
}

