import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find server root to place logs correctly
let currentDir = __dirname;
let serverRoot = currentDir;
while (currentDir !== '/') {
  if (fs.existsSync(path.join(currentDir, 'package.json'))) {
    serverRoot = currentDir;
    break;
  }
  currentDir = path.dirname(currentDir);
}

const logsDir = path.join(serverRoot, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export interface ILogger {
  info(message: string, context?: any): void;
  error(message: string, error?: any): void;
  warn(message: string, context?: any): void;
  debug(message: string, context?: any): void;
}

export class WinstonLogger implements ILogger {
  private logger: winston.Logger;
  private static sharedLogger: winston.Logger | null = null;

  constructor() {
    // Use a shared logger instance to ensure all logs go to the same file
    if (!WinstonLogger.sharedLogger) {
      WinstonLogger.sharedLogger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
              })
            ),
          }),
          new winston.transports.File({ 
            filename: path.join(logsDir, 'cuala.log'),
            level: 'debug', // Log everything to one file
            options: { flags: 'a' } // Append mode
          }),
        ],
      });
      
      WinstonLogger.sharedLogger.on('error', (err) => {
        console.error('Winston logger error:', err);
      });
    }
    
    this.logger = WinstonLogger.sharedLogger;
  }

  info(message: string, context?: any): void {
    this.logger.info(message, context);
  }

  error(message: string, error?: any): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        errorMessage: error.message,
        stack: error.stack,
      });
    } else {
      this.logger.error(message, { error });
    }
  }

  warn(message: string, context?: any): void {
    this.logger.warn(message, context);
  }

  debug(message: string, context?: any): void {
    this.logger.debug(message, context);
  }
}

export class LoggerStub implements ILogger {
  info(message: string, context?: any): void {}
  error(message: string, error?: any): void {}
  warn(message: string, context?: any): void {}
  debug(message: string, context?: any): void {}
}
