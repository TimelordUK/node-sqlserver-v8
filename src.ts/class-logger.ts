// src/class-logger.ts
import { Logger, LogLevel } from './logger'

export class ClassLogger {
  private readonly logger: Logger
  private readonly classContext: Record<string, any>

  constructor (className: string, additionalContext: Record<string, any> = {}) {
    this.logger = Logger.getInstance()
    this.classContext = {
      class: className,
      ...additionalContext
    }
  }

  public setAdditionalContext (context: Record<string, any>): void {
    Object.assign(this.classContext, context)
  }

  public trace (message: string, context?: Record<string, any>): void {
    const combinedContext = this.combineContexts(context)
    this.logger.trace(message, combinedContext)
  }

  public debug (message: string, context?: Record<string, any>): void {
    const combinedContext = this.combineContexts(context)
    this.logger.debug(message, combinedContext)
  }

  public info (message: string, context?: Record<string, any>): void {
    const combinedContext = this.combineContexts(context)
    this.logger.info(message, combinedContext)
  }

  public warn (message: string, context?: Record<string, any>): void {
    const combinedContext = this.combineContexts(context)
    this.logger.warn(message, combinedContext)
  }

  public error (message: string, context?: Record<string, any>): void {
    const combinedContext = this.combineContexts(context)
    this.logger.error(message, combinedContext)
  }

  private combineContexts (methodContext?: Record<string, any>): Record<string, any> {
    if (!methodContext) {
      return this.classContext
    }

    return {
      ...this.classContext,
      ...methodContext
    }
  }
}
