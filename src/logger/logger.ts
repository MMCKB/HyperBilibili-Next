type LogLevel = 'log' | 'warn' | 'error';

class Logger {
    // 定义日志级别的样式
    private styles: { [key in LogLevel]: string } = {
        log: 'color: green;',
        warn: 'color: orange;',
        error: 'color: red;',
    };

    public log(...args: any[]) {
        this.print('log', args);
    }

    public warn(...args: any[]) {
        this.print('warn', args);
    }

    public error(...args: any[]) {
        this.print('error', args);
    }

    // 只输出到控制台（调试器可见），不落盘
    private print(level: LogLevel, args: any[]) {
        const timestamp = new Date().toISOString();
        const style = this.styles[level];

        // 将所有参数序列化为字符串
        const message = args.map((arg) => this.safeStringify(arg)).join(' ');

        // 在控制台输出日志
        console.log(`%c[${timestamp}] [${level.toUpperCase()}] ${message}`, style);
    }

    private safeStringify(obj: any): string {
        try {
            if (typeof obj === 'string') return obj;
            return JSON.stringify(obj, null, 2); // 美化输出
        } catch (err) {
            return '[Circular or Unsupported Object]';
        }
    }
}

const logger = new Logger();
export default logger;
