export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export interface LogContext {
    callId?: string;
    participantId?: string;
    action?: string;
    [key: string]: any;
}

export class Logger {
    private static instance: Logger;

    constructor(private level: LogLevel = LogLevel.INFO) {}

    static getInstance(level?: LogLevel): Logger {
        if (!this.instance) {
            this.instance = new Logger(level);
        }
        return this.instance;
    }

    debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    error(message: string, error?: Error, context?: LogContext): void {
        this.log(LogLevel.ERROR, message, {
            ...context,
            error: error?.message,
            stack: error?.stack
        });
    }

    private log(level: LogLevel, message: string, context?: any): void {
        if (level >= this.level) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: LogLevel[level],
                message,
                ...context
            };

            if (level >= LogLevel.ERROR) {
                console.error(logEntry);
            } else if (level >= LogLevel.WARN) {
                console.warn(logEntry);
            } else {
                console.log(logEntry);
            }
        }
    }
}